import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateSeconds,advanceTo,getNetRates,getResourceCaps,MAX_OFFLINE_SECONDS} from '../simulation.js';
import {RESOURCES,BUILDINGS,JOBS,WONDERS,MILITARY_UNITS,CRAFT_RECIPES,TECHS,ERAS} from '../data.js';
const zeros=items=>Object.fromEntries(items.map(x=>[x.id,0]));
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
