from django.test import SimpleTestCase

from wordle.engine import (
    ABSENT,
    CLEARED,
    CORRECT,
    IN_PROGRESS,
    LOST,
    PRESENT,
    GameState,
    InvalidActions,
    apply_guess,
    replay,
    score_guess,
    word_score,
)


class ScoreGuessTests(SimpleTestCase):
    def test_all_correct(self):
        self.assertEqual(score_guess("crane", "crane"), [CORRECT] * 5)

    def test_all_absent(self):
        self.assertEqual(score_guess("fuzzy", "crane"), [ABSENT] * 5)

    def test_anagram_all_present_except_last(self):
        self.assertEqual(
            score_guess("crane", "nacre"),
            [PRESENT, PRESENT, PRESENT, PRESENT, CORRECT],
        )

    def test_duplicate_letter_only_one_present(self):
        # answer has one 'e': the first 'e' is present, the second is absent.
        # 'd' is in the answer, so it is present.
        self.assertEqual(
            score_guess("speed", "abide"),
            [ABSENT, ABSENT, PRESENT, ABSENT, PRESENT],
        )

    def test_exact_match_consumes_letter_first(self):
        # answer 'there' has two e's (idx 2 and 4). Guess 'eerie':
        # idx4 exact; idx0 e present (uses the idx2 'e'); idx1 e absent (none left);
        # idx2 r present; idx3 i absent.
        self.assertEqual(
            score_guess("eerie", "there"),
            [PRESENT, ABSENT, PRESENT, ABSENT, CORRECT],
        )


class ApplyGuessTests(SimpleTestCase):
    ANSWERS = ["crane", "money"]

    def test_wrong_guess_increments_attempts(self):
        state, mask = apply_guess(GameState(), "slate", self.ANSWERS)
        self.assertEqual((state.word_idx, state.attempts), (0, 1))
        self.assertEqual(state.status, IN_PROGRESS)

    def test_correct_guess_advances_and_resets_attempts(self):
        state, _ = apply_guess(GameState(), "slate", self.ANSWERS)
        state, mask = apply_guess(state, "crane", self.ANSWERS)
        self.assertEqual(mask, [CORRECT] * 5)
        self.assertEqual(
            (state.word_idx, state.attempts, state.words_solved, state.score),
            (1, 0, 1, word_score(2)),
        )
        self.assertEqual(state.status, IN_PROGRESS)

    def test_state_is_not_mutated(self):
        s0 = GameState()
        apply_guess(s0, "slate", self.ANSWERS)
        self.assertEqual(s0, GameState())


class ReplayTests(SimpleTestCase):
    def test_clear_all_words_first_try(self):
        r = replay(["crane", "slate", "money"], ["crane", "slate", "money"])
        self.assertEqual(r.state.status, CLEARED)
        self.assertEqual(r.state.words_solved, 3)
        self.assertEqual(r.state.score, 3 * word_score(1))

    def test_mixed_attempts_score(self):
        r = replay(["crane", "money"], ["slate", "crane", "money"])
        self.assertEqual(r.state.status, CLEARED)
        self.assertEqual(r.state.score, word_score(2) + word_score(1))

    def test_loss_on_second_word(self):
        r = replay(["crane", "slate"], ["crane"] + ["money"] * 6)
        self.assertEqual(r.state.status, LOST)
        self.assertEqual(r.state.words_solved, 1)
        self.assertEqual(r.state.score, word_score(1))

    def test_in_progress(self):
        r = replay(["crane", "money"], ["slate"])
        self.assertEqual((r.state.status, r.state.attempts), (IN_PROGRESS, 1))

    def test_guess_after_loss_rejected(self):
        with self.assertRaisesMessage(InvalidActions, "guess #7: game already ended"):
            replay(["crane"], ["money"] * 7)

    def test_guess_after_clear_rejected(self):
        with self.assertRaisesMessage(InvalidActions, "game already ended"):
            replay(["crane"], ["crane", "slate"])

    def test_not_in_allowed_list(self):
        with self.assertRaisesMessage(InvalidActions, "not in the allowed"):
            replay(["crane"], ["zzzzz"], allowed={"crane", "slate"})

    def test_wrong_length_rejected(self):
        with self.assertRaisesMessage(InvalidActions, "5-letter word"):
            replay(["crane"], ["cat"])
