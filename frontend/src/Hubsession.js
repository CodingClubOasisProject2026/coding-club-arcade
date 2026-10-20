// Talks to the hub backend to start Wordle sessions.
// The hub page saves the player's login here (for this browser tab only) so that the
// Wordle landing page and "Play again" can ask the backend for a new session
// without sending the player back to the hub.

const CREDENTIALS_KEY = 'arcade-hub-credentials';

export class AuthError extends Error { }

export function basicAuth(username, password) {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return `Basic ${btoa(binary)}`;
}

export function saveCredentials(username, password) {
    try {
        sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, password }));
    } catch {
        /* storage blocked: Play again will ask the player to sign in again */
    }
}

export function loadCredentials() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(CREDENTIALS_KEY));
        return saved?.username && saved?.password ? saved : null;
    } catch {
        return null;
    }
}

export function clearCredentials() {
    try {
        sessionStorage.removeItem(CREDENTIALS_KEY);
    } catch {
        /* nothing to clear */
    }
}

async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = typeof data.detail === 'string' ? data.detail : '';
        throw new Error(detail || `Hub request failed (${response.status})`);
    }
    return data;
}

let wordleGameId = null;

async function findGameId(name) {
    if (wordleGameId) return wordleGameId;
    const data = await fetch('/games/').then(readJson);
    const game = (data.results || data).find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!game) throw new Error('The hub has not been seeded with Wordle yet.');
    wordleGameId = game.id;
    return wordleGameId;
}

// POST /sessions/start/<game_id>/ with the saved login. Returns { sessionId, seed } from the backend.
export async function startSession(gameName = 'wordle') {
    const credentials = loadCredentials();
    if (!credentials) throw new AuthError('Your login has expired. Please sign in again from the arcade hub.');

    const gameId = await findGameId(gameName);
    const response = await fetch(`/sessions/start/${gameId}/`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
            Authorization: basicAuth(credentials.username, credentials.password),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });
    if (response.status === 401 || response.status === 403) {
        clearCredentials();
        throw new AuthError('Your login was not accepted. Please sign in again from the arcade hub.');
    }
    const session = await readJson(response);
    return { sessionId: String(session.id), seed: String(session.seed) };
}