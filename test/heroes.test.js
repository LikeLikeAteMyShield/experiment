import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CLASSES, HEROES, defaultHero, heroesOf, classArt } from '../src/cards.js';
import { Game } from '../src/engine.js';
import { playTurn, mulliganChoice } from '../src/ai.js';

/** Register a hero for the length of one test (as a boss would be: another hero sharing a class). */
function withHero(id, hero, fn) {
  HEROES[id] = hero;
  try { return fn(); } finally { delete HEROES[id]; }
}

const BRUTE = {
  name: 'Test Brute', cls: 'warlord', emoji: '👹', portrait: 'hero_warlord',
  heroPower: { name: 'Call the Pack', cost: 2, sprite: 'power_stalker', text: 'Summon a 2/2 Dusk Wolf.',
    effects: [{ type: 'summon', card: 't_wolf' }] },
};

test('every class has a default hero of that class, and every hero belongs to a real class', () => {
  for (const [cls, c] of Object.entries(CLASSES)) {
    assert.ok(HEROES[c.defaultHero], `${cls}: default hero "${c.defaultHero}" doesn't exist`);
    assert.equal(HEROES[c.defaultHero].cls, cls);
    assert.equal(defaultHero(cls), HEROES[c.defaultHero]);
    assert.deepEqual(classArt(cls), { sprite: HEROES[c.defaultHero].portrait, emoji: c.emoji });
  }
  for (const [id, h] of Object.entries(HEROES)) {
    assert.ok(CLASSES[h.cls], `${id}: unknown class "${h.cls}"`);
    assert.ok(h.name && h.portrait && h.heroPower?.name && Number.isInteger(h.heroPower.cost), id);
    assert.ok(Array.isArray(h.heroPower.effects) && h.heroPower.effects.length, `${id}: hero power does something`);
  }
  // Classes no longer carry hero details.
  for (const c of Object.values(CLASSES)) assert.equal(c.heroPower, undefined);
});

test('a game set up by class plays each class\'s default hero', () => {
  const g = new Game({ classes: ['oracle', 'shade'], seed: 1 });
  assert.deepEqual(g.players.map(p => [p.heroId, p.heroClass]), [['lumen', 'oracle'], ['vex', 'shade']]);
  assert.equal(g.heroPower(0), HEROES.lumen.heroPower);
});

test('a game set up by hero takes its class from the hero', () => {
  const g = new Game({ heroes: ['hale', 'ignatia'], seed: 2 });
  assert.deepEqual(g.players.map(p => p.heroClass), ['vanguard', 'pyromancer']);
  const cards = [...g.players[1].deck, ...g.players[1].hand].map(i => CARDS[i.cardId]);
  assert.ok(cards.every(c => c.cls === 'pyromancer' || c.cls === 'neutral'), 'the deck comes from the hero\'s class');
});

test('two heroes can share a class, each with their own hero power', () => {
  withHero('brute', BRUTE, () => {
    assert.deepEqual(heroesOf('warlord').map(h => h.id).sort(), ['brakka', 'brute']);
    const g = new Game({ heroes: ['brute', 'brakka'], seed: 3, firstPlayer: 0 });
    g.mulligan(0, []); g.mulligan(1, []);
    assert.equal(g.players[0].heroClass, 'warlord');
    assert.equal(g.players[1].heroClass, 'warlord');
    for (const p of g.players) { p.maxMana = 10; p.mana = 10; }
    // The boss-style hero summons; the default Warlord gains armour.
    assert.ok(g.useHeroPower(null), g.lastError);
    assert.equal(g.players[0].board.at(-1)?.cardId, 't_wolf');
    g.endTurn();
    g.players[1].mana = 10;
    assert.ok(g.useHeroPower(null), g.lastError);
    assert.equal(g.players[1].hero.armor, 2);
  });
});

test('the AI plays a game with a non-default hero to the end', () => {
  withHero('brute', BRUTE, () => {
    const g = new Game({ heroes: ['wren', 'brute'], seed: 21 });
    g.mulligan(0, mulliganChoice(g, 0));
    g.mulligan(1, mulliganChoice(g, 1));
    for (let i = 0; i < 200 && g.winner === null; i++) playTurn(g, g.current);
    assert.notEqual(g.winner, null);
  });
});

test('unknown heroes and classes fail clearly', () => {
  assert.throws(() => new Game({ heroes: ['nobody', 'vex'] }), /Unknown hero "nobody"/);
  assert.throws(() => new Game({ classes: ['bard', 'shade'] }), /Unknown class "bard"/);
  assert.throws(() => new Game({}), /two heroes/);
});
