from rest_framework import serializers

from .game import DIFFICULTIES

class MoveSerializer(serializers.Serializer):
    row = serializers.IntegerField()
    column = serializers.IntegerField()
    type = serializers.ChoiceField(choices=["reveal", "flag", "chord", "sonar"])
    no = serializers.IntegerField(min_value=0)


class StartSerializer(serializers.Serializer):
    difficulty = serializers.ChoiceField(choices=list(DIFFICULTIES))
