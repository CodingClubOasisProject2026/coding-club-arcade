"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGame, OPP } from "@/lib/engine";
import { startGame, moveSnake, endGame } from "@/lib/snakeApi";

const BASE_TICK_MS = 150;
const MIN_TICK_MS = 90;
const SPEEDUP_PER_APPLE_MS = 4;
const MAX_QUEUED_TURNS = 2;


const PREVIEW_APPLE = () => [10, 5];

const KEY_TO_DIRECTION = {
  ArrowUp: "UP", w: "UP",
  ArrowDown: "DOWN", s: "DOWN",
  ArrowLeft: "LEFT", a: "LEFT",
  ArrowRight: "RIGHT", d: "RIGHT",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useSnakeGame(sessionId) {
  const [game, setGame] = useState(() => createGame(PREVIEW_APPLE));
  const [phase, setPhase] = useState("idle"); 
  const [result, setResult] = useState(null); 
  const [error, setError] = useState(null);

  const gameRef = useRef(game);
  const queueRef = useRef([]);
  const runIdRef = useRef(0);
  const endedRef = useRef(false);

  const commit = useCallback((next) => {
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
    } catch (e) {
      setError(
        e.status === 401 ? "Not logged in. Log in first, then reload." : e.message
      );
      setPhase("idle");
    }
  }, [sessionId, commit]);

  const togglePause = useCallback(() => {
    setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
  }, []);

  const changeDirection = useCallback(
    (dir) => {
      if (phase !== "playing") return;
      const queue = queueRef.current;
      const last = queue.length ? queue[queue.length - 1] : gameRef.current.direction;
      if (dir === last || dir === OPP[last]) return;
      if (queue.length >= MAX_QUEUED_TURNS) return;
      queue.push(dir);
    },
    [phase]
  );

 
  useEffect(() => {
    if (phase !== "playing") return;

    let stopped = false;
    const runId = runIdRef.current;

    (async () => {
      while (!stopped) {
        const eaten = gameRef.current.apples_eaten;
        await sleep(Math.max(MIN_TICK_MS, BASE_TICK_MS - eaten * SPEEDUP_PER_APPLE_MS));
        if (stopped) return;

        const dir = queueRef.current.shift() ?? gameRef.current.direction;
        try {
          const next = await moveSnake(sessionId, dir);
          if (runId !== runIdRef.current) return;
          commit(next); 
          if (next.game_over) {
            setPhase("over");
            return;
          }
        } catch (e) {
          if (runId === runIdRef.current) {
            setError(e.message);
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
    endGame(sessionId).then(setResult).catch((e) => setError(e.message));
  }, [phase, sessionId]);

  useEffect(() => {
    const onKeyDown = (e) => {
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
      if (document.hidden) setPhase((p) => (p === "playing" ? "paused" : p));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return { game, phase, error, result, start, togglePause, changeDirection };
}