# Tetris score validation API

The browser may render and control the game locally, but it must not submit a score or proposed piece coordinates. At the end of a run, submit the ordered input log. The backend reconstructs the seeded pieces, applies each input, checks collisions and rotations, and calculates the score itself.

## Endpoint

`POST /tetris/api/game/`

The request must be authenticated and use `Content-Type: application/json`. The referenced session must belong to the signed-in user and be a Tetris session.

```json
{
  "session_id": "<uuid returned when starting the session>",
  "actions": [
    {"type": "move", "direction": "left"},
    {"type": "rotate", "direction": "clockwise"},
    {"type": "tick"},
    {"type": "hard_drop"}
  ]
}
```

Supported actions:

- `move` with `direction` `left` or `right`
- `rotate` with `direction` `clockwise` or `counterclockwise`
- `soft_drop`, `hard_drop`, and `tick` with no additional fields

Each action is applied to the server's current piece. A blocked move or rotation is rejected in the replay; a drop that reaches the bottom locks the piece, clears lines, and spawns the next seeded piece. Actions after game over are rejected.

## Response

The request queues validation and returns HTTP `202`:

```json
{"task_id": "<celery-task-id>", "status": "queued"}
```

The task saves the backend-calculated score to the session. A client-provided score, coordinates, rotation matrix, or lock flag is not accepted as game state.

## Errors

- `400`: malformed JSON, invalid session ID, or unsupported action format
- `401`: user is not authenticated
- `404`: the session does not belong to the user or is not a Tetris session
- `405`: request method is not `POST`
