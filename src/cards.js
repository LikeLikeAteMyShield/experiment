// Card and class data for Riftclash.
//
// Cards are pure data. Effects are small objects interpreted by the engine
// (see resolveEffect in engine.js). Selectors used in `to`:
//   target, self, ownHero, enemyHero, allEnemyMinions, allFriendlyMinions,
//   otherFriendlyMinions, allMinions, allOtherMinions, allEnemies,
//   allFriendly, allOtherCharacters, randomEnemy, randomEnemyMinion,
//   randomFriendlyMinion, adjacent (the minions on either side of this one)
//
// `adjacentAura: { attack }` gives the minions on either side bonus Attack
// for as long as they stay next to it.
//
// Target specs (for cards / hero powers that ask the player to pick):
//   any, minion, enemyMinion, friendlyMinion, enemy, friendly
// Optional `targetFilter`: { maxAttack, minAttack, damaged, undamaged }

export const CLASSES = {
  pyromancer: {
    name: 'Pyromancer', hero: 'Ignatia the Kindled', emoji: '🔥', color: '#e2603a',
    heroPower: { name: 'Spark', cost: 2, text: 'Deal 1 damage.', target: 'any',
      effects: [{ type: 'damage', amount: 1, to: 'target' }] },
  },
  warlord: {
    name: 'Warlord', hero: 'Brakka Ironjaw', emoji: '🪓', color: '#b53b3b',
    heroPower: { name: 'Brace', cost: 2, text: 'Gain 2 Armor.',
      effects: [{ type: 'armor', amount: 2 }] },
  },
  stalker: {
    name: 'Stalker', hero: 'Wren Duskmantle', emoji: '🏹', color: '#4f9a45',
    heroPower: { name: 'Volley', cost: 2, text: 'Deal 2 damage to the enemy hero.',
      effects: [{ type: 'damage', amount: 2, to: 'enemyHero' }] },
  },
  oracle: {
    name: 'Oracle', hero: 'Sister Lumen', emoji: '🕯️', color: '#d9cf9a',
    heroPower: { name: 'Mend', cost: 2, text: 'Restore 2 Health.', target: 'any',
      effects: [{ type: 'heal', amount: 2, to: 'target' }] },
  },
  vanguard: {
    name: 'Vanguard', hero: 'Commander Hale', emoji: '🛡️', color: '#e0b23c',
    heroPower: { name: 'Muster', cost: 2, text: 'Summon a 1/1 Recruit.',
      effects: [{ type: 'summon', card: 't_recruit' }] },
  },
  shade: {
    name: 'Shade', hero: 'Vex the Unseen', emoji: '🗡️', color: '#6b5a8e',
    heroPower: { name: 'Blade Kit', cost: 2, text: 'Equip a 1/2 Shiv.',
      effects: [{ type: 'weapon', card: 't_shiv' }] },
  },
};

const RAW_CARDS = [
  // ---------- Tokens (not collectible) ----------
  { id: 't_coin', name: 'Ember Coin', type: 'spell', cost: 0, emoji: '🪙', token: true,
    text: 'Gain 1 Mana Crystal this turn only.', effects: [{ type: 'mana', amount: 1 }] },
  { id: 't_recruit', name: 'Recruit', type: 'minion', cost: 1, attack: 1, health: 1, emoji: '🧑', token: true, cls: 'vanguard' },
  { id: 't_wolf', name: 'Dusk Wolf', type: 'minion', cost: 2, attack: 2, health: 2, emoji: '🐺', token: true, cls: 'stalker' },
  { id: 't_shardling', name: 'Shardling', type: 'minion', cost: 2, attack: 2, health: 2, emoji: '💎', token: true },
  { id: 't_shiv', name: 'Shiv', type: 'weapon', cost: 1, attack: 1, durability: 2, emoji: '🔪', token: true, cls: 'shade' },

  // ---------- Neutral ----------
  { id: 'n_mossling', name: 'Mossling', type: 'minion', cost: 1, attack: 2, health: 1, emoji: '🌱' },
  { id: 'n_lanternmoth', name: 'Lantern Moth', type: 'minion', cost: 1, attack: 1, health: 1, emoji: '🦋',
    text: 'Battlecry: Deal 1 damage.', target: 'any', battlecry: [{ type: 'damage', amount: 1, to: 'target' }] },
  { id: 'n_brambebeetle', name: 'Bramble Beetle', type: 'minion', cost: 1, attack: 1, health: 2, emoji: '🐞',
    keywords: { taunt: true } },
  { id: 'n_scrapper', name: 'Alley Scrapper', type: 'minion', cost: 2, attack: 3, health: 2, emoji: '🥊' },
  { id: 'n_glasswing', name: 'Glasswing Sentry', type: 'minion', cost: 2, attack: 2, health: 1, emoji: '🪽',
    keywords: { divineShield: true } },
  { id: 'n_courier', name: 'Wandering Courier', type: 'minion', cost: 2, attack: 2, health: 2, emoji: '📜',
    text: 'Deathrattle: Draw a card.', deathrattle: [{ type: 'draw', count: 1 }] },
  { id: 'n_leechbat', name: 'Leech Bat', type: 'minion', cost: 2, attack: 2, health: 2, emoji: '🦇',
    keywords: { lifesteal: true } },
  { id: 'n_adder', name: 'Swamp Adder', type: 'minion', cost: 2, attack: 1, health: 2, emoji: '🐍',
    keywords: { poisonous: true } },
  { id: 'n_tinker', name: 'Cog Tinker', type: 'minion', cost: 3, attack: 2, health: 3, emoji: '⚙️',
    text: 'Battlecry: Give a friendly minion +1/+1.', target: 'friendlyMinion',
    battlecry: [{ type: 'buff', attack: 1, health: 1, to: 'target' }] },
  { id: 'n_boar', name: 'Ironhide Boar', type: 'minion', cost: 3, attack: 2, health: 4, emoji: '🐗',
    keywords: { taunt: true } },
  { id: 'n_herald', name: 'Galloping Herald', type: 'minion', cost: 3, attack: 3, health: 2, emoji: '🐎',
    keywords: { rush: true } },
  { id: 'n_lurker', name: 'Bog Lurker', type: 'minion', cost: 3, attack: 3, health: 2, emoji: '🐊',
    keywords: { stealth: true } },
  { id: 'n_medic', name: 'Field Medic', type: 'minion', cost: 3, attack: 3, health: 2, emoji: '🩹',
    text: 'Battlecry: Restore 4 Health to your hero.', battlecry: [{ type: 'heal', amount: 4, to: 'ownHero' }] },
  { id: 'n_warhorn', name: 'Warhorn Totem', type: 'minion', cost: 2, attack: 0, health: 3, emoji: '📯',
    text: 'Adjacent minions have +2 Attack.', adjacentAura: { attack: 2 } },
  { id: 'n_bannerbearer', name: 'Banner Bearer', type: 'minion', cost: 3, attack: 2, health: 3, emoji: '🎏',
    text: 'Battlecry: Give adjacent minions +1/+1.', battlecry: [{ type: 'buff', attack: 1, health: 1, to: 'adjacent' }] },
  { id: 'n_sergeant', name: 'Shieldwall Sergeant', type: 'minion', cost: 4, attack: 3, health: 4, emoji: '🪖',
    text: 'Battlecry: Give adjacent minions +1 Health and Taunt.',
    battlecry: [{ type: 'buff', health: 1, keywords: { taunt: true }, to: 'adjacent' }] },
  { id: 'n_golem', name: 'Shatterstone Golem', type: 'minion', cost: 4, attack: 3, health: 3, emoji: '🪨',
    text: 'Deathrattle: Summon a 2/2 Shardling.', deathrattle: [{ type: 'summon', card: 't_shardling' }] },
  { id: 'n_stormcaller', name: 'Stormcaller Adept', type: 'minion', cost: 4, attack: 3, health: 4, emoji: '⚡',
    spellDamage: 1 },
  { id: 'n_ram', name: 'Thornback Ram', type: 'minion', cost: 4, attack: 4, health: 5, emoji: '🐏' },
  { id: 'n_sorcerer', name: 'Hexbolt Sorcerer', type: 'minion', cost: 5, attack: 4, health: 4, emoji: '🧙',
    text: 'Battlecry: Deal 3 damage.', target: 'any', battlecry: [{ type: 'damage', amount: 3, to: 'target' }] },
  { id: 'n_dervish', name: 'Whirling Dervish', type: 'minion', cost: 5, attack: 3, health: 5, emoji: '🌪️',
    keywords: { windfury: true } },
  { id: 'n_sentinel', name: 'Granite Sentinel', type: 'minion', cost: 5, attack: 4, health: 6, emoji: '🗿',
    keywords: { taunt: true } },
  { id: 'n_wyvern', name: 'Skyreaver Wyvern', type: 'minion', cost: 6, attack: 5, health: 6, emoji: '🐉',
    keywords: { rush: true } },
  { id: 'n_treant', name: 'Elder Treant', type: 'minion', cost: 7, attack: 6, health: 8, emoji: '🌳',
    keywords: { taunt: true } },
  { id: 'n_colossus', name: 'Colossus of the Rift', type: 'minion', cost: 9, attack: 9, health: 9, emoji: '🌀',
    text: 'Battlecry: Deal 3 damage to all other characters.',
    battlecry: [{ type: 'damage', amount: 3, to: 'allOtherCharacters' }] },

  // ---------- Pyromancer ----------
  { id: 'p_cinderbolt', cls: 'pyromancer', name: 'Cinder Bolt', type: 'spell', cost: 2, emoji: '☄️',
    text: 'Deal 3 damage.', target: 'any', effects: [{ type: 'damage', amount: 3, to: 'target' }] },
  { id: 'p_rimelance', cls: 'pyromancer', name: 'Rime Lance', type: 'spell', cost: 2, emoji: '❄️',
    text: 'Deal 2 damage to a character and Freeze it.', target: 'any',
    effects: [{ type: 'damage', amount: 2, to: 'target' }, { type: 'freeze', to: 'target' }] },
  { id: 'p_sparkshower', cls: 'pyromancer', name: 'Spark Shower', type: 'spell', cost: 2, emoji: '✨',
    text: 'Deal 1 damage to a random enemy 3 times.',
    effects: [{ type: 'damage', amount: 1, to: 'randomEnemy', times: 3 }] },
  { id: 'p_runeweaver', cls: 'pyromancer', name: 'Runeweaver Apprentice', type: 'minion', cost: 2, attack: 1, health: 3, emoji: '📖',
    text: 'Whenever you cast a spell, gain +1 Attack.', onFriendlySpell: [{ type: 'buff', attack: 1, to: 'self' }] },
  { id: 'p_glacial', cls: 'pyromancer', name: 'Glacial Breath', type: 'spell', cost: 3, emoji: '🌬️',
    text: 'Freeze all enemy minions. Draw a card.',
    effects: [{ type: 'freeze', to: 'allEnemyMinions' }, { type: 'draw', count: 1 }] },
  { id: 'p_ashfall', cls: 'pyromancer', name: 'Ashfall', type: 'spell', cost: 3, emoji: '🌋',
    text: 'Deal 2 damage to all enemy minions.', effects: [{ type: 'damage', amount: 2, to: 'allEnemyMinions' }] },
  { id: 'p_embercolossus', cls: 'pyromancer', name: 'Ember Colossus', type: 'minion', cost: 6, attack: 6, health: 6, emoji: '🔥',
    text: 'At the end of your turn, deal 2 damage to a random enemy.',
    endOfTurn: [{ type: 'damage', amount: 2, to: 'randomEnemy' }] },
  { id: 'p_starfall', cls: 'pyromancer', name: 'Starfall Meteor', type: 'spell', cost: 7, emoji: '🌠',
    text: 'Deal 5 damage to all enemy minions.', effects: [{ type: 'damage', amount: 5, to: 'allEnemyMinions' }] },

  // ---------- Warlord ----------
  { id: 'w_stomp', cls: 'warlord', name: 'Shockwave Stomp', type: 'spell', cost: 1, emoji: '💥',
    text: 'Deal 1 damage to all minions.', effects: [{ type: 'damage', amount: 1, to: 'allMinions' }] },
  { id: 'w_axe', cls: 'warlord', name: 'Notched Axe', type: 'weapon', cost: 2, attack: 3, durability: 2, emoji: '🪓' },
  { id: 'w_verdict', cls: 'warlord', name: "Headsman's Verdict", type: 'spell', cost: 2, emoji: '⚖️',
    text: 'Destroy a damaged enemy minion.', target: 'enemyMinion', targetFilter: { damaged: true },
    effects: [{ type: 'destroy', to: 'target' }] },
  { id: 'w_berserker', cls: 'warlord', name: 'Bloodrage Berserker', type: 'minion', cost: 3, attack: 2, health: 4, emoji: '😤',
    text: 'Whenever this minion takes damage, gain +2 Attack.', onDamaged: [{ type: 'buff', attack: 2, to: 'self' }] },
  { id: 'w_resolve', cls: 'warlord', name: 'Iron Resolve', type: 'spell', cost: 3, emoji: '🛡️',
    text: 'Gain 5 Armor. Draw a card.', effects: [{ type: 'armor', amount: 5 }, { type: 'draw', count: 1 }] },
  { id: 'w_bastion', cls: 'warlord', name: 'Bastion Warden', type: 'minion', cost: 4, attack: 3, health: 5, emoji: '🏰',
    keywords: { taunt: true }, text: 'Battlecry: Gain 3 Armor.', battlecry: [{ type: 'armor', amount: 3 }] },
  { id: 'w_earthshatter', cls: 'warlord', name: 'Earthshatter', type: 'spell', cost: 5, emoji: '🌍',
    text: 'Deal 3 damage to all minions.', effects: [{ type: 'damage', amount: 3, to: 'allMinions' }] },
  { id: 'w_champion', cls: 'warlord', name: 'Iron Champion', type: 'minion', cost: 7, attack: 7, health: 7, emoji: '🦾',
    keywords: { rush: true } },

  // ---------- Stalker ----------
  { id: 's_hawk', cls: 'stalker', name: 'Hunting Hawk', type: 'minion', cost: 1, attack: 1, health: 1, emoji: '🦅',
    keywords: { charge: true } },
  { id: 's_pinning', cls: 'stalker', name: 'Pinning Shot', type: 'spell', cost: 1, emoji: '🎯',
    text: 'Deal 2 damage to a minion.', target: 'minion', effects: [{ type: 'damage', amount: 2, to: 'target' }] },
  { id: 's_snapjaw', cls: 'stalker', name: 'Snapjaw Croc', type: 'minion', cost: 2, attack: 2, health: 3, emoji: '🦎',
    text: 'Deathrattle: Deal 2 damage to the enemy hero.', deathrattle: [{ type: 'damage', amount: 2, to: 'enemyHero' }] },
  { id: 's_instinct', cls: 'stalker', name: "Scout's Instinct", type: 'spell', cost: 2, emoji: '👁️',
    text: 'Draw 2 cards.', effects: [{ type: 'draw', count: 2 }] },
  { id: 's_pack', cls: 'stalker', name: 'Call the Pack', type: 'spell', cost: 3, emoji: '🐺',
    text: 'Summon two 2/2 Dusk Wolves.', effects: [{ type: 'summon', card: 't_wolf', count: 2 }] },
  { id: 's_packmaster', cls: 'stalker', name: 'Packmaster', type: 'minion', cost: 4, attack: 4, health: 3, emoji: '🧔',
    text: 'Battlecry: Give a friendly minion +2/+2 and Taunt.', target: 'friendlyMinion',
    battlecry: [{ type: 'buff', attack: 2, health: 2, keywords: { taunt: true }, to: 'target' }] },
  { id: 's_twinarrows', cls: 'stalker', name: 'Twin Arrows', type: 'spell', cost: 4, emoji: '🏹',
    text: 'Deal 3 damage to two random enemy minions.',
    effects: [{ type: 'damage', amount: 3, to: 'randomEnemyMinion', times: 2, distinct: true }] },
  { id: 's_stag', cls: 'stalker', name: 'Thunderhoof Stag', type: 'minion', cost: 5, attack: 5, health: 4, emoji: '🦌',
    keywords: { rush: true } },

  // ---------- Oracle ----------
  { id: 'o_ward', cls: 'oracle', name: 'Ward of Light', type: 'spell', cost: 1, emoji: '🔆',
    text: 'Give a minion +2 Health. Draw a card.', target: 'minion',
    effects: [{ type: 'buff', health: 2, to: 'target' }, { type: 'draw', count: 1 }] },
  { id: 'o_candle', cls: 'oracle', name: 'Candle Keeper', type: 'minion', cost: 2, attack: 1, health: 3, emoji: '🕯️',
    text: 'At the end of your turn, restore 2 Health to your hero.',
    endOfTurn: [{ type: 'heal', amount: 2, to: 'ownHero' }] },
  { id: 'o_humbling', cls: 'oracle', name: 'Humbling Light', type: 'spell', cost: 3, emoji: '🙏',
    text: 'Destroy a minion with 3 or less Attack.', target: 'minion', targetFilter: { maxAttack: 3 },
    effects: [{ type: 'destroy', to: 'target' }] },
  { id: 'o_theft', cls: 'oracle', name: 'Thought Theft', type: 'spell', cost: 2, emoji: '🧠',
    text: "Copy 2 cards from your opponent's deck into your hand.", effects: [{ type: 'copyFromOpponentDeck', count: 2 }] },
  { id: 'o_hymnal', cls: 'oracle', name: 'Hymnal Guardian', type: 'minion', cost: 3, attack: 1, health: 5, emoji: '⛪',
    keywords: { taunt: true } },
  { id: 'o_judgment', cls: 'oracle', name: 'Final Judgment', type: 'spell', cost: 4, emoji: '☀️',
    text: 'Destroy a minion with 5 or more Attack.', target: 'minion', targetFilter: { minAttack: 5 },
    effects: [{ type: 'destroy', to: 'target' }] },
  { id: 'o_nova', cls: 'oracle', name: 'Radiant Nova', type: 'spell', cost: 6, emoji: '💫',
    text: 'Deal 2 damage to all enemies. Restore 2 Health to all friendly characters.',
    effects: [{ type: 'damage', amount: 2, to: 'allEnemies' }, { type: 'heal', amount: 2, to: 'allFriendly' }] },
  { id: 'o_seraph', cls: 'oracle', name: 'Divine Seraph', type: 'minion', cost: 7, attack: 5, health: 6, emoji: '👼',
    keywords: { taunt: true, lifesteal: true } },

  // ---------- Vanguard ----------
  { id: 'v_aegis', cls: 'vanguard', name: 'Aegis Blessing', type: 'spell', cost: 1, emoji: '✝️',
    text: 'Give a minion +1 Attack and Divine Shield.', target: 'minion',
    effects: [{ type: 'buff', attack: 1, keywords: { divineShield: true }, to: 'target' }] },
  { id: 'v_captain', cls: 'vanguard', name: 'Militia Captain', type: 'minion', cost: 2, attack: 2, health: 2, emoji: '🎖️',
    text: 'Battlecry: Summon a 1/1 Recruit.', battlecry: [{ type: 'summon', card: 't_recruit' }] },
  { id: 'v_shieldmaiden', cls: 'vanguard', name: 'Gleaming Shieldmaiden', type: 'minion', cost: 3, attack: 2, health: 3, emoji: '🛡️',
    keywords: { taunt: true, divineShield: true } },
  { id: 'v_banner', cls: 'vanguard', name: 'Rallying Banner', type: 'spell', cost: 4, emoji: '🚩',
    text: 'Give all friendly minions +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, to: 'allFriendlyMinions' }] },
  { id: 'v_hammer', cls: 'vanguard', name: 'Oathkeeper Hammer', type: 'weapon', cost: 4, attack: 3, durability: 3, emoji: '🔨' },
  { id: 'v_hallowed', cls: 'vanguard', name: 'Hallowed Ground', type: 'spell', cost: 5, emoji: '🌟',
    text: 'Deal 2 damage to all enemies.', effects: [{ type: 'damage', amount: 2, to: 'allEnemies' }] },
  { id: 'v_cavalier', cls: 'vanguard', name: 'Silverlance Cavalier', type: 'minion', cost: 5, attack: 4, health: 4, emoji: '🏇',
    keywords: { rush: true, divineShield: true } },
  { id: 'v_justicar', cls: 'vanguard', name: 'High Justicar', type: 'minion', cost: 7, attack: 6, health: 6, emoji: '👑',
    text: 'Battlecry: Give all other friendly minions +2/+2.',
    battlecry: [{ type: 'buff', attack: 2, health: 2, to: 'otherFriendlyMinions' }] },

  // ---------- Shade ----------
  { id: 'r_knife', cls: 'shade', name: 'Knife in the Dark', type: 'spell', cost: 0, emoji: '🌑',
    text: 'Deal 2 damage to an undamaged minion.', target: 'minion', targetFilter: { undamaged: true },
    effects: [{ type: 'damage', amount: 2, to: 'target' }] },
  { id: 'r_shiv', cls: 'shade', name: 'Shadow Shiv', type: 'spell', cost: 1, emoji: '🔪',
    text: 'Deal 1 damage. Draw a card.', target: 'any',
    effects: [{ type: 'damage', amount: 1, to: 'target' }, { type: 'draw', count: 1 }] },
  { id: 'r_oil', cls: 'shade', name: 'Nightshade Oil', type: 'spell', cost: 1, emoji: '🧪',
    text: 'Give your weapon +2 Attack.', requiresWeapon: true, effects: [{ type: 'buffWeapon', attack: 2 }] },
  { id: 'r_cutpurse', cls: 'shade', name: 'Alley Cutpurse', type: 'minion', cost: 2, attack: 2, health: 3, emoji: '🦹',
    text: 'Combo: Draw a card.', combo: [{ type: 'draw', count: 1 }] },
  { id: 'r_fadestep', cls: 'shade', name: 'Fade Step', type: 'spell', cost: 2, emoji: '💨',
    text: "Return a minion to its owner's hand.", target: 'minion', effects: [{ type: 'bounce', to: 'target' }] },
  { id: 'r_fan', cls: 'shade', name: 'Fan of Blades', type: 'spell', cost: 2, emoji: '🌀',
    text: 'Deal 1 damage to all enemy minions. Draw a card.',
    effects: [{ type: 'damage', amount: 1, to: 'allEnemyMinions' }, { type: 'draw', count: 1 }] },
  { id: 'r_prodigy', cls: 'shade', name: 'Gutter Prodigy', type: 'minion', cost: 3, attack: 3, health: 3, emoji: '🎭',
    text: 'Combo: Gain +2/+2 and Stealth.', combo: [{ type: 'buff', attack: 2, health: 2, keywords: { stealth: true }, to: 'self' }] },
  { id: 'r_contract', cls: 'shade', name: 'Silent Contract', type: 'spell', cost: 4, emoji: '📃',
    text: 'Destroy an enemy minion.', target: 'enemyMinion', effects: [{ type: 'destroy', to: 'target' }] },
];

export const CARDS = Object.fromEntries(RAW_CARDS.map(c => [c.id, { cls: 'neutral', keywords: {}, ...c }]));

export const KEYWORD_LABELS = {
  taunt: 'Taunt', charge: 'Charge', rush: 'Rush', divineShield: 'Divine Shield', windfury: 'Windfury',
  stealth: 'Stealth', lifesteal: 'Lifesteal', poisonous: 'Poisonous',
};

export const KEYWORD_HELP = {
  taunt: 'Enemies must attack this minion.',
  charge: 'Can attack immediately.',
  rush: 'Can attack minions immediately.',
  divineShield: 'The first time this takes damage, ignore it.',
  windfury: 'Can attack twice each turn.',
  stealth: "Can't be targeted by enemies until it attacks.",
  lifesteal: 'Damage dealt also heals your hero.',
  poisonous: 'Destroy any minion damaged by this.',
  spellDamage: 'Your spells deal extra damage.',
  battlecry: 'Does something when played from hand.',
  deathrattle: 'Does something when it dies.',
  combo: 'Bonus if you already played a card this turn.',
  adjacent: 'The minions directly to the left and right.',
  freeze: "Frozen characters lose their next attack.",
};

/** Full card text including keyword line, for display. */
export function cardText(card) {
  const kw = Object.keys(card.keywords || {}).filter(k => card.keywords[k]).map(k => KEYWORD_LABELS[k]);
  if (card.spellDamage) kw.push(`Spell Damage +${card.spellDamage}`);
  return [kw.join('. '), card.text].filter(Boolean).join('. ').replace(/\.\./g, '.');
}

export function collectibleCards(cls) {
  return Object.values(CARDS).filter(c => !c.token && (c.cls === cls || c.cls === 'neutral'));
}

/**
 * Build a 30-card deck: two copies of each class card (16) plus seven
 * neutral pairs (14) picked to give a reasonable mana curve.
 */
export function buildDeck(cls, rand = Math.random) {
  const classCards = Object.values(CARDS).filter(c => !c.token && c.cls === cls);
  const neutrals = Object.values(CARDS).filter(c => !c.token && c.cls === 'neutral');
  const pick = (pool, n) => {
    const copy = [...pool];
    const out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    return out;
  };
  const chosen = [
    ...pick(neutrals.filter(c => c.cost <= 2), 2),
    ...pick(neutrals.filter(c => c.cost >= 3 && c.cost <= 4), 3),
    ...pick(neutrals.filter(c => c.cost >= 5), 2),
  ];
  const ids = [];
  for (const c of [...classCards, ...chosen]) ids.push(c.id, c.id);
  return ids;
}
