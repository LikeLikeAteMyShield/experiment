# Riftclash

A browser-based card battle game, with six classes and an original set of 70+ cards. You play against an AI opponent.

## Running it

```bash
npm start        # serves the game at http://localhost:8080 (PORT=xxxx to change)
npm test         # rules-engine tests + full AI-vs-AI games for every class pairing
```

It has no dependencies and no build step. ES modules don't load over `file://`, so the page needs a server. Any static host works, including GitHub Pages.

## How to play

The game opens on a splash screen: the title inside rings of glowing runes, the six class sigils around it, and the Rift tearing open behind. Press any key (or click or tap) to enter. That's also what lets the browser start the music, since browsers don't play sound until you interact with the page.

The title screen offers the game modes. **Enter the Rift** is open from the start: pick it, choose your champion (class), deck and opponent, then **Begin battle**. A second mode starts locked, its name hidden: complete all six Champion's Trials (see Quests) to discover it. Until then its tile shows how many trials you've completed. **Deck Builder**, **Card Library** and **Quests** are on the title screen too. Game modes are defined in `src/modes.js`.

- Each hero starts with 30 Health. You gain a Mana Crystal every turn, up to 10.
- The player going first starts with 3 cards. The player going second starts with 4 cards plus the **Ember Coin** (gain 1 mana this turn). You can mulligan your opening hand.
- **Drag a minion** onto your side of the board and drop it where you want it; a gap opens to show where it will land. You can also click the minion, then click a spot on the board (handy on touch screens).
- **Click a spell** to cast it. If a card needs a target, valid targets glow red and you click one.
- **Click a minion (or your armed hero)** that glows green, then click what it should attack.
- **Hero power** costs 2 and can be used once per turn.
- Right-click or press Esc to cancel a selection. Hover any minion or weapon to read its full card.
- Position matters: some minions affect the minions **adjacent** to them. Tokens from a Battlecry appear to the minion's right, and Deathrattle tokens take the dead minion's spot.
- Boards hold 7 minions (extra summons are lost) and hands hold 10 cards; a card drawn into a full hand is burned. Drawing from an empty deck deals growing fatigue damage.

### Deck builder

Open **Deck Builder** from the main menu to make your own decks. Each deck has a name and belongs to one class. It holds exactly 30 cards, drawn from that class's cards and the neutral cards, with at most 2 copies of each.

- **New deck**: pick a class, then type a name.
- **Adding and removing cards**: click a card to add it. Right-click it, or click its row in the deck list, to take one out. Hover a row to see the full card.
- **Mana curve**: the bars above the list show how many cards you have at each cost.
- **Auto-fill**: tops the deck up to 30 cards. The class's own cards go in first, then neutrals chosen to round out the curve. **Clear** empties the deck (click twice).
- **Saving**: changes save as you go, in your browser's local storage. Decks stay on this browser only, and clearing site data deletes them.

On the champion selection screen, the **Deck** dropdown lists the standard deck plus your finished decks for the chosen class. The menu remembers the last deck you picked for each class. Unfinished decks are listed but can't be selected until they have 30 cards. **Play** on a finished deck jumps to champion selection with that class and deck selected. The AI always uses a standard deck.

The deck builder is set in a blacksmith's forge at night:
- A brick hearth glows under its stone hood, swelling each time the bellows pump, with sparks flying up the chimney.
- An enchanted hammer rises over the anvil by itself and rings down on a glowing blade in a shower of sparks.
- Steam curls off the quench barrel, and swords, axes and shields on the walls catch the firelight.

While the forge music plays, the hammer lands on every anvil strike in the song and the bellows pump as they breathe.

Like the archive, it's painted into a pixel buffer (`src/forge.js`), so `npm test` checks it stays dark enough to work over and never flashes the room.

### Quests

Quests are goals that track your progress across games, like achievements. Every finished game is added to your record, and a quest is marked complete (for good) once its goal is met. The quests are:

- **Proven in Battle**: *win 5 games*. Reward: five new neutral cards, hidden until you earn them.
- **The Champion's Trials**: *win 5 games* as each class: the Trial of Flame (Pyromancer), Iron (Warlord), the Hunt (Stalker), Light (Oracle), the Shield (Vanguard) and Shadows (Shade). Completing all six unlocks a new game mode.

- **Quests** on the main menu opens the Quest Board. Each quest is a parchment notice pinned to the board, showing your progress and a "Complete" stamp with the date once you've done it.
- Beside the board, the **Adventurer's Record** shows your games, wins, losses, draws, win rate and best win streak, plus wins and losses for each champion you've played.
- After a battle, the result screen shows your record. If the game moved a quest forward, **Continue** shows the progress: each bar fills from where it was, and a completed quest is stamped with a fanfare. A quest with a reward reveals the cards it unlocks, and when a quest completes the last of the trials, the new mode is announced too. A reward you haven't been shown yet (say, for a quest you completed before it had one) is announced on the title screen instead. The menu's Quests button then shows a "new" badge until you look.
- Stats and quests are saved in your browser's local storage.

The board hangs in an adventurers' guild at first light, painted in pixel art like the other screens:
- Papers crowd the board, including a wanted poster and a route map marked with an X, and a few corners flutter in the breeze.
- Dawn glows through a window, where clouds and birds drift by, and a warm sunbeam full of dust slants across the room.
- Lanterns flicker either side, and a packed rucksack, rope and rolled map wait on the bench below.

Quests are defined in `src/progress.js`. Adding one is a single entry: an id, a title, a description, a goal, and a function that reads its progress from the stats. An optional `reward: { cards }` keeps those cards (and any tokens they make) out of the library, the deck builder and every deck until the quest is complete; see `src/rewards.js`.

### Card library

Open **Card Library** from the main menu to browse every card. Filter by class with the tabs (All, each class, Neutral), narrow by mana cost or by searching names and rules text, and tick **Show tokens** to include cards that only appear in play. Click any card for a closer look with its keywords explained; use the arrow keys to flip through and Esc to close.

The library is set in an ancient archive at night, painted in pixel art behind the cards and kept dim and slow-moving so the cards stay easy to read:
- Towering bookshelves flank a tall lancet window, with the moon behind its leaded glass and a shaft of moonlight full of drifting dust.
- Candles flicker on the shelves, on iron candelabras and floating in the air.
- Runes glow faintly on the pillars.
- A rune circle turns slowly on the floor beneath a floating tome, which sheds glowing glyphs.
- Motes of teal, violet and gold magic drift upward.

It's drawn by `src/archive.js` into a pixel buffer with no DOM, so `npm test` checks it stays dark, calm and deterministic. It pauses when you leave the library, and shows a still frame with "reduce motion" on.

### Effects and sound

Played cards fly to the center of the table. Spells burst into particles and shoot projectiles at their targets, and area spells send out a shockwave. Attacks wind up and lunge with an impact flash and screen shake. Minions slam onto the board and shatter when they die.

Every sound is synthesized live with the Web Audio API, so there are no audio files. Use the 🔊 button in the top-left corner to mute everything; the setting is remembered. With your system's "reduce motion" setting on, the game skips shake and flashes and shortens the animations.

### Main menu

Behind the title screen and champion selection, a pixel art battle plays out in time with the menu theme.
- A storm sky is torn open by the Rift, which pulses on every beat and throws lightning every other bar.
- Clouds are drawn into the Rift, a castle burns on the ridge, and two armies march to meet in the middle.
- In front, the six heroes fight on a 16-beat loop:
  - The **Pyromancer** hurls fireballs, which the **Oracle**'s light turns aside.
  - The **Stalker**'s arrows glance off the **Vanguard**'s shield.
  - The **Warlord** leaps into the middle and slams the ground.
  - The **Shade** vanishes in smoke and dashes in to strike.

When the music is playing, the scene locks onto its beat. With music off it keeps the same 124 BPM time.

The scene is drawn at 180 pixels tall and as wide as your screen's shape needs. Narrower screens show fewer heroes (two pairs, then one), so no one is cut off. With "reduce motion" on, you get a single still frame. The scene pauses whenever you leave the menu or switch tabs.

The hero figures are sprites in `src/sprites/champions.js`, two poses per hero. The choreography (lineup, poses, attack schedule) is plain data and functions in `src/menuplan.js`, and `npm test` checks it.

### Battlefields

Each match is fought in front of a randomly chosen pixel art battlefield (never the same one twice in a row): *Dusk over Highkeep*, *The Frozen Pass*, *Field of Embers*, *Moonwood*, *The Riven Sanctum* and *The Ancient Crypt*. Each has subtle motion (drifting clouds, flickering castle windows, falling snow, rising embers, fireflies, a pulsing rift, guttering candles) and is dimmed so the board stays the focus; with "reduce motion" on, the scene holds still.

Scenes are built from layers in `src/backgrounds.js` (sky gradients, mountain ridges, castles, trees, particles...). `npm test` checks every scene stays dark, calm and only gently animated, so new ones can't drown out the board.

### Music

Chiptune background music in an 8-bit medieval style plays on every screen, synthesized live like the sound effects (two pulse-wave channels, a triangle bass and noise drums, as on the NES). Each screen has its own track and they crossfade as you move between them:

- **Main menu:** *Banners of the Rift*, a marching battle theme in C minor
- **Battles:** each battlefield has its own track, all slow and spacious so they stay in the background through long games:
  - *Dusk over Highkeep*: *Twilight on the Ramparts*, a plucked lute under a distant horn, with a soft march on the drum
  - *The Frozen Pass*: *Snowfall on the Pass*, cold suspended chords and high, ringing bells, with only the wind for a beat
  - *Field of Embers*: *Embers Between Turns*, a slow, smouldering A minor
  - *Moonwood*: *Under the Moonwood*, a flute-like melody over a harp, with a hand drum and crickets
  - *The Riven Sanctum*: *The Riven Sanctum*, slow swelling chords that keep slipping somewhere strange, a wavering lead and glints of light
  - *The Ancient Crypt*: *Dirge of the Crypt*
- **Card library:** *The Archivist's Lute*, gentle plucked arpeggios
- **Quests:** *The Road Ahead*, mellow but hopeful, like the night before setting out: picked arpeggios, a climbing melody and a light marching step
- **Deck builder:** *Hammer and Hearth*, a low drone with an anvil ringing on every bar, the hammer bouncing in two lighter taps, and the bellows breathing every other bar

The 🎵 button turns music on or off (remembered between visits); 🔊 mutes music and effects together. Music pauses while the tab is in the background.

Songs live in `src/songs.js` in a small tracker-style notation (one string per bar, `D5` starts a note, `-` holds, `.` rests, `k`/`s`/`h` are drums, `a`/`t`/`b` are an anvil strike, a hammer tap and the bellows), and `npm test` checks every song is well formed.

### Keywords

Taunt, Charge, Rush, Divine Shield, Windfury, Stealth, Lifesteal, Poisonous, Spell Damage, Freeze, Battlecry, Deathrattle, Combo, plus triggered effects (end of turn, on damage, on casting a spell).

**Silence** removes all card text from a minion: its keywords, Deathrattle, triggered effects, aura and Spell Damage. It also undoes everything other cards have done to the minion, such as buffs, granted keywords and Freeze, so the minion goes back to its printed Attack and Health.
- Damage it has already taken stays.
- Health only drops if a buff was holding it above its printed value, so Silence never kills a minion on its own.
- A neighbour's aura still applies to a silenced minion.
- Buffs it receives after being silenced work normally.

The neutral **Whispering Monk** (3 mana, 2/1) has *Battlecry: Silence a minion.*

## Classes

| Class | Plays like | Hero power |
|---|---|---|
| Pyromancer | burn & freeze spells | **Spark**: deal 1 damage |
| Warlord | armor, weapons, damage synergy | **Brace**: gain 2 Armor |
| Stalker | aggressive beasts & direct damage | **Volley**: 2 damage to the enemy hero |
| Oracle | healing, removal, card theft | **Mend**: restore 2 Health |
| Vanguard | tokens, buffs, divine shields | **Muster**: summon a 1/1 Recruit |
| Shade | cheap tricks, combos, daggers | **Blade Kit**: equip a 1/2 Shiv |

Classes and heroes are separate in the data (`CLASSES` and `HEROES` in `src/cards.js`). The class decides the cards and colours; the hero decides the name, portrait and hero power. Each class has a default hero, the one you play when you pick that class, and more than one hero can share a class.

Each class's standard deck is 2 copies of its 8 class cards plus 7 pairs of neutral cards chosen to give a sensible mana curve.

## Code layout

```
index.html, styles.css   page shell and visuals (CSS card frames around pixel art)
src/splash.js            the opening splash screen: its Rift backdrop, rune rings and sigil layout
src/cards.js             all card + class data, and deck building
src/engine.js            rules engine (no DOM); deterministic given a seed
src/ai.js                greedy AI: removal/trades, lethal check, curve play
src/cardview.js          card faces and keyword help, shared by the game and the library
src/library.js           the card library screen and its filters
src/archive.js           the card library's archive backdrop, painted into a pixel buffer
src/forge.js             the deck builder's forge backdrop, painted into a pixel buffer
src/progress.js          win/loss stats and quests: recording games, quest progress, saving
src/rewards.js           quest rewards: which cards are still locked, and announcing new ones once
src/questscreen.js       the quest screen and the quest notices shown after a game
src/questboard.js        the quest screen's guild-hall backdrop, painted into a pixel buffer
src/pixelbuf.js          drawing helpers shared by the archive and forge scenes
src/sceneview.js         shows and animates a pixel-buffer scene behind a screen
src/decks.js             deck rules (30 cards, 2 copies, class + neutral), auto-fill, saving to localStorage
src/deckbuilder.js       the deck builder screen
src/ui.js                rendering, input, AI turn pacing, and the animation director
                         that replays engine events as effects
src/fx.js                canvas particles, projectiles, shockwaves, screen shake
src/sfx.js               synthesized sound effects and the mute setting
src/songs.js             background music as data, and the song compiler
src/music.js             chiptune music player: NES-style voices, looping, crossfades
src/backgrounds.js       battlefield scenes as layered data, and their pixel renderer
src/backdrop.js          shows and animates the battlefield behind the board
src/menuplan.js          the main menu battle's choreography: lineup, poses, attack schedule
src/menuscene.js         draws and animates the main menu battle
src/pixelart.js          pixel art format, sprite registry and SVG renderer
src/sprites/             sprite data: palettes.js, heroes.js, powers.js (hero power icons), one file per class
                         plus neutral.js, index.js
sprites.html             gallery of every sprite, for checking art while drawing it
test/*.test.js           node:test suites (engine, decks, progress, library, songs, sprites, scenes)
server.js                tiny static file server
```

### Adding a card

Cards are plain data. Effects use a small vocabulary that the engine interprets:

```js
{ id: 'n_example', name: 'Example Drake', type: 'minion', cost: 4, attack: 3, health: 4, emoji: '🐲',
  keywords: { taunt: true },
  text: 'Battlecry: Deal 2 damage to all enemy minions.',
  battlecry: [{ type: 'damage', amount: 2, to: 'allEnemyMinions' }] }
```

- **Effect types:** `damage`, `heal`, `armor`, `draw`, `summon`, `buff`, `destroy`, `freeze`, `weapon`, `buffWeapon`, `heroAttack` (hero Attack this turn), `mana`, `bounce`, `silence`, `copyFromOpponentDeck`
- **Hooks:** `effects` (spells), `battlecry`, `deathrattle`, `combo`, `endOfTurn`, `onDamaged`, `onFriendlySpell`, `onHeroAttack` (whenever your hero attacks), and on weapons `afterFirstStrike`. Weapons can have `keywords: { windfury: true }` to let the hero attack twice.
- **Adjacency:** use `to: 'adjacent'` for the minions on either side, or `adjacentAura: { attack }` for an ongoing bonus to neighbours
- **Targets** (`target`): `any`, `minion`, `enemyMinion`, `friendlyMinion`, `enemy`, `friendly`. Narrow them with `targetFilter: { maxAttack, minAttack, damaged, undamaged }`.

The full list of selectors for `to` is at the top of `src/cards.js`.

### Adding pixel art

Every hero, hero power and card is pixel art. Each sprite is a text grid where every character is one pixel, looked up in a palette (`.` is transparent):

```js
// src/sprites/heroes.js (or a new file, e.g. src/sprites/cards.js)
import { SKIN, OUTLINE } from './palettes.js';

export default {
  card_mossling: {
    palette: [SKIN, { g: '#5fae4a', G: '#3c7a32' }], // shared colors first, then your own
    outline: OUTLINE,                                // optional: outlines the silhouette for you
    pixels: `
      ..gg..
      .gGGg.
      gGssGg
    `,
  },
};
```

1. Put the sprite in a module under `src/sprites/` and register that module in `src/sprites/index.js`.
2. Point the game data at it: `portrait: 'id'` on a hero, `sprite: 'id'` on a hero power or a card. A card's `emoji` is the fallback if its sprite is missing, but `npm test` requires every card to have art, so new cards need a sprite too.
3. Open `/sprites.html` to see every sprite at 1×, 2× and 4×. Mistakes like a short row or an unknown color are reported with the exact row and column, and `npm test` checks that every `sprite` and `portrait` reference exists.

Sprites render to SVG, so they stay sharp at any size. They can also be built from `layers` (e.g. a shared card frame plus a creature), and `spriteSVG(id, { swap })` recolors one at render time.

## Ideas for next steps

- Secrets, discover, silence, auras ("your other minions have +1 Attack")
- Attack arrows and card back art
- Smarter AI (look-ahead search over the engine, which is already headless and seedable)
- Online PvP: the engine is deterministic and could run server-authoritatively
