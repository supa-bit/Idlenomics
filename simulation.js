import { BUILDINGS, RESOURCES, JOBS, CRAFT_RECIPES, ERAS, HISTORICAL_EVENTS } from './data.js';

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

// Both live play and catch-up execute this exact one-second transition. Rates
// are cached between population changes; no UI or randomness lives here.
export function simulateSeconds(state, seconds) {
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
  const plans=recipes.map(recipe=>({recipe,inputs:Object.entries(recipe.inputs),outputs:Object.entries(recipe.outputs)}));
  const enabled = new Set(recipes.map(r => r.id));
  for(const recipe of CRAFT_RECIPES)if(!enabled.has(recipe.id))clock.craftProgress[recipe.id]=0;
  for(let tick = 0; tick < ticks; tick++) {
    for(const id of production)state.resources[id] = Math.max(0, Math.min(caps[id], (state.resources[id] || 0) + rates[id]));
    // Recipe order is the same online and offline. Upstream outputs can feed
    // downstream recipes this second. Blocked cycles expire, never stockpile.
    for(const {recipe,inputs,outputs} of plans) {
      const work = clock.craftProgress[recipe.id] + speed;
      let cycles = Math.floor(work + 1e-10);
      clock.craftProgress[recipe.id] = Math.max(0, work - cycles);
      if(cycles===0)continue;
      for(const [id, amount] of inputs)cycles = Math.min(cycles, Math.floor((state.resources[id] + 1e-9) / amount));
      for(const [id, amount] of outputs)cycles = Math.min(cycles, Math.floor((caps[id] - state.resources[id] + 1e-9) / amount));
      if(cycles <= 0)continue;
      for(const [id, amount] of inputs)state.resources[id] = Math.max(0,state.resources[id] - cycles * amount);
      for(const [id, amount] of outputs)state.resources[id] = Math.min(caps[id],state.resources[id] + cycles * amount);
    }
    // Twenty-five consecutive well-fed, food-positive seconds earn one settler.
    // New settlers consume food starting on the next second. No offline deaths
    // are introduced: an empty food store stops growth, as in the existing game.
    if(state.pop < maxPop && rates.food > 0 && state.resources.food > 15) {
      if(++clock.growthSeconds >= 25) {
        state.pop++;
        if(Array.isArray(state.logs)){
          state.logs.unshift({time:`Yr ${Math.floor((state.playtimeSeconds+1)/15)+1}`,msg:`New settlers joined your settlement (Population: ${state.pop}).`});
          state.logs.length=Math.min(state.logs.length,40);
        }
        clock.growthSeconds = 0;
        rates = getNetRates(state);
      }
    } else clock.growthSeconds = 0;
    state.playtimeSeconds++;
    if(!state.activeEvent && state.playtimeSeconds % 90 === 0 && HISTORICAL_EVENTS.length) {
      // A pending dilemma waits for the player; elapsed time cannot reroll it.
      state.activeEvent = HISTORICAL_EVENTS[(Math.floor(state.playtimeSeconds / 90) - 1) % HISTORICAL_EVENTS.length];
    }
  }
  return ticks;
}

export function advanceTo(state, now) {
  if(!Number.isFinite(now))return {seconds:0,capped:false};
  const clock=state.simulation=normalizeSimulation(state.simulation);
  if(!Number.isFinite(state.lastTick)){state.lastTick=now;return {seconds:0,capped:false};}
  // A backwards clock must neither generate production nor move the anchor back.
  if(now<=state.lastTick)return {seconds:0,capped:false};
  const elapsed=now-state.lastTick+clock.remainderMs;
  const capped=elapsed>MAX_OFFLINE_SECONDS*1000;
  const seconds=Math.min(MAX_OFFLINE_SECONDS,Math.floor(elapsed/1000));
  clock.remainderMs=capped?0:elapsed-seconds*1000;
  simulateSeconds(state,seconds);
  state.lastTick=now;
  return {seconds,capped};
}
