from django.urls import path

from . import views

urlpatterns = [
    path("sessions/<uuid:session_id>/", views.RunStatusView.as_view(), name="pacman-run-status"),
]
