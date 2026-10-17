import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './wordle.css';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const START_SECONDS = 120;
const MISS_PENALTY_SECONDS = 20;
// These mirror backend/wordle/engine.py and views.py. If the backend numbers change, change them here too.
const POINTS_PER_GREEN = 5;
const SECONDS_PER_GREEN = 5;
const SOLVE_POINTS = 30;
const SOLVE_SECONDS = 15;
const MISS_PENALTY_POINTS = 20;
const MAX_SECONDS = 120;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '↵zxcvbnm⌫'];
const HUB_URL = '/';

const POPUP_MS = 3500;        // how long the floating "+15s" / "-20s" popups stay (keep in sync with the float-up animation in wordle.css)
const MIN_TIME_CHANGE = 3;    // time changes smaller than this (seconds) are treated as network jitter
const FLASH_MS = 1100;        // how long a solved word stays on screen before the board clears

// One row per number of green tiles in a single guess. Five greens means the word is solved.
const SCORE_ROWS = Array.from({ length: WORD_LENGTH + 1 }, (_, greens) => {
  const solved = greens === WORD_LENGTH;
  return {
    greens,
    solved,
    points: greens * POINTS_PER_GREEN + (solved ? SOLVE_POINTS : 0),
    seconds: greens * SECONDS_PER_GREEN + (solved ? SOLVE_SECONDS : 0),
  };
});
const formatClock = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

// Text shown in the pop-ups. Edit these so they match the backend rules.
const RULES = [
  `You start with ${START_SECONDS / 60} minutes. The clock does not pause.`,
  `Guess each five-letter word in ${MAX_ATTEMPTS} tries, then move on to the next one.`,
  `Every green tile earns +${POINTS_PER_GREEN} points and +${SECONDS_PER_GREEN} seconds.`,
  `Solving a word adds +${SOLVE_POINTS} points and +${SOLVE_SECONDS} seconds on top.`,
];
const PENALTIES = [
  `Use all ${MAX_ATTEMPTS} guesses without solving a word: −${MISS_PENALTY_POINTS} points and −${MISS_PENALTY_SECONDS}s, then the next word.`,
  'Time reaches zero: the game ends.',
  'Leaving mid-game abandons this attempt.',
];
const LEGEND = [
  { mark: 2, label: 'Right spot' },
  { mark: 1, label: 'Wrong spot' },
  { mark: 0, label: 'Not in word' },
];
const LEAVE_WARNING = 'Leaving now abandons this attempt. The clock does not pause while you are away.';
const TIME_UP_REVEAL_MS = 3000; // when time runs out, the answer stays visible this long before the result pop-up covers the screen

function getLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session_id') || '',
    seed: params.get('seed') || '',
  };
}

// "Play again" starts a fresh game on this same page: a new session_id + seed are sent to /wordle/initialize.
function newSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Fallback (version 4 UUID) for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function newSeed() {
  const buffer = new Uint32Array(1);
  window.crypto.getRandomValues(buffer);
  return String(buffer[0] >>> 1); // 0 .. 2^31 - 1
}

// ---- Small localStorage helpers (never throw: storage can be blocked) ----
const ATTEMPTS_KEY = 'wordle-attempts';
const startedKey = (id) => `wordle-started-${id}`;
const tallyKey = (id) => `wordle-tally-${id}`;

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// Gives every new session_id the next attempt number on this browser (1, 2, 3 ...).
// If the backend ever sends `attempt_number`, that value is used instead (see Wordle).
function registerAttempt(sessionId) {
  try {
    const saved = JSON.parse(readStorage(ATTEMPTS_KEY)) || {};
    const map = saved.map || {};
    let count = saved.count || 0;
    if (!map[sessionId]) {
      count += 1;
      map[sessionId] = count;
    }
    const recent = Object.entries(map).sort((a, b) => a[1] - b[1]).slice(-20);
    writeStorage(ATTEMPTS_KEY, JSON.stringify({ count, map: Object.fromEntries(recent) }));
    return map[sessionId];
  } catch {
    return 1;
  }
}

// Running totals for the score breakdown. Everything here is read from what the server
// reports after each guess (score and time deltas), so it always matches the real rules.
const EMPTY_TALLY = { guessPts: 0, solvedPts: 0, solvedCount: 0, timeGained: 0, timeLost: 0 };

function readTally(sessionId) {
  try {
    return { ...EMPTY_TALLY, ...JSON.parse(readStorage(tallyKey(sessionId))) };
  } catch {
    return { ...EMPTY_TALLY };
  }
}

const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

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

function describeResult(snapshot, timeUp, ended) {
  const status = snapshot?.game_status;
  if (status === 'cleared') return { title: 'All words cleared!', sub: 'A perfect run. Nicely done.' };
  if (status === 'lost') {
    return {
      title: 'Out of words',
      sub: snapshot.answer ? `The last word was ${snapshot.answer.toUpperCase()}.` : 'No words remain.',
    };
  }
  if (ended) return { title: 'Game ended', sub: 'You ended this attempt.' };
  if (timeUp) {
    const answer = status === 'time_up' && snapshot?.answer ? String(snapshot.answer).toUpperCase() : '';
    return { title: "Time's up!", sub: answer ? `The word was ${answer}.` : 'The clock ran out.' };
  }
  return { title: 'Game over', sub: 'This attempt has ended.' };
}

function Tile({ letter = '', mark, cursor = false }) {
  return (
    <div className={`tile${cursor ? ' tile-cursor' : ''}`} data-mark={mark}>
      {letter}
    </div>
  );
}

// Grid showing what one guess is worth, built from the constants above so it never drifts from the rules text.
function ScoringGrid() {
  return (
    <div className="score-grid" aria-label="Scoring per guess">
      <h3>Scoring per guess</h3>
      <div className="score-grid-head">
        <span>Green tiles</span>
        <span>Points</span>
        <span>Time</span>
      </div>
      {SCORE_ROWS.map((row) => (
        <div className={`score-grid-row${row.solved ? ' score-grid-solved' : ''}`} key={row.greens}>
          <span className="mini-tiles" aria-label={`${row.greens} green tiles`}>
            {Array.from({ length: WORD_LENGTH }, (_, index) => (
              <i key={index} data-mark={index < row.greens ? 2 : 0} />
            ))}
          </span>
          <b className="pts">+{row.points}</b>
          <b className="secs">+{row.seconds}s</b>
        </div>
      ))}
      <div className="score-grid-row score-grid-miss">
        <span className="miss-label">Word missed ({MAX_ATTEMPTS} guesses)</span>
        <b className="pts bad">−{MISS_PENALTY_POINTS}</b>
        <b className="secs bad">−{MISS_PENALTY_SECONDS}s</b>
      </div>
      <p className="score-grid-note">
        Greens count on every guess, even letters you already found. Five greens solves the word and includes the
        +{SOLVE_POINTS} point, +{SOLVE_SECONDS}s bonus. Time never goes above {formatClock(MAX_SECONDS)} and your score never drops below 0.
      </p>
    </div>
  );
}

// Rules + penalties, shared by the "before you start" pop-up and the "?" button.
function RulesContent() {
  return (
    <>
      <ul className="rules-list">
        {RULES.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
      <div className="legend" aria-label="Tile colours">
        {LEGEND.map((item) => (
          <span className="legend-item" key={item.mark}>
            <i className="legend-chip" data-mark={item.mark} />
            {item.label}
          </span>
        ))}
      </div>
      <ScoringGrid />
      <div className="penalty-box">
        <h3>Penalties</h3>
        <ul className="rules-list">
          {PENALTIES.map((penalty) => <li key={penalty}>{penalty}</li>)}
        </ul>
      </div>
    </>
  );
}

function Wordle({ launch, onReplay }) {
  const { sessionId, seed } = launch;
  const validLaunch = Boolean(
    sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    && /^\d+$/.test(seed),
  );

  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deadline, setDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(START_SECONDS);
  const [barMax, setBarMax] = useState(START_SECONDS); // the time bar scales to the most time the player has had
  // The rules pop-up shows until the player clicks OK. A game that was already started
  // (page reload) skips it, because the server clock is already running.
  const [started, setStarted] = useState(() => validLaunch && readStorage(startedKey(sessionId)) === '1');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [ended, setEnded] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [localAttempt] = useState(() => (validLaunch ? registerAttempt(sessionId) : 1));
  const [tally, setTally] = useState(() => readTally(sessionId));
  const [popups, setPopups] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [flash, setFlash] = useState(null); // { rows } - the solved word, shown briefly before the board clears
  const leavingRef = useRef(false);
  const popupId = useRef(0);

  const clockExpired = deadline !== null && timeLeft <= 0;
  const gameLive = snapshot?.game_status === 'in_progress' && !clockExpired && !ended;
  const active = gameLive && !loading && !leaveOpen && !endOpen && !helpOpen && !flash;
  const gameOver = Boolean(snapshot) && !gameLive;
  const attemptNumber = Number(snapshot?.attempt_number) || localAttempt;

  const pushPopup = useCallback((target, text, tone) => {
    const id = popupId.current + 1;
    popupId.current = id;
    setPopups((list) => [...list, { id, target, text, tone }]);
    window.setTimeout(() => setPopups((list) => list.filter((item) => item.id !== id)), POPUP_MS);
  }, []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 450);
  }, []);

  const showApiState = useCallback((data) => {
    setSnapshot(data);
    setDraft('');
    const remaining = Math.max(0, data.time_remaining ?? 0);
    setTimeLeft(remaining);
    setDeadline(Date.now() + remaining * 1000);
    setBarMax((max) => Math.max(max, remaining));
    if (data.game_status === 'time_up') {
      setNotice("Time's up! The game is over.");
    } else if (data.game_status === 'lost') {
      setNotice(`No words remain. The answer was ${data.answer?.toUpperCase() || 'unknown'}.`);
    } else if (data.game_status === 'cleared') {
      setNotice(`All words cleared! Final score: ${data.score}.`);
    } else if (data.missed) {
      setNotice(`Six misses — ${data.answer?.toUpperCase() || 'word'} was the answer. −${MISS_PENALTY_SECONDS}s; next word.`);
    } else if (data.solved) {
      setNotice('Correct! On to the next word.');
    } else {
      setNotice('');
    }
  }, []);

  // Works out what a guess changed (points and seconds) from the server's numbers, shows the
  // floating popups and adds it to the running totals used by the score breakdown.
  const recordChange = useCallback((data, scoreBefore, expectedSeconds) => {
    const scoreDelta = (data.score ?? 0) - scoreBefore;
    let timeDelta = 0;
    if (expectedSeconds !== null && data.game_status !== 'time_up') {
      const raw = Math.round((data.time_remaining ?? 0) - expectedSeconds);
      if (Math.abs(raw) >= MIN_TIME_CHANGE) timeDelta = raw;
    }
    if (scoreDelta !== 0) pushPopup('score', signed(scoreDelta), scoreDelta > 0 ? 'score' : 'bad');
    if (timeDelta !== 0) pushPopup('time', `${signed(timeDelta)}s`, timeDelta > 0 ? 'good' : 'bad');
    setTally((current) => ({
      guessPts: current.guessPts + (data.solved ? 0 : scoreDelta),
      solvedPts: current.solvedPts + (data.solved ? scoreDelta : 0),
      solvedCount: current.solvedCount + (data.solved ? 1 : 0),
      timeGained: current.timeGained + (timeDelta > 0 ? timeDelta : 0),
      timeLost: current.timeLost + (timeDelta < 0 ? -timeDelta : 0),
    }));
  }, [pushPopup]);

  useEffect(() => {
    writeStorage(tallyKey(sessionId), JSON.stringify(tally));
  }, [sessionId, tally]);

  // The game (and the server clock) only starts after the player clicks OK on the rules.
  useEffect(() => {
    if (!validLaunch || !started) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    postWordle('initialize', { session_id: sessionId, seed })
      .then((data) => {
        if (!cancelled) showApiState(data);
      })
      .catch((cause) => { if (!cancelled) setError(cause.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retryCount, seed, sessionId, showApiState, started, validLaunch]);

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

  // When the clock hits zero on the page, ask the server for the final state. /wordle/initialize
  // restores the session and reports "time_up" along with the answer to the word the player was on.
  // Only a finished state is applied, so a clock that is a hair ahead of the server never ends the
  // game early; in that case it simply checks again a second later.
  useEffect(() => {
    if (!clockExpired || ended || snapshot?.game_status !== 'in_progress') return undefined;
    let cancelled = false;
    let timer;
    const check = () => {
      postWordle('initialize', { session_id: sessionId, seed })
        .then((data) => {
          if (cancelled) return;
          if (data?.game_status && data.game_status !== 'in_progress') showApiState(data);
          else timer = window.setTimeout(check, 1000);
        })
        .catch(() => { /* network error: the page still shows that time is up */ });
    };
    check();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [clockExpired, ended, seed, sessionId, showApiState, snapshot?.game_status]);

  // Warn before closing / reloading the tab while a game is live.
  useEffect(() => {
    if (!gameLive) return undefined;
    const onBeforeUnload = (event) => {
      if (leavingRef.current) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [gameLive]);

  // If the game ends while a confirm / help pop-up is open, close it.
  useEffect(() => {
    if (!gameLive) {
      setLeaveOpen(false);
      setEndOpen(false);
      setHelpOpen(false);
    }
  }, [gameLive]);

  // Give the player a moment to see the last row before the result pop-up.
  const timedOut = !ended && (snapshot?.game_status === 'time_up' || clockExpired);
  const resultDelay = snapshot?.game_status === 'cleared'
    ? FLASH_MS + 200
    : timedOut ? TIME_UP_REVEAL_MS : 700;
  useEffect(() => {
    if (!gameOver) {
      setShowResult(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowResult(true), resultDelay);
    return () => window.clearTimeout(timer);
  }, [gameOver, resultDelay]);

  const submitGuess = useCallback(async () => {
    if (!active || sending) return;
    if (draft.length !== WORD_LENGTH) {
      setError('Enter a five-letter word.');
      triggerShake();
      return;
    }
    setSending(true);
    setError('');
    const scoreBefore = snapshot?.score ?? 0;
    const previousRows = snapshot?.board || [];
    try {
      const data = await postWordle('guess', {
        session_id: sessionId,
        seed,
        guess: draft,
      });
      // Compare with the clock as it was *before* this reply updates it.
      const expectedSeconds = deadline === null ? null : Math.max(0, (deadline - Date.now()) / 1000);
      showApiState(data);
      recordChange(data, scoreBefore, expectedSeconds);
      if (data.solved) {
        // The server clears the board when a word is solved; keep the winning row visible for a moment.
        setFlash({ rows: [...previousRows, { word: draft, mask: Array(WORD_LENGTH).fill(2) }] });
        window.setTimeout(() => setFlash(null), FLASH_MS);
      }
    } catch (cause) {
      setError(cause.message);
      triggerShake();
    } finally {
      setSending(false);
    }
  }, [active, deadline, draft, recordChange, seed, sending, sessionId, showApiState, snapshot, triggerShake]);

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
      // Let buttons inside the pop-ups work with Enter / Space.
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      if (event.key === 'Enter' || event.key === 'Backspace' || /^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        pressKey(event.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pressKey]);

  const beginGame = () => {
    writeStorage(startedKey(sessionId), '1');
    setStarted(true);
  };

  const handleHubClick = (event) => {
    if (gameLive) {
      event.preventDefault();
      setLeaveOpen(true);
    }
  };

  const confirmLeave = () => {
    leavingRef.current = true;
    window.location.assign(HUB_URL);
  };

  // Ends the attempt right away on the page, then tells the server (best effort).
  // Works even if a guess request is stuck, so the player is never trapped in a broken game.
  const endGame = async () => {
    setEndOpen(false);
    setEnded(true);
    try {
      const data = await postWordle('finish', { session_id: sessionId, seed });
      if (data?.game_status) showApiState(data);
    } catch {
      /* the page still ends the game even if the server has no finish call */
    }
  };

  const rows = flash ? flash.rows : (snapshot?.board || []);
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
  const healthPercent = Math.min(100, Math.max(0, (timeLeft / barMax) * 100));
  const timerText = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
  const message = error || notice || (loading ? 'Loading game…' : 'Type a guess or use the on-screen keyboard.');
  const showRules = validLaunch && !started;
  const loadFailed = started && !loading && !snapshot && Boolean(error);
  const showResultModal = showResult && gameOver;
  const result = describeResult(snapshot, clockExpired || snapshot?.game_status === 'time_up', ended);
  // Only a server-confirmed "time_up" state carries the answer for the word the player was on.
  // (Earlier states can hold the previous word's answer, so they are never used here.)
  const revealAnswer = snapshot?.game_status === 'time_up' && snapshot.answer
    ? String(snapshot.answer).toLowerCase()
    : '';

  const score = snapshot?.score ?? 0;
  const solvedCount = snapshot?.words_solved ?? tally.solvedCount;
  const solvedText = snapshot?.total_words ? `${solvedCount}/${snapshot.total_words}` : String(solvedCount);

  // Score breakdown rows (only non-zero ones). "Other" keeps the rows adding up to the real score.
  const other = score - tally.solvedPts - tally.guessPts;
  const breakdownRows = [
    tally.solvedCount > 0 || tally.solvedPts !== 0 ? { label: `Solved words (${tally.solvedCount})`, value: tally.solvedPts } : null,
    tally.guessPts !== 0 ? { label: 'Points from guesses', value: tally.guessPts } : null,
    other !== 0 ? { label: 'Other', value: other } : null,
  ].filter(Boolean);
  const showBreakdown = breakdownRows.length > 0 || tally.timeGained > 0 || tally.timeLost > 0;

  const popupsFor = (target) => popups.filter((item) => item.target === target).map((item) => (
    <em className={`float-pop float-${item.tone}`} key={item.id} aria-hidden="true">{item.text}</em>
  ));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="hub-link" href={HUB_URL} onClick={handleHubClick}>← Arcade hub</a>
        <div className="brand" aria-label="Wordle">
          {'WORDLE'.split('').map((letter, index) => (
            <span className={`brand-tile brand-${index % 3}`} key={`${letter}-${index}`}>{letter}</span>
          ))}
        </div>
        {gameLive && (
          <div className="top-actions">
            <button className="help-button" type="button" aria-label="Show the rules" onClick={() => setHelpOpen(true)}>?</button>
            <button className="end-button" type="button" onClick={() => setEndOpen(true)}>End game</button>
          </div>
        )}
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
            <div className="stat-time"><span>Time</span><strong className={timeLeft <= 15 ? 'time-low' : ''}>{timerText}</strong>{popupsFor('time')}</div>
            <div className="stat-score"><span>Score</span><strong className="bump" key={score}>{score}</strong>{popupsFor('score')}</div>
            <div className="stat-solved"><span>Solved</span><strong className="bump" key={solvedText}>{solvedText}</strong></div>
            <div><span>Guesses left</span><strong>{attemptsLeft}</strong></div>
          </section>
          <div className={`healthbar${timeLeft <= 15 ? ' healthbar-low' : ''}`} role="progressbar" aria-label="Time remaining" aria-valuemin="0" aria-valuemax={barMax} aria-valuenow={timeLeft}>
            <div className="healthbar-fill" style={{ width: `${healthPercent}%` }} />
          </div>

          <section className="game" aria-label="Wordle game">
            <div className="board" aria-live="polite">
              {Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
                const row = rows[rowIndex];
                const isCurrent = !row && rowIndex === rows.length && active;
                return (
                  <div className={`guess-row${isCurrent && shaking ? ' shake' : ''}`} key={rowIndex}>
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

            {revealAnswer && (
              <div className="reveal" role="status">
                <span className="reveal-label">Time's up. The word was</span>
                <div className="reveal-tiles">
                  {Array.from(revealAnswer).map((letter, index) => (
                    <div
                      className="tile reveal-tile"
                      data-mark="2"
                      key={`${letter}-${index}`}
                      style={{ animationDelay: `${index * 140}ms` }}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
              </div>
            )}

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

      {/* Rules + penalties: shown before the game (and the clock) begins */}
      {showRules && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            {attemptNumber > 1 && <span className="modal-badge">Attempt #{attemptNumber}</span>}
            <h2 id="rules-title">Before you start</h2>
            <p className="modal-sub">The clock starts when you press OK.</p>
            <RulesContent />
            <button className="modal-primary" type="button" autoFocus onClick={beginGame}>OK, start game</button>
            <a className="modal-link" href={HUB_URL}>Back to arcade hub</a>
          </section>
        </div>
      )}

      {/* The "?" button: the same rules, mid-game */}
      {helpOpen && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <h2 id="help-title">How it works</h2>
            <p className="modal-sub">The clock keeps running while you read this.</p>
            <RulesContent />
            <button className="modal-primary" type="button" autoFocus onClick={() => setHelpOpen(false)}>Got it</button>
          </section>
        </div>
      )}

      {/* The game could not be started (server error, unknown session, network) */}
      {loadFailed && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="fail-title">
            <h2 id="fail-title">Couldn't start the game</h2>
            <p className="modal-sub">{error}</p>
            <div className="modal-actions modal-actions-row">
              <button className="modal-primary" type="button" autoFocus onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
              <a className="modal-secondary" href={HUB_URL}>Arcade hub</a>
            </div>
          </section>
        </div>
      )}

      {/* Warning before leaving a live game */}
      {leaveOpen && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="leave-title">
            <h2 id="leave-title">Leave this game?</h2>
            <p className="modal-sub">{LEAVE_WARNING}</p>
            <div className="modal-actions modal-actions-row">
              <button className="modal-primary" type="button" autoFocus onClick={() => setLeaveOpen(false)}>Keep playing</button>
              <button className="modal-danger" type="button" onClick={confirmLeave}>Leave</button>
            </div>
          </section>
        </div>
      )}

      {/* Confirm before ending the game early */}
      {endOpen && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="end-title">
            <h2 id="end-title">End this game?</h2>
            <p className="modal-sub">This ends your attempt now and you can't resume it. Your score so far is {score}.</p>
            <div className="modal-actions modal-actions-row">
              <button className="modal-primary" type="button" autoFocus onClick={() => setEndOpen(false)}>Keep playing</button>
              <button className="modal-danger" type="button" onClick={endGame}>End game</button>
            </div>
          </section>
        </div>
      )}

      {/* Result + score breakdown + Play again */}
      {showResultModal && (
        <div className="overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <h2 id="result-title">{result.title}</h2>
            <p className="modal-sub">{result.sub}</p>
            <div className="result-stats">
              <div><span>Score</span><strong>{score}</strong></div>
              <div><span>Attempt</span><strong>#{attemptNumber}</strong></div>
            </div>
            {showBreakdown && (
              <div className="breakdown">
                <h3>Score breakdown</h3>
                <dl>
                  {breakdownRows.map((item) => (
                    <div key={item.label}><dt>{item.label}</dt><dd>{signed(item.value)}</dd></div>
                  ))}
                </dl>
                {(tally.timeGained > 0 || tally.timeLost > 0) && (
                  <p className="breakdown-time">
                    Time:
                    {tally.timeGained > 0 && <> <span className="good">+{tally.timeGained}s</span> earned</>}
                    {tally.timeGained > 0 && tally.timeLost > 0 && ' ·'}
                    {tally.timeLost > 0 && <> <span className="bad">−{tally.timeLost}s</span> lost</>}
                  </p>
                )}
              </div>
            )}
            <button className="modal-primary" type="button" autoFocus onClick={() => onReplay()}>Play again</button>
            <p className="modal-hint">Your next run will be attempt #{attemptNumber + 1}.</p>
            <a className="modal-link" href={HUB_URL}>Back to arcade hub</a>
          </section>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [launch, setLaunch] = useState(getLaunchParams);

  // Play again: fresh session_id + seed, same page. The key remounts the game, so every
  // piece of state (board, clock, pop-ups) starts clean and late replies from the old game are ignored.
  const replay = useCallback(() => {
    const next = { sessionId: newSessionId(), seed: newSeed() };
    try {
      const params = new URLSearchParams({ session_id: next.sessionId, seed: next.seed });
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    } catch {
      /* address bar could not be updated; the game still restarts */
    }
    setLaunch(next);
  }, []);

  return <Wordle key={launch.sessionId} launch={launch} onReplay={replay} />;
}