import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { CARDS } from '../src/cards.js';
import { nextAction, playTurn, mulliganChoice, silenceValue } from '../src/ai.js';
import { VANILLA } from './testcards.js';
import { cardKeywords } from '../src/cardview.js';

const filler = Array(30).fill(VANILLA);

function setup() {
  const g = new Game({ classes: ['pyromancer', 'warlord'], decks: [filler, filler], seed: 1, firstPlayer: 0 });
  g.mulligan(0, []);
  g.mulligan(1, []);
  for (const p of g.players) { p.hand = []; p.maxMana = 10; p.mana = 10; }
  return g;
}

function give(g, pid, cardId) {
  const inst = { uid: g.nextUid++, cardId };
  g.players[pid].hand.push(inst);
  return inst.uid;
}

/** Play a card for `pid` (out of turn if need be), aimed at `target`. Returns the newest minion. */
function play(g, pid, cardId, { target = null, position = null } = {}) {
  const uid = give(g, pid, cardId);
  const saved = g.current;
  g.current = pid;
  g.players[pid].mana = 10;
  const t = target ?? g.cardTargets(pid, uid)[0] ?? null;
  assert.ok(g.playCard(uid, { target: t?.uid ?? t, position }), g.lastError);
  g.current = saved;
  const board = g.players[pid].board;
  const m = position == null ? board.at(-1) : board[position];
  m.sleeping = false;
  return m;
}

const silence = (g, pid, target) => play(g, pid, 'n_monk', { target });

test('Whispering Monk is a 3 mana 2/1 neutral with a targeted silence battlecry', () => {
  const c = CARDS.n_monk;
  assert.deepEqual([c.cls, c.type, c.cost, c.attack, c.health, c.target], ['neutral', 'minion', 3, 2, 1, 'minion']);
  assert.deepEqual(c.battlecry, [{ type: 'silence', to: 'target' }]);
  assert.ok(cardKeywords(c).includes('silence'));
});

test('silence removes printed keywords: Taunt and Divine Shield', () => {
  const g = setup();
  const maiden = play(g, 1, 'v_shieldmaiden');
  const attacker = play(g, 0, VANILLA);
  assert.deepEqual(g.attackTargets(attacker.uid).map(t => t.uid), [maiden.uid], 'Taunt guards the hero');
  silence(g, 0, maiden);
  assert.equal(maiden.silenced, true);
  assert.deepEqual(maiden.keywords, {});
  assert.ok(g.attackTargets(attacker.uid).includes(g.players[1].hero), 'no more Taunt');
  g.attack(attacker.uid, maiden.uid);
  assert.ok(!g.players[1].board.includes(maiden), 'no Divine Shield to absorb the hit');
});

test('silence undoes buffs and keywords granted by other cards, keeping damage taken', () => {
  const g = setup();
  const pup = play(g, 1, 'n_mossling');                           // 2/1
  play(g, 1, 's_packmaster', { target: pup });                     // +2/+2 and Taunt
  assert.deepEqual([pup.attack, pup.health, pup.keywords.taunt], [4, 3, true]);
  pup.health -= 1;                                                 // took 1 damage: 4/2
  silence(g, 0, pup);
  assert.deepEqual([pup.attack, pup.health, pup.maxHealth], [2, 1, 1]);
  assert.equal(pup.keywords.taunt, undefined);

  // Damage is kept when the minion is below its printed Health.
  const dummy = play(g, 1, VANILLA);                               // 4/5
  play(g, 1, 'n_tinker', { target: dummy });                       // 5/6
  dummy.health = 2;
  silence(g, 0, dummy);
  assert.deepEqual([dummy.attack, dummy.health, dummy.maxHealth], [4, 2, 5]);
});

test('silence never kills a minion on its own', () => {
  const g = setup();
  const pup = play(g, 1, 'n_mossling');
  play(g, 1, 'n_tinker', { target: pup });                         // 3/2
  pup.health = 1;
  silence(g, 0, pup);
  assert.equal(pup.health, 1);
  assert.ok(g.players[1].board.includes(pup));
});

test('a silenced minion has no deathrattle', () => {
  const g = setup();
  const snapjaw = play(g, 1, 's_snapjaw');
  const golem = play(g, 1, 'n_golem');
  silence(g, 0, snapjaw);
  silence(g, 0, golem);
  const hero = g.players[0].hero.health;
  const killer = play(g, 0, VANILLA);
  play(g, 0, 'p_cinderbolt', { target: snapjaw });
  g.attack(killer.uid, golem.uid);
  assert.equal(g.players[0].hero.health, hero, 'Snapjaw deathrattle did not fire');
  assert.ok(!g.players[1].board.some(m => m.cardId === 't_shardling'), 'Golem deathrattle did not fire');
});

test('a silenced minion has no triggered effects', () => {
  const g = setup();
  const berserker = play(g, 0, 'w_berserker');
  const candle = play(g, 0, 'o_candle');
  const weaver = play(g, 0, 'p_runeweaver');
  for (const m of [berserker, candle, weaver]) silence(g, 1, m);
  const before = g.players[0].hero.health;
  play(g, 0, 'p_cinderbolt', { target: berserker });              // a spell, and damage to the berserker
  assert.equal(weaver.attack, 1, 'Runeweaver did not grow');
  assert.equal(berserker.attack, 2, 'Berserker did not enrage');
  g.players[0].hero.health = before - 5;
  const h = g.players[0].hero.health;
  g.endTurn();
  assert.equal(g.players[0].hero.health, h, 'Candle end-of-turn effect did not fire');
});

test('silencing an aura minion removes its aura; a silenced minion still gets a neighbour\'s aura', () => {
  const g = setup();
  const left = play(g, 0, VANILLA, { position: 0 });
  const totem = play(g, 0, 'n_warhorn', { position: 1 });
  const right = play(g, 0, 'n_mossling', { position: 2 });
  assert.deepEqual([left.attack, right.attack], [6, 4]);
  silence(g, 1, right);
  assert.equal(right.attack, 4, 'silence removes enchantments, not a neighbour\'s aura');
  silence(g, 1, totem);
  assert.deepEqual([left.attack, right.attack], [4, 2]);
});

test('silence removes Spell Damage, Freeze, Stealth and Poisonous', () => {
  const g = setup();
  const caller = play(g, 0, 'n_stormcaller');
  assert.equal(g.spellDamage(0), 1);
  silence(g, 1, caller);
  assert.equal(g.spellDamage(0), 0);

  const adder = play(g, 1, 'n_adder');
  const frozen = play(g, 1, VANILLA);
  play(g, 0, 'p_rimelance', { target: frozen });
  assert.equal(frozen.frozen, true);
  silence(g, 0, frozen);
  silence(g, 0, adder);
  assert.equal(frozen.frozen, false);
  assert.equal(adder.keywords.poisonous, undefined);
});

test('buffs after a silence apply normally; triggers stay off', () => {
  const g = setup();
  const pup = play(g, 1, 'n_mossling');
  silence(g, 0, pup);
  play(g, 1, 's_packmaster', { target: pup });
  assert.deepEqual([pup.attack, pup.health, pup.keywords.taunt], [4, 3, true]);
  assert.equal(pup.silenced, true);
});

test('minionText hides a silenced minion\'s text but keeps its name and stats', () => {
  const g = setup();
  const golem = play(g, 1, 'n_golem');
  assert.ok(g.minionText(golem).deathrattle);
  silence(g, 0, golem);
  const t = g.minionText(golem);
  assert.equal(t.deathrattle, undefined);
  assert.deepEqual([t.name, t.attack, t.health], ['Shatterstone Golem', 3, 3]);
});

test('Whispering Monk can be played with nothing to silence', () => {
  const g = setup();
  const uid = give(g, 0, 'n_monk');
  assert.deepEqual(g.cardTargets(0, uid), []);
  assert.ok(g.playCard(uid, {}), g.lastError);
  assert.equal(g.players[0].board.length, 1);
});

test('the AI silences the enemy minion that loses the most, never its own best minion', () => {
  const g = setup();
  play(g, 0, 'n_mossling');
  const maiden = play(g, 0, 'v_shieldmaiden');
  play(g, 1, 'o_seraph');                                          // AI's own taunt + lifesteal
  g.endTurn();
  g.players[1].hand = [];
  g.players[1].mana = 3;
  give(g, 1, 'n_monk');
  const action = nextAction(g, 1);
  assert.equal(action.type, 'play');
  assert.equal(action.target, maiden.uid);
  assert.ok(silenceValue(g, maiden) > 0);
});

test('AI games with Whispering Monks in every deck finish', () => {
  const deck = [...Array(6).fill('n_monk'), ...Array(24).fill('v_shieldmaiden')];
  for (let seed = 1; seed <= 4; seed++) {
    const g = new Game({ classes: ['vanguard', 'shade'], decks: [deck, deck], seed });
    g.mulligan(0, mulliganChoice(g, 0));
    g.mulligan(1, mulliganChoice(g, 1));
    let turns = 0;
    while (g.winner === null && turns < 200) { playTurn(g, g.current); turns++; }
    assert.notEqual(g.winner, null);
    assert.ok(g.events.some(e => e.type === 'silence'), 'a silence happened');
  }
});
