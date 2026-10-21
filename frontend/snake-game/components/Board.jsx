"use client";

import { useEffect, useRef, useState } from "react";

const SPRITE_DIR = "/snake";
const BURST_MS = 700;

const VEC = { "1,0": "right", "-1,0": "left", "0,1": "down", "0,-1": "up" };
const CORNERS = {
  "up,right": "body_up_right",
  "right,down": "body_right_down",
  "down,left": "body_down_left",
  "left,up": "body_left_up",
};

// Direction you travel going from cell a to the adjacent cell b.
const dirTo = (a, b) => VEC[`${Math.sign(b[0] - a[0])},${Math.sign(b[1] - a[1])}`];

// snake[0] is the head, last item is the tail (same as the Django/engine state).
function spriteFor(snake, i) {
  const n = snake.length;
  if (i === 0) return `head_${n > 1 ? dirTo(snake[1], snake[0]) : "right"}`;
  if (i === n - 1) return `tail_${dirTo(snake[i - 1], snake[i])}`;

  const a = dirTo(snake[i], snake[i - 1]); // towards the head
  const b = dirTo(snake[i], snake[i + 1]); // towards the tail
  const pair = [a, b];
  if (pair.includes("left") && pair.includes("right")) return "body_h";
  if (pair.includes("up") && pair.includes("down")) return "body_v";
  return CORNERS[`${a},${b}`] || CORNERS[`${b},${a}`] || "body_h";
}

const pixelated = { imageRendering: "pixelated" };

// 8 sparks flying outward: [dx, dy, color]
const SPARKS = [
  [0, -30, "#fff4b0"], [22, -22, "#ff4d5e"], [30, 0, "#ffd24a"], [22, 22, "#ff4d5e"],
  [0, 30, "#fff4b0"], [-22, 22, "#ffd24a"], [-30, 0, "#ff4d5e"], [-22, -22, "#ffd24a"],
];

const css = `
.ap-burst{position:absolute;pointer-events:none;z-index:5}
.ap-spark{position:absolute;left:50%;top:50%;width:5px;height:5px;margin:-2px 0 0 -2px;
  box-shadow:0 0 0 1px #3a0a10;animation:ap-fly ${BURST_MS}ms steps(6) forwards}
.ap-star{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;background:#fff;
  box-shadow:0 0 0 1px #ffd24a,-6px 0 0 -1px #fff4b0,6px 0 0 -1px #fff4b0,0 -6px 0 -1px #fff4b0,0 6px 0 -1px #fff4b0;
  animation:ap-star ${BURST_MS * 0.6}ms steps(4) forwards}
.ap-score{position:absolute;left:50%;top:0;white-space:nowrap;transform:translateX(-50%);
  font:10px var(--font-arcade),monospace;color:#ffe066;text-shadow:2px 2px 0 #000,-1px -1px 0 #000;
  animation:ap-rise ${BURST_MS}ms steps(7) forwards}
@keyframes ap-fly{from{transform:translate(0,0) scale(1);opacity:1}
  to{transform:translate(var(--dx),var(--dy)) scale(.3);opacity:0}}
@keyframes ap-star{from{transform:scale(.4);opacity:1}60%{transform:scale(1.6);opacity:1}to{transform:scale(2);opacity:0}}
@keyframes ap-rise{from{transform:translate(-50%,0);opacity:1}to{transform:translate(-50%,-34px);opacity:0}}
@media(prefers-reduced-motion:reduce){.ap-spark,.ap-star{animation-duration:1ms}}
`;

function Sprite({ name }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${SPRITE_DIR}/${name}.png`}
      alt=""
      draggable={false}
      className="absolute inset-0 h-full w-full"
      style={pixelated}
    />
  );
}

function Burst({ x, y, board }) {
  return (
    <div
      className="ap-burst"
      style={{
        left: `${(x * 100) / board.width}%`,
        top: `${(y * 100) / board.height}%`,
        width: `${100 / board.width}%`,
        height: `${100 / board.height}%`,
      }}
    >
      <span className="ap-star" />
      {SPARKS.map(([dx, dy, c], i) => (
        <span
          key={i}
          className="ap-spark"
          style={{ background: c, "--dx": `${dx}px`, "--dy": `${dy}px` }}
        />
      ))}
      <span className="ap-score">+10</span>
    </div>
  );
}

export default function Board({ board, snake, apple }) {
  const [bursts, setBursts] = useState([]);
  const prevApple = useRef(null);

  // The apple jumps to a new cell (or disappears) exactly when the head lands on it.
  useEffect(() => {
    const prev = prevApple.current;
    prevApple.current = apple;
    if (!prev) return;
    const moved = !apple || apple[0] !== prev[0] || apple[1] !== prev[1];
    const [hx, hy] = snake[0];
    if (moved && hx === prev[0] && hy === prev[1]) {
      const id = `${Date.now()}-${Math.random()}`;
      setBursts((b) => [...b, { id, x: prev[0], y: prev[1] }]);
      setTimeout(() => setBursts((b) => b.filter((i) => i.id !== id)), BURST_MS + 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apple]);

  const parts = new Map(snake.map(([x, y], i) => [`${x},${y}`, spriteFor(snake, i)]));
  const appleKey = apple ? `${apple[0]},${apple[1]}` : null;

  const cells = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const key = `${x},${y}`;
      const tile = (x + y) % 2 === 0 ? "tile_a" : "tile_b";
      const part = parts.get(key);

      cells.push(
        <div
          key={key}
          className="relative aspect-square"
          style={{ backgroundImage: `url(${SPRITE_DIR}/${tile}.png)`, backgroundSize: "100% 100%", ...pixelated }}
        >
          {part ? <Sprite name={part} /> : key === appleKey ? <Sprite name="apple" /> : null}
        </div>
      );
    }
  }

  return (
    // Stone frame: 2 stone tiles thick, tiled from /snake/border_stone.png
    <div
      className="select-none w-[min(92vw,48dvh,480px)] md:w-[min(70dvh,520px)]"
      style={{
        "--t": "clamp(10px, 2.4vw, 18px)",
        padding: "calc(var(--t) * 2)",
        backgroundImage: `url(${SPRITE_DIR}/border_stone.png)`,
        backgroundSize: "var(--t) var(--t)",
        boxShadow: "0 0 0 3px #0a0910, 0 10px 0 3px #0a0910, inset 0 0 0 2px #0a0910",
        ...pixelated,
      }}
    >
      <style>{css}</style>
      {/* dark inner lip so the floor looks recessed into the stone */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
          boxShadow: "0 0 0 3px #0a0910, inset 0 0 14px 2px rgba(0,0,0,.55)",
        }}
      >
        {cells}
        {bursts.map((b) => (
          <Burst key={b.id} x={b.x} y={b.y} board={board} />
        ))}
      </div>
    </div>
  );
}
