from django.urls import path

from . import views

app_name = "wordle"

urlpatterns = [
    path("play/", views.PlayView.as_view(), name="play"),
    path("start", views.StartView.as_view(), name="start"),
    path("guess", views.GuessView.as_view(), name="guess"),
    path("finish", views.FinishView.as_view(), name="finish"),
    path("state", views.StateView.as_view(), name="state"),
]
