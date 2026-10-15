import logging
from dataclasses import fields
from datetime import timedelta
from typing import Optional

from celery import shared_task
from django.conf import settings
from django.db import OperationalError, transaction
from django.db.models import DateTimeField, Max
from django.db.models.functions import Coalesce
from django.utils import timezone

from .engine import GameState, InvalidActions, replay
from .models import WordleSession
from .services import RULES_VERSION, _close, _enqueue_scoring

logger = logging.getLogger(__name__)

IDLE_TIMEOUT = timedelta(minutes=getattr(settings, "WORDLE_IDLE_TIMEOUT_MINUTES", 30))
UNSCORED_GRACE = timedelta(minutes=2)
SWEEP_BATCH = 500
_MAX_SEQ_LIST = 20


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------

def _find_mismatches(session: WordleSession, events: list, result) -> list:
    problems = []

    expected_seq = list(range(1, len(events) + 1))
    actual_seq = [e.seq for e in events]
    if actual_seq != expected_seq:
        problems.append(
            f"event seq not gapless: got {actual_seq[:_MAX_SEQ_LIST]}"
            f"{'...' if len(actual_seq) > _MAX_SEQ_LIST else ''}"
        )

    live = session.get_state()
    for f in fields(GameState):
        live_value = getattr(live, f.name)
        replay_value = getattr(result.state, f.name)
        if live_value != replay_value:
            problems.append(f"{f.name}: live={live_value!r} replay={replay_value!r}")

    for event, mask in zip(events, result.masks):
        if list(event.mask) != list(mask):
            problems.append(
                f"event seq {event.seq} ({event.word}): "
                f"stored mask {event.mask} != replayed mask {mask}"
            )

    return problems


def _verify(session: WordleSession) -> tuple[Optional[bool], str]:
    """Returns (matched, error). matched is None when verification isn't possible."""
    if session.rules_version != RULES_VERSION:
        return None, (
            f"not verified: session played under rules_version "
            f"{session.rules_version}, engine is at {RULES_VERSION}"
        )

    events = list(session.events.order_by("seq"))
    try:
        result = replay(session.words, [e.word for e in events])
    except InvalidActions as exc:
        return False, f"replay rejected the event log: {exc}"

    problems = _find_mismatches(session, events, result)
    if problems:
        return False, "; ".join(problems)
    return True, ""


@shared_task(
    name="wordle.score_session",
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    max_retries=3,
)
def score_session(session_id: str) -> dict:
    with transaction.atomic():
        session = WordleSession.objects.select_for_update().filter(pk=session_id).first()
        if session is None:
            logger.error("score_session: no wordle session %s", session_id)
            return {"session_id": str(session_id), "outcome": "missing"}

        if session.status == WordleSession.Status.SCORED:
            return {
                "session_id": str(session.id),
                "outcome": "already_scored",
                "matched": session.replay_matched,
            }
        if session.status == WordleSession.Status.ACTIVE:
            logger.warning("score_session: session %s is still active; skipping", session.id)
            return {"session_id": str(session.id), "outcome": "not_finished"}

        matched, error = _verify(session)
        if matched is False:
            logger.error(
                "Wordle replay MISMATCH session=%s user=%s: %s",
                session.id, session.user_id, error,
            )
        elif matched is None:
            logger.warning("Wordle session %s: %s", session.id, error)

        session.replay_matched = matched
        session.replay_error = error
        session.status = WordleSession.Status.SCORED
        session.scored_at = timezone.now()
        session.save(
            update_fields=["replay_matched", "replay_error", "status", "scored_at"]
        )

        # Leaderboard publishing will go here, guarded by `matched is True`,
        # once the shared arcade app exists.

        return {
            "session_id": str(session.id),
            "outcome": "scored",
            "matched": matched,
            "score": session.score,
        }


# --------------------------------------------------------------------------
# Sweeper
# --------------------------------------------------------------------------

def _abandon_if_idle(session_id, idle_cutoff) -> bool:
    """Close an active session that is still idle once we hold its lock."""
    with transaction.atomic():
        session = (
            WordleSession.objects.select_for_update().filter(pk=session_id).first()
        )
        if session is None or session.status != WordleSession.Status.ACTIVE:
            return False

        last_event = session.events.aggregate(m=Max("created_at"))["m"]
        if (last_event or session.started_at) >= idle_cutoff:
            return False  # a guess landed after we selected it

        session.save(update_fields=_close(session))
        transaction.on_commit(lambda sid=session.id: _enqueue_scoring(sid))
        return True


@shared_task(name="wordle.sweep_stale_sessions")
def sweep_stale_sessions() -> dict:
    now = timezone.now()
    idle_cutoff = now - IDLE_TIMEOUT
    grace_cutoff = now - UNSCORED_GRACE
    failures = []

    # 1. Abandon idle active sessions.
    idle_ids = list(
        WordleSession.objects.filter(status=WordleSession.Status.ACTIVE)
        .annotate(
            last_activity=Coalesce(
                Max("events__created_at"), "started_at", output_field=DateTimeField()
            )
        )
        .filter(last_activity__lt=idle_cutoff)
        .values_list("id", flat=True)[:SWEEP_BATCH]
    )
    abandoned = 0
    for sid in idle_ids:
        try:
            abandoned += _abandon_if_idle(sid, idle_cutoff)
        except Exception:
            logger.exception("sweeper: failed to abandon session %s", sid)
            failures.append(str(sid))

    # 2. Re-enqueue finished sessions that never got scored.
    unscored_ids = list(
        WordleSession.objects.filter(
            status=WordleSession.Status.FINISHED, finished_at__lt=grace_cutoff
        ).values_list("id", flat=True)[:SWEEP_BATCH]
    )
    requeued = 0
    for sid in unscored_ids:
        try:
            score_session.delay(str(sid))
            requeued += 1
        except Exception:
            logger.exception("sweeper: failed to enqueue scoring for session %s", sid)
            failures.append(str(sid))

    summary = {"abandoned": abandoned, "requeued": requeued}
    if failures:
        raise RuntimeError(
            f"sweeper failed for {len(failures)} session(s) "
            f"(first 10: {failures[:10]}); partial result: {summary}"
        )
    return summary
