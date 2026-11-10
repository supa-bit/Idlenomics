export const ERAS = [
  { id: 'stone', name: 'Stone Age', order: 0 },
  { id: 'bronze', name: 'Bronze Age', order: 1 },
  { id: 'iron', name: 'Iron Age', order: 2 },
  { id: 'classical', name: 'Classical Age', order: 3 },
  { id: 'medieval', name: 'Medieval Age', order: 4 }
];

export const RESOURCES = [
  { id: 'food', name: 'Food', baseCap: 250, unlockedAt: 'stone' },
  { id: 'wood', name: 'Wood', baseCap: 250, unlockedAt: 'stone' },
  { id: 'stone', name: 'Stone', baseCap: 200, unlockedAt: 'stone' },
  { id: 'hide', name: 'Hide', baseCap: 120, unlockedAt: 'stone' },
  { id: 'tools', name: 'Tools', baseCap: 80, unlockedAt: 'stone', crafted: true },
  { id: 'science', name: 'Science', baseCap: 300, unlockedAt: 'stone' },
  { id: 'ore', name: 'Ore', baseCap: 200, unlockedAt: 'bronze' },
  { id: 'bronze', name: 'Bronze', baseCap: 100, unlockedAt: 'bronze', crafted: true },
  { id: 'cutStone', name: 'Cut Stone', baseCap: 120, unlockedAt: 'bronze', crafted: true },
  { id: 'coal', name: 'Coal', baseCap: 200, unlockedAt: 'iron' },
  { id: 'iron', name: 'Iron Bars', baseCap: 120, unlockedAt: 'iron', crafted: true },
  { id: 'gold', name: 'Gold', baseCap: 500, unlockedAt: 'classical' },
  { id: 'parchment', name: 'Parchment', baseCap: 120, unlockedAt: 'classical', crafted: true },
  { id: 'steel', name: 'Steel', baseCap: 120, unlockedAt: 'medieval', crafted: true }
];

export const MANUAL_GATHER = [
  { id: 'forage_food', label: 'Forage Roots', gives: { food: 3, hide: 0.4 }, desc: '+3 Food (+Hide chance)' },
  { id: 'gather_wood', label: 'Gather Deadwood', gives: { wood: 3 }, desc: '+3 Wood' },
  { id: 'chip_stone', label: 'Knap Flint', gives: { stone: 2 }, desc: '+2 Stone' },
  { id: 'observe_stars', label: 'Study Sky', gives: { science: 1.5 }, desc: '+1.5 Science', reqTech: 'oral_tradition' }
];

export const JOBS = [
  { id: 'farmer', name: 'Farmer', era: 'stone', prod: { food: 1.6 }, desc: '+1.6 Food/s (Citizens eat 0.5 Food/s)' },
  { id: 'woodcutter', name: 'Woodcutter', era: 'stone', prod: { wood: 1.1 }, desc: '+1.1 Wood/s' },
  { id: 'quarrier', name: 'Stonecutter', era: 'stone', prod: { stone: 0.8 }, desc: '+0.8 Stone/s' },
  { id: 'hunter', name: 'Trapper', era: 'stone', reqTech: 'hunting_traps', prod: { food: 0.7, hide: 0.45 }, desc: '+0.7 Food/s, +0.45 Hide/s' },
  { id: 'scholar', name: 'Elder / Scribe', era: 'stone', reqTech: 'oral_tradition', prod: { science: 0.6 }, desc: '+0.6 Science/s' },
  { id: 'artisan', name: 'Artisan', era: 'stone', reqTech: 'toolmaking', prod: {}, desc: 'Powers Auto-Crafting chains each tick' },
  { id: 'miner', name: 'Ore Miner', era: 'bronze', reqTech: 'copper_mining', prod: { ore: 0.75 }, desc: '+0.75 Ore/s' },
  { id: 'coal_miner', name: 'Collier', era: 'iron', reqTech: 'iron_working', prod: { coal: 0.7 }, desc: '+0.7 Coal/s' }
];

export const BUILDINGS = [
  {
    id: 'hide_tent',
    name: 'Hide Shelter',
    era: 'stone',
    cost: { wood: 15, hide: 4 },
    costScale: 1.22,
    effects: { maxPop: 3 },
    desc: '+3 Max Population'
  },
  {
    id: 'forager_hut',
    name: 'Forager Camp',
    era: 'stone',
    cost: { wood: 20, stone: 10 },
    costScale: 1.2,
    effects: { prod: { food: 0.8, hide: 0.15 } },
    desc: '+0.8 Food/s, +0.15 Hide/s'
  },
  {
    id: 'lumber_pile',
    name: 'Timber Yard',
    era: 'stone',
    cost: { wood: 25, stone: 15 },
    costScale: 1.22,
    effects: { prod: { wood: 0.9 }, cap: { wood: 150 } },
    desc: '+0.9 Wood/s, +150 Wood Cap'
  },
  {
    id: 'granary',
    name: 'Earthen Granary',
    era: 'stone',
    reqTech: 'pottery',
    cost: { wood: 35, stone: 30 },
    costScale: 1.25,
    effects: { cap: { food: 250, hide: 80 } },
    desc: '+250 Food Cap, +80 Hide Cap'
  },
  {
    id: 'mud_brick_hut',
    name: 'Mudbrick House',
    era: 'bronze',
    cost: { wood: 50, stone: 45, tools: 4 },
    costScale: 1.25,
    effects: { maxPop: 6 },
    desc: '+6 Max Population'
  },
  {
    id: 'copper_mine',
    name: 'Deep Mine Shaft',
    era: 'bronze',
    reqTech: 'copper_mining',
    cost: { wood: 70, stone: 60, tools: 6 },
    costScale: 1.25,
    effects: { prod: { ore: 0.9, stone: 0.5 }, cap: { ore: 150, stone: 150 } },
    desc: '+0.9 Ore/s, +0.5 Stone/s, +150 Ore/Stone Cap'
  },
  {
    id: 'smeltery',
    name: 'Kiln Smeltery',
    era: 'bronze',
    reqTech: 'bronze_working',
    cost: { stone: 90, ore: 35, bronze: 5 },
    costScale: 1.28,
    effects: { craftSpeed: 0.25, cap: { bronze: 60, iron: 60 } },
    desc: '+25% Crafting Output, +60 Metal Caps'
  },
  {
    id: 'library',
    name: 'Scriptorium',
    era: 'iron',
    reqTech: 'alphabet',
    cost: { wood: 110, cutStone: 15, bronze: 12 },
    costScale: 1.26,
    effects: { prod: { science: 1.5 }, cap: { science: 250 } },
    desc: '+1.5 Science/s, +250 Science Cap'
  },
  {
    id: 'aqueduct',
    name: 'Stone Aqueduct',
    era: 'classical',
    reqTech: 'engineering',
    cost: { cutStone: 35, iron: 20, tools: 20 },
    costScale: 1.3,
    effects: { maxPop: 10, prod: { food: 3.5 } },
    desc: '+10 Max Population, +3.5 Food/s'
  },
  {
    id: 'guild_hall',
    name: 'Medieval Guild Hall',
    era: 'medieval',
    reqTech: 'feudalism',
    cost: { cutStone: 60, steel: 15, parchment: 20 },
    costScale: 1.32,
    effects: { prod: { gold: 1.2, science: 2.5 }, craftSpeed: 0.4 },
    desc: '+1.2 Gold/s, +2.5 Science/s, +40% Crafting Output'
  }
];

export const CRAFT_RECIPES = [
  {
    id: 'craft_tools',
    name: 'Knap Primitive Tools',
    era: 'stone',
    reqTech: 'toolmaking',
    inputs: { wood: 10, stone: 10, hide: 3 },
    outputs: { tools: 2 },
    desc: '10 Wood + 10 Stone + 3 Hide -> 2 Tools'
  },
  {
    id: 'craft_bronze',
    name: 'Smelt Bronze Alloy',
    era: 'bronze',
    reqTech: 'bronze_working',
    inputs: { ore: 12, wood: 15 },
    outputs: { bronze: 2 },
    desc: '12 Ore + 15 Wood -> 2 Bronze'
  },
  {
    id: 'craft_cut_stone',
    name: 'Dress Cut Stone',
    era: 'bronze',
    reqTech: 'masonry',
    inputs: { stone: 20, tools: 1 },
    outputs: { cutStone: 2 },
    desc: '20 Stone + 1 Tool -> 2 Cut Stone'
  },
  {
    id: 'craft_iron',
    name: 'Smelt Iron Bars',
    era: 'iron',
    reqTech: 'iron_working',
    inputs: { ore: 16, coal: 10 },
    outputs: { iron: 2 },
    desc: '16 Ore + 10 Coal -> 2 Iron Bars'
  },
  {
    id: 'craft_parchment',
    name: 'Prepare Parchment',
    era: 'classical',
    reqTech: 'philosophy',
    inputs: { hide: 12, wood: 10 },
    outputs: { parchment: 2 },
    desc: '12 Hide + 10 Wood -> 2 Parchment'
  },
  {
    id: 'craft_steel',
    name: 'Forge Crucible Steel',
    era: 'medieval',
    reqTech: 'metallurgy',
    inputs: { iron: 4, coal: 18 },
    outputs: { steel: 2 },
    desc: '4 Iron Bars + 18 Coal -> 2 Steel'
  }
];

export const TECHS = [
  {
    id: 'oral_tradition',
    name: 'Oral Tradition',
    era: 'stone',
    cost: { food: 35, wood: 25 },
    desc: 'Unlocks Elders/Scribes and Sky Observation for Science.'
  },
  {
    id: 'hunting_traps',
    name: 'Snare Trapping',
    era: 'stone',
    reqTech: 'oral_tradition',
    cost: { science: 20, wood: 40 },
    desc: 'Unlocks Trapper job for steady Hide and Food.'
  },
  {
    id: 'toolmaking',
    name: 'Flint Toolmaking',
    era: 'stone',
    reqTech: 'oral_tradition',
    cost: { science: 35, stone: 45, hide: 10 },
    desc: 'Unlocks Tool Crafting, Artisans, and +50% manual gathering.'
  },
  {
    id: 'pottery',
    name: 'Kiln Pottery',
    era: 'stone',
    reqTech: 'toolmaking',
    cost: { science: 50, stone: 60, wood: 60 },
    desc: 'Unlocks Earthen Granary to prevent Food spoilage.'
  },
  {
    id: 'copper_mining',
    name: 'Dawn of the Bronze Age',
    era: 'stone',
    reqTech: 'pottery',
    cost: { science: 90, tools: 10, food: 120 },
    unlocksEra: 'bronze',
    desc: 'Advances civilization to the Bronze Age; unlocks Ore & Miners.'
  },
  {
    id: 'bronze_working',
    name: 'Bronze Metallurgy',
    era: 'bronze',
    reqTech: 'copper_mining',
    cost: { science: 130, ore: 50, wood: 100 },
    desc: 'Unlocks Bronze Smelting, Kiln Smelteries, and Bronze Spearmen.'
  },
  {
    id: 'masonry',
    name: 'Ashlar Masonry',
    era: 'bronze',
    reqTech: 'bronze_working',
    cost: { science: 160, stone: 150, bronze: 10 },
    desc: 'Unlocks Cut Stone crafting and Megalithic Wonder construction.'
  },
  {
    id: 'caravan_trade',
    name: 'Pack Caravans',
    era: 'bronze',
    reqTech: 'bronze_working',
    cost: { science: 180, food: 180, bronze: 12 },
    desc: 'Unlocks Diplomacy & Trade Routes in the World tab.'
  },
  {
    id: 'iron_working',
    name: 'Dawn of the Iron Age',
    era: 'bronze',
    reqTech: 'masonry',
    cost: { science: 260, bronze: 28, cutStone: 20 },
    unlocksEra: 'iron',
    desc: 'Advances to the Iron Age; unlocks Coal, Colliers, and Iron Bars.'
  },
  {
    id: 'alphabet',
    name: 'Phonetic Script',
    era: 'iron',
    reqTech: 'iron_working',
    cost: { science: 320, iron: 14, hide: 50 },
    desc: 'Unlocks Scriptoriums and +25% global Science output.'
  },
  {
    id: 'engineering',
    name: 'Dawn of the Classical Age',
    era: 'iron',
    reqTech: 'alphabet',
    cost: { science: 450, iron: 35, cutStone: 40 },
    unlocksEra: 'classical',
    desc: 'Advances to the Classical Age; unlocks Gold, Aqueducts & Imperial Trade.'
  },
  {
    id: 'philosophy',
    name: 'Natural Philosophy',
    era: 'classical',
    reqTech: 'engineering',
    cost: { science: 580, cutStone: 50, gold: 40 },
    desc: 'Unlocks Parchment crafting and boosts Scholar output by +40%.'
  },
  {
    id: 'feudalism',
    name: 'Dawn of the Medieval Age',
    era: 'classical',
    reqTech: 'philosophy',
    cost: { science: 800, parchment: 30, iron: 60, gold: 100 },
    unlocksEra: 'medieval',
    desc: 'Advances to the Medieval Age; unlocks Guild Halls and Chivalric Orders.'
  },
  {
    id: 'metallurgy',
    name: 'Blast Furnace Steel',
    era: 'medieval',
    reqTech: 'feudalism',
    cost: { science: 1000, iron: 70, coal: 120, parchment: 40 },
    desc: 'Unlocks Crucible Steel crafting and Grand Cathedral construction.'
  }
];

export const WONDERS = [
  {
    id: 'megalith',
    name: 'Megalithic Ring',
    era: 'stone',
    reqTech: 'masonry',
    stages: 3,
    stageCost: { stone: 120, cutStone: 8, tools: 8 },
    desc: 'Each stage grants +10% global Science & Food production.'
  },
  {
    id: 'ziggurat',
    name: 'Great Terraced Ziggurat',
    era: 'bronze',
    reqTech: 'bronze_working',
    stages: 4,
    stageCost: { cutStone: 20, bronze: 16, food: 200 },
    desc: 'Each stage grants +12% all raw resource gathering rates.'
  },
  {
    id: 'colossus',
    name: 'Harbor Colossus',
    era: 'classical',
    reqTech: 'engineering',
    stages: 5,
    stageCost: { cutStone: 40, bronze: 35, iron: 25 },
    desc: 'Each stage increases Storage Caps by +20% and Military Power by +15%.'
  },
  {
    id: 'cathedral',
    name: 'Grand Stone Cathedral',
    era: 'medieval',
    reqTech: 'metallurgy',
    stages: 5,
    stageCost: { cutStone: 60, steel: 25, parchment: 30, gold: 120 },
    desc: 'Monumental pinnacle of the Medieval Age; +20% all output per stage.'
  }
];

export const MILITARY_UNITS = [
  {
    id: 'militia',
    name: 'Stone Club Militia',
    era: 'stone',
    cost: { food: 35, wood: 20, tools: 2 },
    power: 4,
    defense: 6,
    desc: 'Power: 4 | Defense: 6'
  },
  {
    id: 'spearman',
    name: 'Bronze Phalanx',
    era: 'bronze',
    reqTech: 'bronze_working',
    cost: { food: 60, bronze: 6, wood: 30 },
    power: 12,
    defense: 15,
    desc: 'Power: 12 | Defense: 15'
  },
  {
    id: 'swordsman',
    name: 'Iron Legionary',
    era: 'iron',
    reqTech: 'iron_working',
    cost: { food: 90, iron: 8, hide: 20 },
    power: 28,
    defense: 25,
    desc: 'Power: 28 | Defense: 25'
  },
  {
    id: 'knight',
    name: 'Heavy Feudal Knight',
    era: 'medieval',
    reqTech: 'metallurgy',
    cost: { food: 150, steel: 10, gold: 45 },
    power: 65,
    defense: 55,
    desc: 'Power: 65 | Defense: 55'
  }
];

export const EXPEDITIONS = [
  {
    id: 'scout_valley',
    name: 'Annex Fertile Riverbank',
    reqPower: 10,
    cost: { food: 60 },
    rewardText: '+10% Storage Caps & +35 Wood/Stone',
    loot: { wood: 35, stone: 35, landBonus: 0.1 }
  },
  {
    id: 'clear_raiders',
    name: 'Pacify Hilltop Raiders',
    reqPower: 35,
    cost: { food: 120, tools: 5 },
    rewardText: '+15% Storage Caps & +25 Ore / +10 Bronze',
    loot: { ore: 25, bronze: 10, landBonus: 0.15 }
  },
  {
    id: 'ancient_ruins',
    name: 'Excavate Sunken Citadel',
    reqPower: 90,
    cost: { food: 200, iron: 8 },
    rewardText: '+20% Storage Caps, +80 Science & +50 Gold',
    loot: { science: 80, gold: 50, landBonus: 0.2 }
  }
];

export const TRADE_ROUTES = [
  {
    id: 'barter_hide',
    name: 'River Nomads Barter',
    reqTech: 'pottery',
    give: { food: 80, wood: 60 },
    receive: { hide: 25, stone: 40 },
    desc: 'Give 80 Food & 60 Wood -> Receive 25 Hide & 40 Stone'
  },
  {
    id: 'merchant_tin',
    name: 'Tin Caravan Exchange',
    reqTech: 'caravan_trade',
    give: { tools: 8, hide: 30 },
    receive: { ore: 55, science: 25 },
    desc: 'Give 8 Tools & 30 Hide -> Receive 55 Ore & 25 Science'
  },
  {
    id: 'silk_road',
    name: 'Maritime Charter',
    reqTech: 'engineering',
    give: { bronze: 15, cutStone: 15 },
    receive: { gold: 65, coal: 50 },
    desc: 'Give 15 Bronze & 15 Cut Stone -> Receive 65 Gold & 50 Coal'
  }
];

export const HISTORICAL_EVENTS = [
  {
    id: 'wandering_smith',
    title: 'Wandering Artisan Seeking Shelter',
    text: 'A weary toolmaker offers his craft techniques in exchange for provisions.',
    choices: [
      { label: 'Share 35 Food (+15 Science, +3 Tools)', cost: { food: 35 }, gain: { science: 15, tools: 3 } },
      { label: 'Turn Away (+10 Wood)', cost: {}, gain: { wood: 10 } }
    ]
  },
  {
    id: 'bountiful_harvest',
    title: 'Alluvial Floodplain Silt',
    text: 'Seasonal river flooding leaves rich dark sediment across your fields.',
    choices: [
      { label: 'Harvest Surplus (+65 Food)', cost: {}, gain: { food: 65 } },
      { label: 'Study Soil Cycles (+25 Science)', cost: {}, gain: { science: 25 } }
    ]
  },
  {
    id: 'border_skirmish',
    title: 'Outrider Raid at Dusk',
    text: 'Nomadic scouts test your perimeter defenses near the storehouses.',
    choices: [
      { label: 'Rally Garrison (+20 Science if Def >= 12, else -30 Food)', checkDefense: 12, passGain: { science: 20, hide: 12 }, failLoss: { food: 30 } },
      { label: 'Pay Tribute (-25 Wood)', cost: { wood: 25 }, gain: {} }
    ]
  }
];
