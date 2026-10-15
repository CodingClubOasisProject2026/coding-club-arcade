from django.test import SimpleTestCase

from wordle import words
from wordle.engine import WORD_LENGTH


class WordListTests(SimpleTestCase):
    def test_answers_are_valid_and_sorted(self):
        answers = words.get_answers()
        self.assertGreaterEqual(len(answers), words.SEQUENCE_LENGTH)
        self.assertEqual(list(answers), sorted(set(answers)))
        for w in answers:
            self.assertEqual(len(w), WORD_LENGTH)
            self.assertTrue(w.isalpha() and w.islower())

    def test_every_answer_is_an_allowed_guess(self):
        self.assertTrue(set(words.get_answers()) <= words.get_allowed())

    def test_list_version_is_stable(self):
        self.assertEqual(words.list_version(), words.list_version())
        self.assertEqual(len(words.list_version()), 12)


class PickSequenceTests(SimpleTestCase):
    def test_default_length_distinct_and_valid(self):
        seq = words.pick_sequence()
        self.assertEqual(len(seq), words.SEQUENCE_LENGTH)
        self.assertEqual(len(set(seq)), len(seq))
        self.assertTrue(set(seq) <= set(words.get_answers()))

    def test_two_draws_differ(self):
        # 50 distinct words from thousands: a collision of order is astronomically unlikely
        self.assertNotEqual(words.pick_sequence(), words.pick_sequence())

    def test_too_long_raises(self):
        with self.assertRaisesMessage(ValueError, "cannot pick"):
            words.pick_sequence(len(words.get_answers()) + 1)
