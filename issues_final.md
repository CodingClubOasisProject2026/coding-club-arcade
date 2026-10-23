# Coding Club Arcade: Open Issues

Combined from [issues.md](issues.md) (2026-10-22) and [issues_new.md](issues_new.md) (2026-10-23), checked against commit `e275ea1`. Only issues that are still open are listed.

**Left out on purpose:**
- **Cheating by computing from the game seed.** This assumes no one will go to that much effort. It covers predicting Minesweeper mines, bots that compute perfect Tetris, Snake or Pac-Man runs offline, and the missing timing check in the Tetris replay.
- **Games that don't use Celery.** That's fine as long as the score reaches the database. Minesweeper saves its score directly in `_finish` ([backend/minesweeper/views.py:16-20](backend/minesweeper/views.py#L16-L20)).
- **Test failures caused by the test itself, not the code.** See the build table.
- **Issues already fixed:**
  - The Pac-Man task signature.
  - The old Tetris endpoint overwriting scores.
  - Snake: per-worker memory, scores not saved, replay rejecting deaths caused by turning, and restarting without a ticket.
  - Minesweeper auth.
  - The old Tetris API doc.

**Summary:** 0 critical, 8 high, 21 medium, ~30 low.

## Build / test status

| Check | Result |
|---|---|
| `tsc -b` | ✅ clean |
| `npm run build` | ✅ builds (main bundle 341 kB / 107 kB gzip) |
| `npm run lint` (oxlint) | ⚠️ 6 warnings, 0 errors (see Low) |
| `npm audit` | ✅ 0 vulnerabilities |
| `python manage.py test` | ✅ 92 tests. 1 test fails, but the test is wrong, not the code (see below) |
| `makemigrations --check` | ❌ tetris has a pending migration (H7) |
| `check --deploy` | ⚠️ mail.E001, HSTS / SSL redirect warnings, insecure default SECRET_KEY (H5, M7) |
| Snake and Pac-Man TS ↔ Python parity | ✅ fixtures pass. 300 fuzzed games per game gave 0 differences |

**The failing test is a mistake in the test.** `wordle.tests.test_stateless_api.test_six_misses_advance_and_cannot_be_reset_by_client_history` gets `409 != 200`.
- **Why:** it sends guesses without calling `/wordle/initialize` first. The view correctly answers `409 not_initialized`, and every other Wordle test calls `initialize()` first.
- **Checked:** with `self.initialize()` added, the test passes. The fix is one line in the test, and no app code needs to change.

Not tested: Postgres-specific behaviour, a real Celery worker or RabbitMQ, Docker, the Google OAuth flow.

---

## 🟠 High

### H1. Players can't see when a Snake or Tetris run is rejected, and Tetris never shows a verified score
- **Snake:** when a run is rejected, [backend/snake/tasks.py:37-39](backend/snake/tasks.py#L37-L39) only logs a warning. Nothing is saved, so [backend/snake/views.py:18-21](backend/snake/views.py#L18-L21) keeps answering `"pending"`, and the game shows "STILL VERIFYING" forever ([Snake.tsx:139-148](frontend/src/games/snake/Snake.tsx#L139-L148)).
- **Tetris:** there is no status endpoint. After submitting, the player only sees "Run queued" and a task id ([app.js:607-618](frontend/src/games/tetris/app.js#L607-L618)). A rejected run raises `ValueError` inside the Celery task, so it shows up only in the worker logs.
- **Fix:** save rejected results the way Pac-Man does with `PacmanRun` (a status and a reason), and return them from a status endpoint. Add a status endpoint for Tetris and poll it from `app.js`.

### H2. Flappy Bird is half-removed but can still be started and ranked
- **Where:** [backend/config/settings.py](backend/config/settings.py) (still installed, with its queue and route), [backend/hub/models.py:24](backend/hub/models.py#L24) and [seed_games.py](backend/hub/management/commands/seed_games.py).
- **Problem:** only the URLs were removed. `/games/` still lists Flappy Bird, `/sessions/start/` still spends a ticket on it, and submits are scored and counted on the leaderboard, even though there is no frontend.
- **Cost:** pipes are never removed, so a long replay takes about 16 s of CPU while holding a row lock ([flappy_bird/game_logic.py:54-75](backend/flappy_bird/game_logic.py#L54-L75)).
- **Fix:** remove it from `GameChoices` and from seeding, or block starting sessions for it.

### H3. Wordle's answer list wraps after 50 words, and the game never ends
- **Where:** [backend/wordle/engine.py:82](backend/wordle/engine.py#L82) and [backend/wordle/views.py:65](backend/wordle/views.py#L65).
- **Problem:** the answer is `answers[word_idx % len(answers)]`, so word 51 is word 1 again. The status is never set to `LOST` or `CLEARED`, which means the frontend's lost and cleared branches never run.
- **Fix:** set `CLEARED` at the end of the list and stop using modulo.

### H4. Wordle scoring pays more for stalling than for solving
- **Where:** [backend/wordle/engine.py:85-92](backend/wordle/engine.py#L85-L92) and [backend/wordle/views.py:221-227](backend/wordle/views.py#L221-L227).
- **Problem:** every green tile pays 5 points and 5 seconds on every guess, including greens that were already known.
- **Example:** five guesses with the same 4 greens earn 100 points and 100 seconds, while solving immediately earns 55. A fast typist never runs out of time.
- **Fix:** only reward greens that are new for that word, or give the time bonus only when a word is solved.

### H5. Insecure defaults: DEBUG on and a committed SECRET_KEY
- **Where:** [backend/config/settings.py:26-30](backend/config/settings.py#L26-L30) and [docker/.env.example](docker/.env.example).
- **Problem:**
  - `DEBUG` defaults to `true`, and `.env.example` also ships `DEBUG=true`.
  - `SECRET_KEY` falls back to a key committed in the repo, which is enough to forge session cookies.
  - `WORDLE_ANSWER_KEY` falls back to `SECRET_KEY` and isn't in `.env.example`.
- **Debug side effect:** DEBUG also turns on Tetris guest mode, and the `local_tetris_guest` user then shows up on the leaderboard.
- **Fix:** default `DEBUG=false`, raise `ImproperlyConfigured` when the keys are missing in production, and add `WORDLE_ANSWER_KEY` to `.env.example`.

### H6. On Postgres, players with no score sort to the top of the leaderboard
- **Where:** [backend/hub/views.py:29](backend/hub/views.py#L29).
- **Problem:** `order_by("-score")` puts NULLs first on Postgres, so new users and anyone whose runs are still pending appear above real players. Staff and the guest user are listed too.
- **Fix:** use `F("score").desc(nulls_last=True)` or filter out null scores, and exclude staff and the guest user.

### H7. The tetris app has a pending migration
- **Problem:** `models.py` is empty, but `0001_initial` creates `Player` and `Score`. `makemigrations --check` fails, which breaks any CI check, and the stale tables stay in production.
- **Fix:** run `makemigrations tetris`, which creates `0002_remove_score_player_delete_player_delete_score`.

### H8. Minesweeper spends a ticket on page load, on every difficulty change and on every R press
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
- **M1. `/sessions/submit/` fails badly when the broker is down** ([backend/hub/views.py:121-127](backend/hub/views.py#L121-L127)):
  - If RabbitMQ is down, the endpoint returns 500 after the session has already been saved.
  - The `web` service in docker-compose doesn't depend on `rabbitmq`.
  - **Fix:** return 503 when the broker can't be reached, send the task inside `transaction.on_commit`, and add the dependency.
- **M2. A bad `game_id` on `/sessions/start/` returns 500** ([backend/hub/views.py:62-79](backend/hub/views.py#L62-L79)): `POST /sessions/start/9999/` raises `IntegrityError`. Call `get_object_or_404(Game, id=game_id)` before taking the ticket.
- **M3. `Game.ratio` is never used, and `seed_games` resets it on every deploy:**
  - The leaderboard adds up raw scores, so one Pac-Man run outweighs many Snake or Minesweeper games.
  - `Game` isn't registered in the admin, and `update_or_create(defaults={"ratio": 1.0})` overwrites the ratio every time the container starts.
  - **Fix:** weight the sum by the ratio, register `Game` in the admin, and use `get_or_create`.
- **M4. The leaderboard only shows the first 20 players** ([frontend/src/pages/leaderboard.tsx](frontend/src/pages/leaderboard.tsx) and [frontend/src/api.ts:99-101](frontend/src/api.ts#L99-L101)). It ignores DRF's pagination but still labels the list "ALL PLAYERS".
- **M5. The leaderboard cache barely works** ([backend/hub/views.py:31-33](backend/hub/views.py#L31-L33)):
  - `LocMemCache` is per process, so each of the 4 workers has its own cache.
  - The response varies by cookie, which means one cache entry per user.
  - **Fix:** cache the query result under a fixed key, or use a shared cache.
- **M6. Hard-coded fallback game IDs point to the wrong games:**
  - On a fresh database, Wordle's fallback (4) is Tetris and Pac-Man's (5) is Wordle. If `/games/` fails, the player spends a ticket on the wrong game.
  - Files: [pacman/api.ts:4](frontend/src/games/pacman/api.ts#L4), [WordlePage.jsx:779](frontend/src/games/wordle/WordlePage.jsx#L779), [snake/api.ts:4](frontend/src/games/snake/api.ts#L4) and [minesweeper/api.ts:40](frontend/src/games/minesweeper/api.ts#L40).
  - **Fix:** remove the fallbacks and show an error instead.
- **M7. `check --deploy` problems:** the console email backend (mail.E001), `SECURE_HSTS_SECONDS=0`, and no SSL redirect setting. The redirect may be fine if Caddy handles it, but that should be documented.
- **M8. Hub tests are thin:**
  - Pac-Man and Snake now test the submit path.
  - Nothing tests ticket spending under races, leaderboard ordering, or a bad `game_id`, which would have caught H6 and M2.
- **M9. Submits are unlimited and unthrottled** ([backend/snake/tasks.py:28-39](backend/snake/tasks.py#L28-L39) and [backend/tetris/tasks.py:57-59](backend/tetris/tasks.py#L57-L59)):
  - A rejected Snake or Tetris run stores nothing, so the session stays open.
  - Every resubmit queues another Celery task with a body of up to 2.5 MB.
  - **Fix:** store the first result (see H1), and add a scoped throttle to `/sessions/submit/`.
- **M10. Unexpected start errors silently switch to practice mode** in Minesweeper ([Minesweeper.tsx:354-361](frontend/src/games/minesweeper/Minesweeper.tsx#L354-L361)) and Snake ([Snake.tsx:88-94](frontend/src/games/snake/Snake.tsx#L88-L94)):
  - 500, network and 429 errors drop into practice mode, so the player may think the game is ranked.
  - Every 400 is shown as "No tickets left". Only a 400 with a `tickets` field means that.

### Minesweeper
- **M11. Fast play hits the throttle and moves are silently dropped:**
  - All endpoints share `UserRateThrottle` at 120/min, and an expert game needs more than 134 moves.
  - The frontend ignores errors other than 409, and `pending.current` throws away clicks made while a request is in flight.
  - **Fix:** give moves a scoped throttle and show errors to the player.
- **M12. On Android, a long press flags and then unflags the cell.** The long-press timer flags it, then the `contextmenu` event fires on the same press and toggles it back ([Minesweeper.tsx:714-719,1001-1004](frontend/src/games/minesweeper/Minesweeper.tsx#L714-L719)).

### Snake
- **M13. Leaving a run, or a failed submit, loses the ticket and the score** ([Snake.tsx:123-172](frontend/src/games/snake/Snake.tsx#L123-L172)):
  - Closing the tab mid-run submits nothing, even though the server already accepts `end_reason: "QUIT"`.
  - If the submit request fails, there is no retry. `sessionRef` has already been cleared and the log is gone.
  - **Fix:** on `pagehide` or unmount, send a `QUIT` log with `fetch(..., { keepalive: true })`. Keep the log until the submit succeeds, and add a retry button like Tetris has.

### Tetris
- **M14. No touch controls.** The only input is the keyboard, so phone users spend a ticket and then can't play ([frontend/src/games/tetris/app.js:434-454](frontend/src/games/tetris/app.js#L434-L454)).
- **M15. The dev setup can't serve Tetris properly:**
  - In `dev-server.mjs`, `frontendRoot` already ends in `/`, so the `startsWith(frontendRoot + sep)` check is always false and every request goes to Django ([dev-server.mjs:6,23](frontend/src/games/tetris/dev-server.mjs#L6)).
  - `vite.config.ts` `BACKEND_PATHS` is missing `'tetris'`, so `/tetris/api/...` isn't proxied in `npm run dev`.

### Wordle
- **M16. Anyone with the game link can play or end the owner's game:**
  - The Wordle API sets authentication, permission and throttle classes to `[]` ([backend/wordle/views.py:120-123](backend/wordle/views.py#L120-L123)).
  - The only credential is the `session_id` and `seed` in the address bar.
  - **Fix:** require the owner's login and restore throttling.
- **M17. Tile and key results are shown only by colour.** Screen-reader and colour-blind users get no "correct", "present" or "absent" information ([WordlePage.jsx:196-202,661-669](frontend/src/games/wordle/WordlePage.jsx#L196-L202)).
- **M18. Submit can happen mid-game or before the last guess is saved** ([WordlePage.jsx:320-328](frontend/src/games/wordle/WordlePage.jsx#L320-L328) and [wordle/tasks.py:26-34](backend/wordle/tasks.py#L26-L34)):
  - The client may submit while a guess is still in flight, which leaves that guess out of the score.
  - The task never checks that the game actually ended.

### Pac-Man
- **M19. In the tunnel, Pac-Man can pass through ghosts** ([backend/pacman/engine.py:142-146](backend/pacman/engine.py#L142-L146) and [engine.ts:176-179](frontend/src/games/pacman/engine.ts#L176-L179)):
  - `WRAP=240`, but the bound used is `COLS*UNIT=224`, so x flips between two representations of the same spot.
  - Collision then compares different tiles for the same physical position.
  - **Fix:** make the bounds match `WRAP` in both engines and bump `ENGINE_VERSION`.
- **M20. Runs longer than 30 minutes are permanently rejected.** The server caps a run at 108,000 ticks, but the client has no cap, so a strong player loses both the ticket and the score.
- **M21. The parity fixtures are shallow.** They reach at most level 2 and compare only score, tick and level. Add high-level fixtures and record a state hash every N ticks.

### Docs
- **M22. The root README is out of date:**
  - It lists only 4 games.
  - It says nothing about tickets, `seed_games`, Google OAuth setup, the required env vars or how to run tests.
  - The frontend README's proxy list is also stale.

---

## 🟢 Low

### Platform
- [docker/caddyfile:16](docker/caddyfile#L16): `/wordle/*`, `/snake/*` and the other game patterns also match the page URL with a trailing slash. For example, `/snake/` goes to Django and returns 404 instead of the React page.
- `.env.example` uses `SITE_ADDRESS=:80`, which is plain HTTP. With DEBUG off, cookies are marked secure, so login silently breaks.
- [settings.py](backend/config/settings.py): the database host is hard-coded as `'db'`. Use `getenv('POSTGRES_HOST', 'db')`.
- Google sign-in has no domain restriction. Any Google account can join, and usernames (often the email prefix) are shown publicly on the leaderboard.
- [GoogleSignIn.tsx](frontend/src/GoogleSignIn.tsx): the fallback without a CSRF cookie shows allauth's unstyled "Continue?" page, and `next` drops the query string, which loses Wordle's `?session_id=`.
- [backend/hub/views.py](backend/hub/views.py): `get_permissions` runs a Game query on every request, and `SessionSubmitView` is missing `select_related("game")`.
- Tetris guest mode depends only on DEBUG plus a flag. Any anonymous user can submit to the guest's sessions.
- [index.css:128-133](frontend/src/index.css#L128-L133): the Tetris iframe uses `height:100vh; min-height:720px`, which overflows short phones. Use `100dvh`.
- oxlint warnings:
  - `set-state-in-effect` in `leaderboard.tsx:14` and in `WordlePage.jsx` at lines 305, 342, 383 and 396.
  - At `WordlePage.jsx:539`, the `useMemo` does nothing because `rows` is rebuilt every render.

### Minesweeper
- Space and F call `preventDefault` without checking modifiers, which blocks Cmd/Ctrl+F and stops Space from activating buttons.
- The comments and the rotate modal say "Expert is 30 columns", but the board is 13×13.
- Clicking any revealed cell sends a chord request, even for 0-cells or when the flag count doesn't match. Each one is wasted and counts toward the throttle.
- The score for a lost game is never shown, although the backend awards one.
- The `Game` model isn't registered in the admin.

### Snake
- Space and P call `preventDefault` page-wide even when no game is running, so Space can't press the focused START button ([Snake.tsx:183-186](frontend/src/games/snake/Snake.tsx#L183-L186)).
- The score poll in `finish()` has no cancel and keeps running after the player leaves the page ([Snake.tsx:139-147](frontend/src/games/snake/Snake.tsx#L139-L147)).
- The D-pad buttons have no `aria-label`s and only respond to `onPointerDown` ([DPad.tsx](frontend/src/games/snake/DPad.tsx)).
- [Board.tsx:98](frontend/src/games/snake/Board.tsx#L98): the burst `setTimeout` isn't cleared on unmount, and all 400 cells get new style objects every tick.

### Tetris
- `POST /tetris/api/game/` duplicates `/sessions/submit/`, and the frontend doesn't use it. Remove the route.
- Rejected runs raise `ValueError` in the Celery task, so each one logs a traceback instead of returning a result (see H1).
- `?api=` lets the URL set the API base, and every request sends the CSRF token there. A crafted link can send the token to another host.
- Rejection messages are shown as raw JSON arrays.
- Long runs hit Django's 2.5 MB upload limit (about 64k events) before the code's own 100k limit, and the ticket is lost.
- Rotation is simple, not SRS:
  - Clockwise only, with a top-left pivot, so pieces drift as they rotate.
  - There is no lock delay.
  - Client and server match, so any change must be made in both.
- The whole board DOM (200 cells) is rebuilt on every move, and the ARIA grid has no row elements.
- The clock counts paused time, and "YOUR BEST" saves the local score before the server verifies it.

### Wordle
- Each guess adds up to 1 extra second, because `ceil` rounding is applied again when the deadline is rebuilt.
- The old Django template and CSS are still routed at `/wordle/play/`. The template is entirely commented out and has corrupted markup, so remove them.
- The error parser reads `data.guesses[0]`, but DRF sends `data.guess`, so users see a generic error.
- The waiting card tells users to open `/play/wordle/?session_id=…`, but the real route is `/wordle?session_id=…`.
- Every request recomputes the answer list (2,309 HMACs plus a sort), and the guess view replays the history twice.
- The failing test needs `self.initialize()` added (see the build table).

### Pac-Man
- Enter and Space are blocked page-wide, so keyboard users can't use focused links or buttons, and Enter starts a ticketed game.
- Rejected input logs are stored without any size limit (up to 2.5 MB each).
- The result poll keeps running after "Play again" or unmount and can overwrite the new run's state.
- The canvas is fixed at 2× resolution and looks blurry on 3× screens.
- There is no forfeit option. Leaving mid-run loses the ticket.
- No fruit and no extra-life feature. If added, they must go into both engines with a version bump.

### Repo hygiene
- The top-level `public/snake/` is a byte-identical, unused copy of `frontend/public/snake-assets/`.
- The `.auth` rules in `index.css` (lines 589-645) match no element.
- `backend/.gitignore` has redundant entries.
- Flappy Bird's `models.py`, `views.py` and `admin.py` are empty stubs (see H2).
- In `pyproject.toml`:
  - `redis` is unused.
  - `django-stubs` should be a dev dependency.
  - `amqp` and `kombu` are already pulled in by celery.
  - The description is still a placeholder.
- Minor version bumps are available (vite, oxlint, allauth, granian). `@types/node` 24 doesn't match Node 26.

---

## Verified as correct
- **Minesweeper:**
  - The first click is safe, flood fill and win detection work, flags are capped, and move ordering and locking are enforced.
  - Every endpoint requires login and checks that the player owns the game.
  - Scores are saved straight to the session.
- **Snake:**
  - The browser engine and the server replay agree on all fixtures and on 300 fuzzed games.
  - Deaths caused by turning replay correctly, and the real-time check matches the client's tick delays.
  - Ownership checks are in place.
- **Wordle:** duplicate-letter scoring is correct, future answers aren't leaked, and the submit guard and owner check work.
- **Tetris:** lock, line clear, hard drop and scoring match between client and server, and a stored run can't be overwritten.
- **Pac-Man:**
  - The task signature matches the hub, and replay validation and the owner-only status check work.
  - No pass-through outside the tunnel, and the ghost AI and fright logic work.
- **Migrations:** the hub 0007/0008/0009 merge is consistent.
