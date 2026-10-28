import { snakeSprite } from '../../cdn'

const CHAINS = [
  { side: 'left' as const, at: '3%', len: 120 },
  { side: 'left' as const, at: '7%', len: 220 },
  { side: 'left' as const, at: '11%', len: 80 },
  { side: 'right' as const, at: '3%', len: 90 },
  { side: 'right' as const, at: '7%', len: 200 },
  { side: 'right' as const, at: '11%', len: 140 },
]

const Img = ({ name, w, h }: { name: string; w: number; h: number }) => (
  <img src={snakeSprite(name)} alt="" width={w} height={h} draggable={false} />
)

export default function DungeonBackdrop() {
  return (
    <div className="dg-root" aria-hidden="true">
      {CHAINS.map((c, i) => (
        <div key={i} className="dg-chain" style={{ [c.side]: c.at }}>
          <div className="dg-links" style={{ height: c.len }} />
          <Img name="chain_ring" w={32} h={48} />
        </div>
      ))}

      {(['left', 'right'] as const).map((side) => (
        <div key={side} className="dg-torch" style={{ [side]: '19%', top: '26%' }}>
          <div className="dg-glow" />
          <div className="dg-flame" />
        </div>
      ))}

      <div className="dg-pile" style={{ left: '1.5%' }}>
        <div className="dg-col">
          <Img name="crate" w={48} h={48} />
          <Img name="barrel" w={60} h={72} />
        </div>
        <Img name="barrel" w={60} h={72} />
        <div className="dg-col">
          <Img name="crate" w={48} h={48} />
          <Img name="crate" w={48} h={48} />
        </div>
      </div>

      <div className="dg-pile" style={{ right: '1.5%' }}>
        <div className="dg-col">
          <Img name="crate" w={48} h={48} />
          <Img name="crate" w={48} h={48} />
        </div>
        <Img name="barrel" w={60} h={72} />
        <div className="dg-col">
          <Img name="barrel" w={60} h={72} />
          <Img name="barrel" w={60} h={72} />
        </div>
      </div>
    </div>
  )
}
