import { BUILDINGS, RESOURCES, JOBS, CRAFT_RECIPES, ERAS, HISTORICAL_EVENTS, WONDERS } from './data.js';

export function getGlobalMultipliers(state) {
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

export function getResourceCaps(state) {
  const { capMult } = getGlobalMultipliers(state);
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

export function getMaxPop(state) {
  let max = 5;
  BUILDINGS.forEach((b) => {
    if (b.effects.maxPop) {
      max += b.effects.maxPop * (state.buildings[b.id] || 0);
    }
  });
  return max;
}

export function getNetRates(state) {
  const { allProdMult, sciMult, foodMult } = getGlobalMultipliers(state);
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

export const MAX_OFFLINE_SECONDS = 7 * 24 * 60 * 60;
const fraction = value => Number.isFinite(value) && value >= 0 ? value % 1 : 0;
export function normalizeSimulation(value) {
  return {
    version: 1,
    remainderMs: Number.isFinite(value?.remainderMs) ? Math.max(0, Math.min(999, Math.floor(value.remainderMs))) : 0,
    growthSeconds: Number.isFinite(value?.growthSeconds) ? Math.max(0, Math.min(24, Math.floor(value.growthSeconds))) : 0,
    craftProgress: Object.fromEntries(CRAFT_RECIPES.map(recipe => [recipe.id, fraction(value?.craftProgress?.[recipe.id])]))
  };
}

function isItemUnlocked(state, item) {
  const currentEraOrder = ERAS.find(e => e.id === state.era)?.order || 0;
  if (item.era && (ERAS.find(e => e.id === item.era)?.order || 0) > currentEraOrder) return false;
  if (item.reqTech && !(state.techs || []).includes(item.reqTech)) return false;
  return true;
}

export function getEconomyDiagnostics(state) {
  const clock = normalizeSimulation(state.simulation);
  const mults = getGlobalMultipliers(state);
  const caps = getResourceCaps(state);
  const maxPop = getMaxPop(state);
  const rates = getNetRates(state);
  const currentEraOrder = ERAS.find(e => e.id === state.era)?.order || 0;
  const artisans = Math.max(0, state.jobs?.artisan || 0);
  const craftSpeedPerSec = artisans * mults.craftSpeed / 4;

  const resMap = {};
  for (const r of RESOURCES) {
    const mult = r.id === 'science' ? mults.sciMult : r.id === 'food' ? mults.foodMult : mults.allProdMult;
    const multSources = [];
    if ((state.wonders?.ziggurat || 0) > 0) {
      multSources.push({ label: `Great Terraced Ziggurat (Stage ${state.wonders.ziggurat})`, bonus: `+${Math.round(state.wonders.ziggurat * 12)}%` });
    }
    if ((state.wonders?.cathedral || 0) > 0) {
      multSources.push({ label: `Grand Stone Cathedral (Stage ${state.wonders.cathedral})`, bonus: `+${Math.round(state.wonders.cathedral * 20)}%` });
    }
    if ((r.id === 'science' || r.id === 'food') && (state.wonders?.megalith || 0) > 0) {
      multSources.push({ label: `Megalithic Ring (Stage ${state.wonders.megalith})`, bonus: `+${Math.round(state.wonders.megalith * 10)}%` });
    }
    if (r.id === 'science' && (state.techs || []).includes('alphabet')) {
      multSources.push({ label: 'Phonetic Script', bonus: '+25%' });
    }

    const buildingSources = [];
    let buildingTotal = 0;
    for (const b of BUILDINGS) {
      const count = state.buildings?.[b.id] || 0;
      const unitProd = b.effects?.prod?.[r.id] || 0;
      if (count > 0 && unitProd > 0) {
        const baseRate = unitProd * count;
        const rate = baseRate * mult;
        buildingTotal += rate;
        buildingSources.push({ id: b.id, name: b.name, count, baseRate, rate });
      }
    }

    const workerSources = [];
    let workerTotal = 0;
    for (const j of JOBS) {
      const count = state.jobs?.[j.id] || 0;
      const unitProd = j.prod?.[r.id] || 0;
      if (count > 0 && unitProd > 0) {
        const jobBoost = j.id === 'scholar' && (state.techs || []).includes('philosophy') ? 1.4 : 1;
        const baseRate = unitProd * count * jobBoost;
        const rate = baseRate * mult;
        workerTotal += rate;
        workerSources.push({ id: j.id, name: j.name, count, baseRate, rate, jobBoost });
      }
    }

    const grossProduction = buildingTotal + workerTotal;
    const citizenConsumption = r.id === 'food' ? (state.pop || 0) * 0.5 : 0;
    const passiveNet = grossProduction - citizenConsumption;
    const amount = state.resources?.[r.id] || 0;
    const cap = caps[r.id] || r.baseCap;
    const unlocked = (ERAS.find(e => e.id === r.unlockedAt)?.order || 0) <= currentEraOrder;

    resMap[r.id] = {
      id: r.id,
      name: r.name,
      crafted: Boolean(r.crafted),
      unlocked,
      amount,
      cap,
      fillRatio: cap > 0 ? Math.min(1, Math.max(0, amount / cap)) : 0,
      atCap: amount >= cap - 1e-9,
      isEmpty: amount <= 1e-9,
      multiplier: mult,
      multiplierSources: multSources,
      buildingSources,
      buildingTotal,
      workerSources,
      workerTotal,
      grossProduction,
      citizenConsumption,
      passiveNet,
      craftOutputSources: [],
      potentialCraftOutput: 0,
      craftInputDemands: [],
      potentialCraftDemand: 0,
      effectiveCraftOutput: 0,
      effectiveCraftDemand: 0,
      netAfterPotentialCrafting: passiveNet,
      timeToCapSeconds: passiveNet > 1e-9 && amount < cap ? (cap - amount) / passiveNet : null,
      timeToEmptySeconds: passiveNet < -1e-9 && amount > 0 ? amount / (-passiveNet) : null,
      bottlenecks: []
    };
  }

  const recipeMap = {};
  const recipeList = [];
  for (const recipe of CRAFT_RECIPES) {
    const unlocked = isItemUnlocked(state, recipe);
    const enabled = Boolean(state.autoCraft?.[recipe.id]) && unlocked;
    const progress = enabled ? (clock.craftProgress[recipe.id] || 0) : 0;

    const inputs = Object.entries(recipe.inputs).map(([resId, amount]) => {
      const rDiag = resMap[resId];
      const stored = state.resources?.[resId] || 0;
      const demandPerSec = enabled ? craftSpeedPerSec * amount : 0;
      const passiveSupplyPerSec = rDiag ? rDiag.passiveNet : 0;
      return {
        id: resId,
        name: rDiag ? rDiag.name : resId,
        perBatch: amount,
        stored,
        cap: caps[resId] || 0,
        sufficientNow: stored + 1e-9 >= amount,
        demandPerSec,
        passiveSupplyPerSec,
        supplyDeficitPerSec: enabled && demandPerSec > Math.max(0, passiveSupplyPerSec) + 1e-9
          ? demandPerSec - Math.max(0, passiveSupplyPerSec)
          : 0
      };
    });

    const outputs = Object.entries(recipe.outputs).map(([resId, amount]) => {
      const rDiag = resMap[resId];
      const stored = state.resources?.[resId] || 0;
      const cap = caps[resId] || 0;
      const remainingSpace = Math.max(0, cap - stored);
      const outputPerSec = enabled ? craftSpeedPerSec * amount : 0;
      return {
        id: resId,
        name: rDiag ? rDiag.name : resId,
        perBatch: amount,
        stored,
        cap,
        remainingSpace,
        fullNow: remainingSpace + 1e-9 < amount,
        outputPerSec
      };
    });

    const missingInputs = inputs.filter(inp => !inp.sufficientNow);
    const fullOutputs = outputs.filter(out => out.fullNow);
    const bottleneckInputs = inputs.filter(inp => inp.supplyDeficitPerSec > 1e-9);

    let status = 'off';
    let explanation = 'Auto-crafting is turned off for this recipe.';
    if (!unlocked) {
      status = 'locked';
      explanation = 'Locked until required era and technology are researched.';
    } else if (!enabled) {
      status = 'off';
      explanation = 'Auto-crafting is OFF. Use Craft for manual batches or toggle Auto ON.';
    } else if (artisans <= 0) {
      status = 'no_artisans';
      explanation = 'Blocked: Auto is ON, but 0 Artisans are assigned in Population & Labor.';
    } else if (fullOutputs.length > 0) {
      status = 'blocked_output_full';
      explanation = `Blocked: ${fullOutputs.map(o => `${o.name} (${Math.floor(o.stored)}/${o.cap})`).join(', ')} storage has no room for a full batch (${fullOutputs.map(o => `+${o.perBatch}`).join(', ')}). No inputs are burned while full.`;
    } else if (missingInputs.length > 0) {
      status = 'blocked_missing_inputs';
      explanation = `Blocked: Waiting for ${missingInputs.map(i => `${i.name} (${Math.floor(i.stored)}/${i.perBatch})`).join(', ')}. Missed cycles expire rather than stockpiling.`;
    } else if (bottleneckInputs.length > 0) {
      status = 'input_bottleneck';
      explanation = `Input bottleneck: Full artisan speed needs ${bottleneckInputs.map(i => `${i.demandPerSec.toFixed(2)} ${i.name}/s (passive net ${i.passiveSupplyPerSec >= 0 ? '+' : ''}${i.passiveSupplyPerSec.toFixed(2)}/s)`).join(', ')}.`;
    } else {
      status = 'running';
      explanation = `Running smoothly: ${(1 / craftSpeedPerSec).toFixed(1)}s per batch (${Math.round(progress * 100)}% toward next batch).`;
    }

    const canRunNextCycle = enabled && artisans > 0 && fullOutputs.length === 0 && missingInputs.length === 0;

    if (enabled) {
      for (const out of outputs) {
        const targetRes = resMap[out.id];
        if (targetRes) {
          targetRes.potentialCraftOutput += out.outputPerSec;
          if (canRunNextCycle) targetRes.effectiveCraftOutput += out.outputPerSec;
          targetRes.craftOutputSources.push({
            id: recipe.id,
            name: recipe.name,
            perBatch: out.perBatch,
            potentialRate: out.outputPerSec,
            activeRate: canRunNextCycle ? out.outputPerSec : 0,
            status,
            explanation
          });
        }
      }
      for (const inp of inputs) {
        const targetRes = resMap[inp.id];
        if (targetRes) {
          targetRes.potentialCraftDemand += inp.demandPerSec;
          if (canRunNextCycle) targetRes.effectiveCraftDemand += inp.demandPerSec;
          targetRes.craftInputDemands.push({
            id: recipe.id,
            name: recipe.name,
            perBatch: inp.perBatch,
            potentialDemand: inp.demandPerSec,
            activeDemand: canRunNextCycle ? inp.demandPerSec : 0,
            status,
            explanation
          });
        }
      }
    }

    const diagRecipe = {
      id: recipe.id,
      name: recipe.name,
      unlocked,
      enabled,
      artisans,
      craftSpeedMult: mults.craftSpeed,
      cyclesPerSecond: enabled ? craftSpeedPerSec : 0,
      secondsPerBatch: enabled && craftSpeedPerSec > 0 ? 1 / craftSpeedPerSec : null,
      progress,
      inputs,
      outputs,
      status,
      explanation
    };
    recipeMap[recipe.id] = diagRecipe;
    recipeList.push(diagRecipe);
  }

  // Finalize per-resource bottlenecks and net-after-crafting
  for (const r of RESOURCES) {
    const d = resMap[r.id];
    d.netAfterPotentialCrafting = d.passiveNet + d.potentialCraftOutput - d.potentialCraftDemand;

    if (d.atCap && (d.passiveNet > 1e-9 || d.potentialCraftOutput > 1e-9)) {
      d.bottlenecks.push(`Storage cap reached (${d.cap}/${d.cap}) — excess output overflows and auto-crafting into ${d.name} pauses.`);
    }
    if (d.passiveNet < -1e-9) {
      const secs = d.timeToEmptySeconds ? `${Math.ceil(d.timeToEmptySeconds)}s` : '0s';
      d.bottlenecks.push(`Net passive drain (${d.passiveNet.toFixed(2)}/s) — stockpile ${d.isEmpty ? 'is empty' : `depletes in ~${secs}`}.`);
    }
    if (d.potentialCraftDemand > Math.max(0, d.passiveNet + d.potentialCraftOutput) + 1e-9) {
      const deficit = d.potentialCraftDemand - Math.max(0, d.passiveNet + d.potentialCraftOutput);
      d.bottlenecks.push(`Auto-craft input demand (${d.potentialCraftDemand.toFixed(2)}/s) exceeds steady supply by ${deficit.toFixed(2)}/s.`);
    }
    for (const src of d.craftOutputSources) {
      if (src.status !== 'running') {
        d.bottlenecks.push(`${src.name}: ${src.explanation}`);
      }
    }
  }

  const assignedPop = Object.values(state.jobs || {}).reduce((a, b) => a + b, 0);
  const foodStored = state.resources?.food || 0;
  const netFood = rates.food || 0;
  let popStatus = 'growing';
  let popExplanation = `Growing: ${clock.growthSeconds}/25s toward next citizen (+1 settler in ${25 - clock.growthSeconds}s).`;
  if ((state.pop || 0) >= maxPop) {
    popStatus = 'housing_full';
    popExplanation = `Housing full (${state.pop}/${maxPop}). Build Hide Shelters, Mudbrick Houses, or Stone Aqueducts to raise Max Population.`;
  } else if (netFood <= 0) {
    popStatus = 'negative_food_rate';
    popExplanation = `Growth paused: Net Food/s must be positive (currently ${netFood >= 0 ? '+' : ''}${netFood.toFixed(2)}/s). Assign Farmers or build Forager Camps.`;
  } else if (foodStored <= 15) {
    popStatus = 'low_food_stock';
    popExplanation = `Growth paused: Stored Food must exceed 15 (currently ${Math.floor(foodStored)}). Growth timer resets when conditions fail.`;
  }

  return {
    multipliers: mults,
    resources: resMap,
    recipes: recipeMap,
    recipeList,
    population: {
      current: state.pop || 0,
      max: maxPop,
      assigned: assignedPop,
      idle: Math.max(0, (state.pop || 0) - assignedPop),
      foodStored,
      netFood,
      growthSeconds: clock.growthSeconds,
      secondsRequired: 25,
      secondsRemaining: popStatus === 'growing' ? 25 - clock.growthSeconds : null,
      status: popStatus,
      explanation: popExplanation
    }
  };
}

// Both live play and catch-up execute this exact one-second transition. Rates
// are cached between population changes; no UI or randomness lives here.
export function simulateSeconds(state, seconds, summaryOut = null) {
  const ticks = Number.isFinite(seconds) ? Math.min(MAX_OFFLINE_SECONDS, Math.max(0, Math.floor(seconds))) : 0;
  const clock = state.simulation = normalizeSimulation(state.simulation);
  const caps = getResourceCaps(state), maxPop = getMaxPop(state);
  let rates = getNetRates(state);
  const production = Object.keys(rates);
  const speed = Math.max(0, state.jobs.artisan || 0) * getGlobalMultipliers(state).craftSpeed / 4;
  const era = ERAS.find(e => e.id === state.era)?.order || 0;
  const recipes = CRAFT_RECIPES.filter(r => state.autoCraft[r.id] &&
    (!r.reqTech || state.techs.includes(r.reqTech)) &&
    (!r.era || ERAS.find(e => e.id === r.era).order <= era));
  const plans = recipes.map(recipe => ({ recipe, inputs: Object.entries(recipe.inputs), outputs: Object.entries(recipe.outputs) }));
  const enabled = new Set(recipes.map(r => r.id));
  for (const recipe of CRAFT_RECIPES) if (!enabled.has(recipe.id)) clock.craftProgress[recipe.id] = 0;

  const track = summaryOut !== null && typeof summaryOut === 'object';
  let beforeRes, produced, consumed, crafted, spent, overflow, batches, blockedByInput, blockedByOutput, popBefore, hadEventBefore, citizenUpkeep, grossFoodProd;
  if (track) {
    popBefore = state.pop;
    hadEventBefore = Boolean(state.activeEvent);
    beforeRes = {};
    produced = {};
    consumed = {};
    crafted = {};
    spent = {};
    overflow = {};
    for (const id of production) {
      beforeRes[id] = state.resources[id] || 0;
      produced[id] = 0;
      consumed[id] = 0;
      crafted[id] = 0;
      spent[id] = 0;
      overflow[id] = 0;
    }
    batches = Object.fromEntries(CRAFT_RECIPES.map(r => [r.id, 0]));
    blockedByInput = Object.fromEntries(CRAFT_RECIPES.map(r => [r.id, 0]));
    blockedByOutput = Object.fromEntries(CRAFT_RECIPES.map(r => [r.id, 0]));
    citizenUpkeep = state.pop * 0.5;
    grossFoodProd = rates.food + citizenUpkeep;
  }

  for (let tick = 0; tick < ticks; tick++) {
    for (const id of production) {
      const before = state.resources[id] || 0;
      const rate = rates[id];
      const cap = caps[id];
      const raw = before + rate;
      const after = raw < 0 ? 0 : raw > cap ? cap : raw;
      state.resources[id] = after;
      if (track) {
        if (raw > cap) overflow[id] += raw - cap;
        if (id === 'food') {
          const over = raw > cap ? raw - cap : 0;
          const short = raw < 0 ? -raw : 0;
          produced.food += grossFoodProd > over ? grossFoodProd - over : 0;
          consumed.food += citizenUpkeep > short ? citizenUpkeep - short : 0;
        } else if (rate > 0) {
          const over = raw > cap ? raw - cap : 0;
          produced[id] += rate > over ? rate - over : 0;
        }
      }
    }
    // Recipe order is the same online and offline. Upstream outputs can feed
    // downstream recipes this second. Blocked cycles expire, never stockpile.
    for (const { recipe, inputs, outputs } of plans) {
      const rId = recipe.id;
      const work = clock.craftProgress[rId] + speed;
      let cycles = Math.floor(work + 1e-10);
      clock.craftProgress[rId] = Math.max(0, work - cycles);
      if (cycles === 0) continue;
      const attempted = cycles;
      for (const [id, amount] of inputs) cycles = Math.min(cycles, Math.floor((state.resources[id] + 1e-9) / amount));
      const afterInputs = cycles;
      for (const [id, amount] of outputs) cycles = Math.min(cycles, Math.floor((caps[id] - state.resources[id] + 1e-9) / amount));
      if (track) {
        if (afterInputs < attempted) blockedByInput[rId] += attempted - afterInputs;
        else if (cycles < afterInputs) blockedByOutput[rId] += afterInputs - cycles;
      }
      if (cycles <= 0) continue;
      if (track) batches[rId] += cycles;
      for (const [id, amount] of inputs) {
        const used = cycles * amount;
        state.resources[id] = Math.max(0, state.resources[id] - used);
        if (track) spent[id] += used;
      }
      for (const [id, amount] of outputs) {
        const prev = state.resources[id];
        const next = Math.min(caps[id], prev + cycles * amount);
        state.resources[id] = next;
        if (track) crafted[id] += next - prev;
      }
    }
    // Twenty-five consecutive well-fed, food-positive seconds earn one settler.
    // New settlers consume food starting on the next second. No offline deaths
    // are introduced: an empty food store stops growth, as in the existing game.
    if (state.pop < maxPop && rates.food > 0 && state.resources.food > 15) {
      if (++clock.growthSeconds >= 25) {
        state.pop++;
        if (Array.isArray(state.logs)) {
          state.logs.unshift({ time: `Yr ${Math.floor((state.playtimeSeconds + 1) / 15) + 1}`, msg: `New settlers joined your settlement (Population: ${state.pop}).` });
          state.logs.length = Math.min(state.logs.length, 40);
        }
        clock.growthSeconds = 0;
        rates = getNetRates(state);
        if (track) {
          citizenUpkeep = state.pop * 0.5;
          grossFoodProd = rates.food + citizenUpkeep;
        }
      }
    } else clock.growthSeconds = 0;
    state.playtimeSeconds++;
    if (!state.activeEvent && state.playtimeSeconds % 90 === 0 && HISTORICAL_EVENTS.length) {
      // A pending dilemma waits for the player; elapsed time cannot reroll it.
      state.activeEvent = HISTORICAL_EVENTS[(Math.floor(state.playtimeSeconds / 90) - 1) % HISTORICAL_EVENTS.length];
    }
  }

  if (track) {
    const resourceSummary = {};
    for (const r of RESOURCES) {
      const id = r.id;
      const before = beforeRes[id] || 0;
      const after = state.resources[id] || 0;
      const gained = (produced[id] || 0) + (crafted[id] || 0);
      const used = (consumed[id] || 0) + (spent[id] || 0);
      resourceSummary[id] = {
        id,
        name: r.name,
        crafted: Boolean(r.crafted),
        before,
        after,
        net: after - before,
        produced: produced[id] || 0,
        craftedOut: crafted[id] || 0,
        gained,
        consumed: consumed[id] || 0,
        spentInCraft: spent[id] || 0,
        used,
        overflow: overflow[id] || 0,
        cap: caps[id] || r.baseCap,
        atCap: after >= (caps[id] || r.baseCap) - 1e-9
      };
    }

    const recipeSummary = CRAFT_RECIPES.map(r => {
      const count = batches[r.id] || 0;
      const inBlocked = blockedByInput[r.id] || 0;
      const outBlocked = blockedByOutput[r.id] || 0;
      return {
        id: r.id,
        name: r.name,
        enabled: enabled.has(r.id),
        batches: count,
        blockedByInput: inBlocked,
        blockedByOutput: outBlocked,
        outputsProduced: Object.fromEntries(Object.entries(r.outputs).map(([k, v]) => [k, count * v])),
        inputsSpent: Object.fromEntries(Object.entries(r.inputs).map(([k, v]) => [k, count * v]))
      };
    });

    let growthLimitReason = 'growing';
    if (state.pop >= maxPop) growthLimitReason = 'housing_full';
    else if (rates.food <= 0) growthLimitReason = 'negative_food_rate';
    else if ((state.resources.food || 0) <= 15) growthLimitReason = 'low_food_stock';

    Object.assign(summaryOut, {
      seconds: ticks,
      popBefore,
      popAfter: state.pop,
      popGained: state.pop - popBefore,
      maxPop,
      growthSeconds: clock.growthSeconds,
      growthLimitReason,
      resources: resourceSummary,
      batches,
      recipes: recipeSummary,
      eventArrived: !hadEventBefore && Boolean(state.activeEvent),
      activeEvent: state.activeEvent ? { id: state.activeEvent.id, title: state.activeEvent.title } : null
    });
  }

  return ticks;
}

export function advanceTo(state, now) {
  if (!Number.isFinite(now)) return { seconds: 0, capped: false, summary: null };
  const clock = state.simulation = normalizeSimulation(state.simulation);
  if (!Number.isFinite(state.lastTick)) { state.lastTick = now; return { seconds: 0, capped: false, summary: null }; }
  // A backwards clock must neither generate production nor move the anchor back.
  if (now <= state.lastTick) return { seconds: 0, capped: false, summary: null };
  const elapsed = now - state.lastTick + clock.remainderMs;
  const capped = elapsed > MAX_OFFLINE_SECONDS * 1000;
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.floor(elapsed / 1000));
  clock.remainderMs = capped ? 0 : elapsed - seconds * 1000;
  const summary = seconds > 0 ? { capped } : null;
  simulateSeconds(state, seconds, summary);
  state.lastTick = now;
  return { seconds, capped, summary };
}
