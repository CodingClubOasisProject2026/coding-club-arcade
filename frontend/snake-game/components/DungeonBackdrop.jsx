// Self-contained dungeon scene (wall, chains, torches, barrels, crates).
const D = "/snake";

const CHAINS = [
  { side: "left", at: "3%", len: 120 },
  { side: "left", at: "7%", len: 220 },
  { side: "left", at: "11%", len: 80 },
  { side: "right", at: "3%", len: 90 },
  { side: "right", at: "7%", len: 200 },
  { side: "right", at: "11%", len: 140 },
];

const css = `
.dg-root{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;
  background-color:#3b2a1e;
  background-image:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 35%,rgba(0,0,0,.7) 100%),url(${D}/dungeon_wall.png);
  background-size:auto,96px 96px;image-rendering:pixelated}
.dg-root img{display:block;image-rendering:pixelated}
.dg-chain{position:absolute;top:0;display:flex;flex-direction:column;align-items:center}
.dg-links{width:32px;background:url(${D}/chain.png) repeat-y;background-size:32px 32px;image-rendering:pixelated}
.dg-col{display:flex;flex-direction:column;align-items:center}
.dg-pile{position:absolute;bottom:12px;display:none;align-items:flex-end;gap:4px}
.dg-torch{position:absolute;display:none}
.dg-flame{width:48px;height:120px;background:url(${D}/torch_sheet.png) no-repeat;background-size:144px 120px;
  image-rendering:pixelated;animation:dg-flicker .45s steps(3) infinite}
.dg-glow{position:absolute;left:50%;top:0;width:360px;height:360px;transform:translate(-50%,-22%);
  background:radial-gradient(circle,rgba(255,160,50,.38) 0%,rgba(255,120,30,.14) 40%,rgba(255,120,30,0) 70%);
  animation:dg-glow 1.3s steps(4) infinite}
@keyframes dg-flicker{from{background-position-x:0}to{background-position-x:-144px}}
@keyframes dg-glow{0%,100%{opacity:1}25%{opacity:.8}50%{opacity:.95}75%{opacity:.7}}
@media(min-width:768px){.dg-pile{display:flex}}
@media(min-width:1024px){.dg-torch{display:block}}
@media(prefers-reduced-motion:reduce){.dg-flame,.dg-glow{animation:none}}
`;

const Img = ({ name, w, h }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={`${D}/${name}.png`} alt="" width={w} height={h} draggable={false} />
);

export default function DungeonBackdrop() {
  return (
    <div className="dg-root" aria-hidden="true">
      <style>{css}</style>

      {CHAINS.map((c, i) => (
        <div key={i} className="dg-chain" style={{ [c.side]: c.at }}>
          <div className="dg-links" style={{ height: c.len }} />
          <Img name="chain_ring" w={32} h={48} />
        </div>
      ))}

      {["left", "right"].map((side) => (
        <div key={side} className="dg-torch" style={{ [side]: "19%", top: "26%" }}>
          <div className="dg-glow" />
          <div className="dg-flame" />
        </div>
      ))}

      <div className="dg-pile" style={{ left: "1.5%" }}>
        <div className="dg-col"><Img name="crate" w={48} h={48} /><Img name="barrel" w={60} h={72} /></div>
        <Img name="barrel" w={60} h={72} />
        <div className="dg-col"><Img name="crate" w={48} h={48} /><Img name="crate" w={48} h={48} /></div>
      </div>

      <div className="dg-pile" style={{ right: "1.5%" }}>
        <div className="dg-col"><Img name="crate" w={48} h={48} /><Img name="crate" w={48} h={48} /></div>
        <Img name="barrel" w={60} h={72} />
        <div className="dg-col"><Img name="barrel" w={60} h={72} /><Img name="barrel" w={60} h={72} /></div>
      </div>
    </div>
  );
}