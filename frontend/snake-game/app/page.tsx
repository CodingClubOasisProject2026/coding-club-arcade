"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Board from "@/components/Board";
import DungeonBackdrop from "@/components/DungeonBackdrop";
import DPad from "@/components/DPad";
import { useSnakeGame } from "@/hooks/useSnakeGame";
import { useSwipe } from "@/hooks/useSwipe";

const primaryBtn =
  "border-4 border-black bg-amber-400 px-4 py-3 text-xs text-black shadow-[4px_4px_0_#000] hover:bg-amber-300 active:translate-x-1 active:translate-y-1 active:shadow-none";

function SnakeGame() {
  const sessionId = useSearchParams().get("session") ?? "";
  const { game, phase, error, result, start, togglePause, changeDirection } =
    useSnakeGame(sessionId);
  const swipe = useSwipe(changeDirection);

  const overlay = {
    idle: { title: "READY?", label: "START" },
    paused: { title: "PAUSED", label: "RESUME" },
    over: {
      title: game.status === "WON" ? "YOU WON!" : "GAME OVER",
      label: null,
    },
  }[phase];

  return (
    <main className="dungeon font-[family-name:var(--font-arcade)] min-h-[100dvh] text-slate-100 flex flex-col items-center gap-4 p-4 select-none touch-manipulation">
      <DungeonBackdrop />
      <h1 className="text-xl text-amber-400 [text-shadow:3px_3px_0_#000] md:text-3xl">SNAKE</h1>

      <div className="flex items-center gap-5 text-[10px] md:text-xs [text-shadow:2px_2px_0_#000]">
        <span>SCORE {String(game.score).padStart(4, "0")}</span>
        <span>APPLES {game.apples_eaten}</span>
        {phase === "playing" && (
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              togglePause();
            }}
            className="border-2 border-black bg-slate-600 px-2 py-1 text-[10px] shadow-[2px_2px_0_#000] hover:bg-slate-500"
          >
            PAUSE
          </button>
        )}
      </div>

      {error && (
        <p className="max-w-[90vw] border-2 border-black bg-red-800 px-3 py-2 text-[10px] leading-relaxed text-red-100">
          {error}
        </p>
      )}

      <div className="relative touch-none" {...swipe}>
        <Board board={game.board} snake={game.snake} apple={game.apple} />

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75">
            <p className="text-lg text-amber-400 [text-shadow:3px_3px_0_#000] md:text-2xl">
              {overlay.title}
            </p>
            {phase === "over" && (
              <>
                <p className="text-xs">FINAL SCORE {result?.score ?? game.score}</p>
                <p className="px-6 text-center text-[10px] leading-relaxed text-slate-300">
                  Start a new session to play again.
                </p>
              </>
            )}
            {overlay.label && (
              <button
                onClick={phase === "paused" ? togglePause : start}
                className={primaryBtn}
              >
                {overlay.label}
              </button>
            )}
          </div>
        )}
      </div>

      <DPad onDirection={changeDirection} />

      <p className="max-w-[90vw] text-center text-[10px] leading-relaxed text-slate-400">
        <span className="hidden md:inline">ARROWS / WASD MOVE - SPACE OR P PAUSE</span>
        <span className="md:hidden">SWIPE THE BOARD OR USE THE BUTTONS</span>
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
