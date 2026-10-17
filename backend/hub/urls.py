from django.urls import path

from .views import GameListView, LeaderboardView, MeView, SessionStartView, SessionSubmitView

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('leaderboard/', LeaderboardView.as_view(), name='leaderboard'),
    path('games/', GameListView.as_view(), name='games'),
    path('sessions/start/<int:game_id>/', SessionStartView.as_view(), name='session-start'),
    path('sessions/submit/<uuid:session_id>/', SessionSubmitView.as_view(), name='session-submit'),
]
