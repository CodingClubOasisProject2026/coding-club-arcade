import { useCallback, useEffect, useMemo, useState } from 'react';
import './wordle.css';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const START_SECONDS = 120;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '↵zxcvbnm⌫'];

function getLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session_id') || '',
    seed: params.get('seed') || '',
  };
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

  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deadline, setDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(START_SECONDS);

  const validLaunch = Boolean(
    sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
      && /^\d+$/.test(seed),
  );
  const clockExpired = deadline !== null && timeLeft <= 0;
  const active = snapshot?.game_status === 'in_progress' && !loading && !clockExpired;

  const showApiState = useCallback((data) => {
    setSnapshot(data);
    setDraft('');
    const remaining = Math.max(0, Math.min(START_SECONDS, data.time_remaining ?? 0));
    setTimeLeft(remaining);
    setDeadline(Date.now() + remaining * 1000);
    if (data.game_status === 'time_up') {
      setNotice("Time's up! The game is over.");
    } else if (data.game_status === 'lost') {
      setNotice(`No words remain. The answer was ${data.answer?.toUpperCase() || 'unknown'}.`);
    } else if (data.game_status === 'cleared') {
      setNotice(`All words cleared! Final score: ${data.score}.`);
    } else if (data.missed) {
      setNotice(`Six misses — ${data.answer?.toUpperCase() || 'word'} was the answer. −20s; next word.`);
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
    postWordle('initialize', { session_id: sessionId, seed })
      .then((data) => {
        if (!cancelled) showApiState(data);
      })
      .catch((cause) => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [seed, sessionId, showApiState, validLaunch]);

  useEffect(() => {
    if (deadline === null) return undefined;
    const updateClock = () => {
      setTimeLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateClock();
    const interval = window.setInterval(updateClock, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    if (clockExpired && snapshot?.game_status === 'in_progress') {
      setNotice("Time's up! The game is over.");
    }
  }, [clockExpired, snapshot?.game_status]);

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
        guess: draft,
      });
      showApiState(data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  }, [active, draft, seed, sending, sessionId, showApiState]);

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
  const keyboardMarks = useMemo(() => {
    const marks = {};
    for (const row of rows) {
      for (let index = 0; index < row.word.length; index++) {
        const letter = row.word[index];
        const mark = row.mask[index];
        marks[letter] = Math.max(marks[letter] ?? -1, mark);
      }
    }
    return marks;
  }, [rows]);
  const attemptsLeft = snapshot?.attempts_left ?? MAX_ATTEMPTS;
  const healthPercent = Math.min(100, Math.max(0, (timeLeft / START_SECONDS) * 100));
  const timerText = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
  const message = error || notice || (loading ? 'Loading game…' : 'Type a guess or use the on-screen keyboard.');

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="hub-link" href="/">← Arcade hub</a>
        <div className="brand" aria-label="Wordle">
          {'WORDLE'.split('').map((letter, index) => (
            <span className={`brand-tile brand-${index % 3}`} key={`${letter}-${index}`}>{letter}</span>
          ))}
        </div>

      </header>

      {!validLaunch ? (
        <section className="notice-card" role="alert">
          <h1>Waiting for a game session</h1>
          <p>Open this page with the hub-provided session ID and seed:</p>
          <code className="launch-example">/play/wordle/?session_id=&lt;uuid&gt;&amp;seed=&lt;seed&gt;</code>
        </section>
      ) : (
        <>
          <section className="stats" aria-label="Game statistics">
            <div><span>Time</span><strong className={timeLeft <= 15 ? 'time-low' : ''}>{timerText}</strong></div>
            <div><span>Guesses left</span><strong>{attemptsLeft}</strong></div>
            <div><span>Score</span><strong>{snapshot?.score ?? 0}</strong></div>
          </section>
          <div className={`healthbar${timeLeft <= 15 ? ' healthbar-low' : ''}`} role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax={START_SECONDS} aria-valuenow={timeLeft}>
            <div className="healthbar-fill" style={{ width: `${healthPercent}%` }} />
          </div>

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
                        data-mark={keyboardMarks[key]}
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
    </main>
  );
}
