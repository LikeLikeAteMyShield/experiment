import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { CARDS, CLASSES, HEROES, buildDeck } from '../src/cards.js';
import { nextAction, playTurn, mulliganChoice } from '../src/ai.js';
import { VANILLA } from './testcards.js';

const filler = Array(30).fill(VANILLA);

/** A started game, player 0 (Aurion) first, full mana and empty hands. */
function setup(heroes = ['aurion', 'brakka']) {
  const g = new Game({ heroes, decks: [filler, filler], seed: 1, firstPlayer: 0 });
  g.mulligan(0, []); g.mulligan(1, []);
  for (const p of g.players) { p.hand = []; p.maxMana = 10; p.mana = 10; }
  return g;
}
const give = (g, pid, cardId) => { const inst = { uid: g.nextUid++, cardId }; g.players[pid].hand.push(inst); return inst.uid; };
function play(g, pid, cardId, target = null) {
  const uid = give(g, pid, cardId);
  const saved = g.current;
  g.current = pid;
  g.players[pid].mana = 10;
  assert.ok(g.playCard(uid, { target: target?.uid ?? null }), g.lastError);
  g.current = saved;
  const m = g.players[pid].board.at(-1);
  if (m) m.sleeping = false;
  return m;
}
/** End the turn and come back to player 0 with full mana. */
function nextTurn(g) { g.endTurn(); g.endTurn(); g.players[0].mana = 10; }

test('the Celestial class is hidden, played by Aurion, with the doc\'s core cards', () => {
  assert.equal(CLASSES.celestial.hidden, true);
  assert.equal(HEROES.aurion.cls, 'celestial');
  assert.equal(HEROES.aurion.heroPower.name, 'Rift Grant Me Strength');
  const doc = {
    c_wraith: ['minion', 3, 3, 2], c_revenant: ['minion', 5, 2, 3], c_sentinel: ['minion', 9, 8, 10], c_nucleus: ['minion', 3, 4, 2],
    c_starfire: ['spell', 3], c_oblivion: ['spell', 8], c_glaive: ['weapon', 3, 3, 2], c_bow: ['weapon', 4, 2, 4],
  };
  for (const [id, [type, cost, a, h]] of Object.entries(doc)) {
    const c = CARDS[id];
    assert.ok(c && c.cls === 'celestial', id);
    assert.deepEqual([c.type, c.cost], [type, cost], id);
    if (type === 'minion') assert.deepEqual([c.attack, c.health], [a, h], id);
    if (type === 'weapon') assert.deepEqual([c.attack, c.durability], [a, h], id);
  }
  assert.equal(CARDS.c_sentinel.keywords.taunt, true);
  assert.equal(CARDS.c_nucleus.keywords.windfury, true);
  assert.equal(CARDS.c_bow.keywords.windfury, true);
  const extras = Object.values(CARDS).filter(c => c.cls === 'celestial' && !doc[c.id]);
  assert.ok(extras.length >= 4, 'padded out with extra minions and spells');
  assert.ok(extras.some(c => c.type === 'minion') && extras.some(c => c.type === 'spell'));
});

test('Rift Grant Me Strength: +2 hero Attack this turn, even bare-handed, gone next turn', () => {
  const g = setup();
  const hero = g.players[0].hero;
  assert.equal(hero.attack, 0);
  assert.ok(g.useHeroPower(null), g.lastError);
  assert.equal(hero.attack, 2);
  assert.ok(g.canAttack(hero.uid), 'can attack with no weapon');
  g.attack(hero.uid, g.players[1].hero.uid);
  assert.equal(g.players[1].hero.health, 28);
  nextTurn(g);
  assert.equal(hero.attack, 0, 'the bonus wore off');
  // With a weapon, the bonus stacks on top, and outlasts the weapon breaking.
  play(g, 0, 'c_glaive');
  assert.ok(g.useHeroPower(null), g.lastError);
  assert.equal(hero.attack, 5);
});

test('Glaive of the Rift gains +2 Attack after its first strike', () => {
  const g = setup();
  play(g, 0, 'c_glaive');
  const hero = g.players[0].hero, foe = g.players[1].hero;
  g.attack(hero.uid, foe.uid);
  assert.equal(foe.health, 27);
  assert.equal(g.players[0].weapon.attack, 5);
  assert.equal(hero.attack, 5);
  nextTurn(g);
  g.attack(hero.uid, foe.uid);
  assert.equal(foe.health, 22);
  assert.equal(g.players[0].weapon, null, 'durability 2: broken after the second strike');
  assert.equal(hero.attack, 0);
});

test('Lightshard Bow lets the hero attack twice a turn', () => {
  const g = setup();
  play(g, 0, 'c_bow');
  const hero = g.players[0].hero, foe = g.players[1].hero;
  assert.equal(g.maxAttacks(hero), 2);
  assert.ok(g.attack(hero.uid, foe.uid));
  assert.ok(g.attack(hero.uid, foe.uid), 'second attack');
  assert.equal(g.attack(hero.uid, foe.uid), false, 'no third');
  assert.equal(foe.health, 26);
  assert.equal(g.players[0].weapon.durability, 2);
});

test('Revenant gains +1 Attack whenever its hero attacks (and not when silenced)', () => {
  const g = setup();
  const rev = play(g, 0, 'c_revenant');
  play(g, 0, 'c_bow');
  const hero = g.players[0].hero, foe = g.players[1].hero;
  g.attack(hero.uid, foe.uid);
  g.attack(hero.uid, foe.uid);
  assert.equal(rev.attack, 4);
  const enemyRev = play(g, 1, 'c_revenant');
  g.attack(hero.uid, foe.uid);       // a third swing isn't allowed; enemy revenant must not react to our hero anyway
  assert.equal(enemyRev.attack, 2);
  play(g, 1, 'n_monk', rev);
  nextTurn(g);
  g.attack(hero.uid, foe.uid);
  assert.equal(rev.attack, 2, 'silenced: back to 2 and no longer grows');
});

test('Unstable Nucleus has Windfury and hurts its own hero; Oblivion destroys every minion', () => {
  const g = setup();
  const nuc = play(g, 0, 'c_nucleus');
  assert.equal(g.players[0].hero.health, 27);
  assert.equal(g.maxAttacks(nuc), 2);
  play(g, 1, VANILLA); play(g, 1, 'v_shieldmaiden');
  play(g, 0, 'c_oblivion');
  assert.equal(g.players[0].board.length + g.players[1].board.length, 0);
});

test('Starfire Bolt deals 5; Gravity Well damages and freezes the enemy board', () => {
  const g = setup();
  const dummy = play(g, 1, VANILLA);
  const dummy2 = play(g, 1, VANILLA);
  play(g, 0, 'c_gravity');
  assert.ok(dummy.frozen && dummy2.frozen);
  assert.equal(dummy.health, 3);
  play(g, 0, 'c_starfire', g.players[1].hero);
  assert.equal(g.players[1].hero.health, 25);
});

test('a Celestial deck is 30 cards from the class and neutrals, despite having more than 8 class cards', () => {
  const pool = Object.values(CARDS).filter(c => c.cls === 'celestial' && !c.token);
  assert.ok(pool.length > 8);
  for (let s = 0; s < 20; s++) {
    let x = s + 1;
    const deck = buildDeck('celestial', () => ((x = (x * 16807) % 2147483647) / 2147483647));
    assert.equal(deck.length, 30);
    assert.ok(deck.every(id => CARDS[id].cls === 'celestial' || CARDS[id].cls === 'neutral'));
    const counts = {};
    for (const id of deck) counts[id] = (counts[id] ?? 0) + 1;
    assert.ok(Object.values(counts).every(n => n === 2));
  }
});

test('the AI uses Rift Grant Me Strength only when the hero can swing', () => {
  const g = setup(['brakka', 'aurion']);
  g.endTurn();                                   // to the AI (player 1, Aurion)
  const p = g.players[1];
  p.hand = []; p.mana = 2;
  assert.deepEqual(nextAction(g, 1), { type: 'heroPower', target: null });
  p.hero.frozen = true;
  assert.equal(nextAction(g, 1), null, 'frozen: no point');
});

test('the AI never kills itself with Unstable Nucleus, and saves Oblivion for when it\'s behind', () => {
  const g = setup(['brakka', 'aurion']);
  g.endTurn();
  const p = g.players[1];
  p.hand = []; p.mana = 10; p.hero.health = 3;
  give(g, 1, 'c_nucleus');
  assert.equal(nextAction(g, 1)?.uid, undefined);
  p.hero.health = 30; p.hand = [];
  give(g, 1, 'c_oblivion');
  play(g, 1, VANILLA);
  p.mana = 10;
  assert.notEqual(nextAction(g, 1)?.type, 'play', 'ahead on board: hold Oblivion');
  for (let i = 0; i < 3; i++) play(g, 0, VANILLA);
  p.mana = 10;
  assert.deepEqual(nextAction(g, 1), { type: 'play', uid: p.hand[0].uid, target: null, position: null }, 'behind: wipe the board');
});

test('Aurion plays full AI games against every class', () => {
  let wins = 0, games = 0;
  for (const cls of Object.keys(CLASSES).filter(c => c !== 'celestial')) {
    for (let seed = 1; seed <= 6; seed++) {
      for (const seat of [0, 1]) {
        const heroes = seat ? [CLASSES[cls].defaultHero, 'aurion'] : ['aurion', CLASSES[cls].defaultHero];
        const g = new Game({ heroes, seed: seed * 37 + seat });
        g.mulligan(0, mulliganChoice(g, 0)); g.mulligan(1, mulliganChoice(g, 1));
        for (let i = 0; i < 200 && g.winner === null; i++) playTurn(g, g.current);
        assert.notEqual(g.winner, null);
        games++;
        if (g.winner === seat) wins++;
      }
    }
  }
  const rate = wins / games;
  assert.ok(rate > 0.3 && rate < 0.7, `Celestial win rate ${(rate * 100).toFixed(0)}% in AI mirror games`);
});
