import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CLASSES, HEROES, RIFTKIN, playerHeroes } from '../src/cards.js';
import { Game } from '../src/engine.js';
import { playTurn, mulliganChoice } from '../src/ai.js';
import { VANILLA } from './testcards.js';
import { filterCards } from '../src/library.js';
import { getSprite } from '../src/pixelart.js';
import '../src/sprites/index.js';

test('the five Riftkin from the doc are Celestial boss heroes with full profiles', () => {
  assert.deepEqual(RIFTKIN.map(id => HEROES[id].name),
    ['Zarth the Colossus', "Void Serpent Gal'kun", 'Ylva, Starlight Priestess', 'Manus Darkhammer', 'Nightlord Grun']);
  for (const id of RIFTKIN) {
    const h = HEROES[id];
    assert.equal(h.cls, 'celestial', id);
    assert.equal(h.boss, true, id);
    assert.ok(h.title && h.lore, `${id} has a title and lore`);
    const s = getSprite(h.portrait);
    assert.ok(s && s.width === 32 && s.height === 32, `${id} portrait`);
  }
  assert.equal(new Set(RIFTKIN.map(id => HEROES[id].portrait)).size, 5, 'each has their own portrait');
});

test('bosses are never player heroes, and Aurion stays the Celestial default', () => {
  assert.equal(CLASSES.celestial.defaultHero, 'aurion');
  assert.ok(!playerHeroes().some(h => h.boss));
  assert.ok(playerHeroes().some(h => h.id === 'aurion'));
  for (const c of Object.values(CLASSES)) assert.ok(!HEROES[c.defaultHero].boss);
});

test('Nightlord Grun summons a 6/6 Rift Demon; the other Riftkin share Rift Grant Me Strength', () => {
  for (const id of ['zarth', 'galkun', 'ylva', 'manus']) assert.equal(HEROES[id].heroPower, HEROES.aurion.heroPower, id);
  const wrath = HEROES.grun.heroPower;
  assert.deepEqual([wrath.name, wrath.cost], ['Wrath of the Night', 2]);
  const g = new Game({ heroes: ['grun', 'brakka'], decks: [Array(30).fill(VANILLA), Array(30).fill(VANILLA)], seed: 1, firstPlayer: 0 });
  g.mulligan(0, []); g.mulligan(1, []);
  g.players[0].mana = 2;
  assert.ok(g.useHeroPower(null), g.lastError);
  const demon = g.players[0].board.at(-1);
  assert.deepEqual([demon.cardId, demon.attack, demon.health], ['t_riftdemon', 6, 6]);
  assert.equal(CARDS.t_riftdemon.token, true);
});

test('the Rift Demon stays out of decks and the library', () => {
  for (let i = 0; i < 10; i++) assert.ok(!new Game({ classes: ['celestial', 'shade'], seed: i }).players[0].deck.some(c => c.cardId === 't_riftdemon'));
  assert.ok(!filterCards(Object.values(CARDS), { tokens: true }).some(c => c.id === 't_riftdemon'), 'hidden while Celestial is locked');
});

test('every Riftkin can fight a full AI game against every class', () => {
  const classes = Object.keys(CLASSES).filter(c => c !== 'celestial');
  for (const boss of RIFTKIN) {
    for (const [i, cls] of classes.entries()) {
      const g = new Game({ heroes: [CLASSES[cls].defaultHero, boss], seed: 500 + i });
      g.mulligan(0, mulliganChoice(g, 0)); g.mulligan(1, mulliganChoice(g, 1));
      for (let t = 0; t < 200 && g.winner === null; t++) playTurn(g, g.current);
      assert.notEqual(g.winner, null, `${boss} vs ${cls}`);
    }
  }
});
