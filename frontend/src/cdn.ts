// Image URLs on the Hack Club CDN (cdn.hackclub.com). To change an image, upload the
// new file at https://cdn.hackclub.com and replace its URL here.
export const CDN = {
  logo: 'https://cdn.hackclub.com/01a1834b-2846-7853-ba95-0093c8ee449c/logo.webp',
  favicon: 'https://cdn.hackclub.com/01a1834b-bf3b-737d-982e-ec757cb06274/favicon.svg',
  flappyBackground: 'https://cdn.hackclub.com/01a1834b-c051-7300-a24c-123c7183b5fb/flappy-bg2.webp',
  pacmanBackground: 'https://cdn.hackclub.com/01a1834b-c167-7352-89dc-c84935c686b7/arcade-bg.webp',
  tetrisBackground: 'https://cdn.hackclub.com/01a1834b-c27a-7d44-ae98-bad0434dd069/tetris-bg.webp',
  tetrisBomb: 'https://cdn.hackclub.com/01a1834b-c414-7298-bbb8-0acecd4a3a2a/bomb.webp',
} as const

export const SNAKE_SPRITES = {
  apple: 'https://cdn.hackclub.com/01a1834b-c570-7b58-b91a-7bbee238276d/apple.webp',
  barrel: 'https://cdn.hackclub.com/01a1834b-c697-7747-a0f1-9af99ab864a4/barrel.webp',
  body_down_left: 'https://cdn.hackclub.com/01a1834b-c7d4-7f73-b766-39e802640b3c/body_down_left.webp',
  body_h: 'https://cdn.hackclub.com/01a1834b-c917-7d05-9569-c260936145cb/body_h.webp',
  body_left_up: 'https://cdn.hackclub.com/01a1834b-ca30-7aa3-be01-3452bddcfddd/body_left_up.webp',
  body_right_down: 'https://cdn.hackclub.com/01a1834b-cb36-77e6-9249-131924cc8138/body_right_down.webp',
  body_up_right: 'https://cdn.hackclub.com/01a1834b-cc3b-7f54-be62-8fdd328ed1d2/body_up_right.webp',
  body_v: 'https://cdn.hackclub.com/01a1834b-cd58-7ba6-b3e1-b1622be65964/body_v.webp',
  border_stone: 'https://cdn.hackclub.com/01a1834b-ceaa-7f68-9f15-da38bc6d70eb/border_stone.webp',
  chain: 'https://cdn.hackclub.com/01a1834b-cfd9-7160-8c44-846b394d1e0d/chain.webp',
  chain_ring: 'https://cdn.hackclub.com/01a1834b-d14b-7426-a099-e392271e3464/chain_ring.webp',
  crate: 'https://cdn.hackclub.com/01a1834b-d253-7020-b665-e202df3be640/crate.webp',
  dungeon_wall: 'https://cdn.hackclub.com/01a1834b-d36f-77db-893b-29e3248bb090/dungeon_wall.webp',
  head_down: 'https://cdn.hackclub.com/01a1834b-d4c5-78fc-851e-5db7a20356d8/head_down.webp',
  head_left: 'https://cdn.hackclub.com/01a1834b-d611-7d80-bb01-71bf1606ae60/head_left.webp',
  head_right: 'https://cdn.hackclub.com/01a1834b-d746-79ed-b18c-2d9621cf4381/head_right.webp',
  head_up: 'https://cdn.hackclub.com/01a1834b-d866-7b06-9c7b-10ae605fb3d2/head_up.webp',
  tail_down: 'https://cdn.hackclub.com/01a1834b-d957-70f0-b5ca-f3505cface73/tail_down.webp',
  tail_left: 'https://cdn.hackclub.com/01a1834b-da94-7932-aa8b-add05b1c9c69/tail_left.webp',
  tail_right: 'https://cdn.hackclub.com/01a1834b-dba6-72cd-8c71-92aef57a72e1/tail_right.webp',
  tail_up: 'https://cdn.hackclub.com/01a1834b-dcf6-729e-b7d0-2b49639bf828/tail_up.webp',
  tile_a: 'https://cdn.hackclub.com/01a1834b-de9f-7d59-bd99-78f9339f2420/tile_a.webp',
  tile_b: 'https://cdn.hackclub.com/01a1834b-dfd8-74c5-b272-5a2ba8368464/tile_b.webp',
  torch_sheet: 'https://cdn.hackclub.com/01a1834b-e290-7314-b909-6b4571ba542a/torch_sheet.webp',
} as const

export type SnakeSprite = keyof typeof SNAKE_SPRITES

/** CDN URL for a snake sprite by name, e.g. snakeSprite('head_up'). */
export function snakeSprite(name: string): string {
  const url = SNAKE_SPRITES[name as SnakeSprite]
  if (!url) console.warn(`Unknown snake sprite: ${name}`)
  return url ?? ''
}
