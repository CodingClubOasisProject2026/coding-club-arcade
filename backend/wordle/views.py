"""Stateless Wordle endpoints backed only by the deterministic engine."""
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.views.generic import TemplateView
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import words
from .engine import IN_PROGRESS, LOST, InvalidActions, apply_guess, replay


class PlayView(TemplateView):
    template_name = "wordle/index.html"


def style_css(request):
    css = render_to_string("wordle/style.css")
    return HttpResponse(css, content_type="text/css")


class GameRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    seed = serializers.IntegerField(min_value=0, max_value=2**63 - 1)
    guesses = serializers.ListField(
        child=serializers.CharField(max_length=16),
        required=False,
        default=list,
        max_length=300,
    )


class GuessRequestSerializer(GameRequestSerializer):
    guess = serializers.CharField(max_length=16)


def _snapshot(
    session_id, answers, guesses, result, last_mask=None, solved=False, answer=None
):
    board = []
    for word, mask in zip(guesses, result.masks):
        board.append({"word": word.strip().lower(), "mask": mask})
        if mask == [2] * 5:
            board.clear()
    state = result.state
    if answer is None and state.status == LOST:
        answer = answers[state.word_idx]
    return {
        "session_id": str(session_id),
        "status": "active" if state.status == IN_PROGRESS else "finished",
        "game_status": state.status,
        "word_number": min(state.word_idx + 1, len(answers)),
        "total_words": len(answers),
        "words_solved": state.words_solved,
        "attempts": state.attempts,
        "attempts_left": max(6 - state.attempts, 0),
        "score": state.score,
        "board": board,
        "mask": last_mask,
        "solved": solved,
        "answer": answer,
    }


def _validated_history(raw_guesses, answers):
    guesses = [guess.strip().lower() for guess in raw_guesses]
    try:
        result = replay(answers, guesses, words.get_allowed())
    except InvalidActions as exc:
        raise serializers.ValidationError({"guesses": str(exc)}) from exc
    return guesses, result


class StatelessGameAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = []

    def _validate(self, serializer_class, request):
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        answers = words.pick_sequence(data["seed"])
        guesses, result = _validated_history(data.get("guesses", []), answers)
        return data, answers, guesses, result


class InitializeView(StatelessGameAPIView):
    """Initialize or restore a game from the hub session id and seed."""

    def post(self, request):
        data, answers, guesses, result = self._validate(GameRequestSerializer, request)
        return Response(_snapshot(data["session_id"], answers, guesses, result))


class GuessView(StatelessGameAPIView):
    def post(self, request):
        data, answers, guesses, result = self._validate(GuessRequestSerializer, request)
        guess = data["guess"].strip().lower()
        try:
            new_state, mask = apply_guess(
                result.state, guess, answers, words.get_allowed()
            )
        except InvalidActions as exc:
            return Response(
                {"error": {"code": "invalid_guess", "message": str(exc)}},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        guesses.append(guess)
        updated = replay(answers, guesses, words.get_allowed())
        lost_answer = answers[result.state.word_idx] if new_state.status == LOST else None
        return Response(
            _snapshot(
                data["session_id"],
                answers,
                guesses,
                updated,
                last_mask=mask,
                solved=new_state.words_solved > result.state.words_solved,
                answer=lost_answer,
            )
        )
