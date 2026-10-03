// A simple greedy AI. `nextAction` returns one action at a time so the UI can
// animate the AI's turn; it returns null when the AI wants to end its turn.

import { CARDS } from './cards.js';

const HOSTILE = new Set(['damage', 'destroy', 'freeze', 'bounce']);

function targetIntent(effects = []) {
  const targeted = effects.filter(e => e.to === 'target');
  if (!targeted.length) return null;
  return targeted.some(e => HOSTILE.has(e.type)) ? 'hostile' : 'friendly';
}

function damageAmount(effects = []) {
  return effects.filter(e => e.type === 'damage' && e.to === 'target').reduce((s, e) => s + e.amount, 0);
}

/** Rough value of an AoE spell: enemy stats removed minus friendly stats lost. */
function aoeValue(game, pid, effects) {
  let value = 0;
  const me = game.players[pid];
  const them = game.opponentOf(pid);
  for (const e of effects) {
    if (e.type !== 'damage' || e.to === 'target' || e.to.startsWith('random')) continue;
    const amt = e.amount + game.spellDamage(pid);
    const hitsEnemies = ['allEnemyMinions', 'allMinions', 'allEnemies', 'allOtherCharacters', 'allOtherMinions'].includes(e.to);
    const hitsFriends = ['allMinions', 'allOtherCharacters', 'allOtherMinions'].includes(e.to);
    const score = m => (m.keywords.divineShield ? 0 : m.health <= amt ? m.attack + m.health : amt * 0.5);
    if (hitsEnemies) value += them.board.reduce((s, m) => s + score(m), 0);
    if (hitsFriends) value -= me.board.reduce((s, m) => s + score(m), 0);
  }
  return value;
}

function chooseTarget(game, pid, card, targets) {
  if (!targets.length) return { ok: true, target: null };
  const effects = card.type === 'spell' ? card.effects : card.battlecry;
  const intent = targetIntent(effects);
  const enemies = targets.filter(t => t.owner !== pid);
  const friends = targets.filter(t => t.owner === pid);

  if (intent === 'hostile') {
    const minions = enemies.filter(t => t.kind === 'minion');
    const dmg = damageAmount(effects) + (card.type === 'spell' ? game.spellDamage(pid) : 0);
    const destroys = effects.some(e => e.type === 'destroy' || e.type === 'bounce');
    if (destroys) {
      const best = minions.sort((a, b) => (b.attack + b.health) - (a.attack + a.health))[0];
      if (!best) return { ok: false };
      // Don't waste removal on tiny minions.
      if (card.type === 'spell' && best.attack + best.health < card.cost * 2 && card.cost > 1) return { ok: false };
      return { ok: true, target: best.uid };
    }
    const killable = minions.filter(m => !m.keywords.divineShield && m.health <= dmg).sort((a, b) => b.attack - a.attack);
    if (killable.length) return { ok: true, target: killable[0].uid };
    const hero = enemies.find(t => t.kind === 'hero');
    if (hero) return { ok: true, target: hero.uid };
    if (minions.length) return { ok: true, target: minions.sort((a, b) => b.attack - a.attack)[0].uid };
    // Only friendly targets: battlecry minions must still be played; spells wait.
    if (card.type === 'minion') {
      const ownHero = friends.find(t => t.kind === 'hero');
      if (ownHero && ownHero.health > dmg + 5) return { ok: true, target: ownHero.uid };
      const fodder = friends.filter(t => t.kind === 'minion').sort((a, b) => b.health - a.health)[0];
      return fodder ? { ok: true, target: fodder.uid } : { ok: false };
    }
    return { ok: false };
  }

  // Friendly intent: heals go to the most damaged friend, buffs to the best minion.
  const isHeal = effects.some(e => e.type === 'heal' && e.to === 'target');
  if (isHeal) {
    const hurt = friends.filter(t => t.health < t.maxHealth).sort((a, b) => (b.maxHealth - b.health) - (a.maxHealth - a.health));
    return hurt.length ? { ok: true, target: hurt[0].uid } : { ok: card.type === 'minion', target: friends[0]?.uid ?? targets[0].uid };
  }
  const friendMinions = friends.filter(t => t.kind === 'minion').sort((a, b) => (b.attack + b.health) - (a.attack + a.health));
  if (friendMinions.length) return { ok: true, target: friendMinions[0].uid };
  if (card.type === 'minion') return { ok: true, target: targets[0].uid };
  return { ok: false };
}

/** Pick a board slot for a minion so adjacency effects land well. */
export function choosePosition(game, pid, card) {
  const board = game.players[pid].board;
  const touchesNeighbors = card.adjacentAura || (card.battlecry || []).some(e => e.to === 'adjacent');
  if (touchesNeighbors) {
    // The gap whose neighbors are worth the most (both sides beats one).
    let best = board.length, bestScore = -1;
    for (let i = 0; i <= board.length; i++) {
      const score = [board[i - 1], board[i]].filter(Boolean)
        .reduce((sum, m) => sum + (card.adjacentAura ? m.attack : m.attack + m.health) + 10, 0);
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }
  // Anything that attacks wants to stand next to an aura minion.
  if (card.attack > 0) {
    const totem = board.findIndex(m => CARDS[m.cardId].adjacentAura);
    if (totem >= 0) return board[totem + 1] && !board[totem - 1] ? totem : totem + 1;
  }
  return board.length;
}

function planCardPlay(game, pid) {
  const p = game.players[pid];
  const options = [];
  for (const inst of p.hand) {
    if (!game.canPlay(pid, inst.uid)) continue;
    const card = CARDS[inst.cardId];
    if (card.id === 't_coin') {
      // Only coin if it unlocks a card we couldn't otherwise play.
      const unlocks = p.hand.some(c => CARDS[c.cardId].cost === p.mana + 1);
      if (unlocks) options.push({ inst, score: 1, target: null });
      continue;
    }
    if (card.type === 'spell' && !card.target) {
      const aoe = aoeValue(game, pid, card.effects);
      const hasAoe = card.effects.some(e => e.type === 'damage' && e.to !== 'target' && !e.to.startsWith('random'));
      if (hasAoe && aoe < 4) continue;
      if (card.effects.some(e => e.type === 'freeze') && game.opponentOf(pid).board.length < 2) continue;
      if (card.effects.some(e => e.to === 'randomEnemyMinion') && !game.opponentOf(pid).board.length) continue;
      if (card.effects.some(e => e.type === 'heal') && !hasAoe && p.hero.health > 20) continue;
      options.push({ inst, score: card.cost * 10 + Math.max(0, aoe), target: null });
      continue;
    }
    const { ok, target } = chooseTarget(game, pid, card, game.cardTargets(pid, inst.uid));
    if (!ok) continue;
    if (card.type === 'weapon' && p.weapon) continue;
    options.push({ inst, score: card.cost * 10 + (card.type === 'minion' ? 2 : 0), target });
  }
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  if (!best) return null;
  const card = CARDS[best.inst.cardId];
  const position = card.type === 'minion' ? choosePosition(game, pid, card) : null;
  return { type: 'play', uid: best.inst.uid, target: best.target, position };
}

function planHeroPower(game, pid) {
  if (!game.canUseHeroPower(pid)) return null;
  const hp = game.heroPower(pid);
  const p = game.players[pid];
  if (!hp.target) {
    if (hp.effects.some(e => e.type === 'weapon') && p.weapon) return null;
    return { type: 'heroPower', target: null };
  }
  const targets = game.validTargets(pid, hp.target);
  const isHeal = hp.effects.some(e => e.type === 'heal');
  if (isHeal) {
    const hurt = targets.filter(t => t.owner === pid && t.health < t.maxHealth)
      .sort((a, b) => (b.maxHealth - b.health) - (a.maxHealth - a.health));
    return hurt.length ? { type: 'heroPower', target: hurt[0].uid } : null;
  }
  const amt = hp.effects.find(e => e.type === 'damage')?.amount ?? 1;
  const kill = targets.filter(t => t.owner !== pid && t.kind === 'minion' && !t.keywords.divineShield && t.health <= amt)
    .sort((a, b) => b.attack - a.attack)[0];
  if (kill) return { type: 'heroPower', target: kill.uid };
  const face = targets.find(t => t.owner !== pid && t.kind === 'hero');
  return face ? { type: 'heroPower', target: face.uid } : null;
}

function planAttack(game, pid) {
  const p = game.players[pid];
  const enemyHero = game.opponentOf(pid).hero;
  const attackers = [...p.board, p.hero].filter(e => game.canAttack(e.uid));
  if (!attackers.length) return null;

  // Lethal check: if everything can go face and that's enough, do it.
  const faceAttackers = attackers.filter(a => game.attackTargets(a.uid).includes(enemyHero));
  const faceDmg = faceAttackers.reduce((s, a) => s + a.attack * (game.maxAttacks(a) - a.attacksThisTurn), 0);
  if (faceAttackers.length && faceDmg >= enemyHero.health + enemyHero.armor) {
    return { type: 'attack', uid: faceAttackers[0].uid, target: enemyHero.uid };
  }

  for (const a of attackers) {
    const targets = game.attackTargets(a.uid);
    const minions = targets.filter(t => t.kind === 'minion');
    const kills = t => a.attack >= t.health || (a.kind === 'minion' && a.keywords.poisonous);
    const survives = t => a.kind === 'minion' && (a.keywords.divineShield || t.attack < a.health);

    if (a.kind === 'hero') {
      // Heroes only hit face, or a taunt they can kill cheaply.
      if (targets.includes(enemyHero)) return { type: 'attack', uid: a.uid, target: enemyHero.uid };
      const t = minions.filter(m => kills(m) && m.attack < p.hero.health - 10)[0];
      if (t) return { type: 'attack', uid: a.uid, target: t.uid };
      continue;
    }

    // Value trade: kill something and survive.
    const value = minions.filter(t => !t.keywords.divineShield && kills(t) && survives(t)).sort((x, y) => y.attack - x.attack)[0];
    if (value && (value.attack >= 2 || !targets.includes(enemyHero))) return { type: 'attack', uid: a.uid, target: value.uid };
    // Even trade into something at least as valuable.
    const even = minions.filter(t => !t.keywords.divineShield && kills(t) && t.attack + t.health >= a.attack + a.health)
      .sort((x, y) => (y.attack + y.health) - (x.attack + x.health))[0];
    if (even) return { type: 'attack', uid: a.uid, target: even.uid };
    if (targets.includes(enemyHero)) return { type: 'attack', uid: a.uid, target: enemyHero.uid };
    // Forced to hit a taunt (or rush minion with only minion targets).
    if (minions.length) {
      const t = minions.sort((x, y) => x.health - y.health)[0];
      return { type: 'attack', uid: a.uid, target: t.uid };
    }
  }
  return null;
}

export function nextAction(game, pid) {
  if (game.winner !== null || game.current !== pid) return null;
  return planCardPlay(game, pid) ?? planHeroPower(game, pid) ?? planAttack(game, pid);
}

/** Pick cards to throw back during the mulligan. */
export function mulliganChoice(game, pid) {
  return game.players[pid].hand.filter(c => CARDS[c.cardId].cost > 3).map(c => c.uid);
}

/** Apply an action produced by nextAction. Returns false if the engine rejected it. */
export function applyAction(game, action) {
  if (action.type === 'play') return game.playCard(action.uid, { target: action.target, position: action.position });
  if (action.type === 'heroPower') return game.useHeroPower(action.target);
  if (action.type === 'attack') return game.attack(action.uid, action.target);
  return false;
}

/** Play out an entire AI turn synchronously (used by tests / simulations). */
export function playTurn(game, pid, maxActions = 60) {
  for (let i = 0; i < maxActions; i++) {
    const action = nextAction(game, pid);
    if (!action || !applyAction(game, action)) break;
  }
  if (game.winner === null && game.current === pid) game.endTurn();
}
