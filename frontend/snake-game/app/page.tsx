"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Board from "@/components/Board";
import DPad from "@/components/DPad";
import { useSnakeGame } from "@/hooks/useSnakeGame";
import { useSwipe } from "@/hooks/useSwipe";

function SnakeGame() {
  const sessionId = useSearchParams().get("session") ?? "";
  const { game, phase, error, result, start, togglePause, changeDirection } =
    useSnakeGame(sessionId);
  const swipe = useSwipe(changeDirection);

  const overlay = {
    idle: { title: "Ready?", label: "Start" },
    paused: { title: "Paused", label: "Resume" },
    over: {
      title: game.status === "WON" ? "You won!" : "Game over",
      label: null,
    },
  }[phase === "playing" ? "idle" : phase];

  const visibleOverlay = phase === "playing" ? null : overlay;

  return (
    <main className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col items-center gap-3 p-4 select-none touch-manipulation">
      <h1 className="text-2xl font-bold md:text-3xl">Snake</h1>

      <div className="flex items-center gap-5 text-base md:text-lg">
        <span>Score: {game.score}</span>
        <span>Apples: {game.apples_eaten}</span>
        {phase === "playing" && (
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              togglePause();
            }}
            className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
          >
            Pause
          </button>
        )}
      </div>

      {error && (
        <p className="max-w-[90vw] rounded bg-red-900/60 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="relative touch-none" {...swipe}>
        <Board board={game.board} snake={game.snake} apple={game.apple} />

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <p className="text-2xl font-bold">{overlay.title}</p>
            {phase === "over" && (
              <>
                <p>Final score: {result?.score ?? game.score}</p>
                <p className="px-4 text-center text-sm text-slate-300">
                  Start a new session to play again.
                </p>
              </>
            )}
            {overlay.label && (
              <button
                onClick={phase === "paused" ? togglePause : start}
                className="rounded bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500"
              >
                {overlay.label}
              </button>
            )}
          </div>
        )}
      </div>

      <DPad onDirection={changeDirection} />

      <p className="text-center text-sm text-slate-400">
        <span className="hidden md:inline">Arrow keys / WASD to move, Space or P to pause</span>
        <span className="md:hidden">Swipe on the board or use the buttons</span>
      </p>
    </main>
  );
}

export default function SnakePage() {
  return (
    <Suspense>
      <SnakeGame />
    </Suspense>
  );
}