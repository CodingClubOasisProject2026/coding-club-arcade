# Tetris score validation API

The browser may render and control the game locally, but it must not submit a score or proposed piece coordinates. At the end of a run, submit the ordered input log. The backend reconstructs the seeded pieces, applies each input, checks collisions and rotations, and calculates the score itself.

## Submission endpoint

`PUT /sessions/submit/<session_id>/`

Use the session returned by `POST /sessions/start/<game_id>/`. The session must belong to the current user.

```json
{
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

The request queues the action replay in Celery and returns HTTP `200` with the serialized session. The task saves the backend-calculated score to the session. A client-provided score, coordinates, rotation matrix, or lock flag is not accepted as game state.

`POST /tetris/api/game/` is also available for clients that prefer to include `session_id` in the JSON body. It queues the same Celery task and returns HTTP `202`:

```json
{"status": "queued", "task_id": "<celery-task-id>"}
```

The web frontend uses the session submission endpoint above.

## Errors

- `400`: malformed JSON, missing actions list, or unsupported action format
- `401`: user is not authenticated
- `404`: the session does not belong to the user or is not a Tetris session
- `405`: request method is not `PUT` for `/sessions/submit/` or not `POST` for `/tetris/api/game/`
