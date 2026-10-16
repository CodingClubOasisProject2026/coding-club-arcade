import { useEffect, useState } from 'react';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data);
    throw new Error(detail || `Hub request failed (${response.status})`);
  }
  return data;
}

function basicAuth(username, password) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `Basic ${btoa(binary)}`;
}

export default function HubHome() {
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/games/')
      .then(readResponse)
      .then((data) => { if (!cancelled) setGames(data.results || data); })
      .catch((cause) => { if (!cancelled) setError(`Could not load arcade games: ${cause.message}`); })
      .finally(() => { if (!cancelled) setLoadingGames(false); });
    return () => { cancelled = true; };
  }, []);

  const launchWordle = async (event) => {
    event.preventDefault();
    if (launching) return;
    setLaunching(true);
    setError('');
    try {
      const wordle = games.find((game) => game.name.toLowerCase() === 'wordle');
      if (!wordle) throw new Error('The hub has not been seeded with Wordle yet.');
      if (!username || !password) throw new Error('Enter your hub username and password.');

      const response = await fetch(`/sessions/start/${wordle.id}/`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          Authorization: basicAuth(username, password),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const session = await readResponse(response);
      const launch = new URL('/play/wordle/', window.location.origin);
      launch.searchParams.set('session_id', session.id);
      launch.searchParams.set('seed', String(session.seed));
      window.location.assign(launch.toString());
    } catch (cause) {
      setError(cause.message);
      setLaunching(false);
    }
  };

  return (
    <main className="hub-shell">
      <header className="hub-header">
        <div className="hub-mark" aria-hidden="true">CC</div>
        <div>
          <p className="eyebrow">CODING CLUB</p>
          <h1>Arcade</h1>
        </div>
      </header>

      <section className="hub-intro">
        <p className="eyebrow">PICK YOUR GAME</p>
        <h2>A little play between big ideas.</h2>
        <p>Choose a game below. Your hub account starts a session and supplies its seed to the game.</p>
      </section>

      {error && <p className="hub-error" role="alert">{error}</p>}
      {loadingGames ? (
        <p className="hub-muted">Loading games…</p>
      ) : (
        <section className="game-grid" aria-label="Arcade games">
          {games.map((game) => {
            const isWordle = game.name.toLowerCase() === 'wordle';
            return (
              <article className={`game-card${isWordle ? ' game-card-featured' : ''}`} key={game.id}>
                <div className={`game-icon game-icon-${game.name.toLowerCase()}`} aria-hidden="true">
                  {game.name.slice(0, 1)}
                </div>
                <div className="game-card-copy">
                  <p className="eyebrow">ARCADE GAME</p>
                  <h3>{game.name[0]}{game.name.slice(1).toLowerCase()}</h3>
                  <p>{isWordle ? 'Guess the hidden five-letter word before time runs out.' : 'This game will be available here soon.'}</p>
                </div>
                {!isWordle && <span className="coming-soon">Coming soon</span>}
              </article>
            );
          })}
          {!games.length && <p className="hub-muted">No games are configured in the hub yet.</p>}
        </section>
      )}

      <section className="launch-panel">
        <div>
          <p className="eyebrow">START A SESSION</p>
          <h2>Ready for Wordle?</h2>
          <p>Sign in with your hub account. Credentials are used for this request only and aren’t saved by the page.</p>
        </div>
        <form className="hub-login" onSubmit={launchWordle}>
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <button className="hub-button" type="submit" disabled={launching || loadingGames || !games.some((game) => game.name.toLowerCase() === 'wordle')}>
            {launching ? 'Starting session…' : 'Play Wordle'}
          </button>
          <p className="hub-security-note">Use HTTPS outside local development.</p>
        </form>
      </section>

      <footer className="hub-footer">Coding Club Arcade · More games on the way</footer>
    </main>
  );
}
