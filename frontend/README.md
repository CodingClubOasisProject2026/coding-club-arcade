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

Open http://localhost:5173. The dev server proxies the backend routes (`/accounts/`, `/me/`, `/sessions/`, `/minesweeper/`, `/leaderboard/`, `/games/`, `/admin/`, `/static/`, `/wordle/`) to the Docker stack. Point it elsewhere with `BACKEND_URL=http://host npm run dev`.

## Signing in

Sign-in is Google OAuth through django-allauth (`/accounts/google/login/`). It needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `docker/.env`, and the Google OAuth client must list the callback URL for every address you open the site on, e.g. `http://localhost/accounts/google/login/callback/` (Docker) and `http://localhost:5173/accounts/google/login/callback/` (dev server).

The API then uses Django's session cookie. `GET /me/` reports who is signed in and their ticket balance and sets the `csrftoken` cookie. `src/api.ts` sends that cookie's value as `X-CSRFToken` on every POST.

## Structure

- `src/api.ts`: fetch wrapper (cookies + CSRF), `/me/`, logout, hub sessions, leaderboard
- `src/auth.ts`, `src/AuthProvider.tsx`, `src/GoogleSignIn.tsx`: signed-in state and the Google sign-in button
- `src/pages/Hub.tsx`: game list and leaderboard
- `src/games/minesweeper/`: the Defusal section (`api.ts` for its endpoints, `Minesweeper.tsx` for the UI)
- `src/games/wordle/`: the Fastfind landing, game UI, rules, and styling. The hub links to `/wordle`; the Play button creates an authenticated hub session, then starts the Fastfind API session.

New games go in `src/games/<name>/` with a route in `src/App.tsx`.

## Config

- `VITE_MINESWEEPER_GAME_ID`: the hub game ID to fall back on if `/games/` can't be read. It defaults to `1`.
- `VITE_WORDLE_GAME_ID`: the hub game ID to fall back on if `/games/` can't be read. It defaults to `4`.
