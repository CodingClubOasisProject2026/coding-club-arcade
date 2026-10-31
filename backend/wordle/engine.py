from collections import Counter
from collections.abc import Iterable, Sequence, Set as AbstractSet
from dataclasses import dataclass, field, replace


WORD_LENGTH = 5
MAX_ATTEMPTS = 6

ABSENT, PRESENT, CORRECT = 0, 1, 2

IN_PROGRESS, LOST, CLEARED = "in_progress", "lost", "cleared"


class InvalidActions(ValueError):
    """Raised when a guess sequence cannot be a legal game."""


@dataclass(frozen=True)
class GameState:
    word_idx: int = 0
    attempts: int = 0
    words_solved: int = 0
    score: int = 0
    pending_green_points: int = 0
    boosted_green_letters: frozenset[str] = frozenset()
    status: str = IN_PROGRESS


@dataclass(frozen=True)
class Result:
    state: GameState
    masks: list = field(default_factory=list)  # one mask per guess, in order


def score_guess(guess: str, answer: str) -> list[int]:
    if len(guess) != len(answer):
        raise InvalidActions(
            f"guess length {len(guess)} != answer length {len(answer)}"
        )

    mask = [ABSENT] * len(answer)
    unmatched = Counter()

    # Pass 1: exact matches; count answer letters not yet consumed.
    for i, (g, a) in enumerate(zip(guess, answer)):
        if g == a:
            mask[i] = CORRECT
        else:
            unmatched[a] += 1

    # Pass 2: right letter, wrong spot, limited by remaining counts.
    for i, g in enumerate(guess):
        if mask[i] == CORRECT:
            continue
        if unmatched[g] > 0:
            mask[i] = PRESENT
            unmatched[g] -= 1

    return mask


POINTS_PER_GREEN = 5
POINTS_FOR_SOLVING = 30
POINTS_FOR_CLEARING = 500
PENALTY_FOR_MISSED_WORD = 20


def apply_guess(
    state: GameState,
    guess: str,
    answers: Sequence[str],
    allowed: AbstractSet[str] | None = None,
) -> tuple[GameState, list[int]]:
    if state.status != IN_PROGRESS:
        raise InvalidActions(f"game already ended ({state.status})")
    if not answers:
        raise InvalidActions("the game needs at least one answer word")

    g = str(guess).lower()
    if len(g) != WORD_LENGTH or not g.isalpha():
        raise InvalidActions(f"{guess!r} is not a {WORD_LENGTH}-letter word")
    if allowed is not None and g not in allowed:
        raise InvalidActions(f"{g!r} is not in the allowed word list")

    if state.word_idx >= len(answers):
        raise InvalidActions("all answer words have been completed")

    answer = answers[state.word_idx].lower()
    mask = score_guess(g, answer)
    attempts = state.attempts + 1
    green_points = mask.count(CORRECT) * POINTS_PER_GREEN
    pending_green_points = state.pending_green_points + green_points
    boosted_green_letters = state.boosted_green_letters | frozenset(
        g[index] for index, mark in enumerate(mask) if mark == CORRECT
    )

    if g == answer:
        next_word_idx = state.word_idx + 1
        cleared = next_word_idx == len(answers)
        new = GameState(
            word_idx=next_word_idx,
            attempts=0,
            words_solved=state.words_solved + 1,
            score=(
                state.score + pending_green_points + POINTS_FOR_SOLVING
                + (POINTS_FOR_CLEARING if cleared else 0)
            ),
            pending_green_points=0,
            boosted_green_letters=boosted_green_letters,
            status=CLEARED if cleared else IN_PROGRESS,
        )
    elif attempts >= MAX_ATTEMPTS:
        next_word_idx = state.word_idx + 1
        new = replace(
            state,
            word_idx=next_word_idx,
            attempts=0,
            score=max(0, state.score - PENALTY_FOR_MISSED_WORD),
            pending_green_points=0,
            boosted_green_letters=boosted_green_letters,
            status=LOST if next_word_idx == len(answers) else IN_PROGRESS,
        )
    else:
        new = replace(
            state,
            attempts=attempts,
            pending_green_points=pending_green_points,
            boosted_green_letters=boosted_green_letters,
        )

    return new, mask


def replay(
    answers: Sequence[str],
    guesses: Iterable[str],
    allowed: AbstractSet[str] | None = None,
) -> Result:
    state = GameState()
    masks: list[list[int]] = []

    for n, guess in enumerate(guesses, start=1):
        try:
            state, mask = apply_guess(state, guess, answers, allowed)
        except InvalidActions as exc:
            raise InvalidActions(f"guess #{n}: {exc}") from exc
        masks.append(mask)

    return Result(state=state, masks=masks)
