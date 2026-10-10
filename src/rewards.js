// Quest rewards. A quest with `reward: { cards }` (see QUESTS in progress.js)
// keeps those cards locked: hidden from the library, the deck builder and the
// decks the game builds, the AI's included, until the quest is complete. The
// play-test code unlocks them along with everything else.
//
// The player is told about each reward once: on the result screen when a game
// completes the quest, or on the main menu otherwise (for instance, a quest
// completed before it had a reward). Seen rewards are stored as card ids, so a
// card added to an old quest's reward later is still announced.
//
// Pure apart from the storage defaults, so it's unit tested in node.

import { CARDS } from './cards.js';
import { QUESTS, loadProgress } from './progress.js';
import { loadUnlocks, isPlaytest } from './unlocks.js';

const SEEN_KEY = 'riftclash-rewards-seen';

/** { cardId: questId } for every card some quest awards. */
export const REWARD_CARDS = Object.fromEntries(QUESTS.flatMap(q => (q.reward?.cards ?? []).map(id => [id, q.id])));

/** Ids of the reward cards the player hasn't earned yet. */
export function lockedCards(progress = loadProgress(), unlocks = loadUnlocks()) {
  if (isPlaytest(unlocks)) return new Set();
  return new Set(Object.keys(REWARD_CARDS).filter(id => !progress.quests[REWARD_CARDS[id]]));
}

/** What a quest's reward unlocks, for display: its collectible cards (tokens come with them). */
export const rewardCards = q => (q.reward?.cards ?? []).filter(id => CARDS[id] && !CARDS[id].token);

/** A short line describing a quest's reward, or '' if it has none. */
export function rewardText(q) {
  const n = rewardCards(q).length;
  return n ? `Reward: ${n} new card${n === 1 ? '' : 's'}` : '';
}

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

function loadSeen(storage) {
  try {
    const v = JSON.parse(storage?.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

/** Rewards from completed quests the player hasn't been shown yet: [{ quest, cards }], in quest order. */
export function unseenRewards(progress = loadProgress(), storage = defaultStorage()) {
  const seen = new Set(loadSeen(storage));
  return QUESTS.filter(q => progress.quests[q.id])
    .map(quest => ({ quest, cards: rewardCards(quest).filter(id => !seen.has(id)) }))
    .filter(r => r.cards.length);
}

/** Remember that the player has been shown these reward cards. */
export function markRewardsSeen(ids, storage = defaultStorage()) {
  try { storage.setItem(SEEN_KEY, JSON.stringify([...new Set([...loadSeen(storage), ...ids])])); } catch { /* storage unavailable */ }
}
