import {
  ERAS,
  RESOURCES,
  MANUAL_GATHER,
  JOBS,
  BUILDINGS,
  CRAFT_RECIPES,
  TECHS,
  WONDERS,
  MILITARY_UNITS,
  EXPEDITIONS,
  TRADE_ROUTES,
  HISTORICAL_EVENTS
} from './data.js';

const LOCAL_SAVE_KEY = 'idlenomics_save_v1';
const LOCAL_SUPA_CONFIG_KEY = 'idlenomics_supa_config_v1';

function createDefaultState() {
  const res = {};
  RESOURCES.forEach((r) => { res[r.id] = 0; });
  res.food = 25;
  res.wood = 20;

  const buildings = {};
  BUILDINGS.forEach((b) => { buildings[b.id] = 0; });

  const jobs = {};
  JOBS.forEach((j) => { jobs[j.id] = 0; });
  jobs.farmer = 1;

  const autoCraft = {};
  CRAFT_RECIPES.forEach((c) => { autoCraft[c.id] = false; });

  const wonders = {};
  WONDERS.forEach((w) => { wonders[w.id] = 0; });

  const units = {};
  MILITARY_UNITS.forEach((u) => { units[u.id] = 0; });

  return {
    era: 'stone',
    pop: 3,
    playtimeSeconds: 0,
    lastTick: Date.now(),
    landBonus: 0,
    paperMode: false,
    resources: res,
    buildings,
    jobs,
    techs: [],
    autoCraft,
    wonders,
    units,
    expeditionsCleared: 0,
    activeEvent: null,
    tutorialDone: false,
    tutorialStep: 0,
    logs: [
      { time: 'Year 1', msg: 'Your nomadic band settles beside a sheltered river valley.' }
    ]
  };
}

let state = loadLocalState();
let supaConfig = loadSupaConfig();

function loadLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    const base = createDefaultState();
    const mergedJobs = { ...base.jobs, ...(parsed.jobs || {}) };
    const mergedResources = { ...base.resources, ...(parsed.resources || {}) };

    // Auto-recover early saves where 0 workers were assigned and initial food drained
    const totalAssigned = Object.values(mergedJobs).reduce((a, b) => a + b, 0);
    if (totalAssigned === 0 && (parsed.pop || 3) >= 1) {
      mergedJobs.farmer = 1;
      if ((mergedResources.food || 0) < 25) {
        mergedResources.food = 25;
      }
    }

    return {
      ...base,
      ...parsed,
      resources: mergedResources,
      buildings: { ...base.buildings, ...(parsed.buildings || {}) },
      jobs: mergedJobs,
      autoCraft: { ...base.autoCraft, ...(parsed.autoCraft || {}) },
      wonders: { ...base.wonders, ...(parsed.wonders || {}) },
      units: { ...base.units, ...(parsed.units || {}) }
    };
  } catch (e) {
    return createDefaultState();
  }
}

function saveLocalState() {
  state.lastTick = Date.now();
  localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(state));
}

function loadSupaConfig() {
  try {
    const raw = localStorage.getItem(LOCAL_SUPA_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { url: '', key: '', syncKey: '' };
  } catch (e) {
    return { url: '', key: '', syncKey: '' };
  }
}

/* HELPERS & MULTIPLIERS */
function getEraOrder(eraId) {
  const found = ERAS.find((e) => e.id === eraId);
  return found ? found.order : 0;
}

function isUnlocked(item) {
  if (item.era && getEraOrder(item.era) > getEraOrder(state.era)) return false;
  if (item.reqTech && !state.techs.includes(item.reqTech)) return false;
  return true;
}

function getGlobalMultipliers() {
  const megaStages = state.wonders.megalith || 0;
  const zigStages = state.wonders.ziggurat || 0;
  const colStages = state.wonders.colossus || 0;
  const catStages = state.wonders.cathedral || 0;

  const allProdMult = 1 + (zigStages * 0.12) + (catStages * 0.20);
  const sciMult = allProdMult * (1 + megaStages * 0.10) * (state.techs.includes('alphabet') ? 1.25 : 1);
  const foodMult = allProdMult * (1 + megaStages * 0.10);
  const capMult = 1 + state.landBonus + (colStages * 0.20);

  let craftSpeed = 1;
  BUILDINGS.forEach((b) => {
    if (b.effects.craftSpeed && state.buildings[b.id] > 0) {
      craftSpeed += b.effects.craftSpeed * state.buildings[b.id];
    }
  });

  return { allProdMult, sciMult, foodMult, capMult, craftSpeed };
}

function getResourceCaps() {
  const { capMult } = getGlobalMultipliers();
  const caps = {};
  RESOURCES.forEach((r) => {
    let base = r.baseCap;
    BUILDINGS.forEach((b) => {
      if (b.effects.cap && b.effects.cap[r.id]) {
        base += b.effects.cap[r.id] * (state.buildings[b.id] || 0);
      }
    });
    caps[r.id] = Math.floor(base * capMult);
  });
  return caps;
}

function getMaxPop() {
  let max = 5;
  BUILDINGS.forEach((b) => {
    if (b.effects.maxPop) {
      max += b.effects.maxPop * (state.buildings[b.id] || 0);
    }
  });
  return max;
}

function getAssignedPop() {
  return Object.values(state.jobs).reduce((a, b) => a + b, 0);
}

function getNetRates() {
  const { allProdMult, sciMult, foodMult } = getGlobalMultipliers();
  const rates = {};
  RESOURCES.forEach((r) => { rates[r.id] = 0; });

  // Buildings passive production
  BUILDINGS.forEach((b) => {
    const count = state.buildings[b.id] || 0;
    if (count > 0 && b.effects.prod) {
      Object.entries(b.effects.prod).forEach(([resId, val]) => {
        rates[resId] += val * count;
      });
    }
  });

  // Jobs production
  JOBS.forEach((j) => {
    const workers = state.jobs[j.id] || 0;
    if (workers > 0 && j.prod) {
      Object.entries(j.prod).forEach(([resId, val]) => {
        let boost = 1;
        if (j.id === 'scholar' && state.techs.includes('philosophy')) boost = 1.4;
        rates[resId] += val * workers * boost;
      });
    }
  });

  // Apply wonder & tech multipliers
  Object.keys(rates).forEach((resId) => {
    if (resId === 'science') rates[resId] *= sciMult;
    else if (resId === 'food') rates[resId] *= foodMult;
    else rates[resId] *= allProdMult;
  });

  // Citizen food consumption (0.5 food/sec per citizen)
  rates.food -= state.pop * 0.5;

  return rates;
}

function getMilitaryStats() {
  const colStages = state.wonders.colossus || 0;
  const milMult = 1 + colStages * 0.15;
  let power = 0;
  let defense = 0;
  MILITARY_UNITS.forEach((u) => {
    const count = state.units[u.id] || 0;
    power += u.power * count;
    defense += u.defense * count;
  });
  return {
    power: Math.floor(power * milMult),
    defense: Math.floor(defense * milMult)
  };
}

function getScaledCost(baseCost, scale, count) {
  const out = {};
  Object.entries(baseCost).forEach(([resId, amt]) => {
    out[resId] = Math.ceil(amt * Math.pow(scale, count));
  });
  return out;
}

function canAfford(costObj) {
  return Object.entries(costObj).every(([resId, amt]) => (state.resources[resId] || 0) >= amt);
}

function payCost(costObj) {
  Object.entries(costObj).forEach(([resId, amt]) => {
    state.resources[resId] = Math.max(0, (state.resources[resId] || 0) - amt);
  });
}

function formatCost(costObj) {
  return Object.entries(costObj)
    .map(([resId, amt]) => {
      const r = RESOURCES.find((x) => x.id === resId);
      const cur = Math.floor(state.resources[resId] || 0);
      return `${r ? r.name : resId}: ${cur}/${amt}`;
    })
    .join(' | ');
}

function addLog(msg) {
  const year = Math.floor(state.playtimeSeconds / 15) + 1;
  state.logs.unshift({ time: `Yr ${year}`, msg });
  if (state.logs.length > 40) state.logs.pop();
}

/* SIMULATION & OFFLINE CALCULATION */
function simulateTicks(seconds, isOffline = false) {
  const clampedSeconds = Math.min(Math.max(0, Math.floor(seconds)), 604800); // Up to 7 days
  if (clampedSeconds <= 0) return;

  const rates = getNetRates();
  const caps = getResourceCaps();
  const maxPop = getMaxPop();

  Object.keys(rates).forEach((resId) => {
    const nextVal = (state.resources[resId] || 0) + rates[resId] * clampedSeconds;
    state.resources[resId] = Math.max(0, Math.min(caps[resId], nextVal));
  });

  // Population growth or starvation
  if (rates.food > 0 && state.resources.food > 15 && state.pop < maxPop) {
    const growthChance = Math.min(maxPop - state.pop, Math.floor(clampedSeconds / 25) || (Math.random() < 0.06 ? 1 : 0));
    if (growthChance > 0) {
      state.pop = Math.min(maxPop, state.pop + growthChance);
      if (!isOffline) addLog(`New settlers joined your settlement (Population: ${state.pop}).`);
    }
  }

  // Artisan Auto-Crafting
  const artisans = state.jobs.artisan || 0;
  if (artisans > 0) {
    const { craftSpeed } = getGlobalMultipliers();
    const craftCycles = Math.max(1, Math.floor((clampedSeconds * artisans * craftSpeed) / 4));
    CRAFT_RECIPES.forEach((rec) => {
      if (state.autoCraft[rec.id] && isUnlocked(rec)) {
        for (let i = 0; i < Math.min(craftCycles, 50); i++) {
          if (canAfford(rec.inputs)) {
            payCost(rec.inputs);
            Object.entries(rec.outputs).forEach(([outId, outAmt]) => {
              state.resources[outId] = Math.min(caps[outId], (state.resources[outId] || 0) + outAmt);
            });
          } else {
            break;
          }
        }
      }
    });
  }

  state.playtimeSeconds += clampedSeconds;

  // Trigger occasional calm historical dilemma
  if (!isOffline && !state.activeEvent && state.playtimeSeconds % 90 === 0) {
    const pick = HISTORICAL_EVENTS[Math.floor(Math.random() * HISTORICAL_EVENTS.length)];
    state.activeEvent = pick;
  }
}

function checkOfflineProgress() {
  const now = Date.now();
  const elapsedSec = Math.floor((now - (state.lastTick || now)) / 1000);
  if (elapsedSec >= 5) {
    simulateTicks(elapsedSec, true);
    const mins = Math.max(1, Math.floor(elapsedSec / 60));
    const badge = document.getElementById('offline-badge');
    badge.textContent = `+${elapsedSec < 60 ? elapsedSec + 's' : mins + 'm'} Offline`;
    badge.classList.remove('hidden');
    addLog(`Recovered ${elapsedSec}s of offline production while browser was closed.`);
    saveLocalState();
  }
}

let lastSkylineKey = '';

/* RENDER UI (CALM 1-SECOND HEARTBEAT) */
function renderCivStageBanner() {
  const artEl = document.getElementById('civ-stage-art');
  const capEl = document.getElementById('civ-stage-caption');
  if (!artEl || !capEl) return;

  const era = state.era || 'stone';
  const techCount = state.techs.length;
  const totalBuildings = Object.values(state.buildings).reduce((a, b) => a + b, 0);
  const totalWonders = Object.values(state.wonders).reduce((a, b) => a + b, 0);

  // Determine settlement evolution caption
  let stageLabel = 'Nomadic Riverbank Camp';
  if (era === 'stone') {
    if (techCount >= 3 || totalBuildings >= 3) stageLabel = 'Neolithic Timber Village';
    else if (techCount >= 1 || totalBuildings >= 1) stageLabel = 'Fledgling Hearth Settlement';
  } else if (era === 'bronze') {
    stageLabel = totalBuildings >= 5 ? 'Walled Bronze Citadel' : 'Smelting River Township';
  } else if (era === 'iron') {
    stageLabel = totalWonders >= 1 ? 'Monumental Iron Stronghold' : 'Forged Iron Bastion';
  } else if (era === 'classical') {
    stageLabel = 'Marble Aqueduct Metropolis';
  } else if (era === 'medieval') {
    stageLabel = totalWonders >= 3 ? 'Grand Sovereign Realm' : 'High Feudal Trade Capital';
  }
  capEl.textContent = `${stageLabel} • ${state.pop} Citizens • ${techCount} Techs`;

  // Dynamic elements that appear as the player builds & researches
  const huts = Math.min(5, Math.max(1, (state.buildings.hide_tent || 0) + (state.buildings.forager_hut || 0) + 1));
  const houses = Math.min(4, (state.buildings.mud_brick_hut || 0) + (state.buildings.granary || 0));
  const kilns = (state.buildings.smeltery || 0) + (state.buildings.copper_mine || 0);
  const hasAqueduct = (state.buildings.aqueduct || 0) > 0 || era === 'classical' || era === 'medieval';
  const hasGuild = (state.buildings.guild_hall || 0) > 0 || era === 'medieval';
  const hasStars = state.techs.includes('oral_tradition');
  const hasMegalith = (state.wonders.megalith || 0) > 0 || state.techs.includes('masonry');
  const hasZiggurat = (state.wonders.ziggurat || 0) > 0;
  const hasColossus = (state.wonders.colossus || 0) > 0;
  const hasCathedral = (state.wonders.cathedral || 0) > 0;

  const skylineKey = `${era}-${huts}-${houses}-${kilns}-${totalBuildings}-${hasAqueduct}-${hasGuild}-${hasStars}-${hasMegalith}-${hasZiggurat}-${hasColossus}-${hasCathedral}`;
  if (skylineKey === lastSkylineKey && artEl.innerHTML) return;
  lastSkylineKey = skylineKey;

  const eraPalettes = {
    stone: { sky1: '#233829', sky2: '#152219', hill1: '#2E4633', hill2: '#223326', river: '#3B7A78', sun: '#F0B45B' },
    bronze: { sky1: '#422E1E', sky2: '#241911', hill1: '#573D28', hill2: '#3B291B', river: '#4A8986', sun: '#F6C163' },
    iron: { sky1: '#273547', sky2: '#161E29', hill1: '#37485E', hill2: '#253242', river: '#5299A3', sun: '#E8A86B' },
    classical: { sky1: '#313552', sky2: '#1C1E30', hill1: '#45496E', hill2: '#2E314B', river: '#5DA9B8', sun: '#F7D37E' },
    medieval: { sky1: '#3A284F', sky2: '#1F162B', hill1: '#4F386B', hill2: '#342447', river: '#64B2C4', sun: '#F2BC6E' }
  };
  const pal = eraPalettes[era] || eraPalettes.stone;

  let structuresSvg = '';

  // Campfire & Stone Age tents
  structuresSvg += `<polygon points="75,48 85,32 95,48" fill="#B88456" stroke="#F2EFE6" stroke-width="0.8"/>`;
  if (huts >= 2) structuresSvg += `<polygon points="102,48 111,34 120,48" fill="#A6754B" stroke="#F2EFE6" stroke-width="0.7"/>`;
  if (huts >= 3) structuresSvg += `<polygon points="52,49 60,36 68,49" fill="#9E6D44" stroke="#F2EFE6" stroke-width="0.7"/>`;

  // Hearth fire glow (animated flicker)
  structuresSvg += `<circle cx="98" cy="47" r="3" fill="#F0B45B"/><circle class="svg-hearth-glow" cx="98" cy="47" r="6" fill="#F0B45B" opacity="0.28"/>`;

  // Granaries & Mudbrick Houses as player builds
  if (houses >= 1 || totalBuildings >= 2) {
    structuresSvg += `<rect x="135" y="36" width="18" height="12" fill="#C99366" stroke="#F2EFE6" stroke-width="0.7"/>`;
    structuresSvg += `<polygon points="133,36 144,29 155,36" fill="#8C583A"/>`;
  }
  if (houses >= 2 || totalBuildings >= 4) {
    structuresSvg += `<rect x="158" y="34" width="20" height="14" fill="#D4A074" stroke="#F2EFE6" stroke-width="0.7"/>`;
  }

  // Smeltery chimneys & drifting smoke in Bronze/Iron age
  if (kilns > 0 || getEraOrder(era) >= 1) {
    structuresSvg += `<rect x="190" y="28" width="12" height="20" fill="#7D5A46" stroke="#F2EFE6" stroke-width="0.7"/>`;
    structuresSvg += `<circle class="svg-smoke-1" cx="196" cy="22" r="3.5" fill="#D6D2C8" opacity="0.45"/>`;
    structuresSvg += `<circle class="svg-smoke-2" cx="201" cy="16" r="4.5" fill="#D6D2C8" opacity="0.3"/>`;
  }

  // Megalithic Standing Stones
  if (hasMegalith) {
    structuresSvg += `
      <rect x="25" y="33" width="5" height="15" fill="#9BA69E"/>
      <rect x="36" y="33" width="5" height="15" fill="#9BA69E"/>
      <rect x="23" y="30" width="20" height="4" fill="#B6C0B8"/>
    `;
  }

  // Ziggurat
  if (hasZiggurat) {
    structuresSvg += `
      <rect x="220" y="38" width="38" height="10" fill="#C99255"/>
      <rect x="226" y="30" width="26" height="8" fill="#DDA666"/>
      <rect x="232" y="23" width="14" height="7" fill="#F0B45B"/>
    `;
  }

  // Classical Aqueduct arches
  if (hasAqueduct) {
    structuresSvg += `
      <rect x="268" y="26" width="75" height="4" fill="#D8D2C5"/>
      <rect x="272" y="30" width="5" height="18" fill="#C2B9A7"/>
      <rect x="292" y="30" width="5" height="18" fill="#C2B9A7"/>
      <rect x="312" y="30" width="5" height="18" fill="#C2B9A7"/>
      <rect x="332" y="30" width="5" height="18" fill="#C2B9A7"/>
    `;
  }

  // Harbor Colossus / Guild Spires / Cathedral
  if (hasColossus) {
    structuresSvg += `<polygon points="365,48 370,18 375,48" fill="#F0B45B"/><circle class="svg-sun-halo" cx="370" cy="15" r="3.5" fill="#F7D37E"/>`;
  }
  if (hasGuild || hasCathedral) {
    structuresSvg += `
      <rect x="388" y="26" width="26" height="22" fill="#8E7CA6" stroke="#F2EFE6" stroke-width="0.7"/>
      <polygon points="388,26 401,10 414,26" fill="#B8A4D4"/>
    `;
  }

  const starsSvg = hasStars
    ? `<circle class="svg-star-twinkle" cx="45" cy="12" r="1.3" fill="#FFF"/><circle class="svg-star-twinkle-delayed" cx="115" cy="9" r="1.5" fill="#F7D37E"/><circle class="svg-star-twinkle" cx="170" cy="14" r="1.2" fill="#FFF"/><circle class="svg-star-twinkle-delayed" cx="290" cy="10" r="1.4" fill="#FFF"/>`
    : '';

  artEl.innerHTML = `
    <svg viewBox="0 0 460 56" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.sky1}" />
          <stop offset="100%" stop-color="${pal.sky2}" />
        </linearGradient>
      </defs>
      <rect width="460" height="56" fill="url(#skyGrad)" />
      ${starsSvg}
      <circle cx="425" cy="16" r="9" fill="${pal.sun}" opacity="0.88" />
      <circle class="svg-sun-halo" cx="425" cy="16" r="15" fill="${pal.sun}" opacity="0.18" />
      <path d="M0,44 Q90,24 195,40 T390,34 L460,42 L460,56 L0,56 Z" fill="${pal.hill1}" />
      <path d="M0,48 Q140,36 270,47 T460,45 L460,56 L0,56 Z" fill="${pal.hill2}" />
      <path class="svg-river-shimmer" d="M0,52 Q220,46 460,53 L460,56 L0,56 Z" fill="${pal.river}" opacity="0.85" />
      ${structuresSvg}
    </svg>
  `;
}

function renderHeader() {
  const eraObj = ERAS.find((e) => e.id === state.era) || ERAS[0];
  document.getElementById('era-title').textContent = eraObj.name;
  document.body.dataset.era = state.era || 'stone';
  document.body.classList.toggle('paper-mode', Boolean(state.paperMode));
  renderCivStageBanner();

  const caps = getResourceCaps();
  const rates = getNetRates();
  const ledger = document.getElementById('resource-ledger');

  const visibleRes = RESOURCES.filter((r) => getEraOrder(r.unlockedAt) <= getEraOrder(state.era));
  if (ledger.children.length !== visibleRes.length) {
    ledger.innerHTML = visibleRes
      .map(
        (r) => `
        <div class="res-cell" data-res-cell="${r.id}">
          <div class="res-cell-top">
            <span>${r.name}</span>
            <span class="tabular" data-res-val="${r.id}">0/0</span>
          </div>
          <div class="res-cell-bottom">
            <span>${r.crafted ? 'Refined' : 'Raw'}</span>
            <span class="tabular" data-res-rate="${r.id}">+0.0/s</span>
          </div>
          <div class="res-cell-fill" data-res-fill="${r.id}" style="width: 0%"></div>
        </div>
      `
      )
      .join('');
  }

  visibleRes.forEach((r) => {
    const val = Math.floor(state.resources[r.id] || 0);
    const cap = caps[r.id] || 1;
    const rate = rates[r.id] || 0;
    const pct = Math.min(100, Math.max(0, (val / cap) * 100));
    const rateStr = rate >= 0 ? `+${rate.toFixed(1)}/s` : `${rate.toFixed(1)}/s`;
    const rateClass = rate > 0 ? 'tabular rate-pos' : rate < 0 ? 'tabular rate-neg' : 'tabular';

    const valEl = ledger.querySelector(`[data-res-val="${r.id}"]`);
    const rateEl = ledger.querySelector(`[data-res-rate="${r.id}"]`);
    const fillEl = ledger.querySelector(`[data-res-fill="${r.id}"]`);
    if (valEl) valEl.textContent = `${val}/${cap}`;
    if (rateEl) {
      rateEl.textContent = rateStr;
      rateEl.className = rateClass;
    }
    if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;
  });
}

function renderEventBanner() {
  const banner = document.getElementById('event-banner');
  if (!state.activeEvent) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const ev = state.activeEvent;
  banner.innerHTML = `
    <div class="event-title">CHRONICLE DILEMMA: ${ev.title}</div>
    <div class="row-sub">${ev.text}</div>
    <div class="btn-row">
      ${ev.choices
        .map(
          (c, idx) => `
          <button class="btn-brutal accent-ochre" data-event-choice="${idx}" type="button">
            ${c.label}
          </button>
        `
        )
        .join('')}
    </div>
  `;
}

function renderSettlementTab() {
  // Manual gather buttons
  const gatherGrid = document.getElementById('gather-grid');
  gatherGrid.innerHTML = MANUAL_GATHER.filter((g) => isUnlocked(g))
    .map(
      (g) => `
      <button class="btn-brutal" data-gather="${g.id}" type="button">
        <div>${g.label}</div>
        <div class="label-muted">${g.desc}</div>
      </button>
    `
    )
    .join('');

  // Population & Labor
  const maxPop = getMaxPop();
  const assigned = getAssignedPop();
  const idle = Math.max(0, state.pop - assigned);
  document.getElementById('pop-summary').textContent = `Pop: ${state.pop}/${maxPop} | Idle: ${idle}`;

  const workerList = document.getElementById('worker-list');
  workerList.innerHTML = JOBS.filter((j) => isUnlocked(j))
    .map((j) => {
      const count = state.jobs[j.id] || 0;
      return `
        <div class="row-item">
          <div class="row-info">
            <div class="row-title">${j.name} (${count})</div>
            <div class="row-sub">${j.desc}</div>
          </div>
          <div class="row-actions">
            <button class="btn-brutal btn-step" data-job-sub="${j.id}" ${count <= 0 ? 'disabled' : ''} type="button">-1</button>
            <button class="btn-brutal btn-step" data-job-add="${j.id}" ${idle <= 0 ? 'disabled' : ''} type="button">+1</button>
          </div>
        </div>
      `;
    })
    .join('');

  // Buildings
  const bList = document.getElementById('building-list');
  bList.innerHTML = BUILDINGS.filter((b) => isUnlocked(b))
    .map((b) => {
      const count = state.buildings[b.id] || 0;
      const cost = getScaledCost(b.cost, b.costScale, count);
      const affordable = canAfford(cost);
      return `
        <div class="row-item">
          <div class="row-info">
            <div class="row-title">${b.name} [${count}]</div>
            <div class="row-sub">${b.desc}</div>
            <div class="row-cost tabular">${formatCost(cost)}</div>
          </div>
          <div class="row-actions">
            <button class="btn-brutal ${affordable ? 'accent-moss' : ''}" data-build="${b.id}" ${!affordable ? 'disabled' : ''} type="button">
              Build
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderCraftAndTechTab() {
  const artisans = state.jobs.artisan || 0;
  document.getElementById('artisan-bonus-label').textContent = `Artisans Assigned: ${artisans}`;

  const craftList = document.getElementById('craft-list');
  const unlockedRecipes = CRAFT_RECIPES.filter((c) => isUnlocked(c));
  if (unlockedRecipes.length === 0) {
    craftList.innerHTML = `<div class="empty-row">Research Flint Toolmaking below to unlock your first multi-step crafting chain.</div>`;
  } else {
    craftList.innerHTML = unlockedRecipes
      .map((c) => {
        const affordable = canAfford(c.inputs);
        const isAuto = Boolean(state.autoCraft[c.id]);
        return `
          <div class="row-item">
            <div class="row-info">
              <div class="row-title">${c.name}</div>
              <div class="row-sub">${c.desc}</div>
              <div class="row-cost tabular">${formatCost(c.inputs)}</div>
            </div>
            <div class="row-actions">
              <button class="btn-brutal" data-craft="${c.id}" ${!affordable ? 'disabled' : ''} type="button">Craft</button>
              <button class="btn-brutal ${isAuto ? 'accent-moss' : ''}" data-autocraft="${c.id}" type="button">
                Auto: ${isAuto ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const techList = document.getElementById('tech-list');
  const availableTechs = TECHS.filter((t) => !state.techs.includes(t.id) && isUnlocked(t));
  if (availableTechs.length === 0) {
    techList.innerHTML = `<div class="empty-row">All available technologies for this era have been mastered.</div>`;
  } else {
    techList.innerHTML = availableTechs
      .map((t) => {
        const affordable = canAfford(t.cost);
        return `
          <div class="row-item">
            <div class="row-info">
              <div class="row-title">${t.name}</div>
              <div class="row-sub">${t.desc}</div>
              <div class="row-cost tabular">${formatCost(t.cost)}</div>
            </div>
            <div class="row-actions">
              <button class="btn-brutal ${affordable ? 'accent-ochre' : ''}" data-tech="${t.id}" ${!affordable ? 'disabled' : ''} type="button">
                Research
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

function renderWorldTab() {
  // Wonders
  const wonderList = document.getElementById('wonder-list');
  const unlockedWonders = WONDERS.filter((w) => isUnlocked(w));
  if (unlockedWonders.length === 0) {
    wonderList.innerHTML = `<div class="empty-row">Research Ashlar Masonry to begin constructing monumental Wonders.</div>`;
  } else {
    wonderList.innerHTML = unlockedWonders
      .map((w) => {
        const stage = state.wonders[w.id] || 0;
        const done = stage >= w.stages;
        const cost = getScaledCost(w.stageCost, 1.45, stage);
        const affordable = !done && canAfford(cost);
        return `
          <div class="row-item">
            <div class="row-info">
              <div class="row-title">${w.name} [Stage ${stage}/${w.stages}]</div>
              <div class="row-sub">${w.desc}</div>
              <div class="row-cost tabular">${done ? 'MONUMENT COMPLETED' : formatCost(cost)}</div>
            </div>
            <div class="row-actions">
              <button class="btn-brutal ${affordable ? 'accent-moss' : ''}" data-wonder="${w.id}" ${!affordable || done ? 'disabled' : ''} type="button">
                ${done ? 'Built' : 'Build Stage'}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Military
  const mil = getMilitaryStats();
  document.getElementById('military-summary').textContent = `Power: ${mil.power} | Defense: ${mil.defense}`;

  const unitList = document.getElementById('unit-list');
  unitList.innerHTML = MILITARY_UNITS.filter((u) => isUnlocked(u))
    .map((u) => {
      const count = state.units[u.id] || 0;
      const affordable = canAfford(u.cost);
      return `
        <div class="row-item">
          <div class="row-info">
            <div class="row-title">${u.name} (${count})</div>
            <div class="row-sub">${u.desc}</div>
            <div class="row-cost tabular">${formatCost(u.cost)}</div>
          </div>
          <div class="row-actions">
            <button class="btn-brutal" data-unit="${u.id}" ${!affordable ? 'disabled' : ''} type="button">Train</button>
          </div>
        </div>
      `;
    })
    .join('');

  const expList = document.getElementById('expedition-list');
  expList.innerHTML = EXPEDITIONS.map((ex) => {
    const canRun = mil.power >= ex.reqPower && canAfford(ex.cost);
    return `
      <div class="row-item">
        <div class="row-info">
          <div class="row-title">${ex.name} (Req Power: ${ex.reqPower})</div>
          <div class="row-sub">${ex.rewardText}</div>
          <div class="row-cost tabular">${formatCost(ex.cost)}</div>
        </div>
        <div class="row-actions">
          <button class="btn-brutal ${canRun ? 'accent-ochre' : ''}" data-expedition="${ex.id}" ${!canRun ? 'disabled' : ''} type="button">
            Launch
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Trade routes
  const tradeList = document.getElementById('trade-list');
  const unlockedTrades = TRADE_ROUTES.filter((tr) => isUnlocked(tr));
  if (unlockedTrades.length === 0) {
    tradeList.innerHTML = `<div class="empty-row">Research Kiln Pottery or Pack Caravans to establish trade routes.</div>`;
  } else {
    tradeList.innerHTML = unlockedTrades
      .map((tr) => {
        const affordable = canAfford(tr.give);
        return `
          <div class="row-item">
            <div class="row-info">
              <div class="row-title">${tr.name}</div>
              <div class="row-sub">${tr.desc}</div>
              <div class="row-cost tabular">${formatCost(tr.give)}</div>
            </div>
            <div class="row-actions">
              <button class="btn-brutal" data-trade="${tr.id}" ${!affordable ? 'disabled' : ''} type="button">Trade</button>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

function renderChronicleTab() {
  const mins = Math.floor(state.playtimeSeconds / 60);
  document.getElementById('playtime-label').textContent = `Playtime: ${mins}m (${state.playtimeSeconds}s)`;

  const mults = getGlobalMultipliers();
  document.getElementById('stats-summary').innerHTML = `
    <div>Techs Researched: <strong>${state.techs.length}/${TECHS.length}</strong></div>
    <div>Territory Bonus: <strong>+${Math.round(state.landBonus * 100)}% Caps</strong></div>
    <div>Science Multiplier: <strong>${mults.sciMult.toFixed(2)}x</strong></div>
    <div>Crafting Speed: <strong>${mults.craftSpeed.toFixed(2)}x</strong></div>
  `;

  const logList = document.getElementById('log-list');
  logList.innerHTML = state.logs
    .map((l) => `<div class="log-entry"><strong>[${l.time}]</strong> ${l.msg}</div>`)
    .join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === tabId);
  });
}

/* INTERACTIVE TUTORIAL SYSTEM */
const TUTORIAL_STEPS = [
  {
    badge: 'WELCOME GREETING',
    title: 'Hello & Welcome to Idlenomics!',
    body: 'Your nomadic band has just settled beside a sheltered river valley at the dawn of the Stone Age. Together, we will guide your fledgling camp into a thriving civilization across the ages.',
    hint: 'Tap "Start Tour →" below for a quick walkthrough of your controls!',
    nextLabel: 'Start Tour →',
    tab: 'tab-settlement',
    selector: '#civ-stage-banner'
  },
  {
    badge: 'STEP 1 OF 6',
    title: '1. Resource Ledger & Net Rates',
    body: 'This top ledger tracks your stockpiles, storage caps, and per-second production rates. Each citizen consumes 0.5 Food/s—1 Farmer is already pre-assigned so your Food grows steadily.',
    hint: 'Tip: Watch your +Food/s and +Wood/s rates in green.',
    tab: 'tab-settlement',
    selector: '#resource-ledger'
  },
  {
    badge: 'STEP 2 OF 6',
    title: '2. Manual Gathering',
    body: 'Touch any gathering button to collect raw materials by hand. Early in the Stone Age, manual foraging gives you a quick burst of Food, Wood, Hide, and Stone.',
    hint: 'Action: Tap "Forage Roots" (or press Next) to continue!',
    tab: 'tab-settlement',
    selector: 'button[data-gather="forage_food"]'
  },
  {
    badge: 'STEP 3 OF 6',
    title: '3. Population & Labor Assignment',
    body: 'Your settlement starts with 3 Citizens (1 Farmer, 2 Idle). Assign idle citizens to Woodcutter or Stonecutter so resources accumulate automatically while you are away.',
    hint: 'Action: Tap "+1" on Woodcutter or Farmer to assign an idle worker!',
    tab: 'tab-settlement',
    selector: 'button[data-job-add="woodcutter"]'
  },
  {
    badge: 'STEP 4 OF 6',
    title: '4. Structures & Settlement Growth',
    body: 'Structures provide passive production and raise your Population & Storage Caps. As you construct buildings and advance eras, the settlement landscape banner at the top visually evolves!',
    hint: 'Gather Wood & Stone to construct Shelters, Camps, and Timber Yards.',
    tab: 'tab-settlement',
    selector: '#building-list'
  },
  {
    badge: 'STEP 5 OF 6',
    title: '5. Technologies, Crafting & Eras',
    body: 'Open the Craft & Tech tab to research breakthroughs like Oral Tradition and Flint Toolmaking. Researching Era milestones advances your civilization into the Bronze, Iron, Classical, and Medieval Ages.',
    hint: 'Researching "Oral Tradition" (35 Food, 25 Wood) unlocks Science!',
    tab: 'tab-craft',
    selector: '#tech-list'
  },
  {
    badge: 'STEP 6 OF 6',
    title: '6. Wonders, Expeditions & Cloud Vault',
    body: 'Explore the World tab to train garrisons, annex territory, and build monumental Wonders. Use the Vault tab anytime to back up your save string or sync 10 cloud snapshots via Supabase.',
    hint: 'You can replay this guide anytime via the "? Guide" button at the top.',
    nextLabel: 'Finish Guide ✓',
    tab: 'tab-world',
    selector: '#bottom-nav'
  }
];

function renderTutorial() {
  const layer = document.getElementById('tutorial-layer');
  if (!layer) return;

  // Clear previous highlights
  document.querySelectorAll('.tutorial-highlight').forEach((el) => {
    el.classList.remove('tutorial-highlight');
  });

  if (state.tutorialDone) {
    layer.classList.add('hidden');
    return;
  }

  const stepIdx = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, state.tutorialStep || 0));
  const step = TUTORIAL_STEPS[stepIdx];
  layer.classList.remove('hidden');

  document.getElementById('tutorial-step-badge').textContent = step.badge || `STEP ${stepIdx} OF ${TUTORIAL_STEPS.length - 1}`;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-body').textContent = step.body;
  document.getElementById('tutorial-hint').textContent = step.hint;

  const prevBtn = document.getElementById('btn-tutorial-prev');
  const nextBtn = document.getElementById('btn-tutorial-next');
  prevBtn.disabled = stepIdx === 0;
  prevBtn.style.opacity = stepIdx === 0 ? '0.4' : '1';
  nextBtn.textContent = step.nextLabel || (stepIdx === TUTORIAL_STEPS.length - 1 ? 'Finish Guide ✓' : 'Next →');

  const target = step.selector ? document.querySelector(step.selector) : null;
  const card = document.getElementById('tutorial-card');
  const arrow = document.getElementById('tutorial-arrow');

  if (target) {
    target.classList.add('tutorial-highlight');
    const rect = target.getBoundingClientRect();
    const vh = window.innerHeight;
    const cardHeight = card.offsetHeight || 195;

    // Position card below target if target is in upper half, otherwise above target
    if (rect.bottom + cardHeight + 24 < vh || rect.top < vh * 0.45) {
      const topPos = Math.min(vh - cardHeight - 12, Math.max(12, rect.bottom + 14));
      card.style.top = `${topPos}px`;
      card.style.bottom = 'auto';
      arrow.className = 'tutorial-arrow arrow-up';
    } else {
      const bottomPos = Math.min(vh - 12, Math.max(14, vh - rect.top + 14));
      card.style.bottom = `${bottomPos}px`;
      card.style.top = 'auto';
      arrow.className = 'tutorial-arrow arrow-down';
    }

    // Align arrow horizontally toward target center
    const cardRect = card.getBoundingClientRect();
    const targetCenter = rect.left + rect.width / 2;
    const arrowLeft = Math.max(18, Math.min((cardRect.width || 320) - 32, targetCenter - cardRect.left - 7));
    arrow.style.left = `${arrowLeft}px`;
  } else {
    card.style.top = 'auto';
    card.style.bottom = '76px';
    arrow.className = 'tutorial-arrow hidden';
  }
}

function goToTutorialStep(nextIdx) {
  if (nextIdx >= TUTORIAL_STEPS.length) {
    state.tutorialDone = true;
    saveLocalState();
    renderTutorial();
    return;
  }
  state.tutorialStep = Math.max(0, nextIdx);
  const step = TUTORIAL_STEPS[state.tutorialStep];
  if (step && step.tab) {
    switchTab(step.tab);
  }
  saveLocalState();
  renderAll();
  const target = step ? document.querySelector(step.selector) : null;
  if (target && target.scrollIntoView) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setTimeout(renderTutorial, 60);
}

function renderAll() {
  renderHeader();
  renderEventBanner();
  renderSettlementTab();
  renderCraftAndTechTab();
  renderWorldTab();
  renderChronicleTab();
  renderTutorial();
}

function spawnFloatingFeedback(anchorEl, text, variant = '') {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const badge = document.createElement('div');
  badge.className = `floating-feedback ${variant}`.trim();
  badge.textContent = text;
  badge.style.left = `${rect.left + rect.width / 2}px`;
  badge.style.top = `${rect.top + 8}px`;
  document.body.appendChild(badge);
  setTimeout(() => badge.remove(), 900);
}

/* USER INTERACTIONS */
document.getElementById('workspace').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const caps = getResourceCaps();

  // Manual Gather
  if (btn.dataset.gather) {
    const g = MANUAL_GATHER.find((x) => x.id === btn.dataset.gather);
    if (g) {
      const toolBoost = state.techs.includes('toolmaking') ? 1.5 : 1;
      const parts = [];
      Object.entries(g.gives).forEach(([resId, amt]) => {
        const gain = amt * toolBoost;
        state.resources[resId] = Math.min(caps[resId], (state.resources[resId] || 0) + gain);
        const rName = RESOURCES.find((r) => r.id === resId)?.name || resId;
        if (gain >= 1) parts.push(`+${Number.isInteger(gain) ? gain : gain.toFixed(1)} ${rName}`);
      });
      spawnFloatingFeedback(btn, parts.join('  ') || '+Gathered');
      if (!state.tutorialDone && state.tutorialStep === 2) {
        state.tutorialStep = 3;
      }
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Worker +1 / -1
  if (btn.dataset.jobAdd) {
    const jId = btn.dataset.jobAdd;
    if (state.pop - getAssignedPop() > 0) {
      state.jobs[jId] = (state.jobs[jId] || 0) + 1;
      const jobObj = JOBS.find((x) => x.id === jId);
      spawnFloatingFeedback(btn, `+1 ${jobObj ? jobObj.name : 'Worker'}`);
      if (!state.tutorialDone && state.tutorialStep === 3) {
        state.tutorialStep = 4;
      }
      renderAll();
      saveLocalState();
    }
    return;
  }

  if (btn.dataset.jobSub) {
    const jId = btn.dataset.jobSub;
    if ((state.jobs[jId] || 0) > 0) {
      state.jobs[jId] -= 1;
      spawnFloatingFeedback(btn, `-1 Worker`, 'ochre');
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Build Structure
  if (btn.dataset.build) {
    const b = BUILDINGS.find((x) => x.id === btn.dataset.build);
    if (b) {
      const count = state.buildings[b.id] || 0;
      const cost = getScaledCost(b.cost, b.costScale, count);
      if (canAfford(cost)) {
        payCost(cost);
        state.buildings[b.id] = count + 1;
        spawnFloatingFeedback(btn, `Built ${b.name}!`);
        addLog(`Constructed ${b.name} (Total: ${count + 1}).`);
        renderAll();
        saveLocalState();
      }
    }
    return;
  }

  // Manual Craft
  if (btn.dataset.craft) {
    const c = CRAFT_RECIPES.find((x) => x.id === btn.dataset.craft);
    if (c && canAfford(c.inputs)) {
      payCost(c.inputs);
      const craftedText = [];
      Object.entries(c.outputs).forEach(([resId, amt]) => {
        state.resources[resId] = Math.min(caps[resId], (state.resources[resId] || 0) + amt);
        const rName = RESOURCES.find((r) => r.id === resId)?.name || resId;
        craftedText.push(`+${amt} ${rName}`);
      });
      spawnFloatingFeedback(btn, craftedText.join(' '));
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Auto-Craft Toggle
  if (btn.dataset.autocraft) {
    const cId = btn.dataset.autocraft;
    state.autoCraft[cId] = !state.autoCraft[cId];
    spawnFloatingFeedback(btn, state.autoCraft[cId] ? 'Auto: ON' : 'Auto: OFF', 'ochre');
    renderAll();
    saveLocalState();
    return;
  }

  // Research Tech
  if (btn.dataset.tech) {
    const t = TECHS.find((x) => x.id === btn.dataset.tech);
    if (t && canAfford(t.cost)) {
      payCost(t.cost);
      state.techs.push(t.id);
      spawnFloatingFeedback(btn, `Researched ${t.name}!`, 'ochre');
      if (t.unlocksEra) {
        state.era = t.unlocksEra;
        const eraObj = ERAS.find((er) => er.id === t.unlocksEra);
        addLog(`EPOCH MILESTONE: Entered the ${eraObj ? eraObj.name : t.unlocksEra}!`);
      } else {
        addLog(`Researched technology: ${t.name}.`);
      }
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Wonder Stage
  if (btn.dataset.wonder) {
    const w = WONDERS.find((x) => x.id === btn.dataset.wonder);
    if (w) {
      const stage = state.wonders[w.id] || 0;
      const cost = getScaledCost(w.stageCost, 1.45, stage);
      if (stage < w.stages && canAfford(cost)) {
        payCost(cost);
        state.wonders[w.id] = stage + 1;
        spawnFloatingFeedback(btn, `${w.name} Stage ${stage + 1}!`, 'ochre');
        addLog(`Completed Stage ${stage + 1}/${w.stages} of ${w.name}!`);
        renderAll();
        saveLocalState();
      }
    }
    return;
  }

  // Train Military Unit
  if (btn.dataset.unit) {
    const u = MILITARY_UNITS.find((x) => x.id === btn.dataset.unit);
    if (u && canAfford(u.cost)) {
      payCost(u.cost);
      state.units[u.id] = (state.units[u.id] || 0) + 1;
      addLog(`Trained ${u.name}.`);
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Launch Expedition
  if (btn.dataset.expedition) {
    const ex = EXPEDITIONS.find((x) => x.id === btn.dataset.expedition);
    const mil = getMilitaryStats();
    if (ex && mil.power >= ex.reqPower && canAfford(ex.cost)) {
      payCost(ex.cost);
      Object.entries(ex.loot).forEach(([k, v]) => {
        if (k === 'landBonus') {
          state.landBonus += v;
        } else {
          state.resources[k] = Math.min(caps[k] || 9999, (state.resources[k] || 0) + v);
        }
      });
      state.expeditionsCleared += 1;
      addLog(`Expedition victorious: ${ex.name} (${ex.rewardText}).`);
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Trade Route
  if (btn.dataset.trade) {
    const tr = TRADE_ROUTES.find((x) => x.id === btn.dataset.trade);
    if (tr && canAfford(tr.give)) {
      payCost(tr.give);
      Object.entries(tr.receive).forEach(([resId, amt]) => {
        state.resources[resId] = Math.min(caps[resId] || 9999, (state.resources[resId] || 0) + amt);
      });
      addLog(`Completed trade caravan: ${tr.name}.`);
      renderAll();
      saveLocalState();
    }
  }
});

// Event Banner Decisions
document.getElementById('event-banner').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-event-choice]');
  if (!btn || !state.activeEvent) return;
  const idx = Number(btn.dataset.eventChoice);
  const choice = state.activeEvent.choices[idx];
  const caps = getResourceCaps();

  if (choice.cost && !canAfford(choice.cost)) {
    addLog(`Could not afford event option; dilemma passed.`);
    state.activeEvent = null;
    renderAll();
    return;
  }
  if (choice.cost) payCost(choice.cost);

  if (choice.checkDefense) {
    const mil = getMilitaryStats();
    if (mil.defense >= choice.checkDefense) {
      Object.entries(choice.passGain || {}).forEach(([k, v]) => {
        state.resources[k] = Math.min(caps[k], (state.resources[k] || 0) + v);
      });
      addLog(`Garrison repelled the raid! Earned spoils.`);
    } else {
      Object.entries(choice.failLoss || {}).forEach(([k, v]) => {
        state.resources[k] = Math.max(0, (state.resources[k] || 0) - v);
      });
      addLog(`Garrison was overwhelmed during the raid.`);
    }
  } else if (choice.gain) {
    Object.entries(choice.gain).forEach(([k, v]) => {
      state.resources[k] = Math.min(caps[k], (state.resources[k] || 0) + v);
    });
    addLog(`Resolved event: ${state.activeEvent.title}.`);
  }

  state.activeEvent = null;
  renderAll();
  saveLocalState();
});

// Theme Toggle & Tutorial Controls
document.getElementById('btn-theme').addEventListener('click', () => {
  state.paperMode = !state.paperMode;
  renderHeader();
  saveLocalState();
});

document.getElementById('btn-tutorial').addEventListener('click', () => {
  state.tutorialDone = false;
  goToTutorialStep(0);
});

document.getElementById('btn-tutorial-prev').addEventListener('click', () => {
  goToTutorialStep((state.tutorialStep || 0) - 1);
});

document.getElementById('btn-tutorial-next').addEventListener('click', () => {
  goToTutorialStep((state.tutorialStep || 0) + 1);
});

document.getElementById('btn-tutorial-skip').addEventListener('click', () => {
  state.tutorialDone = true;
  saveLocalState();
  renderTutorial();
});

// Bottom Navigation
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
  renderTutorial();
});

/* SUPABASE VAULT (OPTION A + C: PASSPHRASE + 10-SNAPSHOT TIME MACHINE) */
function initVaultInputs() {
  document.getElementById('input-supa-url').value = supaConfig.url || '';
  document.getElementById('input-supa-key').value = supaConfig.key || '';
  document.getElementById('input-sync-key').value = supaConfig.syncKey || '';
}

function setSyncStatus(msg) {
  document.getElementById('sync-status').textContent = msg;
}

function readVaultInputs() {
  supaConfig = {
    url: document.getElementById('input-supa-url').value.trim().replace(/\/$/, ''),
    key: document.getElementById('input-supa-key').value.trim(),
    syncKey: document.getElementById('input-sync-key').value.trim()
  };
  localStorage.setItem(LOCAL_SUPA_CONFIG_KEY, JSON.stringify(supaConfig));
  return supaConfig;
}

document.getElementById('btn-save-config').addEventListener('click', () => {
  readVaultInputs();
  setSyncStatus('Credentials Saved Locally');
});

async function pushCloudSnapshot() {
  const cfg = readVaultInputs();
  if (!cfg.url || !cfg.key || !cfg.syncKey) {
    setSyncStatus('Missing URL, Key, or Passphrase');
    return;
  }
  setSyncStatus('Pushing Snapshot...');
  try {
    const eraObj = ERAS.find((e) => e.id === state.era) || ERAS[0];
    const res = await fetch(`${cfg.url}/rest/v1/civilization_saves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        sync_key: cfg.syncKey,
        era_name: eraObj.name,
        playtime_seconds: state.playtimeSeconds,
        game_state: state
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setSyncStatus('Snapshot Saved to Supabase');
    await fetchSnapshotList(true);
  } catch (err) {
    setSyncStatus(`Sync Error: ${err.message}`);
  }
}

async function fetchSnapshotList(pruneOld = false) {
  const cfg = readVaultInputs();
  if (!cfg.url || !cfg.key || !cfg.syncKey) {
    setSyncStatus('Missing URL, Key, or Passphrase');
    return;
  }
  setSyncStatus('Fetching Snapshots...');
  try {
    const query = `${cfg.url}/rest/v1/civilization_saves?sync_key=eq.${encodeURIComponent(cfg.syncKey)}&select=id,era_name,playtime_seconds,created_at,game_state&order=created_at.desc&limit=20`;
    const res = await fetch(query, {
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    // Rolling 10-Snapshot Pruner
    if (pruneOld && rows.length > 10) {
      const staleIds = rows.slice(10).map((r) => r.id);
      await fetch(`${cfg.url}/rest/v1/civilization_saves?id=in.(${staleIds.join(',')})`, {
        method: 'DELETE',
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`
        }
      });
    }

    const latest10 = rows.slice(0, 10);
    const listEl = document.getElementById('snapshot-list');
    if (latest10.length === 0) {
      listEl.innerHTML = `<div class="empty-row">No snapshots found for passphrase "${cfg.syncKey}".</div>`;
    } else {
      listEl.innerHTML = latest10
        .map((row, idx) => {
          const dt = new Date(row.created_at).toLocaleString();
          const mins = Math.floor((row.playtime_seconds || 0) / 60);
          return `
            <div class="row-item">
              <div class="row-info">
                <div class="row-title">#${idx + 1} — ${row.era_name} (${mins}m played)</div>
                <div class="row-sub tabular">${dt}</div>
              </div>
              <div class="row-actions">
                <button class="btn-brutal accent-ochre" data-restore-idx="${idx}" type="button">Restore</button>
              </div>
            </div>
          `;
        })
        .join('');

      listEl.querySelectorAll('button[data-restore-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = latest10[Number(btn.dataset.restoreIdx)];
          if (picked && picked.game_state) {
            state = {
              ...createDefaultState(),
              ...picked.game_state,
              lastTick: Date.now()
            };
            addLog(`Restored Time Machine snapshot from ${new Date(picked.created_at).toLocaleTimeString()}.`);
            saveLocalState();
            renderAll();
            setSyncStatus('Snapshot Restored');
          }
        });
      });
    }
    setSyncStatus(`Loaded ${latest10.length} Snapshot(s)`);
  } catch (err) {
    setSyncStatus(`Load Error: ${err.message}`);
  }
}

document.getElementById('btn-cloud-push').addEventListener('click', pushCloudSnapshot);
document.getElementById('btn-cloud-fetch').addEventListener('click', () => fetchSnapshotList(false));

// Local Export / Import / Reset
document.getElementById('btn-export-save').addEventListener('click', () => {
  const box = document.getElementById('save-string-box');
  box.value = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  box.select();
  navigator.clipboard?.writeText(box.value);
  setSyncStatus('Save String Copied');
});

document.getElementById('btn-import-save').addEventListener('click', () => {
  const raw = document.getElementById('save-string-box').value.trim();
  if (!raw) return;
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(raw))));
    state = { ...createDefaultState(), ...decoded, lastTick: Date.now() };
    saveLocalState();
    renderAll();
    setSyncStatus('Save String Imported');
  } catch (e) {
    setSyncStatus('Invalid Save String');
  }
});

document.getElementById('btn-hard-reset').addEventListener('click', () => {
  if (confirm('Wipe local civilization and restart in the Stone Age?')) {
    state = createDefaultState();
    saveLocalState();
    renderAll();
    setSyncStatus('Local Save Reset');
  }
});

/* LIFECYCLE & 1-SECOND HEARTBEAT */
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkOfflineProgress();
    renderAll();
  } else {
    saveLocalState();
  }
});

initVaultInputs();
checkOfflineProgress();
renderAll();

setInterval(() => {
  simulateTicks(1, false);
  saveLocalState();
  renderAll();
}, 1000);
