export type ArtworkType = 'mine' | 'wordle' | 'snake' | 'tetris' | 'pacman' | 'flappy'

const patterns: Record<Exclude<ArtworkType, 'wordle'>, string[]> = {
  mine: [
    '0001000',
    '0101010',
    '0011100',
    '1111111',
    '0011100',
    '0101010',
    '0001000',
  ],
  pacman: [
    '0011100',
    '0111110',
    '1111100',
    '1111000',
    '1111100',
    '0111110',
    '0011100',
  ],
  snake: [
    '0000000',
    '0111110',
    '0100010',
    '0101110',
    '0100000',
    '0111101',
    '0000000',
  ],
  tetris: [
    '0000000',
    '0011100',
    '0001000',
    '0000000',
    '1000011',
    '1100111',
    '1111111',
  ],
  flappy: [
    '0000000',
    '0111000',
    '1111100',
    '1110110',
    '1111100',
    '0111000',
    '0000000',
  ],
}

export default function GameArtwork({ type }: { type: ArtworkType }) {
  if (type === 'wordle') {
    return (
      <div className="home-word" aria-hidden="true">
        {'GUESS'.split('').map((letter, index) => (
          <span key={index}>{letter}</span>
        ))}
      </div>
    )
  }

  return (
    <div className="home-pixels" aria-hidden="true">
      {patterns[type]
        .join('')
        .split('')
        .map((cell, index) => (
          <span key={index} className={cell === '1' ? 'filled' : undefined} />
        ))}
    </div>
  )
}
