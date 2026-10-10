// Deck builder screen: a list of saved decks, and an editor for one deck.
// The rules and storage live in decks.js; this file is only the screen.
// Every change is saved straight away, so there is no "unsaved changes" state.
// Deck rows carry data-card, so the game's hover preview (ui.js) shows the full card.

import { CARDS, CLASSES, classArt, defaultHero } from './cards.js';
import { loadUnlocks, isVisible } from './unlocks.js';
import { lockedCards } from './rewards.js';
import { cardHTML, esc } from './cardview.js';
import { artHTML } from './pixelart.js';
import { filterCards, sortCards, CLASS_ORDER, COST_FILTERS } from './library.js';
import {
  DECK_SIZE, MAX_COPIES, MAX_NAME_LENGTH, addBlocker, addCard, removeCard, autoFill, countCards, deckProblems,
  manaCurve, newDeck, loadDecks, storeDeck, removeDeck, sortIds,
} from './decks.js';

const classColor = cls => CLASSES[cls]?.color ?? '#8a8f98';
const portrait = cls => `<span class="db-portrait" style="--cls:${classColor(cls)}">${artHTML(classArt(cls))}</span>`;
const CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

/**
 * Build the deck builder inside `root` (once) and return a function that shows it.
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {() => void} opts.onBack                       back to the main menu
 * @param {(cls: string, deckId: string) => void} opts.onUse  pick this deck on the menu
 * @param {(msg: string) => void} opts.notify             short message for a refused action
 * @param {{ add?: () => void, remove?: () => void }} [opts.sounds]
 */
export function mountDeckBuilder(root, { onBack, onUse, notify, sounds = {} }) {
  const state = {
    view: 'list',            // 'list' | 'pick-class' | 'edit'
    decks: [],
    deck: null,              // the deck being edited
    confirmDelete: null,     // id of the deck whose Delete is waiting for a second click
    confirmClear: false,
    tab: 'class',            // editor collection tab: 'class' | 'neutral'
    query: '', cost: null,
    showDeck: false,         // narrow screens: deck list expanded
    unlocks: {}, locked: new Set(),   // hidden classes unlocked; quest reward cards still locked
  };

  root.innerHTML = '<div class="lib-wrap db-wrap"></div>';
  const wrap = root.firstElementChild;

  function render() {
    root.dataset.view = state.view;
    if (state.view === 'list') renderList();
    else if (state.view === 'pick-class') renderPickClass();
    else renderEditor();
  }

  // ---------------------------------------------------------- deck list

  function renderList() {
    // Decks for a hidden class stay saved, but only show while it's unlocked.
    const decks = state.decks.filter(d => isVisible(d.cls, state.unlocks)).sort((a, b) =>
      CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) || b.updated - a.updated);
    wrap.innerHTML = `
      <header class="lib-head">
        <button class="btn lib-back" data-act="menu" type="button">← Menu</button>
        <h2>Deck Builder</h2>
        <span class="lib-count">${decks.length} deck${decks.length === 1 ? '' : 's'}</span>
      </header>
      <p class="db-intro">Build named decks of ${DECK_SIZE} cards for one class: its own cards plus neutrals, up to ${MAX_COPIES} copies of each. Decks are saved in this browser.</p>
      <div class="db-decks">
        <button class="db-tile db-new" data-act="new" type="button"><span class="db-new-plus">+</span>New deck</button>
        ${decks.map(deckTile).join('')}
      </div>`;
  }

  function deckTile(d) {
    const problems = deckProblems(d, state.locked);
    const confirming = state.confirmDelete === d.id;
    return `
      <div class="db-tile" style="--cls:${classColor(d.cls)}" data-id="${d.id}">
        <button class="db-tile-main" data-act="edit" type="button" aria-label="Edit ${esc(d.name)}">
          ${portrait(d.cls)}
          <span class="db-tile-text">
            <span class="db-tile-name">${esc(d.name)}</span>
            <span class="db-tile-meta">${CLASSES[d.cls].name} · ${d.cards.length}/${DECK_SIZE}</span>
            <span class="db-tile-status ${problems.length ? 'bad' : 'good'}">${problems.length ? 'Incomplete' : 'Ready to play'}</span>
          </span>
        </button>
        <div class="db-tile-actions">
          ${confirming
            ? `<span class="db-confirm-text">Delete this deck?</span>
               <button class="btn db-small danger" data-act="delete-yes" type="button">Delete</button>
               <button class="btn db-small" data-act="delete-no" type="button">Keep</button>`
            : `<button class="btn db-small primary" data-act="use" type="button" ${problems.length ? 'disabled title="Finish the deck first"' : ''}>Play</button>
               <button class="btn db-small" data-act="edit" type="button">Edit</button>
               <button class="btn db-small" data-act="delete" type="button">Delete</button>`}
        </div>
      </div>`;
  }

  // ---------------------------------------------------------- new deck: pick a class

  function renderPickClass() {
    wrap.innerHTML = `
      <header class="lib-head">
        <button class="btn lib-back" data-act="list" type="button">← Decks</button>
        <h2>New deck</h2>
      </header>
      <p class="db-intro">Choose a class. A deck can use that class's cards and neutral cards.</p>
      <div class="db-classes">
        ${Object.entries(CLASSES).filter(([key]) => isVisible(key, state.unlocks)).map(([key, c]) => `
          <button class="db-class" data-act="create" data-cls="${key}" type="button" style="--cls:${c.color}">
            ${portrait(key)}<span class="db-class-name">${c.name}</span><span class="db-class-hero">${esc(defaultHero(key).name)}</span>
          </button>`).join('')}
      </div>`;
  }

  // ---------------------------------------------------------- editor

  function renderEditor() {
    const d = state.deck;
    const cls = CLASSES[d.cls];
    wrap.innerHTML = `
      <header class="lib-head db-edit-head">
        <button class="btn lib-back" data-act="list" type="button">← Decks</button>
        ${portrait(d.cls)}
        <input class="db-name" type="text" maxlength="${MAX_NAME_LENGTH}" value="${esc(d.name)}" aria-label="Deck name" spellcheck="false">
        <span class="db-saved" aria-live="polite">Saved</span>
      </header>
      <div class="db-editor" style="--cls:${cls.color}">
        <div class="db-collection">
          <div class="lib-tabs" role="tablist" aria-label="Card pool">
            <button class="lib-tab" role="tab" data-tab="class" type="button" style="--cls:${cls.color}">
              <span class="lib-tab-icon">${artHTML(classArt(d.cls))}</span>${cls.name}
            </button>
            <button class="lib-tab" role="tab" data-tab="neutral" type="button" style="--cls:#8a8f98">
              <span class="lib-tab-icon lib-tab-icon-text">◇</span>Neutral
            </button>
          </div>
          <div class="lib-tools">
            <input class="lib-search" type="search" placeholder="Search name or text…" aria-label="Search cards" value="${esc(state.query)}">
            <div class="lib-costs" role="group" aria-label="Filter by mana cost">
              <button class="lib-cost" data-cost="" type="button">Any</button>
              ${COST_FILTERS.map(c => `<button class="lib-cost gem" data-cost="${c}" type="button" aria-label="Cost ${c}">${c}</button>`).join('')}
            </div>
          </div>
          <p class="db-hint">Click a card to add it. Right-click a card, or click it in the deck list, to take one out.</p>
          <div class="lib-grid db-grid"></div>
        </div>
        <aside class="db-deck">
          <button class="db-deck-head" data-act="toggle-deck" type="button" aria-expanded="${state.showDeck}">
            <span class="db-count"></span>
            <span class="db-curve" aria-hidden="true"></span>
            <span class="db-toggle-icon" aria-hidden="true"></span>
          </button>
          <div class="db-deck-body">
            <ol class="db-list"></ol>
            <div class="db-problems"></div>
            <div class="db-deck-actions">
              <button class="btn db-small" data-act="fill" type="button">Auto-fill</button>
              <button class="btn db-small" data-act="clear" type="button"></button>
              <button class="btn db-small primary" data-act="use" type="button">Play</button>
            </div>
          </div>
        </aside>
      </div>`;
    renderCollection();
    renderDeck();
  }

  /** Redraw the card grid and filters (not the whole editor, so the name field keeps focus). */
  function renderCollection() {
    const d = state.deck;
    const cls = state.tab === 'class' ? d.cls : 'neutral';
    const cards = sortCards(filterCards(Object.values(CARDS), { cls, query: state.query, cost: state.cost, unlocks: state.unlocks, locked: state.locked }));
    const counts = countCards(d.cards);
    const full = d.cards.length >= DECK_SIZE;
    wrap.querySelectorAll('.lib-tab').forEach(t => {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    wrap.querySelectorAll('.lib-cost').forEach(b => {
      const v = parseCost(b.dataset.cost);
      b.classList.toggle('active', v === state.cost);
      b.setAttribute('aria-pressed', String(v === state.cost));
    });
    const grid = wrap.querySelector('.db-grid');
    grid.innerHTML = cards.length ? cards.map(c => {
      const n = counts[c.id] ?? 0;
      const blocked = n >= MAX_COPIES || full;
      return `
        <button class="lib-card db-card${blocked ? ' blocked' : ''}${n ? ' in-deck' : ''}" type="button" data-add="${c.id}"
          aria-label="${esc(c.name)}, ${c.cost} mana, ${n} of ${MAX_COPIES} in deck">
          ${cardHTML(c.id)}${n ? `<span class="db-copies">${n}/${MAX_COPIES}</span>` : ''}
        </button>`;
    }).join('') : '<p class="lib-empty">No cards match these filters.</p>';
  }

  function renderDeck() {
    const d = state.deck;
    const counts = countCards(d.cards);
    const ids = sortIds(Object.keys(counts));
    const curve = manaCurve(d.cards);
    const peak = Math.max(4, ...curve);
    const problems = deckProblems(d, state.locked);
    const panel = wrap.querySelector('.db-deck');
    panel.classList.toggle('open', state.showDeck);
    panel.querySelector('.db-deck-head').setAttribute('aria-expanded', String(state.showDeck));
    panel.querySelector('.db-count').innerHTML =
      `<b class="${d.cards.length === DECK_SIZE ? 'good' : ''}">${d.cards.length}</b>/${DECK_SIZE} cards`;
    panel.querySelector('.db-curve').innerHTML = curve.map((n, i) => `
      <span class="db-bar" title="${n} card${n === 1 ? '' : 's'} costing ${CURVE_LABELS[i]}">
        <i style="height:${(n / peak) * 100}%"></i><small>${CURVE_LABELS[i]}</small>
      </span>`).join('');
    panel.querySelector('.db-list').innerHTML = ids.length ? ids.map(id => {
      const c = CARDS[id];
      return `
        <li><button class="db-row" data-card="${id}" type="button" style="--cls:${classColor(c.cls)}"
            aria-label="Remove ${esc(c.name)} (${counts[id]} in deck)">
          <span class="db-row-cost">${c.cost}</span>
          <span class="db-row-name">${esc(c.name)}</span>
          <span class="db-row-art">${artHTML(c)}</span>
          <span class="db-row-n">${counts[id] > 1 ? `×${counts[id]}` : ''}</span>
        </button></li>`;
    }).join('') : '<li class="db-list-empty">Your deck is empty. Click cards on the left to add them.</li>';
    panel.querySelector('.db-problems').innerHTML = problems.length
      ? problems.map(p => `<p>${esc(p)}</p>`).join('')
      : '<p class="good">This deck is ready. Pick it on the main menu, or press Play.</p>';
    const clear = panel.querySelector('[data-act="clear"]');
    clear.textContent = state.confirmClear ? 'Really clear?' : 'Clear';
    clear.classList.toggle('danger', state.confirmClear);
    clear.disabled = !d.cards.length;
    panel.querySelector('[data-act="fill"]').disabled = d.cards.length >= DECK_SIZE;
    panel.querySelector('[data-act="use"]').disabled = problems.length > 0;
  }

  // ---------------------------------------------------------- changes

  let savedTimer = null;
  function save() {
    state.decks = storeDeck(state.deck);
    const badge = wrap.querySelector('.db-saved');
    if (badge) {
      badge.classList.add('flash');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => badge.classList.remove('flash'), 700);
    }
  }

  function change(next) {
    if (next === state.deck) return;
    state.deck = next;
    state.confirmClear = false;
    save();
    renderCollection();
    renderDeck();
  }

  function add(id) {
    const why = addBlocker(state.deck, id, state.locked);
    if (why) return notify(why);
    sounds.add?.();
    change(addCard(state.deck, id, state.locked));
  }

  function remove(id) {
    sounds.remove?.();
    change(removeCard(state.deck, id));
  }

  function edit(id) {
    const d = state.decks.find(x => x.id === id);
    if (!d) return;
    state.deck = d;
    state.view = 'edit';
    state.tab = 'class';
    state.query = '';
    state.cost = null;
    state.confirmClear = false;
    state.showDeck = false;
    render();
  }

  const parseCost = v => (v === '' || v == null ? null : v === '7+' ? '7+' : Number(v));

  // ---------------------------------------------------------- input

  root.addEventListener('click', e => {
    const t = e.target;
    const act = t.closest('[data-act]')?.dataset.act;
    const tileId = t.closest('.db-tile')?.dataset.id;
    switch (act) {
      case 'menu': return onBack();
      case 'list': state.view = 'list'; state.confirmDelete = null; return render();
      case 'new': state.view = 'pick-class'; return render();
      case 'create': {
        const deck = newDeck(t.closest('[data-cls]').dataset.cls, '');
        state.decks = storeDeck(deck);
        edit(deck.id);
        const name = wrap.querySelector('.db-name');
        name.focus();
        name.select();
        return;
      }
      case 'edit': return edit(tileId);
      case 'delete': state.confirmDelete = tileId; return render();
      case 'delete-no': state.confirmDelete = null; return render();
      case 'delete-yes': state.decks = removeDeck(tileId); state.confirmDelete = null; return render();
      case 'use': {
        const d = tileId ? state.decks.find(x => x.id === tileId) : state.deck;
        if (d && !deckProblems(d, state.locked).length) onUse(d.cls, d.id);
        return;
      }
      case 'fill': return change(autoFill(state.deck, Math.random, state.locked));
      case 'clear':
        if (!state.confirmClear) { state.confirmClear = true; return renderDeck(); }
        return change({ ...state.deck, cards: [] });
      case 'toggle-deck': state.showDeck = !state.showDeck; return renderDeck();
    }
    if (state.view !== 'edit') return;
    const tab = t.closest('.lib-tab');
    if (tab) { state.tab = tab.dataset.tab; return renderCollection(); }
    const cost = t.closest('.lib-cost');
    if (cost) {
      const v = parseCost(cost.dataset.cost);
      state.cost = state.cost === v ? null : v;
      return renderCollection();
    }
    const card = t.closest('.db-card');
    if (card) return add(card.dataset.add);
    const row = t.closest('.db-row');
    if (row) return remove(row.dataset.card);
    // Clicking anywhere else cancels a pending "Really clear?".
    if (state.confirmClear) { state.confirmClear = false; renderDeck(); }
  });

  root.addEventListener('contextmenu', e => {
    const card = e.target.closest('.db-card');
    if (!card) return;
    e.preventDefault();
    if (state.deck.cards.includes(card.dataset.add)) remove(card.dataset.add);
  });

  root.addEventListener('input', e => {
    if (e.target.classList.contains('lib-search')) { state.query = e.target.value; renderCollection(); }
    if (e.target.classList.contains('db-name')) { state.deck = { ...state.deck, name: e.target.value }; save(); renderDeck(); }
  });
  // An emptied name falls back to the default once you leave the field.
  root.addEventListener('focusout', e => {
    if (!e.target.classList?.contains('db-name')) return;
    const saved = state.decks.find(d => d.id === state.deck.id);
    if (saved) { state.deck = saved; e.target.value = saved.name; renderDeck(); }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('db-name')) e.target.blur();
  });

  /** Show the deck list, or open one deck straight away. */
  return ({ editId } = {}) => {
    state.decks = loadDecks();
    state.unlocks = loadUnlocks();
    state.locked = lockedCards(undefined, state.unlocks);
    state.confirmDelete = null;
    if (editId && state.decks.some(d => d.id === editId)) return edit(editId);
    state.view = 'list';
    render();
  };
}
