#!/usr/bin/env node

const apiBase = (process.env.WORDLE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const frontendBase = (process.env.WORDLE_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const username = process.env.WORDLE_USERNAME;
const password = process.env.WORDLE_PASSWORD;

if (!username || !password) {
  console.error('Set WORDLE_USERNAME and WORDLE_PASSWORD to a hub account.');
  process.exit(1);
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function requestJSON(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: authorization,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return data;
}

try {
  const gamesResponse = await requestJSON('/games/');
  const games = gamesResponse.results || gamesResponse;
  const wordle = games.find((game) => game.name.toLowerCase() === 'wordle');
  if (!wordle) throw new Error('The hub has no WORDLE game. Seed the hub games first.');

  const session = await requestJSON(`/sessions/start/${wordle.id}/`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const launchUrl = new URL('/play/wordle/', frontendBase);
  launchUrl.searchParams.set('session_id', session.id);
  launchUrl.searchParams.set('seed', String(session.seed));

  console.log(`Created hub session ${session.id}`);
  console.log(`Seed: ${session.seed}`);
  console.log(`Launch Wordle: ${launchUrl.toString()}`);
} catch (error) {
  console.error(`Could not create Wordle session: ${error.message}`);
  process.exitCode = 1;
}
