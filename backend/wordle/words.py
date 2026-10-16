import hashlib
import random
from functools import lru_cache
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from .engine import WORD_LENGTH

DATA_DIR = Path(__file__).resolve().parent / "data"
ANSWERS_FILE = DATA_DIR / "answers.txt"
ALLOWED_FILE = DATA_DIR / "allowed.txt"

SEQUENCE_LENGTH = 50

_MAX_ERRORS_SHOWN = 10


def _load_file(path: Path) -> tuple[str, ...]:
    if not path.exists():
        raise ImproperlyConfigured(f"Wordle word list not found: {path}")

    words: set[str] = set()
    errors: list[str] = []

    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        word = line.strip().lower()
        if not word:
            continue
        if len(word) != WORD_LENGTH or not word.isascii() or not word.isalpha():
            errors.append(f"line {lineno}: {line!r}")
            continue
        words.add(word)

    if errors:
        shown = "; ".join(errors[:_MAX_ERRORS_SHOWN])
        extra = len(errors) - _MAX_ERRORS_SHOWN
        suffix = f" (and {extra} more)" if extra > 0 else ""
        raise ImproperlyConfigured(
            f"{path.name} has {len(errors)} invalid entries "
            f"(expected {WORD_LENGTH} ascii letters): {shown}{suffix}"
        )
    if not words:
        raise ImproperlyConfigured(f"{path.name} contains no words")

    return tuple(sorted(words))


@lru_cache(maxsize=1)
def get_answers() -> tuple[str, ...]:
    answers = _load_file(ANSWERS_FILE)
    if len(answers) < SEQUENCE_LENGTH:
        raise ImproperlyConfigured(
            f"{ANSWERS_FILE.name} has {len(answers)} words but a game needs "
            f"at least {SEQUENCE_LENGTH}"
        )
    return answers


@lru_cache(maxsize=1)
def get_allowed() -> frozenset[str]:
    """All valid guesses: allowed.txt plus every answer."""
    return frozenset(_load_file(ALLOWED_FILE)) | frozenset(get_answers())


@lru_cache(maxsize=1)
def list_version() -> str:
    h = hashlib.sha256()
    h.update("\n".join(get_answers()).encode("utf-8"))
    h.update(b"\x00")
    h.update("\n".join(sorted(get_allowed())).encode("utf-8"))
    return h.hexdigest()[:12]


def pick_sequence(seed: int, length: int = SEQUENCE_LENGTH) -> list[str]:
    """Return a repeatable answer sequence for a hub-provided game seed."""
    answers = get_answers()
    if length > len(answers):
        raise ValueError(
            f"cannot pick {length} distinct words from {len(answers)} answers"
        )
    return random.Random(seed).sample(answers, length)


def clear_caches() -> None:
    get_answers.cache_clear()
    get_allowed.cache_clear()
    list_version.cache_clear()
