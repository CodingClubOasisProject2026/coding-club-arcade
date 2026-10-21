export default function Board({ board, snake, apple }) {
  const snakeCells = new Map(
    snake.map(([x, y], i) => [`${x},${y}`, i === 0 ? "head" : "body"])
  );
  const appleKey = apple ? `${apple[0]},${apple[1]}` : null;

  const cells = [];
  for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            const key = `${x},${y}`;
            const part = snakeCells.get(key);

            let color = "bg-slate-800";
            if (part === "head") color = "bg-emerald-300";
            else if (part === "body") color = "bg-emerald-500";
            else if (key === appleKey) color = "bg-red-500 rounded-full scale-75";

            cells.push(<div key={key} className={`aspect-square ${color}`} />);
        }
  }

   return (
    <div className="grid gap-px bg-slate-700 p-px select-none w-[min(92vw,48dvh,480px)] md:w-[min(70dvh,520px)]" style={{ gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))` }}>
      {cells}
    </div>
  );
}