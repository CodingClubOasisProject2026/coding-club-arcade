# Coding Club Arcade

A Django-based gaming platform with leaderboards for Minesweeper, Snake, Tetris, Wordle, Pac-Man, and Flappy Bird. Users can play games, track scores through game sessions, and compete on leaderboards. The backend uses Celery with dedicated queues for each game, PostgreSQL for data, and RabbitMQ for task processing.

## Running the Project

Ensure Docker is installed. Copy `docker/.env.example` to `docker/.env` and configure environment variables. Then run:

```bash
cd docker
docker-compose up -d
```
