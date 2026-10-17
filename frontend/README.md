# Coding Club Arcade — frontend

React + TypeScript + Vite.

## Running with Docker

`docker compose up -d --build` (from `docker/`) builds this app into the Caddy image (`docker/Dockerfile.caddy`) and serves it on http://localhost alongside the API. Rebuild after frontend changes.

## Running the dev server

1. Start the backend stack (`cd docker && docker compose up -d`). It serves the API on http://localhost.
2. Then:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies the backend routes (`/sessions/`, `/minesweeper/`, `/leaderboard/`, `/games/`, `/admin/`, `/static/`) to the Docker stack. Point it elsewhere with `BACKEND_URL=http://host npm run dev`.

## Logging in

The backend has no login endpoint yet. "Log in" stores a username and password in `localStorage` and sends them as HTTP basic auth, which is only used to start a hub session. Create a user with `docker compose exec web python manage.py createsuperuser`.

## Structure

- `src/api.ts`: fetch wrapper, credentials, hub sessions, leaderboard
- `src/pages/Hub.tsx`: game list and leaderboard
- `src/games/minesweeper/`: the Minesweeper section (`api.ts` for its endpoints, `Minesweeper.tsx` for the UI)

New games go in `src/games/<name>/` with a route in `src/App.tsx`.

## Config

- `VITE_MINESWEEPER_GAME_ID`: the hub game ID to fall back on if `/games/` can't be read. It defaults to `1`, and is needed while `/games/` returns 500.
