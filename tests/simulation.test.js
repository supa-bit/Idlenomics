import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateSeconds,advanceTo,getNetRates,getResourceCaps,getEconomyDiagnostics,MAX_OFFLINE_SECONDS} from '../simulation.js';
import {RESOURCES,BUILDINGS,JOBS,WONDERS,MILITARY_UNITS,CRAFT_RECIPES,TECHS,ERAS} from '../data.js';
import {OPENING_MILESTONES,evaluateOpeningSession,getVisibleResources} from '../opening-guide.js';
const zeros=items=>Object.fromEntries(items.map(x=>[x.id,0]));
const getEraOrder=eraId=>ERAS.find(e=>e.id===eraId)?.order||0;
function fixture(){return {era:'medieval',pop:12,landBonus:0,playtimeSeconds:0,lastTick:1000,resources:Object.fromEntries(RESOURCES.map(r=>[r.id,Math.min(80,r.baseCap)])),buildings:{...zeros(BUILDINGS),hide_tent:10},jobs:{...zeros(JOBS),farmer:7,artisan:1,woodcutter:1,quarrier:1,hunter:1,miner:1},wonders:zeros(WONDERS),units:zeros(MILITARY_UNITS),techs:TECHS.map(t=>t.id),autoCraft:Object.fromEntries(CRAFT_RECIPES.map(r=>[r.id,true])),activeEvent:null};}
const clone=structuredClone;
for(const era of ERAS)test(`${era.id}: bulk, single-second, irregular, and save/reload progression agree`,()=>{
 const initial=fixture();initial.era=era.id;const bulk=clone(initial),live=clone(initial),chunks=clone(initial);
 simulateSeconds(bulk,3600);for(let i=0;i<3600;i++)simulateSeconds(live,1);
 for(const n of [17,3,700,1,1440,1439])simulateSeconds(chunks,n);
 assert.deepEqual(live,bulk);assert.deepEqual(chunks,bulk);
 const reload=clone(initial);simulateSeconds(reload,123);const loaded=JSON.parse(JSON.stringify(reload));simulateSeconds(loaded,3477);assert.deepEqual(loaded,bulk);
});
test('one artisan needs four seconds; partial work survives reload',()=>{
 let s=fixture();s.autoCraft={craft_tools:true};s.jobs={...zeros(JOBS),artisan:1};
 simulateSeconds(s,3);assert.equal(s.resources.tools,80); // already full: no inputs consumed
 assert.equal(s.resources.wood,80);s.resources.tools=0;
 s=JSON.parse(JSON.stringify(s));simulateSeconds(s,1);assert.equal(s.resources.tools,2);assert.equal(s.resources.wood,70);
});
test('full outputs do not burn inputs and missed cycles do not build a backlog',()=>{
 const s=fixture();s.jobs={...zeros(JOBS),artisan:1};s.autoCraft={craft_tools:true};simulateSeconds(s,400);assert.equal(s.resources.wood,80);
 s.resources.tools=0;simulateSeconds(s,1);assert.equal(s.resources.tools,0);simulateSeconds(s,3);assert.equal(s.resources.tools,2);
});
test('population takes 25 eligible seconds and immediately changes food consumption',()=>{
 const s=fixture();s.pop=3;s.jobs={...zeros(JOBS),farmer:2};s.autoCraft={};s.resources.food=30;
 simulateSeconds(s,24);assert.equal(s.pop,3);simulateSeconds(s,1);assert.equal(s.pop,4);
 assert(Math.abs(getNetRates(s).food-1.2)<1e-9);const before=s.resources.food;simulateSeconds(s,1);assert(Math.abs(s.resources.food-before-1.2)<1e-9);
 s.resources.food=0;s.jobs.farmer=0;simulateSeconds(s,100);assert.equal(s.pop,4);assert.equal(s.resources.food,0);assert.equal(s.simulation.growthSeconds,0);
});
test('offline crafting is not capped at 50 cycles',()=>{
 const s=fixture();s.landBonus=100;s.autoCraft={craft_tools:true};s.jobs={...zeros(JOBS),artisan:1};Object.assign(s.resources,{wood:2000,stone:2000,hide:600,tools:0});
 simulateSeconds(s,400);assert.equal(s.resources.tools,200);assert.equal(s.resources.wood,1000);
});
test('dependent recipes, shared inputs, high speed and storage remain bounded',()=>{
 const s=fixture();s.landBonus=10;s.jobs.artisan=40;s.buildings.guild_hall=5;s.resources.tools=0;s.resources.cutStone=0;
 const a=clone(s),b=clone(s);simulateSeconds(a,10000);for(let i=0;i<100;i++)simulateSeconds(b,100);assert.deepEqual(a,b);
 const caps=getResourceCaps(a);for(const [id,value] of Object.entries(a.resources)){assert(Number.isFinite(value)&&value>=0&&value<=caps[id],id);}
});
test('wall clock accumulation survives frequent saves, delayed ticks and reload',()=>{
 let a=fixture(),b=clone(a);for(let time=1100;time<=11000;time+=100){advanceTo(a,time);a=JSON.parse(JSON.stringify(a));}advanceTo(b,11000);assert.deepEqual(a,b);
 const snapshot=clone(a);advanceTo(a,9000);advanceTo(a,11000);assert.deepEqual(a,snapshot);
 advanceTo(a,11500);assert.equal(a.simulation.remainderMs,500);advanceTo(a,12000);assert.equal(a.playtimeSeconds,11);
});
test('seven-day cap is truthful, efficient and cannot be claimed twice',()=>{
 const a=fixture();const start=performance.now();const result=advanceTo(a,1000+MAX_OFFLINE_SECONDS*2000);
 assert.equal(result.seconds,MAX_OFFLINE_SECONDS);assert(result.capped);assert.equal(a.playtimeSeconds,MAX_OFFLINE_SECONDS);
 const snapshot=clone(a);advanceTo(a,a.lastTick);assert.deepEqual(a,snapshot);console.log(`Seven-day catch-up: ${Math.round(performance.now()-start)}ms`);
});
test('pending events agree offline and online and do not reroll',()=>{
 const s=fixture();simulateSeconds(s,90);assert(s.activeEvent);const event=s.activeEvent;simulateSeconds(s,900);assert.equal(s.activeEvent,event);
});
test('housing, lack of artisans and locked recipes cannot produce free progress',()=>{
 const s=fixture();s.buildings=zeros(BUILDINGS);s.pop=5;s.jobs={...zeros(JOBS),farmer:4};s.resources.tools=0;simulateSeconds(s,300);assert.equal(s.pop,5);assert.equal(s.resources.tools,0);
 s.jobs.artisan=1;s.techs=[];simulateSeconds(s,100);assert.equal(s.resources.tools,0);
});
test('fractional craft boosts preserve completed work across arbitrary chunks',()=>{
 const s=fixture();s.buildings.smeltery=1;s.jobs.artisan=3;s.resources.tools=0;
 const a=clone(s),b=clone(s);simulateSeconds(a,197);for(const n of [1,2,17,50,127])simulateSeconds(b,n);assert.deepEqual(a,b);
});
test('diagnostics separate building/worker production, citizen upkeep, crafting demand, and blocked recipe reasons',()=>{
 const s=fixture();s.buildings.forager_hut=2;s.buildings.lumber_pile=1;s.jobs={...zeros(JOBS),farmer:3,woodcutter:1,artisan:1};
 s.autoCraft={craft_tools:true,craft_bronze:true};s.resources.tools=80;s.resources.ore=4;
 const diag=getEconomyDiagnostics(s);
 assert(Math.abs(diag.resources.food.buildingTotal-1.6)<1e-9);
 assert(Math.abs(diag.resources.food.workerTotal-4.8)<1e-9);
 assert(Math.abs(diag.resources.food.citizenConsumption-6.0)<1e-9);
 assert(Math.abs(diag.resources.food.passiveNet-0.4)<1e-9);
 assert.equal(diag.recipes.craft_tools.status,'blocked_output_full');
 assert.equal(diag.recipes.craft_bronze.status,'blocked_missing_inputs');
 s.resources.tools=10;
 const diag2=getEconomyDiagnostics(s);
 assert(Math.abs(diag2.resources.tools.potentialCraftOutput-0.5)<1e-9);
 assert(Math.abs(diag2.resources.wood.potentialCraftDemand-6.25)<1e-9);
 assert.equal(diag2.recipes.craft_tools.status,'input_bottleneck');
});
test('return summary reports actual gains, spending, overflow, completed batches, and population changes',()=>{
 const s=fixture();s.pop=3;s.buildings.hide_tent=2;s.jobs={...zeros(JOBS),farmer:3,woodcutter:2,artisan:1};
 s.autoCraft={craft_tools:true};s.resources.food=240;s.resources.wood=100;s.resources.stone=100;s.resources.hide=60;s.resources.tools=0;
 const {summary}=advanceTo(s,1000+60*1000);
 assert.equal(summary.seconds,60);
 assert.equal(summary.popBefore,3);
 assert.equal(summary.popAfter,5);
 assert.equal(summary.popGained,2);
 assert.equal(summary.batches.craft_tools,10);
 assert.equal(summary.recipes.find(r=>r.id==='craft_tools').blockedByInput,5);
 assert.equal(summary.resources.tools.craftedOut,20);
 assert.equal(summary.resources.wood.spentInCraft,100);
 assert.equal(summary.resources.stone.spentInCraft,100);
 assert(summary.resources.food.overflow>0);
 for(const r of Object.values(summary.resources)){
  assert(Math.abs((r.gained-r.used)-r.net)<1e-7,`${r.id}: gained-used != net`);
 }
});
test('progressive resource disclosure starts with 3 core resources and reveals hide, science, and tools as unlocked',()=>{
 const s={era:'stone',pop:3,resources:{...zeros(RESOURCES),food:25,wood:20},buildings:zeros(BUILDINGS),jobs:{...zeros(JOBS),farmer:1},techs:[],claimedMilestones:[]};
 assert.deepEqual(getVisibleResources(s,RESOURCES,getEraOrder).map(r=>r.id),['food','wood','stone']);
 s.resources.hide=1;
 assert.deepEqual(getVisibleResources(s,RESOURCES,getEraOrder).map(r=>r.id),['food','wood','stone','hide']);
 s.techs.push('oral_tradition');
 assert.deepEqual(getVisibleResources(s,RESOURCES,getEraOrder).map(r=>r.id),['food','wood','stone','hide','science']);
 s.techs.push('toolmaking');
 assert.deepEqual(getVisibleResources(s,RESOURCES,getEraOrder).map(r=>r.id),['food','wood','stone','hide','tools','science']);
});
test('opening milestones award one-time bonuses bounded by storage caps and guide through the Stone Age',()=>{
 const s={era:'stone',pop:3,landBonus:0,resources:{...zeros(RESOURCES),food:30,wood:26},buildings:zeros(BUILDINGS),jobs:{...zeros(JOBS),farmer:1},wonders:zeros(WONDERS),units:zeros(MILITARY_UNITS),techs:[],claimedMilestones:[]};
 const logs=[];
 const r1=evaluateOpeningSession(s,getResourceCaps(s),msg=>logs.push(msg));
 assert.deepEqual(r1.newlyClaimed.map(m=>m.id),['gather_vital_stores']);
 assert.equal(s.resources.food,40);
 assert.equal(s.resources.wood,36);
 assert.equal(s.resources.hide,2);
 // Re-running without new progress does not double-award
 const r1Again=evaluateOpeningSession(s,getResourceCaps(s),msg=>logs.push(msg));
 assert.equal(r1Again.newlyClaimed.length,0);
 assert.equal(r1Again.activeMilestone.id,'assign_idle_labor');
 // Complete remaining milestones in order
 s.jobs.farmer=2;s.jobs.woodcutter=1;
 s.buildings.forager_hut=1;
 s.techs.push('oral_tradition');
 s.buildings.totem_pole=1;
 s.techs.push('toolmaking');s.resources.tools=4;
 s.techs.push('pottery');s.buildings.granary=1;
 const rAll=evaluateOpeningSession(s,getResourceCaps(s),msg=>logs.push(msg));
 assert.equal(rAll.allDone,true);
 assert.equal(s.claimedMilestones.length,OPENING_MILESTONES.length);
});
