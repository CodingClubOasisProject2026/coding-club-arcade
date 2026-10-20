"""Wordle views backed by the engine and authoritative hub session state."""
import math

from django.db import transaction
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.generic import TemplateView
from hub.models import GameChoices, Session as HubSession
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import words
from .engine import IN_PROGRESS, LOST, InvalidActions, apply_guess, replay

START_SECONDS = 120
MAX_SECONDS = 120
SECONDS_PER_GREEN = 5
SOLVE_BONUS_SECONDS = 15
MISSED_WORD_PENALTY_SECONDS = 20


class PlayView(TemplateView):
    template_name = "wordle/index.html"


def style_css(request):
    css = render_to_string("wordle/style.css")
    return HttpResponse(css, content_type="text/css")


class GameRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    seed = serializers.IntegerField(min_value=0, max_value=2**63 - 1)


class GuessRequestSerializer(GameRequestSerializer):
    guess = serializers.CharField(max_length=16)


def _snapshot(
    session_id,
    answers,
    guesses,
    result,
    time_remaining,
    last_mask=None,
    solved=False,
    missed=False,
    answer=None,
    timed_out=False,
):
    board = []
    attempts_on_word = 0
    for word, mask in zip(guesses, result.masks):
        board.append({"word": word.strip().lower(), "mask": mask})
        attempts_on_word += 1
        if mask == [2] * 5 or attempts_on_word >= 6:
            board.clear()
            attempts_on_word = 0

    state = result.state
    if answer is None and (state.status == LOST or timed_out):
        answer = answers[state.word_idx % len(answers)]
    game_status = "time_up" if timed_out else state.status
    return {
        "session_id": str(session_id),
        "status": "finished" if timed_out or state.status != IN_PROGRESS else "active",
        "game_status": game_status,
        "word_number": state.word_idx + 1,
        "total_words": len(answers),
        "words_solved": state.words_solved,
        "attempts": state.attempts,
        "attempts_left": max(6 - state.attempts, 0),
        "score": state.score,
        "time_remaining": time_remaining,
        "board": board,
        "mask": last_mask,
        "solved": solved,
        "missed": missed,
        "answer": answer,
    }


def _replay_history(guesses, answers):
    try:
        return replay(answers, guesses, words.get_allowed())
    except InvalidActions as exc:
        raise serializers.ValidationError({"history": str(exc)}) from exc


def _find_hub_session(session_id, seed):
    return HubSession.objects.select_for_update().select_related("game").filter(
        pk=session_id,
        seed=seed,
        game__name=GameChoices.WORDLE,
    ).first()


def _not_found():
    return Response(
        {"error": {"code": "session_not_found", "message": "Wordle hub session not found."}},
        status=status.HTTP_404_NOT_FOUND,
    )


def _remaining_seconds(state, now):
    deadline = state.get("deadline")
    if not isinstance(deadline, (int, float)):
        return None
    return max(0, min(MAX_SECONDS, math.ceil(deadline - now)))


def _persist_state(session, state):
    session.wordle_state = state
    session.save(update_fields=["wordle_state", "updated_at"])


class WordleAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = []


class InitializeView(WordleAPIView):
    """Initialize once or restore game state and authoritative remaining time."""

    def post(self, request):
        serializer = GameRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            session = _find_hub_session(data["session_id"], data["seed"])
            if session is None:
                return _not_found()

            state = dict(session.wordle_state or {})
            now = timezone.now().timestamp()
            if not isinstance(state.get("deadline"), (int, float)):
                state["deadline"] = now + START_SECONDS
                state.setdefault("guesses", [])
                state["timed_out"] = False
                _persist_state(session, state)

            remaining = _remaining_seconds(state, now) or 0
            timed_out = bool(state.get("timed_out")) or remaining <= 0
            if timed_out and not state.get("timed_out"):
                state["timed_out"] = True
                _persist_state(session, state)

            guesses = state.get("guesses", [])
            answers = words.pick_sequence(data["seed"], str(session.id))
            result = _replay_history(guesses, answers)
            return Response(
                _snapshot(
                    session.id,
                    answers,
                    guesses,
                    result,
                    remaining,
                    timed_out=timed_out,
                )
            )


class GuessView(WordleAPIView):
    def post(self, request):
        serializer = GuessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            session = _find_hub_session(data["session_id"], data["seed"])
            if session is None:
                return _not_found()

            state = dict(session.wordle_state or {})
            now = timezone.now().timestamp()
            remaining = _remaining_seconds(state, now)
            if remaining is None:
                return Response(
                    {"error": {"code": "not_initialized", "message": "Initialize the game first."}},
                    status=status.HTTP_409_CONFLICT,
                )

            guesses = list(state.get("guesses", []))
            answers = words.pick_sequence(data["seed"], str(session.id))
            current = _replay_history(guesses, answers)
            timed_out = bool(state.get("timed_out")) or remaining <= 0
            if timed_out:
                state["timed_out"] = True
                _persist_state(session, state)
                return Response(
                    _snapshot(
                        session.id,
                        answers,
                        guesses,
                        current,
                        0,
                        timed_out=True,
                    )
                )

            guess = data["guess"].strip().lower()
            try:
                new_state, mask = apply_guess(
                    current.state, guess, answers, words.get_allowed()
                )
            except InvalidActions as exc:
                return Response(
                    {"error": {"code": "invalid_guess", "message": str(exc)}},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            guesses.append(guess)
            updated = replay(answers, guesses, words.get_allowed())
            solved = new_state.words_solved > current.state.words_solved
            missed = not solved and new_state.word_idx > current.state.word_idx
            green_seconds = mask.count(2) * SECONDS_PER_GREEN
            solve_bonus = SOLVE_BONUS_SECONDS if solved else 0
            miss_penalty = MISSED_WORD_PENALTY_SECONDS if missed else 0
            remaining = min(
                MAX_SECONDS,
                max(0, remaining + green_seconds + solve_bonus - miss_penalty),
            )
            state["guesses"] = guesses
            state["deadline"] = now + remaining
            timed_out = remaining <= 0
            state["timed_out"] = timed_out
            _persist_state(session, state)

            answer = answers[current.state.word_idx % len(answers)] if missed else None
            return Response(
                _snapshot(
                    session.id,
                    answers,
                    guesses,
                    updated,
                    remaining,
                    last_mask=mask,
                    solved=solved,
                    missed=missed,
                    answer=answer,
                    timed_out=timed_out,
                )
            )

class FinishView(WordleAPIView):
    """End the game now and return the final state, including the answer."""

    def post(self, request):
        serializer = GameRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            session = _find_hub_session(data["session_id"], data["seed"])
            if session is None:
                return _not_found()

            state = dict(session.wordle_state or {})
            if not isinstance(state.get("deadline"), (int, float)):
                return Response(
                    {"error": {"code": "not_initialized", "message": "Initialize the game first."}},
                    status=status.HTTP_409_CONFLICT,
                )

            state["timed_out"] = True
            _persist_state(session, state)

            guesses = state.get("guesses", [])
            answers = words.pick_sequence(data["seed"], str(session.id))
            result = _replay_history(guesses, answers)
            return Response(_snapshot(session.id, answers, guesses, result, 0, timed_out=True))