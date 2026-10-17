"use client";

import Board from "@/components/Board";
import DPad from "@/components/DPad";
import { useSnakeGame } from "@/hooks/useSnakeGame";
import { useSwipe } from "@/hooks/useSwipe";

const primaryBtn = "rounded bg-emerald-600 px-5 py-2 font-semibold hover:bg-emerald-500 touch-manipulation";

export default function SnakePage() {
  const { game, phase, start, togglePause, changeDirection, actionLog } = useSnakeGame();
  const swipe = useSwipe(changeDirection);

  return (
    <main className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col items-center gap-3 p-4 select-none touch-manipulation">
      <h1 className="text-2xl font-bold md:text-3xl">Snake</h1>

      <div className="flex items-center gap-5 text-base md:text-lg">
        <span>Score: {game.score}</span>
        <span>Apples: {game.apples_eaten}</span>
        {(phase === "playing" || phase === "paused") && (
          
          <button
            onClick={(e) => {
              e.currentTarget.blur(); 
              togglePause();
            }}

            className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">
              {phase === "paused" ? "Resume" : "Pause"}
          </button>
        )}
      </div>

     
      <div className="relative touch-none" {...swipe}>
          <Board board={game.board} snake={game.snake} apple={game.apple} />

        {phase !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            {phase === "idle" && (
                <>
                  <p className="text-xl">Ready?</p>
                  <button onClick={start} className={primaryBtn}>Start</button>
               </>
            )}

            {phase === "paused" && (
              <>
                  <p className="text-2xl font-bold">Paused</p>
                  <button onClick={togglePause} className={primaryBtn}>Resume</button>
              </>
            )}

            {phase === "over" && (
              <>
                <p className="text-2xl font-bold">
                    {game.status === "WON" ? "You won!" : "Game over"}
                </p>
                <p>Final score: {game.score}</p>
                <button onClick={start} className={primaryBtn}>Play again</button>
              </>
            )}
          </div>
        )}
      </div>

      <DPad onDirection={changeDirection} />

      <p className="text-center text-sm text-slate-400">
        <span className="hidden md:inline">Arrow keys / WASD to move, Space or P to pause</span>
        <span className="md:hidden">Swipe on the board or use the buttons</span>
      </p>

      {phase === "over" && (
        <details className="w-[min(90vw,480px)] text-xs text-slate-400">
          <summary className="cursor-pointer">Action log </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-800 p-3">
            {JSON.stringify(actionLog, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}