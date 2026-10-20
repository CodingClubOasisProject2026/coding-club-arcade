import { useRef } from "react";

const THRESHOLD_PX = 24;

export function useSwipe(onSwipe) {
  const origin = useRef(null);

  return {
    onPointerDown(e) {
      if (e.pointerType === "mouse") return;
      origin.current = { x: e.clientX, y: e.clientY };
    },
    onPointerMove(e) {
      if (!origin.current) return;
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < THRESHOLD_PX) return;

      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "RIGHT" : "LEFT");
      else onSwipe(dy > 0 ? "DOWN" : "UP");

      origin.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp() {
      origin.current = null;
    },
    onPointerCancel() {
      origin.current = null;
    },
  };
}