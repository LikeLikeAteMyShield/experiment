// Card library: browse every card, filtered by class, mana cost and text.
// filterCards/sortCards are pure (and unit tested); mountLibrary builds the screen.

import { CARDS, CLASSES, cardText, classArt } from './cards.js';
import { loadUnlocks, isVisible } from './unlocks.js';
import { lockedCards } from './rewards.js';
import { cardHTML, keywordHelpHTML, esc } from './cardview.js';
import { artHTML } from './pixelart.js';

/** Class tabs in display order; cards sort in this order too. */
export const CLASS_ORDER = [...Object.keys(CLASSES), 'neutral'];
export const COST_FILTERS = [0, 1, 2, 3, 4, 5, 6, '7+'];

const className = cls => CLASSES[cls]?.name ?? 'Neutral';

/**
 * @param {object[]} cards
 * @param {object} f
 * @param {string} [f.cls]     'all', a class key, or 'neutral'
 * @param {string} [f.query]   matched against name, rules text, type and class
 * @param {number|string|null} [f.cost]  exact cost, '7+', or null for any
 * @param {boolean} [f.tokens] include non-collectible tokens
 * @param {object} [f.unlocks] unlocked hidden classes (see unlocks.js); locked hidden classes' cards never show
 * @param {Set<string>} [f.locked] ids of quest reward cards not yet earned (see rewards.js); they never show
 */
export function filterCards(cards, { cls = 'all', query = '', cost = null, tokens = false, unlocks = {}, locked = new Set() } = {}) {
  const q = query.trim().toLowerCase();
  return cards.filter(c =>
    isVisible(c.cls, unlocks) && !locked.has(c.id) &&
    (tokens || !c.token) &&
    (cls === 'all' || c.cls === cls) &&
    (cost == null || (cost === '7+' ? c.cost >= 7 : c.cost === cost)) &&
    (!q || [c.name, cardText(c), c.type, className(c.cls)].some(s => s.toLowerCase().includes(q))));
}

/** Class order, then mana cost, then name. */
export function sortCards(cards) {
  return [...cards].sort((a, b) =>
    CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) || a.cost - b.cost || a.name.localeCompare(b.name));
}

const STORE_KEY = 'riftclash-library-class';

/**
 * Build the library inside `root` (once) and return a function that shows it.
 * @param {HTMLElement} root
 * @param {{ onBack: () => void }} opts
 */
export function mountLibrary(root, { onBack }) {
  const state = { cls: 'all', query: '', cost: null, tokens: false, list: [], open: -1, unlocks: {}, locked: new Set() };
  try { state.cls = localStorage.getItem(STORE_KEY) || 'all'; } catch { /* storage unavailable */ }
  if (state.cls !== 'all' && !CLASS_ORDER.includes(state.cls)) state.cls = 'all';

  const all = Object.values(CARDS);
  const tabIcon = cls => CLASSES[cls]
    ? `<span class="lib-tab-icon">${artHTML(classArt(cls))}</span>`
    : '<span class="lib-tab-icon lib-tab-icon-text">◇</span>';

  root.innerHTML = `
    <div class="lib-wrap">
      <header class="lib-head">
        <button class="btn lib-back" type="button">← Menu</button>
        <h2>Card Library</h2>
        <span class="lib-count" aria-live="polite"></span>
      </header>
      <div class="lib-tabs" role="tablist" aria-label="Filter by class">
      </div>
      <div class="lib-tools">
        <input class="lib-search" type="search" placeholder="Search name or text…" aria-label="Search cards">
        <div class="lib-costs" role="group" aria-label="Filter by mana cost">
          <button class="lib-cost" data-cost="" type="button">Any</button>
          ${COST_FILTERS.map(c => `<button class="lib-cost gem" data-cost="${c}" type="button" aria-label="Cost ${c}">${c}</button>`).join('')}
        </div>
        <label class="lib-tokens"><input type="checkbox"> Show tokens</label>
      </div>
      <div class="lib-results"></div>
    </div>
    <div class="lib-inspect hidden" role="dialog" aria-modal="true" aria-label="Card details">
      <div class="lib-inspect-box">
        <button class="lib-close" type="button" aria-label="Close">✕</button>
        <button class="lib-nav lib-prev" type="button" aria-label="Previous card">‹</button>
        <div class="lib-inspect-card"></div>
        <div class="lib-inspect-info"></div>
        <button class="lib-nav lib-next" type="button" aria-label="Next card">›</button>
      </div>
    </div>`;

  const $ = sel => root.querySelector(sel);
  const results = $('.lib-results');
  const inspect = $('.lib-inspect');

  /** Class tabs: only classes the player can see. */
  function renderTabs() {
    const classes = CLASS_ORDER.filter(cls => isVisible(cls, state.unlocks));
    $('.lib-tabs').innerHTML = `
      <button class="lib-tab" role="tab" data-cls="all" type="button"><span class="lib-tab-icon lib-tab-icon-text">✦</span>All</button>
      ${classes.map(cls => `
        <button class="lib-tab" role="tab" data-cls="${cls}" type="button" style="--cls:${CLASSES[cls]?.color ?? '#8a8f98'}">
          ${tabIcon(cls)}${className(cls)}
        </button>`).join('')}`;
  }

  function render() {
    state.list = sortCards(filterCards(all, state));
    root.querySelectorAll('.lib-tab').forEach(t => {
      const on = t.dataset.cls === state.cls;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    root.querySelectorAll('.lib-cost').forEach(b => {
      const v = b.dataset.cost === '' ? null : b.dataset.cost === '7+' ? '7+' : Number(b.dataset.cost);
      b.classList.toggle('active', v === state.cost);
      b.setAttribute('aria-pressed', String(v === state.cost));
    });
    $('.lib-tokens input').checked = state.tokens;
    $('.lib-count').textContent = `${state.list.length} card${state.list.length === 1 ? '' : 's'}`;

    if (!state.list.length) {
      results.innerHTML = '<p class="lib-empty">No cards match these filters.</p>';
      return;
    }
    // On "All", group cards under a heading per class.
    const groups = state.cls === 'all' ? CLASS_ORDER.filter(cls => isVisible(cls, state.unlocks)) : [state.cls];
    results.innerHTML = groups.map(cls => {
      const cards = state.list.map((c, i) => [c, i]).filter(([c]) => c.cls === cls);
      if (!cards.length) return '';
      return `
        <section class="lib-group" style="--cls:${CLASSES[cls]?.color ?? '#8a8f98'}">
          ${state.cls === 'all' ? `<h3 class="lib-group-title">${tabIcon(cls)}${className(cls)} <small>${cards.length}</small></h3>` : ''}
          <div class="lib-grid">
            ${cards.map(([c, i]) => `
              <button class="lib-card" type="button" data-index="${i}" aria-label="${esc(c.name)}, ${c.cost} mana ${c.type}">
                ${cardHTML(c.id)}${c.token ? '<span class="lib-token-tag">Token</span>' : ''}
              </button>`).join('')}
          </div>
        </section>`;
    }).join('');
  }

  function showCard(i) {
    state.open = (i + state.list.length) % state.list.length;
    const c = state.list[state.open];
    const stats = c.type === 'minion' ? `${c.attack} Attack · ${c.health} Health`
      : c.type === 'weapon' ? `${c.attack} Attack · ${c.durability} Durability` : '';
    $('.lib-inspect-card').innerHTML = cardHTML(c.id);
    $('.lib-inspect-info').innerHTML = `
      <h3>${esc(c.name)}</h3>
      <p class="lib-meta">${className(c.cls)} ${c.type}${c.token ? ' · Token' : ''}</p>
      <p class="lib-meta">${c.cost} mana${stats ? ` · ${stats}` : ''}</p>
      ${keywordHelpHTML(c) || '<p class="lib-note">No keywords.</p>'}
      <p class="lib-pos">${state.open + 1} / ${state.list.length}</p>`;
    inspect.style.setProperty('--cls', CLASSES[c.cls]?.color ?? '#8a8f98');
    inspect.classList.remove('hidden');
  }

  function closeCard() {
    if (state.open < 0) return;
    const i = state.open;
    state.open = -1;
    inspect.classList.add('hidden');
    results.querySelector(`[data-index="${i}"]`)?.focus();
  }

  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('.lib-back')) return onBack();
    const tab = t.closest('.lib-tab');
    if (tab) {
      state.cls = tab.dataset.cls;
      try { localStorage.setItem(STORE_KEY, state.cls); } catch { /* ignore */ }
      return render();
    }
    const cost = t.closest('.lib-cost');
    if (cost) {
      const v = cost.dataset.cost === '' ? null : cost.dataset.cost === '7+' ? '7+' : Number(cost.dataset.cost);
      state.cost = state.cost === v ? null : v;
      return render();
    }
    const card = t.closest('.lib-card');
    if (card) return showCard(Number(card.dataset.index));
    if (t.closest('.lib-close') || t === inspect) return closeCard();
    if (t.closest('.lib-prev')) return showCard(state.open - 1);
    if (t.closest('.lib-next')) return showCard(state.open + 1);
  });
  $('.lib-search').addEventListener('input', e => { state.query = e.target.value; render(); });
  $('.lib-tokens input').addEventListener('change', e => { state.tokens = e.target.checked; render(); });
  document.addEventListener('keydown', e => {
    if (root.classList.contains('hidden') || state.open < 0) return;
    if (e.key === 'Escape') closeCard();
    else if (e.key === 'ArrowLeft') showCard(state.open - 1);
    else if (e.key === 'ArrowRight') showCard(state.open + 1);
  });

  return () => {
    // Unlocks can change between visits (and a remembered tab may now be hidden).
    state.unlocks = loadUnlocks();
    state.locked = lockedCards(undefined, state.unlocks);
    if (state.cls !== 'all' && !isVisible(state.cls, state.unlocks)) state.cls = 'all';
    closeCard();
    renderTabs();
    render();
  };
}
