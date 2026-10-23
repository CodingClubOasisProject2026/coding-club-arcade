// Removed :8000 since your docker .env sets SITE_ADDRESS=:80
const API_BASE = "/api"; 

export type RunStatus = 
  | { status: 'pending'; score: null; reason: string }
  | { status: 'verified'; score: number; reason: string }
  | { status: 'rejected'; score: null; reason: string };

export async function startRun(): Promise<{ id: string; seed: number }> {
  const res = await fetch(`${API_BASE}/sessions/start/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: "flappy_bird" }), // Tells the generic backend which game to load
  });
  
  if (!res.ok) throw new Error("Failed to start session");
  
  const data = await res.json();
  return { id: data.session_id, seed: data.seed }; 
}

export async function submitRun(sessionId: string, actionLog: any): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions/submit/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, log: actionLog }),
  });
  
  if (!res.ok) throw new Error("Failed to submit run");
}

export async function runStatus(sessionId: string): Promise<RunStatus> {
  const res = await fetch(`${API_BASE}/sessions/status/?session_id=${sessionId}`);
  
  if (!res.ok) throw new Error("Failed to fetch status");
  
  return res.json();
}