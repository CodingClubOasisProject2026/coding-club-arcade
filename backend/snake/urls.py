from django.urls import path

from . import views

urlpatterns = [
    path("start/", views.start_game, name="start_game"),
    path("session/<uuid:session_id>/", views.get_game, name="get_game"),
    path(
        "session/<uuid:session_id>/move/",
        views.move_snake,
        name="move_snake",
    ),
    path(
        "session/<uuid:session_id>/end/",
        views.end_game,
        name="end_game",
    ),
]