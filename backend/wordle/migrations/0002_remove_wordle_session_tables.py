from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("wordle", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(name="WordleEvent"),
        migrations.DeleteModel(name="WordleSession"),
    ]
