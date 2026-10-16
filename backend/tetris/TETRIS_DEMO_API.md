# Tetris Demo API Contract

**Purpose:** frontend integration contract for the Django demo backend. All gameplay operations use one endpoint and one JSON envelope.

## Endpoint

`POST /api/game/`

Content type: `application/json`. Every request includes an `action`. For actions on an existing game, include its `game_id`. The backend is authoritative for board state, collision checks, score, and game over. A client may send input actions; it should render the returned state rather than predicting final state.

## Actions

| Action | Required fields | Description |
|---|---|---|
| `start` | — | Create a new game. Optional `width` and `height` override defaults. |
| `state` | `game_id` | Return the current state (also useful for polling). |
| `move` | `game_id`, `direction` | Move one cell: `left` or `right`. |
| `rotate` | `game_id`, `direction` | Rotate: `clockwise` or `counterclockwise`. |
| `soft_drop` | `game_id` | Advance the active piece down one cell; award drop points only if enabled by the implementation. |
| `hard_drop` | `game_id` | Drop to the lowest valid position and lock the piece. |
| `tick` | `game_id` | Advance gravity by one elapsed gravity interval. Use for a demo or server-driven game loop; do not send faster than the interval returned in state. |
| `pause` | `game_id` | Pause a running game. |
| `resume` | `game_id` | Resume a paused game. |
| `restart` | `game_id` | Reset the same game to a fresh running game. |

## Request examples

Start a game:

```json
{
  "action": "start",
  "width": 10,
  "height": 20
}
```

Move or rotate:

```json
{
  "action": "move",
  "game_id": "g_8f31",
  "direction": "left"
}
```

Advance gravity:

```json
{
  "action": "tick",
  "game_id": "g_8f31"
}
```

Poll the latest state:

```json
{
  "action": "state",
  "game_id": "g_8f31"
}
```

## Success response

Every successful action returns the same envelope. `event` describes what happened during this request. Coordinates are zero-based, with `(0, 0)` at the board's top-left. `board` contains locked cells only; render `active_piece` over it.

```json
{
  "ok": true,
  "event": {
    "type": "piece_moved",
    "accepted": true
  },
  "game": {
    "game_id": "g_8f31",
    "status": "running",
    "board": {
      "width": 10,
      "height": 20,
      "cells": [
        {"x": 4, "y": 19, "type": "I"},
        {"x": 5, "y": 19, "type": "I"}
      ]
    },
    "active_piece": {
      "type": "T",
      "rotation": 0,
      "x": 3,
      "y": 2,
      "cells": [[1, 0], [0, 1], [1, 1], [2, 1]]
    },
    "next_piece": {"type": "L"},
    "score": 120,
    "lines_cleared": 1,
    "gravity": {
      "gravity_interval_ms": 700,
      "base_interval_ms": 1000,
      "minimum_interval_ms": 100,
      "score_threshold": 100,
      "score_step": 100,
      "interval_step_ms": 100,
      "next_threshold_score": 200
    },
    "created_at": "2026-10-16T12:00:00Z",
    "updated_at": "2026-10-16T12:00:08Z"
  }
}
```

### State and gravity behavior

- `status` is `running`, `paused`, or `over`.
- `board.cells` lists occupied locked cells. Each cell has board coordinates and a piece `type` (for example `I`, `O`, `T`, `S`, `Z`, `J`, `L`).
- `active_piece.cells` are offsets relative to `active_piece.x, y`; rotation is an integer quarter-turn count from 0 to 3.
- `gravity_interval_ms` is the delay between automatic downward steps. Lower values mean faster gravity. It starts at `base_interval_ms`; each score threshold reduces it by `interval_step_ms`, down to `minimum_interval_ms`.
- Example rule: `interval = max(minimum_interval_ms, base_interval_ms - floor(score / score_threshold) * interval_step_ms)`. Thresholds are cumulative, fixed steps; there are no named levels. `next_threshold_score` is the next score boundary (omit or return `null` once at the minimum interval).
- `tick` performs at most one gravity step; if the piece cannot descend it locks, clears completed lines, scores, and spawns the next piece. If spawning collides, status becomes `over`.

## Errors

Use standard HTTP status codes and this error envelope. The frontend should show `message` to the user only when appropriate; `code` is stable for branching.

```json
{
  "ok": false,
  "error": {
    "code": "invalid_direction",
    "message": "direction must be 'left' or 'right'.",
    "field": "direction"
  }
}
```

| HTTP | Code | Meaning |
|---|---|---|
| `400` | `invalid_json` | Body is malformed or not a JSON object. |
| `400` | `unknown_action` | Missing or unsupported `action`. |
| `400` | `invalid_direction` | Direction is invalid for `move` or `rotate`. |
| `404` | `game_not_found` | `game_id` does not identify a game. |
| `409` | `game_not_running` | Action requires a running game, but it is paused or over. |
| `422` | `invalid_dimensions` | Requested board dimensions are outside supported bounds. |
| `500` | `server_error` | Unexpected backend failure. |

Blocked moves and rotations are normal gameplay outcomes, not API errors: return `ok: true`, `event.accepted: false`, and the unchanged game state. A request that is otherwise valid after game over should return `409` (except `state`, `restart`).

## Frontend integration notes

- Keep the `game_id` from `start`; send it with every later action.
- Read the returned `game` after each action. Poll `state` as needed to recover after reconnects.
- For automatic gravity, schedule `tick` using the latest `gravity_interval_ms`, then reschedule from the latest response. Cancel the timer while paused or over.
- A demo can store games in memory. Production deployments should persist game state and scope `game_id` to the authenticated user/session.
