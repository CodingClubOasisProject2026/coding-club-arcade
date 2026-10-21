from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("hub", "0006_session_wordle_state")]

    operations = [
        migrations.AddField(
            model_name="session",
            name="tetris_action_log",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
