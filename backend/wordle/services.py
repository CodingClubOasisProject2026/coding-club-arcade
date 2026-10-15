import logging
from dataclasses import dataclass
from typing import Optional

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from . import words
from .engine import (
    IN_PROGRESS,
    LOST,
    MAX_ATTEMPTS,
    InvalidActions,
    apply_guess,
)
from .models import WordleEvent, WordleSession

logger = logging.getLogger(__name__)

# Bump when scoring/rules change, so old sessions can be re-verified against
# the rules they were played under.
RULES_VERSION = 1


# --------------------------------------------------------------------------
# Errors (the view layer maps these to HTTP statuses)
# --------------------------------------------------------------------------

class WordleError(Exception):
    code = "wordle_error"


class SessionNotFound(WordleError):
    code = "session_not_found"


class SessionNotActive(WordleError):
    code = "session_not_active"


class InvalidGuess(WordleError):
    code = "invalid_guess"


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class GuessOutcome:
    session: WordleSession
    mask: list
    solved: bool                  # this guess solved the current word
    answer: Optional[str] = None  # revealed only when the game was just lost


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _enqueue_scoring(session_id) -> None:
    """Queue the Celery replay. Never raises: a broker outage must not fail a
    guess that has already been committed. Failures are logged with a full
    traceback, and the sweeper re-enqueues finished-but-unscored sessions.

    This is the single place to repoint at the shared arcade task later.
    """
    try:
        from .tasks import score_session

        score_session.delay(str(session_id))
    except Exception:
        logger.exception(
            "Failed to enqueue scoring for wordle session %s; "
            "it stays 'finished' until the sweeper retries it",
            session_id,
        )


def _lock_session(user, session_id) -> WordleSession:
    """Fetch the user's session with a row lock. Must run inside atomic()."""
    try:
        return WordleSession.objects.select_for_update().get(pk=session_id, user=user)
    except (WordleSession.DoesNotExist, ValidationError, ValueError):
        # Covers unknown ids, malformed UUIDs, and other users' sessions alike.
        raise SessionNotFound(f"no wordle session {session_id!r} for this user")


def _close(session: WordleSession) -> list:
    """Mark a session finished (in memory). Returns the extra update_fields."""
    session.status = WordleSession.Status.FINISHED
    session.finished_at = timezone.now()
    return ["status", "finished_at"]


def current_board(session: WordleSession) -> list:
    """Guesses made on the current word, oldest first.

    `attempts` resets to 0 on every solve, so the last `attempts` events are
    exactly the current word's guesses.
    """
    if session.attempts == 0:
        return []
    recent = list(session.events.order_by("-seq")[: session.attempts])
    recent.reverse()
    return [{"word": e.word, "mask": e.mask} for e in recent]


def snapshot(session: WordleSession) -> dict:
    """Client-safe view of a session. Never includes `words`."""
    return {
        "session_id": str(session.id),
        "status": session.status,
        "game_status": session.game_status,
        "word_number": session.word_idx + 1,
        "total_words": len(session.words),
        "words_solved": session.words_solved,
        "attempts": session.attempts,
        "attempts_left": max(MAX_ATTEMPTS - session.attempts, 0),
        "score": session.score,
        "board": current_board(session),
    }


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def get_active_session(user) -> Optional[WordleSession]:
    return WordleSession.objects.filter(
        user=user, status=WordleSession.Status.ACTIVE
    ).first()


def start_session(user) -> tuple[WordleSession, bool]:
    """Start a game, or resume the user's active one.

    Returns (session, created). Safe under concurrent calls: the partial
    unique index allows only one active session per user, and the loser of a
    race simply returns the winner's session.
    """
    existing = get_active_session(user)
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic():
            session = WordleSession.objects.create(
                user=user,
                words=words.pick_sequence(),
                list_version=words.list_version(),
                rules_version=RULES_VERSION,
            )
    except IntegrityError:
        existing = get_active_session(user)
        if existing is None:
            raise  # an unrelated integrity error: surface it, don't hide it
        return existing, False

    return session, True


def submit_guess(user, session_id, guess) -> GuessOutcome:
    """Apply one guess. Raises SessionNotFound / SessionNotActive / InvalidGuess."""
    normalized = str(guess).strip().lower()

    with transaction.atomic():
        session = _lock_session(user, session_id)
        if session.status != WordleSession.Status.ACTIVE:
            raise SessionNotActive(
                f"session {session.id} is {session.status}; no more guesses allowed"
            )

        old_state = session.get_state()
        try:
            new_state, mask = apply_guess(
                old_state, normalized, session.words, words.get_allowed()
            )
        except InvalidActions as exc:
            # Raised before anything is written, so no attempt is consumed.
            raise InvalidGuess(str(exc)) from exc

        seq = session.events.count() + 1  # gapless: we hold the row lock
        WordleEvent.objects.create(
            session=session, seq=seq, word=normalized, mask=mask
        )

        session.set_state(new_state)
        update_fields = list(WordleSession.STATE_FIELDS)

        game_over = new_state.status != IN_PROGRESS
        if game_over:
            update_fields += _close(session)
        session.save(update_fields=update_fields)

        if game_over:
            transaction.on_commit(lambda sid=session.id: _enqueue_scoring(sid))

    return GuessOutcome(
        session=session,
        mask=mask,
        solved=new_state.words_solved > old_state.words_solved,
        answer=session.words[old_state.word_idx] if new_state.status == LOST else None,
    )


def finish_session(user, session_id) -> WordleSession:
    """End a game early (abandon). Idempotent: finishing a finished game is a no-op."""
    with transaction.atomic():
        session = _lock_session(user, session_id)
        if session.status != WordleSession.Status.ACTIVE:
            return session

        session.save(update_fields=_close(session))
        transaction.on_commit(lambda sid=session.id: _enqueue_scoring(sid))
        return session
