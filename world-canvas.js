/**
 * Idlenomics — The River Remembers
 * Self-contained Canvas2D diorama. No images, fonts, libraries or network requests.
 *
 * Coordinates: world units, +x right / +y down; 1000 units high. The camera
 * always uses ONE scale for both axes. Portrait crops the valley flanks; wide
 * screens reveal them. Eight independently translated planes have overscan.
 * Buildings use permanent type/index addresses on expanding terraced roads;
 * counts are never capped. Off-camera architecture is culled before drawing.
 *
 * Public API (the existing two calls remain sufficient):
 *   new WorldBackdropRenderer('world-bg-canvas'); renderer.updateState(state);
 * Optional: pause(), resume(), seek(seconds), replay(), destroy(),
 *           enableGyroscope() (call from a user gesture on permissioned iOS).
 * Reduced motion freezes ambient animation and disables input parallax.
 * Mountain artwork bakes asynchronously in a self-contained worker; the canvas
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
function roadY(row, x) { return 650 + row*70 + .00012*x*x; }
function slot(type, index) {
  const n=index*10+BUILDINGS.indexOf(type), row=n%3, column=Math.floor(n/3);
  const side=column%2 ? 1 : -1;
  const raw=-55+side*Math.ceil(column/2)*62;
  const x=raw>160?raw+300:raw;
  return {x,y:roadY(row,x),row};
}
function riverX(y) { const u=(y-440)/560; return 40+275*u+66*Math.sin(u*TAU-1); }
function riverWidth(y) { return 9+Math.pow(clamp((y-430)/570,0,1),1.3)*125; }
function riverPath(c, begin = true) {
  if (begin) c.beginPath();
  for(let y=540;y<=1080;y+=5) c.lineTo(riverX(y)-riverWidth(y),y);
  for(let y=1080;y>=540;y-=5) c.lineTo(riverX(y)+riverWidth(y),y);
  c.closePath();
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
      {left:-548,right:-394,top:507,bottom:628}, // quarry
      {left:-64,right:28,top:819,bottom:866} // gathering circle and campfire
    ];
    if(state.era==='medieval')protectedAreas.push(
      {left:-319,right:-251,top:614,bottom:697},{left:-399,right:-331,top:675,bottom:758},
      {left:-505,right:-355,top:436,bottom:542});
    if(state.era==='iron')for(const x of [-380,370])protectedAreas.push({left:x-22,right:x+22,top:458,bottom:531});
    if(state.era==='classical')protectedAreas.push({left:-268,right:-182,top:445,bottom:524});
    if(state.era==='classical'||state.buildings.aqueduct>0)protectedAreas.push({left:277,right:713,top:420,bottom:590});
    for(const e of entities)if(e.x>-1800&&e.x<1800&&e.y<1030){
      protectedAreas.push({left:e.x-30,right:e.x+30,top:e.y-68,bottom:e.y+7});
    }
    if(!entities.length){protectedAreas.push({left:-90,right:-30,top:615,bottom:660},{left:-22,right:38,top:679,bottom:730});}
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
      // Check the full projected crown against water and the three roads.
      for(let y=Math.max(540,box.top);y<=Math.min(1080,box.bottom);y+=5){
        const rx=riverX(y),rw=riverWidth(y)+12;
        if(box.left<rx+rw&&box.right>rx-rw)return false;
      }
      const roadLeft=Math.max(-760,box.left),roadRight=Math.min(800,box.right);
      if(roadLeft<=roadRight)for(let row=0;row<3;row++){
        const ys=[roadY(row,roadLeft)+4,roadY(row,roadRight)+4,roadY(row,clamp(0,roadLeft,roadRight))+4];
        if(box.top<Math.max(...ys)+10&&box.bottom>Math.min(...ys)-10)return false;
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
      const x=riverX(y)+side*(riverWidth(y)+23+rand(seed)*12);
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
      const y=506+Math.sin(x*.006)*24+Math.sin(x*.013+2)*13+band*7+5;
      const kind=this.species[rand(seed+3)>.2?0:Math.floor(rand(seed+4)*this.species.length)];
      this.drawPlant(c,{x,y,h:12+rand(seed+9)*24+band*7,kind,seed},0,false,band?.84:.48);
    }
  }
  paintWoodland(c,left,right){
    const plants=[...this.trees,...this.undergrowth].sort((a,b)=>a.y-b.y||a.x-b.x);
    for(const plant of plants){
      const radius=this.radius(plant.kind,plant.h);
      if(plant.x+radius<left||plant.x-radius>right)continue;
      if(!['fern','shrub','reed'].includes(plant.kind)){
        c.save();c.globalAlpha=.14;
        ellipse(c,plant.x+plant.h*.11,plant.y+1,plant.h*.25,plant.h*.045,this.tones.shadow);c.restore();
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
    this.right = right + 45;
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
    const depthCount=330, back=-190, front=410;
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
        if(this.era==='iron') {
          const snowLine=222+(rockFbm(x*.018,z*.024,461,3)-.5)*43;
          const snow=smooth01((elevation-snowLine)/33)*smooth01((normal-.32)*2.4)*.91;
          red+=((this.paper?230:197)-red)*snow;
          green+=((this.paper?231:211)-green)*snow;
          blue+=((this.paper?218:219)-blue)*snow;
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
  const helpers=[smooth01,mixColor,parseColor,rockHash,rockNoise,rockFbm,poly,gradient];
  return [
    'const document={createElement:()=>new OffscreenCanvas(1,1)};',
    `const clamp=${clamp.toString()},frac=${frac.toString()},rand=${rand.toString()};`,
    `const MOUNTAIN_PROFILES=${JSON.stringify(MOUNTAIN_PROFILES)};`,
    `const ROCK_TONES=${JSON.stringify(ROCK_TONES)};`,
    ...helpers.map(fn=>fn.toString()),
    MountainAtmosphere.toString(),
    `self.onmessage=({data})=>{
      try{
        const scene=new MountainAtmosphere(data);
        const surfaces=[...scene.ranges,scene.clouds,scene.mist];
        const maps=surfaces.map(({canvas,top,bottom})=>({bitmap:canvas.transferToImageBitmap(),top,bottom}));
        self.postMessage({maps},maps.map(map=>map.bitmap));
      }catch(error){self.postMessage({error:String(error)});}
      self.close();
    };`
  ].join('\n');
}

export class WorldBackdropRenderer {
  constructor(canvasId) {
    this.canvas=typeof document!=='undefined'?document.getElementById(canvasId):null;
    this.ctx=this.canvas?.getContext('2d',{alpha:false}) || null;
    this.state=null;this.time=0;this.width=0;this.height=0;this.layers=[];this.entities=[];
    this.pointer={x:0,y:0};this.aim={x:0,y:0};this.paused=false;this.destroyed=false;
    this._raf=0;this._last=null;this._signature='';this._listeners=[];this._gyro=false;
    if(!this.ctx) return;
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
      this.reducedMotion=e.matches;this.pointer={x:0,y:0};this._last=null;this._cancel();this.draw();this._schedule();
    });
    this._frame=now=>{
      this._raf=0;
      if(this.destroyed||this.paused||document.hidden)return;
      const dt=this._last===null?0:Math.max(0,(now-this._last)/1000);this._last=now;
      if(!this.reducedMotion) {
        this.time+=dt;const a=1-Math.exp(-dt*3.5);
        this.pointer.x+=(this.aim.x-this.pointer.x)*a;this.pointer.y+=(this.aim.y-this.pointer.y)*a;
      }
      // A screen moved to another monitor can change DPR without a resize event.
      if(this.dpr!==(window.devicePixelRatio||1))this.resize();
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
  pause(){this.paused=true;this._last=null;this._cancel();}
  resume(){if(this.destroyed)return;this.paused=false;this._last=null;this._schedule();}
  seek(seconds){this.time=Number.isFinite(Number(seconds))?Math.max(0,Number(seconds)):0;this._last=null;this.draw();}
  replay(){this.seek(0);this.resume();}
  destroy(){this.destroyed=true;this._cancel();this._stopMountainBake();this._listeners.forEach(off=>off());this._listeners=[];this.layers=[];this.entities=[];this.mountains=null;this.vegetation=null;}
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
    this.dpr=window.devicePixelRatio||1;
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
      const site=slot(type,i);
      // A type/index owns a permanent address; viewport changes cannot reshuffle it.
      this.entities.push({type,index:i,...site,seed:BUILDINGS.indexOf(type)*7919+i*101});
    }
    this.entities.sort((a,b)=>a.y-b.y||a.x-b.x);
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
      this._landscapeKey=landscapeKey;
      this._startMountainBake(options,this.mountains);
    }
    const vegetationKey=JSON.stringify([this.state.era,this.state.paperMode]);
    if(this._vegetationKey!==vegetationKey){
      this.vegetation=new VegetationLayer(this.state.era,this.state.paperMode);
      this._vegetationKey=vegetationKey;
    }
    this.vegetation.rebuild(this.state,this.entities);
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
    const current=()=>!this.destroyed&&this.mountains===scene;
    const finish=()=>{
      if(!current())return;
      // Repaint only the two mountain planes. Terrain, buildings and camera
      // state keep their existing canvases and addresses throughout the bake.
      for(const i of [2,3]){
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
        scene.bake();finish();
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
      const pts=[[left,h],[left,550]];
      for(let x=left;x<=right+30;x+=30)pts.push([x,506+Math.sin(x*.006)*24+Math.sin(x*.013+2)*13]);
      pts.push([right,h]);poly(c,pts,p[5]);
      this.vegetation.paintDistant(c,left,right);
      this._wonders(c,0);
      if(s.era==='iron')for(const x of [-380,370])this._watchtower(c,x,518);
      if(s.era==='medieval')this._castle(c,-430,530);
      if(s.era==='classical')this._temple(c,-225,512,1.05);
    }
    if(i===5){
      // Broad sculpted banks; winding river is a hole in this land plane.
      c.save();c.beginPath();c.moveTo(left,h);
      for(let x=left;x<=right+12;x+=12)c.lineTo(x,540+Math.sin(x*.006)*14+Math.sin(x*.017)*5);
      c.lineTo(right,h);c.closePath();c.clip();
      c.beginPath();c.rect(left,-100,right-left,h+200);riverPath(c,false);c.clip('evenodd');
      c.fillStyle=gradient(c,0,540,0,1000,[p[6],p[7]]);c.fillRect(left,510,right-left,h);
      for(let j=0;j<11;j++) {
        const y=580+j*42;
        c.beginPath();c.moveTo(left,y+60);c.bezierCurveTo(-480,y-70,-210,y+25,200,y+50);c.lineTo(right,h);c.lineTo(left,h);c.closePath();
        c.fillStyle=j%2?p[5]:p[6];c.globalAlpha=.11;c.fill();
        c.globalAlpha=.075;c.beginPath();c.moveTo(left,y+60);c.bezierCurveTo(-480,y-70,-210,y+25,200,y+50);c.strokeStyle=p[14];c.lineWidth=.9;c.stroke();
      }c.globalAlpha=1;
      // Pigment flecks are static world-space marks, never frame-random noise.
      for(let n=0;n<1900;n++) {
        const x=left+rand(n+91)*(right-left),y=550+rand(n+311)*500;
        c.globalAlpha=.05+rand(n)*.10;line(c,[[x,y],[x+2+rand(n+8)*8,y-.4]],n%3?p[11]:p[14],.7);
      }c.globalAlpha=1;
      this._quarry(c,-470,610);
      this.vegetation.paintWoodland(c,left,right);
      this._fields(c,0,false);c.restore();
      // Thin irregular, reflective banks.
      for(const side of [-1,1]) {const pts=[];for(let y=540;y<1100;y+=6)pts.push([riverX(y)+side*(riverWidth(y)+2),y]);line(c,pts,p[5],5);line(c,pts,p[12],.7);}
    }
    if(i===6){
      c.save();c.beginPath();c.rect(left,0,right-left,h);riverPath(c,false);c.clip('evenodd');
      for(let row=0;row<3;row++){
        const pts=[];for(let x=Math.max(left,-760);x<=Math.min(right,800);x+=10)pts.push([x,roadY(row,x)+4]);
        c.globalAlpha=.5;line(c,pts,p[5],11);c.globalAlpha=.4;line(c,pts,p[12],3.5);
        c.globalAlpha=.25;line(c,pts,p[14],.7);c.globalAlpha=1;
      }c.restore();
      // A single timber bridge connects the middle terrace to the east bank.
      const by=734,bx=riverX(by),bw=riverWidth(by)+13;
      poly(c,[[bx-bw,by-3],[bx+bw,by-3],[bx+bw,by+7],[bx-bw,by+7]],p[13]);
      for(let x=bx-bw;x<bx+bw;x+=5)line(c,[[x,by-3],[x,by+7]],p[12],.7);
      for(const yy of [by-3,by+7]){
        line(c,[[bx-bw,yy-5],[bx+bw,yy-5]],p[12],1);
        for(let x=bx-bw;x<=bx+bw;x+=18)line(c,[[x,yy],[x,yy-7]],p[13],1.5);
      }
      for(const e of this.entities)if(this._visible(e.x,e.y,65))this._building(c,e,0,false);
      if(!this.entities.length){this._building(c,{type:'hide_tent',x:-60,y:650,seed:1},0,false);this._building(c,{type:'forager_hut',x:8,y:720,seed:2},0,false);}
      // Central gathering circle is separate from building slots and roads.
      ellipse(c,-18,841,44,13,p[5]);ellipse(c,-18,842,23,7,p[7]);
      for(let j=0;j<7;j++)ellipse(c,-18+Math.cos(j*TAU/7)*12,842+Math.sin(j*TAU/7)*4,2.4,1.5,p[12]);
      if(s.era==='medieval'){this._windmill(c,-285,686,0,false);this._windmill(c,-365,747,0,false);}
    }
  }
  _visible(x,y,margin=70){return x>-this.half-margin&&x<this.half+margin&&y<this.worldHeight+margin&&y>-margin;}
  _plane(index,fn){
    const c=this.ctx,depth=[0,.08,.15,.25,.38,.55,.76,1][index];
    c.save();c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,this.dpr*(this.width/2+this.pointer.x*depth*15),this.dpr*this.pointer.y*depth*9);
    fn(c);c.restore();
  }
  draw(time=this.time){
    if(!this.ctx||!this.state||this.destroyed||!this.layers.length)return;
    const c=this.ctx,s=this.state,p=this.p,t=this.reducedMotion?0:time;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.globalAlpha=1;
    for(let i=0;i<7;i++){
      const l=this.layers[i],depth=[0,.08,.15,.25,.38,.55,.76][i];
      c.drawImage(l.canvas,-l.pad+this.pointer.x*depth*15,-l.pad+this.pointer.y*depth*9,this.width+l.pad*2,this.height+l.pad*2);
      if(i===1)this._plane(1,cc=>this._skyMotion(cc,t));
      if(i===3)this._plane(3,cc=>this.mountains.paintMist(cc,t));
      if(i===4)this._plane(4,cc=>this._wonderMotion(cc,t));
      if(i===4)this._plane(5,cc=>this._water(cc,t));
      if(i===5)this._plane(5,cc=>this._fields(cc,t,true));
      if(i===6)this._plane(6,cc=>{
        for(const e of this.entities)if(this._visible(e.x,e.y,65))this._building(cc,e,t,true);
        this._people(cc,t);this._fire(cc,-18,840,t,1);
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
    c.save();riverPath(c);c.clip();
    c.fillStyle=gradient(c,0,440,0,1000,[p[2],p[8],p[9]]);c.fillRect(-this.half-70,430,this.half*2+140,700);
    c.save();c.globalAlpha=.19;
    for(let n=0;n<150;n++){
      const y=445+rand(n+7)*640,x=riverX(y)+(rand(n+17)*2-1)*riverWidth(y),w=1+(y-440)*.045*rand(n+8);
      const drift=Math.sin(t*.45+n)*4;line(c,[[x-w+drift,y],[x+w+drift,y]],n%3?p[14]:p[2],.6+(y-440)*.001);
    }c.restore();
    c.save();c.globalAlpha=.17;
    for(let j=0;j<70;j++){
      const y=465+j*7,x=riverX(y)+Math.sin(j*3+t*.6)*9,w=4+j*.22+Math.sin(t+j)*3;
      line(c,[[x-w,y],[x+w,y]],p[14],1.1);
    }c.restore();c.restore();
    if(s.techs.includes('caravan_trade')||s.era==='classical'){
      for(let n=0;n<2;n++){
        const progress=frac(t*.008+n*.53),y=580+progress*380,x=riverX(y),k=.5+progress*.5;
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
    const p=this.p;poly(c,[[x-68,y],[x-52,y-68],[x-17,y-90],[x+45,y-52],[x+68,y+9]],p[4]);
    poly(c,[[x-17,y-90],[x+4,y-18],[x+68,y+9],[x+45,y-52]],p[3]);
    for(let j=0;j<6;j++)line(c,[[x-48+j*9,y-j*8],[x+16+j*7,y+8-j*8]],p[5],2);
    if(this.state.era==='bronze'||this.state.techs.includes('copper_mining'))for(let j=0;j<8;j++)line(c,[[x-25+j*8,y-49+j*5],[x-20+j*8,y-42+j*5],[x-29+j*8,y-33+j*5]],'#bd9967',1.6);
  }
  _fields(c,t,moving){
    const p=this.p,s=this.state,n=Math.min(7,1+Math.ceil(s.jobs.farmer/3));
    if(!moving){
      for(let f=0;f<n;f++){
        const x=-310-f%3*70,y=728+Math.floor(f/3)*49;
        poly(c,[[x-30,y],[x+23,y-5],[x+38,y+22],[x-23,y+26]],f%2?p[5]:'#938758',p[7],1.5);
        for(let r=0;r<6;r++)line(c,[[x-27+r*9,y+2],[x-18+r*9,y+23]],p[7],1);
        if(s.era==='bronze')line(c,[[x-32,y],[x-24,y+29],[x+40,y+24]],p[8],2.5);
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
    const {type,x,y,seed}=e,p=this.p,s=this.state;
    if(moving){
      if(['forager_hut','mud_brick_hut','smeltery','library','guild_hall'].includes(type))this._smoke(c,x+9,y-32,t,seed,type==='smeltery'?1.4:.6);
      if(type==='smeltery'){glow(c,x,y-8,18,p[14],.17+Math.sin(t*6+seed)*.03);ellipse(c,x,y-8,4,5,'#f6ba69');}
      if(type==='copper_mine')this._wheel(c,x+16,y-9,6,t*.45);
      if(type==='guild_hall')this._banner(c,x+14,y-47,t,seed);
      return;
    }
    c.save();c.translate(x,y);
    ellipse(c,3,2,22,4,'#10292935');
    const light=s.paperMode?p[5]:'#f4c783';
    const wall=(xx,yy,w,h)=>{
      c.fillStyle=p[12];c.fillRect(xx,yy,w,h);poly(c,[[xx+w,yy],[xx+w+5,yy-3],[xx+w+5,yy+h-3],[xx+w,yy+h]],p[5]);
      line(c,[[xx,yy+h],[xx+w,yy+h]],p[7],1.2);
    };
    const window=(xx,yy,w=3,h=4)=>{c.fillStyle=light;c.fillRect(xx,yy,w,h);};
    if(type==='hide_tent'){
      poly(c,[[-18,0],[-2,-29],[18,0]],p[12],p[7],1);
      poly(c,[[-2,-29],[4,-4],[18,0]],p[13]);poly(c,[[-4,0],[1,-12],[6,0]],p[7]);
      line(c,[[-20,2],[-2,-32],[20,2]],p[12],1);line(c,[[-8,-21],[10,-4]],p[13],.6);
    }else if(type==='forager_hut'){
      wall(-13,-19,26,19);poly(c,[[-19,-18],[0,-39],[20,-18]],p[13],p[7],1);
      for(let j=0;j<8;j++)line(c,[[-14+j*4,-19],[j*.5-2,-35]],p[12],.5);
      c.fillStyle=p[7];c.fillRect(-3,-12,7,12);window(-9,-13);
      ellipse(c,-18,-2,4,3,p[12]);
    }else if(type==='lumber_pile'){
      for(let r=0;r<3;r++)for(let j=0;j<5-r;j++){
        const xx=-17+j*7+r*3,yy=-3-r*5;line(c,[[xx-8,yy-3],[xx+1,yy]],p[13],5);ellipse(c,xx+1,yy,2.7,2.4,p[12]);ellipse(c,xx+1,yy,.8,.7,p[13]);
      }line(c,[[-21,0],[-21,-25],[21,-25],[21,0]],p[7],2);
    }else if(type==='granary'){
      wall(-13,-26,26,23);poly(c,[[-17,-25],[0,-39],[17,-25]],p[13]);
      for(let j=0;j<6;j++)line(c,[[-12+j*5,-24],[-12+j*5,-5]],p[13],.6);
      line(c,[[-10,-3],[-10,1]],p[7],2);line(c,[[10,-3],[10,1]],p[7],2);window(-2,-19,4,5);
    }else if(type==='mud_brick_hut'){
      wall(-16,-24,31,24);poly(c,[[-19,-25],[14,-25],[19,-28],[-14,-28]],p[13]);
      for(let r=0;r<4;r++){line(c,[[-15,-5-r*5],[14,-5-r*5]],p[13],.5);for(let j=0;j<3;j++)line(c,[[-10+j*10+r%2*4,-10-r*5],[-10+j*10+r%2*4,-5-r*5]],p[13],.4);}
      c.fillStyle=p[7];c.fillRect(-3,-13,6,13);window(-11,-18);window(8,-18);c.fillStyle=p[13];c.fillRect(8,-34,4,9);
    }else if(type==='copper_mine'){
      poly(c,[[-18,0],[-17,-17],[0,-29],[18,-13],[19,0]],p[4]);
      poly(c,[[-10,0],[-9,-14],[0,-19],[9,-13],[10,0]],p[7]);
      line(c,[[-12,0],[-12,-21],[13,-21],[13,0]],p[13],3);window(-3,-13,3,3);
      line(c,[[-6,0],[-14,10]],p[12],1);line(c,[[6,0],[3,10]],p[12],1);
    }else if(type==='smeltery'){
      wall(-13,-19,27,19);poly(c,[[-17,-20],[0,-29],[18,-20]],p[13]);
      c.fillStyle=p[12];c.fillRect(7,-43,7,25);c.fillStyle=p[13];c.fillRect(6,-45,9,3);
      c.fillStyle=p[7];c.fillRect(-5,-12,10,12);ellipse(c,0,-11,5,5,p[7]);
    }else if(type==='library'){
      wall(-17,-30,33,30);poly(c,[[-22,-29],[0,-45],[22,-29]],p[13],p[12],1);
      for(let j=0;j<4;j++){c.fillStyle=p[5];c.fillRect(-13+j*8,-25,4,20);window(-12+j*8,-24,2,6);}
      c.fillStyle=p[12];c.fillRect(-22,0,44,3);c.fillRect(-25,3,50,2);window(-2,-39,4,3);
    }else if(type==='aqueduct'){
      this._arches(c,-20,-26,40,27,2,1);line(c,[[-22,-28],[22,-28]],p[8],2);
    }else if(type==='guild_hall'){
      wall(-17,-37,34,37);poly(c,[[-22,-35],[0,-57],[22,-35]],p[13],p[7],1);
      for(const xx of [-16,0,16])line(c,[[xx,-35],[xx,0]],p[13],2);
      line(c,[[-16,-34],[16,-4]],p[13],1.7);line(c,[[16,-34],[-16,-4]],p[13],1.7);
      line(c,[[-16,-19],[16,-19]],p[13],2);for(const xx of [-11,7]){window(xx,-30,5,7);window(xx,-14,5,7);}
      window(-3,-48,6,5);line(c,[[0,-57],[0,-63]],p[12],1);
    }
    c.restore();
  }
  _smoke(c,x,y,t,seed,k=1){
    const p=this.p;
    c.save();
    for(let j=0;j<7;j++){
      const u=frac(t*.075+j/7+rand(seed)),xx=x+Math.sin(u*4+seed)*u*12,yy=y-u*58*k;
      c.globalAlpha=(1-u)*.13;ellipse(c,xx,yy,2+u*8*k,3+u*4*k,p[2]);
    }c.restore();
  }
  _wheel(c,x,y,r,angle){
    c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle=this.p[13];c.lineWidth=1.8;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();
    for(let j=0;j<8;j++){const a=j*TAU/8;line(c,[[0,0],[Math.cos(a)*r,Math.sin(a)*r]],this.p[12],.8);}c.restore();
  }
  _arches(c,x,y,w,h,n,tiers=1){
    const p=this.p,span=w/n;
    for(let row=0;row<tiers;row++){
      const yy=y-row*h*.75;c.save();c.beginPath();c.rect(x,yy-h,w,h);
      for(let j=0;j<n;j++){
        const cx=x+(j+.5)*span,r=span*.34,top=yy-h*.53;
        c.moveTo(cx-r,yy+1);c.lineTo(cx-r,top);c.arc(cx,top,r,Math.PI,0);c.lineTo(cx+r,yy+1);c.closePath();
      }c.fillStyle=p[12];c.fill('evenodd');c.restore();
      line(c,[[x-2,yy-h],[x+w+2,yy-h]],p[14],1.2);
      for(let j=0;j<n;j++)line(c,[[x+j*span,yy-h+3],[x+j*span,yy-1]],p[5],.8);
    }
  }
  _wonders(c,t){
    const s=this.state,p=this.p;
    for(const [type,stage]of Object.entries(s.wonders)){
      if(!stage)continue;
      const pos={megalith:[-190,518],ziggurat:[-72,525],colossus:[122,542],cathedral:[232,552]}[type];
      c.save();c.translate(...pos);ellipse(c,0,0,type==='cathedral'?51:43,7,p[5]);
      if(type==='megalith'){
        for(let j=0;j<8;j++){
          const a=j*TAU/8,x=Math.cos(a)*31,y=Math.sin(a)*7;
          if(j<stage*3){poly(c,[[x-4,y],[x-5,y-23],[x+3,y-25],[x+5,y]],p[12]);
            if(stage===3&&j%2===0)poly(c,[[x-6,y-23],[x-6,y-28],[x+15,y-27],[x+15,y-22]],p[12]);}
        }
      }else if(type==='ziggurat'){
        for(let j=0;j<stage;j++){
          const w=78-j*17,yy=-j*15;
          poly(c,[[-w/2,yy],[w/2,yy],[w/2,yy-13],[-w/2,yy-13]],p[12]);
          poly(c,[[w/2,yy],[w/2+9,yy-4],[w/2+9,yy-17],[w/2,yy-13]],p[13]);
          line(c,[[-w/2-2,yy-13],[w/2+1,yy-13]],p[14],1);
        }poly(c,[[-8,0],[8,0],[5,-stage*14],[-5,-stage*14]],p[13]);
        for(let j=0;j<stage*4;j++)line(c,[[-8,-j*3.3],[8,-j*3.3]],p[12],.7);
      }else if(type==='colossus'){
        c.fillStyle=p[12];c.fillRect(-22,-11,44,11);c.fillRect(-16,-22,32,11);
        if(stage>=2)poly(c,[[-12,-22],[-5,-59],[1,-59],[0,-22]],p[13]);
        if(stage>=3)poly(c,[[3,-22],[2,-59],[8,-59],[14,-22]],p[13]);
        if(stage>=4)poly(c,[[-6,-54],[-12,-82],[-4,-91],[7,-91],[13,-80],[7,-54]],p[12]);
        if(stage===5){ellipse(c,1,-99,6,8,p[12]);line(c,[[-8,-82],[-21,-99],[-19,-117]],p[12],5);line(c,[[10,-82],[24,-70],[31,-86]],p[12],4);}
      }else if(type==='cathedral'){
        c.fillStyle=p[12];c.fillRect(-40,-Math.min(stage,3)*16,80,Math.min(stage,3)*16);
        if(stage>=2){poly(c,[[-15,-31],[0,-60],[15,-31]],p[13]);for(let j=0;j<5;j++) {c.fillStyle=p[5];c.fillRect(-31+j*14,-25,5,23);}}
        if(stage>=3)for(const x of [-31,31]){c.fillStyle=p[12];c.fillRect(x-9,-71,18,71);poly(c,[[x-12,-71],[x,-101],[x+12,-71]],p[13]);}
        if(stage>=4){poly(c,[[-9,-48],[0,-124],[9,-48]],p[12]);ellipse(c,0,-34,9,9,p[13]);ellipse(c,0,-34,6,6,'#e3c18d');
          for(let j=0;j<8;j++){const a=j*TAU/8;line(c,[[0,-34],[Math.cos(a)*6,-34+Math.sin(a)*6]],p[13],.6);}}
        if(stage===5){for(const x of [-31,0,31])line(c,[[x,-102-(x===0?26:0)],[x,-111-(x===0?26:0)]],p[14],1);for(let j=0;j<7;j++)line(c,[[-44+j*14,0],[-39+j*14,-34]],p[12],2);}
      }
      if(stage<WONDER_MAX[type])this._scaffold(c,type==='cathedral'?93:83,type==='colossus'?stage*22:type==='cathedral'?stage*25:stage*16+15);
      c.restore();
    }
    if(s.era==='classical'||s.buildings.aqueduct>0)this._arches(c,285,578,420,57,12,s.techs.includes('engineering')?2:1);
  }
  _scaffold(c,w,h){
    const col='#bca57c';for(let x=-w/2;x<=w/2;x+=w/4){line(c,[[x,4],[x,-h]],col,1);}
    for(let y=0;y>=-h;y-=15){line(c,[[-w/2-4,y],[w/2+4,y]],col,1);line(c,[[-w/2,y],[w/2,y-15]],col,.7);}
  }
  _wonderMotion(c,t){
    const s=this.state,p=this.p;
    for(const [type,max]of Object.entries(WONDER_MAX))if(s.wonders[type]===max){
      const [x,y]={megalith:[-190,500],ziggurat:[-72,488],colossus:[103,425],cathedral:[232,446]}[type];
      glow(c,x,y,58,p[14],.10+Math.sin(t*.7)*.015);
      c.save();for(let j=0;j<9;j++){
        const u=frac(t*.045+j/9);c.globalAlpha=(1-u)*.55;ellipse(c,x+Math.sin(j*4)*30,y-u*55,.8,.8,p[14]);
      }c.restore();if(type==='colossus')this._fire(c,x,y,t,.6);
    }
    if(s.era==='iron')for(const x of [-380,370])this._fire(c,x,477,t,.5);
    if(s.era==='medieval')this._banner(c,-429,443,t,19);
  }
  _temple(c,x,y,k=1){
    const p=this.p;c.save();c.translate(x,y);c.scale(k,k);
    c.fillStyle=p[12];c.fillRect(-36,-3,72,4);c.fillRect(-32,-7,64,4);
    for(let j=0;j<6;j++){c.fillRect(-27+j*10,-39,4,32);line(c,[[-28+j*10,-39],[-22+j*10,-39]],p[14],2);}
    poly(c,[[-37,-41],[0,-60],[37,-41]],p[12]);poly(c,[[-24,-44],[0,-55],[24,-44]],p[5]);c.restore();
  }
  _watchtower(c,x,y){
    const p=this.p;c.fillStyle=p[12];c.fillRect(x-10,y-39,20,39);poly(c,[[x-16,y-39],[x,y-54],[x+16,y-39]],p[13]);
    c.fillStyle=p[7];c.fillRect(x-5,y-32,10,12);line(c,[[x-12,y-9],[x+12,y-9]],p[5],2);
  }
  _castle(c,x,y){
    const p=this.p;c.fillStyle=p[12];c.fillRect(x-66,y-31,132,31);
    for(let j=0;j<14;j++)c.fillRect(x-67+j*10,y-37,6,8);
    for(const xx of [x-54,x,x+54]){c.fillRect(xx-11,y-66,22,66);poly(c,[[xx-15,y-65],[xx,y-87],[xx+15,y-65]],p[13]);c.fillStyle=p[5];c.fillRect(xx-3,y-53,6,12);c.fillStyle=p[12];}
    c.fillStyle=p[7];c.fillRect(x-7,y-18,14,18);
  }
  _banner(c,x,y,t,seed){
    line(c,[[x,y+21],[x,y-6]],this.p[12],.8);const sway=Math.sin(t*2+seed)*2;
    poly(c,[[x,y-6],[x+13,y-4+sway],[x+10,y+3+sway],[x,y+2]],'#bd796b');
  }
  _windmill(c,x,y,t,moving){
    const p=this.p;
    if(!moving){poly(c,[[x-11,y],[x-7,y-41],[x+7,y-41],[x+11,y]],p[12]);poly(c,[[x-12,y-41],[x,y-53],[x+12,y-41]],p[13]);return;}
    c.save();c.translate(x,y-36);c.rotate(t*.32);
    for(let j=0;j<4;j++){
      c.rotate(Math.PI/2);line(c,[[0,0],[0,-30]],p[13],1.6);
      poly(c,[[1,-10],[7,-10],[7,-29],[1,-29]],p[12]);
      for(let q=0;q<4;q++)line(c,[[0,-11-q*5],[7,-11-q*5]],p[5],.6);
    }ellipse(c,0,0,2,2,p[13]);c.restore();
  }
  _fire(c,x,y,t,k){
    const p=this.p;c.save();c.translate(x,y);c.scale(k,k);glow(c,0,-4,55,p[14],.12+Math.sin(t*7)*.015);
    poly(c,[[-5,0],[-7,-7],[-2,-14+Math.sin(t*9)*2],[1,-23+Math.sin(t*11)*3],[5,-9],[6,0]],'#e99d57');
    poly(c,[[-3,0],[0,-14],[4,-4],[3,0]],'#ffe3a4');
    for(let j=0;j<7;j++){const u=frac(t*.21+j/7);c.globalAlpha=(1-u)*.65;ellipse(c,Math.sin(j*5+t)*u*9,-u*46,1-u*.6,1.4-u,p[14]);}
    c.restore();
  }
  _people(c,t){
    const s=this.state,p=this.p,colors=['#d4b778','#c39a70','#c5beb0','#aa9c77','#91b8b2','#d1a18a','#9baca9','#8f9d9a'];
    // Visual population budget: at most 64 citizens and 16 soldiers; assignment
    // proportions determine destinations, outfit, tools, and carried loads.
    const assigned=JOBS.reduce((n,k)=>n+s.jobs[k],0),visible=Math.min(64,s.pop);
    for(let i=0;i<visible;i++){
      let job='idle',target=(i+.5)/Math.max(1,visible)*Math.max(s.pop,assigned),sum=0;
      for(const k of JOBS){sum+=s.jobs[k];if(target<sum){job=k;break;}}
      const route={farmer:[-360,-70],woodcutter:[-430,35],quarrier:[-470,-35],hunter:[-400,110],scholar:[-125,105],artisan:[-90,145],miner:[-450,-20],coal_miner:[-420,25],idle:[-150,110]}[job];
      const row=i%3,u=frac(t*(.008+rand(i)*.004)+rand(i+72)),v=u<.5?u*2:2-u*2,x=route[0]+(route[1]-route[0])*v;
      const y=roadY(row,x)+6+(i%2)*2;
      if(!this._visible(x,y,12))continue;
      const direction=u<.5?1:-1,walk=Math.sin(t*7+i*3)*1.2,ji=JOBS.indexOf(job);
      ellipse(c,x,y+.3,2.5,1,'#18332b55');
      line(c,[[x-.9,y-3],[x+walk,y]],p[7],.8);line(c,[[x+.9,y-3],[x-walk,y]],p[7],.8);
      c.fillStyle=colors[ji]||p[12];c.fillRect(x-1.5,y-7,3,4.7);ellipse(c,x,y-8.2,1.5,1.6,p[12]);
      if(job==='farmer'||job==='woodcutter'||job==='quarrier'||job.includes('miner')){
        line(c,[[x+direction*3,y-2],[x+direction*4,y-11]],p[13],.7);
        if(job==='farmer')for(let q=-1;q<=1;q++)line(c,[[x+direction*4+q,y-9],[x+direction*4+q,y-12]],p[12],.5);
        else line(c,[[x+direction*1,y-11],[x+direction*6,y-10]],p[12],1.2);
      }else if(job==='scholar'){c.fillStyle=p[12];c.fillRect(x+direction,y-6,3,2);}else if(job==='hunter')line(c,[[x+3,y],[x+3,y-13]],p[12],.6);
    }
    let soldier=0;
    for(const [type,n]of Object.entries(s.units))for(let j=0;j<Math.min(n,16-soldier);j++){
      const x=-175+frac(t*.012+soldier*.062)*320,y=roadY(2,x)+10;
      c.fillStyle=p[13];c.fillRect(x-2,y-9,4,7);ellipse(c,x,y-11,2,2,p[12]);line(c,[[x+4,y],[x+4,y-18]],p[12],.9);
      if(type==='knight'){ellipse(c,x,y-2,5,3,p[13]);line(c,[[x-4,y],[x-4,y+4],[x+4,y+4],[x+4,y]],p[7],1);}
      soldier++;
    }
    if(s.techs.includes('caravan_trade')){
      const x=-650+frac(t*.012)*800,y=roadY(1,x)+3;
      c.fillStyle=p[13];c.fillRect(x-9,y-8,18,7);poly(c,[[x-9,y-8],[x-6,y-17],[x+6,y-17],[x+9,y-8]],p[12]);
      this._wheel(c,x-6,y,3,t*2);this._wheel(c,x+6,y,3,t*2);
      ellipse(c,x+18,y-3,6,3,p[13]);line(c,[[x+15,y],[x+14+Math.sin(t*4)*2,y+4],[x+22,y+4],[x+22,y-6]],p[13],1);
    }
    for(let i=0;i<Math.min(6,s.expeditionsCleared);i++)this._banner(c,-150+i*16,827,t,i);
  }
  _foreground(c,t){
    const p=this.p,s=this.state,left=-this.half-70,right=this.half+70;
    const pts=[[left,1100],[left,956]];
    for(let x=left;x<=right+20;x+=20)pts.push([x,962+Math.sin(x*.008)*16+Math.sin(x*.021)*6]);
    pts.push([right,1100]);poly(c,pts,p[7]);
    this.vegetation.paintForeground(c,this.half,t);
    if(!s.paperMode)for(let n=0;n<33;n++){
      const x=Math.sin(t*.08+n*7)*this.half,y=760+rand(n+90)*220+Math.sin(t*.3+n)*8;
      const alpha=.15+Math.pow(Math.sin(t*.65+n),4)*.45;
      c.save();c.globalAlpha=alpha;ellipse(c,x,y,1.1,1.1,p[14]);c.restore();
    }
  }
}
