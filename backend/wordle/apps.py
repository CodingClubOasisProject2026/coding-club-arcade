from django.apps import AppConfig


class WordleConfig(AppConfig):
    name = 'wordle'

    def ready(self):
        from .words import get_allowed

        get_allowed()
