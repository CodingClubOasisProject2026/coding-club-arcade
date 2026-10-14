from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class LeaderboardSerializer(serializers.ModelSerializer):
    score = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ("username", "score")
        read_only_fields = ("username", "score")
