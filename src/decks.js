// Custom decks: the deck rules, and saving decks in localStorage.
// Everything except the storage default is pure, so it is unit tested in node.

import { CARDS, CLASSES } from './cards.js';

export const DECK_SIZE = 30;
export const MAX_COPIES = 2;
export const MAX_NAME_LENGTH = 24;
/** The menu's id for the built-in deck each class gets when no custom deck is chosen. */
export const STANDARD_DECK = 'standard';

const DECKS_KEY = 'riftclash-decks';
const CHOICE_KEY = 'riftclash-deck-choice';

// `locked` is a set of card ids the player hasn't unlocked yet (see rewards.js).
const NONE = new Set();

/** Cards a deck of this class may contain: the class's own cards plus neutrals, no tokens, nothing locked. */
export const deckPool = (cls, locked = NONE) => Object.values(CARDS).filter(c => canInclude(cls, c.id, locked));

export function canInclude(cls, cardId, locked = NONE) {
  const c = CARDS[cardId];
  return !!c && !c.token && !locked.has(cardId) && (c.cls === cls || c.cls === 'neutral');
}

/** { cardId: copies } */
export function countCards(cards) {
  const counts = {};
  for (const id of cards) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Why a card can't be added right now, or null if it can. */
export function addBlocker(deck, cardId, locked = NONE) {
  if (locked.has(cardId)) return `${CARDS[cardId]?.name ?? 'That card'} is still locked.`;
  if (!canInclude(deck.cls, cardId)) return `${CARDS[cardId]?.name ?? 'That card'} can't go in a ${CLASSES[deck.cls].name} deck.`;
  if (deck.cards.length >= DECK_SIZE) return `The deck is full (${DECK_SIZE} cards).`;
  if ((countCards(deck.cards)[cardId] ?? 0) >= MAX_COPIES) return `Only ${MAX_COPIES} copies of ${CARDS[cardId].name} allowed.`;
  return null;
}

/** A copy of the deck with one more copy of the card, or the same deck if it can't be added. */
export function addCard(deck, cardId, locked = NONE) {
  return addBlocker(deck, cardId, locked) ? deck : { ...deck, cards: sortIds([...deck.cards, cardId]) };
}

/** A copy of the deck with one copy of the card removed. */
export function removeCard(deck, cardId) {
  const i = deck.cards.indexOf(cardId);
  if (i < 0) return deck;
  const cards = [...deck.cards];
  cards.splice(i, 1);
  return { ...deck, cards };
}

/** Cost, then class cards before neutrals, then name. */
export function sortIds(ids) {
  return [...ids].sort((a, b) => {
    const x = CARDS[a], y = CARDS[b];
    return x.cost - y.cost || (x.cls === 'neutral') - (y.cls === 'neutral') || x.name.localeCompare(y.name);
  });
}

export const cleanName = name => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

/** Every rule the deck breaks; an empty list means it can be played. */
export function deckProblems(deck, locked = NONE) {
  const problems = [];
  if (!CLASSES[deck.cls]) return ['Unknown class.'];
  if (!cleanName(deck.name)) problems.push('Give the deck a name.');
  if (deck.cards.length !== DECK_SIZE) problems.push(`A deck needs exactly ${DECK_SIZE} cards (it has ${deck.cards.length}).`);
  for (const [id, n] of Object.entries(countCards(deck.cards))) {
    if (locked.has(id)) problems.push(`${CARDS[id].name} is still locked.`);
    else if (!canInclude(deck.cls, id)) problems.push(`${CARDS[id]?.name ?? id} can't go in this deck.`);
    else if (n > MAX_COPIES) problems.push(`Too many copies of ${CARDS[id].name}.`);
  }
  return problems;
}

export const isPlayable = (deck, locked = NONE) => deckProblems(deck, locked).length === 0;

/** Number of cards at each cost, with 7 and above together in the last slot. */
export function manaCurve(cards) {
  const curve = Array(8).fill(0);
  for (const id of cards) curve[Math.min(CARDS[id].cost, 7)]++;
  return curve;
}

/**
 * Fill the deck up to 30 cards: first the class's own cards, then neutrals
 * picked to fill out the mana curve. Never removes anything.
 */
export function autoFill(deck, rand = Math.random, locked = NONE) {
  let d = deck;
  const pool = deckPool(deck.cls, locked);
  const tryAdd = id => { const next = addCard(d, id, locked); const ok = next !== d; d = next; return ok; };
  // Class cards are what make a deck feel like its class, so they go in first.
  for (const c of pool.filter(c => c.cls === deck.cls)) while (d.cards.length < DECK_SIZE && tryAdd(c.id));
  // Then neutrals, at whichever cost bracket is furthest below a sensible curve.
  const target = [4, 7, 7, 5, 4, 3];  // costs 0-1, 2, 3, 4, 5, 6+ (sums to 30)
  const bracket = cost => (cost <= 1 ? 0 : Math.min(cost - 1, 5));
  while (d.cards.length < DECK_SIZE) {
    const have = Array(6).fill(0);
    for (const id of d.cards) have[bracket(CARDS[id].cost)]++;
    const options = pool.filter(c => !addBlocker(d, c.id));
    if (!options.length) break;
    const need = b => target[b] - have[b];
    const best = Math.max(...options.map(c => need(bracket(c.cost))));
    const picks = options.filter(c => need(bracket(c.cost)) === best);
    tryAdd(picks[Math.floor(rand() * picks.length)].id);
  }
  return d;
}

export function newDeckId() {
  return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export function newDeck(cls, name) {
  return { id: newDeckId(), name: cleanName(name) || `${CLASSES[cls].name} deck`, cls, cards: [], updated: Date.now() };
}

/**
 * Turn whatever was stored into a list of well-formed decks. Unknown classes
 * are dropped; cards that no longer exist (or no longer fit) are removed, so an
 * old deck comes back short rather than broken.
 */
export function sanitizeDecks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object' || !CLASSES[d.cls]) continue;
    let id = typeof d.id === 'string' && d.id ? d.id : newDeckId();
    if (seen.has(id)) id = newDeckId();
    seen.add(id);
    const deck = { id, name: cleanName(d.name) || `${CLASSES[d.cls].name} deck`, cls: d.cls, cards: [], updated: Number(d.updated) || 0 };
    for (const cardId of Array.isArray(d.cards) ? d.cards : []) {
      if (typeof cardId === 'string') deck.cards = addCard(deck, cardId).cards;
    }
    out.push(deck);
  }
  return out;
}

// --------------------------------------------------------------- storage
// `storage` defaults to localStorage but can be any { getItem, setItem }.
// Storage can be missing or full (private browsing), so failures are caught:
// loading falls back to no decks, and saving reports false.

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function loadDecks(storage = defaultStorage()) {
  try { return sanitizeDecks(JSON.parse(storage?.getItem(DECKS_KEY) ?? '[]')); } catch { return []; }
}

export function saveDecks(decks, storage = defaultStorage()) {
  try {
    storage.setItem(DECKS_KEY, JSON.stringify(decks.map(({ id, name, cls, cards, updated }) => ({ id, name, cls, cards, updated }))));
    return true;
  } catch { return false; }
}

/** Insert or replace a deck (by id) and save. Returns the new list. */
export function storeDeck(deck, storage = defaultStorage()) {
  const decks = loadDecks(storage);
  const saved = { ...deck, name: cleanName(deck.name) || `${CLASSES[deck.cls].name} deck`, updated: Date.now() };
  const i = decks.findIndex(d => d.id === deck.id);
  if (i < 0) decks.push(saved); else decks[i] = saved;
  saveDecks(decks, storage);
  return decks;
}

export function removeDeck(id, storage = defaultStorage()) {
  const decks = loadDecks(storage).filter(d => d.id !== id);
  saveDecks(decks, storage);
  return decks;
}

/** Which deck the menu last used for each class: { cls: deckId | 'standard' }. */
export function loadDeckChoice(storage = defaultStorage()) {
  try {
    const v = JSON.parse(storage?.getItem(CHOICE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function saveDeckChoice(cls, deckId, storage = defaultStorage()) {
  try { storage.setItem(CHOICE_KEY, JSON.stringify({ ...loadDeckChoice(storage), [cls]: deckId })); } catch { /* ignore */ }
}
