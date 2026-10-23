# Tetris score validation API

The browser may render and control the game locally, but it must not submit a score or proposed piece coordinates. At the end of a run, submit the ordered input log. The backend reconstructs the seeded pieces, applies each input, checks collisions and rotations, and calculates the score itself.

## Submission endpoint

`PUT /sessions/submit/<session_id>/`

Use the session returned by `POST /sessions/start/<game_id>/`. The session must belong to the current user.

```json
{"actions": "TTLLCTTTH"}
```

`actions` is a string with one character per input, in the order they happened:

| char | input |
|---|---|
| `T` | gravity tick |
| `L` / `R` | move left / right |
| `C` / `c` | rotate clockwise / counterclockwise |
| `S` | soft drop |
| `H` | hard drop |

Any other character rejects the run. The string is capped at 100,000 actions. No timing is sent or checked.

Each action is applied to the server's current piece. A blocked move or rotation is ignored; a drop that reaches the bottom locks the piece (or detonates a bomb), clears lines, and spawns the next seeded piece. Actions after game over are rejected.

## Response

The hub's generic submit view queues `tetris.tasks.calculate_score` in Celery and returns HTTP `200` with the serialized session. The task replays the actions and saves the backend-calculated score with `Session.update_score`. A client-provided score, coordinates, rotation matrix, or lock flag is not accepted as game state.

Each session is scored once. The first valid submission sets the score; later submissions are ignored. An invalid action string (bad characters, actions after game over, or a run that doesn't end in game over) is logged and leaves the score empty.

## Errors

- `400`: malformed JSON
- `401`: user is not authenticated
- `404`: the session does not belong to the user
- `405`: request method is not `PUT` or `PATCH`
