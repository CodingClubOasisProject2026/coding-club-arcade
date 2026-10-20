from django.urls import path
from . import views

app_name = "tetris"

urlpatterns = [
    path("api/game/", views.game_api, name="game-api"),
]
