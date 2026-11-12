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

/* RENDER UI (CALM 1-SECOND HEARTBEAT) */
function renderHeader() {
  const eraObj = ERAS.find((e) => e.id === state.era) || ERAS[0];
  document.getElementById('era-title').textContent = eraObj.name;
  document.body.classList.toggle('paper-mode', Boolean(state.paperMode));

  const caps = getResourceCaps();
  const rates = getNetRates();
  const ledger = document.getElementById('resource-ledger');

  const visibleRes = RESOURCES.filter((r) => getEraOrder(r.unlockedAt) <= getEraOrder(state.era));
  ledger.innerHTML = visibleRes
    .map((r) => {
      const val = Math.floor(state.resources[r.id] || 0);
      const cap = caps[r.id];
      const rate = rates[r.id] || 0;
      const rateStr = rate >= 0 ? `+${rate.toFixed(1)}/s` : `${rate.toFixed(1)}/s`;
      const rateClass = rate > 0 ? 'rate-pos' : rate < 0 ? 'rate-neg' : '';
      return `
        <div class="res-cell">
          <div class="res-cell-top">
            <span>${r.name}</span>
            <span class="tabular">${val}/${cap}</span>
          </div>
          <div class="res-cell-bottom">
            <span>${r.crafted ? 'Refined' : 'Raw'}</span>
            <span class="tabular ${rateClass}">${rateStr}</span>
          </div>
        </div>
      `;
    })
    .join('');
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

function renderAll() {
  renderHeader();
  renderEventBanner();
  renderSettlementTab();
  renderCraftAndTechTab();
  renderWorldTab();
  renderChronicleTab();
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
      Object.entries(g.gives).forEach(([resId, amt]) => {
        const gain = amt * toolBoost;
        state.resources[resId] = Math.min(caps[resId], (state.resources[resId] || 0) + gain);
      });
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
      renderAll();
      saveLocalState();
    }
    return;
  }

  if (btn.dataset.jobSub) {
    const jId = btn.dataset.jobSub;
    if ((state.jobs[jId] || 0) > 0) {
      state.jobs[jId] -= 1;
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
      Object.entries(c.outputs).forEach(([resId, amt]) => {
        state.resources[resId] = Math.min(caps[resId], (state.resources[resId] || 0) + amt);
      });
      renderAll();
      saveLocalState();
    }
    return;
  }

  // Auto-Craft Toggle
  if (btn.dataset.autocraft) {
    const cId = btn.dataset.autocraft;
    state.autoCraft[cId] = !state.autoCraft[cId];
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

// Theme Toggle
document.getElementById('btn-theme').addEventListener('click', () => {
  state.paperMode = !state.paperMode;
  renderHeader();
  saveLocalState();
});

// Bottom Navigation
document.getElementById('bottom-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.add('active');
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
