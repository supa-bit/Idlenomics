/**
 * Idlenomics — The River Remembers
 * Self-contained Canvas2D diorama. No images, fonts, libraries or network requests.
 *
 * Coordinates: world units, +x right / +y down; 1000 units high. The camera
 * always uses ONE scale for both axes. Portrait crops the valley flanks; wide
 * screens reveal them. Sky and rear mountains have depth parallax; the front
 * watershed and inhabited valley move as one.
 * Buildings use seeded, collision-free plots in irregular village clearings;
 * type/index addresses survive growth. Off-camera architecture is culled.
 *
 * Public API (the existing two calls remain sufficient):
 *   new WorldBackdropRenderer('world-bg-canvas'); renderer.updateState(state);
 * Optional: pause(), resume(), seek(seconds), replay(), destroy(),
 *           enableGyroscope() (call from a user gesture on permissioned iOS).
 * Reduced motion freezes ambient animation and disables input parallax.
 * Mountain and ground artwork bake in a self-contained background worker; the canvas
 * dispatches "worldbackdropready" when the detailed landscape is available.
 * Worker-less browsers use a bounded idle-time CPU fallback.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = v => v - Math.floor(v);
const rand = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const count = v => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0;
const BUILDINGS = ['hide_tent', 'forager_hut', 'lumber_pile', 'granary', 'mud_brick_hut', 'copper_mine', 'smeltery', 'library', 'aqueduct', 'guild_hall'];
const JOBS = ['farmer', 'woodcutter', 'quarrier', 'hunter', 'scholar', 'artisan', 'miner', 'coal_miner'];
const WONDER_MAX = { megalith: 3, ziggurat: 4, colossus: 5, cathedral: 5 };
const ERAS = ['stone', 'bronze', 'iron', 'classical', 'medieval'];
// sky zenith / middle / horizon, remote rock, rock, ridge, meadow, near earth,
// water, water shade, conifers, lit leaves, masonry, roof, sunlight.
const PALETTES = {
  stone: ['#0c202e','#294851','#a0a98b','#536a73','#354e59','#405f59','#526d57','#182e32','#668e8a','#244e60','#193f3c','#55735b','#a18d6b','#705e49','#f8d5a0'],
  bronze: ['#343b57','#987663','#efc184','#a09086','#786f6c','#8c805d','#9c965d','#424c3e','#9db8a2','#397b80','#384e3e','#829054','#cead7b','#986645','#ffe0a0'],
  iron: ['#131c38','#42486b','#c49b98','#69778c','#43566c','#4a6269','#667c6b','#25393e','#7ca9b4','#315a77','#294b4a','#688577','#a3a69e','#505970','#ffd4a1'],
  classical: ['#173650','#638b9b','#ead7ac','#8aabb3','#5b8390','#5d8c80','#829c75','#294c48','#83b9ba','#367789','#254f47','#73916a','#eee3c5','#a96f53','#fff0c0'],
  medieval: ['#201e43','#655b80','#e7b99b','#7c7b9a','#535d7c','#54697a','#738b6c','#233d3e','#9cb8ba','#3c6a85','#244b45','#68826a','#b9b29d','#56546b','#ffdfa0']
};
const DAY = {
  stone: ['#88b4bb','#cad4bf','#faedcb'], bronze: ['#9cbfbe','#e6d5ad','#ffe4a6'],
  iron: ['#9eb8ca','#d1d7ce','#f8e1bb'], classical: ['#8abcca','#c8dcd2','#fff0ca'],
  medieval: ['#b3bdce','#ded5c4','#ffe7b7']
};
function palette(era, paper) {
  const p = PALETTES[era].slice();
  if (paper) { p.splice(0, 3, ...DAY[era]); p[7] = '#4d6354'; p[10] = '#3f6551'; }
  return p;
}
function poly(c, pts, fill, stroke, width = 1) {
  c.beginPath(); pts.forEach((p,i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
function line(c, pts, color, width = 1) {
  c.beginPath(); pts.forEach((p,i) => i ? c.lineTo(...p) : c.moveTo(...p));
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function ellipse(c, x, y, rx, ry, color) {
  c.beginPath(); c.ellipse(x,y,Math.max(.001,rx),Math.max(.001,ry),0,0,TAU); c.fillStyle=color; c.fill();
}
function gradient(c, x, y, x2, y2, stops) {
  const g=c.createLinearGradient(x,y,x2,y2); stops.forEach((v,i)=>g.addColorStop(i/(stops.length-1),v)); return g;
}
function glow(c,x,y,r,color,alpha=.25) {
  const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');
  c.save();c.globalAlpha=alpha;c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
}
const SETTLEMENT_PLAZA={x:-92,y:785};
const WORK_TYPES=['lumber_pile','granary','copper_mine','smeltery','library','aqueduct','guild_hall'];
const HOME_TYPES=['hide_tent','forager_hut','mud_brick_hut'];
const WORK_ANCHORS={lumber_pile:[-325,675],granary:[-225,625],copper_mine:[-605,705],
  smeltery:[-490,915],library:[-200,785],aqueduct:[430,835],guild_hall:[-110,920]};
const SETTLEMENT_RESERVES=[
  {left:-555,right:-385,top:585,bottom:670},
  {left:SETTLEMENT_PLAZA.x-43,right:SETTLEMENT_PLAZA.x+43,top:SETTLEMENT_PLAZA.y-22,bottom:SETTLEMENT_PLAZA.y+23},
  {left:-325,right:-245,top:575,bottom:700},{left:-405,right:-325,top:630,bottom:763},
  {left:-245,right:-135,top:470,bottom:526},{left:-127,right:-17,top:445,bottom:533},
  {left:67,right:177,top:397,bottom:550},{left:174,right:290,top:405,bottom:560},
  {left:-280,right:-168,top:420,bottom:522},{left:-510,right:-350,top:400,bottom:542},
  {left:-422,right:-335,top:420,bottom:530},{left:328,right:415,top:420,bottom:530},
  {left:277,right:713,top:420,bottom:590},
  ...Object.values(WORK_ANCHORS).map(([x,y])=>({left:x-51,right:x+51,top:y-108,bottom:y+11})),
  ...Array.from({length:7},(_,f)=>{const x=-310-f%3*70,y=728+Math.floor(f/3)*49;return{left:x-40,right:x+47,top:y-16,bottom:y+37};})
];
const settlementSites={home:[{x:-90,y:675},{x:15,y:865},{x:-213,y:931}],work:[],next:0,buckets:new Map()};
function registerSettlementBox(box){
  for(let by=Math.floor(box.top/140);by<=Math.floor(box.bottom/140);by++)for(let bx=Math.floor(box.left/140);bx<=Math.floor(box.right/140);bx++){
    const key=`${bx}:${by}`;if(!settlementSites.buckets.has(key))settlementSites.buckets.set(key,[]);settlementSites.buckets.get(key).push(box);
  }
}
for(const p of settlementSites.home)registerSettlementBox({left:p.x-47,right:p.x+47,top:p.y-75,bottom:p.y+9});
function rectsOverlap(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
function settlementAddress(type,index) {
  if(WORK_ANCHORS[type]&&index===0){const [x,y]=WORK_ANCHORS[type];return{x,y};}
  const family=HOME_TYPES.includes(type)?'home':'work';
  const rank=family==='home'?index*HOME_TYPES.length+HOME_TYPES.indexOf(type):(index-1)*WORK_TYPES.length+WORK_TYPES.indexOf(type);
  while(settlementSites[family].length<=rank){
    const cell=settlementSites.next++,band=Math.floor(cell/640),pool=cell%4===3?'work':'home';
    const u=frac((cell+.5)*.7548776662466927)*2-1;
    const v=frac((cell+.5)*.5698402909980532);
    const east=frac(cell*.41421356237)<.40;
    const center=pool==='home'?(east?430:-105):-65;
    const extent=pool==='home'?(east?125+band*140:250+band*150):460+band*180;
    const x=center+Math.sign(u)*Math.pow(Math.abs(u),1.18)*extent;
    const y=610+v*344,half=pool==='home'?47:49,headroom=pool==='home'?75:106;
    const box={left:x-half,right:x+half,top:y-headroom,bottom:y+9};
    if(SETTLEMENT_RESERVES.some(area=>rectsOverlap(box,area)))continue;
    let water=false;
    for(let yy=Math.max(540,box.top);yy<=Math.min(1080,box.bottom);yy+=4){
      if(box.left<riverBankX(yy,1)+13&&box.right>riverBankX(yy,-1)-13){water=true;break;}
    }
    if(water)continue;
    const keys=[];let occupied=false;
    for(let by=Math.floor(box.top/140);by<=Math.floor(box.bottom/140);by++)for(let bx=Math.floor(box.left/140);bx<=Math.floor(box.right/140);bx++){
      const key=`${bx}:${by}`;keys.push(key);
      if((settlementSites.buckets.get(key)||[]).some(other=>rectsOverlap(box,other)))occupied=true;
    }
    if(occupied)continue;
    registerSettlementBox(box);
    // Low-discrepancy candidates become collision-free plots, with no rows or
    // grid projected into the world. Plot ownership is independent of purchases.
    settlementSites[pool].push({x,y,cell});
  }
  const {x,y}=settlementSites[family][rank];return{x,y};
}
function riverX(y) {
  const u=clamp((y-520)/580,0,1.15);
  return 175+60*u+65*Math.sin(u*TAU-.2);
}
function riverWidth(y) {const u=clamp((y-520)/580,0,1.15);return 12+45*Math.pow(u,1.22);}
// Intersect each bank with the actual foothill silhouette, rather than starting
// the river at a fixed screen row below the mountains.
function riverSourceY(side) {
  let y=520;
  for(let i=0;i<12;i++)y=terrainHorizon(riverBankX(y,side));
  return y;
}
function riverPath(c, begin = true) {
  if (begin) c.beginPath();
  const leftHead=riverSourceY(-1),rightHead=riverSourceY(1);
  c.moveTo(riverBankX(leftHead,-1),leftHead);
  for(let y=Math.ceil(leftHead/5)*5;y<=1080;y+=5)c.lineTo(riverBankX(y,-1),y);
  for(let y=1080;y>=rightHead;y-=5)c.lineTo(riverBankX(y,1),y);
  c.lineTo(riverBankX(rightHead,1),rightHead);
  c.closePath();
}
/* -------------------------------------------------------------------------
 * TERRAIN & RIVERBANKS
 * World-space shaded turf, a recessed quarry, and a narrow meandering river.
 * Surface maps bake alongside the mountains. Open ground replaces terrace rows;
 * shadows stay with their objects, and the river is shared by boats and plants.
 * ---------------------------------------------------------------------- */
const TERRAIN_BIOMES = {
  stone: {grass:[104,130,90],shade:[44,77,65],light:[151,165,117],soil:[122,107,78],stone:[146,153,131],water:[67,103,103]},
  bronze: {grass:[148,150,94],shade:[78,99,67],light:[191,184,128],soil:[157,132,91],stone:[174,165,132],water:[78,116,112]},
  iron: {grass:[108,132,111],shade:[48,79,79],light:[156,172,143],soil:[116,111,97],stone:[146,157,155],water:[65,107,123]},
  classical: {grass:[127,153,107],shade:[53,94,77],light:[181,192,138],soil:[169,148,108],stone:[187,187,158],water:[67,121,126]},
  medieval: {grass:[107,140,94],shade:[43,78,66],light:[164,181,123],soil:[136,118,85],stone:[157,162,138],water:[69,113,123]}
};
function riverBankX(y,side) {
  // Fine erosion is separate from the large meander, so the navigable center
  // and long-established settlement/boat coordinates retain their meaning.
  const perspective=clamp((y-510)/530,.08,1);
  const erosion=(rockNoise(y*.041,side*7,851)-.5)*3.6+(rockNoise(y*.137,side*13,421)-.5)*1.4;
  return riverX(y)+side*riverWidth(y)+erosion*perspective;
}
function terrainHorizon(x) {return 506+Math.sin(x*.006)*24+Math.sin(x*.013+2)*13;}
function terrainColor(rgb) {return `rgb(${rgb.map(v=>Math.round(v)).join(',')})`;}
class TerrainLayer {
  constructor({era,paper,palette:p,left,right,scale,deferBake=false}) {
    this.era=era;this.paper=paper;this.p=p;
    this.left=left-45;this.right=right+45;this.span=this.right-this.left;
    this.rasterScale=Math.min(.76,Math.max(.46,scale*.76));
    const biome=TERRAIN_BIOMES[era];this.colors={};
    for(const [key,rgb]of Object.entries(biome))this.colors[key]=paper?rgb.slice():mixColor(rgb,[24,46,60],key==='water'?.16:.27);
    this.css=Object.fromEntries(Object.entries(this.colors).map(([key,rgb])=>[key,terrainColor(rgb)]));
    this.ready=false;this.ground=null;this.water=null;
    this.bars=[{y:611,side:-1,length:29,reach:.10},{y:685,side:1,length:36,reach:.11},
      {y:821,side:-1,length:41,reach:.09},{y:914,side:1,length:37,reach:.10},{y:1008,side:-1,length:44,reach:.11}];
    this.rocks=[{x:-653,y:607,w:53,h:23,seed:71},{x:587,y:624,w:47,h:21,seed:131},
      {x:-799,y:867,w:66,h:27,seed:211},{x:768,y:912,w:61,h:24,seed:307},
      {x:35,y:919,w:44,h:18,seed:419}];
    this.bridge={left:riverBankX(760,-1)-14,right:riverBankX(760,1)+14,y:760};
    if(!deferBake)this.bake();
  }
  setOccupancy(areas,plants=[]){
    // Decorative outcrops yield to later settlement growth without relocating
    // any retained rock or existing building address. This is evaluated on the
    // current state, never baked into the asynchronous surface maps.
    this.activeRocks=this.rocks.filter(rock=>{
      const box={left:rock.x-rock.w*.60,right:rock.x+rock.w*.60,top:rock.y-rock.h-3,bottom:rock.y+7};
      if(areas.some(a=>box.left<a.right&&box.right>a.left&&box.top<a.bottom&&box.bottom>a.top))return false;
      for(let y=Math.max(540,box.top);y<=Math.min(1080,box.bottom);y+=4){
        if(box.left<riverBankX(y,1)+3&&box.right>riverBankX(y,-1)-3)return false;
      }
      return !plants.some(p=>p.x+3>box.left&&p.x-3<box.right&&p.y+3>box.top&&p.y-3<box.bottom);
    });
  }
  traceRiver(c,begin=true){riverPath(c,begin);}
  shore(y){return {left:riverBankX(y,-1),right:riverBankX(y,1)};}
  barReach(y,side){
    let reach=0;
    for(const bar of this.bars)if(bar.side===side){
      const u=Math.abs((y-bar.y)/bar.length);
      if(u<1)reach=Math.max(reach,riverWidth(y)*bar.reach*Math.pow(1-u*u,1.5));
    }
    return reach;
  }
  waterDepth(x,y){
    const {left,right}=this.shore(y);
    const wetLeft=left+this.barReach(y,-1),wetRight=right-this.barReach(y,1);
    return clamp(Math.min(x-wetLeft,wetRight-x)/Math.max(2.5,Math.min(6,(right-left)*.10)),0,1);
  }
  relief(x,y){
    const hills=13*Math.exp(-Math.pow((x+630)/430,2)-Math.pow((y-640)/225,2))
      +15*Math.exp(-Math.pow((x-670)/470,2)-Math.pow((y-720)/255,2));
    const grain=(rockFbm(x*.007,y*.018,241,3)-.5)*1.3;
    const edge=Math.min(Math.abs(x-riverBankX(y,-1)),Math.abs(x-riverBankX(y,1)));
    return hills+grain-(y-500)*.010-1.4*Math.exp(-edge/4);
  }

  bake(){
    const top=440,bottom=1100,width=Math.min(2200,Math.ceil(this.span*this.rasterScale));
    const height=Math.ceil((bottom-top)*this.rasterScale),dx=this.span/width,dy=(bottom-top)/height;
    const values=new Float32Array(width*height);
    for(let iy=0;iy<height;iy++){
      const y=top+(iy+.5)*dy;
      for(let ix=0;ix<width;ix++)values[iy*width+ix]=this.relief(this.left+(ix+.5)*dx,y);
    }
    const ground=document.createElement('canvas');ground.width=width;ground.height=height;
    const gc=ground.getContext('2d'),land=gc.createImageData(width,height),pixels=land.data;
    const water=document.createElement('canvas');water.width=width;water.height=height;
    const wc=water.getContext('2d'),wet=wc.createImageData(width,height),wp=wet.data;
    const {grass,shade,light,soil,stone}=this.colors,waterTone=this.colors.water;
    const sky=parseColor(this.p[2]),lightX=this.era==='bronze'?-.7:.7;
    for(let iy=0;iy<height;iy++){
      const y=top+(iy+.5)*dy,{left,right}=this.shore(y);
      const barLeft=this.barReach(y,-1),barRight=this.barReach(y,1);
      for(let ix=0;ix<width;ix++){
        const x=this.left+(ix+.5)*dx,k=iy*width+ix,out=k*4;
        const gx=(values[iy*width+Math.min(width-1,ix+1)]-values[iy*width+Math.max(0,ix-1)])/(2*dx);
        const gy=(values[Math.min(height-1,iy+1)*width+ix]-values[Math.max(0,iy-1)*width+ix])/(2*dy);
        const normal=1/Math.sqrt(gx*gx*1.96+gy*gy*4+1),lambert=(-gx*1.4*lightX-gy*2*.55+1)*normal;
        const rough=rockNoise(x*.27,y*.43,912)-.5;
        const patch=rockNoise(x*.018,y*.041,913);
        const slope=clamp((Math.abs(gy)-.14)*1.2,0,.65);
        const edge=Math.min(Math.abs(x-left),Math.abs(x-right));
        const dry=smooth01((patch-.48)*3)*.12;
        const exposure=clamp(dry+slope*.5+Math.exp(-edge/5)*.43,0,.88);
        const shadeMix=clamp((lambert-.40)/.9,0,1);
        let r=shade[0]+(light[0]-shade[0])*shadeMix;
        let g=shade[1]+(light[1]-shade[1])*shadeMix;
        let b=shade[2]+(light[2]-shade[2])*shadeMix;
        r=r*.74+grass[0]*.26;g=g*.74+grass[1]*.26;b=b*.74+grass[2]*.26;
        r+=(soil[0]-r)*exposure;g+=(soil[1]-g)*exposure;b+=(soil[2]-b)*exposure;
        const damp=Math.exp(-edge/1.8)*(.13+rockNoise(y*.051,x*.005,621)*.10);
        r+=(shade[0]*.7-r)*damp;g+=(shade[1]*.76-g)*damp;b+=(shade[2]*.79-b)*damp;
        const haze=Math.pow(clamp((650-y)/180,0,1),2)*.13;
        r+=(sky[0]-r)*haze;g+=(sky[1]-g)*haze;b+=(sky[2]-b)*haze;
        const fleck=rough*(this.paper?6:4);
        pixels[out]=r+fleck;pixels[out+1]=g+fleck;pixels[out+2]=b+fleck*.75;pixels[out+3]=255;
        if(y<terrainHorizon(x)||x<left-dx||x>right+dx)continue;
        const coverage=clamp(Math.min(x-left,right-x)/dx+.5,0,1);
        if(!coverage)continue;
        const shoreDistance=Math.min(x-left-barLeft,right-barRight-x);
        const depth=clamp(shoreDistance/Math.max(2.5,Math.min(6,(right-left)*.10)),0,1);
        const exposed=shoreDistance<0;
        const bedNoise=rockNoise(x*.17,y*.27,331);
        const reflected=clamp((650-y)/200,0,.34);
        const deep=mixColor(waterTone,parseColor(this.p[9]),depth*.62);
        const shallow=mixColor(stone,soil,.32+bedNoise*.19);
        let wr=shallow[0]+(deep[0]-shallow[0])*smooth01(depth*.95+.08);
        let wg=shallow[1]+(deep[1]-shallow[1])*smooth01(depth*.95+.08);
        let wb=shallow[2]+(deep[2]-shallow[2])*smooth01(depth*.95+.08);
        if(exposed){wr=stone[0]*.65+soil[0]*.35;wg=stone[1]*.65+soil[1]*.35;wb=stone[2]*.65+soil[2]*.35;}
        const flow=rockFbm((x-riverX(y))*.055,y*.022,533,3)-.5;
        const texture=(bedNoise-.5)*(exposed?13:(1-depth)*7+depth*3)+flow*8;
        wr+=(sky[0]-wr)*reflected;wg+=(sky[1]-wg)*reflected;wb+=(sky[2]-wb)*reflected;
        wp[out]=wr+texture;wp[out+1]=wg+texture;wp[out+2]=wb+texture*.8;wp[out+3]=Math.round(coverage*255);
      }
    }
    gc.putImageData(land,0,0);wc.putImageData(wet,0,0);
    wc.save();wc.setTransform(1/dx,0,0,1/dy,-this.left/dx,-top/dy);
    for(const bar of this.bars)for(let j=0;j<28;j++){
      const seed=j*127+bar.y,y=bar.y+(rand(seed)-.5)*bar.length*1.8;
      const reach=this.barReach(y,bar.side);if(reach<2)continue;
      const x=riverBankX(y,bar.side)-bar.side*(1+rand(seed+8)*reach*.85);
      const size=(.5+rand(seed+31)*1.8)*(.5+(y-540)/700);
      this.paintStone(wc,x,y,size,size*.55,seed,.78);
    }wc.restore();
    this.ground={canvas:ground,top,bottom};this.water={canvas:water,top,bottom};this.ready=true;
  }
  paintGround(c){
    if(this.ready){const g=this.ground;c.drawImage(g.canvas,this.left,g.top,this.span,g.bottom-g.top);}
    else {c.fillStyle=gradient(c,0,510,0,1080,[this.p[6],this.p[7]]);c.fillRect(this.left,440,this.span,700);}
  }
  paintWater(c){
    if(this.ready){const w=this.water;c.drawImage(w.canvas,this.left,w.top,this.span,w.bottom-w.top);}
    else {c.fillStyle=gradient(c,0,480,0,1050,[this.p[8],this.p[9]]);c.fillRect(this.left,440,this.span,680);}
  }
  paintSurfaceDetails(c,left,right){
    const lo=Math.floor(left/23),hi=Math.ceil(right/23);
    for(let row=0;row<36;row++)for(let cell=lo;cell<=hi;cell++){
      const seed=(cell+117)*731+row*131,y=550+row*15+rand(seed+8)*9;
      const x=cell*23+rand(seed)*20;
      if(rand(seed+31)>.53)continue;
      c.save();c.globalAlpha=.08+rand(seed+18)*.11;
      if(rand(seed+41)>.4){
        line(c,[[x-3,y+1],[x,y],[x+4+rand(seed+3)*4,y+.5]],this.css.light,.6);
        if(row>10)line(c,[[x,y],[x-1,y-2.5],[x+2,y]],this.css.shade,.55);
      }else this.paintStone(c,x,y,.5+rand(seed+5)*1.3,.65,seed,.7);
      c.restore();
    }
  }
  paintContactShadow(c,x,y,rx,ry,cast=8,strength=.28){
    const direction=this.era==='bronze'?1:-1;
    c.save();c.translate(x,y);
    const draw=(xx,yy,w,h,alpha)=>{
      c.save();c.translate(xx,yy);c.scale(w,h);
      const g=c.createRadialGradient(0,0,.03,0,0,1);g.addColorStop(0,`rgba(12,31,31,${alpha})`);g.addColorStop(.5,`rgba(12,31,31,${alpha*.55})`);g.addColorStop(1,'transparent');
      c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();
    };
    draw(direction*cast,2.2,rx+cast*.65,ry*1.6,strength*.65);
    draw(0,.6,rx*.62,ry,strength);
    c.restore();
  }
  paintBanks(c,left,right){
    // Rooted stones and eroded turf along the shared bank curves. All samples
    // are world-addressed; changing viewport width cannot reshuffle the shore.
    for(const side of [-1,1])for(let cell=0;cell<144;cell++){
      const seed=cell*139+side*811,y=542+cell*4+(rand(seed)-.5)*3;
      if(rand(seed+71)>.12+rockNoise(y*.036,side,117)*.36)continue;
      const x=riverBankX(y,side)+side*(2+rand(seed+8)*13);
      if(x<left-8||x>right+8)continue;
      const perspective=.25+(y-540)/650,rx=(.9+rand(seed+13)*2.7)*perspective;
      this.paintStone(c,x,y,rx,rx*.6,seed,.63);
      if(cell%3===0){
        c.save();c.globalAlpha=.18;line(c,[[x,y-1],[x+side*(2+rand(seed)*4),y-2]],this.css.light,.65);c.restore();
      }
    }
    for(const rock of this.activeRocks||this.rocks)if(rock.x+rock.w>left&&rock.x-rock.w<right)this.paintOutcrop(c,rock);
  }
  paintStone(c,x,y,w,h,seed,alpha=1){
    c.save();c.globalAlpha*=alpha;
    poly(c,[[x-w,y],[x-w*.75,y-h*.8],[x+w*.1,y-h],[x+w,y-h*.5],[x+w*.8,y],[x-w*.3,y+h*.13]],this.css.stone);
    poly(c,[[x-w,y],[x-w*.3,y-h*.36],[x+w,y-h*.5],[x+w*.8,y]],this.css.soil);
    line(c,[[x-w*.7,y-h*.78],[x+w*.07,y-h*.96],[x+w*.7,y-h*.55]],this.css.light,Math.max(.35,w*.05));c.restore();
  }
  paintOutcrop(c,rock){
    const {x,y,w,h,seed}=rock;
    this.paintContactShadow(c,x,y,w*.7,3,5,.22);
    const outline=[[x-w*.58,y],[x-w*.54,y-h*.32],[x-w*.38,y-h*.86],
      [x-w*.10,y-h*.76],[x+w*.08,y-h],[x+w*.40,y-h*.67],[x+w*.48,y-h*.4],[x+w*.59,y]];
    c.save();poly(c,outline,this.css.stone);c.clip();
    poly(c,[[x-w*.38,y-h*.86],[x-w*.10,y-h*.76],[x+w*.08,y-h],[x+w*.40,y-h*.67],[x+w*.1,y-h*.50]],this.css.light);
    poly(c,[[x+w*.08,y-h],[x+w*.1,y-h*.50],[x+w*.59,y],[x+w*.02,y]],this.css.soil);
    c.globalAlpha=.46;
    for(let j=0;j<4;j++){
      const yy=y-h*(.18+j*.17),xx=x-w*.50+j*3;
      line(c,[[xx,yy],[xx+w*.18,yy-h*.05],[xx+w*(.3+rand(seed+j)*.15),yy+h*.025]],this.css.shade,.65);
    }
    for(let j=0;j<3;j++){
      const xx=x+(j-1)*w*.22;
      line(c,[[xx,y-h*.72],[xx+w*.04,y-h*.46],[xx-w*.05,y-h*.19]],this.css.shade,.6);
    }c.restore();
    for(let j=0;j<11;j++)this.paintStone(c,x+(rand(seed+j)-.5)*w,y+rand(seed+j+55)*5,1+rand(seed+j+33)*3,1.5,seed+j);
  }
  paintQuarry(c,x,y,copper){
    const cy=y+24;
    c.save();
    const rim=[[x-71,cy-7],[x-51,cy-22],[x-20,cy-27],[x+22,cy-22],[x+59,cy-9],[x+67,cy+10],[x+36,cy+22],[x-18,cy+24],[x-61,cy+13]];
    poly(c,rim,this.css.soil);
    const pit=[[x-55,cy-2],[x-36,cy-13],[x-5,cy-17],[x+39,cy-8],[x+49,cy+7],[x+20,cy+17],[x-30,cy+14]];
    poly(c,pit,gradient(c,x-30,cy-18,x+35,cy+17,[this.css.shade,this.css.stone]));
    line(c,[[x-65,cy-5],[x-48,cy-18],[x-20,cy-23],[x+18,cy-18]],this.css.light,1.1);
    line(c,[[x-47,cy+8],[x-30,cy+13],[x+16,cy+15],[x+43,cy+6]],this.css.soil,2.2);
    for(let j=0;j<17;j++){
      const xx=x-46+rand(j+71)*89,yy=cy-8+rand(j+52)*21;
      this.paintStone(c,xx,yy,1+rand(j+3)*3,1+rand(j+5)*1.7,j,.75);
    }
    if(copper)for(let j=0;j<7;j++)line(c,[[x-38+j*10,cy-10],[x-34+j*10,cy-4]],'#a58c64',1.3);
    // Short timber lifting frame and tools at the lip of the excavation.
    line(c,[[x+47,cy+3],[x+44,cy-28],[x+65,cy-27],[x+69,cy+8]],this.p[13],2.1);
    line(c,[[x+44,cy-28],[x+68,cy+6]],this.p[12],.8);
    line(c,[[x+57,cy-27],[x+56,cy+4]],this.css.shade,.7);
    c.fillStyle=this.p[13];c.fillRect(x+51,cy+1,10,5);
    c.restore();
  }
  paintPlaza(c,x,y){
    c.save();c.translate(x,y);c.scale(29,9);
    const g=c.createRadialGradient(0,0,.05,0,0,1);g.addColorStop(0,this.css.soil);g.addColorStop(.55,this.css.soil+'');g.addColorStop(1,'transparent');
    c.globalAlpha=.38;c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();
  }
  paintBridge(c){
    const {left,right}=this.bridge;
    const yAt=x=>this.bridge.y;
    for(const x of [left+12,right-12]){
      line(c,[[x,yAt(x)-1],[x,yAt(x)+16]],this.css.shade,2.6);
      line(c,[[x+1,yAt(x)],[x+1,yAt(x)+14]],this.css.soil,.8);
    }
    const pts=[];for(let x=left;x<=right+2;x+=2)pts.push([x,yAt(x)-4]);
    for(let x=right+2;x>=left;x-=2)pts.push([x,yAt(x)+5]);poly(c,pts,this.p[13]);
    for(let x=left;x<right;x+=4)line(c,[[x,yAt(x)-4],[x,yAt(x)+5]],this.css.stone,.6);
    for(const side of [-1,1]){
      const rail=[];for(let x=left;x<=right;x+=4)rail.push([x,yAt(x)+side*4-5]);
      line(c,rail,this.p[12],1);
      for(let x=left;x<=right;x+=16)line(c,[[x,yAt(x)+side*4],[x,yAt(x)+side*4-8]],this.p[13],1.4);
    }
  }
  paintPlot(c,x,y,index){
    poly(c,[[x-30,y],[x+23,y-5],[x+38,y+22],[x-23,y+26]],this.css.soil,this.css.shade,1.2);
    for(let r=0;r<9;r++){
      const xx=x-26+r*6.2;
      line(c,[[xx,y+1],[xx+9,y+23]],this.css.shade,1.15);
      line(c,[[xx+1.1,y+1],[xx+10,y+23]],this.css.light,.45);
    }
    if(this.era==='bronze'){
      line(c,[[x-32,y],[x-24,y+29],[x+40,y+24]],this.css.shade,4);
      line(c,[[x-32,y],[x-24,y+29],[x+40,y+24]],this.p[8],1.8);
    }
  }
  paintWaterMotion(c,time){
    c.save();riverPath(c);c.clip();
    for(let j=0;j<57;j++){
      const u=frac(rand(j+17)+time*.009),y=545+u*525;
      const x=riverX(y)+(rand(j+67)*2-1)*riverWidth(y)*.83;
      if(this.waterDepth(x,y)<.12)continue;
      const w=(1+rand(j+92)*4)*(.5+u*.65),sway=Math.sin(time*.55+j)*1.8;
      c.beginPath();c.moveTo(x-w,y);c.bezierCurveTo(x-w*.3,y-1+sway,x+w*.4,y+1+sway,x+w,y);
      c.strokeStyle=this.p[14];c.globalAlpha=(.035+rand(j+2)*.065)*Math.sin(u*Math.PI);c.lineWidth=.45+u*.55;c.stroke();
    }
    for(let j=0;j<35;j++){
      const y=555+j*13,x=riverX(y)+Math.sin(y*.041)*riverWidth(y)*.2;
      if(this.waterDepth(x,y)<.18)continue;
      const pulse=.5+.5*Math.sin(time*.8+j*4.3),w=2+j*.19+pulse*3;
      c.globalAlpha=(this.paper?.10:.14)*pulse;
      line(c,[[x-w,y],[x+w,y+.3]],this.p[14],.7);
    }
    c.restore();
  }
}

/* -------------------------------------------------------------------------
 * VEGETATION
 * Species-specific, seeded botanical sprites; world-anchored woodland groves;
 * projected clearance around cultivated land and architecture. Sprite creation
 * is independent of population/building ticks. Only near foliage moves per frame.
 * ---------------------------------------------------------------------- */
const VEGETATION_BIOMES = {
  stone: { species:['pine','birch','oak'], shadow:'#193c36', leaf:'#426c4c', light:'#a0b16b', bark:'#756c52' },
  bronze: { species:['olive','oak','pine'], shadow:'#304a3b', leaf:'#6a8050', light:'#bac18b', bark:'#8e8161' },
  iron: { species:['pine','birch','pine'], shadow:'#203c41', leaf:'#496c61', light:'#99b1a0', bark:'#7d8580' },
  classical: { species:['cypress','olive','pine'], shadow:'#234c43', leaf:'#587e59', light:'#b5c490', bark:'#8e8870' },
  medieval: { species:['oak','birch','pine'], shadow:'#204439', leaf:'#567747', light:'#b6b977', bark:'#80775e' }
};
function foliageShape(c,x,y,rx,ry,seed) {
  const pts=[];
  for(let j=0;j<15;j++){
    const a=j/15*TAU, r=.77+rand(seed+j*13)*.34;
    pts.push([x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r]);
  }
  c.beginPath();c.moveTo((pts[14][0]+pts[0][0])/2,(pts[14][1]+pts[0][1])/2);
  for(let j=0;j<15;j++){
    const next=pts[(j+1)%15];
    c.quadraticCurveTo(pts[j][0],pts[j][1],(pts[j][0]+next[0])/2,(pts[j][1]+next[1])/2);
  }
  c.closePath();
}
function vegetationTones(era,paper) {
  const b=VEGETATION_BIOMES[era];
  const shade=paper?0:.24, night=[26,47,58];
  const color=hex=>mixColor(parseColor(hex),night,shade);
  const shadow=color(b.shadow),leaf=color(b.leaf),light=color(b.light),bark=color(b.bark);
  const css=rgb=>`rgb(${rgb.map(n=>Math.round(n)).join(',')})`;
  return {rgb:{shadow,leaf,light,bark},shadow:css(shadow),leaf:css(leaf),light:css(light),bark:css(bark),
    flecks:[css(mixColor(shadow,leaf,.45)),css(leaf),css(mixColor(leaf,light,.48)),css(light)],paper};
}
function foliagePatch(c,x,y,rx,ry,seed,tones,silver=false,needle=false) {
  c.save();
  if(needle){
    c.beginPath();
    for(let j=0;j<36;j++){
      const a=j/36*TAU,r=(j%2?.55:1)*( .84+rand(seed+j)*.28);
      const point=[x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r];
      if(j)c.lineTo(...point);else c.moveTo(...point);
    }c.closePath();
  }else foliageShape(c,x,y,rx,ry,seed);
  c.clip();
  // One light field across the entire crown, rather than a shiny radial lobe
  // on every twig. Small opaque brush marks describe actual leaf clusters.
  const H=tones.height||270;
  const g=gradient(c,-H*.32,-H,H*.32,-H*.12,[tones.light,tones.leaf,tones.shadow]);
  c.fillStyle=g;c.fillRect(x-rx*1.3,y-ry*1.3,rx*2.6,ry*2.6);
  for(let j=0;j<115;j++){
    const xx=x+(rand(seed+j*31)-.5)*rx*2.3,yy=y+(rand(seed+j*47+9)-.5)*ry*2.3;
    const brightness=.50-xx/H*.37-(yy+H*.62)/H*.50+(rand(seed+j*5)-.5)*.80;
    const lightness=clamp(Math.floor(brightness*4),0,3);
    c.fillStyle=tones.flecks[lightness];c.globalAlpha=.65+rand(j+seed+90)*.30;
    const size=.8+rand(j*3+seed)*1.65;
    if(needle){
      c.fillRect(xx,yy,size*2.5,.65);
      c.fillRect(xx+size*.7,yy-1,.7,size*2);
    }else{
      c.fillRect(xx,yy,silver?size*2.2:size*1.6,size*.75);
      c.fillRect(xx+size*.4,yy-.5,size*.7,size*1.5);
    }
  }
  // Fine sky holes expose twigs; these erase leaves, never the separate trunk.
  c.globalCompositeOperation='destination-out';c.globalAlpha=.7;
  for(let j=0;j<5;j++){
    const xx=x+(rand(seed+j+18)-.5)*rx*1.8,yy=y+(rand(seed+j+38)-.5)*ry*1.8;
    c.fillRect(xx,yy,.8+rand(seed+j)*1.3,.6+rand(seed+j+8));
  }
  c.restore();
}
function makeVegetationSprite(kind,variant,tones) {
  const small=['fern','shrub','reed'].includes(kind),w=kind==='fern'?224:small?144:256,h=small?144:310;
  const anchorX=w/2,anchorY=h-12,artHeight=small?112:270;
  const make=()=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
  const trunk=make(),crown=make();
  const wood=trunk.getContext('2d'),leaf=crown.getContext('2d');
  wood.translate(anchorX,anchorY);leaf.translate(anchorX,anchorY);
  const seed=variant*257+['pine','birch','oak','olive','cypress','fern','shrub','reed'].indexOf(kind)*1009+17;
  const H=artHeight;
  tones={...tones,height:H};
  if(kind==='olive'){
    const css=rgb=>`rgb(${rgb.map(n=>Math.round(n)).join(',')})`;
    const sage=mixColor(tones.rgb.leaf,tones.paper?[151,166,136]:[79,104,98],.45);
    const silver=mixColor(tones.rgb.light,tones.paper?[185,196,158]:[137,151,130],.36);
    tones={...tones,leaf:css(sage),light:css(silver),flecks:[tones.shadow,css(sage),css(mixColor(sage,silver,.6)),css(silver)]};
  }
  const branch=(points,width,birch=false)=>{
    wood.lineCap='round';wood.lineJoin='round';
    line(wood,points,birch?'#c3c5ad':tones.bark,width);
    if(width>2)line(wood,points.map(([x,y])=>[x-width*.18,y]),birch?'#e1dcc3':tones.flecks[1],Math.max(.5,width*.19));
  };
  if(kind==='pine'){
    const lean=(rand(seed)-.5)*13;
    branch([[0,0],[lean*.3,-H*.45],[lean,-H*.98]],5);
    // Individual whorls, staggered tips and open trunk gaps give an asymmetric
    // conifer silhouette. No single triangular crown is used.
    for(let j=11;j>=0;j--){
      const u=j/12,y=-H+u*H*.81+(rand(seed+j+33)-.5)*9;
      const spread=H*(.025+Math.pow(u,.8)*.23)*( .78+rand(seed+j*11)*.28);
      for(const side of [-1,1]){
        const tip=side*spread*(.82+rand(seed+j+side+55)*.28),drop=4+u*12;
        branch([[lean*(1-u),y],[tip*.6,y+drop*.4],[tip,y+drop]],1.1+u*.8);
        for(let k=0;k<3;k++){
          const f=.35+k*.32;
          foliagePatch(leaf,tip*f,y+drop*f-2,3+spread*.27,4+u*6,seed+j*43+k*7+side,tones,false,true);
        }
      }
      if(j%3!==0)foliagePatch(leaf,lean*(1-u),y+2,spread*.28+2,6+u*3,seed+j*51,tones,false,true);
    }
  }else if(kind==='cypress'){
    branch([[0,0],[-2,-H*.5],[1,-H]],4);
    for(let j=22;j>=0;j--){
      const u=j/23,y=-H+u*H*.88;
      const radius=3+H*.105*Math.pow(Math.sin(u*Math.PI),.8);
      const x=(rand(seed+j)-.5)*radius*.5;
      foliagePatch(leaf,x,y,radius*(.8+rand(seed+j+8)*.35),10+rand(seed+j+19)*5,seed+j*37,tones,false,true);
    }
  }else if(kind==='oak'||kind==='olive'||kind==='birch'){
    const birch=kind==='birch',olive=kind==='olive',tips=[];
    const bend=(rand(seed+4)-.5)*(olive?25:12);
    if(olive)poly(wood,[[-7,0],[-9,-H*.12],[5,-H*.22],[-12,-H*.35],[-6,-H*.43],[3,-H*.43],[0,-H*.33],[15,-H*.22],[0,-H*.11],[6,0]],tones.bark);
    else poly(wood,[[-5,0],[-2,-H*.17],[bend-3,-H*.43],[bend+4,-H*.43],[4,-H*.13],[8,0]],birch?'#bfc2ad':tones.bark);
    const limb=(x,y,length,angle,depth,id)=>{
      const reach=birch?.68:olive?1.02:.88;
      const ex=clamp(x+Math.sin(angle)*length*reach,-H*.33,H*.33),ey=y-Math.cos(angle)*length;
      const mx=x+(ex-x)*.42+(rand(id)-.5)*6,my=y+(ey-y)*.48;
      branch([[x,y],[mx,my],[ex,ey]],1.1+depth*(birch?.8:olive?2:2.1),birch);
      if(depth===0){tips.push({x:ex,y:ey,seed:id,radius:birch?12:olive?17:20});return;}
      if(depth<=2)tips.push({x:ex,y:ey+5,seed:id+821,radius:birch?15:olive?22:27});
      const spread=(birch?.30:olive?.57:.48)+(rand(id+15)-.5)*.18;
      limb(ex,ey,length*.67,clamp(angle-spread,-1.12,1.12),depth-1,id+73);
      limb(ex,ey,length*.65,clamp(angle+spread,-1.12,1.12),depth-1,id+139);
      if(depth<=2&&rand(id+7)>.23)tips.push({x:mx,y:my+9,seed:id+831,radius:birch?13:olive?21:25});
    };
    const rootY=-H*(olive?.19:birch?.31:.22);
    for(let k=0;k<3;k++)limb(bend,rootY,H*(birch?.28:.27),[-.54,.04,.57][k]*(olive?1.3:1),3,seed+k*401);
    tips.sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const tip of tips){
      const radius=tip.radius*(.83+rand(tip.seed)*.35);
      foliagePatch(leaf,tip.x,tip.y,radius*(olive?1.2:1),radius*(birch?.95:.8),tip.seed,tones,olive);
    }
    if(birch)for(let j=0;j<16;j++){
      const y=-9-j*H*.026,x=bend*(-y/(H*.43));
      line(wood,[[x-2,y],[x+1+rand(seed+j)*3,y-.4]],'#455c54',.8);
    }
    else for(let j=0;j<9;j++)line(wood,[[-3+j*.7,0],[bend-2+j*.5,-H*.4]],tones.shadow,.55);
    // Root flares join the trunk to the forest floor.
    branch([[-10,1],[-2,-3],[0,-12]],2,birch);branch([[12,1],[4,-2],[1,-11]],1.8,birch);
  }else if(kind==='fern'){
    for(let j=0;j<9;j++){
      const angle=-1.3+j*.32+(rand(seed+j)-.5)*.15,length=45+rand(seed+j*5)*49;
      const points=[];
      for(let k=0;k<=12;k++){
        const u=k/12;
        points.push([Math.sin(angle)*length*u,-Math.cos(angle)*length*u+Math.pow(u,3)*length*.3]);
      }
      line(leaf,points,tones.leaf,1);
      for(let k=1;k<11;k++){
        const [x,y]=points[k],u=k/12,reach=Math.sin(u*Math.PI)*length*.17;
        for(const side of [-1,1])poly(leaf,[[x,y],[x+side*reach,y+reach*.2],[x+side*reach*.65,y-reach*.35],[x,y-2]],k%3?tones.leaf:tones.light);
      }
    }
  }else if(kind==='shrub'){
    for(let j=0;j<11;j++){
      const x=(rand(seed+j)-.5)*72,y=-12-rand(seed+j+55)*30;
      branch([[0,0],[x*.5,y*.5],[x,y]],1.1);
      foliagePatch(leaf,x,y,13+rand(seed+j+9)*7,10+rand(seed+j+12)*8,seed+j*51,tones);
    }
  }else if(kind==='reed'){
    for(let j=0;j<19;j++){
      const x=(rand(seed+j)-.5)*46,height=25+rand(seed+j+3)*70,bend=(rand(seed+j+7)-.5)*30;
      leaf.beginPath();leaf.moveTo(x,0);leaf.quadraticCurveTo(x+bend*.2,-height*.7,x+bend,-height);
      leaf.strokeStyle=j%3?tones.leaf:tones.light;leaf.lineWidth=.7+rand(seed+j)*.6;leaf.stroke();
      if(j%4===0){line(leaf,[[x+bend,-height],[x+bend+1,-height+9]],tones.bark,2.7);}
      else poly(leaf,[[x,-height*.3],[x+bend*1.3+8,-height*.65],[x+2,-height*.2]],tones.leaf);
    }
  }
  const merged=make(),c=merged.getContext('2d');c.drawImage(trunk,0,0);c.drawImage(crown,0,0);
  const pixels=c.getImageData(0,0,w,h).data;
  let left=w,right=0,top=h,bottom=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]){
    left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
  }
  const bounds={left:(left-anchorX)/artHeight,right:(right-anchorX)/artHeight,top:(top-anchorY)/artHeight,bottom:(bottom-anchorY)/artHeight};
  return {canvas:merged,trunk,crown,anchorX,anchorY,artHeight,bounds};
}
class VegetationLayer {
  constructor(era,paper) {
    this.era=era;this.paper=paper;this.tones=vegetationTones(era,paper);
    this.species=VEGETATION_BIOMES[era].species;
    this.atlas=new Map();this.trees=[];this.undergrowth=[];
    for(const kind of [...new Set([...this.species,'fern','shrub','reed'])]){
      this.atlas.set(kind,Array.from({length:4},(_,i)=>makeVegetationSprite(kind,i,this.tones)));
    }
  }
  sprite(kind,seed){return this.atlas.get(kind)[Math.floor(rand(seed+77)*4)];}
  radius(kind,h){return h*Math.max(...this.atlas.get(kind).map(s=>Math.max(-s.bounds.left,s.bounds.right)));}
  bounds(plant,padding=0){
    const b=this.sprite(plant.kind,plant.seed).bounds;
    return {left:plant.x+b.left*plant.h-padding,right:plant.x+b.right*plant.h+padding,
      top:plant.y+b.top*plant.h-padding,bottom:plant.y+b.bottom*plant.h+padding};
  }
  drawPlant(c,plant,time=0,moving=false,alpha=1){
    const {x,y,h,kind,seed}=plant,sprite=this.sprite(kind,seed),scale=h/sprite.artHeight;
    c.save();c.translate(x,y);c.scale(scale,scale);c.globalAlpha*=alpha;
    const rect=[-sprite.anchorX,-sprite.anchorY,sprite.canvas.width,sprite.canvas.height];
    if(moving){
      c.drawImage(sprite.trunk,...rect);
      const sway=Math.sin(time*.73+seed)*.010+Math.sin(time*1.37+seed*3)*.003;
      c.transform(1,0,sway,1,0,0);c.drawImage(sprite.crown,...rect);
    }else c.drawImage(sprite.canvas,...rect);
    c.restore();
  }
  rebuild(state,entities){
    this.trees=[];this.undergrowth=[];
    const protectedAreas=[
      {left:-555,right:-385,top:585,bottom:670}, // recessed quarry
      {left:SETTLEMENT_PLAZA.x-43,right:SETTLEMENT_PLAZA.x+43,top:SETTLEMENT_PLAZA.y-22,bottom:SETTLEMENT_PLAZA.y+23} // gathering clearing
    ];
    if(state.era==='medieval')protectedAreas.push(
      {left:-319,right:-251,top:614,bottom:697},{left:-399,right:-331,top:675,bottom:758},
      {left:-505,right:-355,top:436,bottom:542});
    if(state.era==='iron')for(const x of [-380,370])protectedAreas.push({left:x-22,right:x+22,top:458,bottom:531});
    if(state.era==='classical')protectedAreas.push({left:-268,right:-182,top:445,bottom:524});
    if(state.era==='classical'||state.buildings.aqueduct>0)protectedAreas.push({left:277,right:713,top:420,bottom:590});
    for(const e of entities)if(e.x>-1800&&e.x<1800&&e.y<1030){
      const b=e.bounds||{left:e.x-49,right:e.x+49,top:e.y-106,bottom:e.y+9};
      protectedAreas.push({left:b.left-5,right:b.right+5,top:b.top-5,bottom:b.bottom+5});
    }
    if(!entities.length){for(const type of ['hide_tent','forager_hut']){const p=settlementAddress(type,0);protectedAreas.push({left:p.x-49,right:p.x+49,top:p.y-106,bottom:p.y+9});}}
    const plots=Math.min(7,1+Math.ceil(state.jobs.farmer/3));
    for(let f=0;f<plots;f++){
      const x=-310-f%3*70,y=728+Math.floor(f/3)*49;
      protectedAreas.push({left:x-39,right:x+46,top:y-15,bottom:y+36});
    }
    for(const [kind,stage]of Object.entries(state.wonders))if(stage){
      const [x,y]={megalith:[-190,518],ziggurat:[-72,525],colossus:[122,542],cathedral:[232,552]}[kind];
      protectedAreas.push({left:x-53,right:x+53,top:y-140,bottom:y+12});
    }
    this.protectedAreas=protectedAreas;
    const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    const eligible=(plant)=>{
      const box=this.bounds(plant,4);plant.bounds=box;
      if(protectedAreas.some(area=>overlaps(box,area)))return false;
      // Keep the full projected crown clear of the river.
      for(let y=Math.max(540,box.top);y<=Math.min(1080,box.bottom);y+=5){
        const bankLeft=riverBankX(y,-1)-12,bankRight=riverBankX(y,1)+12;
        if(box.left<bankRight&&box.right>bankLeft)return false;
      }
      return true;
    };
    // Stable world cells, filtered by broad ecological groves. Viewport width
    // never participates in these addresses or in the clearing decisions.
    const groves=[[-665,620,390,130,.95],[685,605,340,130,.9],[-820,879,460,180,.95],[850,872,460,185,.95],[-235,922,190,82,.56]];
    for(let row=0;row<14;row++)for(let column=-57;column<=57;column++){
      const seed=(column+61)*7919+row*131+807,x=column*30+(rand(seed)-.5)*26,y=565+row*29+(rand(seed+11)-.5)*23;
      let density=0;
      for(const [gx,gy,rx,ry,strength]of groves)density=Math.max(density,Math.exp(-Math.pow((x-gx)/rx,2)-Math.pow((y-gy)/ry,2))*strength);
      density*=.62+rockNoise(x*.008,y*.009,311)*.6;
      if(rand(seed+30)>density*.78)continue;
      const kind=this.species[Math.floor(rand(seed+51)*this.species.length)];
      const h=30+rand(seed+71)*67+(y-565)*.025;
      const plant={x,y,h,kind,seed,id:`woodland:${column}:${row}`};
      if(eligible(plant))this.trees.push(plant);
      // The understory is shorter and can occupy sheltered gaps between trees.
      if(rand(seed+88)>.47){
        const small={x:x+12,y:y+7,h:13+rand(seed+29)*15,kind:rand(seed+22)>.5?'fern':'shrub',seed:seed+100,id:`understory:${column}:${row}`};
        if(eligible(small))this.undergrowth.push(small);
      }
    }
    // Riparian rushes grow on the dry banks, never in the river channel.
    for(let j=0;j<38;j++){
      const y=583+j*11,side=j%2?1:-1,seed=j*157+901;
      const x=riverBankX(y,side)+side*(23+rand(seed)*12);
      const plant={x,y,h:13+rand(seed+3)*15,kind:'reed',seed,id:`bank:${j}`};
      if(eligible(plant))this.undergrowth.push(plant);
    }
    this.trees.sort((a,b)=>a.y-b.y||a.x-b.x);
    this.undergrowth.sort((a,b)=>a.y-b.y||a.x-b.x);
  }
  paintDistant(c,left,right){
    for(let band=0;band<2;band++)for(let cell=Math.floor((left-40)/17);cell<=Math.ceil((right+40)/17);cell++){
      const seed=(cell+250)*371+band*1313,x=cell*17+(rand(seed)-.5)*14;
      const openness=rockNoise(x*.006,band*3,71);
      if(rand(seed+6)>openness*.75+.2)continue;
      const y=terrainHorizon(x)+band*7+5;
      const kind=this.species[rand(seed+3)>.2?0:Math.floor(rand(seed+4)*this.species.length)];
      this.drawPlant(c,{x,y,h:12+rand(seed+9)*24+band*7,kind,seed},0,false,band?.84:.48);
    }
  }
  paintWoodland(c,left,right,terrain=null){
    const plants=[...this.trees,...this.undergrowth].sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const plant of plants){
      const radius=this.radius(plant.kind,plant.h);
      if(plant.x+radius<left||plant.x-radius>right)continue;
      if(!['fern','shrub','reed'].includes(plant.kind)){
        if(terrain)terrain.paintContactShadow(c,plant.x,plant.y,plant.h*.22,plant.h*.033,plant.h*.12,.25);
        else {c.save();c.globalAlpha=.14;ellipse(c,plant.x+plant.h*.11,plant.y+1,plant.h*.25,plant.h*.045,this.tones.shadow);c.restore();}
      }
      this.drawPlant(c,plant);
    }
  }
  paintForeground(c,half,time){
    const near=this.species[0];
    for(const side of [-1,1]){
      const seed=side>0?801:417;
      this.drawPlant(c,{x:side*(half+8),y:1040,h:230+rand(seed)*65,kind:near,seed},time,true,.94);
      this.drawPlant(c,{x:side*(half-55),y:1015,h:67+rand(seed+4)*35,kind:'shrub',seed:seed+4},time,true);
      for(let j=0;j<3;j++)this.drawPlant(c,{x:side*(half-21-j*25),y:1010+j*7,h:40+rand(seed+j+18)*33,kind:'fern',seed:seed+j+20},time,true);
    }
    for(let j=0;j<15;j++){
      const x=-half+rand(j*157+131)*half*2,y=987+rand(j+67)*39;
      this.drawPlant(c,{x,y,h:24+rand(j+18)*31,kind:j%4?'reed':'fern',seed:j*213+9},time,true,.9);
    }
    if(this.paper)for(let j=0;j<9;j++){
      const x=Math.sin(time*.035+j*31)*half,y=790+rand(j+801)*190-Math.sin(time*.13+j)*12;
      c.save();c.translate(x,y);c.rotate(time*.11+j);c.globalAlpha=.27;
      poly(c,[[-1.8,0],[0,-.7],[2,0],[0,.9]],this.tones.light);c.restore();
    }
  }
}

/* -------------------------------------------------------------------------
 * MOUNTAINS & ATMOSPHERE
 * This subsystem owns only the two mountain planes, cloud wisps and valley fog.
 * Geometry is sampled in world space, independently of theme and viewport size.
 * The relief is baked once; the animation loop only composites cached images.
 * ---------------------------------------------------------------------- */
function smooth01(v) {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}
function mixColor(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}
function parseColor(hex) {
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
}
// Integer hashing avoids expensive trigonometry in the relief rasterizer.
function rockHash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function rockNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth01(x - ix), fy = smooth01(y - iy);
  const a = rockHash(ix, iy, seed), b = rockHash(ix + 1, iy, seed);
  const c = rockHash(ix, iy + 1, seed), d = rockHash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function rockFbm(x, y, seed, octaves = 4) {
  let sum = 0, amplitude = .55, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += rockNoise(x, y, seed + i * 1013) * amplitude;
    total += amplitude;
    const nextX = x * 1.91 - y * .17;
    y = x * .17 + y * 1.91;
    x = nextX;
    amplitude *= .48;
  }
  return sum / total;
}
// Deliberately composed massifs, shoulders, hanging valleys and passes. These
// control points do not repeat on a fixed grid. Small-scale rock is procedural.
const MOUNTAIN_PROFILES = [
  [
    [-2050, 397], [-1800, 345], [-1620, 278], [-1480, 312], [-1320, 239],
    [-1180, 291], [-1050, 267], [-910, 324], [-785, 287], [-655, 202],
    [-570, 231], [-465, 273], [-330, 298], [-220, 251], [-95, 282],
    [50, 333], [185, 290], [325, 249], [455, 198], [560, 226],
    [695, 302], [840, 324], [970, 278], [1100, 232], [1240, 266],
    [1370, 338], [1540, 303], [1730, 363], [2050, 398]
  ],
  [
    [-2050, 471], [-1830, 406], [-1680, 356], [-1540, 390], [-1400, 421],
    [-1240, 379], [-1110, 325], [-1015, 288], [-930, 316], [-845, 241],
    [-755, 274], [-655, 350], [-555, 326], [-455, 353], [-350, 274],
    [-278, 231], [-205, 268], [-120, 350], [-15, 408], [86, 382],
    [176, 330], [267, 278], [349, 240], [424, 281], [530, 339],
    [605, 317], [705, 375], [795, 324], [910, 245], [1005, 281],
    [1125, 337], [1230, 305], [1355, 386], [1495, 343], [1650, 415],
    [1810, 388], [2050, 463]
  ]
];
const ROCK_TONES = {
  stone: { shadow: [30, 56, 66], mid: [66, 94, 98], light: [145, 162, 148], day: [139, 165, 154] },
  bronze: { shadow: [72, 69, 86], mid: [139, 112, 99], light: [228, 190, 139], day: [177, 151, 123] },
  iron: { shadow: [31, 48, 72], mid: [78, 99, 122], light: [166, 182, 186], day: [134, 159, 175] },
  classical: { shadow: [42, 75, 96], mid: [98, 133, 146], light: [204, 211, 185], day: [152, 178, 177] },
  medieval: { shadow: [48, 52, 85], mid: [99, 104, 133], light: [212, 180, 159], day: [165, 164, 175] }
};
class MountainAtmosphere {
  constructor({ era, paper, palette: p, left, right, scale, deferBake = false }) {
    this.era = era;
    this.paper = paper;
    this.palette = p;
    this.left = left - 45;
    this.right = Math.max(right + 45, 420); // Retain the snow-fed source even when portrait crops it.
    this.span = this.right - this.left;
    // World-space density is bounded separately from the native-DPR canvas.
    // The large forms, channels and grain stay fixed when this resolution changes.
    this.rasterScale = Math.min(.78, Math.max(.48, scale*.78));
    this.ready = false;
    this.ranges = null;
    this.clouds = null;
    this.mist = null;
    if(!deferBake)this.bake();
  }
  bake() {
    this.ranges = [this._bakeRange(0), this._bakeRange(1)];
    this.clouds = this._bakeAtmosphere(false);
    this.mist = this._bakeAtmosphere(true);
    this.ready = true;
  }
  skyline(x, range, detailed = true) {
    const points = MOUNTAIN_PROFILES[range];
    let i = 0;
    while (i < points.length - 2 && x > points[i + 1][0]) i++;
    const a = points[i], b = points[i + 1];
    const u = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 2)];
    // Limited Hermite tangents retain sharp shoulders without repeated triangles.
    const ma = (b[1] - before[1]) / (b[0] - before[0]) * (b[0] - a[0]) * .62;
    const mb = (after[1] - a[1]) / (after[0] - a[0]) * (b[0] - a[0]) * .62;
    const u2 = u * u, u3 = u2 * u;
    const broad = (2*u3-3*u2+1)*a[1] + (u3-2*u2+u)*ma + (-2*u3+3*u2)*b[1] + (u3-u2)*mb;
    const relief = { stone: .93, bronze: .78, iron: 1.09, classical: .90, medieval: 1 }[this.era];
    if(!detailed)return 475-(475-broad)*relief;
    const crag = (rockFbm(x*.025, 2, 117+range*31, 4)-.5) * (range ? 17 : 10);
    const chips = (rockNoise(x*.16, 7, 311+range)-.5) * (this.era==='iron' ? 6 : 3);
    return 475 - (475-broad)*relief + crag + chips;
  }
  _gullyMask(width, height, top, dx, dy, range) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.setTransform(1/dx, 0, 0, 1/dy, -this.left/dx, -top/dy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const points = MOUNTAIN_PROFILES[range];
    const strokeChannel = (start, end, bend, depth, seed) => {
      const position = u => [
        start[0]+(end[0]-start[0])*u + Math.sin(u*Math.PI)*bend + Math.sin(u*7+seed)*u*3,
        start[1]+(end[1]-start[1])*u
      ];
      // Continuous tapered beds avoid repeated round-cap dots at segment joins.
      for (const spread of [2.7, 1.4, .65]) {
        const outline=[];
        for(let j=0;j<=36;j++){
          const u=j/36, point=position(u), radius=(.4+u*4)*spread;
          outline.push([point[0]-radius,point[1]]);
        }
        for(let j=36;j>=0;j--){
          const u=j/36, point=position(u), radius=(.4+u*4)*spread;
          outline.push([point[0]+radius,point[1]]);
        }
        c.save();c.filter='blur(1.4px)';
        poly(c,outline,`rgba(255,255,255,${depth*.22})`);c.restore();
      }
    };
    for (let i=1;i<points.length-1;i++) {
      if (points[i][1]>=points[i-1][1] || points[i][1]>=points[i+1][1]) continue;
      const summit=points[i][0], y=3;
      const direction = i%2 ? -1 : 1;
      const foot = summit + direction*(70+rand(i+range)*95);
      if (Math.max(summit,foot)<this.left-150 || Math.min(summit,foot)>this.right+150) continue;
      const endY=310+rand(i)*35;
      strokeChannel([summit+3,y],[foot,endY],direction*23,.90,i);
      // Tributaries join downstream, giving a legible drainage hierarchy.
      for(let branch=0;branch<3;branch++) {
        const join=.48+branch*.13;
        const to=[summit+(foot-summit)*join+Math.sin(join*Math.PI)*direction*23,y+(endY-y)*join];
        const side=branch%2 ? -1 : 1;
        const from=[summit+side*(34+branch*24),y+25+branch*27];
        strokeChannel(from,to,-side*(9+branch*4),.6,branch+i);
      }
    }
    return c.getImageData(0,0,width,height).data;
  }
  _bakeRange(range) {
    // A real heightfield, viewed obliquely: x is horizontal, z runs toward the
    // viewer, and elevation projects upward. Front strips overwrite rear strips.
    // Lighting uses the heightfield normals, not a screen-space emboss filter.
    const top=130, bottom=660, base=560;
    const width=Math.min(2300,Math.ceil(this.span*this.rasterScale));
    const height=Math.ceil((bottom-top)*this.rasterScale);
    const depthCount=range?560:330, back=-190, front=410;
    const dx=this.span/width, dy=(bottom-top)/height, dz=(front-back)/(depthCount-1);
    const heights=new Float32Array(width*depthCount);
    const gullies=this._gullyMask(width,depthCount,back,dx,dz,range);
    const seed=range?8317:4111;
    const profileStep=1.5,profileLeft=this.left-45;
    const profile=new Float32Array(Math.ceil((this.span+90)/profileStep)+2);
    for(let i=0;i<profile.length;i++)profile[i]=this.skyline(profileLeft+i*profileStep,range,false);
    const profileAt=x=>{const u=clamp((x-profileLeft)/profileStep,0,profile.length-1.001),i=Math.floor(u);return profile[i]+(profile[i+1]-profile[i])*(u-i);};
    for(let iz=0;iz<depthCount;iz++) {
      const z=back+iz*dz;
      for(let ix=0;ix<width;ix++) {
        const x=this.left+(ix+.5)*dx;
        const warp=(rockNoise(x*.004,z*.005,seed)-.5)*33;
        const summit=base-profileAt(x+warp);
        const ridgeZ=(rockNoise(x*.004,2,seed+19)-.5)*36;
        const distance=z-ridgeZ;
        const shoulder=distance<0?112:168+rockNoise(x*.003,3,seed)*38;
        const envelope=Math.exp(-Math.pow(Math.abs(distance/shoulder),1.42));
        const bedrock=rockFbm(x*.010,z*.016,seed+97,4)-.5;
        const flow=rockNoise(x*.008,z*.009,seed+81)*2-1;
        const ridge=1-flow*flow;
        const grain=(rockNoise(x*.12,z*.13,seed+51)-.5)*.65;
        const cut=gullies[(iz*width+ix)*4+3]/255;
        const broad=summit*envelope;
        const carving=bedrock*broad*.27+(ridge-.5)*broad*.08;
        const crag=(rockFbm(x*.047,z*.037,seed+233,3)-.5)*8*Math.exp(-z*z/7000);
        const strata=this.era==='bronze'?Math.sin(broad*.23+rockNoise(x*.008,z*.009,seed+44)*2.6)*.9:0;
        heights[iz*width+ix]=Math.max(0,broad+carving+crag+strata+grain-cut*9*smooth01((z+12)/70));
      }
    }
    // The headwaters are part of the heightfield: lowering the channel changes
    // normals, shadows, banks and occlusion, rather than painting over the rock.
    const drainage=[];
    if(range===1){
      const mouth=riverX((riverSourceY(-1)+riverSourceY(1))*.5);
      let previousBed=Infinity;
      for(let iz=0;iz<depthCount;iz++){
        const z=back+iz*dz,t=clamp(z/220,0,1);
        const x=349+(mouth-349)*smooth01(t)+(Math.sin(t*14)*13+Math.sin(t*31)*3)*Math.sin(t*Math.PI);
        const ix=clamp(Math.round((x-this.left)/dx-.5),0,width-1);
        const original=heights[iz*width+ix];
        const active=z>=18;
        const bed=active?Math.min(original-5,previousBed-dz*.18):original;
        if(active)previousBed=bed;
        const w=(1.2+10.8*Math.pow(t,1.4))*(.86+rockNoise(z*.025,2,582)*.28);
        drainage.push({x,w,bed,active});
        if(!active)continue;
        for(let col=Math.max(0,Math.floor(ix-w*3.6/dx));col<=Math.min(width-1,Math.ceil(ix+w*3.6/dx));col++){
          const xx=this.left+(col+.5)*dx,d=Math.abs(xx-x);
          const valley=Math.exp(-Math.pow(d/(w*2.7),2));
          const k=iz*width+col;
          const cut=valley*(4+7*smooth01(t))*(.8+rockNoise(xx*.08,z*.06,714)*.4);
          heights[k]=Math.min(heights[k]-cut,heights[k]+(bed-heights[k])*Math.exp(-Math.pow(d/(w*.85),4)));
        }
      }
    }
    if(range===1){
      for(let iz=0;iz<depthCount;iz++){
        const z=back+iz*dz;if(z<18||z>100)continue;
        const t=clamp((z-18)/82,0,1),join=drainage[iz].x;
        const branches=[{x:join+(1-smooth01(t))*45,w:1.0+t*.8},{x:join-(1-smooth01(t))*31,w:.8+t*.65}];
        drainage[iz].branches=branches;
        for(const branch of branches){
          const ix=Math.round((branch.x-this.left)/dx-.5);
          for(let col=Math.max(0,ix-5);col<=Math.min(width-1,ix+5);col++){
            const xx=this.left+(col+.5)*dx,d=Math.abs(xx-branch.x);
            heights[iz*width+col]-=Math.exp(-Math.pow(d/(branch.w*2.4),2))*3.8*Math.sin(t*Math.PI);
          }
        }
      }
    }
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d'), pixels=c.createImageData(width,height), data=pixels.data;
    const tones=ROCK_TONES[this.era], sky=parseColor(this.palette[2]);
    let shadow=tones.shadow, mid=tones.mid, light=tones.light;
    if(this.paper) {
      shadow=mixColor(shadow,tones.day,.18);
      mid=mixColor(mid,tones.day,.23);
      light=mixColor(light,[246,230,193],.16);
    }
    const haze=mixColor(sky,this.paper?[169,191,194]:[112,136,161],range?.38:.52);
    const lightX=this.era==='bronze'?-.62:.62, lightZ=.38, lightUp=.73;
    const sample=(ix,iz)=>heights[clamp(iz,0,depthCount-1)*width+clamp(ix,0,width-1)];
    // The shadow probes are aligned with the light and expressed in world units.
    const probes=[12,31,65].map(d=>({ix:Math.round(lightX*d/dx),iz:Math.round(lightZ*d/dz),rise:lightUp*d}));
    for(let ix=0;ix<width;ix++) {
      const x=this.left+(ix+.5)*dx;
      let previousY=0,previousR=0,previousG=0,previousB=0,hasPrevious=false,crest=bottom;
      for(let iz=0;iz<depthCount;iz++) {
        const z=back+iz*dz, elevation=sample(ix,iz);
        const projectedY=base-elevation+z*.22;
        crest=Math.min(crest,projectedY);
        const gx=(sample(ix+1,iz)-sample(ix-1,iz))/(dx*2);
        const gz=(sample(ix,iz+1)-sample(ix,iz-1))/(dz*2);
        const normal=1/Math.sqrt(gx*gx+gz*gz+1);
        const lambert=(-gx*lightX-gz*lightZ+lightUp)*normal;
        let occlusion=0;
        for(const probe of probes) if(sample(ix+probe.ix,iz+probe.iz)>elevation+probe.rise)occlusion+=.09;
        const pigment=rockNoise(x*.15,z*.17,991)-.5;
        const illumination=clamp(.28+lambert*.68-occlusion+pigment*.024,0,1);
        const from=illumination<.53?shadow:mid, to=illumination<.53?mid:light;
        const blend=illumination<.53?illumination/.53:(illumination-.53)/.47;
        let red=from[0]+(to[0]-from[0])*blend;
        let green=from[1]+(to[1]-from[1])*blend;
        let blue=from[2]+(to[2]-from[2])*blend;
        const foot=smooth01((projectedY-360)/220);
        const fog=(range?.055:.33)+foot*(range?.41:.31);
        red+=(haze[0]-red)*fog;green+=(haze[1]-green)*fog;blue+=(haze[2]-blue)*fog;
        {
          const snowLine=(this.era==='iron'?222:242)+(rockFbm(x*.018,z*.024,461,3)-.5)*43;
          const snow=smooth01((elevation-snowLine)/33)*smooth01((normal-.32)*2.4)*.91;
          red+=((this.paper?230:197)-red)*snow;
          green+=((this.paper?231:211)-green)*snow;
          blue+=((this.paper?218:219)-blue)*snow;
        }
        if(range===1&&drainage[iz]?.active){
          const channel=drainage[iz],d=Math.abs(x-channel.x);
          const irregular=rockNoise(x*.35,z*.26,628);
          const wet=1-smooth01((d-channel.w*(.32+irregular*.22))/Math.max(1,channel.w*.20));
          const bank=(1-smooth01((d-channel.w*.9)/Math.max(2,channel.w*.7)))*(1-wet);
          red*=1-bank*.15;green*=1-bank*.13;blue*=1-bank*.08;
          if(wet>0){
            const t=clamp(z/220,0,1);
            const tone=TERRAIN_BIOMES[this.era].water;
            const target=mixColor(mixColor(tone,parseColor(this.palette[9]),.62),sky,.34);
            const slope=iz>0?(drainage[iz-1].bed-channel.bed)/dz:0;
            const cascade=smooth01((slope-.6)*.8)*smooth01((rockNoise(x*.31,z*.6,713)-.43)*4);
            const glacial=mixColor(this.paper?[138,168,170]:[98,131,147],target,t);
            const water=mixColor(glacial,this.paper?[222,231,219]:[172,199,202],cascade*.72);
            const strength=wet*(.80+irregular*.16)*smooth01((z-18)/16);
            red+=(water[0]-red)*strength;green+=(water[1]-green)*strength;blue+=(water[2]-blue)*strength;
          }
        }
        if(range===1&&drainage[iz]?.branches){
          for(const branch of drainage[iz].branches){
            const d=Math.abs(x-branch.x),strength=(1-smooth01(d/branch.w))*.65;
            if(strength<=0)continue;
            const ice=rockNoise(x*.17,z*.42,743)>.55;
            const tone=ice?(this.paper?[220,229,219]:[173,198,207]):(this.paper?[138,157,156]:[104,134,145]);
            red+=(tone[0]-red)*strength;green+=(tone[1]-green)*strength;blue+=(tone[2]-blue)*strength;
          }
        }
        if(hasPrevious) {
          const y0=Math.max(0,Math.ceil((Math.min(projectedY,previousY)-top)/dy));
          const y1=Math.min(height-1,Math.floor((Math.max(projectedY,previousY)-top)/dy));
          for(let iy=y0;iy<=y1;iy++) {
            const screenY=top+(iy+.5)*dy;
            const u=clamp((screenY-previousY)/(projectedY-previousY||1),0,1);
            const out=(iy*width+ix)*4;
            data[out]=previousR+(red-previousR)*u;
            data[out+1]=previousG+(green-previousG)*u;
            data[out+2]=previousB+(blue-previousB)*u;
            data[out+3]=255;
          }
        }
        previousY=projectedY;previousR=red;previousG=green;previousB=blue;hasPrevious=true;
      }
      // One-pixel analytical coverage preserves a clean, anti-aliased skyline.
      const edge=clamp(Math.floor((crest-top)/dy),0,height-1);
      const alpha=clamp((top+(edge+1)*dy-crest)/dy,0,1);
      const edgeOffset=(edge*width+ix)*4;
      if(!data[edgeOffset+3]){
        // A subpixel crest can leave more than one unpainted row. Extend the
        // closest actual surface color rather than introducing a black fringe.
        let row=edge+1;
        while(row<height&&!data[(row*width+ix)*4+3])row++;
        if(row<height){
          const below=(row*width+ix)*4;
          data[edgeOffset]=data[below];data[edgeOffset+1]=data[below+1];data[edgeOffset+2]=data[below+2];
        }else continue;
      }
      data[edgeOffset+3]=Math.round(alpha*255);
    }
    c.putImageData(pixels,0,0);
    return {canvas,top,bottom};
  }
  _bakeAtmosphere(mist) {
    const top=mist?365:68, bottom=mist?575:365;
    const width=Math.min(1400,Math.ceil(this.span*.45)), height=mist?120:150;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d'), img=c.createImageData(width,height);
    const warm=parseColor(this.palette[2]), cool=parseColor(this.palette[1]);
    for(let iy=0;iy<height;iy++)for(let ix=0;ix<width;ix++) {
      const x=this.left+(ix+.5)/width*this.span,y=top+(iy+.5)/height*(bottom-top);
      const n=rockFbm(x*(mist?.006:.0038),y*(mist?.026:.020),mist?331:701,4);
      const drift=rockNoise(x*.0015,4,901);
      let alpha,rgb;
      if(mist) {
        const band=Math.exp(-Math.pow((y-477-drift*35)/29,2));
        const lower=Math.exp(-Math.pow((y-536+drift*12)/13,2));
        alpha=(band*.3+lower*.20)*smooth01((n-.22)*2.1);
        rgb=mixColor(warm,this.paper?[221,226,206]:[147,171,180],.4);
      } else {
        const envelope=Math.exp(-Math.pow((y-195-drift*67)/55,2));
        const density=smooth01((n-.43)*5.5);
        alpha=density*envelope*(this.paper?.33:.22);
        const underside=smooth01((y-190)/120);
        rgb=mixColor(mixColor(cool,[214,218,213],.55),warm,underside*.75);
      }
      const k=(iy*width+ix)*4;
      img.data[k]=rgb[0];img.data[k+1]=rgb[1];img.data[k+2]=rgb[2];img.data[k+3]=Math.round(alpha*255);
    }
    c.putImageData(img,0,0);
    return {canvas,top,bottom};
  }
  paintRange(c,range) {
    if(!this.ready){
      // Immediate first paint while detailed rock is generated off-thread.
      // It uses the same composed ridge profile and world-space camera.
      const points=[[this.left,660]];
      for(let x=this.left;x<=this.right+3;x+=3)points.push([x,this.skyline(x,range)]);
      points.push([this.right,660]);
      poly(c,points,gradient(c,0,220,0,610,[this.palette[range?4:3],this.palette[2]]));
      return;
    }
    const r=this.ranges[range];
    c.drawImage(r.canvas,this.left,r.top,this.span,r.bottom-r.top);
  }
  paintClouds(c,time) {
    if(!this.ready)return;
    const cloud=this.clouds;
    const drift=Math.sin(time*.012)*18;
    c.drawImage(cloud.canvas,this.left+drift,cloud.top,this.span,cloud.bottom-cloud.top);
  }
  paintMist(c,time) {
    if(!this.ready)return;
    const fog=this.mist;
    c.save();c.globalAlpha=.86+Math.sin(time*.065)*.06;
    c.drawImage(fog.canvas,this.left+Math.sin(time*.023)*11,fog.top+Math.sin(time*.035)*2,this.span,fog.bottom-fog.top);
    c.restore();
  }
}

// The worker is assembled from the very same generator and small pure helpers.
// No fetched scripts, runtime dependencies, server, or duplicated terrain model.
function mountainWorkerSource() {
  const helpers=[smooth01,mixColor,parseColor,rockHash,rockNoise,rockFbm,poly,gradient,line,ellipse,riverX,riverWidth,riverBankX,riverSourceY,riverPath,terrainHorizon,terrainColor];
  return [
    'const document={createElement:()=>new OffscreenCanvas(1,1)};const TAU=Math.PI*2;',
    `const clamp=${clamp.toString()},frac=${frac.toString()},rand=${rand.toString()};`,
    `const MOUNTAIN_PROFILES=${JSON.stringify(MOUNTAIN_PROFILES)};`,
    `const ROCK_TONES=${JSON.stringify(ROCK_TONES)};`,
    `const TERRAIN_BIOMES=${JSON.stringify(TERRAIN_BIOMES)};`,
    ...helpers.map(fn=>fn.toString()),
    MountainAtmosphere.toString(),TerrainLayer.toString(),
    `self.onmessage=({data})=>{
      try{
        const scene=new MountainAtmosphere(data),terrain=new TerrainLayer(data);
        const surfaces=[...scene.ranges,scene.clouds,scene.mist,terrain.ground,terrain.water];
        const maps=surfaces.map(({canvas,top,bottom})=>({bitmap:canvas.transferToImageBitmap(),top,bottom}));
        self.postMessage({maps},maps.map(map=>map.bitmap));
      }catch(error){self.postMessage({error:String(error)});}
      self.close();
    };`
  ].join('\n');
}

/* Cached axonometric architecture. All local artwork is rooted at the door sill. */
class SettlementArchitecture {
  constructor(era,paper,palette) {
    this.era=era;this.paper=paper;this.palette=palette;this.cache=new Map();this.landmarks=new Map();this.wonders=new Map();
    const themes={
      stone:{wall:[177,159,119],shade:[117,107,78],roof:[124,107,69],wood:[105,84,57]},
      bronze:{wall:[199,163,119],shade:[143,112,81],roof:[161,104,69],wood:[105,83,56]},
      iron:{wall:[163,169,155],shade:[104,117,115],roof:[87,106,116],wood:[102,87,64]},
      classical:{wall:[225,216,184],shade:[151,158,143],roof:[166,104,75],wood:[111,88,62]},
      medieval:{wall:[214,201,164],shade:[144,144,119],roof:[85,101,111],wood:[88,73,55]}
    };
    const raw=themes[era]||themes.stone,night=[29,48,58],css=v=>`rgb(${v.map(n=>Math.round(n)).join(',')})`;
    this.rgb={};for(const [key,value]of Object.entries(raw))this.rgb[key]=paper?value:mixColor(value,night,.22);
    this.t={};for(const [key,value]of Object.entries(this.rgb))this.t[key]=css(value);
    this.t.lit=css(mixColor(this.rgb.wall,[247,226,174],.45));
    this.t.dark=css(mixColor(this.rgb.shade,[23,39,42],.55));
    this.t.thatch=css(mixColor(this.rgb.roof,[183,164,105],.50));
    this.t.window=paper?'#616e60':'#f0c681';this.t.metal=paper?'#536b66':'#526967';
    this.t.glass=paper?'#7aada6':'#c6b274';this.t.fabric=paper?'#c9b98d':'#a39c7d';
  }
  _tone(base,amount){const value=this.rgb[base]||this.rgb.wall;return `rgb(${mixColor(value,amount>0?[249,235,194]:[22,37,41],Math.abs(amount)).map(n=>Math.round(n)).join(',')})`;}
  _face(c,points,seed,kind='plaster',base=this.t.wall,shadow=this.t.shade){
    c.save();poly(c,points);c.clip();
    let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;for(const p of points){l=Math.min(l,p[0]);r=Math.max(r,p[0]);t=Math.min(t,p[1]);b=Math.max(b,p[1]);}
    c.fillStyle=gradient(c,l,t,r,b,[base,shadow]);c.fillRect(l-1,t-1,r-l+2,b-t+2);
    if(kind==='stone'||kind==='brick'){
      const course=kind==='brick'?4.7:7;
      for(let yy=Math.floor(t/course)*course;yy<b;yy+=course){
        c.globalAlpha=.23;line(c,[[l,yy],[r,yy]],this.t.dark,.55);
        const size=kind==='brick'?9:13;
        for(let xx=l-10+(Math.floor(yy/course)%2)*size*.5;xx<r;xx+=size){line(c,[[xx,yy],[xx,yy+course]],this.t.dark,.45);}
      }
    }
    for(let j=0;j<94;j++){
      const x=l+rand(seed+j*13)*(r-l),y=t+rand(seed+j*37+5)*(b-t);
      c.globalAlpha=.06+rand(seed+j)*.11;c.fillStyle=j%4?this.t.lit:this.t.dark;
      c.fillRect(x,y,.5+rand(seed+j+7)*1.8,.35+rand(seed+j+11)*.65);
    }c.restore();
  }
  _roof(c,points,seed,kind='tile'){
    const straw=kind==='thatch',base=straw?this.t.thatch:this.t.roof;
    c.save();poly(c,points);c.clip();
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
    c.fillStyle=gradient(c,l,t,r,b,[straw?this._tone('roof',.42):this._tone('roof',.24),base,this._tone('roof',-.26)]);c.fillRect(l-1,t-1,r-l+2,b-t+2);
    if(straw){for(let j=0;j<78;j++){
      const x=l+rand(seed+j*17)*(r-l),y=t+rand(seed+j*41)*(b-t),length=4+rand(seed+j+2)*11;
      c.globalAlpha=.22+rand(j+seed)*.19;line(c,[[x,y],[x+2,y+length]],j%3?this.t.lit:this.t.dark,.45);
    }}else{
      for(let yy=t;yy<b;yy+=4){c.globalAlpha=.22;line(c,[[l,yy],[r,yy+3]],this.t.lit,.55);
        for(let xx=l+(Math.floor(yy/4)%2)*3;xx<r;xx+=6)line(c,[[xx,yy],[xx+1.2,yy+4]],this.t.dark,.5);}
    }
    c.restore();line(c,[points[0],points[1]],straw?this.t.thatch:this.t.lit,.8);
  }
  _window(c,x,y,w=6,h=9,arched=false){
    c.fillStyle=this.t.dark;
    if(arched){c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+w*.5);c.arc(x+w*.5,y+w*.5,w*.5,Math.PI,0);c.lineTo(x+w,y+h);c.closePath();c.fill();}
    else c.fillRect(x-.7,y-.7,w+1.4,h+1.4);
    c.fillStyle=this.t.window;c.fillRect(x+.8,y+1,w-1.6,h-1.2);
    line(c,[[x+w*.5,y+1],[x+w*.5,y+h]],this.t.wood,.7);line(c,[[x+.5,y+h*.53],[x+w-.5,y+h*.53]],this.t.wood,.65);
    line(c,[[x-1.4,y+h+1],[x+w+1.4,y+h+1]],this.t.lit,1.3);
  }
  _door(c,x,y,w=12,h=20,arched=false){
    if(arched){c.beginPath();c.moveTo(x,y);c.lineTo(x,y-h+w*.5);c.arc(x+w*.5,y-h+w*.5,w*.5,Math.PI,0);c.lineTo(x+w,y);c.closePath();c.fillStyle=this.t.dark;c.fill();}
    else{c.fillStyle=this.t.dark;c.fillRect(x-1,y-h-1,w+2,h+1);}
    this._face(c,[[x+1,y],[x+1,y-h+2],[x+w-1,y-h+2],[x+w-1,y]],91,'plaster',this.t.wood,this.t.dark);
    for(let j=0;j<4;j++)line(c,[[x+2+j*(w-3)/4,y-1],[x+2+j*(w-3)/4,y-h+3]],this.t.dark,.6);
    line(c,[[x+1,y-h*.4],[x+w-1,y-h*.4]],this.t.metal,.8);ellipse(c,x+w-3,y-h*.5,.7,.9,this.t.lit);
  }
  _pot(c,x,y,r=4){
    ellipse(c,x+.7,y+.5,r*1.05,r*.36,this.t.dark);
    c.fillStyle=gradient(c,x-r,y-r*2,x+r,y,[this._tone('roof',.28),this.t.roof,this._tone('roof',-.30)]);
    c.beginPath();c.moveTo(x-r*.46,y-r*1.75);c.bezierCurveTo(x-r*1.2,y-r,x-r*.9,y-.2,x-r*.45,y);c.lineTo(x+r*.45,y);c.bezierCurveTo(x+r*.9,y-.2,x+r*1.2,y-r,x+r*.46,y-r*1.75);c.closePath();c.fill();
    ellipse(c,x,y-r*1.75,r*.54,r*.21,this.t.lit);ellipse(c,x,y-r*1.75,r*.37,r*.13,this.t.dark);
  }
  _barrel(c,x,y,r=5){
    this._face(c,[[x-r,y-1],[x-r*.8,y-r*2],[x+r*.8,y-r*2],[x+r,y-1],[x+r*.6,y],[x-r*.6,y]],111,'plaster',this._tone('wood',.22),this.t.wood);
    ellipse(c,x,y-r*2,r*.8,r*.25,this.t.wood);for(const yy of [y-r*.4,y-r*1.55])line(c,[[x-r*.94,yy],[x+r*.94,yy]],this.t.metal,.8);
    for(let j=-2;j<=2;j++)line(c,[[x+j*r*.3,y-1],[x+j*r*.27,y-r*1.8]],this.t.dark,.35);
  }
  _arch(c,cx,base,w,h,seed){
    const r=w*.5,spring=base-h+r;
    c.beginPath();c.rect(cx-r-4,base-h-4,w+8,h+4);
    c.moveTo(cx-r,base+1);c.lineTo(cx-r,spring);c.arc(cx,spring,r,Math.PI,0);c.lineTo(cx+r,base+1);c.closePath();
    c.fillStyle=this.t.wall;c.fill('evenodd');
    for(let j=0;j<=9;j++){const a=Math.PI+j*Math.PI/9;line(c,[[cx+Math.cos(a)*r,spring+Math.sin(a)*r],[cx+Math.cos(a)*(r+4),spring+Math.sin(a)*(r+4)]],this.t.shade,.7);}
    for(let j=0;j<4;j++){const yy=base-j*(h-r)/4;line(c,[[cx-r-4,yy],[cx-r,yy]],this.t.shade,.5);line(c,[[cx+r,yy],[cx+r+4,yy]],this.t.shade,.5);}
  }
  _building(c,type,seed){
    const t=this.t;
    if(type==='hide_tent'){
      // Bent ridge, stretched hide panels, tension lines and a genuine opening.
      c.beginPath();c.moveTo(-36,0);c.quadraticCurveTo(-27,-20,-14,-47);c.lineTo(17,-38);c.quadraticCurveTo(26,-23,35,-8);c.lineTo(2,5);c.closePath();
      c.fillStyle=gradient(c,-30,-44,26,3,[this._tone('wall',.23),t.wall,t.shade]);c.fill();
      c.beginPath();c.moveTo(-14,-47);c.quadraticCurveTo(-7,-21,2,5);c.lineTo(35,-8);c.quadraticCurveTo(20,-19,17,-38);c.closePath();c.fillStyle=this._tone('wall',-.22);c.fill();
      c.beginPath();c.moveTo(-7,2);c.quadraticCurveTo(-5,-16,-13,-38);c.quadraticCurveTo(3,-19,7,3);c.closePath();c.fillStyle=t.dark;c.fill();
      poly(c,[[-13,-37],[-6,-8],[2,2],[-1,-15]],this._tone('wall',.12));
      line(c,[[-17,-49],[20,-40]],t.wood,1.8);line(c,[[-36,0],[-14,-47],[2,5]],this._tone('wood',.25),.9);
      for(let j=0;j<8;j++){const u=j/8;line(c,[[-31+u*22,-5-u*27],[-28+u*22,-4-u*27]],t.shade,.65);}
      for(const [x,y,px,py]of [[-14,-45,-43,3],[17,-38,43,-4],[3,-1,9,6]]){line(c,[[x,y],[px,py]],t.thatch,.65);line(c,[[px,py+1],[px+1,py-3]],t.wood,1.5);}
      this._pot(c,29,2,3.8);poly(c,[[-28,2],[-22,-3],[-19,0],[-20,5]],t.fabric);
      line(c,[[-39,-2],[-38,-35]],t.wood,1.2);poly(c,[[-38,-40],[-40,-33],[-36,-33]],t.metal);
    }else if(type==='forager_hut'){
      c.fillStyle=gradient(c,-30,-28,27,0,[t.wall,t.shade]);c.beginPath();c.ellipse(-6,-18,26,14,0,0,TAU);c.fill();c.fillRect(-32,-18,52,16);ellipse(c,-6,-2,26,5,t.shade);
      for(let x=-29;x<19;x+=3.4)line(c,[[x,-23],[x,-3]],this._tone('wood',-.1),.65);
      for(let y=-20;y<-3;y+=4.2)line(c,[[-31,y],[-5,y+1],[19,y-1]],t.wall,.6);
      c.beginPath();c.moveTo(-40,-24);c.quadraticCurveTo(-30,-36,-7,-65);c.quadraticCurveTo(16,-44,29,-25);c.quadraticCurveTo(-4,-18,-40,-24);c.closePath();
      c.fillStyle=gradient(c,-25,-57,25,-19,[this._tone('roof',.45),t.thatch,this._tone('roof',-.15)]);c.fill();
      c.save();c.clip();for(let j=0;j<60;j++){const u=rand(seed+j*7),x=-37+u*64,y=-28-rand(seed+j*19)*30;line(c,[[x,y],[x+1,y+7]],j%3?t.lit:t.dark,.45);}c.restore();
      line(c,[[-40,-24],[-8,-20],[29,-25]],t.wood,1);this._door(c,-13,0,13,23,true);
      this._window(c,6,-18,5,7);poly(c,[[18,-21],[41,-17],[38,-10],[20,-13]],t.fabric);
      line(c,[[39,-12],[39,1]],t.wood,1.2);line(c,[[21,-15],[21,1]],t.wood,.9);
      this._barrel(c,28,3,4);this._pot(c,36,3,3.7);this._pot(c,-30,3,3.6);
    }else if(type==='lumber_pile'){
      for(const x of [-28,24])line(c,[[x,1],[x,-43]],t.wood,3.2);
      line(c,[[-28,-42],[24,-46]],t.wood,3);
      this._roof(c,[[-38,-38],[-11,-57],[34,-45],[25,-34]],seed,'thatch');
      for(let row=0;row<4;row++)for(let j=0;j<5-row;j++){
        const x=-20+j*10+row*4.5,y=-2-row*7;
        line(c,[[x-10,y-6],[x+4,y]],this._tone('wood',-.10),6.7);
        ellipse(c,x+4,y,3.6,3.05,this._tone('wood',.42));ellipse(c,x+4,y,2.3,1.9,this._tone('wood',.13));ellipse(c,x+4,y,1.3,1,t.thatch);ellipse(c,x+4,y,.45,.45,t.dark);
      }
      line(c,[[-36,1],[-33,-23]],t.wood,2);line(c,[[-40,-14],[-25,-14]],t.wood,2);
      line(c,[[-35,-22],[-23,-27]],t.wood,1.7);poly(c,[[-24,-29],[-20,-28],[-21,-22],[-25,-23]],t.metal);
      this._barrel(c,35,3,4);line(c,[[28,-5],[42,-11]],t.wood,3);line(c,[[29,-8],[43,-13]],t.lit,.7);
    }else if(type==='granary'){
      for(const x of [-25,-10,9,23]){line(c,[[x,-8],[x,3]],t.wood,3);ellipse(c,x,3,4.7,1.8,t.shade);}
      c.fillStyle=gradient(c,-28,-47,24,-7,[t.lit,t.wall,t.shade]);c.fillRect(-28,-43,51,32);ellipse(c,-2.5,-11,25.5,6,t.shade);ellipse(c,-2.5,-43,25.5,7,t.wall);
      this._face(c,[[-27,-42],[22,-42],[22,-12],[-27,-12]],seed,'plaster',t.wall,t.shade);
      for(let j=0;j<5;j++)line(c,[[-26,-34+j*5],[21,-34+j*5]],this._tone('wall',-.12),.45);
      this._roof(c,[[-36,-40],[-4,-66],[31,-42],[-2,-35]],seed,'thatch');
      this._window(c,-5,-31,5,9);line(c,[[-31,4],[-23,-32]],t.wood,1.5);line(c,[[-25,5],[-17,-31]],t.wood,1.5);
      for(let j=0;j<7;j++)line(c,[[-30+j,-1-j*4.3],[-24+j,-1-j*4.3]],t.thatch,1);
      for(const [x,y]of [[30,1],[37,3]]){ellipse(c,x,y-6,4.5,6.8,t.fabric);line(c,[[x-2,y-12],[x+2,y-12]],t.wood,.8);}this._pot(c,-36,3,3.7);
    }else if(type==='mud_brick_hut'){
      this._face(c,[[-30,-36],[11,-36],[11,0],[-30,0]],seed,'brick');
      this._face(c,[[11,-36],[35,-48],[35,-12],[11,0]],seed+1,'brick',this._tone('wall',-.06),t.shade);
      this._face(c,[[-30,-36],[-7,-48],[35,-48],[11,-36]],seed+2,'plaster',t.lit,t.wall);
      // Roof courtyard and parapet with a shaded interior, not a solid box roof.
      poly(c,[[-22,-38],[-5,-46],[26,-46],[9,-38]],t.dark);poly(c,[[-16,-38],[-4,-43],[19,-43],[9,-38]],this._tone('wall',-.04));
      line(c,[[-31,-36],[-8,-49],[36,-49],[36,-45]],t.lit,2.6);line(c,[[-30,-36],[11,-36],[35,-48]],t.wall,2.2);
      this._door(c,-23,0,12,24);this._window(c,-2,-28,7,10);this._window(c,18,-33,5,8);
      poly(c,[[-28,-24],[-8,-24],[-3,-16],[-28,-17]],t.fabric);line(c,[[-28,-17],[-28,1]],t.wood,1);
      for(let j=0;j<6;j++){const yy=-4-j*4,x=23+j*2;this._face(c,[[x,yy],[x+8,yy-4],[x+8,yy-1],[x,yy+3]],seed+j,'plaster',t.wall,t.shade);}
      this._pot(c,7,3,4.4);this._pot(c,-36,3,4);this._face(c,[[19,-57],[24,-57],[24,-47],[19,-47]],seed+81,'brick');line(c,[[14,-47],[14,-58]],t.wood,.85);poly(c,[[14,-58],[28,-55],[28,-50],[14,-52]],t.fabric);
    }else if(type==='copper_mine'){
      this._face(c,[[-35,0],[-33,-20],[-20,-36],[2,-41],[24,-28],[34,-4]],seed,'stone',t.shade,this._tone('shade',-.2));
      c.beginPath();c.moveTo(-15,0);c.lineTo(-15,-19);c.arc(-2,-19,13,Math.PI,0);c.lineTo(11,0);c.closePath();c.fillStyle=t.dark;c.fill();
      for(const x of [-19,15])line(c,[[x,1],[x,-36]],t.wood,4);line(c,[[-22,-35],[18,-35]],this._tone('wood',.18),5);
      for(let j=0;j<4;j++)line(c,[[-18,-7-j*8],[14,-7-j*8]],t.dark,.4);
      for(const x of [-6,5])line(c,[[x,-2],[x-6,6]],t.metal,1.3);
      line(c,[[22,1],[22,-67],[37,-74]],t.wood,3.2);line(c,[[35,1],[35,-71],[18,-64]],t.wood,2.4);
      line(c,[[22,-58],[35,-40],[22,-23],[35,-5]],t.wood,1);line(c,[[37,-73],[37,-26]],t.thatch,.7);
      ellipse(c,37,-73,3,3,t.wood);ellipse(c,37,-73,1.6,1.6,t.dark);
      poly(c,[[-37,-11],[-17,-11],[-20,-1],[-34,-1]],t.wood,t.metal,.65);line(c,[[-36,-13],[-18,-13]],t.metal,1.4);
      for(const x of [-32,-22]){ellipse(c,x,0,2.6,2.6,t.metal);ellipse(c,x,0,1.1,1.1,t.shade);}this._pot(c,-35,5,3);
      for(let j=0;j<9;j++)poly(c,[[-37+rand(seed+j)*20,-13],[-36+rand(seed+j)*20,-17-rand(j)*5],[-32+rand(seed+j)*20,-13]],t.shade);
      ellipse(c,3,-16,1.7,2.3,t.window);
    }else if(type==='smeltery'){
      this._face(c,[[-27,-28],[16,-28],[16,0],[-27,0]],seed,'brick',t.shade,this._tone('shade',-.15));
      this._face(c,[[16,-28],[35,-37],[35,-9],[16,0]],seed+3,'stone',t.wall,t.shade);
      this._roof(c,[[-34,-29],[-6,-48],[38,-36],[15,-23]],seed);
      this._face(c,[[21,-74],[29,-74],[29,-33],[21,-33]],seed+9,'brick',t.wall,t.shade);
      this._face(c,[[29,-74],[34,-77],[34,-37],[29,-33]],seed+12,'brick',t.shade,t.dark);
      line(c,[[20,-75],[29,-75],[35,-78]],t.lit,2);ellipse(c,27,-77,4,1.5,t.dark);
      c.beginPath();c.moveTo(-23,-2);c.lineTo(-23,-14);c.arc(-7,-14,16,Math.PI,0);c.lineTo(9,-2);c.closePath();c.fillStyle=gradient(c,-20,-30,10,0,[this._tone('roof',.22),t.roof,this._tone('roof',-.2)]);c.fill();
      for(let j=0;j<4;j++){const y=-5-j*5;line(c,[[-22+j*2,y],[7-j*2,y]],t.shade,.6);}
      this._door(c,-13,0,12,16,true);ellipse(c,-7,-9,4.3,5.2,this.paper?'#a15f38':'#db9e55');
      poly(c,[[12,-7],[26,-12],[33,-6],[21,-1]],t.wood);line(c,[[22,-9],[22,-21]],t.wood,1.4);poly(c,[[17,-21],[28,-21],[25,-18],[19,-18]],t.metal);
      for(let j=0;j<9;j++)ellipse(c,-38+rand(seed+j)*15,1-rand(seed+j+3)*5,2.2,1.5,t.dark);this._barrel(c,37,3,4);
    }else if(type==='library'||type==='guild_hall'){
      const guild=type==='guild_hall',roofY=guild?-58:-52,peak=guild?-86:-78;
      this._face(c,[[-31,roofY],[14,roofY],[14,0],[-31,0]],seed,guild?'plaster':'stone');
      this._face(c,[[14,roofY],[37,roofY-11],[37,-12],[14,0]],seed+2,guild?'plaster':'stone',this._tone('wall',-.05),t.shade);
      this._face(c,[[-31,roofY],[-9,peak],[14,roofY]],seed+3,guild?'plaster':'stone',t.wall,t.shade);
      this._roof(c,[[-35,roofY+1],[-10,peak-4],[16,roofY+1]],seed);
      this._roof(c,[[-10,peak-4],[14,peak-15],[43,roofY-10],[16,roofY+1]],seed+11);
      line(c,[[-10,peak-4],[14,peak-15]],t.lit,1.1);
      if(guild){
        for(const x of [-29,-9,12])line(c,[[x,roofY],[x,0]],t.wood,2.8);
        for(const y of [-7,-29,roofY+3])line(c,[[-30,y],[14,y]],t.wood,2.4);
        for(const [x,y]of [[-28,-55],[-8,-55],[-28,-28],[-8,-28]]){line(c,[[x,y],[x+17,y+23]],t.wood,1.7);line(c,[[x+17,y],[x,y+23]],t.wood,1.7);}
        line(c,[[-26,roofY+1],[-9,peak+1],[10,roofY+1]],t.wood,2);
        line(c,[[15,-28],[36,-40]],t.wood,2.1);line(c,[[25,-63],[25,-6]],t.wood,2.2);
      }else{
        for(const x of [-28,-16,-4,9]){c.fillStyle=t.lit;c.fillRect(x,-28,3.5,26);line(c,[[x-1,-27],[x+5,-27]],t.wall,1.2);line(c,[[x-1,-2],[x+5,-2]],t.wall,1.2);}
        line(c,[[-32,-31],[15,-31]],t.lit,2.1);line(c,[[-32,-33],[15,-33]],t.shade,.8);
      }
      this._door(c,-16,0,13,23,true);this._window(c,-24,-48,7,11,true);this._window(c,-3,-48,8,11,true);
      this._window(c,20,-48,7,10,true);this._window(c,20,-25,7,10,true);this._window(c,-13,peak+10,7,10,true);
      for(let j=0;j<3;j++){const y=1+j*2;poly(c,[[-34-j,y],[16+j,y],[18+j,y+1.6],[-36-j,y+1.6]],j%2?t.shade:t.wall);}
      this._face(c,[[20,guild?-95:-85],[26,guild?-95:-85],[26,guild?-78:-72],[20,guild?-78:-72]],seed+871,'brick');
      if(guild){
        line(c,[[31,-48],[43,-48],[43,-34]],t.wood,1.3);poly(c,[[36,-42],[45,-42],[45,-32],[36,-32]],t.wood,t.lit,.65);
        line(c,[[39,-39],[43,-35]],t.lit,1);line(c,[[38,-37],[42,-40]],t.lit,1);
        this._barrel(c,-38,3,4);this._pot(c,27,1,3);
      }else{
        this._barrel(c,-38,3,4);line(c,[[27,-7],[42,-7]],t.wood,2);for(const x of [29,40])line(c,[[x,-7],[x,1]],t.wood,1.1);
        for(let j=0;j<4;j++){ellipse(c,30+j*3,-9,1.4,.8,t.fabric);line(c,[[30+j*3,-9],[30+j*3,-13]],t.fabric,2);}
      }
    }else if(type==='aqueduct'){
      const xs=[-27,0,27];
      for(let j=0;j<3;j++)this._arch(c,xs[j],0,18,49,seed+j);
      this._face(c,[[-41,-53],[40,-53],[40,-48],[-41,-48]],seed,'stone',t.wall,t.shade);
      this._face(c,[[40,-53],[45,-57],[45,-5],[40,0]],seed+5,'stone',t.shade,t.dark);
      poly(c,[[-41,-54],[40,-54],[45,-58],[-36,-58]],t.shade);
      line(c,[[-39,-54],[39,-54],[43,-57]],this.t.glass,1.8);line(c,[[-42,-59],[40,-59],[45,-63]],t.lit,1.5);
      for(const x of [-40,-14,13,39]){poly(c,[[x-3,0],[x-2,-12],[x+3,-12],[x+5,0]],t.shade);line(c,[[x-3,1],[x+6,1]],t.wall,1.5);}
    }
  }
  _sprite(type,seed=0){
    const variant=Math.floor(rand(seed+83)*4),key=type+':'+variant;
    if(this.cache.has(key))return this.cache.get(key);
    const scale=1.6,x=-48,y=-104,width=96,height=114,canvas=document.createElement('canvas');
    canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);const c=canvas.getContext('2d');c.setTransform(scale,0,0,scale,-x*scale,-y*scale);
    this._building(c,type,variant*103+17);
    const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;let l=canvas.width,r=0,top=canvas.height,bottom=0;
    for(let yy=0;yy<canvas.height;yy++)for(let xx=0;xx<canvas.width;xx++)if(pixels[(yy*canvas.width+xx)*4+3]){l=Math.min(l,xx);r=Math.max(r,xx+1);top=Math.min(top,yy);bottom=Math.max(bottom,yy+1);}
    const bounds={left:x+l/scale,right:x+r/scale,top:y+top/scale,bottom:y+bottom/scale};
    const sprite={canvas,x,y,width,height,bounds};this.cache.set(key,sprite);return sprite;
  }
  bounds(entity){const b=this._sprite(entity.type,entity.seed).bounds,s=entity.scale||1;return {left:entity.x+b.left*s,right:entity.x+b.right*s,top:entity.y+b.top*s,bottom:entity.y+b.bottom*s};}
  paint(c,entity){const s=this._sprite(entity.type,entity.seed),scale=entity.scale||1;c.drawImage(s.canvas,entity.x+s.x*scale,entity.y+s.y*scale,s.width*scale,s.height*scale);}
  paintMotion(c,entity,time){
    const {type,x,y,seed}=entity,scale=entity.scale||1;c.save();c.translate(x,y);c.scale(scale,scale);
    const chimneys={forager_hut:[-4,-58,.40],mud_brick_hut:[22,-57,.28],smeltery:[27,-77,.78],guild_hall:[23,-95,.36],library:[23,-85,.25]};
    if(chimneys[type]){const [sx,sy,strength]=chimneys[type];for(let j=0;j<7;j++){
      const u=((time*.065+j/7+rand(seed))%1+1)%1;c.globalAlpha=(1-u)*.12;ellipse(c,sx+Math.sin(seed+u*4)*u*13,sy-u*54*strength,1.5+u*7,2+u*5,this.palette[2]);}c.globalAlpha=1;}
    if(type==='smeltery'){
      glow(c,-7,-9,18,this.palette[14],.12+Math.sin(time*7+seed)*.018);
      poly(c,[[-10,-5],[-9,-11],[-7,-16+Math.sin(time*8)*1.5],[-5,-10],[-4,-5]],'#e3ad65');
    }
    if(type==='copper_mine'){
      c.save();c.translate(29,-19);c.rotate(time*.33);c.strokeStyle=this.t.wood;c.lineWidth=1.5;c.beginPath();c.arc(0,0,8,0,TAU);c.stroke();for(let j=0;j<8;j++){const a=j*TAU/8;line(c,[[0,0],[Math.cos(a)*8,Math.sin(a)*8]],this.t.lit,.7);}c.restore();
    }
    if(type==='aqueduct'){c.globalAlpha=.25;line(c,[[-38,-54],[38,-54]],this.t.glass,.6);}
    if(type==='guild_hall'){
      const sway=Math.sin(time*1.6+seed)*1.4;poly(c,[[31,-58],[44,-56+sway],[42,-48+sway],[31,-50]],'#b78d72');line(c,[[31,-61],[31,-47]],this.t.wood,.8);
    }
    c.restore();
  }
  _cachedArt(map,key,frame,draw){
    if(map.has(key))return map.get(key);
    const [x,y,w,h]=frame,density=1.6,canvas=document.createElement('canvas');canvas.width=Math.ceil(w*density);canvas.height=Math.ceil(h*density);
    const c=canvas.getContext('2d');c.setTransform(density,0,0,density,-x*density,-y*density);draw(c);
    const sprite={canvas,x,y,width:w,height:h};map.set(key,sprite);return sprite;
  }
  _landmark(c,kind){
    const t=this.t;
    if(kind==='windmill'){
      this._face(c,[[-15,0],[-9,-48],[8,-48],[16,0]],113,'plaster',t.lit,t.shade);
      this._face(c,[[8,-48],[16,-43],[22,-6],[16,0]],114,'stone',t.shade,t.dark);
      this._roof(c,[[-16,-47],[-2,-63],[17,-47],[8,-43]],37);
      this._door(c,-5,0,9,17,true);this._window(c,-3,-38,4,7);line(c,[[-14,-4],[16,-4]],t.shade,1.2);
      this._barrel(c,-23,2,4);this._pot(c,26,2,3.4);
    }else if(kind==='watchtower'){
      this._face(c,[[-12,0],[-12,-58],[8,-58],[8,0]],71,'stone');
      this._face(c,[[8,0],[18,-7],[18,-65],[8,-58]],72,'stone',t.shade,t.dark);
      poly(c,[[-17,-56],[9,-56],[23,-65],[-3,-65]],t.wood);
      this._roof(c,[[-20,-58],[-1,-78],[26,-66],[10,-55]],27);
      for(const x of [-14,7])line(c,[[x,-57],[x,-42]],t.wood,1.5);line(c,[[-15,-44],[8,-44]],t.wood,1.7);
      this._window(c,-5,-35,4,11,true);this._door(c,-5,0,9,17,true);
      for(let j=0;j<6;j++)line(c,[[-12,-10-j*7],[8,-10-j*7]],t.shade,.5);
    }else if(kind==='temple'){
      for(let j=0;j<3;j++)poly(c,[[-45-j,j*2],[34+j,j*2],[47+j,-7+j*2],[-31-j,-7+j*2]],j%2?t.shade:t.wall);
      this._face(c,[[-34,-47],[24,-47],[24,-6],[-34,-6]],73,'stone',t.shade,t.dark);
      for(let j=0;j<6;j++){
        const x=-35+j*12;this._face(c,[[x,-46],[x+5,-46],[x+5,-5],[x,-5]],j,'plaster',t.lit,t.shade);
        line(c,[[x-2,-46],[x+7,-46]],t.lit,2.3);line(c,[[x-2,-5],[x+7,-5]],t.wall,2.5);
        line(c,[[x+2,-43],[x+2,-8]],t.shade,.4);
      }
      this._face(c,[[-41,-47],[32,-47],[32,-52],[-41,-52]],79,'stone');
      this._face(c,[[-41,-52],[-5,-76],[32,-52]],81,'plaster',t.wall,t.shade);
      poly(c,[[-29,-55],[-5,-70],[21,-55]],t.shade);line(c,[[-29,-55],[-5,-70],[21,-55]],t.lit,.8);
      this._roof(c,[[-43,-53],[-5,-79],[12,-87],[50,-61],[33,-51],[-5,-77]],59);
    }else if(kind==='castle'){
      this._face(c,[[-64,0],[-64,-38],[59,-38],[59,0]],91,'stone');
      for(let j=0;j<16;j++){
        const x=-65+j*8;this._face(c,[[x,-36],[x,-43],[x+5,-43],[x+5,-36]],j,'stone',t.wall,t.shade);
      }
      for(const [x,h]of [[-55,67],[-17,84],[44,73]]){
        this._face(c,[[x-10,0],[x-10,-h],[x+7,-h],[x+7,0]],103+x,'stone');
        this._face(c,[[x+7,0],[x+16,-7],[x+16,-h-7],[x+7,-h]],111+x,'stone',t.shade,t.dark);
        this._roof(c,[[x-14,-h],[x-1,-h-22],[x+20,-h-8],[x+8,-h+2]],83+x);
        this._window(c,x-5,-h+18,5,12,true);this._window(c,x+8,-h+26,3,10,true);
        line(c,[[x-11,-15],[x+7,-15]],t.lit,1.1);
      }
      this._face(c,[[-13,0],[-13,-39],[18,-39],[18,0]],217,'stone');this._door(c,-6,0,18,29,true);
      for(let j=0;j<6;j++)line(c,[[-5+j*3,-23],[-5+j*3,0]],t.metal,.85);
      for(const x of [-44,-33,29,37,54])this._window(c,x,-29,3,9,true);
    }
  }
  paintLandmark(c,kind,x,y,moving=false,time=0){
    if(moving){
      if(kind==='windmill'){
        c.save();c.translate(x,y-41);c.rotate(time*.28);
        for(let j=0;j<4;j++){
          c.rotate(Math.PI/2);line(c,[[0,0],[0,-32]],this.t.wood,1.7);
          poly(c,[[1,-11],[7,-11],[7,-31],[1,-31]],this.t.fabric);
          for(let k=0;k<5;k++)line(c,[[1,-12-k*4],[7,-12-k*4]],this.t.wood,.55);
        }ellipse(c,0,0,2.7,2.7,this.t.wood);ellipse(c,0,0,1.2,1.2,this.t.lit);c.restore();
      }
      if(kind==='castle'){
        const sway=Math.sin(time*1.7+19)*2;line(c,[[x-17,y-106],[x-17,y-123]],this.t.wood,.8);
        poly(c,[[x-17,y-123],[x-3,y-120+sway],[x-6,y-113+sway],[x-17,y-115]],'#a97966');
      }return;
    }
    const frame=kind==='castle'?[-80,-110,160,119]:kind==='temple'?[-55,-92,112,102]:[-42,-90,87,100];
    const s=this._cachedArt(this.landmarks,kind,frame,c=>this._landmark(c,kind));c.drawImage(s.canvas,x+s.x,y+s.y,s.width,s.height);
  }
  _scaffold(c,width,height){
    const left=-width/2,right=width/2,color=this._tone('wood',.45);
    c.save();c.globalAlpha=.78;
    for(let x=left;x<=right+.1;x+=width/4)line(c,[[x,3],[x,-height]],color,1.1);
    for(let y=0;y>=-height;y-=16){line(c,[[left-3,y],[right+3,y]],color,1.2);line(c,[[left,y],[left+width*.25,y-16]],color,.7);line(c,[[right,y],[right-width*.25,y-16]],color,.7);}
    for(let y=-5;y>-height;y-=16)line(c,[[left-3,y],[right+3,y]],this.t.wood,.6);c.restore();
  }
  _wonder(c,type,stage){
    const t=this.t;
    if(type==='megalith'){
      const stones=Array.from({length:9},(_,j)=>{const a=j*TAU/9;return{x:Math.cos(a)*34,y:Math.sin(a)*10,seed:j*97};}).sort((a,b)=>a.y-b.y);
      for(let j=0;j<stones.length;j++){
        const {x,y,seed}=stones[j];if(j>=stage*3)continue;
        const h=stage===1?12+rand(seed)*8:29+rand(seed)*8,w=5+rand(seed+5)*3;
        this._face(c,[[x-w,y],[x-w-1,y-h+4],[x-1,y-h-2],[x+w,y-h+2],[x+w-1,y]],seed,'stone',t.shade,this._tone('shade',-.2));
        poly(c,[[x-1,y-h-2],[x+w,y-h+2],[x+w-1,y],[x+1,y-2]],t.wall);
      }
      if(stage===3)for(let j=0;j<5;j++){
        const a=j*TAU/5,x=Math.cos(a)*30,y=Math.sin(a)*10;
        this._face(c,[[x-11,y-31],[x-11,y-37],[x+11,y-36],[x+12,y-31]],j+301,'stone',t.wall,t.shade);
      }
      if(stage<3)this._scaffold(c,82,35);
    }else if(type==='ziggurat'){
      for(let j=0;j<stage;j++){
        const width=94-j*19,y=-j*18,depth=11;
        this._face(c,[[-width/2,y],[width/2,y],[width/2,y-15],[-width/2,y-15]],j+7,'brick');
        this._face(c,[[width/2,y],[width/2+7,y-depth],[width/2+7,y-15-depth],[width/2,y-15]],j+71,'brick',t.shade,t.dark);
        poly(c,[[-width/2,y-15],[width/2,y-15],[width/2+7,y-15-depth],[-width/2+7,y-15-depth]],t.lit);
        for(let k=0;k<Math.max(1,6-j);k++){
          const xx=-width/2+9+k*13;this._face(c,[[xx,y-2],[xx,y-12],[xx+4,y-12],[xx+4,y-2]],j*29+k,'plaster',t.shade,t.dark);
        }
      }
      const h=stage*18;
      poly(c,[[-9,1],[9,1],[5,-h+3],[-5,-h+3]],t.shade);
      for(let j=0;j<stage*6;j++)line(c,[[-9+j*.04,-j*2.8],[9-j*.04,-j*2.8]],t.lit,.75);
      if(stage===4){this._face(c,[[-10,-71],[10,-71],[10,-86],[-10,-86]],811,'brick');this._door(c,-3,-71,7,12);poly(c,[[-12,-86],[1,-93],[13,-86]],t.roof);}
      if(stage<4)this._scaffold(c,100,stage*18+12);
    }else if(type==='colossus'){
      this._face(c,[[-25,0],[25,0],[25,-16],[-25,-16]],17,'stone');poly(c,[[-28,-16],[25,-16],[32,-22],[-22,-22]],t.lit);
      const bronze=this.paper?'#867957':'#787c68',lit=this.paper?'#b3a575':'#a7ab87',shade=this.paper?'#565e4d':'#445d59';
      if(stage>=2){
        poly(c,[[-15,-20],[-11,-51],[-9,-69],[-2,-71],[-2,-45],[-5,-20]],bronze);poly(c,[[4,-20],[2,-45],[2,-70],[9,-68],[12,-48],[17,-20]],bronze);
        line(c,[[-9,-22],[-5,-53],[-5,-67]],lit,1.4);line(c,[[10,-22],[7,-51],[7,-65]],shade,1.6);
      }
      if(stage>=3){
        c.beginPath();c.moveTo(-9,-63);c.bezierCurveTo(-9,-77,-18,-92,-11,-99);c.lineTo(9,-99);c.bezierCurveTo(17,-93,11,-79,8,-63);c.closePath();c.fillStyle=bronze;c.fill();
        poly(c,[[-10,-96],[-3,-86],[8,-81],[5,-66],[-7,-63]],shade);line(c,[[-6,-96],[1,-90],[7,-91]],lit,1.2);
        for(let j=0;j<4;j++)line(c,[[-6+j*4,-82],[-7+j*4,-65]],lit,.65);
      }
      if(stage>=4){
        ellipse(c,-.5,-108,6.6,8.3,bronze);poly(c,[[-5,-114],[0,-118],[5,-114],[5,-107],[-5,-107]],bronze);
        line(c,[[-4,-109],[2,-110]],shade,.7);line(c,[[1,-112],[2,-106],[-1,-105]],lit,.65);
        poly(c,[[9,-96],[16,-94],[23,-79],[19,-75],[11,-87]],bronze);poly(c,[[18,-79],[23,-79],[27,-91],[23,-94]],bronze);
      }
      if(stage===5){
        poly(c,[[-11,-97],[-16,-95],[-23,-109],[-23,-124],[-18,-124],[-17,-111]],bronze);line(c,[[-20,-120],[-20,-109],[-13,-99]],lit,1.1);
        poly(c,[[-26,-125],[-15,-125],[-17,-121],[-24,-121]],shade);line(c,[[-23,-126],[-18,-126]],lit,1);
        for(let j=0;j<5;j++)line(c,[[-5+j*2.4,-115],[-6+j*3,-121+Math.abs(j-2)]],lit,.8);
        glow(c,-20,-128,18,this.palette[14],.14);poly(c,[[-23,-125],[-24,-130],[-21,-136],[-19,-130],[-17,-125]],'#e6b775');
      }
      if(stage<5)this._scaffold(c,69,stage<3?74:115);
    }else if(type==='cathedral'){
      // Long nave, transepts, paired west towers, clerestory and Gothic tracery.
      const wallHeight=stage===1?13:49;
      this._face(c,[[-39,0],[-39,-wallHeight],[17,-wallHeight],[17,0]],87,'stone');
      this._face(c,[[17,0],[45,-17],[45,-wallHeight-17],[17,-wallHeight]],88,'stone',t.shade,t.dark);
      if(stage>=2){
        this._roof(c,[[-42,-48],[-13,-78],[18,-48]],171);
        this._roof(c,[[-13,-78],[16,-94],[48,-66],[18,-48]],172);
        this._door(c,-20,0,15,28,true);
        for(const [x,y]of [[-32,-39],[-3,-39],[23,-44],[34,-51]])this._window(c,x,y,5,15,true);
        for(let j=0;j<6;j++){
          const x=-41+j*13;poly(c,[[x,0],[x+3,-34],[x+6,-34],[x+8,0]],t.shade);line(c,[[x+3,-34],[x+6,-34]],t.lit,1);
        }
      }
      if(stage>=3)for(const x of [-32,12]){
        this._face(c,[[x-8,0],[x-8,-83],[x+8,-83],[x+8,0]],x+91,'stone');
        this._face(c,[[x+8,0],[x+13,-5],[x+13,-88],[x+8,-83]],x+92,'stone',t.shade,t.dark);
        this._window(c,x-3,-73,5,16,true);this._window(c,x-3,-44,5,13,true);
        this._roof(c,[[x-11,-83],[x,-112],[x+15,-89],[x+9,-80]],x+97);
      }
      if(stage>=4){
        this._face(c,[[-9,-48],[-9,-88],[5,-88],[5,-48]],301,'stone');poly(c,[[-12,-87],[-2,-132],[10,-89]],t.roof);line(c,[[-2,-132],[2,-91]],t.lit,.7);
        ellipse(c,-12,-43,8.5,8.5,t.dark);ellipse(c,-12,-43,6.6,6.6,this.paper?'#a9b5a3':'#d4c28f');
        for(let j=0;j<10;j++){const a=j*TAU/10;line(c,[[-12,-43],[-12+Math.cos(a)*6.5,-43+Math.sin(a)*6.5]],t.wall,.7);}
        ellipse(c,-12,-43,2,2,t.roof);
      }
      if(stage===5){
        for(const [x,y]of [[-32,-111],[12,-111],[-2,-132]]){line(c,[[x,y],[x,y-7]],t.lit,.8);line(c,[[x-2,y-4],[x+2,y-4]],t.lit,.8);}
        for(let j=0;j<3;j++){
          const x=25+j*8,y=-47-j*4;c.beginPath();c.moveTo(x,y+30);c.quadraticCurveTo(x+2,y-1,x-7,y-7);c.strokeStyle=t.wall;c.lineWidth=2;c.stroke();
        }
      }
      if(stage<5)this._scaffold(c,102,stage===1?22:stage<3?65:115);
    }
  }
  paintWonder(c,type,stage,x,y){
    if(!stage)return;
    const s=this._cachedArt(this.wonders,`${type}:${stage}`,[-58,-145,116,154],c=>this._wonder(c,type,stage));
    c.drawImage(s.canvas,x+s.x,y+s.y,s.width,s.height);
  }
}


export class WorldBackdropRenderer {
  constructor(canvasId) {
    this.canvas=typeof document!=='undefined'?document.getElementById(canvasId):null;
    this.ctx=this.canvas?.getContext('2d',{alpha:false}) || null;
    this.state=null;this.time=0;this.width=0;this.height=0;this.layers=[];this.entities=[];
    this.pointer={x:0,y:0};this.aim={x:0,y:0};this.paused=false;this.destroyed=false;
    this._raf=0;this._last=null;this._signature='';this._listeners=[];this._gyro=false;
    if(!this.ctx) return;
    this.preferences={motion:'system',parallax:true,quality:'high',fps:60};
    this.motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');this.reducedMotion=Boolean(this.motion?.matches);
    this._listen(window,'resize',()=>this.resize());
    this._listen(window,'pointermove',e=>{
      this.aim.x=clamp(e.clientX/Math.max(1,this.width)*2-1,-1,1);
      this.aim.y=clamp(e.clientY/Math.max(1,this.height)*2-1,-1,1);
    },{passive:true});
    this._listen(document,'pointerleave',()=>{this.aim.x=0;this.aim.y=0;});
    this._listen(document,'visibilitychange',()=>{
      this._last=null;if(document.hidden)this._cancel();else this._schedule();
    });
    this._listen(this.motion,'change',e=>{
      this.reducedMotion=this.preferences.motion==='reduced'||(this.preferences.motion==='system'&&e.matches);this.pointer={x:0,y:0};this._last=null;this._cancel();this.draw();this._schedule();
    });
    this._frame=now=>{
      this._raf=0;
      if(this.destroyed||this.paused||document.hidden)return;
      if(this._last!==null&&now-this._last<1000/this.preferences.fps-1){this._schedule();return;}
      const dt=this._last===null?0:Math.max(0,(now-this._last)/1000);this._last=now;
      if(!this.reducedMotion) {
        this.time+=dt;const a=1-Math.exp(-dt*3.5);
        this.pointer.x=this.preferences.parallax?this.pointer.x+(this.aim.x-this.pointer.x)*a:0;this.pointer.y=this.preferences.parallax?this.pointer.y+(this.aim.y-this.pointer.y)*a:0;
      }
      // A screen moved to another monitor can change DPR without a resize event.
      if(this.dpr!==this._pixelRatio())this.resize();
      this.draw();this._schedule();
    };
    this.resize();
    this.updateState({era:'stone',pop:3});
  }
  _listen(target,event,fn,options) {
    if(!target?.addEventListener)return;target.addEventListener(event,fn,options);
    this._listeners.push(()=>target.removeEventListener(event,fn,options));
  }
  _cancel(){ if(this._raf)cancelAnimationFrame(this._raf);this._raf=0; }
  _schedule(){ if(!this.destroyed&&this.ctx&&!this.paused&&!this.reducedMotion&&!document.hidden&&!this._raf)this._raf=requestAnimationFrame(this._frame); }
  _pixelRatio(){return Math.min(window.devicePixelRatio||1,this.preferences?.quality==='low'?1:this.preferences?.quality==='balanced'?1.5:Infinity);}
  setPreferences(preferences){
    const oldDpr=this._pixelRatio();this.preferences={...this.preferences,...preferences};
    this.reducedMotion=this.preferences.motion==='reduced'||(this.preferences.motion==='system'&&Boolean(this.motion?.matches));
    this.pointer={x:0,y:0};this.aim={x:0,y:0};this._last=null;this._cancel();
    this.paused=this.preferences.motion==='static';
    if(oldDpr!==this._pixelRatio())this.resize();else this.draw();this._schedule();
  }
  pause(){this.paused=true;this._last=null;this._cancel();}
  resume(){if(this.destroyed)return;this.paused=false;this._last=null;this._schedule();}
  seek(seconds){this.time=Number.isFinite(Number(seconds))?Math.max(0,Number(seconds)):0;this._last=null;this.draw();}
  replay(){this.seek(0);this.resume();}
  destroy(){this.destroyed=true;this._cancel();this._stopMountainBake();this._listeners.forEach(off=>off());this._listeners=[];this.layers=[];this.entities=[];this.mountains=null;this.vegetation=null;this.terrain=null;this.architecture=null;this._walkingRoutes?.clear();}
  async enableGyroscope(){
    if(this.destroyed||!this.ctx||typeof DeviceOrientationEvent==='undefined')return false;
    try {
      if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')return false;
    } catch { return false; }
    if(this.destroyed)return false;
    if(!this._gyro){this._gyro=true;this._listen(window,'deviceorientation',e=>{
      if(e.gamma===null||e.beta===null)return;
      this.aim.x=clamp(e.gamma/25,-1,1);this.aim.y=clamp((e.beta-45)/30,-1,1);
    },{passive:true});}return true;
  }
  resize(){
    if(!this.ctx||this.destroyed)return;
    this.width=Math.max(1,window.innerWidth);this.height=Math.max(1,window.innerHeight);
    this.dpr=this._pixelRatio();
    this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
    this.scale=Math.max(this.height/1000,this.width/3000);
    this.half=this.width/(2*this.scale);this.worldHeight=this.height/this.scale;
    this._cache();this.draw();
  }
  updateState(s){
    if(!s||this.destroyed||!this.ctx)return;
    const next={era:ERAS.includes(s.era)?s.era:'stone',paperMode:!!s.paperMode,pop:count(s.pop),
      buildings:Object.fromEntries(BUILDINGS.map(k=>[k,count(s.buildings?.[k])])),
      wonders:Object.fromEntries(Object.entries(WONDER_MAX).map(([k,n])=>[k,clamp(count(s.wonders?.[k]),0,n)])),
      jobs:Object.fromEntries(JOBS.map(k=>[k,count(s.jobs?.[k])])),techs:[...new Set(Array.isArray(s.techs)?s.techs:[])].sort(),
      units:Object.fromEntries(['militia','spearman','swordsman','knight'].map(k=>[k,count(s.units?.[k])])),expeditionsCleared:count(s.expeditionsCleared)};
    const sig=JSON.stringify([next.era,next.paperMode,next.buildings,next.wonders,next.techs,Math.min(7,1+Math.ceil(next.jobs.farmer/3))]);
    this.state=next;
    if(sig!==this._signature){this._signature=sig;this.p=palette(next.era,next.paperMode);this._layout();this._cache();}
    if(this.reducedMotion||this.paused)this.draw();this._schedule();
  }
  _layout(){
    this.entities=[];
    for(const type of BUILDINGS)for(let i=0;i<this.state.buildings[type];i++) {
      const site=settlementAddress(type,i);
      // A type/index owns a permanent address; viewport changes cannot reshuffle it.
      this.entities.push({type,index:i,key:`${type}:${i}`,...site,seed:BUILDINGS.indexOf(type)*7919+i*101,scale:.94+rand(i*131+BUILDINGS.indexOf(type)*71)*.09});
    }
    this.entities.sort((a,b)=>a.y-b.y||a.x-b.x);
    this._displayBuildings=this.entities.length?this.entities:['hide_tent','forager_hut'].map((type,i)=>({type,index:0,key:`ambient:${type}`,...settlementAddress(type,0),seed:i+1,scale:1}));
    this._walkingRoutes=new Map();
  }
  _cache(){
    if(!this.state||!this.ctx||!this.width)return;
    // Static planes use bounded cache resolution. The presentation canvas keeps
    // native DPR; bounded caches avoid eight full-DPR framebuffer allocations.
    const density=Math.min(this.dpr,1.5,Math.sqrt(16000000/(7*(this.width+80)*(this.height+80)))), pad=40;
    const landscapeKey=JSON.stringify([this.width,this.height,this.dpr,this.state.era,this.state.paperMode]);
    const reuseLandscape=landscapeKey===this._landscapeKey;
    const previous=this.layers;
    if(!reuseLandscape){
      this._stopMountainBake();
      const options={era:this.state.era,paper:this.state.paperMode,palette:this.p,
        left:-this.half-pad/this.scale,right:this.half+pad/this.scale,scale:this.scale};
      this.mountains=new MountainAtmosphere({...options,deferBake:true});
      this.terrain=new TerrainLayer({...options,deferBake:true});
      this._landscapeKey=landscapeKey;
      this._startMountainBake(options,this.mountains);
    }
    const architectureKey=JSON.stringify([this.state.era,this.state.paperMode]);
    if(this._architectureKey!==architectureKey){this.architecture=new SettlementArchitecture(this.state.era,this.state.paperMode,this.p);this._architectureKey=architectureKey;}
    for(const entity of this._displayBuildings)entity.bounds=this.architecture.bounds(entity);
    const vegetationKey=JSON.stringify([this.state.era,this.state.paperMode]);
    if(this._vegetationKey!==vegetationKey){
      this.vegetation=new VegetationLayer(this.state.era,this.state.paperMode);
      this._vegetationKey=vegetationKey;
    }
    this.vegetation.rebuild(this.state,this.entities);
    this.terrain.setOccupancy(this.vegetation.protectedAreas,this.vegetation.trees);
    this.layers=[];
    for(let i=0;i<7;i++) {
      if(i<4&&reuseLandscape&&previous[i]){this.layers.push(previous[i]);continue;}
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil((this.width+pad*2)*density);canvas.height=Math.ceil((this.height+pad*2)*density);
      const c=canvas.getContext('2d');c.setTransform(density*this.scale,0,0,density*this.scale,density*(this.width/2+pad),density*pad);
      const left=-this.half-pad/this.scale,right=this.half+pad/this.scale;
      this._paintPlane(c,i,left,right);
      this.layers.push({canvas,pad,density});
    }
  }
  _stopMountainBake(){
    this._mountainWorker?.terminate();this._mountainWorker=null;
    if(this._mountainWorkerURL)URL.revokeObjectURL(this._mountainWorkerURL);
    this._mountainWorkerURL=null;
    if(this._mountainFallback){
      if(this._mountainFallbackIdle)window.cancelIdleCallback?.(this._mountainFallback);
      else clearTimeout(this._mountainFallback);
    }
    this._mountainFallback=0;
  }
  _startMountainBake(options,scene){
    const terrain=this.terrain;
    const current=()=>!this.destroyed&&this.mountains===scene&&this.terrain===terrain;
    const finish=()=>{
      if(!current())return;
      // Refresh the landscape from the latest state after the worker commits.
      // Existing building addresses and the camera remain fixed throughout.
      for(const i of [2,3,4,5]){
        const layer=this.layers[i];if(!layer)return;
        const {canvas,pad,density}=layer,c=canvas.getContext('2d');
        c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
        c.setTransform(density*this.scale,0,0,density*this.scale,density*(this.width/2+pad),density*pad);
        this._paintPlane(c,i,-this.half-pad/this.scale,this.half+pad/this.scale);
      }
      this.draw();
      this.canvas.dispatchEvent(new Event('worldbackdropready'));
    };
    const fallback=()=>{
      if(!current())return;
      const bake=()=>{
        this._mountainFallback=0;if(!current())return;
        // Older browsers still get a bounded, lower-resolution CPU bake after
        // the first paint. Modern browsers never perform this work on the UI.
        scene.rasterScale=Math.min(scene.rasterScale,.48);
        scene.bake();terrain.rasterScale=Math.min(terrain.rasterScale,.48);terrain.bake();finish();
      };
      this._mountainFallbackIdle=typeof window.requestIdleCallback==='function';
      this._mountainFallback=this._mountainFallbackIdle?window.requestIdleCallback(bake,{timeout:600}):setTimeout(bake,32);
    };
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){
      fallback();return;
    }
    try{
      this._mountainWorkerURL=URL.createObjectURL(new Blob([mountainWorkerSource()],{type:'text/javascript'}));
      const worker=new Worker(this._mountainWorkerURL);this._mountainWorker=worker;
      worker.onmessage=({data})=>{
        if(!current()){
          data.maps?.forEach(map=>map.bitmap.close());return;
        }
        this._stopMountainBake();
        if(data.error){fallback();return;}
        const surfaces=data.maps.map(({bitmap,top,bottom})=>{
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
          return {canvas,top,bottom};
        });
        scene.ranges=surfaces.slice(0,2);scene.clouds=surfaces[2];scene.mist=surfaces[3];scene.ready=true;
        terrain.ground=surfaces[4];terrain.water=surfaces[5];terrain.ready=true;
        finish();
      };
      worker.onerror=event=>{
        event.preventDefault();if(!current())return;
        this._stopMountainBake();fallback();
      };
      worker.postMessage(options);
    }catch{
      this._stopMountainBake();fallback();
    }
  }
  _paintPlane(c,i,left,right){
    const p=this.p,s=this.state,h=this.worldHeight+100;
    if(i===0){
      c.fillStyle=gradient(c,0,0,0,620,[p[0],p[1],p[2]]);c.fillRect(left,-100,right-left,h+100);
    }
    if(i===1){
      const moon=!s.paperMode&&(s.era==='stone'||s.era==='iron');
      const x=s.era==='bronze'?-210:195,y=moon?183:s.era==='medieval'?300:s.era==='bronze'?270:210,r=moon?29:35;
      glow(c,x,y,r*(moon?5:7),p[14],moon?.24:.38);ellipse(c,x,y,r,r,moon?'#f2e4c7':'#ffe4a9');
      if(!s.paperMode){
        if(moon){c.save();c.globalAlpha=.12;ellipse(c,x-9,y-3,6,8,p[1]);ellipse(c,x+9,y+9,4,4,p[1]);c.restore();}
        for(let n=0;n<125;n++) {const sx=left+rand(n+80)*(right-left),sy=rand(n+990)*340;
          c.globalAlpha=(.2+rand(n+15)*.5)*(moon?1:.35);ellipse(c,sx,sy,.45+rand(n+5)*.6,.45+rand(n+5)*.6,'#e3eadb');}
        c.globalAlpha=1;
      }
    }
    if(i===2||i===3){
      this.mountains.paintRange(c,i-2);
    }
    if(i===4){
      // One continuous ground surface. Later passes add objects, never repaint
      // land over distant tree crowns or introduce a second terrain horizon.
      const pts=[[left,h]];
      for(let x=left;x<=right+8;x+=8)pts.push([x,terrainHorizon(x)]);
      pts.push([right,h]);c.save();poly(c,pts);c.clip();
      this.terrain.paintGround(c);c.restore();
      this.vegetation.paintDistant(c,left,right);
      this._wonders(c,0);
      if(s.era==='iron')for(const x of [-380,370])this._watchtower(c,x,518);
      if(s.era==='medieval')this._castle(c,-430,530);
      if(s.era==='classical')this._temple(c,-225,512,1.05);
    }
    if(i===5){
      c.save();c.beginPath();c.rect(left,-100,right-left,h+200);
      riverPath(c,false);c.clip('evenodd');
      this.terrain.paintSurfaceDetails(c,left,right);
      this.terrain.paintBanks(c,left,right);
      this._quarry(c,-470,610);
      this._fields(c,0,false);c.restore();
      // Plant roots are checked against the river during placement. Paint full
      // silhouettes without terrain clipping so crowns cannot be sliced off.
      this.vegetation.paintWoodland(c,left,right,this.terrain);
    }
    if(i===6){

      this.terrain.paintBridge(c);
      for(const e of this._displayBuildings)if(this._visible(e.x,e.y,120))this.terrain.paintContactShadow(c,e.x,e.y,28*e.scale,4.5,10,.26);
      this.terrain.paintPlaza(c,SETTLEMENT_PLAZA.x,SETTLEMENT_PLAZA.y);
      if(s.era==='medieval'){this._windmill(c,-285,686,0,false);this._windmill(c,-365,747,0,false);}
    }
  }
  _visible(x,y,margin=70){return x>-this.half-margin&&x<this.half+margin&&y<this.worldHeight+margin&&y>-margin;}
  _planeDepth(index){return index>=3?.55:[0,.08,.15][index];}
  _plane(index,fn){
    const c=this.ctx,depth=this._planeDepth(index);
    c.save();c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,this.dpr*(this.width/2+this.pointer.x*depth*15),this.dpr*this.pointer.y*depth*9);
    fn(c);c.restore();
  }
  draw(time=this.time){
    if(!this.ctx||!this.state||this.destroyed||!this.layers.length)return;
    const c=this.ctx,s=this.state,p=this.p,t=this.reducedMotion?0:time;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.globalAlpha=1;
    for(let i=0;i<7;i++){
      const l=this.layers[i],depth=this._planeDepth(i);
      c.drawImage(l.canvas,-l.pad+this.pointer.x*depth*15,-l.pad+this.pointer.y*depth*9,this.width+l.pad*2,this.height+l.pad*2);
      if(i===1)this._plane(1,cc=>this._skyMotion(cc,t));
      if(i===3)this._plane(3,cc=>this.mountains.paintMist(cc,t));
      if(i===4)this._plane(4,cc=>this._wonderMotion(cc,t));
      if(i===4)this._plane(5,cc=>this._water(cc,t));
      if(i===5)this._plane(5,cc=>this._fields(cc,t,true));
      if(i===6)this._plane(6,cc=>{
        this._drawSettlement(cc,t);
        if(s.era==='medieval'){this._windmill(cc,-285,686,t,true);this._windmill(cc,-365,747,t,true);}
      });
    }
    this._plane(7,cc=>this._foreground(cc,t));
    // Screen-space vignette, independent of camera aspect ratio.
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    const v=c.createRadialGradient(this.width*.5,this.height*.45,this.height*.15,this.width*.5,this.height*.45,Math.max(this.width,this.height)*.72);
    v.addColorStop(0,'transparent');v.addColorStop(1,s.paperMode?'#694d3328':'#070d234f');c.fillStyle=v;c.fillRect(0,0,this.width,this.height);
  }
  _skyMotion(c,t){
    const s=this.state,p=this.p;
    if(s.era==='stone'&&!s.paperMode&&s.techs.includes('oral_tradition')){
      c.save();c.globalCompositeOperation='screen';
      for(let band=0;band<3;band++){
        const pts=[];for(let x=-this.half-70;x<this.half+70;x+=12)pts.push([x,150+band*20+Math.sin(x*.006+t*.09+band)*30]);
        for(let x=this.half+70;x>-this.half-70;x-=12)pts.push([x,245+band*12+Math.sin(x*.006+t*.09+band)*13]);
        c.globalAlpha=.10;poly(c,pts,gradient(c,0,120,0,280,['#67d5ba','#71c2bd00']));
      }c.restore();
    }
    this.mountains?.paintClouds(c,t);
    for(let n=0;n<7;n++){
      const x=frac(t*.008+rand(n+6))*(this.half*2+150)-this.half-75,y=300+Math.sin(n*2)*22+Math.sin(t*.2+n)*5,flap=Math.sin(t*3+n)*2;
      line(c,[[x-4,y+flap],[x,y],[x+4,y+flap]],p[4],.8);
    }

  }
  _water(c,t){
    const p=this.p,s=this.state;
    c.save();riverPath(c);c.clip();this.terrain.paintWater(c);c.restore();
    this.terrain.paintWaterMotion(c,t);
    if(s.techs.includes('caravan_trade')||s.era==='classical'){
      for(let n=0;n<2;n++){
        const progress=frac(t*.008+n*.53),y=580+progress*380,x=riverX(y),k=clamp(riverWidth(y)/57,.24,.68);
        c.save();c.translate(x,y);c.scale(k,k);
        for(let q=0;q<3;q++) {c.globalAlpha=.17-q*.04;ellipse(c,0,5+q*4,23+q*6,2,p[14]);}c.globalAlpha=1;
        poly(c,[[-25,-3],[25,-3],[15,5],[-16,5]],p[7],p[12],.8);
        line(c,[[0,-4],[0,-40]],p[12],1.4);poly(c,[[2,-38],[2,-8],[23,-11]],p[12]);
        if(s.era==='classical')for(let j=0;j<8;j++)line(c,[[-18+j*5,1],[-23+j*5,12+Math.sin(t*2)*2]],p[12],.8);
        c.restore();
      }
    }
  }
  _quarry(c,x,y){
    this.terrain.paintQuarry(c,x,y,this.state.era==='bronze'||this.state.techs.includes('copper_mining'));
  }
  _fields(c,t,moving){
    const p=this.p,s=this.state,n=Math.min(7,1+Math.ceil(s.jobs.farmer/3));
    if(!moving){
      for(let f=0;f<n;f++){
        const x=-310-f%3*70,y=728+Math.floor(f/3)*49;
        this.terrain.paintPlot(c,x,y,f);
      }return;
    }
    for(let f=0;f<n;f++){
      const x=-310-f%3*70,y=728+Math.floor(f/3)*49;
      for(let j=0;j<48;j++){
        const xx=x-23+j%8*6,yy=y+3+Math.floor(j/8)*3.4,sway=Math.sin(t*1.4+j*.13+f)*1.3;
        line(c,[[xx,yy],[xx+sway,yy-6]],p[12],.6);line(c,[[xx+sway-1.7,yy-7],[xx+sway,yy-4],[xx+sway+1.5,yy-7]],'#d6bd7d',.8);
      }
    }
  }
  _building(c,e,t,moving){
    if(moving)this.architecture.paintMotion(c,e,t);
    else this.architecture.paint(c,e);
  }
  _wheel(c,x,y,r,angle){
    c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=this.p[13];c.lineWidth=1.8;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();
    for(let j=0;j<8;j++){const a=j*TAU/8;line(c,[[0,0],[Math.cos(a)*r,Math.sin(a)*r]],this.p[12],.8);}c.restore();
  }
  _wonders(c,t){
    const roots={megalith:[-190,518],ziggurat:[-72,525],colossus:[122,542],cathedral:[232,552]};
    for(const [type,stage]of Object.entries(this.state.wonders))if(stage){const [x,y]=roots[type];this.architecture.paintWonder(c,type,stage,x,y);}
    if(this.state.era==='classical'||this.state.buildings.aqueduct>0){
      for(let tier=0;tier<(this.state.techs.includes('engineering')?2:1);tier++)for(let j=0;j<6;j++)
        this.architecture.paint(c,{type:'aqueduct',x:320+j*67,y:578-tier*43,seed:j,scale:.75});
    }
  }
  _wonderMotion(c,t){
    const s=this.state,p=this.p;
    for(const [type,max]of Object.entries(WONDER_MAX))if(s.wonders[type]===max){
      const [x,y]={megalith:[-190,500],ziggurat:[-72,488],colossus:[102,417],cathedral:[232,446]}[type];
      glow(c,x,y,58,p[14],.10+Math.sin(t*.7)*.015);
      c.save();for(let j=0;j<9;j++){
        const u=frac(t*.045+j/9);c.globalAlpha=(1-u)*.55;ellipse(c,x+Math.sin(j*4)*30,y-u*55,.8,.8,p[14]);
      }c.restore();if(type==='colossus')this._fire(c,x,y,t,.6);
    }
    if(s.era==='iron')for(const x of [-380,370])this._fire(c,x,439,t,.5);
    if(s.era==='medieval')this.architecture.paintLandmark(c,'castle',-430,530,true,t);
  }
  _temple(c,x,y,k=1){c.save();c.translate(x,y);c.scale(k,k);this.architecture.paintLandmark(c,'temple',0,0);c.restore();}
  _watchtower(c,x,y){this.architecture.paintLandmark(c,'watchtower',x,y);}
  _castle(c,x,y){this.architecture.paintLandmark(c,'castle',x,y);}
  _banner(c,x,y,t,seed){
    line(c,[[x,y+21],[x,y-6]],this.p[12],.8);const sway=Math.sin(t*2+seed)*2;
    poly(c,[[x,y-6],[x+13,y-4+sway],[x+10,y+3+sway],[x,y+2]],'#bd796b');
  }
  _windmill(c,x,y,t,moving){this.architecture.paintLandmark(c,'windmill',x,y,moving,t);}
  _fire(c,x,y,t,k){
    const p=this.p;c.save();c.translate(x,y);c.scale(k,k);glow(c,0,-4,55,p[14],.12+Math.sin(t*7)*.015);
    poly(c,[[-5,0],[-7,-7],[-2,-14+Math.sin(t*9)*2],[1,-23+Math.sin(t*11)*3],[5,-9],[6,0]],'#e99d57');
    poly(c,[[-3,0],[0,-14],[4,-4],[3,0]],'#ffe3a4');
    for(let j=0;j<7;j++){const u=frac(t*.21+j/7);c.globalAlpha=(1-u)*.65;ellipse(c,Math.sin(j*5+t)*u*9,-u*46,1-u*.6,1.4-u,p[14]);}
    c.restore();
  }
  _walkingRoute(job,index){
    const key=`${job}:${index}`;
    if(this._walkingRoutes.has(key))return this._walkingRoutes.get(key);
    const homes=this._displayBuildings.filter(e=>HOME_TYPES.includes(e.type));
    const home=homes[index%Math.max(1,homes.length)]||{...SETTLEMENT_PLAZA};
    const site=(types,fallback)=>{
      const matches=this.entities.filter(e=>types.includes(e.type));
      const e=matches[index%Math.max(1,matches.length)];
      return e?{x:e.x,y:e.y+9}:fallback;
    };
    const plot=index%Math.min(7,1+Math.ceil(this.state.jobs.farmer/3));
    const targets={
      farmer:{x:-310-plot%3*70+12,y:752+Math.floor(plot/3)*49},
      woodcutter:site(['lumber_pile'],{x:-570,y:685}),quarrier:{x:-433,y:663},hunter:{x:-580,y:875},
      scholar:site(['library'],{x:SETTLEMENT_PLAZA.x+15,y:SETTLEMENT_PLAZA.y}),
      artisan:site(['guild_hall','smeltery','granary'],SETTLEMENT_PLAZA),
      miner:site(['copper_mine'],{x:-561,y:659}),coal_miner:site(['copper_mine','smeltery'],{x:-555,y:678}),
      idle:SETTLEMENT_PLAZA,guard:{x:index%2?-220:12,y:906},trade:{x:530,y:790}
    };
    const from={x:home.x,y:home.y+9},to=targets[job]||SETTLEMENT_PLAZA;
    const leftOf=p=>p.x<riverX(p.y),points=[from];
    if(leftOf(from)!==leftOf(to)){
      const {left,right,y}=this.terrain.bridge;
      const near=leftOf(from)?left-6:right+6,far=leftOf(from)?right+6:left-6;
      points.push({x:from.x,y},{x:near,y},{x:far,y},{x:to.x,y});
    }else if(Math.abs(from.x-to.x)>80&&Math.abs(from.y-to.y)>50){
      // An inconspicuous dogleg between clearings, not a visible terrace lane.
      points.push({x:from.x+(to.x-from.x)*.54,y:from.y+(to.y-from.y)*.30});
    }
    points.push({x:to.x,y:to.y+2});
    const segments=[];let length=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
      if(distance>.01){segments.push({a,b,length:distance,start:length});length+=distance;}
    }
    const route={points,segments,length:Math.max(1,length)};this._walkingRoutes.set(key,route);return route;
  }
  _walkerAt(job,index,time,pace=1){
    const route=this._walkingRoute(job,index),phase=frac(rand(index+81)+time*(3.1+rand(index+7)*1.6)*pace/route.length);
    const forward=phase<.5,distance=(forward?phase*2:2-phase*2)*route.length;
    const s=route.segments.find(s=>distance<=s.start+s.length)||route.segments[route.segments.length-1];
    if(!s)return{x:SETTLEMENT_PLAZA.x,y:SETTLEMENT_PLAZA.y,dir:1};
    const u=clamp((distance-s.start)/s.length,0,1);
    return{x:s.a.x+(s.b.x-s.a.x)*u,y:s.a.y+(s.b.y-s.a.y)*u,dir:(s.b.x>=s.a.x?1:-1)*(forward?1:-1)};
  }
  _actors(time){
    const s=this.state,actors=[],assigned=JOBS.reduce((n,k)=>n+s.jobs[k],0),visible=Math.min(64,s.pop);
    for(let i=0;i<visible;i++){
      let job='idle',target=(i+.5)/Math.max(1,visible)*Math.max(s.pop,assigned),sum=0;
      for(const k of JOBS){sum+=s.jobs[k];if(target<sum){job=k;break;}}
      actors.push({kind:'person',job,index:i,...this._walkerAt(job,i,time),walk:Math.sin(time*6+i*3)});
    }
    let index=0;
    for(const [unit,n]of Object.entries(s.units))for(let j=0;j<Math.min(n,16-index);j++){
      actors.push({kind:'soldier',unit,index,...this._walkerAt('guard',index,time,.7),walk:Math.sin(time*5+index)});index++;
    }
    if(s.techs.includes('caravan_trade'))actors.push({kind:'cart',index:3,...this._walkerAt('trade',3,time,.55)});
    return actors;
  }
  _paintActor(c,a,time){
    const p=this.p,{x,y,dir=1}=a;
    if(a.kind==='cart'){
      c.save();c.translate(x,y);c.scale(dir*.8,.8);
      c.fillStyle=p[13];c.fillRect(-9,-7,18,6);
      poly(c,[[-9,-8],[-7,-15],[5,-15],[9,-8]],p[12]);
      this._wheel(c,-6,0,3,time*1.6);this._wheel(c,6,0,3,time*1.6);
      ellipse(c,18,-3,5,2.5,p[13]);line(c,[[15,-1],[14+Math.sin(time*4)*1.5,4],[21,4],[22,-7]],p[13],1);c.restore();return;
    }
    const colors=['#b6a078','#a38d69','#a4ada5','#998b6d','#7eaaa2','#b9937e','#8d9b99','#7b8e8b'];
    ellipse(c,x,y+.5,2.1,.7,'#18332b44');
    const gait=a.walk||0;
    line(c,[[x-.8,y-3],[x+gait,y]],p[7],.8);line(c,[[x+.8,y-3],[x-gait,y]],p[7],.8);
    c.fillStyle=a.kind==='soldier'?p[13]:(colors[JOBS.indexOf(a.job)]||p[12]);c.fillRect(x-1.5,y-7,3,4.5);
    ellipse(c,x,y-8.2,1.3,1.5,p[12]);
    if(a.kind==='soldier'){
      line(c,[[x+dir*3,y],[x+dir*3,y-16]],p[12],.8);
      if(a.unit==='knight'){ellipse(c,x,y-2,4.5,2.6,p[13]);line(c,[[x-3,y],[x-3,y+3],[x+3,y+3],[x+3,y]],p[7],.8);}
    }else if(['farmer','woodcutter','quarrier','miner','coal_miner'].includes(a.job)){
      line(c,[[x+dir*3,y-2],[x+dir*4,y-11]],p[13],.65);
      if(a.job==='farmer')for(let k=-1;k<=1;k++)line(c,[[x+dir*4+k,y-9],[x+dir*4+k,y-12]],p[12],.45);
      else line(c,[[x+dir,y-11],[x+dir*6,y-10]],p[12],1.1);
    }else if(a.job==='scholar'){c.fillStyle=p[12];c.fillRect(x+dir,y-6,3,2);}
  }
  _drawSettlement(c,time){
    const objects=this._displayBuildings.filter(e=>this._visible(e.x,e.y,120)).map(e=>({kind:'building',x:e.x,y:e.y,entity:e}));
    objects.push(...this._actors(time),{kind:'fire',...SETTLEMENT_PLAZA});
    for(let i=0;i<Math.min(6,this.state.expeditionsCleared);i++)objects.push({kind:'banner',x:SETTLEMENT_PLAZA.x-24+i*9,y:SETTLEMENT_PLAZA.y+16,index:i});
    objects.sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const item of objects){
      if(!this._visible(item.x,item.y,120))continue;
      if(item.kind==='building'){this._building(c,item.entity,time,false);this._building(c,item.entity,time,true);}
      else if(item.kind==='fire')this._fire(c,item.x,item.y,time,.65);
      else if(item.kind==='banner'){c.save();c.translate(item.x,item.y);c.scale(.55,.55);this._banner(c,0,-15,time,item.index);c.restore();}
      else this._paintActor(c,item,time);
    }
  }
  _foreground(c,t){
    const p=this.p,s=this.state;
    // Foreground foliage shares the valley transform; the ground and river
    // already extend beneath it and must not be covered by another land band.
    this.vegetation.paintForeground(c,this.half,t);
    if(!s.paperMode)for(let n=0;n<33;n++){
      const x=Math.sin(t*.08+n*7)*this.half,y=760+rand(n+90)*220+Math.sin(t*.3+n)*8;
      const alpha=.15+Math.pow(Math.sin(t*.65+n),4)*.45;
      c.save();c.globalAlpha=alpha;ellipse(c,x,y,1.1,1.1,p[14]);c.restore();
    }
  }
}
