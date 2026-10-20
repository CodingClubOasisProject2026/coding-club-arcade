from django.urls import path
from . import views

urlpatterns = []
for suffix in ("", "/"):
    urlpatterns += [
        path(f"start{suffix}", views.start_game),
        path(f"session/<uuid:session_id>{suffix}", views.get_game),
        path(f"session/<uuid:session_id>/move{suffix}", views.move_snake),
        path(f"session/<uuid:session_id>/end{suffix}", views.end_game),
    ]