from django.urls import path

from . import views

urlpatterns = [
    path("<uuid:game_id>/", views.game_state, name="minesweeper-state"),
    path("<uuid:game_id>/start/", views.start_game, name="minesweeper-start"),
    path("<uuid:game_id>/move/", views.play_move, name="minesweeper-move"),
]
