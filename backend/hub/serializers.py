from django.contrib.auth import get_user_model
from rest_framework import serializers

from hub.models import Game, Session

User = get_user_model()


class LeaderboardSerializer(serializers.ModelSerializer):
    score = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ("username", "score")
        read_only_fields = ("username", "score")


class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ("id", "name", "ratio")
        read_only_fields = ("id", "name", "ratio")


class SessionSerializer(serializers.ModelSerializer):
    seed = serializers.CharField(read_only=True)
    actions = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = Session
        fields = ("id", "seed", "game", "user", "score", "created_at", "actions")
        read_only_fields = ("id", "seed", "game", "user", "score", "created_at")
