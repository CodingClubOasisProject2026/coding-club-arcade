const BASE = "/api/snake";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin", 
    ...options,
  });

const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
/*
const res = await fetch(`${BASE}${path}`, {
  ...options,
  headers: { "Content-Type": "application/json", ...options.headers },
});
*/
export const startGame = (sessionId) =>
  request("/start", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });

export const getGame = (sessionId) => request(`/session/${sessionId}`);

export const moveSnake = (sessionId, action) =>
  request(`/session/${sessionId}/move`, { method: "POST", body: JSON.stringify({ action }) });

export const endGame = (sessionId) =>
  request(`/session/${sessionId}/end`, { method: "POST" });