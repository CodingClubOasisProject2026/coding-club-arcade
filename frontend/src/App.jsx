import { useCallback, useEffect, useMemo, useState } from 'react';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '↵zxcvbnm⌫'];

function getLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session_id') || '',
    seed: params.get('seed') || '',
  };
}

function getStorageKey(sessionId, seed) {
  return `wordle:${sessionId}:${seed}`;
}

function readHistory(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(value) && value.every((guess) => typeof guess === 'string')
      ? value
      : [];
  } catch {
    return [];
  }
}

async function postWordle(path, payload) {
  const response = await fetch(`/wordle/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.guesses?.[0] || data.detail;
    throw new Error(detail || `Wordle API returned ${response.status}`);
  }
  return data;
}

function Tile({ letter = '', mark, cursor = false }) {
  return (
    <div className={`tile${cursor ? ' tile-cursor' : ''}`} data-mark={mark}>
      {letter}
    </div>
  );
}

export default function App() {
  const { sessionId, seed } = useMemo(getLaunchParams, []);
  const storageKey = useMemo(() => getStorageKey(sessionId, seed), [sessionId, seed]);
  const [history, setHistory] = useState(() => readHistory(storageKey));
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const validLaunch = Boolean(
    sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
      && /^\d+$/.test(seed),
  );
  const active = snapshot?.game_status === 'in_progress' && !loading;

  const showApiState = useCallback((data) => {
    setSnapshot(data);
    setDraft('');
    if (data.game_status === 'lost') {
      setNotice(`Game over — the answer was ${data.answer?.toUpperCase() || 'unknown'}.`);
    } else if (data.game_status === 'cleared') {
      setNotice(`All words cleared! Final score: ${data.score}.`);
    } else if (data.solved) {
      setNotice('Correct! On to the next word.');
    } else {
      setNotice('');
    }
  }, []);

  useEffect(() => {
    if (!validLaunch) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const saved = readHistory(storageKey);
    setHistory(saved);
    postWordle('initialize', { session_id: sessionId, seed, guesses: saved })
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setNotice(data.game_status === 'in_progress' ? '' : data.game_status === 'lost'
            ? `Game over — the answer was ${data.answer?.toUpperCase() || 'unknown'}.`
            : `All words cleared! Final score: ${data.score}.`);
        }
      })
      .catch((cause) => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seed, sessionId, storageKey, validLaunch]);

  const submitGuess = useCallback(async () => {
    if (!active || sending) return;
    if (draft.length !== WORD_LENGTH) {
      setError('Enter a five-letter word.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const data = await postWordle('guess', {
        session_id: sessionId,
        seed,
        guesses: history,
        guess: draft,
      });
      const nextHistory = [...history, draft];
      sessionStorage.setItem(storageKey, JSON.stringify(nextHistory));
      setHistory(nextHistory);
      showApiState(data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  }, [active, draft, history, seed, sending, sessionId, showApiState, storageKey]);

  const pressKey = useCallback((key) => {
    if (!active || sending) return;
    setError('');
    if (key === '↵' || key === 'Enter') {
      submitGuess();
    } else if (key === '⌫' || key === 'Backspace') {
      setDraft((value) => value.slice(0, -1));
    } else if (/^[a-z]$/i.test(key)) {
      setDraft((value) => value.length < WORD_LENGTH ? `${value}${key.toLowerCase()}` : value);
    }
  }, [active, sending, submitGuess]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter' || event.key === 'Backspace' || /^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        pressKey(event.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pressKey]);

  const rows = snapshot?.board || [];
  const attemptsLeft = snapshot?.attempts_left ?? MAX_ATTEMPTS;
  const message = error || notice || (loading ? 'Loading game…' : 'Type a guess or use the on-screen keyboard.');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Wordle">
          {'WORDLE'.split('').map((letter, index) => (
            <span className={`brand-tile brand-${index % 3}`} key={`${letter}-${index}`}>{letter}</span>
          ))}
        </div>
        <div className="session-badge" title={sessionId || 'No session id'}>
          Session <code>{sessionId ? `${sessionId.slice(0, 8)}…` : 'missing'}</code>
        </div>
      </header>

      {!validLaunch ? (
        <section className="notice-card" role="alert">
          <h1>Waiting for a game session</h1>
          <p>Open this page with the hub-provided session ID and seed:</p>
          <code className="launch-example">/?session_id=&lt;uuid&gt;&amp;seed=&lt;seed&gt;</code>
        </section>
      ) : (
        <>
          <section className="stats" aria-label="Game statistics">
            <div><span>Word</span><strong>{snapshot?.word_number ?? '—'} / {snapshot?.total_words ?? '—'}</strong></div>
            <div><span>Guesses left</span><strong>{attemptsLeft}</strong></div>
            <div><span>Score</span><strong>{snapshot?.score ?? 0}</strong></div>
          </section>

          <section className="game" aria-label="Wordle game">
            <div className="board" aria-live="polite">
              {Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
                const row = rows[rowIndex];
                const isCurrent = !row && rowIndex === rows.length && active;
                return (
                  <div className="guess-row" key={rowIndex}>
                    {Array.from({ length: WORD_LENGTH }, (_, colIndex) => (
                      <Tile
                        key={colIndex}
                        letter={row?.word?.[colIndex] || (isCurrent ? draft[colIndex] : '')}
                        mark={row?.mask?.[colIndex]}
                        cursor={Boolean(isCurrent && colIndex === draft.length && draft.length < WORD_LENGTH)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            <p className={`message${error ? ' message-error' : ''}`} role="status" aria-live="polite">
              {message}
            </p>

            <div className="keyboard" aria-label="On-screen keyboard">
              {KEY_ROWS.map((row) => (
                <div className="keyboard-row" key={row}>
                  {Array.from(row).map((key) => {
                    const special = key === '↵' || key === '⌫';
                    return (
                      <button
                        className={`key${special ? ' key-special' : ''}`}
                        key={key}
                        type="button"
                        disabled={!active || sending}
                        onClick={() => pressKey(key)}
                        aria-label={key === '↵' ? 'Submit guess' : key === '⌫' ? 'Delete letter' : key}
                      >
                        {key === '↵' ? 'Enter' : key === '⌫' ? '⌫' : key}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <button className="submit-button" type="button" disabled={!active || sending || draft.length !== WORD_LENGTH} onClick={submitGuess}>
              {sending ? 'Checking…' : 'Submit guess'}
            </button>
          </section>
        </>
      )}
      <footer>Green: correct spot · Yellow: in the word · Dark: not in the word</footer>
    </main>
  );
}
