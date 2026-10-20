from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hub", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="wordle_state",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
