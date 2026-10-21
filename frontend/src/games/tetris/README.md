# Coding Club Arcade frontend

Dependency free browser Tetris frontend connected to the Django session API.

## Run

Run the frontend dev server from this directory:

```sh
npm run dev
```

Open the URL printed in the terminal (by default `http://localhost:5174`). This server serves the frontend and forwards API and Django admin requests to `http://127.0.0.1:8000`, so session cookies work without CORS configuration. A static server such as `python -m http.server` cannot handle `/games/`; it treats that route as a filename and returns 404.

Start the Django backend separately on port 8000 using the project's Docker setup. Sign in to Django admin and make sure the account has a game ticket before starting a session. If the UI still shows a connection error, check that the backend is running and reachable at `http://127.0.0.1:8000`.

Apply backend migrations before use:

```sh
cd backend
python manage.py migrate
```

For local Tetris play without Google OAuth, set `ALLOW_TETRIS_GUEST_SESSIONS=true` in `docker/.env` and keep `DEBUG=true`. This creates ticket-free guest sessions for Tetris only. Turn the flag off when OAuth is configured; the backend ignores this bypass whenever `DEBUG` is false.

## Session and verification flow

- `GET /games/` resolves the Tetris game ID.
- `POST /sessions/start/<game_id>/` creates an authenticated, ticket-backed session and returns its ID and seed. The seed is serialized as a decimal string to preserve all 63 bits in JavaScript.
- The browser derives the same xorshift32, shuffled seven-piece bag from that seed as the backend.
- `PUT /sessions/submit/<session_id>/` sends `actions: { action_log, duration_ms }`. The ordered log records player inputs and explicit `gravity` ticks with monotonic elapsed milliseconds.
- A valid terminal replay returns `verified: true` and `authoritative_score`. The UI uses that score for the verified result.

The backend persists the submitted log with the session. Identical retries return the same verified result; a different second submission for that session is rejected.
