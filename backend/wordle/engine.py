from collections import Counter
from collections.abc import Iterable, Sequence, Set
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


def word_score(attempts: int) -> int:
    return 100 + 20 * (MAX_ATTEMPTS - attempts)


def apply_guess(
    state: GameState,
    guess: str,
    answers: Sequence[str],
    allowed: Set[str] | None = None,
) -> tuple[GameState, list[int]]:
    if state.status != IN_PROGRESS:
        raise InvalidActions(f"game already ended ({state.status})")
    if state.word_idx >= len(answers):
        raise InvalidActions(
            f"word_idx {state.word_idx} is out of range for {len(answers)} answers"
        )

    g = str(guess).lower()
    if len(g) != WORD_LENGTH or not g.isalpha():
        raise InvalidActions(f"{guess!r} is not a {WORD_LENGTH}-letter word")
    if allowed is not None and g not in allowed:
        raise InvalidActions(f"{g!r} is not in the allowed word list")

    answer = answers[state.word_idx].lower()
    mask = score_guess(g, answer)
    attempts = state.attempts + 1

    if g == answer:
        next_idx = state.word_idx + 1
        new = GameState(
            word_idx=next_idx,
            attempts=0,
            words_solved=state.words_solved + 1,
            score=state.score + word_score(attempts),
            status=CLEARED if next_idx >= len(answers) else IN_PROGRESS,
        )
    elif attempts >= MAX_ATTEMPTS:
        new = replace(state, attempts=attempts, status=LOST)
    else:
        new = replace(state, attempts=attempts)

    return new, mask


def replay(
    answers: Sequence[str],
    guesses: Iterable[str],
    allowed: Set[str] | None = None,
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
