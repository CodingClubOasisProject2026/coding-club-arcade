from django.db import migrations, models


class Migration(migrations.Migration):
    """Merge the Pac-Man and Flappy Bird game-choice branches."""

    dependencies = [
        ('hub', '0007_alter_game_name'),
        ('hub', '0008_alter_game_name'),
    ]

    operations = [
        migrations.AlterField(
            model_name='game',
            name='name',
            field=models.CharField(choices=[('MINESWEEPER', 'Minesweeper'), ('PACMAN', 'Pacman'), ('SNAKE', 'Snake'), ('TETRIS', 'Tetris'), ('WORDLE', 'Wordle'), ('FLAPPY_BIRD', 'Flappy Bird')], max_length=30, unique=True),
        ),
    ]
