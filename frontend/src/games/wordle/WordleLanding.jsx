import { useState } from 'react';
import { HUB_URL, RulesContent } from './WordleRules';

// The page players land on when they click Wordle in the arcade hub.
// Layout and styling follow the hub's home page (kicker, pixel heading, bordered game card).
export default function Landing({ me, onPlay, busy = false, error = '' }) {
    const [helpOpen, setHelpOpen] = useState(false);
    const canPlay = Boolean(me?.authenticated && me.tickets > 0);

    return (
        <main className="app-shell landing">
            <header className="landing-top">
                <a className="hub-link" href={HUB_URL}>← Arcade hub</a>
                <button className="help-button" type="button" aria-label="How to play" onClick={() => setHelpOpen(true)}>?</button>
            </header>

            <section className="landing-intro" aria-labelledby="landing-title">
                <p className="landing-kicker">WORDS / PLAY NOW</p>
                <h1 id="landing-title">WORDLE<span>.</span></h1>
                <p className="landing-lede">
                    Beat the clock.
                    <br />
                    Crack as many words as you can.
                </p>
            </section>

            <section className="landing-card" aria-label="Start a game">
                <div className="landing-meta">
                    <span>WORDLE / WORDS</span>
                    <span className="landing-live">PLAY NOW</span>
                </div>

                <div className="landing-art" aria-hidden="true">
                    <div className="landing-word">
                        {'GUESS'.split('').map((letter, index) => <span key={index}>{letter}</span>)}
                    </div>
                </div>

                <div className="landing-info">
                    {me === null && <p className="landing-status">Checking your hub sign-in…</p>}
                    {me?.authenticated && me.tickets > 0 && (
                        <p className="landing-status">{me.tickets} ticket{me.tickets === 1 ? '' : 's'} available</p>
                    )}
                    {me?.authenticated && me.tickets <= 0 && (
                        <p className="landing-error" role="status">No tickets left. Ask an arcade admin to add tickets to your account.</p>
                    )}
                    {me && !me.authenticated && (
                        <p className="landing-error" role="status">Sign in through the arcade hub before playing.</p>
                    )}
                    {error && <p className="landing-error" role="alert">{error}</p>}

                    {canPlay && (
                        <button className="modal-primary landing-play" type="button" autoFocus disabled={busy} onClick={onPlay}>
                            {busy ? 'Starting…' : 'Play'} <span aria-hidden="true">{busy ? '' : '↗'}</span>
                        </button>
                    )}
                </div>
            </section>

            <p className="landing-hint">New here? Tap <b>?</b> for how it works.</p>

            <footer className="landing-footer">
                <span>CODING CLUB · BITS PILANI</span>
                <span>ONE MORE ROUND?</span>
            </footer>

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