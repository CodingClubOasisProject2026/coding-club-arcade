# Game state moved to the cache (see minesweeper/state.py).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('minesweeper', '0001_initial'),
    ]

    operations = [
        migrations.DeleteModel(
            name='Game',
        ),
    ]
