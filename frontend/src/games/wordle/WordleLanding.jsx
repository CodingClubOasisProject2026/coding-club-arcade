import { useState } from 'react';
import { HUB_URL, RulesContent } from './WordleRules';

// The page players land on when they click Wordle in the arcade hub.
export default function Landing({ onPlay, busy = false, error = '' }) {
    const [helpOpen, setHelpOpen] = useState(false);
    return (
        <main className="app-shell landing">
            <header className="landing-top">
                <button className="help-button" type="button" aria-label="How to play" onClick={() => setHelpOpen(true)}>?</button>
            </header>

            <section className="landing-hero">
                <div className="brand landing-brand" aria-label="Wordle">
                    {'WORDLE'.split('').map((letter, index) => (
                        <span className={`brand-tile brand-${index % 3}`} key={`${letter}-${index}`}>{letter}</span>
                    ))}
                </div>
                <h1>Welcome to Wordle!</h1>
                <p className="landing-sub">Beat the clock. Crack as many words as you can.</p>
                <div className="landing-actions">
                    {error && <p className="landing-error" role="alert">{error}</p>}
                    <button className="modal-primary landing-play" type="button" autoFocus disabled={busy} onClick={onPlay}>
                        {busy ? 'Starting…' : '▶ Play'}
                    </button>
                    <a className="modal-secondary" href={HUB_URL}>← Back to arcade hub</a>
                </div>
                <p className="landing-hint">New here? Tap <b>?</b> for how it works.</p>
            </section>

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