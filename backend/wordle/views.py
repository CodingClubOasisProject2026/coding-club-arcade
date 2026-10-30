"""Wordle API backed by shared cache state and the deterministic engine."""
import math
import uuid
from contextlib import contextmanager

from django.core.cache import cache
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.utils import timezone
from django.views.generic import TemplateView
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.celery import app
from hub.models import GameChoices, Session as HubSession

from . import words
from .engine import CLEARED, IN_PROGRESS, LOST, POINTS_FOR_CLEARING, InvalidActions, apply_guess, replay

START_SECONDS = 120
MAX_SECONDS = 120
CACHE_TTL = 15 * 60
SECONDS_PER_GREEN = 1
SOLVE_BONUS_SECONDS = 8
MISSED_WORD_PENALTY_SECONDS = 20


class PlayView(TemplateView):
    template_name = "wordle/index.html"


def style_css(request):
    return HttpResponse(render_to_string("wordle/style.css"), content_type="text/css")


class GameRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    seed = serializers.IntegerField(min_value=0, max_value=2**63 - 1)
    page_token = serializers.UUIDField()


class GuessRequestSerializer(GameRequestSerializer):
    guess = serializers.CharField(max_length=16)


def _cache_key(session_id):
    return f"wordle:session:{session_id}"


@contextmanager
def _state_lock(session_id):
    key = f"{_cache_key(session_id)}:lock"
    acquired = cache.add(key, uuid.uuid4().hex, timeout=10)
    try:
        yield acquired
    finally:
        if acquired:
            cache.delete(key)


def _snapshot(session_id, answers, guesses, result, time_remaining, last_mask=None,
              solved=False, missed=False, answer=None, timed_out=False, actions=None,
              green_points_awarded=0):
    board = []
    attempts_on_word = 0
    for word, mask in zip(guesses, result.masks):
        board.append({"word": word, "mask": mask})
        attempts_on_word += 1
        if mask == [2] * 5 or attempts_on_word >= 6:
            board.clear()
            attempts_on_word = 0
    state = result.state
    if answer is None and (state.status == LOST or timed_out):
        answer = answers[min(state.word_idx, len(answers) - 1)]
    game_status = state.status if state.status in (LOST, CLEARED) else ("time_up" if timed_out else state.status)
    completion_bonus = POINTS_FOR_CLEARING if state.status == CLEARED else 0
    return {
        "session_id": str(session_id), "status": "finished" if timed_out or state.status != IN_PROGRESS else "active",
        "game_status": game_status, "word_number": state.word_idx + 1,
        "total_words": len(answers), "words_solved": state.words_solved,
        "attempts": state.attempts, "attempts_left": max(6 - state.attempts, 0),
        "score": state.score, "pending_points": state.pending_green_points,
        "green_points_awarded": green_points_awarded,
        "completion_bonus_awarded": completion_bonus,
        "time_remaining": time_remaining, "board": board,
        "mask": last_mask, "solved": solved, "missed": missed, "answer": answer,
        "actions": list(actions or guesses),
    }


def _replay_history(guesses, answers):
    try:
        return replay(answers, guesses, words.get_allowed())
    except InvalidActions as exc:
        raise serializers.ValidationError({"history": str(exc)}) from exc


def _remaining_seconds(state, now):
    deadline = state.get("deadline")
    if not isinstance(deadline, (int, float)):
        return None
    return max(0, min(MAX_SECONDS, math.ceil(deadline - now)))


def _not_found():
    return Response({"error": {"code": "session_not_found", "message": "Wordle hub session not found."}}, status=404)


class WordleAPIView(APIView):
    permission_classes = (IsAuthenticated,)

    def _owned_state(self, request, data):
        state = cache.get(_cache_key(data["session_id"]))
        if not state or state.get("owner_id") != request.user.pk or state.get("seed") != data["seed"]:
            return None, None
        return state, state.get("answers")


class InitializeView(WordleAPIView):
    """Start an attempt; a different page token means the page was refreshed."""

    def post(self, request):
        serializer = GameRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        session = HubSession.objects.filter(pk=data["session_id"], seed=data["seed"], user_id=request.user.pk,
                                            game__name=GameChoices.WORDLE).first()
        if session is None:
            return _not_found()
        key = _cache_key(session.id)
        with _state_lock(session.id) as acquired:
            if not acquired:
                return Response({"detail": "Game state is busy; retry shortly."}, status=409)
            state = cache.get(key)
            if state is None:
                now = timezone.now().timestamp()
                state = {"owner_id": request.user.pk, "seed": data["seed"],
                         "answers": words.pick_sequence(data["seed"], str(session.id)),
                         "guesses": [], "deadline": now + START_SECONDS,
                         "page_token": str(data["page_token"]), "timed_out": False}
            elif state.get("page_token") != str(data["page_token"]):
                state["abandoned"] = True
                state["timed_out"] = True
                cache.set(key, state, CACHE_TTL)
                app.send_task(
                    "wordle.tasks.calculate_score",
                    args=(state["owner_id"], str(session.id), {"guesses": state["guesses"]}),
                )
                return Response({"error": {"code": "attempt_abandoned", "message": "Refreshing ends this attempt."}}, status=409)
            elif state.get("abandoned"):
                return Response({"error": {"code": "attempt_abandoned", "message": "Refreshing ends this attempt."}}, status=409)
            cache.set(key, state, CACHE_TTL)
            answers, guesses = state["answers"], state["guesses"]
            result = _replay_history(guesses, answers)
            now = timezone.now().timestamp()
            remaining = _remaining_seconds(state, now) or 0
            timed_out = bool(state.get("timed_out")) or remaining <= 0
            if timed_out:
                state["timed_out"] = True
                cache.set(key, state, CACHE_TTL)
            return Response(_snapshot(session.id, answers, guesses, result, remaining, timed_out=timed_out, actions=guesses))


class GuessView(WordleAPIView):
    def post(self, request, word_number):
        serializer = GuessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        key = _cache_key(data["session_id"])
        with _state_lock(data["session_id"]) as acquired:
            if not acquired:
                return Response({"detail": "Game state is busy; retry shortly."}, status=409)
            state, answers = self._owned_state(request, data)
            if state is None or answers is None or state.get("page_token") != str(data["page_token"]) or state.get("abandoned"):
                return _not_found()
            guesses = list(state["guesses"])
            current = _replay_history(guesses, answers)
            if word_number != current.state.word_idx + 1:
                return Response({"error": {"code": "wrong_word_number", "message": "This is not the active word."}}, status=409)
            now = timezone.now().timestamp()
            remaining = _remaining_seconds(state, now)
            if remaining is None:
                return Response({"error": {"code": "not_initialized", "message": "Initialize the game first."}}, status=409)
            timed_out = bool(state.get("timed_out")) or remaining <= 0
            if timed_out:
                state["timed_out"] = True
                cache.set(key, state, CACHE_TTL)
                return Response(_snapshot(data["session_id"], answers, guesses, current, 0, timed_out=True, actions=guesses))
            guess = data["guess"].strip().lower()
            try:
                new_state, mask = apply_guess(current.state, guess, answers, words.get_allowed())
            except InvalidActions as exc:
                return Response({"error": {"code": "invalid_guess", "message": str(exc)}}, status=422)
            guesses.append(guess)
            updated = replay(answers, guesses, words.get_allowed())
            solved = new_state.words_solved > current.state.words_solved
            missed = not solved and new_state.word_idx > current.state.word_idx
            remaining = min(MAX_SECONDS, max(0, remaining + mask.count(2) * SECONDS_PER_GREEN + (SOLVE_BONUS_SECONDS if solved else 0) - (MISSED_WORD_PENALTY_SECONDS if missed else 0)))
            state.update(guesses=guesses, deadline=now + remaining, timed_out=remaining <= 0)
            cache.set(key, state, CACHE_TTL)
            answer = answers[current.state.word_idx % len(answers)] if missed else None
            green_points_awarded = (
                current.state.pending_green_points + mask.count(2) * 5 if solved else 0
            )
            return Response(_snapshot(data["session_id"], answers, guesses, updated, remaining,
                                      last_mask=mask, solved=solved, missed=missed, answer=answer,
                                      timed_out=remaining <= 0, actions=guesses,
                                      green_points_awarded=green_points_awarded))


class FinishView(WordleAPIView):
    def post(self, request):
        serializer = GameRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with _state_lock(data["session_id"]) as acquired:
            if not acquired:
                return Response({"detail": "Game state is busy; retry shortly."}, status=409)
            state, answers = self._owned_state(request, data)
            if state is None or answers is None or state.get("page_token") != str(data["page_token"]):
                return _not_found()
            state["timed_out"] = True
            cache.set(_cache_key(data["session_id"]), state, CACHE_TTL)
            guesses = state["guesses"]
            result = _replay_history(guesses, answers)
            return Response(_snapshot(data["session_id"], answers, guesses, result, 0, timed_out=True, actions=guesses))
