from django.contrib import admin

from .models import PacmanRun


@admin.register(PacmanRun)
class PacmanRunAdmin(admin.ModelAdmin):
    list_display = ("session", "status", "score", "reason", "created_at")
    list_filter = ("status",)
    readonly_fields = ("session", "input_log", "status", "reason", "score", "created_at")
