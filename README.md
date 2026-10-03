# Riftclash

A browser-based card battle game in the style of Hearthstone, with six classes and an original set of 70+ cards. You play against an AI opponent.

## Running it

```bash
npm start        # serves the game at http://localhost:8080 (PORT=xxxx to change)
npm test         # rules-engine tests + 108 full AI-vs-AI games
```

It has no dependencies and no build step. ES modules don't load over `file://`, so the page needs a server. Any static host works, including GitHub Pages.

## How to play

- Each hero starts with 30 Health. You gain a Mana Crystal every turn, up to 10.
- The player going first starts with 3 cards. The player going second starts with 4 cards plus the **Ember Coin** (gain 1 mana this turn). You can mulligan your opening hand.
- **Drag a minion** onto your side of the board and drop it where you want it; a gap opens to show where it will land. You can also click the minion, then click a spot on the board (handy on touch screens).
- **Click a spell** to cast it. If a card needs a target, valid targets glow red and you click one.
- **Click a minion (or your armed hero)** that glows green, then click what it should attack.
- **Hero power** costs 2 and can be used once per turn.
- Right-click or press Esc to cancel a selection. Hover any minion or weapon to read its full card.
- Position matters: some minions affect the minions **adjacent** to them. Tokens from a Battlecry appear to the minion's right, and Deathrattle tokens take the dead minion's spot.
- Boards hold 7 minions (extra summons are lost) and hands hold 10 cards; a card drawn into a full hand is burned. Drawing from an empty deck deals growing fatigue damage.

### Effects and sound

Played cards fly to the center of the table. Spells burst into particles and shoot projectiles at their targets, and area spells send out a shockwave. Attacks wind up and lunge with an impact flash and screen shake. Minions slam onto the board and shatter when they die.

Every sound is synthesized live with the Web Audio API, so there are no audio files. Use the 🔊 button in the top-left corner to mute; the setting is remembered. With your system's "reduce motion" setting on, the game skips shake and flashes and shortens the animations.

### Keywords

Taunt, Charge, Rush, Divine Shield, Windfury, Stealth, Lifesteal, Poisonous, Spell Damage, Freeze, Battlecry, Deathrattle, Combo, plus triggered effects (end of turn, on damage, on casting a spell).

## Classes

| Class | Plays like | Hero power |
|---|---|---|
| Pyromancer | burn & freeze spells | **Spark**: deal 1 damage |
| Warlord | armor, weapons, damage synergy | **Brace**: gain 2 Armor |
| Stalker | aggressive beasts & direct damage | **Volley**: 2 damage to the enemy hero |
| Oracle | healing, removal, card theft | **Mend**: restore 2 Health |
| Vanguard | tokens, buffs, divine shields | **Muster**: summon a 1/1 Recruit |
| Shade | cheap tricks, combos, daggers | **Blade Kit**: equip a 1/2 Shiv |

Each deck is 2 copies of the class's 8 cards plus 7 pairs of neutral cards chosen to give a sensible mana curve.

## Code layout

```
index.html, styles.css   page shell and visuals (CSS-only card art, emoji illustrations)
src/cards.js             all card + class data, and deck building
src/engine.js            rules engine (no DOM); deterministic given a seed
src/ai.js                greedy AI: removal/trades, lethal check, curve play
src/ui.js                rendering, input, AI turn pacing, and the animation director
                         that replays engine events as effects
src/fx.js                canvas particles, projectiles, shockwaves, screen shake
src/sfx.js               synthesized sound effects and the mute setting
test/engine.test.js      node:test suite
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

- **Effect types:** `damage`, `heal`, `armor`, `draw`, `summon`, `buff`, `destroy`, `freeze`, `weapon`, `buffWeapon`, `mana`, `bounce`, `copyFromOpponentDeck`
- **Hooks:** `effects` (spells), `battlecry`, `deathrattle`, `combo`, `endOfTurn`, `onDamaged`, `onFriendlySpell`
- **Adjacency:** use `to: 'adjacent'` for the minions on either side, or `adjacentAura: { attack }` for an ongoing bonus to neighbours
- **Targets** (`target`): `any`, `minion`, `enemyMinion`, `friendlyMinion`, `enemy`, `friendly`. Narrow them with `targetFilter: { maxAttack, minAttack, damaged, undamaged }`.

The full list of selectors for `to` is at the top of `src/cards.js`.

## Ideas for next steps

- Deck builder and saved decks
- Secrets, discover, silence, auras ("your other minions have +1 Attack")
- Drag-to-play and attack arrows, sound effects, real card art
- Smarter AI (look-ahead search over the engine, which is already headless and seedable)
- Online PvP: the engine is deterministic and could run server-authoritatively
