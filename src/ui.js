// Browser UI for Riftclash. The human is always player 0; the AI is player 1.

import { Game, MAX_MANA } from './engine.js';
import { CARDS, CLASSES, HEROES, KEYWORD_HELP, defaultHero } from './cards.js';
import { nextAction, applyAction, mulliganChoice } from './ai.js';
import * as fx from './fx.js';
import { sfx, unlock, isMuted, setMuted } from './sfx.js';
import { artHTML, hasSprite, spriteSVG } from './pixelart.js';
import { cardHTML, keywordHelpHTML, esc } from './cardview.js';
import { mountLibrary } from './library.js';
import { MODES, availableModes, isModeUnlocked, unlockProgress, bossChoices } from './modes.js';
import { mountQuests, questNoticeHTML, unseenCompleted } from './questscreen.js';
import { recordGame, questStatus, loadProgress } from './progress.js';
import { visibleClasses, sequenceMatcher, SECRET_CODE, togglePlaytest } from './unlocks.js';
import { lockedCards, rewardCards, unseenRewards, markRewardsSeen } from './rewards.js';
import { createQuestBoard, questBoardWidth } from './questboard.js';
import { mountDeckBuilder } from './deckbuilder.js';
import { STANDARD_DECK, loadDecks, isPlayable, loadDeckChoice, saveDeckChoice } from './decks.js';
import { playTrack, playStinger, stopMusic, startMusic, isMusicOn, setMusicOn, beatClock } from './music.js';
import { songSeconds } from './songs.js';
import { createSplash, splashWidth, runeRingSVG, ticksSVG, sigilPoints, hexagramPath } from './splash.js';
import { mountBackdrop, newBackdrop, setBackdrop, showBackdrop, backdropId } from './backdrop.js';
import { BACKGROUNDS } from './backgrounds.js';
import { mountMenuScene } from './menuscene.js';
import { mountScene } from './sceneview.js';
import { createArchive, archiveWidth } from './archive.js';
import { createForge, forgeWidth, MUSIC_OFFSET } from './forge.js';
import './sprites/index.js';

const HUMAN = 0;
const AI = 1;
const $ = sel => document.querySelector(sel);
const sleep = fx.sleep;

/** While effects play, input is ignored; the body class lets CSS show it. */
function setBusy(value) {
  ui.busy = value;
  document.body.classList.toggle('busy', value);
}

const ui = {
  game: null,
  playerClass: null,
  aiClass: 'random',
  mode: 'standard',
  boss: null,       // the Riftkin hero id chosen in Challenge the Riftkin
  selection: null, // { type: 'hand' | 'attacker' | 'heroPower', uid? }
  busy: false,
  mulliganPicks: new Set(),
};

// ------------------------------------------------------------------ menu

/** A hero power's icon, or its name if it has no sprite. */
const powerArt = hp => (hasSprite(hp.sprite) ? spriteSVG(hp.sprite) : `<span class="hp-name">${esc(hp.name)}</span>`);

/** A hero's portrait (pixel art, or its emoji if no sprite exists). */
const heroArt = hero => artHTML({ sprite: hero.portrait, emoji: hero.emoji }, { title: hero.name });

/** The title screen: one tile per game mode. */
function renderTitle() {
  // Locked modes show too, but as a mystery: no name, no emblem, just what unlocks them and how far along the player is.
  $('#mode-grid').innerHTML = MODES.map(m => {
    if (isModeUnlocked(m)) return `
    <button class="mode-tile" data-mode="${m.id}" type="button">
      <span class="mode-icon">${hasSprite(m.icon) ? spriteSVG(m.icon) : ''}</span>
      <span class="mode-name">${esc(m.name)}</span>
      <span class="mode-text">${esc(m.text)}</span>
    </button>`;
    const { done, total } = unlockProgress(m);
    return `
    <div class="mode-tile locked" aria-disabled="true" aria-label="Locked mode. ${esc(m.unlock.hint)} ${done} of ${total} complete.">
      <span class="mode-icon mystery" aria-hidden="true">?</span>
      <span class="mode-name" aria-hidden="true"><span class="mode-lock">🔒</span>???</span>
      <span class="mode-text" aria-hidden="true">${esc(m.unlock.hint)}<span class="mode-unlock">${done} / ${total} complete</span></span>
    </div>`;
  }).join('');
}

$('#mode-grid').addEventListener('click', e => {
  const tile = e.target.closest('[data-mode]');
  if (!tile) return;
  const mode = availableModes().find(m => m.id === tile.dataset.mode);
  if (!mode) return;
  sfx.click();
  ui.mode = mode.id;
  $('#play-title').textContent = mode.name;
  renderClassSelect();
  showScreen(mode.screen);
});
$('#play-back').addEventListener('click', () => showScreen('menu'));
$('#bosses-back').addEventListener('click', () => showScreen('menu'));

/** A hero power as a line of text with its icon. */
const powerLine = hp => `<span class="class-power"><span class="class-power-icon">${powerArt(hp)}</span><span><b>${esc(hp.name)}</b> (${hp.cost}): ${esc(hp.text)}</span></span>`;

/** One tile per class the player can see; each shows the hero the player plays it with. */
function classTilesHTML(classes) {
  return classes.map(key => {
    const c = CLASSES[key], hero = defaultHero(key);
    return `
    <button class="class-tile${ui.playerClass === key ? ' chosen' : ''}" data-class="${key}" style="--cls:${c.color}" aria-pressed="${ui.playerClass === key}">
      <span class="class-portrait">${heroArt(hero)}</span>
      <span class="class-name">${c.name}</span>
      <span class="class-hero">${esc(hero.name)}</span>
      ${powerLine(hero.heroPower)}
    </button>`;
  }).join('');
}

/** Render both setup screens: the standard mode's and Challenge the Riftkin's. */
function renderClassSelect() {
  // Only classes the player can see (hidden ones stay out until unlocked).
  const classes = visibleClasses();
  if (ui.playerClass && !classes.includes(ui.playerClass)) ui.playerClass = null;
  if (ui.aiClass !== 'random' && !classes.includes(ui.aiClass)) ui.aiClass = 'random';
  $('#class-grid').innerHTML = classTilesHTML(classes);
  renderDeckSelect($('#deck-select'));
  $('#opponent-select').innerHTML = `<option value="random">Random</option>` +
    classes.map(k => `<option value="${k}"${ui.aiClass === k ? ' selected' : ''}>${CLASSES[k].name}</option>`).join('');
  $('#start-btn').disabled = !ui.playerClass;
  renderBossSelect(classes);
}

/** Challenge the Riftkin: pick a boss, then a class and deck to face it with. */
function renderBossSelect(classes) {
  const record = loadProgress().stats.byBoss;
  $('#boss-grid').innerHTML = bossChoices().map(b => {
    const r = record[b.id];
    const status = r?.wins ? `Defeated ${r.wins === 1 ? 'once' : `${r.wins} times`}` : r?.played ? 'Not yet defeated' : 'Not yet challenged';
    return `
    <button class="boss-tile${ui.boss === b.id ? ' chosen' : ''}${r?.wins ? ' beaten' : ''}" data-boss="${b.id}" type="button" style="--cls:${CLASSES[b.cls].color}" aria-pressed="${ui.boss === b.id}">
      <span class="boss-portrait">${heroArt(b)}</span>
      <span class="boss-name">${esc(b.name)}</span>
      <span class="boss-title">${esc(b.title)}</span>
      <span class="boss-lore">${esc(b.lore)}</span>
      ${powerLine(b.heroPower)}
      <span class="boss-record">${status}</span>
    </button>`;
  }).join('');
  $('#boss-class-grid').innerHTML = classTilesHTML(classes);
  renderDeckSelect($('#boss-deck-select'));
  const btn = $('#boss-start-btn');
  btn.disabled = !(ui.boss && ui.playerClass);
  btn.textContent = !ui.boss ? 'Choose a foe' : !ui.playerClass ? 'Choose a champion' : `Challenge ${HEROES[ui.boss].name}`;
}

/** The chosen class's decks: the standard deck plus its custom decks (unfinished ones can't be picked). */
function renderDeckSelect(sel) {
  if (!ui.playerClass) {
    sel.innerHTML = '<option>Choose a class first</option>';
    sel.disabled = true;
    return;
  }
  const decks = loadDecks().filter(d => d.cls === ui.playerClass).sort((a, b) => a.name.localeCompare(b.name));
  const choice = loadDeckChoice()[ui.playerClass];
  const locked = lockedCards();
  const chosen = decks.find(d => d.id === choice && isPlayable(d, locked))?.id ?? STANDARD_DECK;
  sel.innerHTML = `<option value="${STANDARD_DECK}">Standard deck</option>` + decks.map(d => {
    const ok = isPlayable(d, locked);
    return `<option value="${d.id}"${ok ? '' : ' disabled'}${d.id === chosen ? ' selected' : ''}>${esc(d.name)}${ok ? '' : ` (${d.cards.length}/30, unfinished)`}</option>`;
  }).join('');
  sel.disabled = false;
}

/** Card ids of the player's chosen custom deck, or undefined for the standard deck. */
function chosenDeck() {
  const id = loadDeckChoice()[ui.playerClass];
  const deck = loadDecks().find(d => d.id === id && d.cls === ui.playerClass);
  return deck && isPlayable(deck, lockedCards()) ? deck.cards : undefined;
}

for (const sel of ['#deck-select', '#boss-deck-select']) {
  $(sel).addEventListener('change', e => saveDeckChoice(ui.playerClass, e.target.value));
}

for (const grid of ['#class-grid', '#boss-class-grid']) {
  $(grid).addEventListener('click', e => {
    const tile = e.target.closest('[data-class]');
    if (!tile) return;
    ui.playerClass = tile.dataset.class;
    renderClassSelect();
  });
}
$('#boss-grid').addEventListener('click', e => {
  const tile = e.target.closest('[data-boss]');
  if (!tile) return;
  sfx.click();
  ui.boss = tile.dataset.boss;
  renderClassSelect();
});
$('#boss-start-btn').addEventListener('click', startGame);
$('#opponent-select').addEventListener('change', e => { ui.aiClass = e.target.value; });
$('#start-btn').addEventListener('click', startGame);

let openLibrary = null;
$('#library-btn').addEventListener('click', () => {
  openLibrary ??= mountLibrary($('#library'), { onBack: () => showScreen('menu') });
  showScreen('library');
  openLibrary();
});
// The secret play-test code, typed on the main menu, unlocks the hidden
// classes (and locks them again). See unlocks.js.
const secret = sequenceMatcher(SECRET_CODE);
document.addEventListener('keydown', e => {
  const onMenu = ['#menu', '#play', '#bosses'].some(s => !$(s).classList.contains('hidden'));
  if (!onMenu || e.target.closest?.('input, select, textarea')) return;
  if (!secret(e.key)) return;
  const on = togglePlaytest();
  renderTitle();
  renderClassSelect();
  // Locking again closes Challenge the Riftkin, unless the player has earned it through the trials.
  if (!on && !$('#bosses').classList.contains('hidden') && !availableModes().some(m => m.id === 'riftkin')) showScreen('menu');
  if (on) {
    sfx.questComplete();
    fx.flash('#c58cff', 600, 0.35);
    toastMsg('The Rift answers. Everything is unlocked for play-testing.', 3000);
  } else {
    sfx.click();
    toastMsg('The Rift falls silent. Play-test unlocks removed.', 3000);
  }
});

let openQuests = null;
$('#quests-btn').addEventListener('click', () => {
  openQuests ??= mountQuests($('#quests'), { onBack: () => { renderQuestBadge(); showScreen('menu'); } });
  showScreen('quests');
  openQuests();
});

/** Reward cards as a row of small card faces (each wrapped, as a card's padding is relative to its parent's width). */
const rewardCardsHTML = ids => `<div class="reward-cards">${ids.map(id => `<div class="reward-card">${cardHTML(id)}</div>`).join('')}</div>`;

/**
 * Tell the player about quest rewards they haven't seen yet, on the title
 * screen: rewards from quests completed before the quest had one (a game that
 * completes a quest shows its reward on the result screen instead).
 */
function showRewardNotice() {
  const box = $('#reward-notice');
  if (document.body.classList.contains('on-splash') || !box.classList.contains('hidden')) return;
  const rewards = unseenRewards();
  if (!rewards.length) return;
  const ids = rewards.flatMap(r => r.cards);
  const quests = rewards.map(r => `<b>${esc(r.quest.title)}</b>`).join(', ');
  $('#reward-text').innerHTML = `For completing ${quests}, ${ids.length === 1 ? 'a new card joins' : `${ids.length} new cards join`} your collection. Find them in the Library and the Deck Builder.`;
  $('#reward-list').innerHTML = rewardCardsHTML(ids);
  box.classList.remove('hidden');
  sfx.questComplete();
  fx.flash('#ffd27a', 500, 0.25);
  const ok = $('#reward-ok');
  ok.focus({ preventScroll: true });
  ok.onclick = () => { sfx.click(); markRewardsSeen(ids); box.classList.add('hidden'); };
}

/** The menu's Quests button shows how many quests were completed since the player last looked. */
function renderQuestBadge() {
  const n = unseenCompleted().length;
  const b = $('#quests-badge');
  b.textContent = n ? `${n} new` : '';
  b.classList.toggle('hidden', !n);
}

let openDecks = null;
$('#decks-btn').addEventListener('click', () => {
  openDecks ??= mountDeckBuilder($('#decks'), {
    onBack: () => showScreen('menu'),
    onUse: (cls, deckId) => {
      ui.mode = 'standard';
      $('#play-title').textContent = availableModes().find(m => m.id === 'standard').name;
      ui.playerClass = cls;
      saveDeckChoice(cls, deckId);
      renderClassSelect();
      showScreen('play');
    },
    notify: toast,
    sounds: { add: () => sfx.draw(), remove: () => sfx.click() },
  });
  showScreen('decks');
  openDecks();
});
$('#again-btn').addEventListener('click', () => { ui.resultRun = null; startGame(); });
$('#menu-btn').addEventListener('click', () => {
  ui.resultRun = null;
  $('#overlay').classList.add('hidden');
  renderClassSelect();
  showScreen(ui.mode === 'riftkin' ? 'bosses' : 'play');
});

/** The music for the match in progress: the battle board's own track (the standard battle theme if it has none). */
const battleTrack = () => BACKGROUNDS[backdropId()]?.music ?? 'battle';

let menuScene = null, archive = null, forge = null, questBoard = null;

function showScreen(id) {
  for (const s of ['menu', 'play', 'bosses', 'library', 'decks', 'quests', 'mulligan', 'table']) $('#' + s).classList.toggle('hidden', s !== id);
  if (id === 'menu') { renderTitle(); showRewardNotice(); }   // a game may have unlocked a mode or earned a reward
  document.body.classList.toggle('in-game', id === 'table');
  showBackdrop(id === 'mulligan' || id === 'table');
  // The title and the modes' setup screens share the battle scene and the menu theme.
  const titleScreens = id === 'menu' || id === 'play' || id === 'bosses';
  menuScene?.show(titleScreens);
  archive?.show(id === 'library');
  forge?.show(id === 'decks');
  questBoard?.show(id === 'quests');
  document.body.classList.toggle('on-board', id === 'quests');
  document.body.classList.toggle('in-forge', id === 'decks');
  document.body.classList.toggle('in-archive', id === 'library');
  document.body.classList.toggle('on-menu', titleScreens);
  playTrack({ menu: 'menu', play: 'menu', bosses: 'menu', library: 'library', decks: 'forge', quests: 'quests' }[id] ?? battleTrack());
}

// ------------------------------------------------------------------ setup

/** The AI's hero: the chosen boss in Challenge the Riftkin, otherwise the opponent class's default hero. */
function opponentHero() {
  if (ui.mode === 'riftkin') return ui.boss;
  const keys = visibleClasses();
  const aiClass = ui.aiClass === 'random' ? keys[Math.floor(Math.random() * keys.length)] : ui.aiClass;
  return CLASSES[aiClass].defaultHero;
}

function startGame() {
  // The player plays their class's default hero; the class decides the cards.
  const heroes = [CLASSES[ui.playerClass].defaultHero, opponentHero()];
  // Built decks (the standard deck and the AI's) leave out reward cards the player hasn't earned.
  ui.game = new Game({ heroes, decks: [chosenDeck()], locked: lockedCards(), seed: Date.now() });
  ui.selection = null;
  setBusy(false);
  ui.mulliganPicks = new Set();
  // Bosses fight on their own board; other matches get a random one.
  const foe = HEROES[heroes[1]];
  const place = foe.board ? setBackdrop(foe.board) : newBackdrop();
  $('#battlefield').textContent = `Battlefield: ${place}`;
  $('#log').innerHTML = foe.boss
    ? `<li>${esc(foe.name)}, ${esc(foe.title)}, awaits you at ${esc(place)}.</li>`
    : `<li>The battle is joined at ${esc(place)}.</li>`;
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
  const g = ui.game;
  const def = g.minionText(m);
  const myTurn = g.current === HUMAN && !ui.busy;
  const cls = ['unit'];
  if (m.keywords.taunt) cls.push('taunt');
  if (m.keywords.divineShield) cls.push('shielded');
  if (m.keywords.stealth) cls.push('stealthed');
  if (m.frozen) cls.push('frozen');
  if (m.silenced) cls.push('silenced');
  if (m.owner === HUMAN && myTurn && g.canAttack(m.uid)) cls.push('ready');
  if (ui.selection?.uid === m.uid && ui.selection.type === 'attacker') cls.push('selected');
  if (targets.has(m.uid)) cls.push('targetable');
  const hpCls = m.health < m.maxHealth ? 'damaged' : m.maxHealth > def.health ? 'buffed' : '';
  const atkCls = m.attack > def.attack ? 'buffed' : m.attack < def.attack ? 'damaged' : '';
  const icons = [
    m.silenced ? '<span title="Silenced">🔇</span>' : '',
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
      <div class="unit-art">${artHTML(def)}</div>
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
  const hero = HEROES[p.heroId];
  const h = p.hero;
  const hp = hero.heroPower;
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
      <span class="weapon-art">${artHTML(CARDS[p.weapon.cardId])}</span>
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
        <div class="portrait">${heroArt(hero)}</div>
        <div class="hero-name">${esc(hero.name)}</div>
        ${h.attack > 0 ? `<span class="stat atk">${h.attack}</span>` : ''}
        <span class="stat hp ${h.health < h.maxHealth ? 'damaged' : ''}">${h.health}</span>
        ${h.armor > 0 ? `<span class="stat armor">${h.armor}</span>` : ''}
      </div>
      <button class="hero-power${p.heroPowerUsed ? ' used' : ''}${hpUsable ? ' usable' : ''}${ui.selection?.type === 'heroPower' && isHuman ? ' selected' : ''}"
        ${isHuman ? 'data-action="hero-power"' : ''} data-hp="${p.heroId}" style="--cls:${c.color}" ${isHuman ? '' : 'tabindex="-1"'}
        aria-label="${esc(`${hp.name} (${hp.cost} mana): ${hp.text}`)}">
        <span class="hp-art">${powerArt(hp)}</span>
        <span class="cost">${hp.cost}</span>
        <span class="hp-caption">${esc(hp.name)}</span>
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
    <div class="unit-art">${artHTML(def)}</div>
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
  toastMsg(msg);
}

/** Show a short message without the error sound. */
function toastMsg(msg, ms = 1600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), ms);
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

const EFFECT_EVENTS = new Set(['damage', 'heal', 'freeze', 'buff', 'shield', 'destroy', 'bounce', 'silence']);
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
    case 'silence': return '#d9d3f2';
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
    case 'silence':
      floatText(ev.uid, 'Silenced', 'silence');
      node?.classList.remove('taunt', 'shielded', 'stealthed', 'frozen');
      node?.classList.add('silenced');
      fx.ring(node, { color: '#d9d3f2', maxR: 70, width: 5, life: 700 });
      fx.sparkle(node, { color: ['#d9d3f2', '#8f88b0'], count: 12 });
      sfx.silence();
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
  // The battle music stops as the last hero falls; a short victory or defeat theme follows, then silence.
  stopMusic(1.2);
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
  const stinger = w === HUMAN ? HEROES[ui.game.players[AI].heroId].victoryMusic ?? 'victory' : 'defeat';
  playStinger(stinger);
  if (w === HUMAN) {
    for (let k = 0; k < 3; k++) {
      setTimeout(() => fx.burst({ x: innerWidth * (0.25 + k * 0.25), y: innerHeight * 0.3 },
        { color: ['#ffd27a', '#7cc0ff', '#8dff8d', '#ff8a7a'], count: 60, speed: 9, shape: 'shard', gravity: 0.15, life: 1500 }), k * 200);
    }
  }
  const before = loadProgress();
  const completed = recordFinishedGame();
  showResult(completed, before, isMusicOn() ? songSeconds(stinger) : 1.5);
}

/** Add the finished game to the player's stats (once per game) and return any quests it completed. */
function recordFinishedGame() {
  const g = ui.game;
  if (g.recorded) return [];
  g.recorded = true;
  const result = g.winner === 'draw' ? 'draw' : g.winner === HUMAN ? 'win' : 'loss';
  const foe = HEROES[g.players[AI].heroId];
  return recordGame({ cls: g.players[HUMAN].heroClass, result, boss: foe.boss ? g.players[AI].heroId : undefined }).completed;
}

/**
 * The end of a battle, in two steps. First the result on its own (Victory!,
 * Defeat or Draw) while its theme plays; a Continue button appears as the
 * theme ends. Then the quest progress, with bars filling and their own
 * jingles, and finally the Rematch / Change class choices.
 * `beforeProgress` is the player's progress from before this game was recorded.
 */
function showResult(completed, beforeProgress, themeSeconds) {
  const w = ui.game.winner;
  const run = ui.resultRun = {};   // a newer result (or a rematch) cancels this one
  const progress = loadProgress();
  const just = new Set(completed.map(q => q.id));
  const before = questStatus(beforeProgress);
  const was = Object.fromEntries(before.map(q => [q.id, q.value]));
  // Quests worth showing: those this game moved forward or completed.
  const shown = questStatus(progress).filter(q => just.has(q.id) || (!q.done && q.value > (was[q.id] ?? 0)));
  // Modes this game unlocked (by completing their last quest).
  const unlocked = MODES.filter(m => !isModeUnlocked(m, undefined, beforeProgress) && isModeUnlocked(m, undefined, progress));
  const foe = HEROES[ui.game.players[AI].heroId];
  const s = progress.stats;
  $('#result-title').textContent = w === 'draw' ? 'Draw' : w === HUMAN ? 'Victory!' : 'Defeat';
  $('#result-banner').innerHTML = (!foe.boss || w === 'draw' ? '' : `<p class="result-boss">${esc(foe.name)} ${w === HUMAN ? 'is defeated.' : 'stands victorious.'}</p>`)
    + `<p class="result-record">Record: ${s.wins} W · ${s.losses} L${s.draws ? ` · ${s.draws} D` : ''}</p>`;
  $('#result-quests').innerHTML = '';
  $('#menu-btn').textContent = ui.mode === 'riftkin' ? 'Choose another foe' : 'Change class';
  setResultButtons('none');
  $('#overlay').classList.remove('hidden');
  renderQuestBadge();
  // Let the theme play out; then offer the quest progress (or go straight to the choices if there's none to show).
  setTimeout(() => {
    if (ui.resultRun !== run) return;
    setResultButtons(shown.length ? 'continue' : 'choices');
  }, Math.max(1, themeSeconds - 0.4) * 1000);
  $('#continue-btn').onclick = () => { sfx.click(); showQuestProgress(run, shown, before, just, unlocked); };
}

/** Which buttons the result overlay offers: none yet, Continue, or the Rematch / Change class choices. */
function setResultButtons(which) {
  $('#continue-btn').classList.toggle('hidden', which !== 'continue');
  $('#again-btn').classList.toggle('hidden', which !== 'choices');
  $('#menu-btn').classList.toggle('hidden', which !== 'choices');
  $('#overlay .overlay-actions').classList.toggle('appear', which !== 'none');
}

/** Step two: each quest's bar fills from where it was before the game, with a chime; completed quests get stamped. */
async function showQuestProgress(run, shown, before, just, unlocked) {
  setResultButtons('none');
  const was = Object.fromEntries(before.map(q => [q.id, q]));
  $('#result-title').textContent = 'Quest Progress';
  $('#result-banner').innerHTML = '';
  // Start every notice where it stood before this game.
  const start = q => ({ ...q, value: was[q.id]?.value ?? 0, done: false, completedAt: null });
  $('#result-quests').innerHTML = shown.map(q => `<div data-quest="${q.id}">${questNoticeHTML(start(q), { compact: true })}</div>`).join('');
  await sleep(500);
  for (const q of shown) {
    if (ui.resultRun !== run) return;
    const slot = $(`#result-quests [data-quest="${q.id}"]`);
    if (q.value > (was[q.id]?.value ?? 0)) {
      slot.querySelector('.q-bar span').style.width = `${Math.round(q.value / q.goal * 100)}%`;
      slot.querySelector('.q-count').textContent = `${q.value} / ${q.goal}`;
      sfx.questProgress();
      await sleep(750);
    }
    if (just.has(q.id)) {
      slot.innerHTML = questNoticeHTML(q, { compact: true, fresh: true });
      slot.insertAdjacentHTML('beforebegin', '<p class="result-quest-done">Quest complete!</p>');
      sfx.questComplete();
      await sleep(1200);
      // Its reward: the cards it unlocks.
      const cards = rewardCards(q);
      if (cards.length && ui.resultRun === run) {
        slot.insertAdjacentHTML('afterend', `
          <div class="result-reward">
            <small>${cards.length === 1 ? 'New card unlocked' : `${cards.length} new cards unlocked`}</small>
            ${rewardCardsHTML(cards)}
          </div>`);
        markRewardsSeen(cards);
        fx.flash('#ffd27a', 500, 0.25);
        await sleep(1600);
      }
    }
  }
  // Completing the last of a mode's quests unlocks it: the grand finale.
  for (const m of unlocked) {
    if (ui.resultRun !== run) return;
    $('#result-quests').insertAdjacentHTML('beforeend', `
      <div class="result-unlock">
        <span class="result-unlock-icon">${hasSprite(m.icon) ? spriteSVG(m.icon) : ''}</span>
        <span><small>New mode unlocked</small>${esc(m.name)}</span>
      </div>`);
    sfx.questComplete();
    fx.flash('#c58cff', 600, 0.3);
    await sleep(1400);
  }
  if (ui.resultRun !== run) return;
  setResultButtons('choices');
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
    const hp = HEROES[el.dataset.hp].heroPower;
    html = `<div class="power-tip"><span class="power-tip-icon">${powerArt(hp)}</span><span><b>${hp.name}</b> (${hp.cost} mana)<br>${esc(hp.text)}</span></div>`;
  } else {
    const card = CARDS[el.dataset.card];
    const silenced = el.classList.contains('silenced');
    html = cardHTML(card.id, { extraClass: silenced ? 'silenced' : '' }) +
      (silenced ? `<div class="kw-help"><b>Silenced</b>: ${KEYWORD_HELP.silence}</div>` : keywordHelpHTML(card));
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
function renderMusicButton() {
  const b = $('#music-btn');
  b.classList.toggle('off', !isMusicOn());
  b.setAttribute('aria-pressed', String(isMusicOn()));
  b.title = isMusicOn() ? 'Music on' : 'Music off';
}
$('#music-btn').addEventListener('click', () => {
  setMusicOn(!isMusicOn());
  renderMusicButton();
  sfx.click();
});

// ------------------------------------------------------------------ splash

/**
 * The splash screen over the title screen when the game opens: the title in
 * rings of runes, the class sigils around it, the Rift tearing open behind.
 * Any key (or a click or tap) dismisses it, and that same gesture is what
 * lets the browser start the music, so the menu theme rises as it clears.
 */
function mountSplash() {
  const splash = $('#splash');
  $('.splash-rings').innerHTML = `
    <g class="ring ring-outer">
      <circle class="line" r="452" pathLength="1"/>
      <circle class="line thin" r="408" pathLength="1"/>
      ${ticksSVG({ r0: 456, r1: 466, count: 120, major: 10 })}
      ${runeRingSVG({ r: 430, count: 36, size: 26 })}
    </g>
    <g class="ring ring-mid">
      <circle class="line violet" r="374" pathLength="1"/>
      <circle class="line violet dashed" r="334"/>
      ${runeRingSVG({ r: 354, count: 28, size: 20, offset: 5, className: 'rune violet' })}
    </g>
    <g class="ring ring-hex">
      <circle class="line faint" r="300" pathLength="1"/>
      <path class="hex" d="${hexagramPath(300)}" pathLength="1"/>
    </g>`;
  // The six classes every player knows (never a hidden one) as glowing sigils on the hexagram's points.
  const classes = Object.keys(CLASSES).filter(cls => !CLASSES[cls].hidden);
  $('.splash-sigils').innerHTML = sigilPoints(classes.length, 300).map((p, i) => {
    const hp = defaultHero(classes[i]).heroPower;
    return `<span class="splash-sigil" style="--cls:${CLASSES[classes[i]].color}; --i:${i}; left:${50 + p.x / 10}%; top:${50 + p.y / 10}%">${powerArt(hp)}</span>`;
  }).join('');
  const scene = mountScene($('#splash-bg'), { width: splashWidth, create: createSplash, fps: 30, stillAt: 3 });
  scene.show(true);
  document.body.classList.add('on-splash');
  splash.focus({ preventScroll: true });

  const IGNORED = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Tab', 'CapsLock']);
  let gone = false;
  const dismiss = e => {
    if (gone || (e.type === 'keydown' && IGNORED.has(e.key))) return;
    gone = true;
    e.preventDefault();
    e.stopPropagation();   // the dismissing key isn't also a key press on the title screen
    unlock(); startMusic();
    sfx.enter();
    fx.flash('#c58cff', 500, 0.25);
    splash.classList.add('leaving');
    document.body.classList.remove('on-splash');
    setTimeout(() => { splash.classList.add('hidden'); scene.show(false); showRewardNotice(); }, 1100);
  };
  splash.addEventListener('pointerdown', dismiss);
  addEventListener('keydown', dismiss, { capture: true });
}

// Browsers only start audio after a user gesture.
const onGesture = () => { unlock(); startMusic(); };
document.addEventListener('pointerdown', onGesture);
document.addEventListener('keydown', onGesture);

mountBackdrop($('#battle-bg'));
menuScene = mountMenuScene($('#menu-bg'));
archive = mountScene($('#library-bg'), { width: archiveWidth, create: createArchive });
// The forge's hammer and bellows keep time with the forge music while it plays.
const forgeTime = () => { const c = beatClock(); return c?.id === 'forge' ? c.beat * 60 / c.bpm + MUSIC_OFFSET : null; };
questBoard = mountScene($('#quests-bg'), { width: questBoardWidth, create: createQuestBoard, fps: 20, stillAt: 3 });
forge = mountScene($('#decks-bg'), { width: forgeWidth, create: createForge, fps: 24, stillAt: 2.95, time: forgeTime });
menuScene.show(true);
document.body.classList.add('on-menu');
mountSplash();
renderSoundButton();
renderMusicButton();
renderTitle();
renderClassSelect();
renderQuestBadge();
playTrack('menu');
