"""Request validation only. Responses are built by services.snapshot(),
which never includes the secret word list."""
from rest_framework import serializers


class GuessRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    guess = serializers.CharField(max_length=16)


class FinishRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
