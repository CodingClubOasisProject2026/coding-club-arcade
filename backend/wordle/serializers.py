"""Request validation only. Responses are built by services.snapshot(),
which never includes the secret word list."""
from rest_framework import serializers


class GuessRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    # Generous cap just to bound payload size; the engine enforces
    # "5 ascii letters" and the allowed-list check with specific messages.
    guess = serializers.CharField(max_length=16)


class FinishRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
