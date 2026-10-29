from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('hub', '0010_remove_session_tetris_action_log'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='session',
            name='wordle_state',
        ),
    ]
