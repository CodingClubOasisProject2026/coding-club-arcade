from django.urls import path

from . import views

app_name = "wordle"

urlpatterns = [
    path("play/", views.PlayView.as_view(), name="play"),
    path("play/style.css", views.style_css, name="play_style"),
    path("initialize", views.InitializeView.as_view(), name="initialize"),
    path("guess/<int:word_number>", views.GuessView.as_view(), name="guess"),
    path("finish", views.FinishView.as_view(), name="finish"),
]
