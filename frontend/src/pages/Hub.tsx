import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'

type ArtworkType = 'mine' | 'wordle' | 'snake' | 'tetris' | 'pacman'

type Game = {
  name: string
  path: string
  description: string
  category: string
  color: string
  ready: boolean
  art: ArtworkType
}

const games: Game[] = [
  {
    name: 'Minesweeper',
    path: '/minesweeper',
    description: 'Read the numbers. Clear the board. Avoid the mines.',
    category: 'LOGIC',
    color: 'var(--c-mine)',
    ready: true,
    art: 'mine',
  },
  {
    name: 'Wordle',
    path: '/wordle',
    description: 'Beat the clock. Crack as many words as you can.',
    category: 'WORDS',
    color: 'var(--c-wordle)',
    ready: true,
    art: 'wordle',
  },
  {
    name: 'Snake',
    path: '/snake',
    description: 'Keep growing. Keep moving. Stay out of your own way.',
    category: 'REFLEX',
    color: 'var(--c-snake)',
    ready: true,
    art: 'snake',
  },
  {
    name: 'Tetris',
    path: '/tetris',
    description: 'Make every block count. Leave no gaps behind.',
    category: 'PUZZLE',
    color: 'var(--c-tetris)',
    ready: true,
    art: 'tetris',
  },
  {
    name: 'Pac-Man',
    path: '/pacman',
    description: 'Clear the maze. Dodge the ghosts. Chase the high score.',
    category: 'CHASE',
    color: 'var(--c-pacman)',
    ready: true,
    art: 'pacman',
  },
]

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
}

function Artwork({ type }: { type: ArtworkType }) {
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

function GameContent({ game, index }: { game: Game; index: number }) {
  return (
    <>
      <div className="home-game-meta">
        <span>
          {String(index + 1).padStart(2, '0')} / {game.category}
        </span>

        <span className={game.ready ? 'home-live' : undefined}>
          {game.ready ? 'PLAY NOW' : 'COMING SOON'}
        </span>
      </div>

      <div className="home-game-art">
        <Artwork type={game.art} />
      </div>

      <div className="home-game-info">
        <div>
          <h3>{game.name}</h3>
          <p>{game.description}</p>
        </div>

        <span className="home-game-arrow" aria-hidden="true">
          {game.ready ? '↗' : '—'}
        </span>
      </div>
    </>
  )
}

export default function Hub() {
  const available = String(games.filter((game) => game.ready).length).padStart(
    2,
    '0',
  )

  const total = String(games.length).padStart(2, '0')

  return (
    <main className="home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-kicker">CODING CLUB PRESENTS</p>

        <h1 id="home-title">
          THE ARCADE<span>.</span>
        </h1>

        <div className="home-intro-bottom">
          <p>
            Old-school games. Fresh competition.
            <br />
            Pick a game and make your score count.
          </p>

          <Link to="/leaderboard" className="home-leaderboard-link">
            View leaderboard <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <section className="home-games" aria-labelledby="games-title">
        <div className="home-section-title">
          <h2 id="games-title">SELECT A GAME</h2>
          <span>
            {available} AVAILABLE / {total} TOTAL
          </span>
        </div>

        <div className="home-grid">
          {games.map((game, index) => {
            const style = {
              '--game': game.color,
            } as CSSProperties

            if (game.ready) {
              return (
                <Link
                  key={game.name}
                  to={game.path}
                  className="home-game"
                  style={style}
                  aria-label={`Play ${game.name}`}
                >
                  <GameContent game={game} index={index} />
                </Link>
              )
            }

            return (
              <article
                key={game.name}
                className="home-game home-game-soon"
                style={style}
                aria-label={`${game.name}, coming soon`}
              >
                <GameContent game={game} index={index} />
              </article>
            )
          })}
        </div>
      </section>

      <footer className="home-footer">
        <span>CODING CLUB · BITS PILANI</span>
        <span>ONE MORE ROUND?</span>
      </footer>
    </main>
  )
}
