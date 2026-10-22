# Coding Club Arcade: Issues Found

Audit date: 2026-10-22. Five agents covered the platform core, Minesweeper + Snake, Tetris + Wordle, Pac-Man + Flappy Bird, and build/test checks. The repo was not changed. Every check ran on a scratch copy, with SQLite standing in for Postgres and no RabbitMQ.

**Summary:** 6 critical, 11 high, 25 medium, ~35 low.
The biggest themes:
1. **Scores don't get recorded** for Pac-Man and Snake.
2. **Cheating is easy.** The game seed goes to the browser, there is an old Tetris endpoint, and some endpoints have no ownership checks.
3. **Snake breaks in production** because it keeps games in one worker's memory while 4 workers run.

## Build / test status

| Check | Result |
|---|---|
| `tsc -b` | ✅ clean |
| `npm run build` | ✅ builds (main bundle 339 kB / 107 kB gzip) |
| `npm run lint` (oxlint) | ⚠️ 6 warnings, 0 errors |
| `npm audit` | ✅ 0 vulnerabilities |
| `python manage.py test` | ❌ 30 tests, **1 failure** (Wordle, see H10) |
| `makemigrations --check` | ❌ **tetris has a pending migration** (see H9) |
| `check --deploy` | ⚠️ mail.E001, HSTS / SSL redirect warnings, insecure default SECRET_KEY |
| Pac-Man TS ↔ Python parity | ✅ committed fixtures are up to date; 300 random fuzz games matched with 0 differences |
| Tetris piece generator TS ↔ Python | ✅ identical sequences |

Not tested: Postgres-specific behaviour, a real Celery worker or RabbitMQ, Docker containers, the Google OAuth flow.

---

## 🔴 Critical

### C1. Pac-Man scores are never saved, because the task signature doesn't match
- **Where:** [backend/hub/views.py:121-124](backend/hub/views.py#L121-L124) and [backend/pacman/tasks.py:26](backend/pacman/tasks.py#L26).
- **Cause:** the hub sends `args=(user_id, session_id, actions)`, but `pacman.tasks.calculate_score(session_id, actions)` only takes 2 arguments.
- **Effect:** every ranked run raises `TypeError` in the worker. No `PacmanRun` is created, and the UI shows "Still verifying…" forever while the ticket is lost.
- **Why tests miss it:** they call the task directly with 2 arguments.
- **Fix:** change the signature to `(user_id, session_id, actions)` and filter by `user_id`. Add a hub test that goes through `PATCH /sessions/submit/`.

### C2. An old Tetris endpoint can overwrite verified scores with any value
- **Where:** [backend/tetris/views.py:16-85](backend/tetris/views.py#L16-L85), [backend/tetris/tasks.py:45-127](backend/tetris/tasks.py#L45-L127) and [backend/tetris/urls.py:7](backend/tetris/urls.py#L7).
- **Problem:** `POST /tetris/api/game/` is still routed. It queues a task that uses a different, older engine, and that task sets `session.score` without checking whether the session already has a verified score.
- **Exploit:** a player submits a real run, then POSTs any action list they like, as often as they like, to replace the score.
- **Fix:** delete the route, `game_api`, `tasks.py`, `engine.py`, `pieces.py` and `scoring.py`, which the real flow doesn't use. At minimum, refuse sessions that already have a score.

### C3. Minesweeper mine positions can be computed from the seed sent to the browser
- **Where:** [backend/hub/serializers.py:26](backend/hub/serializers.py#L26) and [backend/minesweeper/game.py:20-27](backend/minesweeper/game.py#L20-L27).
- **Problem:** `/sessions/start/` returns `seed`, and mines come from `random.Random(seed).shuffle(...)`.
- **Proof:** an outside re-implementation predicted every mine correctly. A script can win instantly and collect the maximum time bonus.
- **Fix:** don't send the seed for server-scored games. Derive the mine RNG from `HMAC(SECRET_KEY, session.id)`.

### C4. Snake keeps game state in process memory, but production runs 4 workers
- **Where:** [backend/snake/views.py:14](backend/snake/views.py#L14) (`games = {}`) and [docker/docker-compose.yml](docker/docker-compose.yml) (`granian --workers 4`).
- **Effect:** about 3 in 4 move requests hit a worker that doesn't know the game and return 404. The frontend treats that as fatal, so games end almost immediately after the ticket is spent.
- **Other problems:** games are also lost on worker recycle (`--workers-lifetime 3600`), the dict is never cleared, and access to it isn't thread-safe.
- **Fix:** store state in the database or a shared cache with `select_for_update`, or move to client-side play with replay verification.

### C5. Snake scores never reach the leaderboard
- **Where:** [frontend/src/games/snake/Snake.tsx:144-155](frontend/src/games/snake/Snake.tsx#L144-L155) and [frontend/src/games/snake/api.ts:50-54](frontend/src/games/snake/api.ts#L50-L54).
- **Problem:** the game calls `/snake/session/<id>/end/`, which only echoes the log back. Nothing calls `/sessions/submit/`, so `Session.score` stays `null`.
- **Fix:** have `end_game` finalise the score on the server, since it already holds the state.

### C6. Snake replay rejects deaths caused by turning
- **Where:** [backend/snake/views.py:155-159](backend/snake/views.py#L155-L159) and [backend/snake/game_logic.py:88-98](backend/snake/game_logic.py#L88-L98).
- **Problem:** on a collision, `move_snake` returns before saving the new direction, and the view skips logging on `GAME_OVER`. The fatal turn is never recorded, so on replay the snake goes straight and the run fails with "Replay did not end in a collision". This affects most real deaths.
- **Reproduced:** `UP×5, RIGHT, UP`.
- **Fix:** log the action whenever the direction changes, and set the direction before the collision checks.

---

## 🟠 High

### H1. Seeds sent to the browser plus loose replay checks let bots compute perfect runs offline
- **Root cause:** `SessionSerializer` returns `seed` for every game.
- **Tetris** ([backend/tetris/verification.py:99-139](backend/tetris/verification.py#L99-L139)): the replay requires no gravity ticks and no wall-clock check. A log of 11 hard drops at `at_ms: 0` was accepted. Because the level multiplier keeps growing, a solver's score grows quadratically.
- **Snake:** `/sessions/submit/` accepts any action log the client writes.
- **Flappy Bird:** no real-time check at all (see H2).
- **Pac-Man:** has a minimum real-time ratio, but a bot can simply wait out the time.
- **Fix:**
  - Simulate gravity on the server from `at_ms`.
  - Reject runs whose `duration_ms` is greater than `now - session.created_at` plus some slack.
  - Use a per-game allowlist of games that score through the hub.

### H2. Flappy Bird is half-removed but still playable and ranked through the API
- **Where:** [backend/config/settings.py](backend/config/settings.py) (still installed, with its queue and route), [backend/hub/models.py:24](backend/hub/models.py#L24) and [seed_games.py](backend/hub/management/commands/seed_games.py).
- **Problem:** only the URLs were removed. `/games/` still lists it, sessions can be started (spending a ticket), and submits are scored and counted on the leaderboard. With no frontend and no real-time check, a script can submit a 100k-tick run straight away (measured: about 1,152 points per session).
- **Fix:** remove it from `GameChoices` and seeding, or block starting sessions for it.

### H3. Wordle's answer list wraps after 50 words, and the game never ends
- **Where:** [backend/wordle/engine.py:82,94-105](backend/wordle/engine.py#L82).
- **Problem:** the answer is `answers[word_idx % len(answers)]`, so word 51 is word 1 again. The status is never set to `LOST` or `CLEARED`, which means the frontend's lost and cleared branches never run.
- **Fix:** set `CLEARED` at the end of the list and stop using modulo.

### H4. Wordle scoring pays more for stalling than for solving
- **Where:** [backend/wordle/engine.py:85-92](backend/wordle/engine.py#L85-L92) and [backend/wordle/views.py:221-227](backend/wordle/views.py#L221-L227).
- **Problem:** every green tile pays 5 points and 5 seconds on every guess, including greens that were already known.
- **Example:** five guesses with the same 4 greens earn 100 points and 100 seconds, while solving immediately earns 55. A fast typist never runs out of time.
- **Fix:** only reward greens that are new for that word, or give the time bonus only when a word is solved.

### H5. Minesweeper endpoints have no login or ownership check
- **Where:** [backend/minesweeper/views.py:45-153](backend/minesweeper/views.py#L45-L153).
- **Problem:** the views use bare `@api_view` and no default permission class is set. Anyone, including anonymous users, who has a session UUID can start, play or deliberately lose someone else's game. Session ids are uuid7, which is time-ordered and partly guessable.
- **Fix:** add `IsAuthenticated` and filter with `session__user=request.user`.

### H6. Insecure defaults: DEBUG on, committed SECRET_KEY, and a Wordle key that falls back to it
- **Where:** [backend/config/settings.py:26-30](backend/config/settings.py#L26-L30) and [docker/.env.example](docker/.env.example).
- **Problem:** `DEBUG` defaults to `true`, and `.env.example` also ships `DEBUG=true`. `SECRET_KEY` falls back to a key committed in the repo. `WORDLE_ANSWER_KEY` falls back to `SECRET_KEY` and isn't in `.env.example`, so anyone who knows the key can compute all Wordle answers offline.
- **Debug side effect:** DEBUG also turns on Tetris guest mode, and the `local_tetris_guest` user then shows up on the leaderboard.
- **Fix:** default `DEBUG=false`. Raise `ImproperlyConfigured` when the keys are missing in production, and add `WORDLE_ANSWER_KEY` to `.env.example`.

### H7. On Postgres, players with no score sort to the top of the leaderboard
- **Where:** [backend/hub/views.py:29](backend/hub/views.py#L29).
- **Problem:** `order_by("-score")` puts NULLs first on Postgres. New users, and anyone whose scores are still pending (every Pac-Man and Snake player, because of C1 and C5), appear above real players. Staff and the guest user are listed too.
- **Fix:** use `F("score").desc(nulls_last=True)` or filter out null scores, and exclude staff and the guest user.

### H8. A Snake session can be restarted without spending another ticket
- **Where:** [backend/snake/views.py:100-107](backend/snake/views.py#L100-L107).
- **Problem:** `start_game` overwrites any existing game for that session id, so a player can replay one ticketed session until they get their best run.
- **Fix:** refuse `start` if a game already exists or the session is finished.

### H9. The tetris app has a pending migration
- **Problem:** `models.py` is empty, but `0001_initial` creates `Player` and `Score`. `makemigrations --check` fails, which breaks any CI check, and the stale tables stay in production.
- **Fix:** run `makemigrations tetris` to create `0002_remove_score_player_delete_player_delete_score`.

### H10. One Wordle test fails
- **Where:** [backend/wordle/tests/test_stateless_api.py:62-72](backend/wordle/tests/test_stateless_api.py#L62-L72).
- **Problem:** `test_six_misses_advance_and_cannot_be_reset_by_client_history` gets `409 != 200` because it never calls `/wordle/initialize` first.
- **Fix:** call `self.initialize()` at the start of the test.

### H11. Minesweeper spends a ticket on page load, on every difficulty change and on every R press
- **Where:** [frontend/src/games/minesweeper/Minesweeper.tsx:366-378,397-398](frontend/src/games/minesweeper/Minesweeper.tsx#L366-L378).
- **Problems:**
  - `useEffect(start, [difficulty])` creates a ticketed session as soon as the page mounts.
  - StrictMode runs that effect twice in dev, which spends 2 tickets.
  - The R key handler doesn't check modifiers, so Cmd/Ctrl+R (reload) also restarts the game.
  - `CURRENT_GAME_KEY` is saved to localStorage but never read, so a refresh can't resume the game.
- **Fix:** start a session only on an explicit Start or first click, ignore keys pressed with modifiers, confirm before abandoning a game, and resume from the saved key.

---

## 🟡 Medium

### Platform / hub
- **M1. Problems with `/sessions/submit/`** ([backend/hub/views.py:82-124](backend/hub/views.py#L82-L124)):
  - Minesweeper submits dispatch `minesweeper.tasks.calculate_score`, which doesn't exist. The message goes to the default `celery` queue, which no worker reads, so messages pile up in RabbitMQ.
  - If RabbitMQ is down, the endpoint returns 500 after the session has already been saved.
  - The `web` service in docker-compose doesn't depend on `rabbitmq`.
  - **Fix:** use an allowlist of games that score through tasks, return 503 when the broker is down, and use `transaction.on_commit`.
- **M2. A bad `game_id` on `/sessions/start/` returns 500** ([backend/hub/views.py:62-79](backend/hub/views.py#L62-L79)):
  - `POST /sessions/start/9999/` gives an `IntegrityError` instead of a 404.
  - **Fix:** call `get_object_or_404(Game, id=game_id)` before taking the ticket.
- **M3. `Game.ratio` is never used, and `seed_games` resets it on every deploy:**
  - The leaderboard adds up raw scores, so one Pac-Man run (thousands of points) outweighs many Snake or Minesweeper games.
  - `Game` isn't registered in the admin, so the ratio can't be edited.
  - `update_or_create(defaults={"ratio": 1.0})` overwrites it every time the container starts.
  - **Fix:** weight the sum by the ratio, register `Game` in the admin, and use `get_or_create` in `seed_games`.
- **M4. The leaderboard only shows the first 20 players** ([frontend/src/pages/leaderboard.tsx](frontend/src/pages/leaderboard.tsx) and [frontend/src/api.ts:99-101](frontend/src/api.ts#L99-L101)):
  - The page ignores DRF's pagination (`count` and `next`) but still labels the list "ALL PLAYERS".
- **M5. The leaderboard cache barely works** ([backend/hub/views.py:31-33](backend/hub/views.py#L31-L33)):
  - `LocMemCache` is per process, so each of the 4 workers has its own cache.
  - The response varies by cookie, so there is one cache entry per user and the 300-entry cache fills up.
  - **Fix:** cache the query result under a fixed key, or use a shared cache.
- **M6. Hard-coded fallback game IDs point to the wrong games:**
  - On a fresh database, Wordle's fallback id (4) is Tetris and Pac-Man's (5) is Wordle. If `/games/` fails, the player spends a ticket on the wrong game.
  - Files: [pacman/api.ts:4](frontend/src/games/pacman/api.ts#L4), [WordlePage.jsx:779](frontend/src/games/wordle/WordlePage.jsx#L779), [snake/api.ts:3](frontend/src/games/snake/api.ts#L3) and [minesweeper/api.ts:40](frontend/src/games/minesweeper/api.ts#L40).
  - **Fix:** remove the fallbacks and show an error instead.
- **M7. `check --deploy` problems:** the console email backend (mail.E001), `SECURE_HSTS_SECONDS=0`, and no SSL redirect setting. The SSL redirect may be fine if Caddy handles it, but that should be documented.
- **M8. The hub has no tests:** nothing covers the ticket race, the submit ownership check, leaderboard ordering or the task arguments. Tests would have caught C1, H7 and M2.

### Minesweeper
- **M9. Unexpected start errors silently switch to practice mode:**
  - 500, network and 429 errors drop into practice mode without telling the player, who thinks the game is ranked ([Minesweeper.tsx:354-361](frontend/src/games/minesweeper/Minesweeper.tsx#L354-L361)).
  - Every 400 is shown as "No tickets left", even when the cause is something else.
- **M10. Fast play hits the throttle and moves are silently dropped:**
  - All endpoints share `UserRateThrottle` at 120/min, and an expert game needs more than 134 moves.
  - The frontend ignores errors other than 409, and `pending.current` throws away clicks made while a request is in flight.
  - **Fix:** give moves a scoped throttle and show errors to the player.
- **M11. On Android, a long press flags and then unflags the cell:** the long-press timer flags it, then the `contextmenu` event fires on the same press and toggles it back ([Minesweeper.tsx:714-719,1001-1004](frontend/src/games/minesweeper/Minesweeper.tsx#L714-L719)).

### Snake
- **M12. One HTTP round-trip per tick, and the tick waits for it** ([Snake.tsx:112-122](frontend/src/games/snake/Snake.tsx#L112-L122)):
  - Game speed depends on network lag.
  - Each player sends about 7–11 requests per second, and the endpoints are unthrottled.
  - **Fix:** simulate on the client and verify by replay.
- **M13. Leaving mid-game never ends the session:**
  - Unmounting the page doesn't end the session, so the ticket is lost and nothing is recorded.
  - If `startSnakeGame` fails after the session was created, the game can't be retried.
- **M14. Malformed input returns 500, and CSRF is disabled** ([backend/snake/views.py](backend/snake/views.py)):
  - A non-UUID `session_id` returns 500, because Django raises `ValidationError` and only `ValueError` is caught.
  - A JSON body that isn't an object (e.g. `[]`) returns 500 with `AttributeError`.
  - `@csrf_exempt` is set on cookie-authenticated POSTs.

### Tetris
- **M15. No touch controls:** the only input is the keyboard, so phone users spend a ticket and then can't play ([frontend/src/games/tetris/app.js:434-454](frontend/src/games/tetris/app.js#L434-L454)).
- **M16. The standalone dev server never serves its own files:**
  - `frontendRoot` already ends in `/`, so the `startsWith(frontendRoot + sep)` check is always false and every request is proxied to Django ([dev-server.mjs:6,23](frontend/src/games/tetris/dev-server.mjs#L6)).
  - Separately, `vite.config.ts` `BACKEND_PATHS` is missing `'tetris'`, so `/tetris/api/...` isn't proxied in `npm run dev`.

### Wordle
- **M17. Anyone with the game link can play or end the owner's game:**
  - The Wordle API sets authentication, permission and throttle classes to `[]` ([backend/wordle/views.py:120-123](backend/wordle/views.py#L120-L123)).
  - The only credential is `session_id` plus `seed`, and both are in the address bar.
  - **Fix:** require the owner's login, keep the seed out of the URL, and restore throttling.
- **M18. Tile and key results are shown only by colour:** screen-reader and colour-blind users get no "correct", "present" or "absent" information ([WordlePage.jsx:196-202,661-669](frontend/src/games/wordle/WordlePage.jsx#L196-L202)).
- **M19. Submit can happen mid-game or before the last guess is saved** ([WordlePage.jsx:320-328](frontend/src/games/wordle/WordlePage.jsx#L320-L328) and [wordle/tasks.py:26-34](backend/wordle/tasks.py#L26-L34)):
  - The client submits while a guess may still be in flight, so that guess can be left out of the score.
  - The task never checks that the game actually ended.

### Pac-Man / Flappy Bird
- **M20. In the tunnel, Pac-Man can pass through ghosts** ([backend/pacman/engine.py:142-146](backend/pacman/engine.py#L142-L146) and [engine.ts:176-179](frontend/src/games/pacman/engine.ts#L176-L179)):
  - `WRAP=240`, but the bound used is `COLS*UNIT=224`, so x flips between two representations of the same spot.
  - Collision then compares different tiles for the same physical position.
  - **Fix:** make the bounds match `WRAP` in both engines and bump `ENGINE_VERSION`.
- **M21. Runs longer than 30 minutes are permanently rejected:**
  - The server caps a run at 108,000 ticks, but the client has no cap.
  - A strong player who plays past that loses both the ticket and the score.
- **M22. Flappy pipes are never removed, so replay cost grows quadratically:**
  - A 100k-tick replay takes about 16 s of CPU inside `select_for_update` ([flappy_bird/game_logic.py:54-75](backend/flappy_bird/game_logic.py#L54-L75)).
  - Rejected runs leave `score=None`, so the same session can be resubmitted over and over.
- **M23. Pac-Man parity fixtures are shallow:**
  - They reach at most level 2 and compare only score, tick and level, never positions or RNG state.
  - **Fix:** add high-level fixtures and record a state hash every N ticks.

### Docs
- **M24. `TETRIS_DEMO_API.md` describes the old, unused flow** ([backend/tetris/TETRIS_DEMO_API.md](backend/tetris/TETRIS_DEMO_API.md)).
- **M25. The root README is out of date:**
  - It lists only 4 games.
  - It says nothing about tickets, `seed_games`, Google OAuth setup, the required env vars or how to run tests.
  - The frontend README's proxy list is also stale.

---

## 🟢 Low

### Platform
- [docker/caddyfile:16](docker/caddyfile#L16): `/wordle/*`, `/tetris/*` and the other game patterns also match `/wordle/` with a trailing slash, so those URLs go to Django and return 404 instead of the React page.
- `.env.example` uses `SITE_ADDRESS=:80`, which is plain HTTP. With DEBUG off, cookies are marked secure, so login silently breaks.
- [settings.py:169](backend/config/settings.py#L169): the database host is hard-coded as `'db'`. Use `getenv('POSTGRES_HOST', 'db')`.
- Google sign-in has no domain restriction. Any Google account can join, and usernames (often the email prefix) are shown publicly on the leaderboard.
- [GoogleSignIn.tsx](frontend/src/GoogleSignIn.tsx): the fallback without a CSRF cookie shows allauth's unstyled "Continue?" page, and `next` drops the query string, which loses Wordle's `?session_id=`.
- [backend/hub/views.py](backend/hub/views.py): `get_permissions` runs a Game query on every request, and `SessionSubmitView` is missing `select_related("game")`.
- Tetris guest mode depends only on DEBUG plus a flag. Any anonymous user can submit to the guest's sessions.
- [index.css:128-133](frontend/src/index.css#L128-L133): the Tetris iframe uses `height:100vh; min-height:720px`, which overflows short phones. Use `100dvh`.
- oxlint warnings:
  - `set-state-in-effect` in `leaderboard.tsx:14` and in `WordlePage.jsx` at lines 305, 342, 383 and 396.
  - At `WordlePage.jsx:539`, the `useMemo` does nothing because it depends on `rows`, which is rebuilt every render.

### Minesweeper
- Pressing Space or F calls `preventDefault` without checking modifiers, which blocks Cmd/Ctrl+F and stops Space from activating buttons.
- The comments and the rotate modal say "Expert is 30 columns", but the board is 13×13.
- Clicking any revealed cell sends a chord request, even for 0-cells or when the flag count doesn't match. Each one is wasted and counts toward the throttle.
- The score for a lost game is never shown, although the backend awards one.
- The `Game` model isn't registered in the admin.

### Snake
- Space is blocked page-wide, so keyboard users can't press Start with it.
- The D-pad buttons have no `aria-label`s and only respond to `onPointerDown`.
- [Board.tsx](frontend/src/games/snake/Board.tsx): the burst `setTimeout` isn't cleared on unmount, and all 400 cells get new style objects every tick.
- `engine.ts` exports `DIR` and `POINTS`, which nothing uses. `models.py` and `admin.py` are empty.

### Tetris
- `?api=` lets the URL set the API base, and every request sends the CSRF token there. A crafted link can send the token to another host.
- Rejection messages are shown as raw JSON arrays.
- Long runs hit Django's 2.5 MB upload limit (about 64k events) before the code's own 100k limit, and the ticket is lost.
- Rotation is simple, not SRS:
  - Clockwise only, with a top-left pivot, so pieces drift as they rotate.
  - There is no lock delay.
  - Client and server match; any change must be made in both.
- The whole board DOM (200 cells) is rebuilt on every move, and the ARIA grid has no row elements.
- The clock counts paused time, and "YOUR BEST" saves the local score before the server verifies it.
- Old engine bugs (moot if it is deleted under C2): a duplicate import, mislabelled pieces, and a wrong error range.

### Wordle
- Each guess adds up to 1 extra second, because `ceil` rounding is applied again when the deadline is rebuilt.
- The old Django template and CSS are still routed at `/wordle/play/`. The template is entirely commented out and has corrupted markup, so remove them.
- The error parser reads `data.guesses[0]`, but DRF sends `data.guess`, so users see a generic error.
- The waiting card tells users to open `/play/wordle/?session_id=…`, but the real route is `/wordle?session_id=…`.
- Every request recomputes the answer list (2,309 HMACs plus a sort), and the guess view replays the history twice.

### Pac-Man / Flappy Bird
- Enter and Space are blocked page-wide, so keyboard users can't use focused links or buttons, and Enter starts a ticketed game.
- Rejected input logs are stored without any size limit (up to 2.5 MB each).
- The result poll keeps running after "Play again" or unmount and can overwrite the new run's state.
- The canvas is fixed at 2× resolution and looks blurry on 3× screens.
- There is no forfeit option. Leaving mid-run loses the ticket.
- No fruit and no extra-life feature. If added, they must go into both engines with a version bump.
- Flappy has only 2 tests. It uses Python's Mersenne Twister, which would be hard to match in a TS client.
- Flappy's `models.py`, `views.py` and `admin.py` are empty stubs.

### Repo hygiene
- The top-level `public/snake/` is a byte-identical, unused copy of `frontend/public/snake-assets/`.
- The `.auth` rules in `index.css` (lines 589-645) match no element.
- `backend/.gitignore` has redundant entries.
- In `pyproject.toml`:
  - `redis` is unused.
  - `django-stubs` should be a dev dependency.
  - `amqp` and `kombu` are already pulled in by celery.
  - The description is still a placeholder.
- Minor version bumps are available (vite, oxlint, allauth, granian). `@types/node` 24 doesn't match Node 26.

---

## Verified as correct (no action needed)
- **Minesweeper:** the first click is safe, flood fill and win detection work, flags are capped, move ordering is enforced and moves are locked.
- **Snake:** wall and self collision, apples never spawn on the body, reversing direction is blocked and the input queue works.
- **Wordle:** duplicate-letter scoring is correct, future answers aren't leaked, and the submit guard and owner check work.
- **Tetris:** lock, line clear, hard drop and scoring match between client and server, and seeds are handled as BigInt.
- **Pac-Man:** no pass-through outside the tunnel, ghost AI and fright logic work, replay validation and owner-only status work, and the requestAnimationFrame loop is cleaned up.
- **Migrations:** the hub 0007/0008/0009 merge is consistent.
