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

Session submission is scoped to the signed-in user.

## Session and task flow

- `GET /games/` resolves the Tetris game ID.
- `POST /sessions/start/<game_id>/` creates an authenticated, ticket-backed session and returns its ID and seed. The seed is serialized as a decimal string to preserve all 63 bits in JavaScript.
- The browser and backend use the same seeded shuffle: seven regular pieces per bag, with a bomb added to a bag after a randomly chosen two to four regular bags. A bomb is a one-cell falling piece and follows the same gravity, move, and drop controls.
- When a bomb lands, it clears the 3×3 area centered on its cell (clipped to the board edges), then each column falls to fill gaps. It does not lock or award points directly. Any complete lines created by the blast clear and score as usual.
- At game over, the browser sends `{ actions: "TTLRCTH..." }` to `PUT /sessions/submit/<session_id>/`. Each character is one input: `T` gravity tick, `L`/`R` move, `C` rotate clockwise, `c` rotate counterclockwise, `S` soft drop, `H` hard drop. No timing is sent.
- The hub queues the Tetris `calculate_score` Celery task and returns the updated session. The task replays the actions and saves the score to the session with `Session.update_score`. The UI's score is a local preview; this endpoint does not return a completed task result.

The local preview follows `tetris.scoring.ScoringSystem`: 100, 200, 300, or 400 points for clearing 1–4 lines, multiplied by the consecutive-clear count. A lock without a line clear resets that count. Drops and level do not add score.

Each session is scored once. The first valid submission sets the score; later submissions for that session are ignored.
