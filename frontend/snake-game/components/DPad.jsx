const btn =
  "h-14 w-14 border-4 border-black bg-stone-500 text-lg text-black shadow-[3px_3px_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none select-none touch-none";

export default function DPad({ onDirection }) {
  const press = (dir) => (e) => {
    e.preventDefault();
    onDirection(dir);
  };

  return (
    <div className="grid grid-cols-3 gap-2 md:hidden">
      <span />
      <button className={btn} onPointerDown={press("UP")}>▲</button>
      <span />
      <button className={btn} onPointerDown={press("LEFT")}>◀</button>
      <span />
      <button className={btn} onPointerDown={press("RIGHT")}>▶</button>
      <span />
      <button className={btn} onPointerDown={press("DOWN")}>▼</button>
      <span />
    </div>
  );
}
