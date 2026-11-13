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
function tree(c,x,y,h,p,seed,kind='pine',time=0) {
  c.save();c.translate(x,y);const sway=Math.sin(time*.65+seed)*h*.012;c.transform(1,0,sway/h,1,0,0);
  c.fillStyle=p[7];c.fillRect(-h*.028,-h*.82,h*.056,h*.82);
  if(kind==='cypress') {
    ellipse(c,0,-h*.53,h*.10,h*.49,p[10]);ellipse(c,-h*.025,-h*.59,h*.06,h*.35,p[11]);
  } else if(kind==='pine') {
    const crown=[[0,-h]];
    for(let j=0;j<9;j++) {
      const yy=-h+j*h*.086,w=h*(.035+j*.025)*( .87+rand(seed+j)*.25);
      crown.push([-w*.48,yy+h*.09],[-w,yy+h*.18],[-w*.60,yy+h*.17]);
    }
    for(let j=8;j>=0;j--){const yy=-h+j*h*.086,w=h*(.035+j*.025)*(.87+rand(seed+j)*.25);crown.push([w*.65,yy+h*.17],[w*.88,yy+h*.18],[w*.35,yy+h*.09]);}
    poly(c,crown,p[10]);
    c.save();c.globalAlpha=.42;
    for(let j=0;j<9;j++){const yy=-h+j*h*.086,w=h*(.025+j*.023);poly(c,[[0,yy],[-w,yy+h*.18],[-w*.3,yy+h*.14]],p[11]);}c.restore();
  } else {
    for(let j=0;j<7;j++) ellipse(c,Math.sin(j*2.4)*h*.18,-h*.62+Math.cos(j*2.4)*h*.18,h*.2,h*.17,j%3?p[10]:p[11]);
  }
  c.restore();
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
  destroy(){this.destroyed=true;this._cancel();this._listeners.forEach(off=>off());this._listeners=[];this.layers=[];this.entities=[];}
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
    this.layers=[];
    for(let i=0;i<7;i++) {
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil((this.width+pad*2)*density);canvas.height=Math.ceil((this.height+pad*2)*density);
      const c=canvas.getContext('2d');c.setTransform(density*this.scale,0,0,density*this.scale,density*(this.width/2+pad),density*pad);
      const left=-this.half-pad/this.scale,right=this.half+pad/this.scale;
      this._paintPlane(c,i,left,right);
      this.layers.push({canvas,pad});
    }
  }
  _paintPlane(c,i,left,right){
    const p=this.p,s=this.state,h=this.worldHeight+100;
    if(i===0){
      c.fillStyle=gradient(c,0,0,0,620,[p[0],p[1],p[2]]);c.fillRect(left,-100,right-left,h+100);
      for(let n=0;n<32;n++) {
        const x=left+rand(n+70)*(right-left),y=60+rand(n+8)*280;
        c.save();c.globalAlpha=.025+rand(n)*.025;
        ellipse(c,x,y,90+rand(n+3)*170,4+rand(n+20)*12,p[14]);c.restore();
      }
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
      const far=i===2,seed=far?4:19,step=far?180:240,base=far?444:490;
      const pts=[[left,h],[left,base]];
      for(let x=Math.floor(left/step)*step;x<=right+step;x+=step){const peak=base-65-rand(x+seed)*155;
        pts.push([x,base-35-rand(x+2)*40],[x+step*.23,peak+36],[x+step*.47,peak],[x+step*.66,peak+42],[x+step,base-18]);}
      pts.push([right,h]);poly(c,pts,p[far?3:4]);
      c.save();c.clip();
      // Broken planes catch light, rather than a single flat zig-zag silhouette.
      for(let x=Math.floor(left/step)*step;x<right;x+=step){const peak=base-65-rand(x+seed)*155,xx=x+step*.47;
        c.save();c.globalAlpha=far?.22:.48;
        poly(c,[[xx,peak],[xx+step*.12,peak+53],[x+step,base-18],[xx+step*.02,base+25]],far?p[2]:p[3]);c.restore();
        if(s.era==='iron')poly(c,[[xx,peak],[xx-19,peak+32],[xx-2,peak+24],[xx+14,peak+40],[xx+step*.12,peak+53]],'#cbd3d1');
      }
      c.globalAlpha=.035;
      for(let n=0;n<1100;n++){const x=left+rand(n+911)*(right-left),y=250+rand(n+61)*270;line(c,[[x,y],[x+rand(n+88)*7,y+1]],p[2],.6);}
      c.restore();
      c.save();c.globalAlpha=far?.34:.13;c.fillStyle=gradient(c,0,330,0,550,['transparent',p[2]]);c.fillRect(left,330,right-left,260);c.restore();
    }
    if(i===4){
      const pts=[[left,h],[left,550]];
      for(let x=left;x<=right+30;x+=30)pts.push([x,506+Math.sin(x*.006)*24+Math.sin(x*.013+2)*13]);
      pts.push([right,h]);poly(c,pts,p[5]);
      for(let n=0;n<160;n++){
        const x=left+rand(n+200)*(right-left),y=507+Math.sin(x*.006)*24+Math.sin(x*.013+2)*13;
        tree(c,x,y,12+rand(n+440)*29,p,n,s.era==='classical'?'cypress':'pine');
      }
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
      for(let n=0;n<100;n++) {
        const side=n%2?1:-1,x=side*(340+rand(n+45)*900),y=570+rand(n+62)*300;
        tree(c,x,y,24+rand(n+88)*70,p,n,s.era==='classical'?'cypress':s.era==='bronze'?'oak':'pine');
      }
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
    // A pair of slowly drifting, translucent banks of cloud.
    c.save();c.globalAlpha=s.paperMode?.12:.065;
    for(let n=0;n<9;n++){
      const x=(frac(rand(n+9)+t*.0015)*(this.half*2+700))-this.half-350,y=235+rand(n+50)*110;
      for(let j=0;j<5;j++)ellipse(c,x+j*35,y+Math.sin(j+n)*5,68,5+rand(n+j)*9,p[14]);
    }c.restore();
    for(let n=0;n<7;n++){
      const x=frac(t*.008+rand(n+6))*(this.half*2+150)-this.half-75,y=300+Math.sin(n*2)*22+Math.sin(t*.2+n)*5,flap=Math.sin(t*3+n)*2;
      line(c,[[x-4,y+flap],[x,y],[x+4,y+flap]],p[4],.8);
    }
    // Mist ribbons stay low enough to preserve landmarks.
    c.save();c.globalAlpha=.065;
    for(let n=0;n<5;n++)ellipse(c,Math.sin(t*.03+n)*250,490+n*14,this.half+200,9,p[14]);c.restore();
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
    for(let n=0;n<28;n++){
      const side=n%2?1:-1,x=side*(this.half-25+rand(n+18)*100),y=1010+rand(n+40)*90;
      tree(c,x,y,100+rand(n+7)*160,p,n,s.era==='classical'?'cypress':'pine',t);
    }
    // Reeds and fine grass at the near bank; world-space widths stay isotropic.
    for(let n=0;n<110;n++){
      const x=left+rand(n+205)*(right-left),y=970+Math.sin(x*.008)*16+rand(n+19)*60;
      const h=5+rand(n)*23,sway=Math.sin(t*.9+n)*h*.09;
      line(c,[[x,y],[x+sway,y-h]],n%5?p[10]:p[11],.8);
    }
    if(!s.paperMode)for(let n=0;n<33;n++){
      const x=Math.sin(t*.08+n*7)*this.half,y=760+rand(n+90)*220+Math.sin(t*.3+n)*8;
      const alpha=.15+Math.pow(Math.sin(t*.65+n),4)*.45;
      c.save();c.globalAlpha=alpha;ellipse(c,x,y,1.1,1.1,p[14]);c.restore();
    }
  }
}
