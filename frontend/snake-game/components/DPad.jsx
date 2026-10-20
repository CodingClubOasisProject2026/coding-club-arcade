const btn = "h-14 w-14 rounded-lg bg-slate-700 text-xl active:bg-slate-600 select-none touch-none";

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