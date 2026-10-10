# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Riftclash is a browser card battle game (Hearthstone-like, original card set) written in vanilla JS ES modules. There are no dependencies and no build step. The README is the player-facing and feature reference; this file covers how the code fits together.

## Commands

```bash
npm start                                     # static server at http://localhost:8080 (PORT=xxxx to change)
npm test                                      # node --test test/*.test.js
node --test test/engine.test.js               # one test file
node --test --test-name-pattern="silence" test/*.test.js   # tests whose name matches
```

- ES modules don't load over `file://`, so the page always needs a server. The game is also deployed as a static site (GitHub Pages).
- `/sprites.html` shows every registered sprite. It reports bad sprite data (short rows, unknown colours) with the exact row and column.
- There is no linter or formatter config. Match the surrounding style: 2-space indent, single quotes, semicolons, dense one-line helpers.

## Architecture

### Rules engine is separate from the UI
- `src/engine.js` (`Game`) holds all game rules and has no DOM. It is deterministic for a given `seed` (mulberry32), which is why tests can run full AI games.
- The human is always player 0 and the AI is player 1. The UI never changes game state directly; it calls `playCard` / `attack` / `useHeroPower` / `endTurn` / `mulligan`.

### Classes, heroes and cards are data
- `src/cards.js` holds `CLASSES`, `HEROES` and `CARDS`.
- **Classes and heroes are separate.** A class is a card pool, colour and `defaultHero`. A hero (`HEROES`) has a name, a `portrait`, a `cls` and its own `heroPower`. Several heroes can share a class.
- **The Riftkin** (`RIFTKIN` in `cards.js`: Zarth, Gal'kun, Ylva, Manus, Grun) are Celestial heroes with `boss: true`, plus a `title` and `lore` for their profiles. Boss heroes are never offered to the player (`playerHeroes()` excludes them). All but Grun share Aurion's hero power; Grun's *Wrath of the Night* summons the `t_riftdemon` token. Their art is in `src/sprites/riftkin.js`.
- `new Game({ heroes: [id, id] })` takes hero ids. `classes: [...]` still works and means each class's default hero. Players carry both `heroId` (portrait, hero power) and `heroClass` (deck, colours, stats). Use `game.heroPower(pid)`, `defaultHero(cls)` and `classArt(cls)` rather than reading hero fields off a class. Effects are small objects (`{ type: 'damage', amount, to: 'target' }`) that the engine interprets in `#runEffects` / `#resolveEffect`.
- Hooks: `effects`, `battlecry`, `deathrattle`, `combo`, `endOfTurn`, `onDamaged`, `onFriendlySpell`, `adjacentAura`.
- Target selectors are listed at the top of `cards.js`.
- A new mechanic usually means a new effect `type` in the engine, plus AI handling in `src/ai.js`, plus a UI event handler.
- Hero Attack is `weapon attack + hero.bonusAttack` (the `heroAttack` effect; the bonus clears at end of turn). Always change it through `#syncHeroAttack`, never by assigning `hero.attack` directly.

### Hidden classes
- A class with `hidden: true` (Celestial) must not appear anywhere until it's unlocked. `src/unlocks.js` holds the unlock state (`riftclash-unlocks`). Any UI that lists classes or cards must filter with `isVisible(cls, unlocks)` / `visibleClasses()`, and `filterCards` takes `unlocks`.
- For play-testing there's a secret code typed on the main menu (see `SECRET_CODE` in `unlocks.js`). Don't document it in the README, which is public. Boss battles will unlock the class for real through `setUnlocked`.
- `buildDeck` uses a random 8 of a class's cards when it has more than 8, so every deck stays 30 cards.
- Whenever the engine needs a minion's behaviour, look it up through `game.minionText(m)`, never `CARDS[m.cardId]`. A silenced minion returns text-less data, so this is what keeps Silence working.

### Engine events drive the animations
- The engine pushes events (`play`, `damage`, `summon`, `death`, `silence`, ...) carrying presentation metadata (`fx`/`fxSeq` grouping, `from`, `spell`, `combat`, `cardId`).
- `flushEvents()` in `src/ui.js` replays them as animations, sounds and effects, then re-renders.
- New engine events need a matching case in the UI's effect handlers, or they won't be shown.

### AI
- `src/ai.js` is a greedy AI. `nextAction` returns one action at a time so the UI can animate the AI's turn.
- `playTurn` runs a whole turn, and is used in tests.
- `engine.test.js` runs AI-vs-AI games across every class pairing (hidden classes included), so engine or AI changes that hang or crash games fail the tests.

### `src/ui.js` is the app shell
- It renders the board, handles input (drag and click placement), and directs the animations.
- **Splash screen:** when the game opens, `#splash` sits over the title screen (`mountSplash` in `ui.js`). Any key except modifiers, Tab and Escape, or a click or tap, dismisses it. That same gesture unlocks audio and starts the menu music (browsers block audio until a gesture), and plays `sfx.enter()`. Its pieces are pure and tested in `src/splash.js`:
  - the pixel backdrop (`createSplash`, shown with `mountScene`);
  - the rune glyphs and the SVG builders for the rings (`runeRingSVG`, `ticksSVG`, `hexagramPath`);
  - the sigil layout (`sigilPoints`). The sigils only ever show non-hidden classes.
- `showScreen(id)` switches between `menu` (the title screen: game modes plus Deck Builder, Library, Quests), `play` (champion, deck and opponent selection for the standard mode), `bosses` (Challenge the Riftkin: boss, champion and deck selection), `library`, `decks`, `quests`, `mulligan` and `table`. `menu`, `play` and `bosses` share the menu battle scene and theme.
- Game modes are data in `src/modes.js` (`{ id, name, text, icon, screen }`); the title screen renders one tile per mode, and picking one opens its `screen`. Mode emblems are sprites in `src/sprites/modes.js`.
- A mode with `unlock: { quests, hint }` is locked until those quests are complete (`isModeUnlocked`, `unlockProgress` in `modes.js`); the title screen shows it as a mystery ("???" with a question-mark emblem, so the name stays secret) with the hint and a count, and the result screen reveals and announces it when a game completes its last quest. Don't name a locked mode anywhere else a player would see it, including the README. *Challenge the Riftkin* (`riftkin`) needs the six Champion's Trials (`CHAMPION_QUESTS` in `progress.js`: win 5 games as each visible class). The play-test code (`isPlaytest`) opens every locked mode as well as Celestial. Opening the mode does not reveal Celestial; beating the Riftkin is meant to. In a boss battle the AI plays the chosen Riftkin hero (`ui.boss`) with the Celestial deck, and `recordGame` gets `boss` so `stats.byBoss` keeps a record per boss.
- When the screen changes, the same function also:
  - selects the music track (`playTrack`)
  - shows or hides that screen's animated backdrop
  - toggles body classes the CSS relies on (`on-menu`, `in-archive`, `in-forge`, `on-board`, `has-backdrop`, `in-game`, `busy`)
- Other screens are mounted lazily from their own modules:
  - `library.js`: the card library
  - `deckbuilder.js` with `decks.js`: the deck builder
  - `questscreen.js` with `progress.js`: the quest board
- `cardview.js` renders card faces for every screen.

### Node-testable vs browser-only modules
- **Browser-only:** `music.js`, `sfx.js`, `fx.js` and `ui.js` touch `document`, `matchMedia` or Web Audio when imported, so tests can't import them.
- **Pure, so tests can import them:** game logic, data, and anything the tests check (cards, engine, ai, decks, progress, songs, pixelart, scenes).
- **Rule:** keep anything you want to test in a pure module. For example, `menuplan.js` holds the main-menu choreography and was split out of `menuscene.js`, which does the drawing, for exactly this reason.

### Pixel art
- `src/pixelart.js` defines sprites as text grids plus palettes, rendered to SVG with optional auto-outline and layers.
- Sprite modules live in `src/sprites/`, use the shared class palettes in `palettes.js`, and are registered in `src/sprites/index.js`.
- Cards and hero powers point at their art with `sprite: 'id'`; heroes use `portrait`. A card's `emoji` is the fallback.
- `test/pixelart.test.js` requires every card (including tokens) and every hero power to have a registered sprite, so a new card needs art.

### Screen backdrops
- **Battle boards:** `backgrounds.js` (layered scene data) shown by `backdrop.js`. Boards marked `boss: true` never come up at random (`pickBackground`); a boss hero's `board` in `cards.js` names the one it fights on (the Celestial Realm for four of the Riftkin, the Citadel of Endless Night for Grun).
- **Library, deck builder and quests:** `archive.js`, `forge.js` and `questboard.js` paint into RGBA buffers using helpers from `pixelbuf.js`. Each exports `create<Scene>(width)` returning `{ width, height, render(t) }`. `render(t)` is a pure function of time.
- They are shown by `sceneview.js` → `mountScene(canvas, { width, create, fps, stillAt, time })`. This sizes the canvas to the viewport's aspect, runs only while that screen is shown and the tab is visible, and draws a still frame under `prefers-reduced-motion`.
- **Tests enforce readability limits** on each scene: mean and 95th-percentile brightness, how many pixels may change sharply between frames, and determinism. A brighter or busier scene needs its colours toned down, not the thresholds raised.
- **Main menu:** `menuscene.js` is the exception. It's a canvas-2D battle scene; its choreography is in `menuplan.js`.

### Music
- `src/songs.js` holds songs in a tracker notation: one 16-step string per bar.
  - Notes: `D5` starts a note, `-` holds it, `.` rests.
  - Drums: `k`/`s`/`h` are kick, snare and hi-hat; `a`/`t`/`b` are anvil, hammer tap and bellows.
  - `compileSong` validates a song and turns it into timed events. `test/songs.test.js` asserts each screen has a track and checks each track's relative tempo, volume and density.
- `src/music.js` synthesises the songs live (NES-style pulse, triangle and noise voices) with crossfades between tracks.
- Battle music belongs to the board: each entry in `BACKGROUNDS` names its track (`music`, a song id), and `battleTrack()` in `ui.js` plays the current board's track (falling back to `battle`). The tracks:
  - Highkeep: `highkeep`;
  - The Frozen Pass: `frozenpass`;
  - Field of Embers: `battle`, the original battle theme;
  - Moonwood: `moonwood`;
  - The Riven Sanctum: `sanctum`;
  - The Ancient Crypt: `crypt`;
  - the Riftkin's boss boards: `riftkin` (the battle theme made menacing) for the Celestial Realm and `grun` (more intense) for the Citadel.
  `songs.test.js` keeps every board's track as calm as `battle`, no two boards sharing one, and the boss tracks' tempo, density and volume relative to `battle` and `menu`.
- A song with `loop: false` is a stinger: `playStinger(id)` plays it once and silence follows (`wanted` is cleared, so nothing restarts until the next `playTrack`). When a battle ends, `gameOverFx` calls `stopMusic()` and then plays `victory` (or the beaten hero's `victoryMusic`: `grunVictory` for Grun) or `defeat`. A test keeps each stinger to about 5 seconds. The result overlay then comes in two steps (`showResult`, then `showQuestProgress` in `ui.js`): the result alone while the stinger plays, a Continue button as it ends (`songSeconds`), then the quest bars filling with their own chimes, then Rematch / Change class.
- `beatClock()` exposes the playing track's position in beats, so visuals can keep time:
  - The menu scene locks onto it.
  - The forge scene maps it to scene time with `MUSIC_OFFSET`. One forge bar (80 BPM) is one `HAMMER_PERIOD`, and a test enforces this.

### Persistence
- Everything is saved in `localStorage` under `riftclash-*` keys (decks, deck choice, progress, quests-seen, library tab, music, muted).
- Every read and write is wrapped in try/catch, and loaded data goes through a `sanitize*` function (unknown cards, classes or quests are dropped; bad numbers become 0). Keep that pattern for new saved data.
- Quests are entries in `QUESTS` in `src/progress.js`: `{ id, title, text, goal, progress(stats), reward? }`. Completion is stored with a timestamp and is permanent.
- **Quest rewards** (`src/rewards.js`): `reward: { cards }` keeps those cards locked until the quest is complete (list a reward card's tokens too). `lockedCards()` gives the locked ids; pass that set as `locked` to `filterCards`, the `decks.js` rules (`isPlayable`, `addBlocker`, `autoFill`, ...), `buildDeck` and `new Game({ locked })`. Each reward is announced once (`riftclash-rewards-seen` stores the card ids): on the result screen, or by a title-screen notice for rewards not yet shown, such as a quest completed before it had one. The play-test code unlocks reward cards too.
