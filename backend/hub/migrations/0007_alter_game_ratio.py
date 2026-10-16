from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hub", "0006_session_wordle_state"),
    ]

    operations = [
        migrations.AlterField(
            model_name="game",
            name="ratio",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("1.0"),
                max_digits=5,
            ),
        ),
    ]
