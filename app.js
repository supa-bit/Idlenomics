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
import * as economy from './simulation.js';
import { initSettings } from './settings.js';
import { initInsightsUI, formatDuration } from './insights-ui.js';
import { OPENING_MILESTONES, evaluateOpeningSession, getVisibleResources } from './opening-guide.js';
import { WorldBackdropRenderer } from './world-canvas.js';

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
    claimedMilestones: [],
    openingDismissed: false,
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
    const validMilestones = Array.isArray(parsed.claimedMilestones)
      ? parsed.claimedMilestones.filter((id) => OPENING_MILESTONES.some((m) => m.id === id))
      : [];

    return {
      ...base,
      ...parsed,
      resources: mergedResources,
      buildings: { ...base.buildings, ...(parsed.buildings || {}) },
      jobs: mergedJobs,
      autoCraft: { ...base.autoCraft, ...(parsed.autoCraft || {}) },
      wonders: { ...base.wonders, ...(parsed.wonders || {}) },
      units: { ...base.units, ...(parsed.units || {}) },
      claimedMilestones: validMilestones,
      openingDismissed: Boolean(parsed.openingDismissed)
    };
  } catch (e) {
    return createDefaultState();
  }
}

function saveLocalState() {
  economy.advanceTo(state, Date.now());
  try {
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(state));
    document.dispatchEvent(new CustomEvent('local-save-status',{detail:'Saved on this device · '+new Date().toLocaleTimeString()}));
    return true;
  } catch {
    document.dispatchEvent(new CustomEvent('local-save-status',{detail:'Save failed. Export a backup now; device storage may be unavailable or full.'}));
    return false;
  }
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

function getGlobalMultipliers() { return economy.getGlobalMultipliers(state); }

function getResourceCaps() { return economy.getResourceCaps(state); }

function getMaxPop() { return economy.getMaxPop(state); }

function getAssignedPop() {
  return Object.values(state.jobs).reduce((a, b) => a + b, 0);
}

function getNetRates() { return economy.getNetRates(state); }

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

let insightsUI = null;

/* SIMULATION & OFFLINE CALCULATION */
function checkOfflineProgress(autoOpenModal = true) {
  const result = economy.advanceTo(state, Date.now());
  if (result.seconds >= 5 && result.summary) {
    const seconds = result.seconds;
    const totalBatches = Object.values(result.summary.batches || {}).reduce((a, b) => a + b, 0);
    const parts = [`Simulated ${formatDuration(seconds)} (${seconds}s) of away progress.`];
    if (result.summary.popGained > 0) parts.push(`+${result.summary.popGained} settler(s) joined.`);
    if (totalBatches > 0) parts.push(`${totalBatches} auto-craft batch(es) completed.`);
    if (result.capped) parts.push('Offline progress is limited to 7 days.');
    addLog(parts.join(' '));
    insightsUI?.recordReturnSummary(result.summary, autoOpenModal && seconds >= 15);
    saveLocalState();
  }
  return result;
}

const worldBackdrop = new WorldBackdropRenderer('world-bg-canvas');

/* RENDER UI (CALM 1-SECOND HEARTBEAT) */
function renderCivStageBanner() {
  worldBackdrop.updateState(state);

  const capEl = document.getElementById('civ-stage-caption');
  if (!capEl) return;

  const era = state.era || 'stone';
  const techCount = state.techs.length;
  const totalBuildings = Object.values(state.buildings).reduce((a, b) => a + b, 0);
  const totalWonders = Object.values(state.wonders).reduce((a, b) => a + b, 0);

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
}

function renderHeader() {
  const eraObj = ERAS.find((e) => e.id === state.era) || ERAS[0];
  document.getElementById('era-title').textContent = eraObj.name;
  document.body.dataset.era = state.era || 'stone';
  document.body.classList.toggle('paper-mode', Boolean(state.paperMode));
  renderCivStageBanner();

  const caps = getResourceCaps();
  const rates = getNetRates();
  const diag = economy.getEconomyDiagnostics(state);
  const ledger = document.getElementById('resource-ledger');

  const visibleRes = getVisibleResources(state, RESOURCES, getEraOrder);
  const currentSignature = visibleRes.map((r) => r.id).join(',');
  if (ledger.dataset.resSignature !== currentSignature) {
    ledger.dataset.resSignature = currentSignature;
    ledger.innerHTML = visibleRes
      .map(
        (r) => `
        <div class="res-cell" data-res-cell="${r.id}" role="button" tabindex="0" title="Click to inspect ${r.name} production, consumption & bottlenecks">
          <div class="res-cell-top">
            <span>${r.name}</span>
            <span class="tabular" data-res-val="${r.id}">0/0</span>
          </div>
          <div class="res-cell-bottom">
            <span data-res-meta="${r.id}">${r.crafted ? 'Refined' : 'Raw'}</span>
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
    const rd = diag.resources[r.id];
    const pct = Math.min(100, Math.max(0, (val / cap) * 100));
    const rateStr = rate >= 0 ? `+${rate.toFixed(1)}/s` : `${rate.toFixed(1)}/s`;
    const rateClass = rate > 0 ? 'tabular rate-pos' : rate < 0 ? 'tabular rate-neg' : 'tabular';

    const cellEl = ledger.querySelector(`[data-res-cell="${r.id}"]`);
    const valEl = ledger.querySelector(`[data-res-val="${r.id}"]`);
    const metaEl = ledger.querySelector(`[data-res-meta="${r.id}"]`);
    const rateEl = ledger.querySelector(`[data-res-rate="${r.id}"]`);
    const fillEl = ledger.querySelector(`[data-res-fill="${r.id}"]`);
    if (valEl) valEl.textContent = `${val}/${cap}`;
    if (metaEl && rd) {
      let tag = r.crafted ? 'Refined' : 'Raw';
      if (rd.atCap && (rd.passiveNet > 0 || rd.potentialCraftOutput > 0)) tag = 'Full Cap';
      else if (rd.passiveNet < 0) tag = 'Draining';
      else if (rd.potentialCraftDemand > 0 || rd.potentialCraftOutput > 0) {
        const cNet = rd.potentialCraftOutput - rd.potentialCraftDemand;
        tag = `Craft ${cNet >= 0 ? '+' : ''}${cNet.toFixed(1)}/s`;
      }
      metaEl.textContent = tag;
    }
    if (cellEl && rd) {
      cellEl.classList.toggle('res-cell-warn', rd.bottlenecks.length > 0);
    }
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
  const diag = economy.getEconomyDiagnostics(state);
  const popDiag = diag.population;
  const maxPop = popDiag.max;
  const idle = popDiag.idle;
  const growthTag = popDiag.status === 'growing'
    ? `Growing ${popDiag.growthSeconds}/${popDiag.secondsRequired}s`
    : popDiag.status === 'housing_full'
    ? 'Housing Full'
    : 'Growth Paused';
  document.getElementById('pop-summary').textContent = `Pop: ${state.pop}/${maxPop} | Idle: ${idle} · ${growthTag}`;
  document.getElementById('pop-summary').title = popDiag.explanation;

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
  const diag = economy.getEconomyDiagnostics(state);
  document.getElementById('artisan-bonus-label').textContent = `Artisans: ${artisans} · ${(artisans * getGlobalMultipliers().craftSpeed / 4).toFixed(2)} cycles/s per enabled recipe · pauses when inputs or output space run out`;

  const craftList = document.getElementById('craft-list');
  const unlockedRecipes = CRAFT_RECIPES.filter((c) => isUnlocked(c));
  if (unlockedRecipes.length === 0) {
    craftList.innerHTML = `<div class="empty-row">Research Flint Toolmaking below to unlock your first multi-step crafting chain.</div>`;
  } else {
    craftList.innerHTML = unlockedRecipes
      .map((c) => {
        const affordable = canAfford(c.inputs);
        const isAuto = Boolean(state.autoCraft[c.id]);
        const rDiag = diag.recipes[c.id];
        const statusClass = rDiag && isAuto && rDiag.status !== 'running' ? 'rate-neg' : 'label-muted';
        return `
          <div class="row-item">
            <div class="row-info">
              <div class="row-title">${c.name}</div>
              <div class="row-sub">${c.desc}</div>
              <div class="row-cost tabular">${formatCost(c.inputs)}</div>
              ${rDiag ? `<div class="row-sub ${statusClass}" data-recipe-diag="${c.id}">${rDiag.explanation}</div>` : ''}
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
  logList.replaceChildren(...state.logs.map(log=>{
    const row=document.createElement('div');row.className='log-entry';
    const time=document.createElement('strong');time.textContent=`[${log.time}]`;
    row.append(time,document.createTextNode(' '+log.msg));return row;
  }));
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === tabId);
  });
}

function renderOpeningArcCard() {
  const card = document.getElementById('opening-arc-card');
  if (!card) return;

  const caps = getResourceCaps();
  const status = evaluateOpeningSession(state, caps, addLog, spawnFloatingFeedback);

  // Hide if dismissed or if all milestones are done and player is beyond Stone Age
  if (state.openingDismissed || (status.allDone && state.era !== 'stone')) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const stepsPills = OPENING_MILESTONES.map((m) => {
    const done = state.claimedMilestones.includes(m.id);
    const current = status.activeMilestone && status.activeMilestone.id === m.id;
    const cls = done ? 'arc-step-pill done' : current ? 'arc-step-pill active' : 'arc-step-pill';
    return `<span class="${cls}" title="${m.stepNum}. ${m.title}">${done ? '✓' : m.stepNum}</span>`;
  }).join('');

  if (status.allDone) {
    const bronzeTech = TECHS.find((t) => t.id === 'copper_mining');
    const bronzeCost = bronzeTech ? formatCost(bronzeTech.cost) : '';
    card.innerHTML = `
      <div class="opening-arc-head">
        <div class="opening-arc-title-wrap">
          <span class="badge-inline">FOUNDER'S PATH COMPLETE · 7/7</span>
          <strong>Ready for the Dawn of the Bronze Age!</strong>
        </div>
        <div class="opening-arc-controls">
          <div class="arc-step-strip">${stepsPills}</div>
          <button type="button" class="btn-small" data-opening-dismiss="1">Dismiss ×</button>
        </div>
      </div>
      <div class="opening-arc-body">
        <div class="opening-arc-info">
          <div class="row-sub">Your river camp has grown into a self-sustaining Neolithic village with steady Food, Timber, Stone, Science, and Tools. Research <strong>Dawn of the Bronze Age</strong> in Craft &amp; Tech to enter the next epoch!</div>
          <div class="row-cost tabular">Next Epoch Milestone: ${bronzeCost}</div>
        </div>
        <div class="opening-arc-actions">
          <button type="button" class="btn-brutal accent-ochre" data-opening-focus="tab-craft" data-opening-selector='button[data-tech="copper_mining"]'>Open Bronze Age Tech →</button>
        </div>
      </div>
    `;
    return;
  }

  const m = status.activeMilestone;
  const prog = m.progress(state);
  const pct = prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;

  card.innerHTML = `
    <div class="opening-arc-head">
      <div class="opening-arc-title-wrap">
        <span class="opening-arc-badge">${m.badge}</span>
        <strong class="opening-arc-title">${m.stepNum}. ${m.title}</strong>
      </div>
      <div class="opening-arc-controls">
        <div class="arc-step-strip" aria-label="Opening milestone progress">${stepsPills}</div>
        <button type="button" class="btn-small" data-opening-dismiss="1" title="Hide Founder's Path tracker (reopen anytime via ? Guide)">Hide</button>
      </div>
    </div>
    <div class="opening-arc-body">
      <div class="opening-arc-info">
        <div class="opening-arc-goal">${m.goalText}</div>
        <div class="row-sub">${m.whyText}</div>
        <div class="opening-arc-meta">
          <span class="tabular"><strong>Progress:</strong> ${prog.label}</span>
          <span class="opening-arc-reward"><strong>Reward:</strong> ${m.rewardText}</span>
        </div>
        <div class="opening-arc-bar"><div class="opening-arc-bar-fill" style="width: ${pct}%"></div></div>
      </div>
      <div class="opening-arc-actions">
        <button type="button" class="btn-brutal accent-moss" data-opening-focus="${m.tab}" data-opening-selector='${m.selector}'>${m.actionLabel} →</button>
      </div>
    </div>
  `;
}

/* INTERACTIVE TUTORIAL SYSTEM */
const TUTORIAL_STEPS = [
  {
    badge: 'WELCOME GREETING',
    title: 'Hello & Welcome to Idlenomics!',
    body: 'Your nomadic band has just settled beside a sheltered river valley at the dawn of the Stone Age. Follow the Founder\'s Path milestones at the top to earn bonus stockpiles as you build your first thriving village.',
    hint: 'Tap "Start Tour →" below for a quick interactive walkthrough of your controls!',
    nextLabel: 'Start Tour →',
    tab: 'tab-settlement',
    selector: '#opening-arc-card'
  },
  {
    badge: 'STEP 1 OF 6',
    title: '1. Resource Ledger & Diagnostics',
    body: 'This top ledger tracks your stockpiles, storage caps, and per-second rates. 1 Farmer is already pre-assigned so your Food grows (+0.1/s net). Click any resource cell anytime to open full production & bottleneck diagnostics!',
    hint: 'Tip: New Stone Age resources (Hide, Science, Tools) appear as you discover them.',
    tab: 'tab-settlement',
    selector: '#resource-ledger'
  },
  {
    badge: 'STEP 2 OF 6',
    title: '2. Manual Gathering & First Milestone',
    body: 'Touch any gathering button to collect raw materials by hand. Reaching 30 Food and 26 Wood completes Milestone 1 and awards a +10 Food, +10 Wood, +2 Hide hearth cache!',
    hint: 'Action: Tap "Forage Roots" (or press Next) to continue!',
    tab: 'tab-settlement',
    selector: 'button[data-gather="forage_food"]'
  },
  {
    badge: 'STEP 3 OF 6',
    title: '3. Population & Labor Assignment',
    body: 'Your settlement starts with 3 Citizens (1 Farmer, 2 Idle). Assign both idle citizens to Woodcutter and Stonecutter to complete Milestone 2 and earn +12 Stone & +10 Wood!',
    hint: 'Action: Tap "+1" on Woodcutter or Farmer to assign an idle worker!',
    tab: 'tab-settlement',
    selector: 'button[data-job-add="woodcutter"]'
  },
  {
    badge: 'STEP 4 OF 6',
    title: '4. Structures & Living World Growth',
    body: 'Structures provide passive production and raise your Population & Storage Caps. Every structure you build appears in the living valley landscape behind your panels!',
    hint: 'Build a Forager Camp (20 Wood, 10 Stone) or Hide Shelter to complete Milestone 3.',
    tab: 'tab-settlement',
    selector: '#building-list'
  },
  {
    badge: 'STEP 5 OF 6',
    title: '5. Technologies, Crafting & Eras',
    body: 'Open the Craft & Tech tab to research Oral Tradition (35 Food, 25 Wood), unlocking Science, Sky Observation, and Elders/Scribes on your path to Flint Toolmaking and the Bronze Age.',
    hint: 'Researching "Oral Tradition" completes Milestone 4 (+12 Science, +15 Stone)!',
    tab: 'tab-craft',
    selector: '#tech-list'
  },
  {
    badge: 'STEP 6 OF 6',
    title: '6. Wonders, Expeditions & Cloud Vault',
    body: 'Explore the World tab to train garrisons, annex territory, and build monumental Wonders. Use Settings or the Vault tab anytime to back up your save or sync snapshots.',
    hint: 'You can replay this guide or reopen the Founder\'s Path anytime via "? Guide".',
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

  const rawTarget = step.selector ? document.querySelector(step.selector) : null;
  const target = rawTarget && !rawTarget.classList.contains('hidden') ? rawTarget : null;
  const card = document.getElementById('tutorial-card');
  const arrow = document.getElementById('tutorial-arrow');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardWidth = card.offsetWidth || Math.min(vw * 0.92, 430);
  const cardHeight = card.offsetHeight || 200;

  arrow.style.left = '';
  arrow.style.top = '';

  if (target) {
    target.classList.add('tutorial-highlight');
    const rect = target.getBoundingClientRect();
    let leftPos = 12;
    let topPos = 12;

    const canFitLeft = vw >= 900 && rect.height > vh * 0.42 && rect.left - cardWidth - 20 >= 12;
    const canFitRight = vw >= 900 && rect.height > vh * 0.42 && rect.right + cardWidth + 20 <= vw - 12;

    if (canFitLeft || canFitRight) {
      const visibleTop = Math.max(16, rect.top);
      const visibleBottom = Math.min(vh - 76, rect.bottom);
      const targetMidY = (visibleTop + visibleBottom) / 2;
      topPos = Math.max(16, Math.min(vh - cardHeight - 76, targetMidY - cardHeight / 2));

      if (canFitLeft) {
        leftPos = rect.left - cardWidth - 16;
        arrow.className = 'tutorial-arrow arrow-right';
      } else {
        leftPos = rect.right + 16;
        arrow.className = 'tutorial-arrow arrow-left';
      }
      const arrowTop = Math.max(18, Math.min(cardHeight - 28, targetMidY - topPos - 7));
      arrow.style.top = `${Math.round(arrowTop)}px`;
    } else {
      const targetCenterX = rect.left + rect.width / 2;
      leftPos = Math.max(12, Math.min(vw - cardWidth - 12, targetCenterX - cardWidth / 2));

      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow >= cardHeight + 22 || (spaceBelow >= spaceAbove && rect.top < vh * 0.55)) {
        topPos = Math.max(12, Math.min(vh - cardHeight - 16, rect.bottom + 14));
        arrow.className = 'tutorial-arrow arrow-up';
      } else {
        topPos = Math.max(12, Math.min(vh - cardHeight - 16, rect.top - cardHeight - 14));
        arrow.className = 'tutorial-arrow arrow-down';
      }

      const arrowLeft = Math.max(18, Math.min(cardWidth - 32, targetCenterX - leftPos - 7));
      arrow.style.left = `${Math.round(arrowLeft)}px`;
    }

    card.style.left = `${Math.round(leftPos)}px`;
    card.style.top = `${Math.round(topPos)}px`;
    card.style.bottom = 'auto';
  } else {
    card.style.left = `${Math.round(Math.max(12, (vw - cardWidth) / 2))}px`;
    card.style.top = `${Math.round(Math.max(16, vh - cardHeight - 80))}px`;
    card.style.bottom = 'auto';
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
  renderOpeningArcCard();
  renderHeader();
  renderEventBanner();
  renderSettlementTab();
  renderCraftAndTechTab();
  renderWorldTab();
  renderChronicleTab();
  renderTutorial();
  insightsUI?.refresh();
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

// Opening Founder's Path Card Actions
const openingCardEl = document.getElementById('opening-arc-card');
if (openingCardEl) {
  openingCardEl.addEventListener('click', (e) => {
    const dismissBtn = e.target.closest('[data-opening-dismiss]');
    if (dismissBtn) {
      state.openingDismissed = true;
      saveLocalState();
      renderAll();
      return;
    }
    const focusBtn = e.target.closest('[data-opening-focus]');
    if (focusBtn) {
      const tabId = focusBtn.dataset.openingFocus;
      const sel = focusBtn.dataset.openingSelector;
      if (tabId) switchTab(tabId);
      renderAll();
      const targetEl = sel ? document.querySelector(sel) : null;
      if (targetEl) {
        targetEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        targetEl.classList.add('tutorial-highlight');
        setTimeout(() => targetEl.classList.remove('tutorial-highlight'), 1600);
      }
    }
  });
}

// World View Toggle, Theme Toggle & Tutorial Controls
const peekBtn = document.getElementById('btn-peek-world');
if (peekBtn) {
  peekBtn.addEventListener('click', () => {
    const active = document.body.classList.toggle('world-peek-active');
    peekBtn.textContent = active ? '✕ Show UI' : '👁 World View';
  });
}

document.getElementById('btn-theme').addEventListener('click', () => {
  state.paperMode = !state.paperMode;
  renderHeader();
  saveLocalState();
});

document.getElementById('btn-tutorial').addEventListener('click', () => {
  state.tutorialDone = false;
  state.openingDismissed = false;
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

// Local save operations are shared by Settings and the Vault.
const BACKUP_KEY = 'idlenomics_recovery_v1';
function backupCivilization(){localStorage.setItem(BACKUP_KEY,JSON.stringify(state));}
function restoreCivilization(raw,encoded=true){
  const value=JSON.parse(encoded?decodeURIComponent(escape(atob(raw.trim()))):raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||!ERAS.some(e=>e.id===value.era))throw Error('This is not a valid civilization save.');
  const base=createDefaultState();
  for(const field of ['resources','buildings','jobs','wonders','units']){
    if(!value[field]||typeof value[field]!=='object'||Array.isArray(value[field]))throw Error('Missing or invalid '+field+'.');
    for(const key of Object.keys(base[field])){
      const n=value[field][key]??base[field][key];
      if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e15)throw Error('Invalid '+field+' value.');
      base[field][key]=n;
    }
  }
  for(const key of ['pop','playtimeSeconds','landBonus','expeditionsCleared']){
    if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0)throw Error('Invalid '+key+'.');
    base[key]=value[key];
  }
  if(!Array.isArray(value.techs)||value.techs.some(t=>typeof t!=='string'))throw Error('Invalid technologies.');
  base.techs=value.techs.filter(t=>TECHS.some(x=>x.id===t));
  base.autoCraft=Object.fromEntries(CRAFT_RECIPES.map(r=>[r.id,value.autoCraft?.[r.id]===true]));
  base.simulation=economy.normalizeSimulation(value.simulation);
  base.era=value.era;
  base.paperMode=Boolean(value.paperMode);base.tutorialDone=true;
  base.claimedMilestones=Array.isArray(value.claimedMilestones)?value.claimedMilestones.filter(id=>OPENING_MILESTONES.some(m=>m.id===id)):[];
  base.openingDismissed=Boolean(value.openingDismissed);
  base.logs=Array.isArray(value.logs)?value.logs.filter(log=>log&&typeof log.time==='string'&&typeof log.msg==='string').slice(0,100):base.logs;
  base.activeEvent=HISTORICAL_EVENTS.find(event=>event.id===value.activeEvent?.id)||null;
  if(!Number.isInteger(base.pop)||base.pop>1e7||Object.values(base.jobs).reduce((a,b)=>a+b,0)>base.pop)throw Error('Invalid population or worker assignments.');
  for(const field of ['buildings','jobs','wonders','units'])if(Object.values(base[field]).some(n=>!Number.isInteger(n)))throw Error('Invalid '+field+' counts.');
  // Validate completely before touching either the current civilization or its backup.
  backupCivilization();base.lastTick=Date.now();
  localStorage.setItem(LOCAL_SAVE_KEY,JSON.stringify(base));state=base;renderAll();
}
const settingsMenu=initSettings({
  renderer:worldBackdrop,
  getTheme:()=>state.paperMode,
  setTheme:paper=>{state.paperMode=paper;renderAll();saveLocalState();},
  save:saveLocalState,
  exportSave:()=>{saveLocalState();return btoa(unescape(encodeURIComponent(JSON.stringify(state))));},
  importSave:raw=>restoreCivilization(raw),
  recover:()=>{const raw=localStorage.getItem(BACKUP_KEY);if(!raw)throw Error('No recovery backup yet. A backup is created before an import or reset.');restoreCivilization(raw,false);},
  reset:()=>{backupCivilization();const next=createDefaultState();next.paperMode=state.paperMode;localStorage.setItem(LOCAL_SAVE_KEY,JSON.stringify(next));state=next;renderAll();}
});
insightsUI = initInsightsUI({
  getState: () => state
});
document.getElementById('btn-export-save').addEventListener('click',()=>settingsMenu.open('save'));
document.getElementById('btn-import-save').addEventListener('click',()=>settingsMenu.open('save'));
document.getElementById('btn-hard-reset').addEventListener('click',()=>settingsMenu.open('reset'));

/* LIFECYCLE & 1-SECOND HEARTBEAT */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkOfflineProgress(true);
    renderAll();
  } else {
    saveLocalState();
  }
});

window.addEventListener('resize', () => {
  if (!state.tutorialDone) {
    renderTutorial();
  }
});

window.addEventListener('scroll', () => {
  if (!state.tutorialDone) {
    renderTutorial();
  }
}, { passive: true });

// Settle elapsed time before economic actions change workers, production or costs.
document.addEventListener('click', () => checkOfflineProgress(false), true);
initVaultInputs();
checkOfflineProgress(true);
renderAll();

setInterval(() => {
  if(document.hidden)return;
  checkOfflineProgress(false);
  saveLocalState();
  renderAll();
}, 1000);
