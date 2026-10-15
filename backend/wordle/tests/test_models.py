from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from wordle.engine import GameState
from wordle.models import WordleEvent, WordleSession


def make_user(name="u1"):
    # Adjust if your custom user model needs other required fields.
    return get_user_model().objects.create_user(username=name, password="pw")


def make_session(user, **kw):
    return WordleSession.objects.create(
        user=user, words=["crane", "money"], list_version="abc123abc123", **kw
    )


class SessionTests(TestCase):
    def test_state_round_trip(self):
        s = make_session(make_user())
        state = GameState(word_idx=3, attempts=2, words_solved=3, score=480, status="in_progress")
        s.set_state(state)
        s.save(update_fields=WordleSession.STATE_FIELDS)
        s.refresh_from_db()
        self.assertEqual(s.get_state(), state)

    def test_one_active_session_per_user(self):
        user = make_user()
        make_session(user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_session(user)

    def test_finished_session_does_not_block_a_new_one(self):
        user = make_user()
        old = make_session(user)
        old.status = WordleSession.Status.FINISHED
        old.save(update_fields=["status"])
        make_session(user)  # must not raise

    def test_different_users_can_each_have_an_active_session(self):
        make_session(make_user("a"))
        make_session(make_user("b"))

    def test_str_does_not_leak_words(self):
        s = make_session(make_user())
        self.assertNotIn("crane", str(s))


class EventTests(TestCase):
    def test_seq_is_unique_per_session(self):
        s = make_session(make_user())
        WordleEvent.objects.create(session=s, seq=1, word="slate", mask=[0] * 5)
        with self.assertRaises(IntegrityError), transaction.atomic():
            WordleEvent.objects.create(session=s, seq=1, word="money", mask=[0] * 5)

    def test_events_ordered_by_seq(self):
        s = make_session(make_user())
        WordleEvent.objects.create(session=s, seq=2, word="money", mask=[0] * 5)
        WordleEvent.objects.create(session=s, seq=1, word="slate", mask=[0] * 5)
        self.assertEqual([e.seq for e in s.events.all()], [1, 2])
