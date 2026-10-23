from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hub.models import GameChoices, Session

from .game import DIFFICULTIES, MAX_MOVES, count, neighbors, reveal, score, set_mines
from .models import Game
from .serializers import MoveSerializer, StartSerializer


def _finish(game, result):
    game.status = result
    game.finishedAt = timezone.now()
    game.score = score(game)
    Session.objects.filter(id=game.pk).update(score=game.score, updated_at=game.finishedAt)


def _state(game):
    # Full board as the player sees it, so a client can rebuild after a refresh.
    mines = set(game.mines or [])
    data = {
        "id": game.pk,
        "width": game.width,
        "height": game.height,
        "mine_count": game.mine_count,
        "status": game.status,
        "move_count": game.move_count,
        "cells": [[i, count(mines, i, game.width, game.height)] for i in game.revealed or []],
        "flagged": game.flagged or [],
        "mines_left": game.mine_count - len(game.flagged or []),
        "startedAt": game.startedAt if game.mines is not None else None,
        "finishedAt": game.finishedAt,
    }
    if game.status != Game.Status.IN_PROGRESS:
        data["mines"] = game.mines
        data["exploded"] = game.exploded or []
        data["score"] = game.score
    return data


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_game(request, game_id):
    serializer = StartSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    width, height, mine_count = DIFFICULTIES[serializer.validated_data["difficulty"]]

    session = get_object_or_404(
        Session, id=game_id, user=request.user, game__name=GameChoices.MINESWEEPER
    )
    game, created = Game.objects.get_or_create(
        session=session,
        defaults={"width": width, "height": height, "mine_count": mine_count},
    )
    if not created:
        return Response({"detail": "Game already started."}, status=status.HTTP_409_CONFLICT)

    return Response(_state(game), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def game_state(request, game_id):
    game = get_object_or_404(Game, pk=game_id, session__user=request.user)
    return Response(_state(game))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def play_move(request, game_id):
    serializer = MoveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    move = serializer.validated_data

    with transaction.atomic():
        game = get_object_or_404(
            Game.objects.select_related("session").select_for_update(of=("self",)),
            pk=game_id,
            session__user=request.user,
        )

        if game.status != Game.Status.IN_PROGRESS:
            return Response({"detail": "Game is already over."}, status=status.HTTP_409_CONFLICT)
        if move["no"] != game.move_count:
            return Response(
                {"detail": "Out of order move.", "move_count": game.move_count},
                status=status.HTTP_409_CONFLICT,
            )

        w, h = game.width, game.height
        row, column = move["row"], move["column"]
        if not (0 <= row < h and 0 <= column < w):
            return Response({"detail": "Cell out of bounds."}, status=status.HTTP_400_BAD_REQUEST)

        idx = row * w + column
        game.revealed = game.revealed or []
        game.flagged = game.flagged or []
        revealed, flagged = set(game.revealed), set(game.flagged)
        cells = []

        if move["type"] == "flag":
            if idx in revealed:
                return Response({"detail": "Cell is already revealed."}, status=status.HTTP_400_BAD_REQUEST)
            if idx not in flagged and len(flagged) >= game.mine_count:
                return Response({"detail": "No flags left."}, status=status.HTTP_400_BAD_REQUEST)
            flagged ^= {idx}
            game.flagged = sorted(flagged)

        else:
            if game.mines is None:
                # First reveal places the mines so the opening click is always safe.
                game.mines = set_mines(game, idx)
                # The clock starts on the first reveal, not when the board is created.
                game.startedAt = timezone.now()
            mines = set(game.mines)

            if move["type"] == "reveal":
                if idx in revealed or idx in flagged:
                    return Response({"detail": "Cell cannot be revealed."}, status=status.HTTP_400_BAD_REQUEST)
                targets = [idx]
            else:  # chord
                if idx not in revealed:
                    return Response({"detail": "Can only chord a revealed cell."}, status=status.HTTP_400_BAD_REQUEST)
                around = list(neighbors(idx, w, h))
                if sum(1 for n in around if n in flagged) != count(mines, idx, w, h):
                    return Response({"detail": "Flag count does not match."}, status=status.HTTP_400_BAD_REQUEST)
                targets = [n for n in around if n not in revealed and n not in flagged]

            hit = [t for t in targets if t in mines]
            if hit:
                game.exploded = hit
                _finish(game, Game.Status.LOST)
            else:
                for t in targets:
                    cells.extend(reveal(game, t, mines))
                if len(game.revealed) == w * h - game.mine_count:
                    _finish(game, Game.Status.WON)

        game.move_count += 1
        if game.status == Game.Status.IN_PROGRESS and game.move_count >= MAX_MOVES:
            # Hitting the move cap ends the game as a loss.
            _finish(game, Game.Status.LOST)
        game.save()

    data = {
        "status": game.status,
        "move_count": game.move_count,
        "cells": cells,
        "flagged": game.flagged,
        "mines_left": game.mine_count - len(game.flagged),
    }
    if game.status != Game.Status.IN_PROGRESS:
        data["mines"] = game.mines
        data["exploded"] = game.exploded or []
        data["score"] = game.score
    return Response(data)
