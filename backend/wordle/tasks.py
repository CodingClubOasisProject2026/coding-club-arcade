from celery import shared_task


@shared_task
def calculate_score(session_id, actions: list[str]) -> None:
    pass
