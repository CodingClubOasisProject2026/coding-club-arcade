
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { startRun, submitRun, runStatus, type RunStatus } from './api';
import {
  SCALE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BIRD_X,
  BIRD_RADIUS,
  PIPE_WIDTH,
  PIPE_GAP,
  type GameState,
  type ActionLog,
  createGame,
  stepGame,
} from './engine';
import './flappy.css';

type Phase = 'menu' | 'starting' | 'playing' | 'over';

type Submission =
  | { state: 'idle' | 'sending' | 'error' }
  | { state: 'done'; result: RunStatus };

export default function Flappy() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<Submission>({
    state: 'idle',
  });

  const gameRef = useRef<GameState>(createGame(123));
  const actionsRef = useRef<{ tick: number; action: 'FLAP' }[]>([]);
  const pendingFlap = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the best score saved in this browser.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('flappy-bird-high-score'));
      if (Number.isFinite(saved) && saved >= 0) {
        setHighScore(saved);
      }
    } catch {
      // The game remains playable if browser storage is unavailable.
    }
  }, []);

  const finish = useCallback(async (endReason: 'COLLISION' | 'QUIT') => {
    const state = gameRef.current;
    const sessionId = sessionRef.current;

    if (!sessionId) return;

    setSubmission({ state: 'sending' });

    const actionLog: ActionLog = {
      actions: [...actionsRef.current],
      total_ticks: state.tick,
      end_reason: endReason,
    };

    try {
      await submitRun(sessionId, actionLog);

      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const result = await runStatus(sessionId);

        if (result.status !== 'pending') {
          setSubmission({ state: 'done', result });
          return;
        }
      }

      setSubmission({ state: 'error' });
    } catch {
      setSubmission({ state: 'error' });
    }
  }, []);

  // Save the personal best whenever the score improves.
  useEffect(() => {
    if (score <= highScore) return;

    setHighScore(score);

    try {
      localStorage.setItem('flappy-bird-high-score', String(score));
    } catch {
      // Ignore unavailable browser storage.
    }
  }, [score, highScore]);

  // Main game loop.
  useEffect(() => {
    if (phase !== 'playing') return;

    let raf = 0;
    let active = true;

    const frame = () => {
      if (!active) return;

      const state = gameRef.current;
      let flap = false;

      if (pendingFlap.current) {
        flap = true;

        actionsRef.current.push({
          tick: state.tick + 1,
          action: 'FLAP',
        });

        pendingFlap.current = false;
      }

      stepGame(state, flap);

      // Update the bird without waiting for a React render.
      const bird = containerRef.current?.querySelector(
        '.fb-bird',
      ) as HTMLElement | null;

      if (bird) {
        bird.style.top = `${
          ((state.bird_y - BIRD_RADIUS) / WORLD_HEIGHT) * 100
        }%`;

        const rotation = Math.max(
          -30,
          Math.min(85, (state.velocity / SCALE) * 4),
        );

        bird.style.transform = `rotate(${rotation}deg)`;
      }

      setScore(state.score);

      if (state.status === 'GAME_OVER') {
        active = false;
        setPhase('over');
        void finish('COLLISION');
        return;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [phase, finish]);

  const start = async () => {
    if (phase === 'starting' || phase === 'playing') return;

    setPhase('starting');
    setSubmission({ state: 'idle' });
    sessionRef.current = null;

    try {
      const session = await startRun();
      sessionRef.current = session.id;
      gameRef.current = createGame(session.seed);
    } catch {
      // Allow local play if the server cannot start a session.
      gameRef.current = createGame(Math.floor(Math.random() * 10000));
    }

    actionsRef.current = [];
    pendingFlap.current = true;
    setScore(0);
    setPhase('playing');
  };

  // Keyboard controls.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp') return;

      event.preventDefault();

      if (event.repeat) return;

      if (phase === 'playing') {
        pendingFlap.current = true;
      } else if (phase === 'menu' || phase === 'over') {
        void start();
      }
    };

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);
  }, [phase]);

  const isPlaying = phase === 'playing';
  const isOver = phase === 'over';

  return (
    <main className="fb-page">
      <header className="fb-topbar">
        <Link to="/" className="fb-back">
          <span aria-hidden="true">←</span> Back
        </Link>

        <h1 className="fb-title">Flappy Bird</h1>

        <div className="fb-header-best">
          BEST <span>{highScore}</span>
        </div>
      </header>

      <section className="fb-game-shell" aria-label="Flappy Bird game">
        <div
          className={`fb-game-container ${
            isPlaying ? 'fb-is-playing' : ''
          }`}
          ref={containerRef}
          onPointerDown={() => {
            if (phase === 'playing') {
              pendingFlap.current = true;
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {/* Sky and distant scenery */}
          <div className="fb-sky" />
          <div className="fb-sun" />

          <div className="fb-cloud fb-cloud-one">
            <i />
            <i />
            <i />
          </div>

          <div className="fb-cloud fb-cloud-two">
            <i />
            <i />
            <i />
          </div>

          <div className="fb-skyline">
            <span className="fb-building fb-building-one" />
            <span className="fb-building fb-building-two" />
            <span className="fb-building fb-building-three" />
            <span className="fb-building fb-building-four" />
            <span className="fb-building fb-building-five" />
            <span className="fb-building fb-building-six" />
          </div>

          {/* Score */}
          <div className="fb-score" aria-live="polite">
            {String(score).padStart(1, '0')}
          </div>

          {/* Moving pipes */}
          <div className="fb-pipes">
            {gameRef.current.pipes.map((pipe, index) => (
              <div className="fb-pipe-pair" key={index}>
                <div
                  className="fb-pipe fb-pipe-top"
                  style={{
                    left: `${(pipe.x / WORLD_WIDTH) * 100}%`,
                    height: `${(pipe.gap_top / WORLD_HEIGHT) * 100}%`,
                    width: `${(PIPE_WIDTH / WORLD_WIDTH) * 100}%`,
                  }}
                />

                <div
                  className="fb-pipe fb-pipe-bottom"
                  style={{
                    left: `${(pipe.x / WORLD_WIDTH) * 100}%`,
                    top: `${
                      ((pipe.gap_top + PIPE_GAP) / WORLD_HEIGHT) * 100
                    }%`,
                    height: `${
                      ((WORLD_HEIGHT - pipe.gap_top - PIPE_GAP) /
                        WORLD_HEIGHT) *
                      100
                    }%`,
                    width: `${(PIPE_WIDTH / WORLD_WIDTH) * 100}%`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Bird */}
          <div
            className="fb-bird"
            style={{
              left: `${((BIRD_X - BIRD_RADIUS) / WORLD_WIDTH) * 100}%`,
              top: `${
                ((gameRef.current.bird_y - BIRD_RADIUS) / WORLD_HEIGHT) * 100
              }%`,
              width: `${((BIRD_RADIUS * 2) / WORLD_WIDTH) * 100}%`,
              height: `${((BIRD_RADIUS * 2) / WORLD_HEIGHT) * 100}%`,
            }}
          >
            <span className="fb-bird-wing" />
            <span className="fb-bird-eye" />
            <span className="fb-bird-beak" />
            <span className="fb-bird-feet" />
          </div>

          {/* Foreground grass and dirt */}
          <div className="fb-bushes">
            <span className="fb-bush fb-bush-one" />
            <span className="fb-bush fb-bush-two" />
            <span className="fb-bush fb-bush-three" />
            <span className="fb-bush fb-bush-four" />
            <span className="fb-bush fb-bush-five" />
          </div>

          <div className="fb-ground">
            <div className="fb-grass-top" />
            <div className="fb-dirt">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>

          {/* Start and game-over panels */}
          {!isPlaying && (
            <div className={`fb-overlay ${isOver ? 'fb-overlay-over' : ''}`}>
              {isOver ? (
                <>
                  <h2 className="fb-game-over-title">GAME OVER</h2>

                  <div className="fb-results">
                    <div className="fb-results-main">
                      <div className="fb-result-stat">
                        <span className="fb-result-number">{score}</span>
                        <span className="fb-result-label">SCORE</span>
                      </div>

                      <div className="fb-result-stat">
                        <span className="fb-result-number">{highScore}</span>
                        <span className="fb-result-label">BEST</span>
                      </div>

                      <div className="fb-medal-area">
                        <div className="fb-medal">
                          <span />
                        </div>
                        <span className="fb-result-label">MEDAL</span>
                      </div>
                    </div>

                    <div className="fb-results-side">
                      <div className="fb-tabs">
                        <span className="fb-tab fb-tab-active">DAILY</span>
                        <span className="fb-tab">ALL TIME</span>
                      </div>

                      <div className="fb-leaderboard-heading">
                        LEADERBOARD
                      </div>

                      {[1, 2, 3, 4, 5].map((rank) => (
                        <div className="fb-rank-row" key={rank}>
                          <span className={`fb-rank rank-${rank}`}>
                            {rank}
                          </span>
                          <span className="fb-rank-name">---</span>
                          <span className="fb-rank-score">-</span>
                        </div>
                      ))}

                      <div className="fb-player-row">
                        <span className="fb-rank fb-your-rank">•</span>
                        <span className="fb-rank-name">YOU</span>
                        <span className="fb-rank-score">{score}</span>
                      </div>
                    </div>
                  </div>

                  <div className="fb-game-over-actions">
                    <button className="fb-start-btn" onClick={() => void start()}>
                      PLAY AGAIN
                    </button>

                    <div className="fb-submission-status" aria-live="polite">
                      {submission.state === 'sending' && (
                        <p>Verifying score...</p>
                      )}

                      {submission.state === 'done' && (
                        <p>
                          {submission.result.status === 'verified'
                            ? 'Score verified!'
                            : 'Score rejected'}
                        </p>
                      )}

                      {submission.state === 'error' && (
                        <p>Score verification unavailable.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="fb-start-panel">
                  <div className="fb-panel-bird">
                    <span className="fb-bird-eye" />
                    <span className="fb-bird-beak" />
                  </div>

                  <h2 className="fb-ready-text">READY TO PLAY?</h2>

                  <p className="fb-instruction-text">
                    Tap or Space to flap and avoid pipes.
                  </p>

                  <button
                    className="fb-start-btn"
                    onClick={() => void start()}
                    disabled={phase === 'starting'}
                  >
                    {phase === 'starting' ? 'STARTING...' : 'START GAME'}
                  </button>

                  <p className="fb-best-hint">BEST: {highScore}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="fb-footer">
        <span>FLAPPY BIRD</span>
        <span>CLICK OR PRESS SPACE TO FLAP</span>
      </footer>
    </main>
  );
}
