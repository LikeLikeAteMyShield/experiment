// Riftclash rules engine. Pure game logic with no DOM access, so it can run
// in the browser or under node for tests and AI.

import { CARDS, CLASSES, buildDeck } from './cards.js';

export const MAX_BOARD = 7;
export const MAX_HAND = 10;
export const MAX_MANA = 10;
export const STARTING_HEALTH = 30;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  /**
   * @param {object} opts
   * @param {string[]} opts.classes  class keys for player 0 and 1
   * @param {string[][]} [opts.decks] card id lists; built automatically if omitted
   * @param {number} [opts.seed]
   * @param {number} [opts.firstPlayer] 0 or 1; random if omitted
   */
  constructor({ classes, decks, seed = Date.now(), firstPlayer } = {}) {
    this.rand = mulberry32(seed);
    this.nextUid = 1;
    this.turn = 0;
    this.winner = null; // 0, 1, or 'draw'
    this.phase = 'mulligan';
    this.events = [];
    this.log = [];
    // Presentation metadata for the UI: which effect (fx) an event belongs to,
    // and whether damage came from combat.
    this.fx = 0;
    this.fxSeq = 0;
    this.combat = false;
    this.current = firstPlayer ?? (this.rand() < 0.5 ? 0 : 1);
    this.players = [0, 1].map(i => this.#createPlayer(i, classes[i], decks?.[i] ?? buildDeck(classes[i], this.rand)));
    this.mulliganDone = [false, false];
    // Opening hands: 3 for the player going first, 4 for the other.
    for (const p of this.players) {
      const n = p.id === this.current ? 3 : 4;
      for (let k = 0; k < n; k++) this.#drawRaw(p);
    }
  }

  #createPlayer(id, heroClass, deckIds) {
    const deck = deckIds.map(cardId => ({ uid: this.nextUid++, cardId }));
    this.#shuffle(deck);
    return {
      id, heroClass,
      hero: { uid: this.nextUid++, kind: 'hero', owner: id, health: STARTING_HEALTH, maxHealth: STARTING_HEALTH,
        armor: 0, attack: 0, attacksThisTurn: 0, frozen: false, frozenTurn: -1 },
      weapon: null,
      mana: 0, maxMana: 0,
      deck, hand: [], board: [],
      heroPowerUsed: false, fatigue: 0, cardsPlayedThisTurn: 0,
    };
  }

  #shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---------------------------------------------------------------- queries

  get active() { return this.players[this.current]; }
  opponentOf(id) { return this.players[1 - id]; }
  card(cardId) { return CARDS[cardId]; }
  heroPower(playerId) { return CLASSES[this.players[playerId].heroClass].heroPower; }

  getEntity(uid) {
    for (const p of this.players) {
      if (p.hero.uid === uid) return p.hero;
      const m = p.board.find(x => x.uid === uid);
      if (m) return m;
    }
    return null;
  }

  allMinions() { return [...this.players[this.current].board, ...this.players[1 - this.current].board]; }

  spellDamage(playerId) {
    return this.players[playerId].board.reduce((s, m) => s + (m.spellDamage || 0), 0);
  }

  /** Characters `playerId` may choose for a target spec. */
  validTargets(playerId, spec, filter, excludeUid) {
    if (!spec) return [];
    const me = this.players[playerId];
    const them = this.opponentOf(playerId);
    const enemyMinions = them.board.filter(m => !m.keywords.stealth);
    let list;
    switch (spec) {
      case 'any': list = [me.hero, them.hero, ...me.board, ...enemyMinions]; break;
      case 'minion': list = [...me.board, ...enemyMinions]; break;
      case 'enemyMinion': list = enemyMinions; break;
      case 'friendlyMinion': list = [...me.board]; break;
      case 'enemy': list = [them.hero, ...enemyMinions]; break;
      case 'friendly': list = [me.hero, ...me.board]; break;
      default: throw new Error(`Unknown target spec ${spec}`);
    }
    list = list.filter(e => e.uid !== excludeUid && e.health > 0);
    if (filter) {
      list = list.filter(e => {
        if (filter.maxAttack != null && e.attack > filter.maxAttack) return false;
        if (filter.minAttack != null && e.attack < filter.minAttack) return false;
        if (filter.damaged && !(e.health < e.maxHealth)) return false;
        if (filter.undamaged && e.health < e.maxHealth) return false;
        if ((filter.damaged || filter.undamaged || filter.maxAttack != null || filter.minAttack != null) && e.kind !== 'minion') return false;
        return true;
      });
    }
    return list;
  }

  /** Why a card can't be played right now, or null if it can. */
  playBlocker(playerId, handUid) {
    if (this.winner !== null || this.phase !== 'play') return 'Game is not in progress';
    if (playerId !== this.current) return 'Not your turn';
    const p = this.players[playerId];
    const inst = p.hand.find(c => c.uid === handUid);
    if (!inst) return 'Card not in hand';
    const card = CARDS[inst.cardId];
    if (card.cost > p.mana) return 'Not enough mana';
    if (card.type === 'minion' && p.board.length >= MAX_BOARD) return 'Board is full';
    if (card.requiresWeapon && !p.weapon) return 'You need a weapon';
    if (card.type === 'spell' && card.target && this.validTargets(playerId, card.target, card.targetFilter).length === 0) {
      return 'No valid targets';
    }
    return null;
  }

  canPlay(playerId, handUid) { return this.playBlocker(playerId, handUid) === null; }

  /** Valid targets for a card in hand (empty if the card needs none). */
  cardTargets(playerId, handUid) {
    const inst = this.players[playerId].hand.find(c => c.uid === handUid);
    if (!inst) return [];
    const card = CARDS[inst.cardId];
    return this.validTargets(playerId, card.target, card.targetFilter);
  }

  canUseHeroPower(playerId) {
    const p = this.players[playerId];
    const hp = this.heroPower(playerId);
    if (this.winner !== null || this.phase !== 'play' || playerId !== this.current) return false;
    if (p.heroPowerUsed || p.mana < hp.cost) return false;
    if (hp.target && this.validTargets(playerId, hp.target).length === 0) return false;
    if (hp.effects.some(e => e.type === 'summon') && p.board.length >= MAX_BOARD) return false;
    return true;
  }

  maxAttacks(e) { return e.kind === 'minion' && e.keywords.windfury ? 2 : 1; }

  canAttack(uid) {
    const e = this.getEntity(uid);
    if (!e || this.winner !== null || this.phase !== 'play') return false;
    if (e.owner !== this.current || e.frozen || e.attack <= 0) return false;
    if (e.attacksThisTurn >= this.maxAttacks(e)) return false;
    if (e.kind === 'minion' && e.sleeping && !e.keywords.charge && !e.keywords.rush) return false;
    return this.attackTargets(uid).length > 0;
  }

  attackTargets(uid) {
    const e = this.getEntity(uid);
    if (!e) return [];
    const them = this.opponentOf(e.owner);
    let targets = [them.hero, ...them.board.filter(m => !m.keywords.stealth)];
    const taunts = targets.filter(t => t.kind === 'minion' && t.keywords.taunt);
    if (taunts.length) targets = taunts;
    if (e.kind === 'minion' && e.sleeping && !e.keywords.charge) targets = targets.filter(t => t.kind === 'minion');
    return targets;
  }

  // ---------------------------------------------------------------- actions

  /** Replace the chosen cards in a player's opening hand. */
  mulligan(playerId, uids = []) {
    if (this.phase !== 'mulligan' || this.mulliganDone[playerId]) return false;
    const p = this.players[playerId];
    const returned = p.hand.filter(c => uids.includes(c.uid));
    p.hand = p.hand.filter(c => !uids.includes(c.uid));
    for (let i = 0; i < returned.length; i++) this.#drawRaw(p);
    p.deck.push(...returned);
    this.#shuffle(p.deck);
    this.mulliganDone[playerId] = true;
    if (this.mulliganDone.every(Boolean)) this.#begin();
    return true;
  }

  #begin() {
    this.phase = 'play';
    const second = this.players[1 - this.current];
    second.hand.push({ uid: this.nextUid++, cardId: 't_coin' });
    this.#log(this.current === 0 ? 'You go first.' : 'Opponent goes first.');
    this.#startTurn();
  }

  /**
   * Play a card from hand. `position` is the board slot for a minion
   * (0 = leftmost); it defaults to the right end and is clamped to the board.
   */
  playCard(handUid, { target = null, position = null } = {}) {
    const pid = this.current;
    const blocker = this.playBlocker(pid, handUid);
    if (blocker) return this.#fail(blocker);
    const p = this.players[pid];
    const inst = p.hand.find(c => c.uid === handUid);
    const card = CARDS[inst.cardId];

    let targetEnt = null;
    if (card.target) {
      const valid = this.validTargets(pid, card.target, card.targetFilter);
      if (valid.length) {
        targetEnt = valid.find(t => t.uid === target);
        if (!targetEnt) return this.#fail('Choose a valid target');
      }
    }

    p.mana -= card.cost;
    p.hand = p.hand.filter(c => c.uid !== handUid);
    const comboActive = p.cardsPlayedThisTurn > 0;
    p.cardsPlayedThisTurn++;
    this.#emit({ type: 'play', player: pid, cardId: card.id, cardType: card.type });
    this.#log(`${this.#name(pid)} ${pid === 0 ? 'play' : 'plays'} ${card.name}${targetEnt ? ` on ${this.#entName(targetEnt)}` : ''}.`);

    if (card.type === 'spell') {
      const source = { kind: 'spell', owner: pid, cardId: card.id, isSpell: true };
      this.#runEffects(card.effects, { player: pid, source, target: targetEnt });
      if (comboActive && card.combo) this.#runEffects(card.combo, { player: pid, source, target: targetEnt });
      for (const m of [...p.board]) {
        const def = CARDS[m.cardId];
        if (def.onFriendlySpell && m.health > 0) this.#runEffects(def.onFriendlySpell, { player: pid, source: m });
      }
    } else if (card.type === 'minion') {
      const minion = this.#summon(pid, card.id, position);
      if (card.battlecry) this.#runEffects(card.battlecry, { player: pid, source: minion, target: targetEnt });
      if (comboActive && card.combo) this.#runEffects(card.combo, { player: pid, source: minion, target: targetEnt });
    } else if (card.type === 'weapon') {
      this.#equip(pid, card.id);
    }
    this.#resolveDeaths();
    return true;
  }

  useHeroPower(target = null) {
    const pid = this.current;
    if (!this.canUseHeroPower(pid)) return this.#fail("Can't use hero power");
    const hp = this.heroPower(pid);
    const p = this.players[pid];
    let targetEnt = null;
    if (hp.target) {
      targetEnt = this.validTargets(pid, hp.target).find(t => t.uid === target);
      if (!targetEnt) return this.#fail('Choose a valid target');
    }
    p.mana -= hp.cost;
    p.heroPowerUsed = true;
    this.#emit({ type: 'heroPower', player: pid });
    this.#log(`${this.#name(pid)} ${pid === 0 ? 'use' : 'uses'} ${hp.name}${targetEnt ? ` on ${this.#entName(targetEnt)}` : ''}.`);
    this.#runEffects(hp.effects, { player: pid, source: p.hero, target: targetEnt });
    this.#resolveDeaths();
    return true;
  }

  attack(attackerUid, targetUid) {
    if (!this.canAttack(attackerUid)) return this.#fail("That character can't attack");
    const attacker = this.getEntity(attackerUid);
    const target = this.attackTargets(attackerUid).find(t => t.uid === targetUid);
    if (!target) return this.#fail('Invalid attack target');

    attacker.attacksThisTurn++;
    if (attacker.keywords?.stealth) attacker.keywords.stealth = false;
    this.#emit({ type: 'attack', attacker: attacker.uid, target: target.uid });
    const who = this.#entName(attacker);
    this.#log(`${who[0].toUpperCase()}${who.slice(1)} attacks ${this.#entName(target)}.`);

    const atkDmg = attacker.attack;
    const counterDmg = target.kind === 'minion' ? target.attack : 0;
    this.combat = true;
    this.fx = ++this.fxSeq;
    this.#damage(target, atkDmg, attacker);
    if (counterDmg > 0) this.#damage(attacker, counterDmg, target);
    this.combat = false;

    if (attacker.kind === 'hero') {
      const w = this.players[attacker.owner].weapon;
      if (w) {
        w.durability--;
        if (w.durability <= 0) this.#destroyWeapon(attacker.owner);
      }
    }
    this.#resolveDeaths();
    return true;
  }

  endTurn() {
    if (this.winner !== null || this.phase !== 'play') return false;
    const pid = this.current;
    const p = this.players[pid];
    for (const m of [...p.board]) {
      const def = CARDS[m.cardId];
      if (def.endOfTurn && m.health > 0 && !m.destroyed) this.#runEffects(def.endOfTurn, { player: pid, source: m });
    }
    this.#resolveDeaths();
    if (this.winner !== null) return true;
    for (const e of [p.hero, ...p.board]) {
      if (e.frozen && e.frozenTurn !== this.turn) e.frozen = false;
    }
    this.#emit({ type: 'endTurn', player: pid });
    this.current = 1 - pid;
    this.#startTurn();
    return true;
  }

  // -------------------------------------------------------------- internals

  #startTurn() {
    this.turn++;
    const p = this.active;
    p.maxMana = Math.min(MAX_MANA, p.maxMana + 1);
    p.mana = p.maxMana;
    p.heroPowerUsed = false;
    p.cardsPlayedThisTurn = 0;
    p.hero.attacksThisTurn = 0;
    for (const m of p.board) { m.sleeping = false; m.attacksThisTurn = 0; }
    this.#emit({ type: 'startTurn', player: p.id });
    this.#draw(p);
    this.#resolveDeaths();
  }

  #fail(reason) { this.lastError = reason; return false; }
  #emit(ev) { this.events.push(ev); }
  #log(msg) { this.log.push(msg); this.#emit({ type: 'log', msg }); }
  #name(pid) { return pid === 0 ? 'You' : 'Opponent'; }
  #entName(e) {
    if (e.kind === 'hero') return `${e.owner === 0 ? 'your' : "the opponent's"} hero`;
    return CARDS[e.cardId].name;
  }

  takeEvents() { const ev = this.events; this.events = []; return ev; }

  #drawRaw(p) {
    const inst = p.deck.pop();
    if (inst) p.hand.push(inst);
  }

  #draw(p) {
    const inst = p.deck.pop();
    if (!inst) {
      p.fatigue++;
      this.#log(`${this.#name(p.id)} take${p.id === 0 ? '' : 's'} ${p.fatigue} fatigue damage.`);
      this.fx = ++this.fxSeq;
      this.#damage(p.hero, p.fatigue, null);
      return;
    }
    if (p.hand.length >= MAX_HAND) {
      this.#emit({ type: 'burn', player: p.id, cardId: inst.cardId });
      this.#log(`${this.#name(p.id)} burn${p.id === 0 ? '' : 's'} ${CARDS[inst.cardId].name} (hand full).`);
      return;
    }
    p.hand.push(inst);
    this.#emit({ type: 'draw', player: p.id, uid: inst.uid });
  }

  #summon(pid, cardId, position = null) {
    const p = this.players[pid];
    if (p.board.length >= MAX_BOARD) return null;
    const index = position == null ? p.board.length : Math.max(0, Math.min(p.board.length, Math.trunc(position)));
    const def = CARDS[cardId];
    const m = {
      uid: this.nextUid++, kind: 'minion', cardId, owner: pid,
      attack: def.attack, health: def.health, maxHealth: def.health,
      keywords: { ...def.keywords }, spellDamage: def.spellDamage || 0,
      sleeping: true, attacksThisTurn: 0, frozen: false, frozenTurn: -1, destroyed: false, aura: 0,
    };
    p.board.splice(index, 0, m);
    this.#refreshAuras();
    this.#emit({ type: 'summon', uid: m.uid, player: pid, cardId, index });
    return m;
  }

  #equip(pid, cardId) {
    const p = this.players[pid];
    if (p.weapon) this.#destroyWeapon(pid);
    const def = CARDS[cardId];
    p.weapon = { cardId, attack: def.attack, durability: def.durability };
    p.hero.attack = def.attack;
    this.#emit({ type: 'equip', player: pid, uid: p.hero.uid, cardId });
  }

  #destroyWeapon(pid) {
    const p = this.players[pid];
    p.weapon = null;
    p.hero.attack = 0;
  }

  /** Deal damage; returns the amount actually dealt. */
  #damage(target, amount, source) {
    if (amount <= 0 || !target || target.health <= 0 && target.kind === 'hero') return 0;
    if (target.kind === 'minion' && target.keywords.divineShield) {
      target.keywords.divineShield = false;
      this.#emit({ type: 'shield', uid: target.uid, ...this.#meta(source) });
      return 0;
    }
    let dealt = amount;
    if (target.kind === 'hero') {
      const absorbed = Math.min(target.armor, amount);
      target.armor -= absorbed;
      target.health -= amount - absorbed;
    } else {
      target.health -= amount;
    }
    this.#emit({ type: 'damage', uid: target.uid, amount, ...this.#meta(source) });

    if (source && source.kind === 'minion') {
      if (source.keywords.poisonous && target.kind === 'minion') target.destroyed = true;
      if (source.keywords.lifesteal) this.#heal(this.players[source.owner].hero, dealt, source);
    }
    if (target.kind === 'minion') {
      const def = CARDS[target.cardId];
      if (def.onDamaged) this.#runEffects(def.onDamaged, { player: target.owner, source: target });
    }
    return dealt;
  }

  /** Where an effect visually comes from: a minion/hero uid, or the caster's hero for spells. */
  #meta(source) {
    const from = source?.uid ?? (source?.kind === 'spell' ? this.players[source.owner].hero.uid : null);
    return { from, fx: this.fx, combat: this.combat, spell: !!source?.isSpell, cardId: source?.cardId };
  }

  #heal(target, amount, source) {
    if (!target || target.health <= 0) return;
    const before = target.health;
    target.health = Math.min(target.maxHealth, target.health + amount);
    if (target.health > before) this.#emit({ type: 'heal', uid: target.uid, amount: target.health - before, ...this.#meta(source) });
  }

  #resolveDeaths() {
    for (let guard = 0; guard < 50; guard++) {
      const dying = [];
      for (const pid of [this.current, 1 - this.current]) {
        const p = this.players[pid];
        let survivors = 0;
        for (const m of p.board) {
          // Remember where it died so deathrattle summons appear in its place.
          if (m.health <= 0 || m.destroyed) { m.deathIndex = survivors; dying.push(m); } else survivors++;
        }
        p.board = p.board.filter(m => !(m.health <= 0 || m.destroyed));
      }
      if (dying.length) this.#refreshAuras();
      for (const m of dying) {
        this.#emit({ type: 'death', uid: m.uid });
        const def = CARDS[m.cardId];
        if (def.deathrattle) this.#runEffects(def.deathrattle, { player: m.owner, source: m });
      }
      if (!dying.length) break;
    }
    const dead = this.players.filter(p => p.hero.health <= 0);
    if (dead.length && this.winner === null) {
      this.winner = dead.length === 2 ? 'draw' : 1 - dead[0].id;
      this.phase = 'over';
      this.#emit({ type: 'gameOver', winner: this.winner });
    }
  }

  /**
   * Re-apply adjacency auras after the board changes. Each minion tracks the
   * aura Attack it currently has, so only the difference is applied.
   */
  #refreshAuras() {
    for (const p of this.players) {
      p.board.forEach((m, i) => {
        let bonus = 0;
        for (const n of [p.board[i - 1], p.board[i + 1]]) {
          if (n && !(n.health <= 0 || n.destroyed)) bonus += CARDS[n.cardId].adjacentAura?.attack ?? 0;
        }
        if (bonus !== m.aura) {
          m.attack += bonus - m.aura;
          m.aura = bonus;
        }
      });
    }
  }

  #alive(e) { return e.health > 0 && !e.destroyed; }

  #select(to, ctx) {
    const me = this.players[ctx.player];
    const them = this.opponentOf(ctx.player);
    const src = ctx.source;
    const alive = list => list.filter(e => this.#alive(e));
    switch (to) {
      case 'target': return ctx.target ? [ctx.target] : [];
      case 'self': return src && src.kind === 'minion' ? [src] : [];
      case 'ownHero': return [me.hero];
      case 'enemyHero': return [them.hero];
      case 'allEnemyMinions': return alive(them.board);
      case 'allFriendlyMinions': return alive(me.board);
      case 'otherFriendlyMinions': return alive(me.board).filter(m => m !== src);
      case 'allMinions': return alive([...me.board, ...them.board]);
      case 'allOtherMinions': return alive([...me.board, ...them.board]).filter(m => m !== src);
      case 'allEnemies': return [them.hero, ...alive(them.board)];
      case 'allFriendly': return [me.hero, ...alive(me.board)];
      case 'allOtherCharacters': return [me.hero, them.hero, ...alive([...me.board, ...them.board])].filter(e => e !== src);
      case 'randomEnemy': return this.#pickRandom([them.hero, ...alive(them.board)]);
      case 'randomEnemyMinion': return this.#pickRandom(alive(them.board));
      case 'randomFriendlyMinion': return this.#pickRandom(alive(me.board));
      case 'adjacent': {
        const board = src?.kind === 'minion' ? this.players[src.owner].board : [];
        const i = board.indexOf(src);
        return i < 0 ? [] : alive([board[i - 1], board[i + 1]].filter(Boolean));
      }
      default: throw new Error(`Unknown selector ${to}`);
    }
  }

  #pickRandom(list) { return list.length ? [list[Math.floor(this.rand() * list.length)]] : []; }

  #runEffects(effects, ctx) {
    for (const eff of effects || []) {
      if (this.winner !== null) return;
      this.#resolveEffect(eff, ctx);
    }
  }

  #resolveEffect(eff, ctx) {
    // Nested triggers (e.g. onDamaged) get their own fx id and restore ours after.
    const outerFx = this.fx;
    this.fx = ++this.fxSeq;
    try {
      this.#applyEffect(eff, ctx);
    } finally {
      this.fx = outerFx;
    }
  }

  #applyEffect(eff, ctx) {
    const me = this.players[ctx.player];
    switch (eff.type) {
      case 'damage': {
        const amount = eff.amount + (ctx.source?.isSpell ? this.spellDamage(ctx.player) : 0);
        const times = eff.times || 1;
        const hit = new Set();
        for (let i = 0; i < times; i++) {
          if (i > 0) this.fx = ++this.fxSeq;
          let targets = this.#select(eff.to, ctx);
          if (eff.distinct && eff.to.startsWith('random')) {
            const them = this.opponentOf(ctx.player);
            const pool = (eff.to === 'randomEnemyMinion' ? them.board : [them.hero, ...them.board])
              .filter(e => this.#alive(e) && !hit.has(e));
            targets = this.#pickRandom(pool);
          }
          for (const t of targets) { hit.add(t); this.#damage(t, amount, ctx.source); }
        }
        break;
      }
      case 'heal':
        for (const t of this.#select(eff.to, ctx)) this.#heal(t, eff.amount, ctx.source);
        break;
      case 'armor':
        me.hero.armor += eff.amount;
        this.#emit({ type: 'armor', uid: me.hero.uid, amount: eff.amount });
        break;
      case 'draw':
        for (let i = 0; i < eff.count; i++) this.#draw(me);
        break;
      case 'summon': {
        // Tokens from a minion appear to its right; deathrattle tokens take its
        // old spot; anything else (spells, hero powers) goes on the right end.
        const src = ctx.source;
        const board = me.board;
        let at = null;
        if (src?.kind === 'minion' && src.owner === ctx.player) {
          const i = board.indexOf(src);
          if (i >= 0) at = i + 1;
          else if (src.deathIndex != null) at = Math.min(src.deathIndex, board.length);
        }
        for (let i = 0; i < (eff.count || 1); i++) {
          const m = this.#summon(ctx.player, eff.card, at);
          if (m && at != null) at++;
        }
        break;
      }
        break;
      case 'buff':
        for (const t of this.#select(eff.to, ctx)) {
          if (t.kind !== 'minion') continue;
          t.attack += eff.attack || 0;
          t.health += eff.health || 0;
          t.maxHealth += eff.health || 0;
          Object.assign(t.keywords, eff.keywords || {});
          this.#emit({ type: 'buff', uid: t.uid, ...this.#meta(ctx.source) });
        }
        break;
      case 'destroy':
        for (const t of this.#select(eff.to, ctx)) {
          if (t.kind !== 'minion') continue;
          t.destroyed = true;
          this.#emit({ type: 'destroy', uid: t.uid, ...this.#meta(ctx.source) });
        }
        break;
      case 'freeze':
        for (const t of this.#select(eff.to, ctx)) {
          if (!this.#alive(t)) continue;
          t.frozen = true;
          t.frozenTurn = this.turn;
          this.#emit({ type: 'freeze', uid: t.uid, ...this.#meta(ctx.source) });
        }
        break;
      case 'weapon':
        this.#equip(ctx.player, eff.card);
        break;
      case 'buffWeapon':
        if (me.weapon) { me.weapon.attack += eff.attack; me.hero.attack = me.weapon.attack; }
        break;
      case 'mana':
        me.mana = Math.min(MAX_MANA, me.mana + eff.amount);
        break;
      case 'bounce':
        for (const t of this.#select(eff.to, ctx)) {
          if (t.kind !== 'minion') continue;
          const owner = this.players[t.owner];
          owner.board = owner.board.filter(m => m !== t);
          this.#refreshAuras();
          this.#emit({ type: 'bounce', uid: t.uid, ...this.#meta(ctx.source) });
          if (owner.hand.length < MAX_HAND) owner.hand.push({ uid: this.nextUid++, cardId: t.cardId });
        }
        break;
      case 'copyFromOpponentDeck': {
        const deck = this.opponentOf(ctx.player).deck;
        for (let i = 0; i < eff.count && deck.length; i++) {
          const src = deck[Math.floor(this.rand() * deck.length)];
          if (me.hand.length < MAX_HAND) me.hand.push({ uid: this.nextUid++, cardId: src.cardId });
        }
        break;
      }
      default:
        throw new Error(`Unknown effect ${eff.type}`);
    }
  }
}
