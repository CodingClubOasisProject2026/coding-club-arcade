Copy into your Next.js project (the folder with next.config.ts; if you use src/, put app/ and components/ under src/ but keep public/ at the root):

  public/snake/*.png            -> <project>/public/snake/   (24 sprites, overwrite old ones)
  components/Board.jsx          -> replace
  components/DPad.jsx           -> replace
  components/DungeonBackdrop.jsx-> NEW (chains, torches, barrels, crates)
  app/layout.tsx                -> replace  (adds Press Start 2P font)
  app/page.tsx                  -> replace  (put it at your route, e.g. app/snake/page.tsx)
  styles/dungeon.css.txt        -> paste at the END of app/globals.css
                                   (if you pasted the older version, delete that block first)
