"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGame,
  OPP,
  type Direction,
  type GameState,
  type Position,
} from "@/lib/engine";
import { startGame, moveSnake, endGame } from "@/lib/snakeApi";

const BASE_TICK_MS = 150;
const MIN_TICK_MS = 90;
const SPEEDUP_PER_APPLE_MS = 4;
const MAX_QUEUED_TURNS = 2;

interface GameResult {
  score: number;
  [key: string]: unknown;
}

interface ApiError extends Error {
  status?: number;
}

type Phase = "idle" | "playing" | "paused" | "over";

const PREVIEW_APPLE = (): Position => [10, 5];

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "UP",
  w: "UP",
  ArrowDown: "DOWN",
  s: "DOWN",
  ArrowLeft: "LEFT",
  a: "LEFT",
  ArrowRight: "RIGHT",
  d: "RIGHT",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function useSnakeGame(sessionId: string) {
  const [game, setGame] = useState<GameState>(() =>
    createGame(PREVIEW_APPLE),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gameRef = useRef<GameState>(game);
  const queueRef = useRef<Direction[]>([]);
  const runIdRef = useRef(0);
  const endedRef = useRef(false);

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const start = useCallback(async () => {
    if (!UUID_RE.test(sessionId || "")) {
      setError("Missing or invalid session id. Open /snake?session=<ID>");
      return;
    }

    const runId = ++runIdRef.current;
    setError(null);
    setResult(null);
    endedRef.current = false;
    queueRef.current = [];

    try {
      const state = await startGame(sessionId);

      if (runId !== runIdRef.current) return;

      commit(state);
      setPhase("playing");
    } catch (e: unknown) {
      if (runId !== runIdRef.current) return;

      const err = e as ApiError;
      setError(
        err.status === 401
          ? "Not logged in. Log in first, then reload."
          : err.message || "Failed to start game",
      );
      setPhase("idle");
    }
  }, [sessionId, commit]);

  const togglePause = useCallback(() => {
    setPhase((p) =>
      p === "playing" ? "paused" : p === "paused" ? "playing" : p,
    );
  }, []);

  const changeDirection = useCallback(
    (dir: Direction) => {
      if (phase !== "playing") return;

      const queue = queueRef.current;
      const last = queue.length
        ? queue[queue.length - 1]
        : gameRef.current.direction;

      if (dir === last || dir === OPP[last]) return;
      if (queue.length >= MAX_QUEUED_TURNS) return;

      queue.push(dir);
    },
    [phase],
  );

  useEffect(() => {
    if (phase !== "playing") return;

    let stopped = false;
    const runId = runIdRef.current;

    (async () => {
      while (!stopped) {
        const eaten = gameRef.current.apples_eaten;

        await sleep(
          Math.max(
            MIN_TICK_MS,
            BASE_TICK_MS - eaten * SPEEDUP_PER_APPLE_MS,
          ),
        );

        if (stopped) return;

        const dir =
          queueRef.current.shift() ?? gameRef.current.direction;

        try {
          const next = await moveSnake(sessionId, dir);

          if (runId !== runIdRef.current) return;

          commit(next);

          if (next.game_over) {
            setPhase("over");
            return;
          }
        } catch (e: unknown) {
          if (runId === runIdRef.current) {
            const err = e as Error;
            setError(err.message || "Failed to move snake");
            setPhase("idle");
          }
          return;
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [phase, sessionId, commit]);

  useEffect(() => {
    if (phase !== "over" || endedRef.current) return;

    endedRef.current = true;

    endGame(sessionId)
      .then((response) => setResult(response as GameResult))
      .catch((e: unknown) => {
        const err = e as Error;
        setError(err.message || "Failed to end game");
      });
  }, [phase, sessionId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const dir = KEY_TO_DIRECTION[key];

      if (dir) {
        e.preventDefault();
        changeDirection(dir);
        return;
      }

      if (key === " " || key === "p") {
        e.preventDefault();
        togglePause();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeDirection, togglePause]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setPhase((p) => (p === "playing" ? "paused" : p));
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return {
    game,
    phase,
    error,
    result,
    start,
    togglePause,
    changeDirection,
  };
}