# Wordle React test frontend

This is a small Vite + React client for the stateless Wordle API. The hub should launch it with its session UUID and seed in the query string:

```text
http://localhost:5173/?session_id=<hub-session-uuid>&seed=<hub-seed>
```

The client calls `POST /wordle/initialize` and `POST /wordle/guess`. It stores the submitted guesses in the current browser tab so a refresh can rebuild the game state from the same seed.

## Run with the backend in Docker Compose

From the repository root, make sure `docker/.env` exists and has the settings required by the base Compose file. Start only the backend and database (no Caddy or Celery is needed for this Wordle prototype):

```sh
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up --build db web
```

In another terminal, from `frontend/`:

```sh
npm install
npm run dev
```

Open the URL above with the `session_id` and `seed` supplied by the hub. Vite proxies `/wordle/*` to the backend at `http://127.0.0.1:8000`.
