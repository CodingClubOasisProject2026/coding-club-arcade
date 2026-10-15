from django.urls import path

from .views import GameListView, LeaderboardView, SessionStartView, SessionSubmitView

urlpatterns = [
    path('leaderboard/', LeaderboardView.as_view(), name='leaderboard'),
    path('games/', GameListView.as_view(), name='games'),
    path('sessions/start/<int:game_id>/', SessionStartView.as_view(), name='session-start'),
    path('sessions/submit/<uuid:session_id>/', SessionSubmitView.as_view(), name='session-submit'),
]
