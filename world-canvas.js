// Full-Viewport High-DPI Living World Background Renderer for Idlenomics
// Renders at native window.innerWidth x window.innerHeight * devicePixelRatio (zero stretching)

const ERA_THEMES = {
  stone: {
    skyTop: '#0F1D18',
    skyMid: '#1E352B',
    skyHorizon: '#4A5D46',
    sunColor: '#F6C97A',
    sunGlow: 'rgba(246, 201, 122, 0.24)',
    farMtn: '#1B2D25',
    midMtn: '#253C31',
    hillBack: '#2D4738',
    hillMid: '#365441',
    groundTop: '#3E5E46',
    groundBottom: '#263B2C',
    riverTop: '#2E6F73',
    riverBottom: '#1B464A',
    roadColor: '#6E5A44',
    treeCrown1: '#23422E',
    treeCrown2: '#2F563B'
  },
  bronze: {
    skyTop: '#1A130E',
    skyMid: '#3B281B',
    skyHorizon: '#785032',
    sunColor: '#FFD073',
    sunGlow: 'rgba(255, 208, 115, 0.28)',
    farMtn: '#2E2118',
    midMtn: '#422F22',
    hillBack: '#543C2B',
    hillMid: '#634733',
    groundTop: '#6E5239',
    groundBottom: '#3D2D1F',
    riverTop: '#387D80',
    riverBottom: '#1F4B4F',
    roadColor: '#8C6D4E',
    treeCrown1: '#354F2D',
    treeCrown2: '#48663A'
  },
  iron: {
    skyTop: '#101824',
    skyMid: '#22334A',
    skyHorizon: '#56697A',
    sunColor: '#F4B375',
    sunGlow: 'rgba(244, 179, 117, 0.25)',
    farMtn: '#1E2A38',
    midMtn: '#2B3B4E',
    hillBack: '#354959',
    hillMid: '#3E5663',
    groundTop: '#455E58',
    groundBottom: '#263634',
    riverTop: '#3E889B',
    riverBottom: '#22515E',
    roadColor: '#7A7872',
    treeCrown1: '#244038',
    treeCrown2: '#31544A'
  },
  classical: {
    skyTop: '#141B30',
    skyMid: '#2A385C',
    skyHorizon: '#7A7A94',
    sunColor: '#FFE08A',
    sunGlow: 'rgba(255, 224, 138, 0.30)',
    farMtn: '#272E47',
    midMtn: '#363F5E',
    hillBack: '#46526E',
    hillMid: '#4E616E',
    groundTop: '#546E5A',
    groundBottom: '#2F4036',
    riverTop: '#489DB5',
    riverBottom: '#285F73',
    roadColor: '#ABA396',
    treeCrown1: '#284A3A',
    treeCrown2: '#37614C'
  },
  medieval: {
    skyTop: '#141024',
    skyMid: '#2D2147',
    skyHorizon: '#6E4F6B',
    sunColor: '#FAD184',
    sunGlow: 'rgba(250, 209, 132, 0.28)',
    farMtn: '#231B36',
    midMtn: '#33274D',
    hillBack: '#41345C',
    hillMid: '#474663',
    groundTop: '#465C4E',
    groundBottom: '#26332D',
    riverTop: '#4C9BB5',
    riverBottom: '#26586B',
    roadColor: '#968F86',
    treeCrown1: '#233D32',
    treeCrown2: '#325444'
  }
};

const PAPER_ERA_THEMES = {
  stone: {
    skyTop: '#B8D4C2',
    skyMid: '#D5E6D8',
    skyHorizon: '#F2E8CF',
    sunColor: '#F59E2D',
    sunGlow: 'rgba(245, 158, 45, 0.28)',
    farMtn: '#8FA898',
    midMtn: '#799684',
    hillBack: '#6E8F76',
    hillMid: '#5F8267',
    groundTop: '#76996E',
    groundBottom: '#577551',
    riverTop: '#52A2A8',
    riverBottom: '#397B80',
    roadColor: '#B89F7D',
    treeCrown1: '#3C6644',
    treeCrown2: '#4D7D56'
  },
  bronze: {
    skyTop: '#D9C2A3',
    skyMid: '#EDD9BE',
    skyHorizon: '#F7EBD6',
    sunColor: '#E8881A',
    sunGlow: 'rgba(232, 136, 26, 0.28)',
    farMtn: '#AD9174',
    midMtn: '#997C5E',
    hillBack: '#8C7051',
    hillMid: '#7D6346',
    groundTop: '#8F7653',
    groundBottom: '#6E583B',
    riverTop: '#4E9BA1',
    riverBottom: '#35747A',
    roadColor: '#C4A882',
    treeCrown1: '#4A6B3B',
    treeCrown2: '#5E824D'
  },
  iron: {
    skyTop: '#B5C7D9',
    skyMid: '#D2DFEC',
    skyHorizon: '#EDEAE2',
    sunColor: '#E68A3E',
    sunGlow: 'rgba(230, 138, 62, 0.26)',
    farMtn: '#8496A8',
    midMtn: '#6F8294',
    hillBack: '#637885',
    hillMid: '#576E73',
    groundTop: '#6B8574',
    groundBottom: '#4F6658',
    riverTop: '#4D96AD',
    riverBottom: '#336E82',
    roadColor: '#A6A29B',
    treeCrown1: '#35594B',
    treeCrown2: '#467060'
  },
  classical: {
    skyTop: '#B8C4E0',
    skyMid: '#D8DFF0',
    skyHorizon: '#F5EFE0',
    sunColor: '#F0A830',
    sunGlow: 'rgba(240, 168, 48, 0.28)',
    farMtn: '#8B94B0',
    midMtn: '#76809E',
    hillBack: '#68768E',
    hillMid: '#5E737D',
    groundTop: '#6D8C72',
    groundBottom: '#516B56',
    riverTop: '#4EA4BF',
    riverBottom: '#327A91',
    roadColor: '#C9C2B4',
    treeCrown1: '#365E48',
    treeCrown2: '#48785E'
  },
  medieval: {
    skyTop: '#C4B6D6',
    skyMid: '#DFD5EB',
    skyHorizon: '#F5E8DC',
    sunColor: '#EB9838',
    sunGlow: 'rgba(235, 152, 56, 0.28)',
    farMtn: '#9182A6',
    midMtn: '#7C6D91',
    hillBack: '#6E6482',
    hillMid: '#5E6675',
    groundTop: '#66826E',
    groundBottom: '#4B6352',
    riverTop: '#4E9EB8',
    riverBottom: '#32758C',
    roadColor: '#B8B0A4',
    treeCrown1: '#335443',
    treeCrown2: '#456E59'
  }
};

export class WorldBackdropRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.state = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.startTime = performance.now();

    // Persistent ambient entities
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      x: (i * 0.16) % 1.1,
      y: 0.06 + (i % 3) * 0.055,
      scale: 0.75 + (i % 4) * 0.22,
      speed: 0.0035 + (i % 3) * 0.0015
    }));

    this.birds = Array.from({ length: 5 }, (_, i) => ({
      x: 0.15 + i * 0.17,
      y: 0.12 + (i % 3) * 0.04,
      speed: 0.012 + (i % 2) * 0.004,
      phase: i * 1.3
    }));

    this.villagers = Array.from({ length: 18 }, (_, i) => ({
      seed: i * 17.3,
      pos: (i * 0.07) % 1,
      dir: i % 2 === 0 ? 1 : -1,
      speed: 0.018 + (i % 5) * 0.004,
      lane: (i % 3) - 1,
      color: ['#D96B43', '#E6B35A', '#5DA9A4', '#85C77A', '#C98CA7'][i % 5]
    }));

    this.smokeParticles = Array.from({ length: 28 }, (_, i) => ({
      offset: i / 28,
      drift: (i % 5) * 0.18 - 0.35
    }));

    this.stars = Array.from({ length: 36 }, (_, i) => ({
      x: ((i * 73) % 97) / 97,
      y: ((i * 41) % 89) / 89 * 0.32 + 0.02,
      r: 0.9 + (i % 3) * 0.55,
      twinkleOffset: i * 0.8
    }));

    if (this.canvas) {
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }
  }

  updateState(newState) {
    this.state = newState;
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  animate(now) {
    if (this.ctx && this.state) {
      const t = (now - this.startTime) * 0.001;
      this.draw(t);
    }
    requestAnimationFrame(this.animate);
  }

  draw(t) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const s = this.state;
    const era = s.era || 'stone';
    const isPaper = Boolean(s.paperMode);
    const pal = (isPaper ? PAPER_ERA_THEMES[era] : ERA_THEMES[era]) || ERA_THEMES.stone;

    // 1. SKY GRADIENT
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    skyGrad.addColorStop(0, pal.skyTop);
    skyGrad.addColorStop(0.55, pal.skyMid);
    skyGrad.addColorStop(1, pal.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. STARS & CONSTELLATIONS (Visible in dark mode or when Oral Tradition is unlocked)
    const hasStars = (s.techs || []).includes('oral_tradition');
    if (!isPaper || hasStars) {
      const starAlphaBase = isPaper ? 0.25 : (hasStars ? 0.75 : 0.35);
      this.stars.forEach((st, idx) => {
        const pulse = 0.55 + 0.45 * Math.sin(t * 2.1 + st.twinkleOffset);
        ctx.fillStyle = idx % 5 === 0 ? pal.sunColor : '#FFFFFF';
        ctx.globalAlpha = starAlphaBase * pulse;
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        ctx.fill();
      });
      // Constellation lines if oral_tradition is researched
      if (hasStars && this.stars.length >= 6) {
        ctx.strokeStyle = pal.sunColor;
        ctx.globalAlpha = isPaper ? 0.16 : 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.stars[2].x * w, this.stars[2].y * h);
        ctx.lineTo(this.stars[7].x * w, this.stars[7].y * h);
        ctx.lineTo(this.stars[12].x * w, this.stars[12].y * h);
        ctx.lineTo(this.stars[19].x * w, this.stars[19].y * h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 3. CELESTIAL SUN / MOON WITH PULSING HALO (Always true circle in pixel coords!)
    const sunX = w * 0.82;
    const sunY = h * 0.15;
    const sunR = Math.max(22, Math.min(w, h) * 0.045);

    const haloGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 3.4);
    haloGrad.addColorStop(0, pal.sunGlow);
    haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal.sunColor;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // 4. DRIFTING VOLUMETRIC CLOUDS
    this.clouds.forEach((c) => {
      const cx = ((c.x + t * c.speed) % 1.25 - 0.12) * w;
      const cy = c.y * h;
      const cw = 68 * c.scale;
      const ch = 20 * c.scale;
      ctx.fillStyle = isPaper ? 'rgba(255, 255, 255, 0.55)' : 'rgba(242, 239, 230, 0.10)';
      ctx.beginPath();
      ctx.arc(cx, cy, ch, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.28, cy - ch * 0.25, ch * 1.15, 0, Math.PI * 2);
      ctx.arc(cx + cw * 0.58, cy, ch * 0.9, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. FAR MOUNTAIN RANGE (With snow caps in later eras)
    this.drawMountainRange(ctx, w, h, h * 0.40, h * 0.16, pal.farMtn, 1.0, era === 'iron' || era === 'classical' || era === 'medieval');

    // 6. MIDGROUND MOUNTAIN & VALLEY RIDGE
    this.drawMountainRange(ctx, w, h, h * 0.47, h * 0.11, pal.midMtn, 2.4, false);

    // 7. DISTANT BIRDS IN FLIGHT
    ctx.strokeStyle = isPaper ? 'rgba(35, 45, 38, 0.45)' : 'rgba(242, 239, 230, 0.45)';
    ctx.lineWidth = 1.4;
    this.birds.forEach((b) => {
      const bx = ((b.x + t * b.speed) % 1.15 - 0.07) * w;
      const by = b.y * h + Math.sin(t * 2.5 + b.phase) * 4;
      const wing = Math.sin(t * 7 + b.phase) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by - wing);
      ctx.quadraticCurveTo(bx - 2, by - 2, bx, by);
      ctx.quadraticCurveTo(bx + 2, by - 2, bx + 5, by - wing);
      ctx.stroke();
    });

    // 8. ROLLING HILLS & ACROPOLIS PLATEAU
    ctx.fillStyle = pal.hillBack;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.52);
    ctx.bezierCurveTo(w * 0.22, h * 0.44, w * 0.42, h * 0.54, w * 0.65, h * 0.48);
    ctx.bezierCurveTo(w * 0.82, h * 0.43, w * 0.92, h * 0.49, w, h * 0.47);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 9. BACKGROUND WONDERS & AQUEDUCT ON THE HORIZON HILLS
    this.drawHorizonMonuments(ctx, w, h, t, s);

    // 10. MIDGROUND HILLS & FOREST / QUARRY FLANKS
    ctx.fillStyle = pal.hillMid;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.57);
    ctx.bezierCurveTo(w * 0.18, h * 0.53, w * 0.36, h * 0.61, w * 0.58, h * 0.56);
    ctx.bezierCurveTo(w * 0.78, h * 0.51, w * 0.90, h * 0.58, w, h * 0.55);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 11. FERTILE VALLEY FLOOR
    const groundGrad = ctx.createLinearGradient(0, h * 0.58, 0, h);
    groundGrad.addColorStop(0, pal.groundTop);
    groundGrad.addColorStop(1, pal.groundBottom);
    ctx.fillStyle = groundGrad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.63);
    ctx.quadraticCurveTo(w * 0.3, h * 0.59, w * 0.62, h * 0.63);
    ctx.quadraticCurveTo(w * 0.85, h * 0.66, w, h * 0.61);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // 12. WINDING RIVER & ANIMATED SHIMMER
    this.drawRiverAndMaritime(ctx, w, h, t, s, pal);

    // 13. FOREST GROVES (LEFT) & QUARRY/MINE CLIFFS (RIGHT)
    this.drawForestAndLumber(ctx, w, h, t, s, pal);
    this.drawMinesAndQuarry(ctx, w, h, t, s, pal);

    // 14. AGRICULTURE FIELDS & GRANARIES
    this.drawFarmlands(ctx, w, h, t, s);

    // 15. WINDING SETTLEMENT ROADS
    this.drawSettlementRoads(ctx, w, h, s, pal);

    // 16. GROWING SETTLEMENT BUILDINGS, WORKSHOPS & FORTIFICATIONS
    this.drawSettlementStructures(ctx, w, h, t, s);

    // 17. LIVING VILLAGERS & HEARTH EMBER PARTICLES
    this.drawLivingCitizens(ctx, w, h, t, s);
    this.drawForegroundAtmosphere(ctx, w, h, t, s, isPaper);

    ctx.restore();
  }

  drawMountainRange(ctx, w, h, baseY, amp, color, seedOffset, withSnow) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const steps = 18;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const n =
        Math.sin(i * 0.85 + seedOffset) * 0.5 +
        Math.cos(i * 1.65 - seedOffset * 0.7) * 0.32 +
        Math.sin(i * 2.9 + seedOffset * 1.3) * 0.18;
      const y = baseY - Math.abs(n) * amp;
      pts.push({ x, y });
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    if (withSnow) {
      ctx.fillStyle = 'rgba(242, 239, 230, 0.24)';
      pts.forEach((p, idx) => {
        if (idx > 0 && idx < pts.length - 1 && p.y < baseY - amp * 0.48) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - w / (steps * 2.4), p.y + amp * 0.22);
          ctx.lineTo(p.x + w / (steps * 2.4), p.y + amp * 0.22);
          ctx.closePath();
          ctx.fill();
        }
      });
    }
  }

  drawHorizonMonuments(ctx, w, h, t, s) {
    const b = s.buildings || {};
    const wnd = s.wonders || {};
    const techs = s.techs || [];

    // 1. Stone Aqueduct spanning midground valley (if built or Classical+ age)
    const aqueductCount = b.aqueduct || 0;
    if (aqueductCount > 0 || techs.includes('engineering')) {
      const startX = w * 0.50;
      const endX = w * 0.84;
      const topY = h * 0.48;
      const bottomY = h * 0.57;
      const archCount = Math.max(8, Math.min(16, Math.floor((endX - startX) / 26)));
      const stepW = (endX - startX) / archCount;

      ctx.fillStyle = '#C9C0B1';
      ctx.fillRect(startX, topY, endX - startX, 5);
      // Water channel
      ctx.fillStyle = '#58B4C9';
      ctx.fillRect(startX, topY + 1, endX - startX, 2);

      ctx.fillStyle = '#B5AA99';
      for (let i = 0; i <= archCount; i++) {
        const px = startX + i * stepW;
        ctx.fillRect(px - 3, topY + 5, 6, bottomY - topY - 5);
      }
    }

    // 2. Megalithic Ring on Left Hillcrest (3 stages)
    const megaStage = wnd.megalith || (techs.includes('masonry') ? 1 : 0);
    if (megaStage > 0) {
      const mx = w * 0.16;
      const my = h * 0.485;
      const pairs = Math.min(3, megaStage);
      for (let i = 0; i < pairs; i++) {
        const ox = mx + (i - 1) * 26;
        ctx.fillStyle = '#8F9B93';
        ctx.fillRect(ox - 8, my - 18, 5, 18);
        ctx.fillRect(ox + 3, my - 18, 5, 18);
        ctx.fillStyle = '#AEBAB2';
        ctx.fillRect(ox - 10, my - 22, 20, 4);
      }
      if (megaStage >= 3) {
        const glow = ctx.createRadialGradient(mx, my - 12, 2, mx, my - 12, 34);
        glow.addColorStop(0, 'rgba(133, 209, 124, 0.28)');
        glow.addColorStop(1, 'rgba(133, 209, 124, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(mx, my - 12, 34, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Great Terraced Ziggurat on Central-Left Plateau (4 stages)
    const zigStage = wnd.ziggurat || 0;
    if (zigStage > 0) {
      const zx = w * 0.34;
      const zy = h * 0.53;
      const tiers = Math.min(4, zigStage);
      for (let i = 0; i < tiers; i++) {
        const tw = 74 - i * 15;
        const th = 10;
        const ty = zy - (i + 1) * th;
        ctx.fillStyle = i % 2 === 0 ? '#C78D52' : '#D9A166';
        ctx.fillRect(zx - tw / 2, ty, tw, th);
        ctx.strokeStyle = '#6E4826';
        ctx.lineWidth = 1;
        ctx.strokeRect(zx - tw / 2, ty, tw, th);
      }
      // Central stairway
      ctx.fillStyle = '#E8B87D';
      ctx.fillRect(zx - 4, zy - tiers * 10, 8, tiers * 10);
      if (zigStage >= 4) {
        // Summit sanctuary fire
        ctx.fillStyle = '#F7C96E';
        ctx.beginPath();
        ctx.arc(zx, zy - tiers * 10 - 4, 4 + Math.sin(t * 6) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Grand Stone Cathedral on Right Acropolis (5 stages or Guild Hall)
    const catStage = wnd.cathedral || 0;
    if (catStage > 0) {
      const cx = w * 0.72;
      const cy = h * 0.51;
      // Base nave
      ctx.fillStyle = '#9E95A8';
      ctx.fillRect(cx - 32, cy - 26, 64, 26);
      // Pitched roof
      ctx.fillStyle = '#5B4B6E';
      ctx.beginPath();
      ctx.moveTo(cx - 35, cy - 26);
      ctx.lineTo(cx, cy - 42);
      ctx.lineTo(cx + 35, cy - 26);
      ctx.closePath();
      ctx.fill();

      // Twin gothic towers & spires as stages progress
      if (catStage >= 2) {
        ctx.fillStyle = '#B2A8BD';
        ctx.fillRect(cx - 32, cy - 46, 14, 46);
        ctx.fillRect(cx + 18, cy - 46, 14, 46);
      }
      if (catStage >= 3) {
        // Rose window
        ctx.fillStyle = '#F5C469';
        ctx.beginPath();
        ctx.arc(cx, cy - 16, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (catStage >= 4) {
        // Tall spires
        ctx.fillStyle = '#4A3B5C';
        ctx.beginPath();
        ctx.moveTo(cx - 33, cy - 46);
        ctx.lineTo(cx - 25, cy - 72);
        ctx.lineTo(cx - 17, cy - 46);
        ctx.moveTo(cx + 17, cy - 46);
        ctx.lineTo(cx + 25, cy - 72);
        ctx.lineTo(cx + 33, cy - 46);
        ctx.fill();
      }
    }
  }

  drawRiverAndMaritime(ctx, w, h, t, s, pal) {
    // Winding river across lower valley
    const riverGrad = ctx.createLinearGradient(0, h * 0.67, 0, h * 0.80);
    riverGrad.addColorStop(0, pal.riverTop);
    riverGrad.addColorStop(1, pal.riverBottom);

    ctx.fillStyle = riverGrad;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.bezierCurveTo(w * 0.28, h * 0.66, w * 0.60, h * 0.75, w, h * 0.69);
    ctx.lineTo(w, h * 0.77);
    ctx.bezierCurveTo(w * 0.62, h * 0.83, w * 0.28, h * 0.74, 0, h * 0.79);
    ctx.closePath();
    ctx.fill();

    // Animated water ripples
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const rx = ((i * 0.08 + t * 0.015) % 0.96) * w;
      const ry = h * 0.735 + Math.sin(rx * 0.01) * (h * 0.015) + (i % 3) * 5;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 22, ry);
      ctx.stroke();
    }

    // Bridge over the river once masonry or engineering is unlocked
    const techs = s.techs || [];
    if (techs.includes('masonry') || techs.includes('engineering')) {
      const bx = w * 0.48;
      const by = h * 0.74;
      ctx.fillStyle = '#B8AFA0';
      ctx.fillRect(bx - 28, by - 8, 56, 8);
      ctx.fillStyle = '#403B33';
      ctx.beginPath();
      ctx.arc(bx - 12, by, 7, Math.PI, 0);
      ctx.arc(bx + 12, by, 7, Math.PI, 0);
      ctx.fill();
    }

    // Harbor Colossus astride the river mouth (right side)
    const colStage = (s.wonders && s.wonders.colossus) || 0;
    if (colStage > 0) {
      const cx = w * 0.86;
      const cy = h * 0.73;
      // Stone pedestals
      ctx.fillStyle = '#C9C0B1';
      ctx.fillRect(cx - 18, cy - 14, 10, 18);
      ctx.fillRect(cx + 8, cy - 14, 10, 18);
      if (colStage >= 2) {
        // Bronze legs & torso
        ctx.strokeStyle = '#CD8E4E';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(cx - 13, cy - 14);
        ctx.lineTo(cx - 4, cy - 36);
        ctx.moveTo(cx + 13, cy - 14);
        ctx.lineTo(cx + 4, cy - 36);
        ctx.stroke();
        ctx.fillStyle = '#D99B57';
        ctx.fillRect(cx - 8, cy - 52, 16, 18);
      }
      if (colStage >= 4) {
        // Head & raised torch arm
        ctx.beginPath();
        ctx.arc(cx, cy - 58, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#D99B57';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + 7, cy - 50);
        ctx.lineTo(cx + 15, cy - 66);
        ctx.stroke();
        // Beacon flame
        const flameR = 5 + Math.sin(t * 8) * 1.5;
        ctx.fillStyle = '#FFD166';
        ctx.beginPath();
        ctx.arc(cx + 15, cy - 70, flameR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Merchant Boats gliding on the river (when pottery or caravan_trade is researched)
    if (techs.includes('pottery') || techs.includes('caravan_trade') || (s.buildings.forager_hut || 0) > 0) {
      const boatCount = techs.includes('engineering') ? 3 : techs.includes('caravan_trade') ? 2 : 1;
      for (let i = 0; i < boatCount; i++) {
        const bx = ((0.12 + i * 0.31 + t * (0.018 + i * 0.004)) % 0.92 + 0.04) * w;
        const by = h * 0.735 + Math.sin(bx * 0.008) * 6 + i * 4;
        // Hull
        ctx.fillStyle = '#6E472B';
        ctx.beginPath();
        ctx.moveTo(bx - 14, by);
        ctx.lineTo(bx + 14, by);
        ctx.lineTo(bx + 9, by + 6);
        ctx.lineTo(bx - 9, by + 6);
        ctx.closePath();
        ctx.fill();
        // Sail if Bronze Age or later
        if (s.era !== 'stone' || techs.includes('caravan_trade')) {
          ctx.fillStyle = '#F2EAD9';
          ctx.beginPath();
          ctx.moveTo(bx, by - 16);
          ctx.lineTo(bx + 10, by - 2);
          ctx.lineTo(bx - 6, by - 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  drawForestAndLumber(ctx, w, h, t, s, pal) {
    // Pine & oak forest cluster on the left valley flank
    const treeCount = 16;
    for (let i = 0; i < treeCount; i++) {
      const tx = w * (0.02 + (i / treeCount) * 0.24);
      const ty = h * (0.58 + (i % 4) * 0.022);
      const sway = Math.sin(t * 1.6 + i) * 1.5;
      const scale = 0.8 + (i % 3) * 0.22;

      // Trunk
      ctx.fillStyle = '#4A3525';
      ctx.fillRect(tx - 2 * scale, ty, 4 * scale, 10 * scale);

      // Layered pine/canopy
      ctx.fillStyle = i % 2 === 0 ? pal.treeCrown1 : pal.treeCrown2;
      ctx.beginPath();
      ctx.moveTo(tx + sway, ty - 22 * scale);
      ctx.lineTo(tx - 10 * scale, ty + 2 * scale);
      ctx.lineTo(tx + 10 * scale, ty + 2 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(tx + sway * 1.2, ty - 30 * scale);
      ctx.lineTo(tx - 8 * scale, ty - 8 * scale);
      ctx.lineTo(tx + 8 * scale, ty - 8 * scale);
      ctx.closePath();
      ctx.fill();
    }

    // Timber Yard structures when player builds lumber_pile
    const lumberCount = Math.min(4, (s.buildings && s.buildings.lumber_pile) || 0);
    for (let i = 0; i < lumberCount; i++) {
      const lx = w * (0.14 + i * 0.045);
      const ly = h * (0.64 + (i % 2) * 0.02);
      // Open-sided sawmill shed
      ctx.fillStyle = '#8C5E3C';
      ctx.fillRect(lx - 12, ly - 10, 24, 10);
      ctx.fillStyle = '#5E3D24';
      ctx.beginPath();
      ctx.moveTo(lx - 15, ly - 10);
      ctx.lineTo(lx, ly - 19);
      ctx.lineTo(lx + 15, ly - 10);
      ctx.closePath();
      ctx.fill();
      // Stacked log pile beside shed
      ctx.fillStyle = '#B88456';
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.arc(lx + 16 + r * 4, ly - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawMinesAndQuarry(ctx, w, h, t, s, pal) {
    const mines = (s.buildings && s.buildings.copper_mine) || 0;
    const quarriers = (s.jobs && s.jobs.quarrier) || 0;
    const miners = ((s.jobs && s.jobs.miner) || 0) + ((s.jobs && s.jobs.coal_miner) || 0);

    // Rocky outcrop on the right hillside
    const rx = w * 0.84;
    const ry = h * 0.59;
    ctx.fillStyle = '#5C6166';
    ctx.beginPath();
    ctx.moveTo(rx - 45, ry + 20);
    ctx.lineTo(rx - 15, ry - 18);
    ctx.lineTo(rx + 25, ry - 26);
    ctx.lineTo(rx + 65, ry + 22);
    ctx.closePath();
    ctx.fill();

    if (mines > 0 || quarriers > 0 || miners > 0) {
      const portals = Math.max(1, Math.min(3, mines + (miners > 0 ? 1 : 0)));
      for (let i = 0; i < portals; i++) {
        const px = rx - 10 + i * 24;
        const py = ry + 14 - i * 4;
        // Dark tunnel mouth
        ctx.fillStyle = '#181A1C';
        ctx.fillRect(px - 7, py - 12, 14, 12);
        // Timber minehead framing
        ctx.strokeStyle = '#9C6D44';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px - 8, py - 13, 16, 13);
        // Glowing lantern by mine entrance
        ctx.fillStyle = '#F5B851';
        ctx.beginPath();
        ctx.arc(px + 10, py - 8, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawFarmlands(ctx, w, h, t, s) {
    const farmers = (s.jobs && s.jobs.farmer) || 0;
    const granaries = (s.buildings && s.buildings.granary) || 0;
    const plots = Math.min(6, Math.max(1, farmers + granaries));

    // Terraced golden crop fields on the lower-left / center-left bank
    for (let i = 0; i < plots; i++) {
      const fx = w * (0.20 + (i % 3) * 0.068);
      const fy = h * (0.81 + Math.floor(i / 3) * 0.055);
      const fw = Math.max(36, w * 0.052);
      const fh = 16;

      // Tilted earth plot
      ctx.fillStyle = '#4A3B2A';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + fw, fy - 3);
      ctx.lineTo(fx + fw + 8, fy + fh);
      ctx.lineTo(fx - 6, fy + fh + 2);
      ctx.closePath();
      ctx.fill();

      // Swaying golden wheat rows
      const sway = Math.sin(t * 2.4 + i) * 2;
      ctx.strokeStyle = '#E6B85C';
      ctx.lineWidth = 1.4;
      for (let r = 4; r < fw - 2; r += 5) {
        ctx.beginPath();
        ctx.moveTo(fx + r, fy + fh - 2);
        ctx.lineTo(fx + r + sway, fy + 2);
        ctx.stroke();
      }
    }

    // Earthen Granary silos beside the fields
    for (let i = 0; i < Math.min(4, granaries); i++) {
      const gx = w * (0.18 + i * 0.032);
      const gy = h * 0.79;
      ctx.fillStyle = '#C98A5B';
      ctx.fillRect(gx - 8, gy - 14, 16, 14);
      ctx.fillStyle = '#DEAA7B';
      ctx.beginPath();
      ctx.arc(gx, gy - 14, 8, Math.PI, 0);
      ctx.fill();
    }
  }

  drawSettlementRoads(ctx, w, h, s, pal) {
    ctx.strokeStyle = pal.roadColor;
    ctx.lineWidth = s.era === 'classical' || s.era === 'medieval' ? 5 : 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.66);
    ctx.quadraticCurveTo(w * 0.36, h * 0.68, w * 0.50, h * 0.67);
    ctx.quadraticCurveTo(w * 0.68, h * 0.66, w * 0.84, h * 0.63);
    ctx.stroke();
  }

  drawSettlementStructures(ctx, w, h, t, s) {
    const b = s.buildings || {};
    const centerX = w * 0.48;
    const baseY = h * 0.665;

    // 1. Central Hearth / Town Plaza Fire
    const fireGlow = ctx.createRadialGradient(centerX, baseY + 6, 2, centerX, baseY + 6, 32);
    fireGlow.addColorStop(0, 'rgba(246, 185, 88, 0.45)');
    fireGlow.addColorStop(1, 'rgba(246, 185, 88, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(centerX, baseY + 6, 32, 0, Math.PI * 2);
    ctx.fill();

    // Stone fire ring & flickering flame
    ctx.fillStyle = '#8B948E';
    ctx.fillRect(centerX - 7, baseY + 5, 14, 4);
    ctx.fillStyle = '#FFAE42';
    ctx.beginPath();
    ctx.moveTo(centerX - 5, baseY + 6);
    ctx.lineTo(centerX + Math.sin(t * 9) * 2, baseY - 6 - Math.cos(t * 7) * 2);
    ctx.lineTo(centerX + 5, baseY + 6);
    ctx.closePath();
    ctx.fill();

    // 2. Hide Shelters & Forager Camps (Stone Age & Early Settlement Core)
    const tents = Math.min(8, Math.max(1, (b.hide_tent || 0) + (b.forager_hut || 0)));
    const tentOffsets = [-0.14, 0.05, -0.09, 0.10, -0.19, 0.15, -0.04, 0.20];
    for (let i = 0; i < tents; i++) {
      const tx = centerX + tentOffsets[i] * w;
      const ty = baseY + (i % 2 === 0 ? -4 : 8);
      // A-frame shelter with warm doorway
      ctx.fillStyle = i % 2 === 0 ? '#B57F50' : '#9E6B40';
      ctx.beginPath();
      ctx.moveTo(tx - 13, ty);
      ctx.lineTo(tx, ty - 19);
      ctx.lineTo(tx + 13, ty);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#E8DFCE';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Warm lit entrance flap
      ctx.fillStyle = '#F5B851';
      ctx.beginPath();
      ctx.moveTo(tx - 4, ty);
      ctx.lineTo(tx, ty - 8);
      ctx.lineTo(tx + 4, ty);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Mudbrick Houses / Townhouses
    const houses = Math.min(8, b.mud_brick_hut || 0);
    for (let i = 0; i < houses; i++) {
      const hx = w * (0.34 + i * 0.042);
      const hy = baseY - 8 + (i % 2) * 10;
      ctx.fillStyle = s.era === 'classical' || s.era === 'medieval' ? '#D9CFC1' : '#C99263';
      ctx.fillRect(hx - 12, hy - 15, 24, 15);
      // Terracotta / timber roof
      ctx.fillStyle = s.era === 'medieval' ? '#5C4438' : '#9E4E36';
      ctx.beginPath();
      ctx.moveTo(hx - 14, hy - 15);
      ctx.lineTo(hx, hy - 24);
      ctx.lineTo(hx + 14, hy - 15);
      ctx.closePath();
      ctx.fill();
      // Lit windows
      ctx.fillStyle = '#FAD175';
      ctx.fillRect(hx - 7, hy - 10, 4, 4);
      ctx.fillRect(hx + 3, hy - 10, 4, 4);
    }

    // 4. Kiln Smelteries with animated rising smoke plumes
    const smelteries = Math.min(4, b.smeltery || 0);
    for (let i = 0; i < smelteries; i++) {
      const sx = w * (0.64 + i * 0.045);
      const sy = baseY + 2;
      // Stone smelter base & chimney stack
      ctx.fillStyle = '#6E5041';
      ctx.fillRect(sx - 12, sy - 14, 24, 14);
      ctx.fillStyle = '#543B2F';
      ctx.fillRect(sx + 2, sy - 28, 8, 16);
      // Glowing furnace mouth
      ctx.fillStyle = '#FF7F2A';
      ctx.beginPath();
      ctx.arc(sx - 3, sy, 4.5, Math.PI, 0);
      ctx.fill();

      // Rising smoke particles
      for (let p = 0; p < 5; p++) {
        const age = (t * 0.45 + p * 0.2 + i * 0.3) % 1;
        const px = sx + 6 + age * 22 + Math.sin(t * 2 + p) * 3;
        const py = sy - 30 - age * 38;
        const pr = 3 + age * 8;
        ctx.fillStyle = `rgba(220, 216, 208, ${(1 - age) * 0.42})`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 5. Scriptoriums / Libraries (Classical & Iron Age)
    const libs = Math.min(2, b.library || 0);
    for (let i = 0; i < libs; i++) {
      const lx = w * (0.43 + i * 0.12);
      const ly = baseY - 14;
      // Marble podium & columns
      ctx.fillStyle = '#E6E0D4';
      ctx.fillRect(lx - 20, ly - 16, 40, 16);
      ctx.fillStyle = '#B8B0A2';
      for (let c = -15; c <= 15; c += 7.5) {
        ctx.fillRect(lx + c - 1.5, ly - 15, 3, 14);
      }
      // Pediment roof
      ctx.fillStyle = '#C2644F';
      ctx.beginPath();
      ctx.moveTo(lx - 23, ly - 16);
      ctx.lineTo(lx, ly - 27);
      ctx.lineTo(lx + 23, ly - 16);
      ctx.closePath();
      ctx.fill();
    }

    // 6. Medieval Guild Halls
    const guilds = Math.min(2, b.guild_hall || 0);
    for (let i = 0; i < guilds; i++) {
      const gx = w * (0.54 + i * 0.07);
      const gy = baseY - 10;
      ctx.fillStyle = '#DFD5C5';
      ctx.fillRect(gx - 18, gy - 24, 36, 24);
      ctx.fillStyle = '#4A3959';
      ctx.beginPath();
      ctx.moveTo(gx - 21, gy - 24);
      ctx.lineTo(gx, gy - 42);
      ctx.lineTo(gx + 21, gy - 24);
      ctx.closePath();
      ctx.fill();
      // Guild banner
      ctx.fillStyle = '#E6B34B';
      ctx.fillRect(gx - 2, gy - 50, 10, 5);
    }

    // 7. Military Palisades / Watchtowers if garrison units are trained
    const totalUnits = Object.values(s.units || {}).reduce((a, c) => a + c, 0);
    if (totalUnits > 0) {
      const towerX = w * 0.28;
      const towerY = baseY + 6;
      ctx.fillStyle = s.era === 'stone' || s.era === 'bronze' ? '#785538' : '#8C9298';
      ctx.fillRect(towerX - 8, towerY - 26, 16, 26);
      ctx.fillStyle = '#D9534F';
      ctx.beginPath();
      ctx.moveTo(towerX, towerY - 26);
      ctx.lineTo(towerX, towerY - 36);
      ctx.lineTo(towerX + 10, towerY - 32 + Math.sin(t * 6) * 2);
      ctx.lineTo(towerX, towerY - 29);
      ctx.fill();
    }
  }

  drawLivingCitizens(ctx, w, h, t, s) {
    const popCount = Math.min(18, Math.max(2, Math.floor(s.pop || 3)));
    for (let i = 0; i < popCount; i++) {
      const v = this.villagers[i];
      const cycle = (v.pos + t * v.speed * v.dir + 100) % 1;
      const vx = w * (0.20 + cycle * 0.62);
      const vy = h * 0.665 + v.lane * 5 + Math.abs(Math.sin(t * 9 + v.seed)) * -2.5;

      // Body
      ctx.fillStyle = v.color;
      ctx.fillRect(vx - 2, vy - 6, 4, 6);
      // Head
      ctx.fillStyle = '#F2D6B8';
      ctx.beginPath();
      ctx.arc(vx, vy - 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawForegroundAtmosphere(ctx, w, h, t, s, isPaper) {
    if (isPaper) return;
    // Subtle glowing fireflies / forge embers drifting across the valley
    for (let i = 0; i < 14; i++) {
      const fx = ((i * 0.073 + Math.sin(t * 0.4 + i) * 0.03 + 1) % 1) * w;
      const fy = h * (0.58 + ((i * 0.19) % 0.35)) - ((t * 8 + i * 15) % 45);
      const alpha = 0.25 + 0.35 * Math.sin(t * 3 + i * 1.7);
      ctx.fillStyle = i % 3 === 0 ? `rgba(133, 209, 124, ${alpha})` : `rgba(246, 190, 95, ${alpha})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
