import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { CARDS, CLASSES, buildDeck } from '../src/cards.js';
import { playTurn, mulliganChoice, nextAction, applyAction } from '../src/ai.js';

const filler = Array(30).fill('n_ram');

/** A started game where player 0 goes first with full mana and an empty hand. */
function setup({ classes = ['pyromancer', 'warlord'], mana = 10 } = {}) {
  const g = new Game({ classes, decks: [filler, filler], seed: 1, firstPlayer: 0 });
  g.mulligan(0, []);
  g.mulligan(1, []);
  for (const p of g.players) { p.hand = []; p.maxMana = mana; p.mana = mana; }
  return g;
}

function give(g, pid, cardId) {
  const inst = { uid: g.nextUid++, cardId };
  g.players[pid].hand.push(inst);
  return inst.uid;
}

function put(g, pid, cardId, { awake = true } = {}) {
  const uid = give(g, pid, cardId);
  const saved = g.current;
  g.current = pid;
  g.players[pid].mana = 10;
  assert.ok(g.playCard(uid, { target: g.cardTargets(pid, uid)[0]?.uid }), g.lastError);
  g.current = saved;
  const m = g.players[pid].board.at(-1);
  if (awake) m.sleeping = false;
  return m;
}

test('every card and hero power uses known effects and selectors', () => {
  for (const cls of Object.keys(CLASSES)) {
    const deck = buildDeck(cls);
    assert.equal(deck.length, 30, `${cls} deck size`);
    for (const id of deck) assert.ok(CARDS[id], id);
  }
});

test('opening hands, coin and first turn mana', () => {
  const g = new Game({ classes: ['pyromancer', 'warlord'], seed: 3, firstPlayer: 0 });
  assert.equal(g.players[0].hand.length, 3);
  assert.equal(g.players[1].hand.length, 4);
  g.mulligan(0, []);
  g.mulligan(1, []);
  assert.equal(g.phase, 'play');
  assert.equal(g.players[0].hand.length, 4); // drew for turn
  assert.equal(g.players[0].mana, 1);
  assert.ok(g.players[1].hand.some(c => c.cardId === 't_coin'));
});

test('mulligan keeps hand size', () => {
  const g = new Game({ classes: ['shade', 'oracle'], seed: 9, firstPlayer: 1 });
  const uids = g.players[0].hand.slice(0, 2).map(c => c.uid);
  g.mulligan(0, uids);
  assert.equal(g.players[0].hand.length, 4);
  assert.equal(g.players[0].deck.length, 26);
});

test('minions are summoning sick unless charge/rush', () => {
  const g = setup();
  const ram = put(g, 0, 'n_ram', { awake: false });
  assert.equal(g.canAttack(ram.uid), false);
  const hawk = put(g, 0, 's_hawk', { awake: false });
  assert.equal(g.canAttack(hawk.uid), true);
  const herald = put(g, 0, 'n_herald', { awake: false });
  assert.equal(g.canAttack(herald.uid), false, 'rush has no minion targets yet');
  put(g, 1, 'n_mossling');
  assert.deepEqual(g.attackTargets(herald.uid).map(t => t.kind), ['minion']);
});

test('combat trades damage and removes dead minions', () => {
  const g = setup();
  const a = put(g, 0, 'n_scrapper'); // 3/2
  const b = put(g, 1, 'n_boar');     // 2/4 taunt
  assert.ok(g.attack(a.uid, b.uid));
  assert.equal(g.players[0].board.length, 0);
  assert.equal(b.health, 1);
});

test('taunt must be attacked first; stealth cannot be targeted', () => {
  const g = setup();
  const a = put(g, 0, 'n_ram');
  const boar = put(g, 1, 'n_boar');
  put(g, 1, 'n_lurker');
  assert.deepEqual(g.attackTargets(a.uid).map(t => t.uid), [boar.uid]);
  assert.equal(g.attack(a.uid, g.players[1].hero.uid), false);
});

test('divine shield, poisonous and lifesteal', () => {
  const g = setup();
  const shield = put(g, 1, 'n_glasswing');
  const adder = put(g, 0, 'n_adder');
  adder.health = adder.maxHealth = 10;
  g.attack(adder.uid, shield.uid);
  assert.equal(shield.keywords.divineShield, false);
  assert.equal(shield.health, 1);

  const ram = put(g, 1, 'n_ram');
  adder.attacksThisTurn = 0;
  g.players[1].board = g.players[1].board.filter(m => m !== shield);
  g.attack(adder.uid, ram.uid);
  assert.ok(!g.players[1].board.includes(ram), 'poison kills');

  g.players[0].hero.health = 20;
  const bat = put(g, 0, 'n_leechbat');
  g.attack(bat.uid, g.players[1].hero.uid);
  assert.equal(g.players[0].hero.health, 22);
});

test('armor absorbs damage before health', () => {
  const g = setup({ classes: ['warlord', 'pyromancer'] });
  g.useHeroPower();
  assert.equal(g.players[0].hero.armor, 2);
  g.endTurn();
  g.players[1].mana = 10;
  g.playCard(give(g, 1, 'p_cinderbolt'), { target: g.players[0].hero.uid });
  assert.equal(g.players[0].hero.armor, 0);
  assert.equal(g.players[0].hero.health, 29);
});

test('spell damage boosts spells but not hero powers', () => {
  const g = setup();
  put(g, 0, 'n_stormcaller');
  const enemy = g.players[1].hero;
  g.playCard(give(g, 0, 'p_cinderbolt'), { target: enemy.uid }); // 3 + 1
  assert.equal(enemy.health, 26);
  g.useHeroPower(enemy.uid);
  assert.equal(enemy.health, 25);
});

test('freeze skips the next attack and thaws after', () => {
  const g = setup();
  const target = put(g, 1, 'n_ram');
  g.playCard(give(g, 0, 'p_rimelance'), { target: target.uid });
  assert.equal(target.frozen, true);
  g.endTurn();
  assert.equal(g.canAttack(target.uid), false);
  g.endTurn();
  g.endTurn();
  assert.equal(target.frozen, false);
  assert.equal(g.canAttack(target.uid), true);
});

test('deathrattle and battlecry', () => {
  const g = setup();
  const golem = put(g, 0, 'n_golem');
  g.playCard(give(g, 0, 'r_contract'), { target: golem.uid }); // only friendly minions -> rejected
  assert.equal(g.lastError, 'No valid targets');
  g.players[0].hand = [];
  golem.health = 0;
  g.playCard(give(g, 0, 'n_mossling'));
  assert.equal(g.players[0].board.map(m => m.cardId).join(), 't_shardling,n_mossling', 'token takes the dead golem\'s spot');

  const hp = g.players[1].hero.health;
  g.playCard(give(g, 0, 'n_lanternmoth'), { target: g.players[1].hero.uid });
  assert.equal(g.players[1].hero.health, hp - 1);
});

test('targeted spells with filters', () => {
  const g = setup({ classes: ['oracle', 'warlord'] });
  const small = put(g, 1, 'n_scrapper'); // 3 attack
  const big = put(g, 1, 'n_wyvern');     // 5 attack
  assert.deepEqual(g.validTargets(0, 'minion', { maxAttack: 3 }).map(m => m.uid), [small.uid]);
  assert.deepEqual(g.validTargets(0, 'minion', { minAttack: 5 }).map(m => m.uid), [big.uid]);
  assert.equal(g.playCard(give(g, 0, 'o_humbling'), { target: big.uid }), false);
});

test('combo only triggers after another card', () => {
  const g = setup({ classes: ['shade', 'oracle'] });
  g.playCard(give(g, 0, 'r_prodigy'));
  assert.equal(g.players[0].board[0].attack, 3);
  g.playCard(give(g, 0, 'r_prodigy'));
  assert.equal(g.players[0].board[1].attack, 5);
  assert.equal(g.players[0].board[1].keywords.stealth, true);
});

test('weapons give hero attack and lose durability', () => {
  const g = setup({ classes: ['shade', 'oracle'] });
  g.useHeroPower();
  const hero = g.players[0].hero;
  assert.equal(hero.attack, 1);
  g.playCard(give(g, 0, 'r_oil'));
  assert.equal(hero.attack, 3);
  g.attack(hero.uid, g.players[1].hero.uid);
  assert.equal(g.players[1].hero.health, 27);
  assert.equal(g.players[0].weapon.durability, 1);
});

test('fatigue damage grows and can end the game', () => {
  const g = setup();
  for (const p of g.players) p.deck = [];
  g.players[1].hero.health = 3;
  g.endTurn(); // p1 fatigue 1
  g.endTurn(); // p0 fatigue 1
  g.endTurn(); // p1 fatigue 2 -> dead
  assert.equal(g.winner, 0);
  assert.equal(g.endTurn(), false);
});

test('events carry source and effect ids for animations', () => {
  const g = setup({ classes: ['warlord', 'oracle'] });
  const berserker = put(g, 0, 'w_berserker');
  put(g, 1, 'n_ram');
  g.takeEvents();
  g.playCard(give(g, 0, 'w_stomp'));
  const ev = g.takeEvents();
  const hits = ev.filter(e => e.type === 'damage');
  const buff = ev.find(e => e.type === 'buff');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].fx, hits[1].fx, 'one spell, one effect id, even with a trigger in between');
  assert.notEqual(buff.fx, hits[0].fx, 'nested trigger gets its own id');
  assert.equal(buff.from, berserker.uid);
  assert.ok(hits.every(h => h.spell && h.from === g.players[0].hero.uid && !h.combat));

  g.attack(berserker.uid, g.players[1].hero.uid);
  assert.ok(g.takeEvents().filter(e => e.type === 'damage').every(e => e.combat));
});

test('board is capped at 7', () => {
  const g = setup();
  for (let i = 0; i < 7; i++) put(g, 0, 'n_mossling');
  assert.equal(g.playBlocker(0, give(g, 0, 'n_mossling')), 'Board is full');
});

test('the 7-minion cap also limits summons from spells, battlecries and hero powers', () => {
  const g = setup({ classes: ['vanguard', 'stalker'] });
  for (let i = 0; i < 5; i++) put(g, 0, 'n_mossling');
  g.playCard(give(g, 0, 'v_captain')); // 2/2 + Recruit -> 7
  assert.equal(g.players[0].board.length, 7);
  assert.equal(g.canUseHeroPower(0), false, 'Muster is disabled on a full board');

  const h = setup({ classes: ['stalker', 'vanguard'] });
  for (let i = 0; i < 6; i++) put(h, 0, 'n_mossling');
  h.playCard(give(h, 0, 's_pack')); // two wolves, room for one
  assert.equal(h.players[0].board.length, 7);
});

test('minions can be placed at a chosen position', () => {
  const g = setup();
  const a = put(g, 0, 'n_mossling');
  const b = put(g, 0, 'n_scrapper');
  g.playCard(give(g, 0, 'n_ram'), { position: 1 });
  assert.deepEqual(g.players[0].board.map(m => m.cardId), ['n_mossling', 'n_ram', 'n_scrapper']);
  g.playCard(give(g, 0, 'n_boar'), { position: 0 });
  g.players[0].mana = 10;
  g.playCard(give(g, 0, 'n_leechbat'), { position: 99 }); // clamped to the right end
  assert.deepEqual(g.players[0].board.map(m => m.cardId), ['n_boar', 'n_mossling', 'n_ram', 'n_scrapper', 'n_leechbat']);
  assert.ok(a && b);
});

test('battlecry tokens appear to the right; deathrattle tokens take the dead minion\'s spot', () => {
  const g = setup({ classes: ['vanguard', 'stalker'] });
  put(g, 0, 'n_mossling');
  put(g, 0, 'n_scrapper');
  g.playCard(give(g, 0, 'v_captain'), { position: 1 });
  assert.deepEqual(g.players[0].board.map(m => m.cardId), ['n_mossling', 'v_captain', 't_recruit', 'n_scrapper']);

  const golem = put(g, 0, 'n_golem');
  g.players[0].board.splice(g.players[0].board.indexOf(golem), 1);
  g.players[0].board.splice(1, 0, golem); // move the golem to slot 1
  golem.destroyed = true;
  g.endTurn();
  assert.equal(g.players[0].board[1].cardId, 't_shardling');
});

test('adjacent battlecries hit only the neighbors', () => {
  const g = setup();
  const left = put(g, 0, 'n_mossling');
  const far = put(g, 0, 'n_scrapper');
  g.playCard(give(g, 0, 'n_bannerbearer'), { position: 1 }); // between mossling and scrapper
  assert.equal(left.attack, 3);
  assert.equal(far.attack, 4);
  const edge = put(g, 0, 'n_ram');
  g.playCard(give(g, 0, 'n_sergeant'), { position: 4 }); // right end: one neighbor
  assert.equal(edge.keywords.taunt, true);
  assert.equal(edge.health, 6);
  assert.equal(far.keywords.taunt, undefined);
});

test('adjacency auras follow the board as minions come and go', () => {
  const g = setup();
  const a = put(g, 0, 'n_mossling');      // 2 attack
  const totem = put(g, 0, 'n_warhorn');
  assert.equal(a.attack, 4);
  const b = put(g, 0, 'n_scrapper');      // 3 attack, lands right of the totem
  assert.equal(b.attack, 5);
  const c = put(g, 0, 'n_ram');           // not adjacent
  assert.equal(c.attack, 4);
  b.health = 0;
  g.endTurn();                            // scrapper dies; ram slides next to the totem
  assert.equal(c.attack, 6);
  totem.destroyed = true;
  g.endTurn();
  assert.equal(a.attack, 2);
  assert.equal(c.attack, 4);
});

test('AI places adjacency minions between its best minions', () => {
  const g = setup();
  g.current = 1;
  put(g, 1, 'n_mossling');
  put(g, 1, 'n_treant');
  put(g, 1, 'n_ram');
  g.current = 1;
  give(g, 1, 'n_bannerbearer');
  const action = nextAction(g, 1);
  assert.equal(action.type, 'play');
  assert.ok(action.position === 1 || action.position === 2, `position ${action.position}`);
  assert.ok(applyAction(g, action));
  const board = g.players[1].board.map(m => m.cardId);
  assert.ok(board.indexOf('n_bannerbearer') > 0 && board.indexOf('n_bannerbearer') < 3);
});

test('AI vs AI games finish for every class pairing', () => {
  const classes = Object.keys(CLASSES);
  let games = 0;
  for (const a of classes) {
    for (const b of classes) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = new Game({ classes: [a, b], seed: seed * 101 + games });
        g.mulligan(0, mulliganChoice(g, 0));
        g.mulligan(1, mulliganChoice(g, 1));
        let turns = 0;
        while (g.winner === null && turns < 200) { playTurn(g, g.current); turns++; }
        assert.notEqual(g.winner, null, `${a} vs ${b} seed ${seed} did not finish`);
        games++;
      }
    }
  }
  assert.equal(games, 108);
});
