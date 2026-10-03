// Browser UI for Riftclash. The human is always player 0; the AI is player 1.

import { Game, MAX_MANA } from './engine.js';
import { CARDS, CLASSES, KEYWORD_LABELS, KEYWORD_HELP, cardText } from './cards.js';
import { nextAction, applyAction, mulliganChoice } from './ai.js';
import * as fx from './fx.js';
import { sfx, unlock, isMuted, setMuted } from './sfx.js';

const HUMAN = 0;
const AI = 1;
const $ = sel => document.querySelector(sel);
const sleep = fx.sleep;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** While effects play, input is ignored; the body class lets CSS show it. */
function setBusy(value) {
  ui.busy = value;
  document.body.classList.toggle('busy', value);
}

const ui = {
  game: null,
  playerClass: null,
  aiClass: 'random',
  selection: null, // { type: 'hand' | 'attacker' | 'heroPower', uid? }
  busy: false,
  mulliganPicks: new Set(),
};

// ------------------------------------------------------------------ menu

function renderMenu() {
  $('#class-grid').innerHTML = Object.entries(CLASSES).map(([key, c]) => `
    <button class="class-tile${ui.playerClass === key ? ' chosen' : ''}" data-class="${key}" style="--cls:${c.color}">
      <span class="class-emoji">${c.emoji}</span>
      <span class="class-name">${c.name}</span>
      <span class="class-hero">${esc(c.hero)}</span>
      <span class="class-power"><b>${c.heroPower.name}</b> (${c.heroPower.cost}): ${esc(c.heroPower.text)}</span>
    </button>`).join('');
  $('#opponent-select').innerHTML = `<option value="random">Random</option>` +
    Object.entries(CLASSES).map(([k, c]) => `<option value="${k}"${ui.aiClass === k ? ' selected' : ''}>${c.name}</option>`).join('');
  $('#start-btn').disabled = !ui.playerClass;
}

$('#class-grid').addEventListener('click', e => {
  const tile = e.target.closest('[data-class]');
  if (!tile) return;
  ui.playerClass = tile.dataset.class;
  renderMenu();
});
$('#opponent-select').addEventListener('change', e => { ui.aiClass = e.target.value; });
$('#start-btn').addEventListener('click', startGame);
$('#again-btn').addEventListener('click', startGame);
$('#menu-btn').addEventListener('click', () => {
  $('#overlay').classList.add('hidden');
  showScreen('menu');
});

function showScreen(id) {
  for (const s of ['menu', 'mulligan', 'table']) $('#' + s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('in-game', id === 'table');
}

// ------------------------------------------------------------------ setup

function startGame() {
  const keys = Object.keys(CLASSES);
  const aiClass = ui.aiClass === 'random' ? keys[Math.floor(Math.random() * keys.length)] : ui.aiClass;
  ui.game = new Game({ classes: [ui.playerClass, aiClass], seed: Date.now() });
  ui.selection = null;
  setBusy(false);
  ui.mulliganPicks = new Set();
  $('#log').innerHTML = '';
  $('#overlay').classList.add('hidden');
  ui.game.mulligan(AI, mulliganChoice(ui.game, AI));
  renderMulligan();
  showScreen('mulligan');
}

function renderMulligan() {
  const g = ui.game;
  $('#mulligan-title').textContent = g.current === HUMAN ? 'You go first' : 'You go second (+ Ember Coin)';
  $('#mulligan-cards').innerHTML = g.players[HUMAN].hand.map(inst => `
    <div class="mulligan-slot${ui.mulliganPicks.has(inst.uid) ? ' replace' : ''}" data-uid="${inst.uid}">
      ${cardHTML(inst.cardId)}
    </div>`).join('');
}

$('#mulligan-cards').addEventListener('click', e => {
  const slot = e.target.closest('[data-uid]');
  if (!slot) return;
  const uid = Number(slot.dataset.uid);
  ui.mulliganPicks.has(uid) ? ui.mulliganPicks.delete(uid) : ui.mulliganPicks.add(uid);
  renderMulligan();
});

$('#mulligan-btn').addEventListener('click', async () => {
  ui.game.mulligan(HUMAN, [...ui.mulliganPicks]);
  showScreen('table');
  await flushEvents();
  render();
  if (ui.game.current === AI) runAiTurn();
  else yourTurn();
});

// ------------------------------------------------------------------ rendering

function cardHTML(cardId, { cost, extraClass = '' } = {}) {
  const c = CARDS[cardId];
  const color = CLASSES[c.cls]?.color ?? '#8a8f98';
  const stats = c.type === 'minion'
    ? `<span class="stat atk">${c.attack}</span><span class="stat hp">${c.health}</span>`
    : c.type === 'weapon'
      ? `<span class="stat atk">${c.attack}</span><span class="stat dur">${c.durability}</span>`
      : '';
  return `
    <div class="card ${c.type} ${extraClass}" style="--cls:${color}">
      <span class="cost">${cost ?? c.cost}</span>
      <div class="art">${c.emoji}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="text"><span>${formatText(cardText(c))}</span></div>
      <div class="type-line">${c.cls === 'neutral' ? '' : CLASSES[c.cls].name + ' '}${c.type}</div>
      ${stats}
    </div>`;
}

function formatText(text) {
  let t = esc(text);
  for (const w of ['Battlecry', 'Deathrattle', 'Combo', 'Freeze', ...Object.values(KEYWORD_LABELS), 'Spell Damage']) {
    t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), `<b>${w}</b>`);
  }
  return t;
}

function targetSet() {
  const g = ui.game;
  const s = ui.selection;
  if (!s) return new Set();
  let list = [];
  if (s.type === 'hand') list = g.cardTargets(HUMAN, s.uid);
  else if (s.type === 'heroPower') list = g.validTargets(HUMAN, g.heroPower(HUMAN).target);
  else if (s.type === 'attacker') list = g.attackTargets(s.uid);
  return new Set(list.map(e => e.uid));
}

function minionHTML(m, targets) {
  const def = CARDS[m.cardId];
  const g = ui.game;
  const myTurn = g.current === HUMAN && !ui.busy;
  const cls = ['unit'];
  if (m.keywords.taunt) cls.push('taunt');
  if (m.keywords.divineShield) cls.push('shielded');
  if (m.keywords.stealth) cls.push('stealthed');
  if (m.frozen) cls.push('frozen');
  if (m.owner === HUMAN && myTurn && g.canAttack(m.uid)) cls.push('ready');
  if (ui.selection?.uid === m.uid && ui.selection.type === 'attacker') cls.push('selected');
  if (targets.has(m.uid)) cls.push('targetable');
  const hpCls = m.health < m.maxHealth ? 'damaged' : m.maxHealth > def.health ? 'buffed' : '';
  const atkCls = m.attack > def.attack ? 'buffed' : m.attack < def.attack ? 'damaged' : '';
  const icons = [
    def.deathrattle ? '<span title="Deathrattle">💀</span>' : '',
    def.endOfTurn || def.onDamaged || def.onFriendlySpell ? '<span title="Triggered effect">⚡</span>' : '',
    def.adjacentAura ? '<span title="Aura: affects adjacent minions">✨</span>' : '',
    m.keywords.poisonous ? '<span title="Poisonous">☠️</span>' : '',
    m.keywords.lifesteal ? '<span title="Lifesteal">🩸</span>' : '',
    m.keywords.windfury ? '<span title="Windfury">🌪</span>' : '',
    m.spellDamage ? `<span title="Spell Damage">✦${m.spellDamage}</span>` : '',
  ].join('');
  return `
    <div class="${cls.join(' ')}" data-uid="${m.uid}" data-card="${m.cardId}" style="--cls:${CLASSES[def.cls]?.color ?? '#8a8f98'}">
      <div class="unit-art">${def.emoji}</div>
      ${m.sleeping && !m.keywords.charge && !m.keywords.rush && m.owner === g.current ? '<span class="zzz">z<sup>z</sup></span>' : ''}
      <div class="unit-icons">${icons}</div>
      <span class="stat atk ${atkCls}">${m.attack}</span>
      <span class="stat hp ${hpCls}">${m.health}</span>
    </div>`;
}

function heroHTML(pid, targets) {
  const g = ui.game;
  const p = g.players[pid];
  const c = CLASSES[p.heroClass];
  const h = p.hero;
  const hp = c.heroPower;
  const isHuman = pid === HUMAN;
  const myTurn = g.current === HUMAN && !ui.busy;
  const cls = ['hero'];
  if (h.frozen) cls.push('frozen');
  if (targets.has(h.uid)) cls.push('targetable');
  if (isHuman && myTurn && g.canAttack(h.uid)) cls.push('ready');
  if (ui.selection?.uid === h.uid) cls.push('selected');
  const hpUsable = isHuman && myTurn && g.canUseHeroPower(HUMAN);
  const crystals = Array.from({ length: MAX_MANA }, (_, i) =>
    `<i class="${i < p.mana ? 'full' : i < p.maxMana ? 'spent' : 'locked'}"></i>`).join('');
  const weapon = p.weapon ? `
    <div class="hero-weapon" data-card="${p.weapon.cardId}">
      <span>${CARDS[p.weapon.cardId].emoji}</span>
      <span class="stat atk">${p.weapon.attack}</span><span class="stat dur">${p.weapon.durability}</span>
    </div>` : '<div class="hero-weapon empty"></div>';
  return `
    <div class="hero-row ${isHuman ? 'you' : 'foe'}">
      <div class="side-info">
        <div class="deck-count" title="Cards left in deck">🂠 ${p.deck.length}</div>
        ${isHuman ? '' : `<div class="hand-count" title="Cards in hand">✋ ${p.hand.length}</div>`}
      </div>
      ${weapon}
      <div class="${cls.join(' ')}" data-uid="${h.uid}" style="--cls:${c.color}">
        <div class="portrait">${c.emoji}</div>
        <div class="hero-name">${esc(c.hero)}</div>
        ${h.attack > 0 ? `<span class="stat atk">${h.attack}</span>` : ''}
        <span class="stat hp ${h.health < h.maxHealth ? 'damaged' : ''}">${h.health}</span>
        ${h.armor > 0 ? `<span class="stat armor">${h.armor}</span>` : ''}
      </div>
      <button class="hero-power${p.heroPowerUsed ? ' used' : ''}${hpUsable ? ' usable' : ''}${ui.selection?.type === 'heroPower' && isHuman ? ' selected' : ''}"
        ${isHuman ? 'data-action="hero-power"' : ''} data-hp="${p.heroClass}" style="--cls:${c.color}" ${isHuman ? '' : 'tabindex="-1"'}>
        <span class="cost">${hp.cost}</span>
        <span class="hp-name">${hp.name}</span>
      </button>
      <div class="mana" title="Mana">
        <span class="mana-text">${p.mana}/${p.maxMana}</span>
        <div class="crystals">${crystals}</div>
      </div>
    </div>`;
}

function render() {
  const g = ui.game;
  if (!g) return;
  const targets = targetSet();
  const me = g.players[HUMAN];
  const foe = g.players[AI];
  const myTurn = g.current === HUMAN && !ui.busy && g.winner === null;

  const handCards = me.hand.map((inst, i) => {
    const playable = myTurn && g.canPlay(HUMAN, inst.uid);
    const selected = (ui.selection?.type === 'hand' || ui.selection?.type === 'place') && ui.selection.uid === inst.uid;
    const n = me.hand.length;
    const rot = n > 1 ? (i - (n - 1) / 2) * Math.min(6, 40 / n) : 0;
    return `<div class="hand-card${playable ? ' playable' : ''}${selected ? ' selected' : ''}" data-hand="${inst.uid}" data-card="${inst.cardId}" style="--rot:${rot}deg">
      ${cardHTML(inst.cardId)}</div>`;
  }).join('');

  // Remember where minions were so position changes can slide instead of jump.
  const before = new Map([...document.querySelectorAll('#table .lane > .unit[data-uid]')]
    .map(n => [n.dataset.uid, n.getBoundingClientRect().left]));

  $('#table').innerHTML = `
    <div class="foe-hand">${foe.hand.map(() => '<div class="card-back"></div>').join('')}</div>
    ${heroHTML(AI, targets)}
    <div class="lane foe-lane">${foe.board.map(m => minionHTML(m, targets)).join('')}</div>
    <div class="midline">
      <button id="end-turn" class="btn end-turn${myTurn && !hasMovesLeft() ? ' nudge' : ''}" ${myTurn ? '' : 'disabled'}>
        ${g.current === HUMAN ? 'End turn' : 'Enemy turn'}
      </button>
    </div>
    <div class="lane you-lane${ui.selection?.type === 'place' ? ' placing' : ''}">${youLaneHTML(me, targets)}</div>
    ${heroHTML(HUMAN, targets)}
    <div class="hand">${handCards}</div>`;
  $('#table').classList.toggle('targeting', !!ui.selection);
  slideFrom(before);
}

/** Your lane, with drop slots while placing or a ghost where a minion will go. */
function youLaneHTML(me, targets) {
  const sel = ui.selection;
  const units = me.board.map(m => minionHTML(m, targets));
  if (sel?.type === 'place') {
    const parts = [];
    for (let i = 0; i <= units.length; i++) {
      parts.push(`<div class="slot" data-slot="${i}"></div>`);
      if (i < units.length) parts.push(units[i]);
    }
    return parts.join('');
  }
  if (sel?.type === 'hand' && sel.position != null) {
    const def = CARDS[me.hand.find(c => c.uid === sel.uid)?.cardId];
    if (def) units.splice(sel.position, 0, ghostHTML(def));
  }
  return units.join('');
}

function ghostHTML(def) {
  return `<div class="unit ghost" style="--cls:${CLASSES[def.cls]?.color ?? '#8a8f98'}">
    <div class="unit-art">${def.emoji}</div>
    <span class="stat atk">${def.attack}</span><span class="stat hp">${def.health}</span></div>`;
}

/** FLIP: animate minions from their old x positions to their new ones. */
function slideFrom(before) {
  if (fx.reducedMotion || !before.size) return;
  for (const n of document.querySelectorAll('#table .lane > .unit[data-uid]')) {
    const x0 = before.get(n.dataset.uid);
    if (x0 == null) continue;
    const dx = x0 - n.getBoundingClientRect().left;
    if (Math.abs(dx) > 1) n.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

/** Board slot (0 = leftmost) for a pointer x position over your lane. */
function insertionIndex(clientX) {
  const lane = $('#table .you-lane');
  const units = [...lane.querySelectorAll(':scope > .unit[data-uid]')];
  // Layout positions (offsetLeft) ignore in-flight slide animations.
  const left = lane.getBoundingClientRect().left;
  const i = units.findIndex(u => clientX < left + u.offsetLeft + u.offsetWidth / 2);
  return i === -1 ? units.length : i;
}

function overYourLane(x, y) {
  const lane = $('#table .you-lane');
  if (!lane) return false;
  const r = lane.getBoundingClientRect();
  return y >= r.top - 40 && y <= r.bottom + 30;
}

function highlightSlot(x, y) {
  const hot = overYourLane(x, y) ? insertionIndex(x) : -1;
  document.querySelectorAll('#table .slot').forEach(s => s.classList.toggle('hot', Number(s.dataset.slot) === hot));
}

/** Position chosen: target next if the battlecry needs one, otherwise play now. */
function choosePlacement(uid, position, fromRect) {
  if (ui.game.cardTargets(HUMAN, uid).length) {
    sfx.click();
    ui.selection = { type: 'hand', uid, position };
    return render();
  }
  return act(() => ui.game.playCard(uid, { position }), { handUid: uid, fromRect });
}

function hasMovesLeft() {
  const g = ui.game;
  const me = g.players[HUMAN];
  return me.hand.some(c => g.canPlay(HUMAN, c.uid)) || g.canUseHeroPower(HUMAN) ||
    [me.hero, ...me.board].some(e => g.canAttack(e.uid));
}

// ------------------------------------------------------------------ feedback

function toast(msg) {
  sfx.error();
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 1600);
}

async function banner(msg) {
  const b = $('#banner');
  b.textContent = msg;
  b.classList.remove('hidden');
  await sleep(900);
  b.classList.add('hidden');
}

function floatText(uid, text, kind) {
  const el = document.querySelector(`[data-uid="${uid}"]`);
  if (!el) return;
  const f = document.createElement('span');
  f.className = `float ${kind}`;
  f.textContent = text;
  el.appendChild(f);
}

// ------------------------------------------------------------------ animation director
//
// The engine resolves an action instantly and leaves a list of events. The
// director replays them on the *old* DOM (before re-rendering) so the player
// sees cards fly, attacks land and minions shatter in order, then renders the
// final state.

const EFFECT_EVENTS = new Set(['damage', 'heal', 'freeze', 'buff', 'shield', 'destroy', 'bounce']);
const nodeOf = uid => document.querySelector(`#table [data-uid="${uid}"]`);
const tableEl = () => $('#table');

function classColor(cardId, fallback = '#ff9a3c') {
  const c = CARDS[cardId];
  return (c && CLASSES[c.cls]?.color) || fallback;
}

function effectColor(ev) {
  switch (ev.type) {
    case 'freeze': return '#9fe7ff';
    case 'heal': return '#8dff8d';
    case 'buff': return '#ffe27a';
    case 'destroy': return '#b16cff';
    case 'bounce': return '#c9a8ff';
    default: return ev.spell ? classColor(ev.cardId) : '#ff8a3c';
  }
}

/** Nudge a displayed Health number so it updates as hits land. */
function bumpHp(uid, delta) {
  const node = nodeOf(uid);
  const stat = node?.querySelector(':scope > .stat.hp');
  if (!stat || node.querySelector(':scope > .stat.armor')) return;
  stat.textContent = Number(stat.textContent) + delta;
  if (delta < 0) stat.classList.add('damaged');
}

function restartClass(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

async function flushEvents({ fromRect = null } = {}) {
  const events = ui.game.takeEvents();
  const st = { fromRect, flying: null, castPoint: null, attackReturn: null };
  $('#tooltip').className = 'hidden';
  if (events.some(e => e.type === 'play' || e.type === 'attack' || e.type === 'heroPower')) $('#banner').classList.add('hidden');
  let visual = false;
  for (let i = 0; i < events.length;) {
    const ev = events[i];
    if (EFFECT_EVENTS.has(ev.type) && !ev.combat) {
      let j = i + 1;
      while (j < events.length && EFFECT_EVENTS.has(events[j].type) && !events[j].combat && events[j].fx === ev.fx) j++;
      await effectGroup(events.slice(i, j), st);
      visual = true;
      i = j;
      continue;
    }
    if (await animateEvent(ev, st, events.slice(i + 1))) visual = true;
    i++;
  }
  if (st.attackReturn) await st.attackReturn;
  st.flying?.remove();
  if (visual) await sleep(380);
  render();
  if (ui.game.winner !== null) await gameOverFx();
}

async function animateEvent(ev, st, rest) {
  switch (ev.type) {
    case 'log': {
      const li = document.createElement('li');
      li.textContent = ev.msg;
      $('#log').prepend(li);
      return false;
    }
    case 'play': await playCardFx(ev, st); return true;
    case 'summon': await summonFx(ev, st); return true;
    case 'equip': await equipFx(ev, st); return true;
    case 'heroPower': await heroPowerFx(ev); return true;
    case 'attack': await attackFx(ev, st, rest); return true;
    case 'armor': armorFx(ev); await sleep(200); return true;
    case 'death': await deathFx(ev); return true;
    case 'draw': drawFx(ev); return false;
    case 'burn':
      if (ev.player === HUMAN) toast(`Hand full! ${CARDS[ev.cardId].name} was burned.`);
      fx.burst($(ev.player === HUMAN ? '.hand' : '.foe-hand'), { color: ['#ff6a3c', '#ffd27a'], count: 30, gravity: -0.05 });
      sfx.burn();
      return true;
    default:
      if (EFFECT_EVENTS.has(ev.type)) { landEffect(ev, { combat: true }); return true; }
      return false;
  }
}

/** Visuals for one effect arriving on its target. */
function landEffect(ev, { combat = false } = {}) {
  const node = nodeOf(ev.uid);
  switch (ev.type) {
    case 'damage': {
      floatText(ev.uid, `-${ev.amount}`, 'dmg');
      bumpHp(ev.uid, -ev.amount);
      restartClass(node, 'hit');
      if (combat) {
        fx.burst(node, { color: ['#ff6a3c', '#ffd27a'], count: 8 + ev.amount * 2, speed: 3 });
      } else {
        fx.burst(node, { color: [effectColor(ev), '#fff3c4'], count: 18 + ev.amount * 4, speed: 4 + ev.amount * 0.6 });
        fx.ring(node, { color: effectColor(ev), maxR: 40 + ev.amount * 8 });
        sfx.impact(ev.amount);
      }
      const isHero = ui.game.getEntity(ev.uid)?.kind === 'hero';
      if (ev.amount >= 5 || (isHero && ev.amount >= 3)) fx.shake(tableEl(), Math.min(14, ev.amount * 1.5));
      break;
    }
    case 'shield':
      floatText(ev.uid, 'Blocked!', 'shield');
      node?.classList.remove('shielded');
      fx.burst(node, { color: ['#ffe78a', '#fff8d0'], count: 22, speed: 6, shape: 'shard', gravity: 0.25 });
      sfx.shield();
      break;
    case 'heal':
      floatText(ev.uid, `+${ev.amount}`, 'heal');
      bumpHp(ev.uid, ev.amount);
      fx.sparkle(node, { color: ['#8dff8d', '#e8ffd0'] });
      sfx.heal();
      break;
    case 'buff':
      fx.sparkle(node, { color: ['#ffe27a', '#fff6d8'], count: 14 });
      fx.ring(node, { color: '#ffe27a', maxR: 55, width: 4 });
      node?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
      sfx.buff();
      break;
    case 'freeze':
      floatText(ev.uid, 'Frozen', 'freeze');
      node?.classList.add('frozen');
      fx.burst(node, { color: ['#bff3ff', '#7fd8ff', '#ffffff'], count: 26, speed: 5, shape: 'shard', gravity: 0.15 });
      sfx.freeze();
      break;
    case 'destroy':
      fx.burst(node, { color: ['#b16cff', '#6a2bbf', '#f0d8ff'], count: 30, speed: 6 });
      fx.ring(node, { color: '#b16cff', maxR: 80, width: 8 });
      sfx.destroy();
      break;
    case 'bounce':
      if (node) node.dataset.gone = '1';
      node?.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-70px) scale(.5)', opacity: 0 }],
        { duration: 400, easing: 'ease-in', fill: 'forwards' });
      fx.sparkle(node, { color: '#c9a8ff' });
      sfx.bounce();
      break;
  }
}

/** One effect hitting one or more targets: projectiles, or a shockwave for area spells. */
async function effectGroup(group, st) {
  const first = group[0];
  const fromNode = first.from != null ? nodeOf(first.from) : null;
  const origin = first.spell && st.castPoint ? st.castPoint : fx.centerOf(fromNode);
  const color = effectColor(first);
  const hostile = first.type === 'damage' || first.type === 'shield';

  if (hostile && group.length >= 3) {
    const c = origin ?? fx.centerOf(tableEl());
    sfx.explosion();
    fx.ring(c, { color, maxR: Math.max(innerWidth, innerHeight) * 0.6, width: 16, life: 650 });
    fx.flash(color, 320, 0.2);
    fx.shake(tableEl(), 9);
    await sleep(160);
    group.forEach((ev, k) => setTimeout(() => landEffect(ev), k * 45));
    await sleep(group.length * 45 + 260);
    return;
  }

  const travels = origin && group.length <= 2 && group.some(ev => ev.uid !== first.from);
  if (travels) {
    sfx.projectile();
    await Promise.all(group.map((ev, k) => sleep(k * 80)
      .then(() => fx.projectile(origin, nodeOf(ev.uid), { color, size: first.type === 'damage' ? 6 + Math.min(6, ev.amount ?? 0) : 7 }))
      .then(() => landEffect(ev))));
  } else {
    group.forEach(ev => landEffect(ev));
  }
  await sleep(220);
}

async function playCardFx(ev, st) {
  const card = CARDS[ev.cardId];
  const color = classColor(card.id, '#e8c46a');
  sfx.cardPlay();
  const fly = document.createElement('div');
  fly.className = 'fly-card';
  fly.innerHTML = cardHTML(card.id);
  document.body.appendChild(fly);
  const w = fly.offsetWidth, h = fly.offsetHeight;
  const tb = tableEl().getBoundingClientRect();
  const cx = tb.left + tb.width / 2, cy = tb.top + tb.height * 0.47;
  fly.style.left = `${cx - w / 2}px`;
  fly.style.top = `${cy - h / 2}px`;

  let from;
  if (ev.player === HUMAN && st.fromRect) {
    const r = st.fromRect;
    from = `translate(${r.left + r.width / 2 - cx}px, ${r.top + r.height / 2 - cy}px) scale(${r.width / w})`;
  } else {
    const fh = $('.foe-hand').getBoundingClientRect();
    from = `translate(0px, ${fh.top + fh.height / 2 - cy}px) scale(.2) rotateY(90deg)`;
  }
  await fly.animate([{ transform: from, opacity: 0.6 }, { transform: 'none', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;
  fx.ring({ x: cx, y: cy }, { color, maxR: w * 0.9, width: 5 });
  fx.burst({ x: cx, y: cy }, { color: [color, '#fff6d8'], count: 16, speed: 3, gravity: 0 });
  await sleep(ev.player === AI ? 800 : 220);

  if (card.type === 'spell') {
    const c = { x: cx, y: cy };
    sfx.spellCast();
    fx.burst(c, { color: [color, '#fff6d8', '#ffffff'], count: 70, speed: 10, size: 5, gravity: 0.01, life: 850 });
    fx.ring(c, { color, maxR: 240, width: 10 });
    await fly.animate([{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
      { transform: 'scale(1.3)', opacity: 0, filter: 'brightness(3)' }],
      { duration: 280, easing: 'ease-in', fill: 'forwards' }).finished;
    fly.remove();
    st.castPoint = c;
  } else {
    st.flying = fly;
  }
}

/** Fly the held card onto a target element, shrinking into it. */
async function landFlyingCard(st, target) {
  const card = st.flying;
  st.flying = null;
  if (!card) return false;
  const r = target.getBoundingClientRect(), f = card.getBoundingClientRect();
  await card.animate([{ transform: 'none', opacity: 1 },
    { transform: `translate(${r.left + r.width / 2 - (f.left + f.width / 2)}px, ${r.top + r.height / 2 - (f.top + f.height / 2)}px) scale(${r.width / f.width})`, opacity: 0.2 }],
    { duration: 260, easing: 'cubic-bezier(.6,0,.8,.4)', fill: 'forwards' }).finished;
  card.remove();
  return true;
}

async function summonFx(ev, st) {
  let node = nodeOf(ev.uid);
  if (!node) {
    const def = CARDS[ev.cardId];
    const ent = ui.game.getEntity(ev.uid) ?? {
      uid: ev.uid, kind: 'minion', cardId: ev.cardId, owner: ev.player, attack: def.attack, health: def.health,
      maxHealth: def.health, keywords: { ...def.keywords }, spellDamage: def.spellDamage || 0, sleeping: true,
    };
    const lane = $(ev.player === HUMAN ? '.you-lane' : '.foe-lane');
    const units = [...lane.querySelectorAll(':scope > .unit[data-uid]:not([data-gone])')];
    const before = new Map(units.map(n => [n.dataset.uid, n.getBoundingClientRect().left]));
    const ref = units[ev.index ?? units.length];
    if (ref) ref.insertAdjacentHTML('beforebegin', minionHTML(ent, new Set()));
    else lane.insertAdjacentHTML('beforeend', minionHTML(ent, new Set()));
    slideFrom(before);
    node = nodeOf(ev.uid);
  }
  const cost = CARDS[ev.cardId].cost;
  const color = classColor(ev.cardId, '#e8c46a');
  if (st.flying) {
    node.style.opacity = '0';
    await landFlyingCard(st, node);
    node.style.opacity = '';
    node.animate([{ transform: 'translateY(-46px) scale(1.5)', opacity: 0.3 }, { transform: 'none', opacity: 1, offset: 0.7 },
      { transform: 'scale(1.08, .92)', offset: 0.85 }, { transform: 'none' }], { duration: 340, easing: 'ease-in' });
    await sleep(230);
    const r = node.getBoundingClientRect();
    sfx.summon(cost);
    fx.burst({ x: r.left + r.width / 2, y: r.bottom - 4 }, { color: ['#d8c4a0', '#8f7b5a', '#fff2d0'], count: 14 + cost * 3,
      speed: 2.5 + cost * 0.45, gravity: 0.04, life: 600, angle: -Math.PI / 2, spread: Math.PI * 1.6 });
    fx.ring(node, { color, maxR: 45 + cost * 9, width: 4 });
    if (cost >= 6) fx.shake(tableEl(), cost);
  } else {
    node.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.18)', opacity: 1, offset: 0.7 }, { transform: 'none' }],
      { duration: 320, easing: 'ease-out' });
    fx.sparkle(node, { color: ['#ffe27a', '#ffffff'], count: 12 });
    sfx.summon(Math.min(cost, 2));
    await sleep(200);
  }
}

async function equipFx(ev, st) {
  const hero = nodeOf(ev.uid);
  if (!hero) return;
  await landFlyingCard(st, hero);
  sfx.equip();
  fx.burst(hero, { color: ['#e6ecf3', '#9fb0c3', '#ffffff'], count: 24, speed: 5, shape: 'shard', gravity: 0.2 });
  fx.ring(hero, { color: '#d6dde6', maxR: 80, width: 5 });
  await sleep(200);
}

async function heroPowerFx(ev) {
  const btn = $(`.hero-row.${ev.player === HUMAN ? 'you' : 'foe'} .hero-power`);
  const color = CLASSES[ui.game.players[ev.player].heroClass].color;
  sfx.heroPower();
  btn?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(8deg)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  fx.ring(btn, { color, maxR: 70, width: 6 });
  fx.burst(btn, { color: [color, '#ffffff'], count: 16, speed: 3.5, gravity: 0 });
  await sleep(ev.player === AI ? 450 : 220);
}

async function attackFx(ev, st, rest) {
  const a = nodeOf(ev.attacker), t = nodeOf(ev.target);
  if (!a || !t) return;
  if (st.attackReturn) await st.attackReturn;
  const ac = fx.centerOf(a), tc = fx.centerOf(t);
  const dx = tc.x - ac.x, dy = tc.y - ac.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  const stopX = dx - ux * 28, stopY = dy - uy * 28;
  const hit = rest.find(e => (e.type === 'damage' || e.type === 'shield') && e.uid === ev.target && e.combat);
  const amount = hit?.type === 'damage' ? hit.amount : 1;

  a.style.zIndex = '30';
  sfx.swing();
  await a.animate([
    { transform: 'none' },
    { transform: `translate(${-ux * 16}px, ${-uy * 16}px) scale(1.14) rotate(${ux >= 0 ? -7 : 7}deg)`, offset: 0.45 },
    { transform: `translate(${stopX}px, ${stopY}px) scale(1.12)` },
  ], { duration: 430, easing: 'cubic-bezier(.55,0,.85,.35)', fill: 'forwards' }).finished;

  const p = { x: ac.x + stopX + ux * 22, y: ac.y + stopY + uy * 22 };
  fx.burst(p, { color: ['#fff3c4', '#ffb347', '#ff6a3c'], count: 20 + amount * 5, speed: 5 + amount * 0.8, gravity: 0.08 });
  fx.ring(p, { color: '#ffd27a', maxR: 40 + amount * 8, width: 5 });
  sfx.impact(amount);
  fx.shake(tableEl(), Math.min(14, 2 + amount * 1.4));
  t.animate([{ transform: `translate(${ux * 14}px, ${uy * 14}px)` }, { transform: 'none' }], { duration: 280, easing: 'ease-out' });

  st.attackReturn = a.animate([{ transform: `translate(${stopX}px, ${stopY}px) scale(1.12)` }, { transform: 'none' }],
    { duration: 300, delay: 140, easing: 'ease-out', fill: 'forwards' }).finished.then(() => { a.style.zIndex = ''; });
}

function armorFx(ev) {
  const node = nodeOf(ev.uid);
  floatText(ev.uid, `+${ev.amount} 🛡`, 'armor');
  fx.burst(node, { color: ['#e6ecf3', '#9fb0c3'], count: 18, speed: 4, shape: 'shard', gravity: 0.15 });
  fx.ring(node, { color: '#c4cfdc', maxR: 75, width: 6 });
  sfx.armor();
}

async function deathFx(ev) {
  const node = nodeOf(ev.uid);
  if (!node) return;
  node.dataset.gone = '1';
  await sleep(140);
  const color = classColor(node.dataset.card, '#c9b9a0');
  sfx.death();
  fx.burst(node, { color: [color, '#ffffff', '#6b5a44'], count: 34, speed: 6.5, shape: 'shard', gravity: 0.22, life: 850 });
  fx.burst(node, { color: '#6b5a44', count: 12, speed: 1.5, gravity: -0.03, life: 900 });
  node.animate([{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
    { transform: 'scale(1.15)', opacity: 1, filter: 'brightness(2.5)', offset: 0.25 },
    { transform: 'scale(.4) rotate(-12deg)', opacity: 0, filter: 'brightness(1)' }],
    { duration: 460, easing: 'ease-in', fill: 'forwards' });
}

function drawFx(ev) {
  if (ui.game.phase !== 'play') return;
  const mine = ev.player === HUMAN;
  const from = $(mine ? '.hero-row.you .deck-count' : '.hero-row.foe .deck-count');
  const to = $(mine ? '.hand' : '.foe-hand');
  if (!from || !to) return;
  const a = fx.centerOf(from), b = fx.centerOf(to);
  const back = document.createElement('div');
  back.className = 'fly-back';
  back.style.left = `${a.x - 17}px`;
  back.style.top = `${a.y - 24}px`;
  document.body.appendChild(back);
  sfx.draw();
  back.animate([{ transform: 'none', opacity: 1 },
    { transform: `translate(${(b.x - a.x) / 2}px, ${(b.y - a.y) / 2 - 40}px) rotate(-12deg) scale(1.3)`, opacity: 1 },
    { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(.9)`, opacity: 0 }],
    { duration: 520, easing: 'ease-in-out' }).finished.then(() => back.remove());
}

async function gameOverFx() {
  const w = ui.game.winner;
  const losers = w === 'draw' ? [0, 1] : [1 - w];
  for (const pid of losers) {
    const hero = nodeOf(ui.game.players[pid].hero.uid);
    if (!hero) continue;
    const color = CLASSES[ui.game.players[pid].heroClass].color;
    hero.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(3) saturate(0)' }], { duration: 500, fill: 'forwards' });
    fx.shake(tableEl(), 18, 700);
    await sleep(450);
    sfx.explosion();
    fx.flash('#ffffff', 450, 0.5);
    fx.burst(hero, { color: [color, '#ffffff', '#ffd27a'], count: 90, speed: 11, shape: 'shard', gravity: 0.2, life: 1200 });
    fx.ring(hero, { color, maxR: 300, width: 14, life: 800 });
    hero.animate([{ opacity: 1, transform: 'scale(1.1)' }, { opacity: 0, transform: 'scale(.3)' }], { duration: 500, fill: 'forwards' });
  }
  await sleep(900);
  if (w === HUMAN) {
    sfx.victory();
    for (let k = 0; k < 3; k++) {
      setTimeout(() => fx.burst({ x: innerWidth * (0.25 + k * 0.25), y: innerHeight * 0.3 },
        { color: ['#ffd27a', '#7cc0ff', '#8dff8d', '#ff8a7a'], count: 60, speed: 9, shape: 'shard', gravity: 0.15, life: 1500 }), k * 200);
    }
  } else {
    sfx.defeat();
  }
  showResult();
}

function showResult() {
  const w = ui.game.winner;
  $('#result-title').textContent = w === 'draw' ? 'Draw' : w === HUMAN ? 'Victory!' : 'Defeat';
  $('#overlay').classList.remove('hidden');
}

// ------------------------------------------------------------------ input

async function act(fn, { handUid, fromRect: dropRect } = {}) {
  ui.selection = null;
  setBusy(true);
  const handCard = handUid != null ? document.querySelector(`[data-hand="${handUid}"]`) : null;
  const fromRect = dropRect ?? handCard?.querySelector('.card').getBoundingClientRect() ?? null;
  document.querySelectorAll('#table .slot, #table .unit.ghost').forEach(n => n.remove());
  const ok = fn();
  if (!ok && ui.game.lastError) toast(ui.game.lastError);
  else if (handCard) handCard.style.visibility = 'hidden';
  await flushEvents({ fromRect });
  setBusy(false);
  render();
}

$('#table').addEventListener('click', e => {
  const g = ui.game;
  if (!g || ui.busy || g.current !== HUMAN || g.winner !== null || ui.suppressClick) return;

  if (e.target.closest('#end-turn')) { sfx.click(); endPlayerTurn(); return; }

  const handEl = e.target.closest('[data-hand]');
  const entEl = e.target.closest('[data-uid]');
  const hpEl = e.target.closest('[data-action="hero-power"]');
  const sel = ui.selection;

  // Resolve a pending targeting selection.
  if (sel && entEl) {
    const uid = Number(entEl.dataset.uid);
    if (targetSet().has(uid)) {
      if (sel.type === 'hand') return act(() => g.playCard(sel.uid, { target: uid, position: sel.position }), { handUid: sel.uid });
      if (sel.type === 'heroPower') return act(() => g.useHeroPower(uid));
      if (sel.type === 'attacker') return act(() => g.attack(sel.uid, uid));
    }
  }

  // Placing a minion: a click on your side of the board picks the slot.
  if (sel?.type === 'place' && !handEl && overYourLane(e.clientX, e.clientY)) {
    return choosePlacement(sel.uid, insertionIndex(e.clientX));
  }

  if (handEl) {
    const uid = Number(handEl.dataset.hand);
    if ((sel?.type === 'hand' || sel?.type === 'place') && sel.uid === uid) { ui.selection = null; return render(); }
    const blocker = g.playBlocker(HUMAN, uid);
    if (blocker) { toast(blocker); return; }
    if (CARDS[handEl.dataset.card].type === 'minion') {
      if (!g.players[HUMAN].board.length) return choosePlacement(uid, 0);
      sfx.click();
      ui.selection = { type: 'place', uid };
      return render();
    }
    if (g.cardTargets(HUMAN, uid).length) { sfx.click(); ui.selection = { type: 'hand', uid }; return render(); }
    return act(() => g.playCard(uid), { handUid: uid });
  }

  if (hpEl) {
    if (sel?.type === 'heroPower') { ui.selection = null; return render(); }
    if (!g.canUseHeroPower(HUMAN)) {
      toast(g.players[HUMAN].heroPowerUsed ? 'Hero power already used' : 'Not enough mana');
      return;
    }
    if (g.heroPower(HUMAN).target) { sfx.click(); ui.selection = { type: 'heroPower' }; return render(); }
    return act(() => g.useHeroPower());
  }

  if (entEl) {
    const uid = Number(entEl.dataset.uid);
    const ent = g.getEntity(uid);
    if (ent?.owner === HUMAN) {
      if (sel?.uid === uid) { ui.selection = null; return render(); }
      if (g.canAttack(uid)) { sfx.click(); ui.selection = { type: 'attacker', uid }; return render(); }
      if (ent.kind === 'minion') {
        toast(ent.frozen ? 'Frozen!' : ent.sleeping && ent.attacksThisTurn === 0 ? 'Needs a turn to get ready' : ent.attack <= 0 ? 'No attack' : 'Already attacked');
      }
      return;
    }
  }

  if (sel) { ui.selection = null; render(); }
});

// Drag a minion from your hand onto the board to place it.
let drag = null;

$('#table').addEventListener('pointerdown', e => {
  const g = ui.game;
  const handEl = e.target.closest('[data-hand]');
  if (!handEl || !g || ui.busy || g.current !== HUMAN || g.winner !== null || e.button > 0) return;
  drag = { uid: Number(handEl.dataset.hand), cardId: handEl.dataset.card, x: e.clientX, y: e.clientY, ghost: null };
});

addEventListener('pointermove', e => {
  if (!drag) {
    if (ui.selection?.type === 'place') highlightSlot(e.clientX, e.clientY);
    return;
  }
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    if (CARDS[drag.cardId].type !== 'minion') { drag = null; return; } // spells stay click-to-cast
    const blocker = ui.game.playBlocker(HUMAN, drag.uid);
    if (blocker) { toast(blocker); drag = null; return; }
    ui.selection = { type: 'place', uid: drag.uid };
    render();
    document.querySelector(`[data-hand="${drag.uid}"]`)?.style.setProperty('visibility', 'hidden');
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-card';
    drag.ghost.innerHTML = cardHTML(drag.cardId);
    document.body.appendChild(drag.ghost);
    sfx.click();
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  drag.ghost.classList.toggle('over-board', overYourLane(e.clientX, e.clientY));
  highlightSlot(e.clientX, e.clientY);
});

function endDrag(e, drop) {
  const d = drag;
  drag = null;
  if (!d?.ghost) return; // never moved: let the normal click handler run
  const rect = d.ghost.querySelector('.card').getBoundingClientRect();
  d.ghost.remove();
  ui.suppressClick = true;
  setTimeout(() => { ui.suppressClick = false; }, 0);
  if (drop && overYourLane(e.clientX, e.clientY)) choosePlacement(d.uid, insertionIndex(e.clientX), rect);
  else { ui.selection = null; render(); }
}
addEventListener('pointerup', e => endDrag(e, true));
addEventListener('pointercancel', e => endDrag(e, false));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.selection) { ui.selection = null; render(); }
});
document.addEventListener('contextmenu', e => {
  if (ui.selection) { e.preventDefault(); ui.selection = null; render(); }
});

// Hover previews
const tip = $('#tooltip');
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-card], [data-hp]');
  if (!el || el.closest('.hand-card') || el.closest('.mulligan-slot')) { tip.className = 'hidden'; return; }
  let html;
  if (el.dataset.hp) {
    const hp = CLASSES[el.dataset.hp].heroPower;
    html = `<div class="power-tip"><b>${hp.name}</b> (${hp.cost} mana)<br>${esc(hp.text)}</div>`;
  } else {
    const card = CARDS[el.dataset.card];
    const kws = [...Object.keys(card.keywords).filter(k => card.keywords[k]),
      ...(card.spellDamage ? ['spellDamage'] : []), ...(card.battlecry ? ['battlecry'] : []),
      ...(card.deathrattle ? ['deathrattle'] : []), ...(card.combo ? ['combo'] : []),
      ...(/adjacent/i.test(card.text ?? '') ? ['adjacent'] : [])];
    html = cardHTML(card.id) + kws.map(k => `<div class="kw-help"><b>${KEYWORD_LABELS[k] ?? k[0].toUpperCase() + k.slice(1).replace('Damage', ' Damage')}</b>: ${KEYWORD_HELP[k]}</div>`).join('');
  }
  tip.innerHTML = html;
  const r = el.getBoundingClientRect();
  const right = r.right + 240 < window.innerWidth;
  tip.style.left = `${right ? r.right + 12 : Math.max(8, r.left - 232)}px`;
  tip.style.top = `${Math.min(window.innerHeight - 340, Math.max(8, r.top - 40))}px`;
  tip.className = 'hover';
});

// ------------------------------------------------------------------ turns

async function endPlayerTurn() {
  ui.selection = null;
  setBusy(true);
  ui.game.endTurn();
  await flushEvents();
  if (ui.game.winner === null) await runAiTurn();
}

function yourTurn() {
  sfx.yourTurn();
  banner('Your turn');
}

async function runAiTurn() {
  const g = ui.game;
  setBusy(true);
  render();
  await banner("Opponent's turn");
  await flushEvents();
  for (let i = 0; i < 60 && g.winner === null; i++) {
    const action = nextAction(g, AI);
    if (!action) break;
    if (action.type === 'attack') {
      document.querySelector(`[data-uid="${action.uid}"]`)?.classList.add('selected');
      await sleep(350);
    }
    if (!applyAction(g, action)) break;
    await flushEvents();
    await sleep(350);
  }
  if (g.winner === null) {
    g.endTurn();
    await flushEvents();
  }
  setBusy(false);
  render();
  if (g.winner === null) yourTurn();
}

function renderSoundButton() {
  const b = $('#sound-btn');
  b.textContent = isMuted() ? '🔇' : '🔊';
  b.setAttribute('aria-pressed', String(isMuted()));
  b.title = isMuted() ? 'Sound off' : 'Sound on';
}
$('#sound-btn').addEventListener('click', () => {
  setMuted(!isMuted());
  renderSoundButton();
  sfx.click();
});
// Browsers only start audio after a user gesture.
document.addEventListener('pointerdown', unlock);
document.addEventListener('keydown', unlock);

renderSoundButton();
renderMenu();
