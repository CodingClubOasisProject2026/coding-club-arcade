from django.contrib.auth import get_user_model
from django.db.models import Sum
from rest_framework.generics import ListAPIView

from .serializers import LeaderboardSerializer

User = get_user_model()


class LeaderboardView(ListAPIView):
    serializer_class = LeaderboardSerializer
    queryset = User.objects.annotate(score=Sum("sessions__score")).order_by("-score", "username")
