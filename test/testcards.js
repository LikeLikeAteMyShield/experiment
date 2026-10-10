// Cards that exist only for the tests, so engine tests don't break whenever a
// real card is rebalanced. Importing this file registers them in CARDS.
// They are tokens, so they never turn up in built decks, deck pools or the library.

import { CARDS } from '../src/cards.js';

/** A plain 4-mana 4/5 minion with no text: the go-to filler and punching bag. */
export const VANILLA = 'test_vanilla';

CARDS[VANILLA] = {
  id: VANILLA, name: 'Test Dummy', type: 'minion', cost: 4, attack: 4, health: 5, emoji: '🧪',
  cls: 'neutral', keywords: {}, token: true,
};
