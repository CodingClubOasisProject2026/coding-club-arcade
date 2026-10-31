import { useEffect, useState } from 'react';
import GoogleSignIn from '../../GoogleSignIn';
import { HubLink } from '../../loader/HubTransition';
import {
    HUB_URL,
    RulesContent,
    MAX_ATTEMPTS,
    START_SECONDS,
    POINTS_PER_GREEN,
    SECONDS_PER_GREEN,
    SOLVE_POINTS,
    SOLVE_SECONDS,
    MAX_SOLVE_TIME_BONUS_SECONDS,
    MISS_PENALTY_POINTS,
    MISS_PENALTY_SECONDS,
} from './WordleRules';

// The page players land on when they click Fastfind in the arcade hub.
// (All landing styles live in wordle.css.)
// Same visual language as the hub home page (kicker, pixel heading, square bordered cards, yellow accent),
// plus a live demo board that plays itself so the page feels alive.

// Demo: target word PIXEL. g = green, y = yellow, b = absent.
const DEMO = [
    { word: 'CRANE', marks: 'bbbby' },
    { word: 'LIKED', marks: 'ygbgb' },
    { word: 'PIXEL', marks: 'ggggg' },
];
const ROW_TICKS = 14; // ticks per row: type 5 letters, pause, flip 5 tiles
const CYCLE_TICKS = ROW_TICKS * DEMO.length + 18; // + hold on the solved board
const TICK_MS = 140;

const TICKER = ['BEAT THE CLOCK', 'CRACK WORDS', 'STACK POINTS', 'CLIMB THE LEADERBOARD', 'NO PAUSE BUTTON'];

const clock = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

function useDemoTick() {
    const reduced = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const [tick, setTick] = useState(reduced ? ROW_TICKS * DEMO.length + 4 : 0);
    useEffect(() => {
        if (reduced) return undefined;
        const id = setInterval(() => setTick((t) => (t + 1) % CYCLE_TICKS), TICK_MS);
        return () => clearInterval(id);
    }, [reduced]);
    return tick;
}

function DemoBoard() {
    const tick = useDemoTick();
    let greens = 0;
    const greenLetters = new Set();
    let solved = false;

    const rows = Array.from({ length: MAX_ATTEMPTS }, (_, r) => {
        const guess = DEMO[r];
        const local = tick - r * ROW_TICKS;
        const letters = guess && local >= 0 ? Math.min(local + 1, 5) : 0;
        const flipped = guess && local >= 7 ? Math.min(local - 6, 5) : 0;
        if (guess) {
            greens += guess.marks.slice(0, flipped).split('').filter((m) => m === 'g').length;
            for (let column = 0; column < flipped; column += 1) {
                if (guess.marks[column] === 'g') greenLetters.add(guess.word[column]);
            }
            if (flipped === 5 && guess.marks === 'ggggg') solved = true;
        }
        return Array.from({ length: 5 }, (_, c) => ({
            letter: guess && c < letters ? guess.word[c] : '',
            mark: guess && c < flipped ? guess.marks[c] : '',
        }));
    });

    const pendingScore = solved ? 0 : greens * POINTS_PER_GREEN;
    const score = solved ? greens * POINTS_PER_GREEN + SOLVE_POINTS : 0;
    const greenTime = greenLetters.size * SECONDS_PER_GREEN;
    const rawTime = START_SECONDS - Math.floor((tick * TICK_MS) / 1000 * 2)
        + (solved ? Math.min(MAX_SOLVE_TIME_BONUS_SECONDS, greenTime + SOLVE_SECONDS) : greenTime);
    // Never show more than the 2:00 the real game starts with, however many bonuses stack up.
    const timeLeft = Math.min(START_SECONDS, Math.max(0, rawTime));
    const pct = (timeLeft / START_SECONDS) * 100;

    return (
        <div className="lp-demo" aria-hidden="true">
            <div className="lp-hud">
                <div>
                    <small>SCORE</small>
                    <strong className={solved ? 'is-hot' : ''}>{String(score).padStart(3, '0')}</strong>
                    {pendingScore > 0 && <small>+{pendingScore} AT RISK</small>}
                </div>
                <div>
                    <small>TIME</small>
                    <strong>{clock(timeLeft)}</strong>
                </div>
            </div>
            <div className="lp-timebar"><i style={{ width: `${pct}%` }} /></div>

            <div className="lp-board">
                {rows.map((row, r) => (
                    <div className="lp-row" key={r}>
                        {row.map((tile, c) => (
                            <span
                                key={c}
                                className={`lp-tile${tile.letter ? ' is-filled' : ''}${tile.mark ? ` m-${tile.mark}` : ''}`}
                                style={{ '--i': c }}
                            >
                                {tile.letter}
                            </span>
                        ))}
                    </div>
                ))}
            </div>

            <div className={`lp-pop${solved ? ' show' : ''}`}>
                SOLVED <b>+{SOLVE_POINTS}</b> <b>+{SOLVE_SECONDS}s</b>
            </div>
        </div>
    );
}

export default function Landing({ me, onPlay, busy = false, error = '', onAuthRefresh }) {
    const [helpOpen, setHelpOpen] = useState(false);
    const canPlay = Boolean(me?.authenticated && me.tickets > 0);

    return (
        <main className="app-shell landing">
            <header className="landing-top">
                <HubLink className="hub-link" to="/">← Arcade hub</HubLink>
                <button className="help-button" type="button" aria-label="How to play" onClick={() => setHelpOpen(true)}>?</button>
            </header>

            <div className="lp-hero">
                <section className="landing-intro lp-copy" aria-labelledby="landing-title">
                    <p className="landing-kicker"><i className="lp-dot" aria-hidden="true" />WORDS / PLAY NOW</p>
                    <h1 id="landing-title">FASTFIND<span>.</span></h1>
                    <p className="landing-lede">
                        Beat the clock.
                        <br />
                        Crack as many words as you can.
                    </p>

                    <ul className="lp-stats" aria-label="Quick facts">
                        <li><strong>{clock(START_SECONDS)}</strong><span>on the clock</span></li>
                        <li><strong>{MAX_ATTEMPTS}</strong><span>tries a word</span></li>
                        <li><strong>+{SOLVE_POINTS}</strong><span>per solve</span></li>
                    </ul>

                    <div className="lp-cta" aria-label="Start a game">
                        {me === null && <p className="landing-status">Checking your hub sign-in…</p>}
                        {me?.authenticated && me.tickets > 0 && (
                            <p className="landing-status lp-tickets">
                                <i aria-hidden="true" />{me.tickets} ticket{me.tickets === 1 ? '' : 's'} available
                            </p>
                        )}
                        {me?.authenticated && me.tickets <= 0 && (
                            <p className="landing-error" role="status">No tickets left. Please add a ticket to play.</p>
                        )}
                        {me && !me.authenticated && (
                            <p className="landing-error" role="status">Sign in and add a ticket to play.</p>
                        )}
                        {error && <p className="landing-error" role="alert">{error}</p>}

                        {canPlay ? (
                            <button className="modal-primary landing-play lp-play" type="button" autoFocus disabled={busy} onClick={onPlay}>
                                {busy ? 'Starting…' : 'Play'} <span aria-hidden="true">{busy ? '' : '↗'}</span>
                            </button>
                        ) : !me?.authenticated ? (
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                                <GoogleSignIn />
                            </div>
                        ) : (
                            <button className="modal-primary landing-play lp-play" type="button" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                                Add a ticket
                            </button>
                        )}
                    </div>
                </section>

                <section className="landing-card lp-card" aria-label="Live demo">
                    <div className="landing-meta">
                        <span>FASTFIND / WORDS</span>
                    </div>
                    <DemoBoard />
                    <div className="lp-legend" aria-hidden="true">
                        <span><i className="m-g" />RIGHT SPOT</span>
                        <span><i className="m-y" />WRONG SPOT</span>
                        <span><i className="m-b" />NOT IN WORD</span>
                    </div>
                </section>
            </div>

            <div className="lp-ticker" aria-hidden="true">
                <div className="lp-ticker-track">
                    {[0, 1].map((copy) => (
                        <div className="lp-ticker-set" key={copy}>
                            {TICKER.map((item) => <span key={item}>{item}<b>■</b></span>)}
                        </div>
                    ))}
                </div>
            </div>

            <section className="lp-scoring" aria-labelledby="lp-scoring-title">
                <div className="home-section-title lp-section-title">
                    <h2 id="lp-scoring-title">HOW YOU SCORE</h2>
                    <span>EVERY SECOND COUNTS</span>
                </div>
                <div className="lp-score-grid">
                    <article className="lp-score-card">
                        <small>01 / EVERY GREEN TILE</small>
                        <div className="lp-score-nums"><strong>+{POINTS_PER_GREEN}</strong><span>pts</span><strong>+{SECONDS_PER_GREEN}s</strong></div>
                        <p>Green points bank when you solve. Each distinct green letter earns +{SECONDS_PER_GREEN}s once per run.</p>
                    </article>
                    <article className="lp-score-card is-gold">
                        <small>02 / SOLVE THE WORD</small>
                        <div className="lp-score-nums"><strong>+{SOLVE_POINTS}</strong><span>pts</span><strong>+{SOLVE_SECONDS}s</strong></div>
                        <p>Bank this word’s green points. Solving adds +{SOLVE_SECONDS}s plus new green time, capped at +{MAX_SOLVE_TIME_BONUS_SECONDS}s total.</p>
                    </article>
                    <article className="lp-score-card is-danger">
                        <small>03 / USE ALL {MAX_ATTEMPTS} GUESSES</small>
                        <div className="lp-score-nums"><strong>−{MISS_PENALTY_POINTS}</strong><span>pts</span><strong>−{MISS_PENALTY_SECONDS}s</strong></div>
                        <p>Miss a word and it costs you. Then it's straight on to the next.</p>
                    </article>
                </div>
            </section>

            <p className="landing-hint">New here? Tap <b>?</b> for how it works.</p>

            {helpOpen && (
                <div className="overlay">
                    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="landing-help-title">
                        <h2 id="landing-help-title">How it works</h2>
                        <RulesContent />
                        <button className="modal-primary" type="button" autoFocus onClick={() => setHelpOpen(false)}>Got it</button>
                    </section>
                </div>
            )}
        </main>
    );
}