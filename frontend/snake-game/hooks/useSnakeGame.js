"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRng,
  createGame,
  moveSnake,
  getActionLog,
  OPP,
} from "@/lib/engine";

const BASE_TICK_MS = 150;
const MIN_TICK_MS = 70;
const SPEEDUP_PER_APPLE_MS = 4;
const MAX_QUEUED_TURNS = 2;

const KEY_TO_DIRECTION = {
  ArrowUp: "UP", w: "UP",
  ArrowDown: "DOWN", s: "DOWN",
  ArrowLeft: "LEFT", a: "LEFT",
  ArrowRight: "RIGHT", d: "RIGHT",
};

export function useSnakeGame() {
  const [game, setGame] = useState(() => createGame(createRng(1)));
  const [phase, setPhase] = useState("idle"); // idle | playing | paused | over

  // Refs hold the latest values for the timer without recreating it every render
  const gameRef = useRef(game);
  const rngRef = useRef(null);
  const queueRef = useRef([]);

  const commit = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const start = useCallback(() => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    rngRef.current = createRng(seed);
    queueRef.current = [];
    commit(createGame(rngRef.current));
    setPhase("playing");
  }, [commit]);

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

  
  const tickMs = Math.max(
    MIN_TICK_MS,
    BASE_TICK_MS - game.apples_eaten * SPEEDUP_PER_APPLE_MS
  );

  useEffect(() => {
    if (phase !== "playing") return;

    const id = setInterval(() => {
      const current = gameRef.current;
      const dir = queueRef.current.shift() ?? current.direction;
      const next = moveSnake(current, dir, rngRef.current);
      commit(next);
      if (next.status !== "ACTIVE") setPhase("over");
    }, tickMs);

    return () => clearInterval(id);
  }, [phase, tickMs, commit]);

  
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

    // Pause automatically when the tab/app goes to the background.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setPhase((p) => (p === "playing" ? "paused" : p));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return {
    game,
    phase,
    start,
    togglePause,
    changeDirection,
    actionLog: getActionLog(game),
  };
}