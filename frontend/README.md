# Coding Club Arcade frontend

This is the React frontend for the Coding Club Arcade hub. The home page lists available games; Wordle is currently available at `/play/wordle/` and expects a real hub session UUID and its seed in the query string:

```text
http://localhost:5173/play/wordle/?session_id=<hub-session-uuid>&seed=<hub-seed>
```

The client calls `POST /wordle/initialize` and `POST /wordle/guess`. Guess history and the 2-minute server deadline are stored on the hub session, so refreshing restores authoritative game state and time. Arbitrary or fabricated session IDs are rejected.

## Create a real test session

After the backend is available at port 8000 and the hub has been seeded with a `WORDLE` game, set credentials for an existing hub account and run:

```sh
export WORDLE_USERNAME='your-username'
export WORDLE_PASSWORD='your-password'
npm run create:session
```

The helper authenticates to the hub, creates a session, and prints a launch URL containing its real session ID and seed. It does not put credentials in source files. Optional overrides: `WORDLE_API_URL` and `WORDLE_FRONTEND_URL`.

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

Open the URL above with the `session_id` and `seed` supplied by the hub. Vite proxies `/games/*`, `/sessions/*`, and `/wordle/*` to the backend at `http://127.0.0.1:8000`. The hub home page is `/`; Wordle is `/play/wordle/`.
