import { HUB_URL, MAX_ATTEMPTS, MISS_PENALTY_SECONDS, START_SECONDS, RulesContent } from './WordleRules';

/**
 * Landing / welcome screen shown before the player starts a Wordle game.
 *
 * Props:
 *   me        – auth object from useAuth(); me.authenticated === true when logged in
 *   onPlay    – async callback: starts a hub session and navigates to the game
 *   busy      – true while a session is being created
 *   error     – string error message from the last failed play attempt
 */
export default function Landing({ me, onPlay, busy, error }) {
    const loggedIn = me?.authenticated === true;

    return (
        <main className="app-shell landing-shell">
            <header className="topbar">
                <div className="top-left">
                    <a className="hub-link" href={HUB_URL}>← Arcade hub</a>
                </div>
                <div className="brand" aria-label="Wordle">
                    {'WORDLE'.split('').map((letter, index) => (
                        <span className={`brand-tile brand-${index % 3}`} key={`${letter}-${index}`}>{letter}</span>
                    ))}
                </div>
            </header>

            <section className="landing-card">
                <h1 className="landing-title">Welcome to Wordle</h1>
                <p className="landing-sub">
                    Guess words against the clock. You have{' '}
                    <strong>{START_SECONDS} seconds</strong> and up to{' '}
                    <strong>{MAX_ATTEMPTS} guesses</strong> per word.
                    Missing a word costs <strong>{MISS_PENALTY_SECONDS}s</strong>.
                </p>

                <RulesContent />

                {!loggedIn && (
                    <p className="landing-auth-note" role="alert">
                        You need to be logged in to play. Please sign in via the{' '}
                        <a href={HUB_URL}>Arcade hub</a>.
                    </p>
                )}

                {error && (
                    <p className="landing-error" role="alert">{error}</p>
                )}

                <button
                    className="modal-primary landing-play-btn"
                    type="button"
                    disabled={busy || !loggedIn}
                    onClick={onPlay}
                >
                    {busy ? 'Starting…' : 'Play'}
                </button>
            </section>
        </main>
    );
}