import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './wordle.css';
import { HUB_URL, MAX_ATTEMPTS, MISS_PENALTY_SECONDS, START_SECONDS, RulesContent } from './WordleRules';
import Landing from './WordleLanding';
import { api, hubGameId, startHubSession } from '../../api';
import { useAuth } from '../../auth';

const WORD_LENGTH = 5;
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', '↵zxcvbnm⌫'];

const POPUP_MS = 3500;        // how long the floating "+15s" / "-20s" popups stay (keep in sync with the float-up animation in wordle.css)
const MIN_TIME_CHANGE = 3;    // time changes smaller than this (seconds) are treated as network jitter
const FLASH_MS = 1100;        // how long a solved word stays on screen before the board clears

const LEAVE_WARNING = 'Leaving now abandons this attempt. The clock does not pause while you are away.';
const TIME_UP_REVEAL_MS = 3000; // when time runs out, the answer stays visible this long before the result pop-up covers the screen

function getLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get('session_id') || '',
    seed: params.get('seed') || '',
  };
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidLaunch = (sessionId, seed) => Boolean(sessionId && SESSION_ID_PATTERN.test(sessionId) && /^\d+$/.test(seed));

function clearLaunchUrl() {
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    /* address bar could not be updated; the page still works */
  }
}

function setLaunchUrl({ sessionId, seed }) {
  try {
    const params = new URLSearchParams({ session_id: sessionId, seed });
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  } catch {
    /* address bar could not be updated; the page still works */
  }
}

// ---- Small localStorage helpers (never throw: storage can be blocked) ----
const startedKey = (id) => `wordle-started-${id}`;
const tallyKey = (id) => `wordle-tally-${id}`;
const gridsKey = (id) => `wordle-grids-${id}`;

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
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
  if (ended) {
    const answer = status === 'time_up' && snapshot?.answer ? String(snapshot.answer).toUpperCase() : '';
    return { title: 'Game ended', sub: answer ? `You ended the game. The word was ${answer}.` : 'You ended this attempt.' };
  }
  if (timeUp) {
    const answer = status === 'time_up' && snapshot?.answer ? String(snapshot.answer).toUpperCase() : '';
    return { title: "Time's up!", sub: answer ? `The word was ${answer}.` : 'The clock ran out.' };
  }
  return { title: 'Game over', sub: 'This attempt has ended.' };
}

// Every finished word's full grid, oldest first, for the game summary slider:
// { rows: [{ word, mask }], answer, status: 'solved' | 'missed' | 'timeup' | 'ended' }
function readGrids(sessionId) {
  try {
    const saved = JSON.parse(readStorage(gridsKey(sessionId)));
    return Array.isArray(saved) ? saved.filter((item) => Array.isArray(item?.rows)) : [];
  } catch {
    return [];
  }
}

// Marks a guess against the answer (2 = right spot, 1 = wrong spot, 0 = not in word) the way Wordle does.
// Used for the last row of a missed word, because the server clears the board when it moves on.
function scoreGuess(guess, answer) {
  const marks = Array(WORD_LENGTH).fill(0);
  const left = {};
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess[i] === answer[i]) marks[i] = 2;
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (marks[i] !== 2 && left[guess[i]] > 0) {
      marks[i] = 1;
      left[guess[i]] -= 1;
    }
  }
  return marks;
}

const GRID_FOOTERS = {
  solved: (answer) => `✓ ${answer}`,
  missed: (answer) => `Answer: ${answer}`,
  timeup: (answer) => (answer ? `Time's up · Answer: ${answer}` : "Time's up"),
  ended: (answer) => (answer ? `Game ended · Answer: ${answer}` : 'Game ended'),
};

// Game summary: the full guess grid of every word side by side. The word the player could not
// guess has its answer revealed at the bottom of its grid.
function SummarySlider({ items }) {
  const trackRef = useRef(null);

  // Start scrolled to the end so the last grid (the one that ended the game) is in view.
  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = track.scrollWidth;
  }, [items.length]);

  const slide = (direction) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * Math.max(150, track.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="summary">
      <div className="summary-head">
        <h3>Game summary</h3>
        {items.length > 2 && (
          <div className="summary-nav">
            <button type="button" aria-label="Earlier words" onClick={() => slide(-1)}>‹</button>
            <button type="button" aria-label="Later words" onClick={() => slide(1)}>›</button>
          </div>
        )}
      </div>
      <div className="summary-track" ref={trackRef} tabIndex={0} aria-label="Guess grids from this game">
        {items.map((item, index) => (
          <div className={`summary-card summary-${item.status}`} key={`${item.answer}-${index}`}>
            <span className="summary-count">Word {index + 1}</span>
            <div className="mini-grid">
              {Array.from({ length: MAX_ATTEMPTS }, (_, rowIndex) => {
                const row = item.rows[rowIndex];
                return (
                  <div className="mini-row" key={rowIndex}>
                    {Array.from({ length: WORD_LENGTH }, (_, colIndex) => (
                      <span className="mini-tile" data-mark={row?.mask?.[colIndex]} key={colIndex}>
                        {row?.word?.[colIndex] || ''}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
            <span className="summary-label">{GRID_FOOTERS[item.status](String(item.answer || '').toUpperCase())}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ letter = '', mark, cursor = false }) {
  return (
    <div className={`tile${cursor ? ' tile-cursor' : ''}`} data-mark={mark}>
      {letter}
    </div>
  );
}

function Wordle({ launch, onReplay, onHome }) {
  const { sessionId, seed } = launch;
  const validLaunch = isValidLaunch(sessionId, seed);

  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deadline, setDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(START_SECONDS);
  const [barMax, setBarMax] = useState(START_SECONDS); // the time bar scales to the most time the player has had
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayError, setReplayError] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState('hub'); // where "Leave" goes: the arcade hub or the Wordle landing page
  const [endOpen, setEndOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [ended, setEnded] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [tally, setTally] = useState(() => readTally(sessionId));
  const [summary, setSummary] = useState(() => readGrids(sessionId));
  const [popups, setPopups] = useState([]);
  const [shaking, setShaking] = useState(false);
  const [flash, setFlash] = useState(null); // { rows } - the solved word, shown briefly before the board clears
  const leavingRef = useRef(false);
  const popupId = useRef(0);
  const scoreSubmitted = useRef(false);

  const clockExpired = deadline !== null && timeLeft <= 0;
  const gameLive = snapshot?.game_status === 'in_progress' && !clockExpired && !ended;
  const active = gameLive && !loading && !leaveOpen && !endOpen && !helpOpen && !flash;
  const gameOver = Boolean(snapshot) && !gameLive;

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
      setNotice(data.answer ? `Time's up! The word was ${String(data.answer).toUpperCase()}.` : "Time's up! The game is over.");
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

  useEffect(() => {
    writeStorage(gridsKey(sessionId), JSON.stringify(summary));
  }, [sessionId, summary]);

  // This page only mounts after the player presses Play on the landing page, so the game starts right away.
  useEffect(() => {
    if (!validLaunch) {
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
  }, [retryCount, seed, sessionId, showApiState, validLaunch]);

  useEffect(() => {
    if (!gameOver || !validLaunch || !snapshot || scoreSubmitted.current) return;
    scoreSubmitted.current = true;
    api(`/sessions/submit/${sessionId}/`, { method: 'PUT', body: { actions: {} } })
      .catch((cause) => {
        scoreSubmitted.current = false;
        setError(`Could not submit your score: ${cause.message}`);
      });
  }, [gameOver, sessionId, snapshot, validLaunch]);

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
        const rows = [...previousRows, { word: draft, mask: Array(WORD_LENGTH).fill(2) }];
        setSummary((current) => [...current, { rows, answer: draft, status: 'solved' }]);
      } else if (data.missed || data.game_status === 'lost') {
        const answer = String(data.answer || '').toLowerCase();
        const rows = [...previousRows, { word: draft, mask: answer.length === WORD_LENGTH ? scoreGuess(draft, answer) : [] }];
        setSummary((current) => [...current, { rows, answer, status: 'missed' }]);
      }
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

  // Play again asks the backend for a brand-new session (same login). If that fails, say why and stay on the result pop-up.
  const handlePlayAgain = async () => {
    if (replayBusy) return;
    setReplayBusy(true);
    setReplayError('');
    try {
      await onReplay();
    } catch (cause) {
      setReplayError(cause.message);
      setReplayBusy(false);
    }
  };

  const handleHubClick = (event) => {
    if (gameLive) {
      event.preventDefault();
      setLeaveTarget('hub');
      setLeaveOpen(true);
    }
  };

  // Back to the Wordle landing page. A live game asks first, because leaving abandons it.
  const handleHomeClick = () => {
    if (gameLive) {
      setLeaveTarget('home');
      setLeaveOpen(true);
    } else {
      onHome();
    }
  };

  const confirmLeave = () => {
    if (leaveTarget === 'home') {
      setLeaveOpen(false);
      onHome();
      return;
    }
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
      if (data?.game_status) {
        showApiState(data);
        if (data.answer) setNotice(`Game ended. The word was ${String(data.answer).toUpperCase()}.`);
      }
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
  const healthPercent = Math.min(100, Math.max(0, (timeLeft / barMax) * 100));
  const timerText = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;
  const message = error || notice || (loading ? 'Loading game…' : 'Type a guess or use the on-screen keyboard.');
  const loadFailed = !loading && !snapshot && Boolean(error);
  const showResultModal = showResult && gameOver;
  const result = describeResult(snapshot, clockExpired || snapshot?.game_status === 'time_up', ended);
  // Only a server-confirmed "time_up" state carries the answer for the word the player was on.
  // (Earlier states can hold the previous word's answer, so they are never used here.)
  const revealAnswer = snapshot?.game_status === 'time_up' && snapshot.answer
    ? String(snapshot.answer).toLowerCase()
    : '';

  const score = snapshot?.score ?? 0;
  // Summary slider: the grid of every word from this game, plus the word in progress when the game ended
  // (its answer comes from the server with "time_up").
  const currentRows = snapshot?.board || []; // the server keeps the unfinished word's rows in its time_up reply too
  const finalGrid = (ended || timedOut) && (currentRows.length > 0 || revealAnswer)
    ? { rows: currentRows, answer: revealAnswer, status: ended ? 'ended' : 'timeup' }
    : null;
  const summaryItems = finalGrid ? [...summary, finalGrid] : summary;
  const solvedCount = snapshot?.words_solved ?? tally.solvedCount;
  const solvedText = String(solvedCount);

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
        <div className="top-left">
          <a className="hub-link" href={HUB_URL} onClick={handleHubClick}>← Arcade hub</a>
          <button className="home-button" type="button" onClick={handleHomeClick}>⌂ Home</button>
        </div>
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
        <div className="play-layout">
          <section className="stats" aria-label="Game statistics">
            <div className="stat-time"><span>Time</span><strong className={timeLeft <= 15 ? 'time-low' : ''}>{timerText}</strong>{popupsFor('time')}</div>
            <div className="stat-score"><span>Score</span><strong className="bump" key={score}>{score}</strong>{popupsFor('score')}</div>
            <div className="stat-solved"><span>Solved</span><strong className="bump" key={solvedText}>{solvedText}</strong></div>
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
            </div>
            {summaryItems.length > 0 && <SummarySlider items={summaryItems} />}
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
            {replayError && <p className="modal-error" role="alert">{replayError}</p>}
            <button className="modal-primary" type="button" autoFocus disabled={replayBusy} onClick={handlePlayAgain}>
              {replayBusy ? 'Starting…' : 'Play again'}
            </button>
            <a className="modal-link" href={HUB_URL}>Back to arcade hub</a>
          </section>
        </div>
      )}
    </main>
  );
}

async function createWordleSession() {
  const gameId = await hubGameId('WORDLE', Number(import.meta.env.VITE_WORDLE_GAME_ID ?? 4));
  const session = await startHubSession(gameId);
  return { sessionId: session.id, seed: String(session.seed) };
}

export default function WordlePage() {
  const { me, refresh } = useAuth();
  const [launch, setLaunch] = useState(getLaunchParams);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  // A game that was already started (page reload) goes straight back to the board, because the server clock is running.
  // Everyone else lands on the welcome page first.
  const [screen, setScreen] = useState(() => {
    const initial = getLaunchParams();
    return isValidLaunch(initial.sessionId, initial.seed) && readStorage(startedKey(initial.sessionId)) === '1'
      ? 'game'
      : 'landing';
  });

  // Create a ticket-backed hub session only after the player presses Play.
  const play = useCallback(async () => {
    if (starting) return;
    setStartError('');
    if (isValidLaunch(launch.sessionId, launch.seed) && readStorage(startedKey(launch.sessionId)) !== '1') {
      writeStorage(startedKey(launch.sessionId), '1');
      setScreen('game');
      return;
    }
    setStarting(true);
    try {
      const next = await createWordleSession();
      await refresh();
      writeStorage(startedKey(next.sessionId), '1');
      setLaunchUrl(next);
      setLaunch(next);
      setScreen('game');
    } catch (cause) {
      setStartError(cause.message);
    } finally {
      setStarting(false);
    }
  }, [launch, refresh, starting]);

  // Play again: a new session from the backend, same page. The key remounts the game, so every
  // piece of state (board, clock, pop-ups) starts clean and late replies from the old game are ignored.
  // Errors are thrown to the Play again button, which shows them.
  const replay = useCallback(async () => {
    const next = await createWordleSession();
    await refresh();
    writeStorage(startedKey(next.sessionId), '1');
    setLaunchUrl(next);
    setLaunch(next);
  }, [refresh]);

  // Home returns to the landing page. The next Play requests a fresh hub session.
  const goHome = useCallback(() => {
    clearLaunchUrl();
    setLaunch({ sessionId: '', seed: '' });
    setStartError('');
    setScreen('landing');
  }, []);

  if (screen === 'landing' || me?.authenticated !== true) {
    return <Landing me={me} onPlay={play} busy={starting} error={startError} />;
  }
  return <Wordle key={launch.sessionId} launch={launch} onReplay={replay} onHome={goHome} />;
}