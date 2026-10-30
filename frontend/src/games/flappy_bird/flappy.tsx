import { useCallback, useEffect, useRef, useState } from 'react';
import { HubLink } from '../../loader/HubTransition';
import { ApiError } from '../../api';
import { useAuth } from '../../auth';
import GoogleSignIn from '../../GoogleSignIn';
import { startRun, submitRun, submitRunKeepalive } from './api';
import {
  SCALE,
  TICK_MS,
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
import { flappyAudio } from './audio';
import { SoundIcon } from '../../SoundIcon';
import './flappy.css';

type Phase = 'menu' | 'starting' | 'playing' | 'over';

type Submission = 'idle' | 'sending' | 'submitted' | 'error';

type ViewState = {
  pipes: { x: number; gap_top: number }[];
  birdY: number;
  velocity: number;
};

function viewState(game: GameState): ViewState {
  return {
    pipes: game.pipes
      .filter((pipe) => pipe.x + PIPE_WIDTH > 0 && pipe.x < WORLD_WIDTH)
      .map((pipe) => ({ x: pipe.x, gap_top: pipe.gap_top })),
    birdY: game.bird_y,
    velocity: game.velocity,
  };
}

export default function Flappy() {
  const { me, refresh } = useAuth();
  const signedIn = me?.authenticated === true;
  const gameRef = useRef<GameState>(createGame(123));
  const [phase, setPhase] = useState<Phase>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [submission, setSubmission] = useState<Submission>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => flappyAudio.enabled);
  // Pipes and bird are rendered from this copy, not from the mutable ref.
  const [view, setView] = useState<ViewState>(() => viewState(createGame(123)));

  const actionsRef = useRef<{ tick: number; action: 'FLAP' }[]>([]);
  const pendingFlap = useRef(false);
  const sessionRef = useRef<string | null>(null);

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

    if (!sessionId) {
      return;
    }

    sessionRef.current = null;
    setSubmission('sending');

    const actionLog: ActionLog = {
      actions: [...actionsRef.current],
      total_ticks: state.tick,
      end_reason: endReason,
    };

    try {
      await submitRun(sessionId, actionLog);
      setSubmission('submitted');
    } catch {
      setSubmission('error');
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

  // Main game loop. The simulation runs at a fixed 60 Hz so a 120 Hz display
  // cannot make the bird and pipes move twice as fast.
  useEffect(() => {
    if (phase !== 'playing') {
      flappyAudio.stopBgm();
      return;
    }
    flappyAudio.startBgm();

    let raf = 0;
    let active = true;
    let last = performance.now();
    let accumulator = 0;

    const frame = (now: number) => {
      if (!active) return;

      accumulator += Math.min(now - last, 250);
      last = now;

      let steps = 0;
      while (accumulator >= TICK_MS && steps < 5) {
        const state = gameRef.current;
        let flap = false;

        if (pendingFlap.current) {
          flap = true;
          flappyAudio.playFlap();

          actionsRef.current.push({
            tick: state.tick + 1,
            action: 'FLAP',
          });

          pendingFlap.current = false;
        }

        const scoreBefore = state.score;
        stepGame(state, flap);
        if (state.score > scoreBefore) {
          flappyAudio.playScore();
        }

        accumulator -= TICK_MS;
        steps += 1;

        if (state.status !== 'ACTIVE') break;
      }

      const state = gameRef.current;

      if (steps > 0) {
        setView(viewState(state));
        setScore(state.score);
      }

      if (state.status === 'GAME_OVER') {
        active = false;
        flappyAudio.stopBgm();
        flappyAudio.playHit();
        setTimeout(() => flappyAudio.playFall(), 130);
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
      flappyAudio.stopBgm();
    };
  }, [phase, finish]);

  const start = useCallback(async () => {
    if (phase === 'starting' || phase === 'playing') return;

    setNotice(null);

    if (!signedIn) {
      setNotice('SIGN IN AND ADD A TICKET TO PLAY.');
      return;
    }
    if (me.tickets <= 0) {
      setNotice('NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.');
      return;
    }

    setPhase('starting');
    setSubmission('idle');
    sessionRef.current = null;

    try {
      const session = await startRun();
      sessionRef.current = session.id;
      gameRef.current = createGame(session.seed);
      actionsRef.current = [];
      pendingFlap.current = true;
      setView(viewState(gameRef.current));
      setScore(0);
      flappyAudio.playStart();
      setPhase('playing');
    } catch (error) {
      sessionRef.current = null;
      if (error instanceof ApiError && error.status === 400) {
        setNotice('NO TICKETS LEFT. PLEASE ADD A TICKET TO PLAY.');
      } else {
        setNotice('SIGN IN AND ADD A TICKET TO PLAY.');
      }
      setPhase(phase === 'over' ? 'over' : 'menu');
    } finally {
      refresh();
    }
  }, [me, phase, refresh, signedIn]);

 // Keyboard controls.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'KeyR') return;

      event.preventDefault();

      if (event.repeat) return;

      if (phase === 'playing') {
        if (event.code === 'Space' || event.code === 'ArrowUp') {
          pendingFlap.current = true;
        }
      } else if (phase === 'menu' || phase === 'over') {
        if (event.code === 'KeyR') {
          void start();
        }
      } 
    };

    window.addEventListener('keydown', handleKey);

    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, start]);

  // Leaving mid-run submits a QUIT log so the ticket and played time still count.
  useEffect(() => {
    const onHide = () => {
      const state = gameRef.current;
      const sessionId = sessionRef.current;
      if (!sessionId || state.status !== 'ACTIVE') return;
      sessionRef.current = null;
      void submitRunKeepalive(sessionId, {
        actions: [...actionsRef.current],
        total_ticks: state.tick,
        end_reason: 'QUIT',
      });
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);

  const isPlaying = phase === 'playing';
  const isOver = phase === 'over';

  return (
    <main className="fb-page">
      <header className="fb-topbar">
        <HubLink to="/" className="fb-back">
          <span aria-hidden="true">←</span> Back
        </HubLink>

        <h1 className="fb-title">Flightsim</h1>

        <div className="fb-header-best">
          {signedIn && me.tickets > 0 && <span>🎟 {me.tickets} · </span>}
          BEST <span>{highScore}</span>
          <button
            type="button"
            onClick={() => {
              const next = flappyAudio.toggle();
              setSoundOn(next);
              if (next && phase === 'playing') {
                flappyAudio.startBgm();
              }
            }}
            className="fb-btn-sound"
            title={soundOn ? 'Mute Sound' : 'Enable Sound'}
            aria-label={soundOn ? 'Mute Sound' : 'Enable Sound'}
          >
            <SoundIcon enabled={soundOn} size={15} />
          </button>
        </div>
      </header>

      {notice && (
        <div className="fb-notice" role="status">
          <span>{notice}</span>
          {!signedIn && <GoogleSignIn />}
        </div>
      )}

      <section className="fb-game-shell" aria-label="Flightsim game">
        <div
          className={`fb-game-container ${
            isPlaying ? 'fb-is-playing' : ''
          }`}
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
            {view.pipes.map((pipe, index) => (
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
              top: `${((view.birdY - BIRD_RADIUS) / WORLD_HEIGHT) * 100}%`,
              width: `${((BIRD_RADIUS * 2) / WORLD_WIDTH) * 100}%`,
              height: `${((BIRD_RADIUS * 2) / WORLD_HEIGHT) * 100}%`,
              transform: `rotate(${Math.max(
                -30,
                Math.min(85, (view.velocity / SCALE) * 4),
              )}deg)`,
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
                    </div>
                  </div>

                  <div className="fb-game-over-actions">
                    {!signedIn ? (
                      <div className="fb-auth-box">
                        <p className="fb-auth-prompt">Sign in and add a ticket to play.</p>
                        <GoogleSignIn />
                      </div>
                    ) : me.tickets <= 0 ? (
                      <div className="fb-auth-box">
                        <p className="fb-auth-prompt fb-no-tickets">No tickets left. Please add a ticket to play.</p>
                        <button type="button" className="fb-start-btn" disabled>
                          ADD A TICKET
                        </button>
                      </div>
                    ) : (
                      <button
                        className="fb-start-btn"
                        onClick={() => void start()}
                      >
                        PLAY AGAIN
                      </button>
                    )}

                    <div className="fb-submission-status" aria-live="polite">
                      {submission === 'sending' && (
                        <p>Submitting run...</p>
                      )}

                      {submission === 'submitted' && (
                        <p>Run submitted.</p>
                      )}

                      {submission === 'error' && (
                        <p>Could not submit this run.</p>
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

                  {!signedIn ? (
                    <div className="fb-auth-box">
                      <p className="fb-auth-prompt">Sign in and add a ticket to play.</p>
                      <GoogleSignIn />
                    </div>
                  ) : me.tickets <= 0 ? (
                    <div className="fb-auth-box">
                      <p className="fb-auth-prompt fb-no-tickets">No tickets left. Please add a ticket to play.</p>
                      <button type="button" className="fb-start-btn" disabled>
                        ADD A TICKET
                      </button>
                    </div>
                  ) : (
                    <button
                      className="fb-start-btn"
                      onClick={() => void start()}
                      disabled={phase === 'starting'}
                    >
                      {phase === 'starting' ? 'STARTING...' : 'START GAME'}
                    </button>
                  )}

                  <p className="fb-best-hint">BEST: {highScore}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="fb-footer">
        <span>FLIGHTSIM</span>
        <span>CLICK OR PRESS R TO FLAP</span>
      </footer>
    </main>
  );
}
