/* THE LONG DUST — a desert survival game */
(() => {
'use strict';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const now = () => performance.now();
const $ = (sel) => document.querySelector(sel);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function formatClock(minutes) {
  const m = Math.floor(minutes) % 1440;
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

// ---------------------------------------------------------------------------
// World definitions
// ---------------------------------------------------------------------------
const WORLD = { w: 4200, h: 4200 };
const OUTPOST = { x: 2100, y: 2100, r: 230, name: "WAYFARER'S REST" };
const START = { x: 2190, y: 2180 };
const RELAY = { x: 2236, y: 2088, name: 'THE RELAY' };
const MARA = { x: 2034, y: 2046, name: 'MARA' };

const CORE_SITES = ['stair', 'archive', 'cradle'];

const SITE_DEFS = [
  {
    id: 'stair', name: 'THE STAIR', kicker: 'RUIN OF THE SECOND AGE',
    x: 930, y: 750, w: 300, h: 218, tier: 3, core: true, seed: 41,
    flavor: 'A stair to nowhere, still climbing into the sky.'
  },
  {
    id: 'cradle', name: 'CRADLE 7', kicker: 'COLONY FOUNDATION',
    x: 3450, y: 1190, w: 286, h: 206, tier: 3, core: true, seed: 72,
    flavor: 'The first children born here were told the stars were a story.'
  },
  {
    id: 'archive', name: 'THE DEEP ARCHIVE', kicker: 'SUBLEVEL RUIN',
    x: 2050, y: 3590, w: 318, h: 228, tier: 3, core: true, seed: 19,
    flavor: 'Every answer humanity owned, buried under ninety metres of sand.'
  },
  {
    id: 'pylons', name: 'NINE PYLONS', kicker: 'ORBITAL ANCHOR YARD',
    x: 3010, y: 1890, w: 268, h: 190, tier: 1, seed: 7,
    flavor: 'Eight pylons still stand. The ninth left without saying goodbye.'
  },
  {
    id: 'kettle', name: 'THE KETTLE', kicker: 'SETTLEMENT REMAINS',
    x: 1330, y: 1960, w: 248, h: 180, tier: 1, seed: 88,
    flavor: 'A circle of homes around a dry well. Someone scratched "later" on the door.'
  },
  {
    id: 'mirror', name: 'SALT MIRROR', kicker: 'EVAPORATION BASIN',
    x: 3290, y: 2910, w: 274, h: 198, tier: 2, seed: 53,
    flavor: 'A lake that dried so slowly it forgot it was ever water.'
  },
  {
    id: 'rust', name: 'OUR LADY OF RUST', kicker: 'MACHINE SHRINE',
    x: 940, y: 2770, w: 266, h: 196, tier: 2, seed: 31,
    flavor: 'They prayed to the harvesters. For a while, the harvesters answered.'
  },
  {
    id: 'hollow', name: 'THE HOLLOW', kicker: 'SINKHOLE RUIN',
    x: 2510, y: 3010, w: 254, h: 186, tier: 2, seed: 64,
    flavor: 'The ground opened. The town did not have time to disagree.'
  }
];

const LANDMARKS = [
  { id: 'hand', name: 'THE HAND', kicker: 'MONUMENT', x: 610, y: 1380, type: 'hand',
    flavor: 'Five stone fingers, open to a sky that never gave anything back.' },
  { id: 'wreck', name: 'THE MERIDIAN', kicker: 'COLONY WRECK', x: 3620, y: 3470, type: 'wreck',
    flavor: 'The last ship out. It did not get far.' },
  { id: 'well', name: 'THE DRY WELL', kicker: 'LANDMARK', x: 1600, y: 680, type: 'well',
    flavor: 'A well. A rope. No bucket. No water. Some things leave in stages.' },
  { id: 'field', name: 'THE GLASS FIELD', kicker: 'GLASS CRATER', x: 3550, y: 640, type: 'glass',
    flavor: 'The sand fused here. At night it holds the heat like a memory.' }
];

const SHOP_ITEMS = [
  { id: 'water', name: 'Canteen fill', note: '+35 water', price: 5, kind: 'supply' },
  { id: 'food', name: 'Field ration', note: '+35 rations', price: 6, kind: 'supply' },
  { id: 'medgel', name: 'Med-gel', note: '+45 body', price: 18, kind: 'supply' },
  { id: 'pack', name: 'Frame pack', note: '+8 pack weight', price: 72, kind: 'upgrade' },
  { id: 'boots', name: 'Dune boots', note: '+15% walk speed', price: 84, kind: 'upgrade' },
  { id: 'canteen', name: 'Insulated canteen', note: 'Water drains 24% slower', price: 96, kind: 'upgrade' },
  { id: 'scanner', name: 'Long-range scanner', note: '+45% scan radius, faster recharge', price: 88, kind: 'upgrade' }
];

const NODE_NAMES = { scrap: 'SALVAGE', cache: 'SEALED CACHE', core: 'ECHO CORE' };
const NODE_HOLDS = { scrap: 1.55, cache: 2.15, core: 3.8 };

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const radarCanvas = $('#radar');
const radarCtx = radarCanvas.getContext('2d');
const compassCanvas = $('#compass');
const compassCtx = compassCanvas.getContext('2d');
const mapCanvas = $('#mapCanvas');

const el = {
  title: $('#titleScreen'),
  hud: $('#hud'),
  overlay: $('#overlay'),
  overlayPanel: $('#overlayPanel'),
  day: $('#hudDay'),
  time: $('#hudTime'),
  place: $('#hudPlace'),
  weather: $('#hudWeather'),
  temp: $('#hudTemp'),
  bearing: $('#hudBearing'),
  waterVal: $('#waterVal'), foodVal: $('#foodVal'), healthVal: $('#healthVal'),
  waterBar: $('#waterBar'), foodBar: $('#foodBar'), healthBar: $('#healthBar'),
  packVal: $('#packVal'), shelter: $('#shelterState'),
  scanState: $('#scanState'), radarHint: $('#radarHint'),
  objTitle: $('#objTitle'), objBody: $('#objBody'), objProgress: $('#objProgress'),
  invScrap: $('#invScrap'), invRelic: $('#invRelic'), invCore: $('#invCore'), invCredits: $('#invCredits'),
  interact: $('#interactPrompt'), interactKey: $('#interactKey'), interactLabel: $('#interactLabel'),
  interactSub: $('#interactSub'), interactFill: $('#interactFill'),
  toasts: $('#toastStack'), location: $('#locationBanner'), locationKicker: $('#locationKicker'),
  locationName: $('#locationName'), fade: $('#fade'), sound: $('#btnSound'), continueBtn: $('#btnContinue'),
  touch: $('#touchControls'), joystick: $('#joystick'), thumb: $('#joystickThumb')
};

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------
let view = { w: innerWidth, h: innerHeight, dpr: Math.min(2, devicePixelRatio || 1), zoom: 1 };
function resize() {
  view.w = innerWidth;
  view.h = innerHeight;
  view.dpr = Math.min(2, devicePixelRatio || 1);
  view.zoom = view.w < 700 ? 0.82 : view.w < 1100 ? 0.92 : 1;
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  canvas.style.width = view.w + 'px';
  canvas.style.height = view.h + 'px';
  if (mapCanvas) {
    const box = mapCanvas.getBoundingClientRect();
    const d = Math.min(2, devicePixelRatio || 1);
    mapCanvas.width = Math.max(320, Math.round(box.width * d));
    mapCanvas.height = mapCanvas.width;
  }
  buildTerrainPattern();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Audio — a small procedural wind bed
// ---------------------------------------------------------------------------
const Audio = {
  ctx: null, master: null, windGain: null, windFilter: null, muted: false, started: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = this.ctx = new AC();
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ac.destination);

    const len = ac.sampleRate * 4;
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2 + white * 0.035;
    }
    const src = ac.createBufferSource();
    src.buffer = buffer; src.loop = true;
    this.windFilter = ac.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ac.createGain();
    this.windGain.gain.value = 0.24;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // low, breathing drone
    const drone = ac.createOscillator();
    const drone2 = ac.createOscillator();
    const dg = ac.createGain();
    drone.type = 'sine'; drone.frequency.value = 55;
    drone2.type = 'triangle'; drone2.frequency.value = 82.5;
    dg.gain.value = 0.025;
    drone.connect(dg); drone2.connect(dg); dg.connect(this.master);
    drone.start(); drone2.start();
    this.started = true;
  },
  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  setMuted(m) {
    this.muted = m;
    document.body.classList.toggle('muted', m);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.1);
    }
  },
  blip(freq = 500, dur = 0.06, gain = 0.05, type = 'sine') {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const ac = this.ctx;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start(); o.stop(ac.currentTime + dur + 0.02);
  },
  scan() {
    if (!this.ctx || this.muted) return;
    const ac = this.ctx;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(720, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.45);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.055, ac.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
    o.connect(g).connect(this.master); o.start(); o.stop(ac.currentTime + 0.55);
  },
  pickup() {
    if (!this.ctx || this.muted) return;
    const ac = this.ctx;
    [440, 660, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, ac.currentTime + i * 0.055);
      g.gain.linearRampToValueAtTime(0.04, ac.currentTime + i * 0.055 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.055 + 0.16);
      o.connect(g).connect(this.master);
      o.start(ac.currentTime + i * 0.055); o.stop(ac.currentTime + i * 0.055 + 0.2);
    });
  },
  update(dt, weather, night) {
    if (!this.ctx || !this.windGain) return;
    const target = weather === 'storm' ? 0.62 : weather === 'dust' ? 0.4 : 0.2;
    this.windGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.5);
    this.windFilter.frequency.setTargetAtTime(weather === 'storm' ? 680 : night ? 250 : 430, this.ctx.currentTime, 1.2);
  }
};

// ---------------------------------------------------------------------------
// Terrain pattern
// ---------------------------------------------------------------------------
let terrainPattern = null;
function buildTerrainPattern() {
  const tile = document.createElement('canvas');
  tile.width = 256; tile.height = 256;
  const g = tile.getContext('2d');
  g.fillStyle = '#c39a67';
  g.fillRect(0, 0, 256, 256);
  const rnd = mulberry32(9081);
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    const a = rnd() * 0.08;
    g.fillStyle = rnd() > 0.55 ? `rgba(255,236,200,${a})` : `rgba(95,64,38,${a * 0.8})`;
    g.fillRect(x, y, 1 + rnd() * 2, 1);
  }
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = `rgba(105,72,42,${0.025 + rnd() * 0.03})`;
    g.lineWidth = 1;
    g.beginPath();
    const y = rnd() * 256;
    g.moveTo(-20, y);
    g.bezierCurveTo(70, y - 12, 150, y + 14, 280, y - 4);
    g.stroke();
  }
  terrainPattern = ctx.createPattern(tile, 'repeat');
}

// ---------------------------------------------------------------------------
// Procedural world
// ---------------------------------------------------------------------------
let world = null;

function inWall(px, py, wall, margin = 0) {
  return px > wall.x - margin && px < wall.x + wall.w + margin &&
         py > wall.y - margin && py < wall.y + wall.h + margin;
}

function buildRuin(def) {
  const rng = mulberry32(def.seed * 997 + 13);
  const hw = def.w / 2, hh = def.h / 2, t = 14;
  const walls = [];
  const addWall = (x, y, w, h) => walls.push({ x: def.x + x, y: def.y + y, w, h });
  const addLocal = (x, y, w, h) => addWall(x, y, w, h);

  // Outer shell with collapsed gaps and one broad entrance.
  addLocal(-hw, -hh, def.w * 0.61, t);
  addLocal(-hw + def.w * 0.72, -hh, def.w * 0.28, t);
  addLocal(-hw, hh - t, def.w * 0.42, t);
  addLocal(-hw + def.w * 0.59, hh - t, def.w * 0.41, t);
  addLocal(-hw, -hh + t, t, def.h * 0.52);
  addLocal(-hw, hh * 0.66, t, hh * 0.34 - t);
  addLocal(hw - t, -hh + t, t, def.h * 0.31);
  addLocal(hw - t, -hh + def.h * 0.44, t, def.h * 0.56 - t);

  // Inner rooms, intentionally incomplete.
  addLocal(-def.w * 0.22, -hh + 28, t, def.h * 0.25);
  addLocal(-def.w * 0.22, hh * 0.32, t, hh * 0.68 - t - 24);
  addLocal(-hw + 28, hh * 0.12, def.w * 0.22, t);
  addLocal(hw * 0.20, hh * 0.12, def.w * 0.30, t);

  // Broken columns are solid and also drawn as circles.
  const pillars = [];
  const pillarSpots = [[-hw + 42, -hh + 42], [hw - 46, -hh + 46], [hw - 54, hh - 48], [-hw + 48, hh - 46]];
  for (const [px, py] of pillarSpots) {
    if (rng() > 0.22) pillars.push({ x: def.x + px, y: def.y + py, r: 10 + rng() * 4 });
  }

  const floor = { x: def.x - hw, y: def.y - hh, w: def.w, h: def.h };
  const cracks = [];
  for (let i = 0; i < 13; i++) {
    const sx = def.x + (rng() - 0.5) * def.w * 0.9;
    const sy = def.y + (rng() - 0.5) * def.h * 0.82;
    const pts = [[0, 0]];
    let ang = rng() * TAU;
    for (let j = 0; j < 4; j++) {
      ang += (rng() - 0.5) * 1.4;
      const l = 8 + rng() * 20;
      const last = pts[pts.length - 1];
      pts.push([last[0] + Math.cos(ang) * l, last[1] + Math.sin(ang) * l]);
    }
    cracks.push({ x: sx, y: sy, pts });
  }

  const rubble = [];
  for (let i = 0; i < 28; i++) {
    let rx, ry, ok = false;
    for (let k = 0; k < 30 && !ok; k++) {
      rx = def.x + (rng() - 0.5) * (def.w + 80);
      ry = def.y + (rng() - 0.5) * (def.h + 70);
      ok = true;
      for (const w of walls) if (inWall(rx, ry, w, 10)) { ok = false; break; }
    }
    if (ok) rubble.push({ x: rx, y: ry, s: 2 + rng() * 7, a: rng() * TAU, shade: rng() });
  }

  const nodeDefs = [];
  const nodes = [];
  const count = def.tier + 3;
  const corePos = { x: def.x + def.w * 0.15, y: def.y - def.h * 0.18 };
  for (let i = 0; i < count; i++) {
    let nx, ny, ok = false;
    for (let tries = 0; tries < 80 && !ok; tries++) {
      nx = def.x + (rng() - 0.5) * (def.w - 76);
      ny = def.y + (rng() - 0.5) * (def.h - 76);
      ok = true;
      for (const w of walls) if (inWall(nx, ny, w, 25)) { ok = false; break; }
      if (ok) for (const p of pillars) if (dist(nx, ny, p.x, p.y) < 30) { ok = false; break; }
      if (ok) for (const n of nodes) if (dist(nx, ny, n.x, n.y) < 42) { ok = false; break; }
      if (ok && def.core && dist(nx, ny, corePos.x, corePos.y) < 65) ok = false;
    }
    if (ok) {
      const node = { id: `${def.id}-scrap-${i}`, type: 'scrap', x: nx, y: ny, amount: 2 + Math.floor(rng() * 3) };
      nodes.push(node); nodeDefs.push(node);
    }
  }
  // one sealed cache per ruin
  let cx, cy, ok = false;
  for (let tries = 0; tries < 80 && !ok; tries++) {
    cx = def.x + (rng() - 0.5) * (def.w - 84);
    cy = def.y + (rng() - 0.5) * (def.h - 84);
    ok = true;
    for (const w of walls) if (inWall(cx, cy, w, 26)) { ok = false; break; }
    for (const n of nodes) if (dist(cx, cy, n.x, n.y) < 40) { ok = false; break; }
    if (ok && def.core && dist(cx, cy, corePos.x, corePos.y) < 72) ok = false;
  }
  if (ok) {
    const node = { id: `${def.id}-cache`, type: 'cache', x: cx, y: cy, amount: 1 };
    nodes.push(node); nodeDefs.push(node);
  }
  if (def.core) {
    const node = { id: `${def.id}-core`, type: 'core', x: corePos.x, y: corePos.y, amount: 1, site: def.id };
    nodes.push(node); nodeDefs.push(node);
  }

  return {
    ...def, walls, pillars, floor, cracks, rubble, nodes, nodeDefs,
    corePos, glow: 0
  };
}

function initWorld() {
  const rng = mulberry32(0xD057);
  const dunes = [];
  for (let i = 0; i < 230; i++) {
    dunes.push({
      x: rng() * WORLD.w,
      y: rng() * WORLD.h,
      len: 150 + rng() * 430,
      amp: 12 + rng() * 38,
      angle: -0.55 + rng() * 1.1,
      width: 24 + rng() * 44,
      tone: rng(),
      bow: (rng() - 0.5) * 70
    });
  }
  const rocks = [];
  for (let i = 0; i < 540; i++) {
    rocks.push({
      x: 40 + rng() * (WORLD.w - 80),
      y: 40 + rng() * (WORLD.h - 80),
      s: 1.2 + rng() * 6.5,
      a: rng() * TAU,
      tone: rng()
    });
  }
  const shrubs = [];
  for (let i = 0; i < 130; i++) {
    shrubs.push({ x: 50 + rng() * (WORLD.w - 100), y: 50 + rng() * (WORLD.h - 100), s: 5 + rng() * 15, a: rng() * TAU });
  }
  const bones = [];
  for (let i = 0; i < 80; i++) {
    bones.push({ x: 50 + rng() * (WORLD.w - 100), y: 50 + rng() * (WORLD.h - 100), s: 4 + rng() * 8, a: rng() * TAU, kind: rng() });
  }
  const debris = [];
  for (let i = 0; i < 140; i++) {
    debris.push({ x: 50 + rng() * (WORLD.w - 100), y: 50 + rng() * (WORLD.h - 100), s: 2 + rng() * 5, a: rng() * TAU, tone: rng() });
  }
  const desertScrap = [];
  for (let i = 0; i < 26; i++) {
    let x, y, ok = false;
    for (let t = 0; t < 40 && !ok; t++) {
      x = 220 + rng() * (WORLD.w - 440);
      y = 220 + rng() * (WORLD.h - 440);
      ok = dist(x, y, OUTPOST.x, OUTPOST.y) > 360;
      if (ok) for (const s of SITE_DEFS) if (dist(x, y, s.x, s.y) < s.w * 0.68) { ok = false; break; }
    }
    if (ok) desertScrap.push({ id: `desert-${i}`, type: 'scrap', x, y, amount: 1 + Math.floor(rng() * 3) });
  }
  const ruins = SITE_DEFS.map(buildRuin);
  const stars = [];
  for (let i = 0; i < 170; i++) {
    stars.push({ x: rng(), y: rng() * 0.6, s: rng() * 1.5 + 0.3, tw: rng() * TAU });
  }
  world = { dunes, rocks, shrubs, bones, debris, desertScrap, ruins, stars, mist: 0 };
}

function allNodes() {
  const list = [];
  for (const r of world.ruins) list.push(...r.nodes);
  list.push(...world.desertScrap);
  return list;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const SAVE_KEY = 'the-long-dust-save-v1';
let state = null;
let mode = 'title';
let paused = false;
let panelOpen = false;
let camera = { x: START.x, y: START.y, shake: 0 };
let effects = [];
let particles = [];
let footstepTimer = 0;
let scanFlash = 0;
let interact = { target: null, progress: 0, active: false, type: null };
let lastFrame = performance.now();
let titleTime = 0;

function freshState() {
  const nodes = {};
  for (const n of allNodes()) nodes[n.id] = true;
  return {
    player: { x: START.x, y: START.y, facing: Math.PI, walk: 0, moving: false, sprint: false },
    water: 72, food: 80, health: 100,
    credits: 12, scrap: 0, relics: 0, cores: [],
    upgrades: { pack: 0, boots: 0, canteen: 0, scanner: 0 },
    clock: 7 * 60 + 20, day: 1,
    weather: { type: 'clear', timer: 92, intensity: 0, warned: false },
    nodes, discovered: {}, read: {},
    scanned: 0, scanCooldown: 0,
    stats: { scrap: 0, ruins: 0, distance: 0, scans: 0, cores: 0 },
    elapsed: 0,
    flags: { intro: false, mara: false, relay: false, metWanderer: false },
    lastSaved: 0,
    location: '',
    stormExposure: 0
  };
}

function capacity() { return 18 + state.upgrades.pack * 8; }
function weight() { return state.scrap + state.relics * 2 + state.cores.length * 2; }
function speed() {
  const base = 144 * (1 + state.upgrades.boots * 0.15);
  return state.player.sprint ? base * 1.46 : base;
}
function scanRadius() { return 860 * (1 + state.upgrades.scanner * 0.45); }
function scanCooldownMax() { return Math.max(2.8, 6.2 - state.upgrades.scanner * 2); }
function shields() { return state.upgrades.canteen > 0 ? 0.76 : 1; }
function totalCores() { return 3; }

function saveGame(silent = true) {
  if (!state || mode !== 'playing') return;
  try {
    const data = {
      version: 1,
      player: { ...state.player },
      water: state.water, food: state.food, health: state.health,
      credits: state.credits, scrap: state.scrap, relics: state.relics,
      cores: state.cores.slice(), upgrades: { ...state.upgrades },
      clock: state.clock, day: state.day,
      weather: { type: state.weather.type, timer: state.weather.timer },
      nodes: { ...state.nodes }, discovered: { ...state.discovered },
      stats: { ...state.stats }, elapsed: state.elapsed, flags: { ...state.flags }
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage may be unavailable */ }
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return false;
    state = freshState();
    Object.assign(state.player, data.player || {});
    state.water = data.water ?? 50;
    state.food = data.food ?? 50;
    state.health = data.health ?? 100;
    state.credits = data.credits ?? 0;
    state.scrap = data.scrap ?? 0;
    state.relics = data.relics ?? 0;
    state.cores = Array.isArray(data.cores) ? data.cores : [];
    Object.assign(state.upgrades, data.upgrades || {});
    state.clock = data.clock ?? 440;
    state.day = data.day ?? 1;
    if (data.weather) state.weather.type = data.weather.type;
    if (data.weather) state.weather.timer = data.weather.timer;
    if (data.nodes) state.nodes = { ...state.nodes, ...data.nodes };
    state.discovered = data.discovered || {};
    state.stats = { ...state.stats, ...(data.stats || {}) };
    state.elapsed = data.elapsed || 0;
    state.flags = { ...state.flags, ...(data.flags || {}) };
    camera.x = state.player.x; camera.y = state.player.y;
    return true;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------
function startGame(continueRun = false) {
  Audio.resume();
  mode = 'playing';
  paused = false;
  panelOpen = false;
  effects = [];
  particles = [];
  if (continueRun) {
    if (!loadGame()) {
      state = freshState();
      camera.x = state.player.x; camera.y = state.player.y;
    }
  } else {
    state = freshState();
    camera.x = state.player.x; camera.y = state.player.y;
  }
  el.title.classList.add('is-leaving');
  el.hud.classList.remove('is-hidden');
  hideOverlay();
  updateHUD(true);
  updateObjective();
  if (!state.flags.intro) {
    state.flags.intro = true;
    setTimeout(() => toast('The relay is dead. <b>Three echo cores</b> may wake it.', 'good'), 850);
    setTimeout(() => toast('Press <b>Q</b> to sweep the dust for salvage. Press <b>M</b> for your map.', '', 3600), 3200);
  } else {
    setTimeout(() => toast('The dust remembers your footsteps.', ''), 600);
  }
  fadeFlash();
  sizeMapCanvas();
}

function returnToTitle() {
  mode = 'title';
  paused = false;
  panelOpen = false;
  hideOverlay();
  el.hud.classList.add('is-hidden');
  el.title.classList.remove('is-leaving');
  el.continueBtn.classList.toggle('is-hidden', !hasSave());
  interact = { target: null, progress: 0, active: false, type: null };
  el.interact.classList.add('is-hidden');
  camera.x = START.x; camera.y = START.y;
}

function gameOver(reason) {
  if (mode !== 'playing') return;
  mode = 'dead';
  panelOpen = true;
  interact.active = false;
  el.interact.classList.add('is-hidden');
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  Audio.blip(110, 1.2, 0.08, 'sawtooth');
  const stats = state.stats;
  const body = `
    <div class="story-panel">
      <div class="panel-kicker">THE DUST TAKES ITS OWN</div>
      <h2 class="panel-title">THE WALK<br><em>ENDS</em></h2>
      <p class="story-text">${reason}</p>
      <div class="story-rule"></div>
      <div class="story-stats">
        <div class="story-stat"><small>DAYS</small><b>${String(state.day).padStart(2, '0')}</b></div>
        <div class="story-stat"><small>SCRAP</small><b>${stats.scrap}</b></div>
        <div class="story-stat"><small>RUINS</small><b>${stats.ruins}</b></div>
        <div class="story-stat"><small>CORES</small><b>${state.cores.length} / 3</b></div>
      </div>
      <div class="panel-actions">
        <button class="btn btn-primary" data-action="new-game">WALK AGAIN</button>
        <button class="btn-ghost" data-action="title">RETURN TO TITLE</button>
      </div>
    </div>`;
  showPanel(body, 'story');
}

function winGame() {
  if (mode !== 'playing') return;
  mode = 'won';
  panelOpen = true;
  interact.active = false;
  el.interact.classList.add('is-hidden');
  state.flags.relay = true;
  fadeFlash();
  camera.shake = 15;
  Audio.blip(220, 1.8, 0.08, 'sine');
  setTimeout(() => Audio.pickup(), 800);
  saveGame();
  drawWorld(0, true);
  const body = `
    <div class="story-panel">
      <div class="panel-kicker">THE RELAY IS AWAKE</div>
      <h2 class="panel-title">A LIGHT<br><em>ANSWERS</em></h2>
      <p class="story-text">The antenna drinks the last of your charge. For a long moment: nothing.<br><br>Then, from somewhere beyond the dust, a voice that learned your language from ruins says: <em>"We hear you. Hold on."</em></p>
      <div class="story-rule"></div>
      <div class="story-stats">
        <div class="story-stat"><small>DAYS</small><b>${String(state.day).padStart(2, '0')}</b></div>
        <div class="story-stat"><small>SCRAP</small><b>${state.stats.scrap}</b></div>
        <div class="story-stat"><small>RUINS</small><b>${state.stats.ruins}</b></div>
        <div class="story-stat"><small>WALKED</small><b>${(state.stats.distance / 1000).toFixed(1)} km</b></div>
      </div>
      <div class="panel-actions">
        <button class="btn btn-primary" data-action="keep-walking">KEEP WALKING</button>
        <button class="btn-ghost" data-action="new-game">NEW JOURNEY</button>
      </div>
      <div style="font-size:7px;letter-spacing:.2em;color:rgba(238,217,184,.25);margin-top:24px">THE LONG DUST &nbsp;·&nbsp; YOU WOKE THE SKY</div>
    </div>`;
  showPanel(body, 'story');
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
let locationTimer = 0;
function toast(text, cls = '', duration = 2800) {
  const node = document.createElement('div');
  node.className = 'toast ' + cls;
  node.innerHTML = text;
  el.toasts.appendChild(node);
  while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 480); }, duration);
}

function showLocation(kicker, name) {
  el.locationKicker.textContent = kicker;
  el.locationName.textContent = name;
  el.location.classList.add('show');
  clearTimeout(locationTimer);
  locationTimer = setTimeout(() => el.location.classList.remove('show'), 3600);
}

function fadeFlash() {
  el.fade.classList.remove('flash');
  void el.fade.offsetWidth;
  el.fade.classList.add('flash');
}

function showPanel(html, variant = '') {
  el.overlayPanel.innerHTML = html;
  el.overlayPanel.className = 'overlay-panel ' + (variant || '');
  el.overlay.classList.remove('is-hidden');
  panelOpen = true;
  paused = true;
  interact.active = false;
  el.interact.classList.add('is-hidden');
}

function hideOverlay() {
  el.overlay.classList.add('is-hidden');
  el.overlayPanel.innerHTML = '';
  panelOpen = false;
  paused = false;
}

function helpPanel() {
  showPanel(`
    <div class="panel-kicker">FIELD MANUAL — REV. 9</div>
    <h2 class="panel-title">HOW TO<br><em>SURVIVE</em></h2>
    <p class="panel-lead">The world ended ten thousand years ago. You are what is left of the audience. Walk, scavenge, and keep walking.</p>
    <div class="help-grid">
      <div class="help-cell">
        <h4>THE WALK</h4>
        <p><kbd>WASD</kbd> or <kbd>↑↓←→</kbd> move. <kbd>SHIFT</kbd> to run — it burns water. Your pack has a weight limit; sell scrap at the outpost before it fills.</p>
      </div>
      <div class="help-cell">
        <h4>THE DUST</h4>
        <p><kbd>Q</kbd> sweeps the scanner. It reveals salvage and ruins. Water drains fastest in daylight and storms. Shelter inside ruins when a dust front hits.</p>
      </div>
      <div class="help-cell">
        <h4>THE RELAY</h4>
        <p>Find the three ruins marked with a pale diamond. Hold <kbd>E</kbd> at the glowing core, then bring all three back to the relay at the outpost.</p>
      </div>
      <div class="help-cell">
        <h4>THE OUTPOST</h4>
        <p>Mara trades water, rations, med-gel, and upgrades. Scrap is sold by weight. The relay stands just behind her stall. <kbd>M</kbd> opens your field map.</p>
      </div>
    </div>
    <ul class="tips-list">
      <li>Sealed caches can hold water, rations, med-gel — or a relic worth a great deal.</li>
      <li>Your body slowly recovers when water and rations are above half. Dehydration is faster than hunger.</li>
      <li>The compass at the top of the screen marks the nearest echo core. The map remembers every ruin you discover.</li>
      <li>This journey cannot be won by fighting. It can be lost by walking too far without water.</li>
    </ul>
    <div class="panel-actions">
      <button class="btn btn-primary" data-action="close-panel">BACK TO THE DUST</button>
    </div>
  `, 'help');
}

function pausePanel() {
  showPanel(`
    <div class="panel-kicker">THE WALK PAUSES</div>
    <h2 class="panel-title">REST A<br><em>MOMENT</em></h2>
    <p class="panel-lead">The wind does not stop. It only waits.</p>
    <div class="panel-actions">
      <button class="btn btn-primary" data-action="close-panel">KEEP WALKING</button>
      <button class="btn-ghost" data-action="help">FIELD MANUAL</button>
      <button class="btn-ghost" data-action="save">SAVE NOW</button>
      <button class="btn-ghost danger" data-action="title">RETURN TO TITLE</button>
    </div>
  `);
}

function openShop() {
  if (panelOpen) return;
  paused = true;
  renderShop();
}

function shopQuote() {
  if (state.cores.length >= 3) return '"All three. I felt the ground hum when you walked in. Put them in the relay. Let the sky know we are still here."';
  if (state.cores.length === 2) return '"Two cores. You are either very brave or very lost. Either way, drink something."';
  if (state.scrap > 10) return '"That is a good weight of salvage. Set it down before your spine files a complaint."';
  if (state.water < 30) return '"You are drinking like a cracked cup. Buy water. The desert is not going anywhere."';
  return '"Scrap for water. Water for another day. That is the whole economy now."';
}

function renderShop(message = '', msgClass = '') {
  const sellValue = state.scrap * 4 + state.relics * 45;
  const items = SHOP_ITEMS.map(item => {
    const owned = item.kind === 'upgrade' && state.upgrades[item.id];
    const disabled = owned ? 'disabled' : '';
    const priceLabel = owned ? '<span style="font-size:9px;letter-spacing:.15em">OWNED</span>' : `${item.price}<small>CR</small>`;
    return `<button class="shop-item ${item.kind}" data-buy="${item.id}" ${disabled}>
      <span class="item-name">${item.name}</span>
      <span class="item-note">${item.note}</span>
      <span class="item-price">${priceLabel}</span>
    </button>`;
  }).join('');
  showPanel(`
    <div class="shop-header">
      <div>
        <div class="panel-kicker">WAYFARER'S REST — PROVISIONER</div>
        <h2 class="panel-title">MARA'S<br><em>STALL</em></h2>
      </div>
      <div class="shop-wallet">
        <small>YOUR CREDITS</small>
        <b>${state.credits}</b>
        <span>${state.scrap} SCRAP · ${state.relics} RELICS</span>
      </div>
    </div>
    <div class="shop-mara">
      <p>${shopQuote()}</p>
    </div>
    <div class="shop-grid">${items}</div>
    <div class="shop-footer">
      <button class="shop-sell" data-action="sell" ${sellValue <= 0 ? 'disabled' : ''}>
        SELL ALL SALVAGE${sellValue > 0 ? ` · +${sellValue} CR` : ' · NOTHING TO SELL'}
      </button>
      ${message ? `<span class="shop-msg ${msgClass}">${message}</span>` : `<span class="shop-msg">PACK ${weight()} / ${capacity()}</span>`}
      <button class="btn-ghost" data-action="close-panel" style="min-width:120px;min-height:40px">LEAVE</button>
    </div>
  `, 'shop');
}

function buyItem(id) {
  const item = SHOP_ITEMS.find(i => i.id === id);
  if (!item || state.credits < item.price) {
    renderShop('Not enough credits.', 'warn');
    return;
  }
  if (item.kind === 'upgrade' && state.upgrades[id]) {
    renderShop('You already carry that.', 'warn');
    return;
  }
  if (item.kind === 'supply') {
    if (id === 'water') state.water = Math.min(100, state.water + 35);
    if (id === 'food') state.food = Math.min(100, state.food + 35);
    if (id === 'medgel') state.health = Math.min(100, state.health + 45);
  } else {
    state.upgrades[id] = 1;
  }
  state.credits -= item.price;
  Audio.blip(id === 'medgel' ? 520 : 660, 0.08, 0.04);
  saveGame();
  updateHUD(true);
  renderShop(`${item.name} — secured.`, '');
}

function openMap() {
  if (mode !== 'playing' || panelOpen) return;
  const known = Object.keys(state.discovered).length;
  showPanel(`
    <div class="panel-kicker">FIELD NOTES — ${String(state.day).padStart(2, '0')} / ${formatClock(state.clock)}</div>
    <h2 class="panel-title">THE LONG<br><em>DUST</em></h2>
    <div class="map-wrap">
      <div class="map-canvas-box"><canvas id="mapCanvas"></canvas></div>
      <aside class="map-legend">
        <div class="legend-row"><i class="legend-swatch you"></i><div><b>YOU</b><span>The small warm thing in the middle of nowhere.</span></div></div>
        <div class="legend-row"><i class="legend-swatch outpost"></i><div><b>WAYFARER'S REST</b><span>Mara's stall, water, upgrades, and the dead relay.</span></div></div>
        <div class="legend-row"><i class="legend-swatch core"></i><div><b>ECHO CORES</b><span>Rumored locations. Three are needed to wake the relay.</span></div></div>
        <div class="legend-row"><i class="legend-swatch ruin"></i><div><b>RUINS</b><span>Discovered sites. Scan the dunes to find more.</span></div></div>
        <div class="map-stats">
          <span>RUINS MAPPED <b>${known} / 8</b></span>
          <span>ECHO CORES <b>${state.cores.length} / 3</b></span>
          <span>DISTANCE WALKED <b>${(state.stats.distance / 1000).toFixed(1)} km</b></span>
          <span>SCRAP RECOVERED <b>${state.stats.scrap}</b></span>
        </div>
      </aside>
    </div>
    <div class="panel-actions">
      <button class="btn btn-primary" data-action="close-panel">CLOSE MAP</button>
    </div>
  `, 'map-panel');
  setTimeout(drawMap, 20);
}

function sizeMapCanvas() {
  const c = document.getElementById('mapCanvas');
  if (!c) return;
  const rect = c.getBoundingClientRect();
  if (!rect.width) return;
  const d = Math.min(2, devicePixelRatio || 1);
  c.width = Math.round(rect.width * d);
  c.height = Math.round(rect.width * d);
}

function drawMap() {
  const c = document.getElementById('mapCanvas');
  if (!c) return;
  sizeMapCanvas();
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const pad = w * 0.065;
  const scale = (w - pad * 2) / WORLD.w;
  const X = v => pad + v * scale;
  const Y = v => pad + v * scale;

  g.fillStyle = '#1b140e';
  g.fillRect(0, 0, w, h);

  // contour lines
  g.strokeStyle = 'rgba(218,178,118,.07)';
  g.lineWidth = Math.max(1, w / 900);
  for (let i = 0; i < 24; i++) {
    g.beginPath();
    const y = pad + (i / 24) * (h - pad * 2) + Math.sin(i) * 6;
    g.moveTo(pad, y);
    for (let x = 0; x <= w; x += w / 20) {
      g.lineTo(x, y + Math.sin(x * 0.028 + i) * 8 + Math.cos(x * 0.011 - i) * 4);
    }
    g.stroke();
  }
  // grid
  g.strokeStyle = 'rgba(218,178,118,.045)';
  for (let i = 1; i < 8; i++) {
    const p = pad + (i / 8) * (w - pad * 2);
    g.beginPath(); g.moveTo(p, pad); g.lineTo(p, h - pad); g.stroke();
    g.beginPath(); g.moveTo(pad, p); g.lineTo(w - pad, p); g.stroke();
  }
  g.strokeStyle = 'rgba(229,191,132,.22)';
  g.lineWidth = 1.5;
  g.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  // sun-bleached outer margins
  const grad = g.createRadialGradient(w * 0.48, h * 0.45, w * 0.1, w * 0.5, h * 0.5, w * 0.7);
  grad.addColorStop(0, 'rgba(201,156,95,.035)');
  grad.addColorStop(1, 'rgba(0,0,0,.3)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  const drawDiamond = (x, y, r, fill, stroke, glow) => {
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    if (glow) { g.shadowColor = fill; g.shadowBlur = 12; }
    g.fillStyle = fill; g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2); }
  };

  // landmarks
  g.font = `${Math.max(8, w * 0.011)}px "SFMono-Regular", monospace`;
  g.textAlign = 'center';
  for (const lm of LANDMARKS) {
    g.fillStyle = 'rgba(214,177,124,.25)';
    g.fillRect(X(lm.x) - 2, Y(lm.y) - 2, 4, 4);
    if (state.discovered['lm-' + lm.id]) {
      g.fillStyle = 'rgba(226,203,168,.5)';
      g.fillText(lm.name, X(lm.x), Y(lm.y) - 9);
    }
  }

  // ruins
  for (const r of world.ruins) {
    const known = state.discovered[r.id] || r.core;
    if (!known) {
      g.strokeStyle = 'rgba(214,177,124,.1)';
      g.beginPath(); g.arc(X(r.x), Y(r.y), w * 0.009, 0, TAU); g.stroke();
      continue;
    }
    const isCore = r.core && !state.cores.includes(r.id);
    drawDiamond(X(r.x), Y(r.y), isCore ? w * 0.009 : w * 0.0065,
      isCore ? 'rgba(124,216,202,.85)' : 'rgba(196,123,78,.85)',
      isCore ? 'rgba(188,241,232,.5)' : 'rgba(235,187,139,.35)', isCore);
    g.fillStyle = isCore ? 'rgba(207,244,237,.82)' : 'rgba(227,204,171,.55)';
    g.fillText(r.name, X(r.x), Y(r.y) - (isCore ? 18 : 14));
  }

  // outpost
  const ox = X(OUTPOST.x), oy = Y(OUTPOST.y);
  g.shadowColor = 'rgba(235,172,88,.7)'; g.shadowBlur = 14;
  g.fillStyle = '#e9ac58';
  g.beginPath(); g.arc(ox, oy, w * 0.011, 0, TAU); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(245,213,161,.6)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(ox, oy, w * 0.019, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(247,222,182,.85)';
  g.fillText("WAYFARER'S REST", ox, oy + w * 0.032);

  // player
  const px = X(state.player.x), py = Y(state.player.y);
  g.save(); g.translate(px, py); g.rotate(state.player.facing + Math.PI / 2);
  g.fillStyle = '#f8ecd5'; g.shadowColor = '#fff'; g.shadowBlur = 12;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 7); g.lineTo(0, 4); g.lineTo(-5.5, 7); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = 'rgba(248,236,213,.7)'; g.textAlign = 'left';
  g.fillText('YOU', px + 9, py + 3);

  // title marks
  g.textAlign = 'left';
  g.fillStyle = 'rgba(222,185,128,.25)';
  g.font = `${Math.max(7, w * 0.009)}px "SFMono-Regular", monospace`;
  g.fillText('SECTOR 07 — THE LONG DUST', pad + w * 0.015, pad + w * 0.03);
  g.textAlign = 'right';
  g.fillText('NORTH ↑', w - pad - w * 0.015, pad + w * 0.03);
}

function openHelpFromButton() {
  if (mode !== 'playing') return;
  if (!panelOpen) { paused = true; }
  helpPanel();
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------
function nearestInteractable() {
  if (!state || mode !== 'playing') return null;
  const p = state.player;
  let best = null, bestD = Infinity;

  for (const r of world.ruins) {
    for (const n of r.nodes) {
      if (!state.nodes[n.id]) continue;
      const d = dist(p.x, p.y, n.x, n.y);
      if (d < 74 && d < bestD) {
        bestD = d;
        best = {
          kind: 'node', node: n, hold: NODE_HOLDS[n.type],
          label: NODE_NAMES[n.type],
          sub: n.type === 'core' ? 'HOLD TO EXTRACT' : n.type === 'cache' ? 'HOLD TO CRACK SEAL' : 'HOLD TO RECOVER SCRAP'
        };
      }
    }
  }
  for (const n of world.desertScrap) {
    if (!state.nodes[n.id]) continue;
    const d = dist(p.x, p.y, n.x, n.y);
    if (d < 62 && d < bestD) {
      bestD = d;
      best = { kind: 'node', node: n, hold: NODE_HOLDS.scrap, label: 'LONE SALVAGE', sub: 'HOLD TO RECOVER SCRAP' };
    }
  }
  const dMara = dist(p.x, p.y, MARA.x, MARA.y);
  if (dMara < 112 && dMara < bestD) {
    bestD = dMara;
    best = { kind: 'shop', label: "MARA'S STALL", sub: 'TRADE — WATER, RATIONS, UPGRADES' };
  }
  const dRelay = dist(p.x, p.y, RELAY.x, RELAY.y);
  if (dRelay < 105 && dRelay < bestD) {
    const done = state.cores.length >= 3;
    bestD = dRelay;
    best = { kind: 'relay', hold: 3.2, label: done ? 'THE RELAY' : 'RELAY — DORMANT', sub: done ? 'HOLD TO WAKE THE SKY' : `${state.cores.length} / 3 ECHO CORES INSTALLED` };
  }
  return best;
}

function onInteractDown() {
  if (mode !== 'playing' || panelOpen) return;
  const target = nearestInteractable();
  if (!target) return;
  interact.target = target;
  if (target.kind === 'shop') {
    openShop();
    return;
  }
  if (target.kind === 'relay') {
    if (state.cores.length >= 3) {
      interact.active = true;
      interact.type = 'relay';
      interact.progress = 0;
    } else {
      toast('The relay is dormant. <b>Three echo cores</b> are needed.', 'warn');
    }
    return;
  }
  if (target.kind === 'node') {
    if (target.node.type === 'scrap' && weight() >= capacity()) {
      toast('Your pack is full. Sell salvage at the outpost.', 'warn');
      return;
    }
    interact.active = true;
    interact.type = 'node';
    interact.progress = 0;
    Audio.blip(280, 0.04, 0.025, 'triangle');
  }
}

function onInteractUp() {
  interact.active = false;
  interact.progress = 0;
  el.interactFill.style.width = '0%';
}

function completeNode(node) {
  if (node.type === 'scrap') {
    const room = capacity() - weight();
    if (room <= 0) { toast('Your pack is full.', 'warn'); return; }
    const take = Math.min(room, node.amount);
    node.amount -= take;
    state.scrap += take;
    state.stats.scrap += take;
    if (node.amount <= 0) state.nodes[node.id] = false;
    toast(`<b>${take} scrap</b> recovered.${node.amount > 0 ? ' There is more, but no room.' : ''}`, 'good');
    Audio.pickup();
  } else if (node.type === 'cache') {
    state.nodes[node.id] = false;
    const roll = Math.random();
    if (roll < 0.27) {
      state.water = Math.min(100, state.water + 32);
      toast('A sealed water cell. <b>+32 water.</b>', 'good');
    } else if (roll < 0.51) {
      state.food = Math.min(100, state.food + 34);
      toast('Vacuum rations, still good. <b>+34 rations.</b>', 'good');
    } else if (roll < 0.72) {
      state.health = Math.min(100, state.health + 30);
      toast('A med-gel ampoule. <b>+30 body.</b>', 'good');
    } else if (roll < 0.9) {
      state.relics += 1;
      toast('A <b>pre-Leaving relic</b>. Mara will pay well for this.', 'good');
    } else {
      state.credits += 14;
      toast('A tin of old coins. <b>+14 credits.</b>', 'good');
    }
    Audio.pickup();
  } else if (node.type === 'core') {
    state.nodes[node.id] = false;
    if (!state.cores.includes(node.site)) state.cores.push(node.site);
    state.stats.cores = state.cores.length;
    toast('<b>ECHO CORE RECOVERED.</b> The relay can hear it singing.', 'good', 4200);
    Audio.pickup();
    fadeFlash();
    camera.shake = 7;
    const ruin = world.ruins.find(r => r.id === node.site);
    if (ruin) showLocation('ECHO CORE RECOVERED', ruin.name);
  }
  updateObjective();
  updateHUD(true);
  saveGame();
}

function updateObjective() {
  if (!state) return;
  const n = state.cores.length;
  for (let i = 0; i < el.objProgress.children.length; i++) {
    el.objProgress.children[i].classList.toggle('on', i < n);
  }
  if (n >= 3) {
    el.objTitle.textContent = 'WAKE THE RELAY';
    el.objBody.textContent = 'Return to Wayfarer\'s Rest. Install the cores in the relay behind Mara\'s stall.';
  } else if (n > 0) {
    el.objTitle.textContent = 'THE ECHO CORES';
    el.objBody.textContent = `${n} of 3 cores recovered. The next one is out there, under the dust.`;
  } else {
    el.objTitle.textContent = 'THE ECHO CORES';
    el.objBody.textContent = 'Recover three cores from the old relay ruins. The compass marks the nearest.';
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
const keys = { w: false, a: false, s: false, d: false, shift: false };
let touchMove = { active: false, x: 0, y: 0 };
let dehydrating = false;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function isDaytime() { return state.clock >= 5 * 60 + 30 && state.clock < 19 * 60; }

function isSheltered() {
  if (!state) return false;
  const p = state.player;
  if (dist(p.x, p.y, OUTPOST.x, OUTPOST.y) < 158) return true;
  for (const r of world.ruins) {
    if (p.x > r.floor.x + 18 && p.x < r.floor.x + r.floor.w - 18 &&
        p.y > r.floor.y + 18 && p.y < r.floor.y + r.floor.h - 18) return true;
  }
  return false;
}

function canStand(x, y) {
  const rad = 10;
  for (const r of world.ruins) {
    if (x < r.floor.x - 50 || x > r.floor.x + r.floor.w + 50 || y < r.floor.y - 50 || y > r.floor.y + r.floor.h + 50) continue;
    for (const w of r.walls) {
      const cx = clamp(x, w.x, w.x + w.w);
      const cy = clamp(y, w.y, w.y + w.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad) return false;
    }
    for (const p of r.pillars) {
      if ((x - p.x) ** 2 + (y - p.y) ** 2 < (p.r + rad) ** 2) return false;
    }
  }
  return true;
}

function movePlayer(dx, dy, dt) {
  const p = state.player;
  const ox = p.x, oy = p.y;
  if (dx) {
    const nx = clamp(p.x + dx, 32, WORLD.w - 32);
    if (canStand(nx, p.y)) p.x = nx;
  }
  if (dy) {
    const ny = clamp(p.y + dy, 32, WORLD.h - 32);
    if (canStand(p.x, ny)) p.y = ny;
  }
  const moved = dist(ox, oy, p.x, p.y);
  if (moved > 0.01) {
    state.stats.distance += moved;
    p.walk += dt * (p.sprint ? 13 : 9);
    footstepTimer -= dt;
    if (footstepTimer <= 0) {
      footstepTimer = p.sprint ? 0.15 : 0.24;
      spawnFootstep();
      if (p.sprint && Math.random() < 0.55) {
        for (let i = 0; i < 2; i++) spawnDust(p.x + (Math.random() - 0.5) * 16, p.y + 8, 1.4);
      }
    }
  }
}

function spawnFootstep() {
  if (particles.length > 180) return;
  const p = state.player;
  particles.push({
    x: p.x - Math.cos(p.facing) * 8 + (Math.random() - 0.5) * 5,
    y: p.y - Math.sin(p.facing) * 8 + 6,
    vx: (Math.random() - 0.5) * 4, vy: -1 - Math.random() * 2,
    life: 2.2, max: 2.2, size: 2 + Math.random() * 3, type: 'print', a: p.facing
  });
}

function spawnDust(x, y, strength = 1) {
  if (particles.length > 220) return;
  particles.push({
    x, y, vx: (Math.random() - 0.5) * 18 * strength, vy: -4 - Math.random() * 12 * strength,
    life: 0.7 + Math.random() * 0.6, max: 1.3, size: 2 + Math.random() * 6 * strength, type: 'dust'
  });
}

function updateWeather(dt) {
  const w = state.weather;
  w.timer -= dt;
  if (w.timer <= 0) {
    if (w.type === 'clear') {
      const roll = Math.random();
      if (roll < 0.35) {
        w.type = 'storm'; w.timer = 26 + Math.random() * 18;
        toast('<b>DUST STORM.</b> Find a ruin or the outpost. Do not be caught in the open.', 'warn', 4600);
        camera.shake = 9;
      } else if (roll < 0.82) {
        w.type = 'dust'; w.timer = 38 + Math.random() * 32;
        toast('A dust haze rolls in. The horizon goes soft at the edges.', '', 3200);
      } else {
        w.timer = 48 + Math.random() * 40;
      }
    } else if (w.type === 'dust') {
      if (Math.random() < 0.36) {
        w.type = 'storm'; w.timer = 24 + Math.random() * 18;
        toast('<b>THE HAZE THICKENS.</b> A dust storm is coming down on you.', 'warn', 4000);
        camera.shake = 8;
      } else {
        w.type = 'clear'; w.timer = 70 + Math.random() * 55;
        toast('The air clears. The dunes are exactly where you left them.', '', 2800);
      }
    } else {
      w.type = 'dust'; w.timer = 22 + Math.random() * 20;
      toast('The storm passes. Dust hangs in the air like a held breath.', '', 3000);
    }
  }
  const target = w.type === 'storm' ? 1 : w.type === 'dust' ? 0.45 : 0;
  w.intensity = lerp(w.intensity, target, Math.min(1, dt * 0.8));
}

function update(dt) {
  if (!state || mode !== 'playing' || paused) return;
  state.elapsed += dt;
  state.player.sprint = keys.shift && (keys.w || keys.a || keys.s || keys.d || touchMove.active);

  let dx = 0, dy = 0;
  if (keys.w) dy -= 1;
  if (keys.s) dy += 1;
  if (keys.a) dx -= 1;
  if (keys.d) dx += 1;
  if (touchMove.active) { dx = touchMove.x; dy = touchMove.y; }
  const mag = Math.hypot(dx, dy);
  let moving = mag > 0.08;
  if (mag > 0) {
    dx /= Math.max(1, mag); dy /= Math.max(1, mag);
    if (mag < 0.2) moving = false;
  }
  state.player.moving = moving;
  if (moving) {
    state.player.facing = Math.atan2(dy, dx);
    const sp = speed();
    movePlayer(dx * sp * dt, dy * sp * dt, dt);
    if (state.player.sprint && Math.random() < dt * 8) spawnDust(state.player.x, state.player.y + 7, 0.8);
  }

  // Time and exposure
  state.clock += dt * 2.4;
  if (state.clock >= 1440) {
    state.clock -= 1440;
    state.day++;
    toast(`<b>DAY ${state.day}.</b> The wind has changed its mind again.`, '', 3600);
    saveGame();
  }
  const day = isDaytime();
  const sheltered = isSheltered();
  const weather = state.weather.type;
  let waterDrain = 0.038 * (day ? 1.3 : 0.78) * shields();
  if (state.player.sprint && moving) waterDrain += 0.052 * shields();
  if (weather === 'dust') waterDrain += 0.012;
  if (weather === 'storm' && !sheltered) waterDrain += 0.03;
  state.water = Math.max(0, state.water - waterDrain * dt);
  let foodDrain = 0.017 * (state.player.sprint && moving ? 1.35 : 1);
  state.food = Math.max(0, state.food - foodDrain * dt);

  if (state.water <= 0) {
    state.health -= 1.35 * dt;
    if (!dehydrating) {
      dehydrating = true;
      toast('<b>DEHYDRATION.</b> Your hands have started to shake. Find water.', 'warn', 4600);
    }
  } else {
    dehydrating = false;
    if (state.water > 55 && state.food > 48 && weather !== 'storm') {
      state.health = Math.min(100, state.health + 0.035 * dt);
    }
  }
  if (state.food <= 0) state.health -= 0.55 * dt;

  if (weather === 'storm') {
    if (!sheltered) {
      state.stormExposure += dt;
      if (state.stormExposure > 4) state.health -= 0.48 * dt;
    } else {
      state.stormExposure = Math.max(0, state.stormExposure - dt * 2);
    }
  } else {
    state.stormExposure = Math.max(0, state.stormExposure - dt);
  }

  if (state.health <= 0) {
    state.health = 0;
    updateHUD(true);
    gameOver(state.water <= 0 ? 'The canteen ran dry three dunes back. The desert did not notice.' : 'Your body gave out between one ruin and the next. The sand covered the rest.');
    return;
  }

  updateWeather(dt);
  Audio.update(dt, state.weather.type, !isDaytime());

  if (state.scanCooldown > 0) state.scanCooldown = Math.max(0, state.scanCooldown - dt);
  if (scanFlash > 0) scanFlash = Math.max(0, scanFlash - dt);

  // Discovery
  const p = state.player;
  for (const r of world.ruins) {
    if (!state.discovered[r.id] && dist(p.x, p.y, r.x, r.y) < 610) {
      state.discovered[r.id] = true;
      state.stats.ruins = Object.keys(state.discovered).filter(k => !k.startsWith('lm-')).length;
      showLocation(r.kicker, r.name);
      if (!r.core) toast(`<b>${r.name}</b> — discovered.`, '', 2600);
      else if (state.cores.length < 3) toast(`<b>${r.name}</b> — an echo core is here.`, 'good', 3000);
      saveGame();
    }
  }
  for (const lm of LANDMARKS) {
    if (!state.discovered['lm-' + lm.id] && dist(p.x, p.y, lm.x, lm.y) < 520) {
      state.discovered['lm-' + lm.id] = true;
      showLocation(lm.kicker, lm.name);
      toast(lm.flavor, '', 4200);
    }
  }

  // Location label
  let loc = '';
  for (const r of world.ruins) if (dist(p.x, p.y, r.x, r.y) < Math.max(r.w, r.h) * 0.72) loc = r.name;
  if (!loc && dist(p.x, p.y, OUTPOST.x, OUTPOST.y) < 250) loc = "WAYFARER'S REST";
  if (!loc) for (const lm of LANDMARKS) if (dist(p.x, p.y, lm.x, lm.y) < 200) loc = lm.name;
  if (!loc) loc = 'THE OPEN DUST';
  state.location = loc;

  // Hold-to-interact
  const target = nearestInteractable();
  interact.target = target;
  if (interact.active) {
    if (!target || (interact.type === 'node' && target.kind !== 'node') ||
        (interact.type === 'relay' && target.kind !== 'relay') ||
        (interact.type === 'node' && target.node && interact.nodeId && target.node.id !== interact.nodeId)) {
      interact.active = false; interact.progress = 0;
    } else {
      const total = interact.type === 'relay' ? 3.2 : (target.hold || 1.6);
      interact.progress += dt;
      if (interact.progress >= total) {
        interact.progress = 0;
        interact.active = false;
        if (interact.type === 'node' && target.kind === 'node') {
          interact.nodeId = null;
          completeNode(target.node);
        } else if (interact.type === 'relay') {
          winGame();
        }
      }
    }
  }

  // Effects and particles
  for (const e of effects) e.age += dt;
  effects = effects.filter(e => e.age < e.duration);
  for (const pt of particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.type === 'dust') { pt.vx *= 0.985; pt.vy *= 0.985; }
  }
  particles = particles.filter(pt => pt.life > 0);
  if (camera.shake > 0) camera.shake = Math.max(0, camera.shake - dt * 18);

  const camEase = 1 - Math.pow(0.001, dt);
  camera.x = lerp(camera.x, p.x, camEase);
  camera.y = lerp(camera.y, p.y, camEase);

  updateHUD();
  if (!panelOpen) {
    saveGame(true);
  }
}

function doScan() {
  if (mode !== 'playing' || paused || panelOpen || !state) return;
  if (state.scanCooldown > 0) {
    toast(`Scanner recharging — <b>${state.scanCooldown.toFixed(1)}s</b>.`, '', 1200);
    return;
  }
  state.scanCooldown = scanCooldownMax();
  state.scanned = state.elapsed + 26;
  state.stats.scans++;
  scanFlash = 1.2;
  const p = state.player;
  const radius = scanRadius();
  effects.push({ type: 'scan', x: p.x, y: p.y, age: 0, duration: 1.35, max: radius, color: '120,210,198' });
  let contacts = 0;
  for (const r of world.ruins) {
    if (dist(p.x, p.y, r.x, r.y) < radius * 1.7) {
      if (!state.discovered[r.id]) {
        state.discovered[r.id] = true;
        showLocation(r.kicker, r.name);
      }
      contacts++;
    }
  }
  for (const n of allNodes()) {
    if (state.nodes[n.id] && dist(p.x, p.y, n.x, n.y) < radius) contacts++;
  }
  for (const lm of LANDMARKS) {
    if (dist(p.x, p.y, lm.x, lm.y) < radius * 1.4) {
      state.discovered['lm-' + lm.id] = true;
      contacts++;
    }
  }
  Audio.scan();
  toast(contacts > 0 ? `Scanner ping — <b>${contacts} contacts</b> in the dust.` : 'Scanner ping — nothing but sand.', 'good', 2200);
  updateHUD(true);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
let hudTimer = 0;
function updateHUD(force = false) {
  if (!state) return;
  const p = state.player;
  if (!force && hudTimer > 0) return;
  hudTimer = 0;
  el.day.textContent = String(state.day).padStart(2, '0');
  el.time.textContent = formatClock(state.clock);
  el.place.textContent = state.location || 'THE OPEN DUST';
  const temp = getTemp();
  el.temp.textContent = `${temp}°`;
  const weatherName = state.weather.type === 'storm' ? 'DUST STORM' : state.weather.type === 'dust' ? 'DUST HAZE' : 'STILL AIR';
  el.weather.textContent = weatherName;
  el.weather.style.color = state.weather.type === 'storm' ? 'var(--danger)' : state.weather.type === 'dust' ? 'var(--amber)' : 'rgba(240,222,190,.5)';

  setBar(el.waterBar, el.waterVal, state.water);
  setBar(el.foodBar, el.foodVal, state.food);
  setBar(el.healthBar, el.healthVal, state.health);
  el.packVal.textContent = `${weight()} / ${capacity()}`;
  el.packVal.style.color = weight() >= capacity() ? 'var(--danger)' : 'var(--sand)';
  const shelter = isSheltered();
  if (state.weather.type === 'storm') {
    el.shelter.textContent = shelter ? 'SHELTERED' : 'EXPOSED';
    el.shelter.className = 'shelter-state' + (shelter ? '' : ' danger');
  } else if (state.weather.type === 'dust') {
    el.shelter.textContent = 'HAZE';
    el.shelter.className = 'shelter-state';
  } else {
    el.shelter.textContent = '';
    el.shelter.className = 'shelter-state';
  }
  el.invScrap.textContent = state.scrap;
  el.invRelic.textContent = state.relics;
  el.invCore.textContent = state.cores.length;
  el.invCredits.textContent = state.credits;
  el.scanState.textContent = state.scanCooldown > 0 ? `${state.scanCooldown.toFixed(1)}s` : 'READY';
  el.scanState.style.color = state.scanCooldown > 0 ? 'var(--sand-dim)' : 'var(--water)';
  el.radarHint.textContent = state.scanCooldown > 0 ? 'SWEEP RECHARGING' : 'TAP Q TO PING';
  updateInteractUI();
}

function getTemp() {
  const t = Math.max(0, Math.sin((state.clock - 390) / 1440 * TAU));
  let temp = Math.round(19 + 23 * t);
  if (state.weather.type === 'storm') temp -= 5;
  if (state.weather.type === 'dust') temp -= 2;
  return temp;
}

function setBar(bar, valEl, v) {
  const n = Math.round(v);
  bar.style.width = Math.max(0, v) + '%';
  valEl.textContent = n;
  bar.classList.toggle('low', v < 25);
}

function updateInteractUI() {
  if (!interact.target || panelOpen || mode !== 'playing') {
    el.interact.classList.add('is-hidden');
    return;
  }
  const t = interact.target;
  el.interact.classList.remove('is-hidden');
  el.interactKey.textContent = t.kind === 'shop' ? 'E' : 'E';
  el.interactLabel.textContent = t.label;
  el.interactSub.textContent = interact.active ? 'WORKING…' : t.sub;
  if (interact.active) {
    const total = interact.type === 'relay' ? 3.2 : (t.hold || 1.6);
    el.interactFill.style.width = Math.min(100, interact.progress / total * 100) + '%';
  } else {
    el.interactFill.style.width = '0%';
  }
  if (interact.active && !interact.nodeId && t.kind === 'node') interact.nodeId = t.node.id;
}

function updateCompass() {
  const c = compassCanvas;
  const g = compassCtx;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(520 * dpr)) { c.width = Math.round(520 * dpr); c.height = Math.round(42 * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, 520, 42);
  const w = 520, h = 42, cx = w / 2;
  const half = 235;
  const spread = 1.42;
  g.save();
  // fade to edges
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(24,17,11,0)');
  grad.addColorStop(0.14, 'rgba(24,17,11,.42)');
  grad.addColorStop(0.5, 'rgba(24,17,11,.54)');
  grad.addColorStop(0.86, 'rgba(24,17,11,.42)');
  grad.addColorStop(1, 'rgba(24,17,11,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(228,190,132,.22)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(20, h - 8); g.lineTo(w - 20, h - 8); g.stroke();

  const heading = state.player.facing;
  const bearings = [];
  for (let k = 0; k < 24; k++) bearings.push(k * TAU / 24);
  for (const b of bearings) {
    const rel = wrapAngle(b - heading);
    if (Math.abs(rel) > spread) continue;
    const x = cx + rel / spread * half;
    const cardinal = ((b * 180 / Math.PI + 90 + 360) % 360);
    const major = Math.abs(cardinal % 90) < 2 || Math.abs(cardinal % 90 - 90) < 2;
    g.strokeStyle = major ? 'rgba(240,221,187,.55)' : 'rgba(230,199,150,.24)';
    g.lineWidth = major ? 1.5 : 1;
    g.beginPath(); g.moveTo(x, h - 8); g.lineTo(x, h - (major ? 17 : 12)); g.stroke();
    if (major) {
      const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      const key = Math.round(cardinal / 90) * 90 % 360;
      g.fillStyle = 'rgba(244,226,195,.8)';
      g.font = '9px "SFMono-Regular", monospace';
      g.textAlign = 'center';
      g.fillText(labels[key] || '', x, 11);
    }
  }

  // markers
  const markers = [];
  markers.push({ x: OUTPOST.x, y: OUTPOST.y, color: '#e9ac58', kind: 'home', always: true });
  let nearestCore = null, nd = Infinity;
  for (const r of world.ruins) {
    if (r.core && !state.cores.includes(r.id)) {
      const d = dist(state.player.x, state.player.y, r.x, r.y);
      if (d < nd) { nd = d; nearestCore = r; }
    }
  }
  if (nearestCore) markers.push({ x: nearestCore.x, y: nearestCore.y, color: '#7cd8ca', kind: 'core' });
  if (state.cores.length >= 3) markers.push({ x: RELAY.x, y: RELAY.y, color: '#7cd8ca', kind: 'relay' });
  for (const m of markers) {
    const bearing = Math.atan2(m.y - state.player.y, m.x - state.player.x);
    let rel = wrapAngle(bearing - heading);
    let x = cx + rel / spread * half;
    let edge = false;
    if (rel > spread) { x = w - 22; edge = true; }
    if (rel < -spread) { x = 22; edge = true; }
    g.save();
    g.translate(x, h - 6);
    if (edge) g.rotate(rel > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.fillStyle = m.color;
    g.shadowColor = m.color; g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(0, -4); g.lineTo(4, 0); g.lineTo(0, 4); g.lineTo(-4, 0);
    g.closePath(); g.fill();
    g.restore();
  }
  // center notch
  g.fillStyle = 'rgba(247,232,207,.9)';
  g.beginPath(); g.moveTo(cx, 15); g.lineTo(cx + 4, 21); g.lineTo(cx - 4, 21); g.closePath(); g.fill();
  g.restore();

  const bearingDeg = (heading * 180 / Math.PI + 90 + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  el.bearing.textContent = names[Math.round(bearingDeg / 45) % 8];
}

function drawRadar() {
  const g = radarCtx;
  const d = Math.min(2, devicePixelRatio || 1);
  const size = 360;
  if (radarCanvas.width !== Math.round(size * d)) {
    radarCanvas.width = Math.round(size * d);
    radarCanvas.height = Math.round(size * d);
  }
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, radius = size / 2 - 3;
  g.save();
  g.beginPath(); g.arc(cx, cy, radius, 0, TAU); g.clip();
  const bg = g.createRadialGradient(cx, cy, 8, cx, cy, radius);
  bg.addColorStop(0, '#1b1c17');
  bg.addColorStop(1, '#0e100d');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);

  // grid
  g.strokeStyle = 'rgba(139,190,176,.09)';
  g.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    g.beginPath(); g.arc(cx, cy, radius * i / 3.4, 0, TAU); g.stroke();
  }
  g.beginPath(); g.moveTo(cx, cy - radius); g.lineTo(cx, cy + radius); g.stroke();
  g.beginPath(); g.moveTo(cx - radius, cy); g.lineTo(cx + radius, cy); g.stroke();

  const range = 790;
  const sc = radius / range;
  const px = state.player.x, py = state.player.y;
  const map = (x, y) => [cx + (x - px) * sc, cy + (y - py) * sc];

  // sweep
  const ang = (state.elapsed * 1.45) % TAU;
  const sweep = g.createConicGradient ? g.createConicGradient(ang, cx, cy) : null;
  if (sweep) {
    sweep.addColorStop(0, 'rgba(112,214,199,.0)');
    sweep.addColorStop(0.82, 'rgba(112,214,199,.0)');
    sweep.addColorStop(0.93, 'rgba(112,214,199,.13)');
    sweep.addColorStop(1, 'rgba(112,214,199,.0)');
    g.fillStyle = sweep;
    g.beginPath(); g.arc(cx, cy, radius, 0, TAU); g.fill();
  }

  // outpost
  const [ox, oy] = map(OUTPOST.x, OUTPOST.y);
  if (dist(ox, oy, cx, cy) < radius + 20) {
    g.fillStyle = 'rgba(233,172,88,.95)';
    g.fillRect(ox - 3, oy - 3, 6, 6);
    g.strokeStyle = 'rgba(233,172,88,.35)';
    g.beginPath(); g.arc(ox, oy, 8, 0, TAU); g.stroke();
  }
  // cores
  for (const r of world.ruins) {
    if (!r.core) continue;
    if (state.cores.includes(r.id)) continue;
    const [x, y] = map(r.x, r.y);
    if (dist(x, y, cx, cy) > radius - 2) continue;
    g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
    g.fillStyle = 'rgba(124,216,202,.9)'; g.shadowColor = '#7cd8ca'; g.shadowBlur = 9;
    g.fillRect(-2.6, -2.6, 5.2, 5.2);
    g.restore();
  }
  // discovered ruins
  for (const r of world.ruins) {
    if (!state.discovered[r.id] && !r.core) continue;
    if (r.core) continue;
    const [x, y] = map(r.x, r.y);
    if (dist(x, y, cx, cy) > radius - 2) continue;
    g.fillStyle = 'rgba(192,120,74,.72)';
    g.beginPath(); g.arc(x, y, 2.1, 0, TAU); g.fill();
  }
  // loot with recent scan
  if (state.scanned > state.elapsed) {
    for (const n of allNodes()) {
      if (!state.nodes[n.id]) continue;
      const [x, y] = map(n.x, n.y);
      if (dist(x, y, cx, cy) > radius - 2) continue;
      g.fillStyle = n.type === 'core' ? 'rgba(124,216,202,.85)' : 'rgba(226,188,127,.6)';
      g.beginPath(); g.arc(x, y, n.type === 'core' ? 2.6 : 1.6, 0, TAU); g.fill();
    }
  }
  // player
  g.save(); g.translate(cx, cy); g.rotate(state.player.facing + Math.PI / 2);
  g.fillStyle = '#f5e7ce'; g.shadowColor = '#fff'; g.shadowBlur = 10;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
  g.restore();

  // frame detail
  g.strokeStyle = 'rgba(221,186,132,.24)';
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, radius - 1, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(120,201,198,.8)';
  g.beginPath(); g.arc(cx, cy - radius + 11, 2.2, 0, TAU); g.fill();
}

// ---------------------------------------------------------------------------
// World rendering
// ---------------------------------------------------------------------------
function screenTransform(shakeX = 0, shakeY = 0) {
  const z = view.zoom;
  ctx.setTransform(
    view.dpr * z, 0, 0, view.dpr * z,
    view.dpr * (view.w / 2 - camera.x * z + shakeX),
    view.dpr * (view.h / 2 - camera.y * z + shakeY)
  );
}

function drawGround() {
  const z = view.zoom;
  const vw = view.w / z, vh = view.h / z;
  const left = camera.x - vw / 2 - 100, top = camera.y - vh / 2 - 100;
  const right = camera.x + vw / 2 + 100, bottom = camera.y + vh / 2 + 100;
  ctx.fillStyle = '#c39a67';
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = terrainPattern;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.restore();

  // Broad heat patches
  const sun = getSunAmount();
  ctx.save();
  ctx.globalAlpha = 0.11 + sun * 0.08;
  const grad = ctx.createRadialGradient(camera.x, camera.y, 0, camera.x, camera.y, Math.max(vw, vh) * 0.8);
  grad.addColorStop(0, '#f5dfb3');
  grad.addColorStop(1, 'rgba(196,134,73,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.restore();

  // Dunes
  for (const d of world.dunes) {
    const reach = d.len / 2 + d.width + Math.abs(d.bow);
    if (d.x + reach < left || d.x - reach > right || d.y + reach < top || d.y - reach > bottom) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    ctx.lineCap = 'round';
    const path = new Path2D();
    path.moveTo(-d.len / 2, 0);
    path.bezierCurveTo(-d.len * 0.2, -d.amp, d.len * 0.18, d.amp, d.len / 2, 0);
    path.bezierCurveTo(d.len * 0.2, d.amp + d.bow * 0.12, -d.len * 0.2, -d.amp + d.bow * 0.12, -d.len / 2, 0);
    // shadow side
    ctx.translate(7, 12);
    ctx.strokeStyle = `rgba(91,61,38,${0.08 + d.tone * 0.11})`;
    ctx.lineWidth = d.width;
    ctx.stroke(path);
    ctx.translate(-7, -12);
    // lit crest
    ctx.strokeStyle = `rgba(247,219,175,${0.075 + d.tone * 0.12})`;
    ctx.lineWidth = Math.max(3, d.width * 0.36);
    ctx.stroke(path);
    // wind ripples
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = d.tone > 0.5 ? 'rgba(101,68,41,.5)' : 'rgba(246,220,177,.55)';
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      const off = i * 5.5;
      ctx.moveTo(-d.len * 0.42, off);
      ctx.bezierCurveTo(-d.len * 0.15, -d.amp * 0.5 + off, d.len * 0.18, d.amp * 0.5 + off, d.len * 0.42, off);
      ctx.stroke();
    }
    ctx.restore();
  }

  // scattered small stones, bones, dry shrubs
  drawScatter(world.rocks, left, top, right, bottom);
  drawScatter(world.shrubs, left, top, right, bottom);
  drawScatter(world.bones, left, top, right, bottom);
  drawScatter(world.debris, left, top, right, bottom);
}

function drawScatter(list, left, top, right, bottom) {
  for (const o of list) {
    if (o.x < left || o.x > right || o.y < top || o.y > bottom) continue;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.s > 4.8) {
      ctx.fillStyle = 'rgba(78,52,33,.17)';
      ctx.beginPath(); ctx.ellipse(3, 4, o.s * 1.1, o.s * 0.5, 0.2, 0, TAU); ctx.fill();
    }
    if (o.kind !== undefined && o.s > 3) {
      // bone or debris variation
      if (o.kind < 0.45) {
        ctx.strokeStyle = 'rgba(237,219,187,.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-o.s, 0); ctx.lineTo(o.s, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(-o.s, 0, 1.7, 0, TAU); ctx.arc(o.s, 0, 1.7, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(91,65,41,.42)';
        ctx.rotate(o.a);
        ctx.fillRect(-o.s * 0.8, -1, o.s * 1.6, 2);
      }
    } else if (o.a !== undefined && list === world.shrubs) {
      ctx.strokeStyle = 'rgba(98,74,42,.6)';
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 5; i++) {
        const ang = -1.2 + i * 0.45;
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(Math.cos(ang) * o.s * 0.5, -o.s * 0.45, Math.cos(ang) * o.s, -o.s * 0.7); ctx.stroke();
      }
    } else if (o.tone !== undefined) {
      ctx.fillStyle = o.tone > 0.5 ? 'rgba(86,58,36,.38)' : 'rgba(118,83,49,.42)';
      ctx.rotate(o.a);
      ctx.fillRect(-o.s * 0.65, -o.s * 0.32, o.s * 1.3, o.s * 0.64);
    } else {
      ctx.fillStyle = o.tone > 0.5 ? 'rgba(94,65,40,.3)' : 'rgba(144,104,64,.3)';
      ctx.beginPath(); ctx.arc(0, 0, o.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

function getSunAmount() {
  if (!state) return 0.5;
  const t = (state.clock - 360) / 780;
  return Math.max(0, Math.sin(clamp(t, 0, 1) * Math.PI));
}

function drawRuin(r) {
  const p = state.player;
  const visible = p.x > r.floor.x - 500 && p.x < r.floor.x + r.floor.w + 500 && p.y > r.floor.y - 500 && p.y < r.floor.y + r.floor.h + 500;
  if (!visible) return;

  // outer floor shadow
  ctx.save();
  ctx.fillStyle = 'rgba(61,42,27,.22)';
  ctx.beginPath();
  roundRectPath(ctx, r.floor.x - 15, r.floor.y - 12, r.floor.w + 38, r.floor.h + 38, 8);
  ctx.fill();

  // floor
  ctx.fillStyle = 'rgba(90,66,44,.75)';
  ctx.beginPath();
  roundRectPath(ctx, r.floor.x + 4, r.floor.y + 4, r.floor.w - 8, r.floor.h - 8, 3);
  ctx.fill();
  // broken floor patches
  const rng = mulberry32(r.seed * 771);
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 40; i++) {
    const x = r.floor.x + 12 + rng() * (r.floor.w - 24);
    const y = r.floor.y + 12 + rng() * (r.floor.h - 24);
    ctx.fillStyle = rng() > 0.5 ? '#b69568' : '#584331';
    ctx.fillRect(x, y, 3 + rng() * 13, 2 + rng() * 5);
  }
  ctx.globalAlpha = 1;

  // interior warm glow from core
  if (r.core && !state.cores.includes(r.id)) {
    const pulse = 0.65 + Math.sin(state.elapsed * 2 + r.seed) * 0.16;
    const gr = ctx.createRadialGradient(r.corePos.x, r.corePos.y, 2, r.corePos.x, r.corePos.y, 110);
    gr.addColorStop(0, `rgba(108,221,205,${0.31 * pulse})`);
    gr.addColorStop(0.4, `rgba(108,190,180,${0.09 * pulse})`);
    gr.addColorStop(1, 'rgba(70,140,132,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(r.floor.x, r.floor.y, r.floor.w, r.floor.h);
  }

  // cracks
  ctx.strokeStyle = 'rgba(38,28,20,.35)';
  ctx.lineWidth = 1;
  for (const c of r.cracks) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    for (const pt of c.pts.slice(1)) ctx.lineTo(c.x + pt[0], c.y + pt[1]);
    ctx.stroke();
  }

  // low remnants / pipes
  ctx.strokeStyle = 'rgba(201,162,112,.22)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(r.floor.x + r.floor.w * 0.6, r.floor.y + 8);
  ctx.lineTo(r.floor.x + r.floor.w * 0.6, r.floor.y + r.floor.h * 0.25);
  ctx.lineTo(r.floor.x + r.floor.w * 0.78, r.floor.y + r.floor.h * 0.25);
  ctx.stroke();

  // walls: dark shadow and stone top
  for (const w of r.walls) {
    roundRect(ctx, w.x + 8, w.y + 10, w.w, w.h, 3, 'rgba(38,27,18,.36)');
  }
  for (const w of r.walls) {
    roundRect(ctx, w.x, w.y, w.w, w.h, 2, '#796047');
    roundRect(ctx, w.x, w.y, w.w, Math.max(2, w.h * 0.35), Math.min(4, w.h * 0.45), 'rgba(205,175,130,.5)');
    ctx.fillStyle = 'rgba(44,31,20,.3)';
    for (let i = 0; i < w.w; i += 22) {
      if (hash2(w.x + i, w.y) > 0.6) ctx.fillRect(w.x + i, w.y + w.h - 3, 6, 3);
    }
  }

  // pillars
  for (const p of r.pillars) {
    ctx.fillStyle = 'rgba(40,29,20,.32)';
    ctx.beginPath(); ctx.ellipse(p.x + 7, p.y + 9, p.r * 1.1, p.r * 0.7, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8e7355';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.82, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(219,187,144,.3)';
    ctx.beginPath(); ctx.ellipse(p.x - 2, p.y - 2, p.r * 0.6, p.r * 0.4, 0, 0, TAU); ctx.fill();
  }

  // rubble
  for (const q of r.rubble) {
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
    ctx.fillStyle = q.shade > 0.5 ? 'rgba(56,41,27,.55)' : 'rgba(132,100,67,.62)';
    ctx.fillRect(-q.s / 2, -q.s / 3, q.s, q.s * 0.66);
    ctx.restore();
  }

  // core pedestal
  if (r.core) {
    const active = !state.cores.includes(r.id);
    const cx = r.corePos.x, cy = r.corePos.y;
    ctx.fillStyle = 'rgba(39,29,21,.42)';
    ctx.beginPath(); ctx.ellipse(cx + 6, cy + 8, 22, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6e5c46';
    ctx.beginPath(); ctx.ellipse(cx, cy, 17, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9d8769';
    ctx.beginPath(); ctx.ellipse(cx, cy - 3, 17, 9, 0, 0, TAU); ctx.fill();
    if (active) {
      const pulse = 0.75 + Math.sin(state.elapsed * 2.4 + r.seed) * 0.22;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(cx, cy - 15, 0, cx, cy - 15, 60);
      gr.addColorStop(0, `rgba(165,255,238,${0.6 * pulse})`);
      gr.addColorStop(0.2, `rgba(92,220,203,${0.22 * pulse})`);
      gr.addColorStop(1, 'rgba(60,160,150,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(cx, cy - 15, 60, 0, TAU); ctx.fill();
      ctx.restore();
      drawCoreIcon(cx, cy - 16, pulse, 10);
    }
  }

  // site tag when close, drawn in world
  const d = dist(p.x, p.y, r.x, r.y);
  if (d < 330) {
    ctx.save();
    ctx.globalAlpha = clamp(1 - (d - 210) / 120, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,14,9,.55)';
    ctx.fillRect(r.x - 86, r.y - r.h / 2 - 42, 172, 20);
    ctx.fillStyle = r.core && !state.cores.includes(r.id) ? '#9de4d8' : '#d8b88b';
    ctx.font = '9px "SFMono-Regular", monospace';
    ctx.fillText(r.name, r.x, r.y - r.h / 2 - 28);
    ctx.restore();
  }
  ctx.restore();
}

function drawCoreIcon(x, y, pulse, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.elapsed * 0.35);
  ctx.fillStyle = `rgba(154,241,227,${0.75 + pulse * 0.2})`;
  ctx.shadowColor = '#74d9c8';
  ctx.shadowBlur = 18 + pulse * 10;
  ctx.beginPath();
  ctx.moveTo(0, -size); ctx.lineTo(size * 0.55, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.55, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.moveTo(0, -size * 0.62); ctx.lineTo(size * 0.2, 0); ctx.lineTo(0, size * 0.62); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawNode(n) {
  if (!state.nodes[n.id]) return;
  const p = state.player;
  if (dist(p.x, p.y, n.x, n.y) > 600) return;
  const t = state.elapsed;
  ctx.save();
  ctx.translate(n.x, n.y);
  if (n.type === 'scrap') {
    ctx.fillStyle = 'rgba(41,28,18,.25)';
    ctx.beginPath(); ctx.ellipse(3, 4, 12, 5, 0.2, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = n.id.length + i;
      ctx.fillStyle = i % 2 ? '#8a6d4b' : '#b39262';
      ctx.save(); ctx.rotate(a); ctx.fillRect(-7 + i * 3, -2 + (i % 2) * 3, 9, 2.4); ctx.restore();
    }
    if ((t + n.x) % 4 < 0.4) {
      ctx.fillStyle = 'rgba(251,231,190,.65)';
      ctx.fillRect(3, -4, 2, 1);
    }
  } else if (n.type === 'cache') {
    ctx.fillStyle = 'rgba(40,27,17,.3)';
    ctx.beginPath(); ctx.ellipse(5, 6, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6e5033';
    roundRect(ctx, -8, -6, 16, 12, 1, '#6e5033');
    ctx.fillStyle = '#987448';
    ctx.fillRect(-8, -6, 16, 3);
    ctx.strokeStyle = 'rgba(222,183,120,.55)';
    ctx.strokeRect(-8, -6, 16, 12);
    ctx.fillStyle = 'rgba(224,188,126,.7)';
    ctx.fillRect(-1, -1, 2, 4);
  } else if (n.type === 'core') {
    // pedestal drawn by ruin, just glow/shimmer
    drawCoreIcon(n.x, n.y - 20, 0.9, 7);
  }
  ctx.restore();
}

function roundRect(g, x, y, w, h, r, fill) {
  g.beginPath();
  roundRectPath(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
}

function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------------------
// Outpost
// ---------------------------------------------------------------------------
function drawOutpost() {
  const p = state.player;
  if (dist(p.x, p.y, OUTPOST.x, OUTPOST.y) > 1100) return;
  const t = state.elapsed;
  const ox = OUTPOST.x, oy = OUTPOST.y;

  // clearing and paths
  ctx.save();
  ctx.fillStyle = 'rgba(217,178,119,.44)';
  ctx.beginPath(); ctx.ellipse(ox, oy, 172, 136, -0.12, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(121,86,51,.18)';
  ctx.lineWidth = 14;
  ctx.setLineDash([5, 20]);
  ctx.beginPath(); ctx.ellipse(ox, oy, 154, 120, -0.12, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);

  // tent hand-painted
  drawTent(ox - 93, oy - 35, -0.22, 1.15, '#8d6746', '#b2875e');
  drawTent(ox - 45, oy + 72, 0.12, 0.95, '#7b5a3e', '#a47b52');
  drawTent(ox + 57, oy + 48, -0.1, 1.08, '#966e4a', '#bd9065');
  drawTent(ox + 101, oy - 46, 0.28, 0.82, '#78563a', '#a1774f');

  // canopy / stall
  const sx = MARA.x - 5, sy = MARA.y - 7;
  ctx.fillStyle = 'rgba(38,27,18,.28)';
  ctx.beginPath(); ctx.ellipse(sx + 5, sy + 8, 52, 20, 0.08, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.08);
  ctx.fillStyle = '#9b4f32';
  ctx.beginPath(); ctx.moveTo(-46, -30); ctx.lineTo(46, -30); ctx.lineTo(38, 4); ctx.lineTo(-38, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#d49a6b';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(i * 12, -30); ctx.lineTo(i * 10, 4); ctx.stroke();
  }
  ctx.fillStyle = '#5b3c26';
  ctx.fillRect(-35, 2, 70, 15);
  ctx.fillStyle = '#d7ad74';
  ctx.fillRect(-30, 5, 13, 10);
  ctx.fillRect(-12, 5, 10, 7);
  ctx.fillRect(4, 5, 14, 9);
  ctx.restore();

  // crates
  drawCrate(ox + 63, oy - 68, 15, 0.2);
  drawCrate(ox + 79, oy - 53, 11, -0.1);
  drawCrate(ox - 113, oy + 35, 17, 0.5);

  // parked skiff
  drawSkiff(ox + 117, oy + 84, -0.65);

  // poles and lines
  const poles = [[ox - 133, oy - 82], [ox - 35, oy - 106], [ox + 72, oy - 94], [ox + 137, oy - 20]];
  ctx.strokeStyle = 'rgba(55,38,24,.7)';
  ctx.lineWidth = 2;
  for (const [x, y] of poles) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
    ctx.fillStyle = 'rgba(50,34,21,.6)';
    ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(56,40,27,.46)';
  ctx.lineWidth = 1;
  for (let i = 0; i < poles.length - 1; i++) {
    const [x1, y1] = poles[i], [x2, y2] = poles[i + 1];
    ctx.beginPath(); ctx.moveTo(x1, y1 - 21); ctx.quadraticCurveTo((x1 + x2) / 2, y1 + 6, x2, y2 - 21); ctx.stroke();
    for (let j = 1; j < 5; j++) {
      const f = j / 5;
      const bx = lerp(x1, x2, f), by = lerp(y1, y2, f) + Math.sin(f * Math.PI) * 7 - 18;
      const lit = 0.5 + 0.5 * Math.sin(t * 2 + bx * 0.1);
      ctx.fillStyle = `rgba(242,192,105,${0.38 + lit * 0.4})`;
      ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, TAU); ctx.fill();
    }
  }

  // fire ring
  const fx = ox - 14, fy = oy + 38;
  ctx.fillStyle = 'rgba(53,38,24,.6)';
  ctx.beginPath(); ctx.ellipse(fx, fy, 15, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8d7658';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 12, fy + Math.sin(a) * 5, 2.3, 0, TAU); ctx.stroke();
  }
  const flick = 0.8 + Math.sin(t * 8) * 0.12 + Math.sin(t * 13.4) * 0.08;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fl = ctx.createRadialGradient(fx, fy, 0, fx, fy, 56);
  fl.addColorStop(0, `rgba(255,190,92,${0.38 * flick})`);
  fl.addColorStop(0.38, `rgba(234,126,56,${0.13 * flick})`);
  fl.addColorStop(1, 'rgba(180,80,30,0)');
  ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(fx, fy, 56, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,185,80,${0.8 * flick})`;
  ctx.beginPath();
  ctx.moveTo(fx - 5, fy + 2); ctx.quadraticCurveTo(fx - 2, fy - 13 * flick, fx + 1, fy - 5); ctx.quadraticCurveTo(fx + 5, fy - 17 * flick, fx + 7, fy + 1); ctx.closePath(); ctx.fill();

  // Mara
  drawNomad(MARA.x, MARA.y, -0.2, '#a8573d', '#e7bb7d', true, t);
  const nearMara = dist(p.x, p.y, MARA.x, MARA.y) < 210;
  if (nearMara) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(19,13,8,.58)';
    ctx.fillRect(MARA.x - 29, MARA.y - 49, 58, 16);
    ctx.fillStyle = '#efc681';
    ctx.font = '8px "SFMono-Regular", monospace';
    ctx.fillText('MARA', MARA.x, MARA.y - 38);
  }

  // relay tower
  drawRelay();

  // outpost label
  if (dist(p.x, p.y, ox, oy) < 430) {
    ctx.textAlign = 'center';
    ctx.globalAlpha = clamp(1 - (dist(p.x, p.y, ox, oy) - 250) / 180, 0, 1);
    ctx.fillStyle = 'rgba(16,11,7,.6)';
    ctx.fillRect(ox - 91, oy - 187, 182, 22);
    ctx.strokeStyle = 'rgba(233,172,88,.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 91, oy - 187, 182, 22);
    ctx.fillStyle = '#f3d9ab';
    ctx.font = '9px "SFMono-Regular", monospace';
    ctx.fillText("WAYFARER'S REST", ox, oy - 172);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawTent(x, y, a, sc, dark, light) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a); ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(46,31,19,.28)';
  ctx.beginPath(); ctx.ellipse(9, 12, 42, 18, 0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(-35, 18); ctx.lineTo(0, -27); ctx.lineTo(36, 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.moveTo(-35, 18); ctx.lineTo(0, -27); ctx.lineTo(2, 18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(50,33,20,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(0, 19); ctx.stroke();
  ctx.fillStyle = 'rgba(38,25,14,.6)';
  ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(1, -7); ctx.lineTo(12, 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(238,192,116,.15)';
  ctx.beginPath(); ctx.ellipse(1, 1, 8, 12, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawCrate(x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(38,26,16,.3)';
  ctx.fillRect(-s / 2 + 3, -s / 2 + 4, s, s);
  ctx.fillStyle = '#785738';
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeStyle = 'rgba(210,166,112,.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2); ctx.stroke();
  ctx.restore();
}

function drawSkiff(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = 'rgba(42,29,19,.3)';
  ctx.beginPath(); ctx.ellipse(5, 7, 43, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#665542';
  ctx.beginPath();
  ctx.moveTo(-43, 0); ctx.quadraticCurveTo(-24, -15, 27, -10); ctx.lineTo(44, 0); ctx.lineTo(27, 10); ctx.quadraticCurveTo(-24, 15, -43, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9c7c58';
  ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(23, -4); ctx.lineTo(30, 0); ctx.lineTo(22, 3); ctx.lineTo(-25, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(47,33,22,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-19, -6); ctx.lineTo(-2, -19); ctx.moveTo(-19, 6); ctx.lineTo(-2, 19); ctx.stroke();
  ctx.fillStyle = 'rgba(226,170,95,.4)';
  ctx.fillRect(-37, -3, 4, 6);
  ctx.restore();
}

function drawRelay() {
  const p = state.player;
  if (dist(p.x, p.y, RELAY.x, RELAY.y) > 780) return;
  const x = RELAY.x, y = RELAY.y, awake = mode === 'won' || state.flags.relay;
  const t = state.elapsed;
  ctx.save();
  ctx.translate(x, y);
  // shadow and base
  ctx.fillStyle = 'rgba(38,27,18,.36)';
  ctx.beginPath(); ctx.ellipse(10, 13, 42, 15, 0.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6e5b45';
  ctx.beginPath(); ctx.ellipse(0, 0, 31, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9b8464';
  ctx.beginPath(); ctx.ellipse(0, -4, 31, 14, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(50,36,24,.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, -4, 23, 10, 0, 0, TAU); ctx.stroke();

  // legs
  ctx.strokeStyle = '#655443';
  ctx.lineWidth = 3;
  for (const [dx, dy] of [[-18, -2], [18, -2], [0, 9]]) {
    ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx * 0.35, dy * 0.35 - 25); ctx.stroke();
  }
  // mast lines
  ctx.strokeStyle = 'rgba(65,49,34,.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-18, -3); ctx.lineTo(0, -77); ctx.lineTo(18, -3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -77); ctx.lineTo(-24, -10); ctx.moveTo(0, -77); ctx.lineTo(24, -10); ctx.stroke();
  // rings
  ctx.strokeStyle = 'rgba(154,130,95,.65)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.ellipse(0, -37 - i * 10, 17 - i * 3, 6 - i, 0, 0, TAU); ctx.stroke();
  }
  // beacon
  const pulse = awake ? 0.8 + Math.sin(t * 4) * 0.2 : 0.2 + Math.sin(t * 1.7) * 0.08;
  ctx.fillStyle = awake ? `rgba(155,246,228,${pulse})` : 'rgba(199,165,110,.4)';
  ctx.shadowColor = awake ? '#77e2ce' : '#d9a35f';
  ctx.shadowBlur = awake ? 22 : 8;
  ctx.beginPath(); ctx.arc(0, -78, 3.5, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  if (awake) {
    ctx.strokeStyle = `rgba(124,230,211,${0.18 + pulse * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -78, 18 + pulse * 4, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -78, 33 + pulse * 7, 0, TAU); ctx.stroke();
  }
  ctx.restore();

  if (dist(p.x, p.y, x, y) < 240) {
    ctx.save(); ctx.textAlign = 'center';
    ctx.globalAlpha = clamp(1 - (dist(p.x, p.y, x, y) - 130) / 110, 0, 1);
    ctx.fillStyle = 'rgba(16,11,7,.55)';
    ctx.fillRect(x - 45, y - 114, 90, 17);
    ctx.fillStyle = awake ? '#a7ebdf' : '#d8b88b';
    ctx.font = '8px "SFMono-Regular", monospace';
    ctx.fillText(awake ? 'RELAY — AWAKE' : 'RELAY — DORMANT', x, y - 102);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------
function drawLandmarks() {
  const p = state.player;
  for (const lm of LANDMARKS) {
    if (dist(p.x, p.y, lm.x, lm.y) > 850) continue;
    ctx.save(); ctx.translate(lm.x, lm.y);
    if (lm.type === 'hand') {
      ctx.fillStyle = 'rgba(44,31,20,.3)';
      ctx.beginPath(); ctx.ellipse(20, 30, 80, 36, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#725c46';
      ctx.beginPath(); ctx.ellipse(0, 0, 38, 25, 0.2, 0, TAU); ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = -1.9 + i * 0.44;
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = i % 2 ? '#81694f' : '#6c5641';
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-4, -78 - (i === 2 ? 20 : 0)); ctx.lineTo(5, -75 - (i === 2 ? 18 : 0)); ctx.lineTo(9, -6); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(208,175,128,.22)';
      ctx.beginPath(); ctx.ellipse(-6, -10, 18, 10, 0, 0, TAU); ctx.fill();
    } else if (lm.type === 'wreck') {
      ctx.fillStyle = 'rgba(44,30,18,.34)';
      ctx.beginPath(); ctx.ellipse(24, 23, 130, 40, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5e5143';
      ctx.beginPath();
      ctx.moveTo(-130, 30); ctx.quadraticCurveTo(-80, -28, 30, -22); ctx.lineTo(118, 5); ctx.lineTo(90, 36); ctx.quadraticCurveTo(-20, 58, -130, 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#83705a';
      ctx.beginPath(); ctx.moveTo(-58, 25); ctx.lineTo(-5, -12); ctx.lineTo(67, -5); ctx.lineTo(45, 28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(42,31,21,.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-86, 32); ctx.lineTo(72, 6); ctx.stroke();
      ctx.fillStyle = 'rgba(191,119,69,.35)';
      ctx.fillRect(-32, -6, 18, 20);
      ctx.fillStyle = 'rgba(43,33,24,.8)';
      ctx.beginPath(); ctx.arc(58, 10, 12, 0, TAU); ctx.fill();
    } else if (lm.type === 'well') {
      ctx.fillStyle = 'rgba(44,30,18,.3)';
      ctx.beginPath(); ctx.ellipse(8, 9, 30, 14, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7d674e';
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 13, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b2218';
      ctx.beginPath(); ctx.ellipse(0, -1, 17, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#aa8c64'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 22, Math.sin(a) * 11, 2.4, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(83,60,39,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-22, -11); ctx.lineTo(-18, -38); ctx.moveTo(22, -11); ctx.lineTo(18, -38); ctx.moveTo(-23, -36); ctx.lineTo(19, -36); ctx.stroke();
    } else {
      // glass field
      for (let i = 0; i < 35; i++) {
        const a = (i * 7.3) % TAU, d = (i * 37) % 120;
        const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.6;
        ctx.fillStyle = i % 4 === 0 ? 'rgba(222,235,222,.36)' : i % 3 === 0 ? 'rgba(126,205,194,.2)' : 'rgba(88,65,43,.25)';
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // label
    if (dist(p.x, p.y, lm.x, lm.y) < 300) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(1 - (dist(p.x, p.y, lm.x, lm.y) - 200) / 100, 0, 1);
      ctx.fillStyle = 'rgba(16,11,7,.5)';
      ctx.fillRect(-52, -66, 104, 16);
      ctx.fillStyle = 'rgba(225,197,154,.75)';
      ctx.font = '8px "SFMono-Regular", monospace';
      ctx.fillText(lm.name, 0, -55);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
function drawNomad(x, y, facing, cloak, trim, still, t) {
  const walking = state && state.player.moving && !still;
  const walk = state ? state.player.walk : 0;
  ctx.save();
  ctx.translate(x, y);
  // shadow
  ctx.fillStyle = 'rgba(40,27,17,.35)';
  ctx.beginPath(); ctx.ellipse(2, 7, 11, 5, 0.2, 0, TAU); ctx.fill();
  ctx.rotate(facing);
  ctx.translate(0, walking ? Math.sin(walk * 2) * 0.8 : 0);
  // scarf tail
  ctx.strokeStyle = 'rgba(184,101,61,.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(-18 - Math.sin(t * 3) * 4, -4, -25, 2 + Math.cos(t * 2) * 3);
  ctx.stroke();
  // legs
  const legA = walking ? Math.sin(walk) * 3.4 : 0;
  ctx.strokeStyle = '#3e2a1c'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-5, 8 + legA); ctx.moveTo(2, 2); ctx.lineTo(5, 8 - legA); ctx.stroke();
  // cloak
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-8, 3);
  ctx.quadraticCurveTo(-7, -8, 0, -11);
  ctx.quadraticCurveTo(8, -8, 8, 4);
  ctx.lineTo(3, 9);
  ctx.lineTo(-4, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(0, -7, 6, -2); ctx.lineTo(3, 2); ctx.quadraticCurveTo(0, -3, -3, 2); ctx.closePath(); ctx.fill();
  // hood
  ctx.fillStyle = '#5a3825';
  ctx.beginPath(); ctx.arc(0, -9, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d6ac73';
  ctx.beginPath(); ctx.arc(1, -9, 2.5, 0, TAU); ctx.fill();
  // staff / lantern
  ctx.strokeStyle = '#5b412b'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(8, 7); ctx.lineTo(11, -10); ctx.stroke();
  ctx.fillStyle = '#7fd9c8'; ctx.shadowColor = '#6fd3c2'; ctx.shadowBlur = 9;
  ctx.beginPath(); ctx.arc(11, -10, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  const t = state.elapsed;
  ctx.globalAlpha = 1;
  // glow halo at night
  const night = 1 - getSunAmount();
  if (night > 0.2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
    gr.addColorStop(0, `rgba(255,196,112,${0.16 * night})`);
    gr.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.translate(0, 0);
  ctx.rotate(0);
  drawNomadBody(p, t);
  // above-head marker, very subtle
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = 'rgba(244,226,195,.65)';
  ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(3, -21); ctx.lineTo(-3, -21); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawNomadBody(p, t) {
  const walking = p.moving;
  const walk = p.walk;
  ctx.save();
  ctx.rotate(p.facing);
  // shadow is separate in world space
  ctx.fillStyle = 'rgba(35,23,14,.32)';
  ctx.beginPath(); ctx.ellipse(1, 8, 10, 5, 0, 0, TAU); ctx.fill();
  // scarf
  ctx.strokeStyle = 'rgba(198,106,61,.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.quadraticCurveTo(-16 - Math.sin(t * 4) * 3, -3 + Math.cos(t * 3) * 2, -24 - Math.sin(t * 2) * 2, 3);
  ctx.stroke();
  // legs
  const legA = walking ? Math.sin(walk) * 3.6 : 0;
  ctx.strokeStyle = '#3c291c'; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-5, 8 + legA); ctx.moveTo(2, 2); ctx.lineTo(5, 8 - legA); ctx.stroke();
  // body cloak
  const grd = ctx.createLinearGradient(-8, -11, 8, 9);
  grd.addColorStop(0, '#9b6b44');
  grd.addColorStop(1, '#5f422d');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.quadraticCurveTo(-8, -8, 0, -11);
  ctx.quadraticCurveTo(8, -8, 8, 4);
  ctx.lineTo(3, 9);
  ctx.lineTo(-4, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b88450';
  ctx.beginPath(); ctx.moveTo(-5, -3); ctx.quadraticCurveTo(0, -8, 5, -3); ctx.lineTo(3, 1); ctx.quadraticCurveTo(0, -3, -3, 1); ctx.closePath(); ctx.fill();
  // pack
  ctx.fillStyle = '#4b3625';
  ctx.fillRect(-6, -1, 4, 6);
  // hood / head
  ctx.fillStyle = '#5b3b28';
  ctx.beginPath(); ctx.arc(0, -9, 5.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d6aa71';
  ctx.beginPath(); ctx.arc(1, -9, 2.4, 0, TAU); ctx.fill();
  // staff
  ctx.strokeStyle = '#4c3828'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(9, 8); ctx.lineTo(12, -9); ctx.stroke();
  ctx.fillStyle = '#84dfcf'; ctx.shadowColor = '#74d9c8'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(12, -9, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Effects and light
// ---------------------------------------------------------------------------
function drawEffects() {
  for (const e of effects) {
    const k = e.age / e.duration;
    if (e.type === 'scan') {
      const r = e.max * (0.12 + k * 0.88);
      ctx.save();
      ctx.strokeStyle = `rgba(${e.color},${(1 - k) * 0.55})`;
      ctx.lineWidth = 2 + (1 - k) * 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(${e.color},${(1 - k) * 0.18})`;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
  for (const pt of particles) {
    const k = pt.life / pt.max;
    if (pt.type === 'dust') {
      ctx.fillStyle = `rgba(228,194,145,${k * 0.28})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.4 - k * 0.4), 0, TAU); ctx.fill();
    } else {
      ctx.save();
      ctx.translate(pt.x, pt.y); ctx.rotate(pt.a);
      ctx.fillStyle = `rgba(93,63,39,${k * 0.22})`;
      ctx.fillRect(-2.4, -1, 4.8, 2);
      ctx.restore();
    }
  }
  // ambient blowing sand
  const t = state.elapsed;
  for (let i = 0; i < 26; i++) {
    const seed = hash2(i, 3.3);
    const x = (seed * WORLD.w + t * (18 + seed * 32)) % WORLD.w;
    const y = ((hash2(i, 8.7) * WORLD.h) + Math.sin(t * 0.3 + i) * 80) % WORLD.h;
    if (dist(x, y, state.player.x, state.player.y) > 850) continue;
    ctx.strokeStyle = `rgba(247,224,185,${0.08 + seed * 0.06})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 + seed * 12, y - 2); ctx.stroke();
  }
}

function drawLighting() {
  const sun = getSunAmount();
  const night = clamp(1 - sun * 2.0, 0, 1);
  const dusk = clamp(1 - Math.abs(sun - 0.13) * 4.4, 0, 1) * 0.34;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (night > 0.015) {
    ctx.fillStyle = `rgba(9,15,27,${night * 0.58})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  if (dusk > 0.01) {
    ctx.fillStyle = `rgba(132,58,28,${dusk})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  // storm veil
  const wi = state.weather.intensity;
  if (wi > 0.01) {
    ctx.fillStyle = `rgba(167,121,74,${wi * 0.17})`;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.globalAlpha = wi * 0.5;
    ctx.strokeStyle = 'rgba(236,202,152,.45)';
    ctx.lineWidth = 1;
    const t = state.elapsed;
    for (let i = 0; i < 95; i++) {
      const seed = hash2(i, 9.1);
      const spd = 220 + seed * 420;
      const x = ((seed * view.w * 1.5 + t * spd) % (view.w + 260)) - 130;
      const y = ((hash2(i, 4.7) * view.h + Math.sin(t * 0.8 + i) * 25 + t * 30 * (0.4 + seed)) % (view.h + 80)) - 40;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 22 - seed * 34, y + 3 + seed * 3); ctx.stroke();
    }
    ctx.restore();
  }

  // Lights (additive, world space)
  ctx.save();
  screenTransform(0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const p = state.player;
  const playerGlow = 0.12 + night * 0.72;
  if (playerGlow > 0.13) {
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 125);
    gr.addColorStop(0, `rgba(252,187,103,${0.1 + night * 0.14})`);
    gr.addColorStop(0.4, `rgba(224,142,68,${0.05 + night * 0.07})`);
    gr.addColorStop(1, 'rgba(180,90,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, 125, 0, TAU); ctx.fill();
  }
  // outpost firelight
  const dOut = dist(p.x, p.y, OUTPOST.x, OUTPOST.y);
  if (dOut < 1050) {
    const fx = OUTPOST.x - 14, fy = OUTPOST.y + 38;
    const flick = 0.9 + Math.sin(state.elapsed * 8) * 0.08;
    const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, 155);
    gr.addColorStop(0, `rgba(243,161,74,${0.18 * flick})`);
    gr.addColorStop(0.4, `rgba(207,113,50,${0.07 * flick})`);
    gr.addColorStop(1, 'rgba(180,80,30,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(fx, fy, 155, 0, TAU); ctx.fill();
    // string lights
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const x = OUTPOST.x + Math.cos(a) * 110, y = OUTPOST.y + Math.sin(a) * 84;
      ctx.fillStyle = `rgba(247,193,103,${0.12 + night * 0.22})`;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    }
  }
  // cores
  for (const r of world.ruins) {
    if (!r.core || state.cores.includes(r.id)) continue;
    if (dist(p.x, p.y, r.x, r.y) > 900) continue;
    const pulse = 0.8 + Math.sin(state.elapsed * 2 + r.seed) * 0.2;
    const gr = ctx.createRadialGradient(r.corePos.x, r.corePos.y - 16, 0, r.corePos.x, r.corePos.y - 16, 85);
    gr.addColorStop(0, `rgba(138,244,224,${0.19 * pulse})`);
    gr.addColorStop(1, 'rgba(80,190,175,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(r.corePos.x, r.corePos.y - 16, 85, 0, TAU); ctx.fill();
  }
  // relay beam
  if (state.flags.relay) {
    const x = RELAY.x, y = RELAY.y - 78;
    const pulse = 0.7 + Math.sin(state.elapsed * 3) * 0.3;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, 200);
    gr.addColorStop(0, `rgba(143,255,233,${0.24 * pulse})`);
    gr.addColorStop(0.5, `rgba(94,220,199,${0.08 * pulse})`);
    gr.addColorStop(1, 'rgba(70,180,165,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 200, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(150,255,236,${0.09 * pulse})`;
    ctx.lineWidth = 20;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 900); ctx.stroke();
    ctx.strokeStyle = `rgba(210,255,247,${0.12 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 900); ctx.stroke();
  }
  ctx.restore();

  // subtle screen bloom around player when very dark
  if (night > 0.35) {
    ctx.save();
    ctx.globalAlpha = 0.13 * night;
    const g2 = ctx.createRadialGradient(view.w / 2, view.h / 2, 10, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.6);
    g2.addColorStop(0, 'rgba(255,203,128,.5)');
    g2.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
  }
}

function drawAmbientScreen() {
  // fine floating motes in screen space
  const t = state.elapsed;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.3 + state.weather.intensity * 0.3;
  for (let i = 0; i < 34; i++) {
    const seed = hash2(i, 17);
    const x = ((seed * view.w + t * (5 + seed * 10)) % view.w);
    const y = ((hash2(i, 21) * view.h + Math.sin(t * 0.4 + i) * 22) % view.h);
    ctx.fillStyle = `rgba(245,220,178,${0.05 + seed * 0.09})`;
    ctx.fillRect(x, y, 1 + seed * 1.4, 1 + seed);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Title scene
// ---------------------------------------------------------------------------
function drawTitle(dt) {
  titleTime += dt;
  const w = view.w, h = view.h, t = titleTime;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, '#090b13');
  sky.addColorStop(0.32, '#201b22');
  sky.addColorStop(0.57, '#5e3e35');
  sky.addColorStop(0.78, '#bb6b43');
  sky.addColorStop(1, '#d28a54');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * 0.78);

  // stars
  for (const s of world.stars) {
    const tw = 0.45 + 0.55 * Math.sin(t * 0.7 + s.tw);
    ctx.fillStyle = `rgba(250,235,209,${tw * 0.55})`;
    ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
  }

  // ringed planet
  const px = w * 0.76, py = h * 0.25, pr = Math.min(w, h) * 0.085;
  ctx.save();
  ctx.globalAlpha = 0.7;
  const pg = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.12, px, py, pr);
  pg.addColorStop(0, '#e2c8a8');
  pg.addColorStop(0.5, '#b89474');
  pg.addColorStop(0.82, '#80634f');
  pg.addColorStop(1, '#4e3b33');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
  // bands
  ctx.save();
  ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#fff2da';
  ctx.fillRect(px - pr, py - pr * 0.12, pr * 2, pr * 0.1);
  ctx.fillRect(px - pr, py + pr * 0.2, pr * 2, pr * 0.06);
  ctx.fillRect(px - pr, py - pr * 0.45, pr * 2, pr * 0.05);
  ctx.restore();
  // ring
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = '#e3c9aa';
  ctx.lineWidth = Math.max(1, pr * 0.05);
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.8, pr * 0.34, -0.18, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = Math.max(1, pr * 0.16);
  ctx.beginPath(); ctx.ellipse(px, py, pr * 1.72, pr * 0.3, -0.18, 0, TAU); ctx.stroke();
  ctx.restore();

  // horizon glow
  const hg = ctx.createLinearGradient(0, h * 0.46, 0, h * 0.75);
  hg.addColorStop(0, 'rgba(220,128,70,0)');
  hg.addColorStop(0.7, 'rgba(240,157,88,.28)');
  hg.addColorStop(1, 'rgba(255,192,118,.05)');
  ctx.fillStyle = hg; ctx.fillRect(0, h * 0.4, w, h * 0.36);

  // low sun
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sx = w * 0.44, sy = h * 0.585;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.min(w, h) * 0.3);
  sg.addColorStop(0, 'rgba(255,207,134,.28)');
  sg.addColorStop(0.3, 'rgba(243,147,78,.1)');
  sg.addColorStop(1, 'rgba(220,110,55,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - w * 0.4, sy - h * 0.4, w * 0.8, h * 0.8);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,210,150,.35)';
  ctx.beginPath(); ctx.arc(sx, sy, Math.min(w, h) * 0.016, 0, TAU); ctx.fill();

  // distant mesas
  drawMesaLayer(w, h, 0.605, '#6f4635', 0.55, 0);
  drawMesaLayer(w, h, 0.64, '#563728', 0.75, 1.7);

  // ruin silhouette on the right
  drawTitleRuin(w * 0.79, h * 0.62, Math.min(w, h) * 0.23);

  // dunes
  drawTitleDune(w, h, h * 0.64, h * 0.13, '#9a603d', '#76452e', 0.1);
  drawTitleDune(w, h, h * 0.72, h * 0.16, '#7e4c33', '#5f3828', 1.4);
  drawTitleDune(w, h, h * 0.83, h * 0.18, '#5b3727', '#472a20', 2.7);

  // foreground dune
  ctx.fillStyle = '#2d1d17';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.9);
  ctx.bezierCurveTo(w * 0.18, h * 0.85, w * 0.34, h * 0.98, w * 0.53, h * 0.93);
  ctx.bezierCurveTo(w * 0.73, h * 0.87, w * 0.86, h * 0.96, w, h * 0.89);
  ctx.lineTo(w, h);
  ctx.closePath(); ctx.fill();

  // nomad on a ridge
  const nx = w * 0.59 + Math.sin(t * 0.12) * 3, ny = h * 0.735;
  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(Math.max(0.8, Math.min(w, h) / 900), Math.max(0.8, Math.min(w, h) / 900));
  ctx.fillStyle = 'rgba(20,12,8,.35)';
  ctx.beginPath(); ctx.ellipse(4, 15, 14, 4, 0.1, 0, TAU); ctx.fill();
  // cloak
  ctx.fillStyle = '#241811';
  ctx.beginPath(); ctx.moveTo(-7, 12); ctx.quadraticCurveTo(-7, -10, 1, -15); ctx.quadraticCurveTo(9, -8, 8, 12); ctx.lineTo(3, 16); ctx.lineTo(-3, 16); ctx.closePath(); ctx.fill();
  // staff
  ctx.strokeStyle = '#2e2016'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(10, 15); ctx.lineTo(14, -12); ctx.stroke();
  // lantern
  const lg = ctx.createRadialGradient(14, -12, 0, 14, -12, 46);
  lg.addColorStop(0, 'rgba(255,204,123,.55)');
  lg.addColorStop(0.3, 'rgba(244,154,73,.16)');
  lg.addColorStop(1, 'rgba(244,154,73,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(14, -12, 46, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd08d'; ctx.beginPath(); ctx.arc(14, -12, 2.1, 0, TAU); ctx.fill();
  ctx.restore();

  // wind streaks
  for (let i = 0; i < 16; i++) {
    const seed = hash2(i, 44);
    const x = ((seed * w + t * (18 + seed * 20)) % (w + 200)) - 100;
    const y = h * (0.62 + hash2(i, 77) * 0.27);
    ctx.strokeStyle = `rgba(236,197,145,${0.05 + seed * 0.07})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + seed * 34, y - 2); ctx.stroke();
  }

  // foreground haze
  const fh = ctx.createLinearGradient(0, h * 0.72, 0, h);
  fh.addColorStop(0, 'rgba(40,24,18,0)');
  fh.addColorStop(1, 'rgba(20,12,9,.5)');
  ctx.fillStyle = fh; ctx.fillRect(0, h * 0.7, w, h * 0.3);

  // title screen vignette
  const vg = ctx.createRadialGradient(w * 0.7, h * 0.45, w * 0.15, w * 0.6, h * 0.5, w * 0.75);
  vg.addColorStop(0, 'rgba(7,5,3,0)');
  vg.addColorStop(1, 'rgba(7,5,3,.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

function drawMesaLayer(w, h, yf, color, alpha, phase) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  const baseY = h * yf;
  ctx.moveTo(0, baseY + 40);
  let x = 0;
  let i = 0;
  while (x < w) {
    const step = 60 + hash2(i, phase) * 130;
    const peak = 14 + hash2(i + 9, phase) * 54;
    ctx.lineTo(x + step * 0.24, baseY - peak * 0.2);
    ctx.lineTo(x + step * 0.42, baseY - peak);
    ctx.lineTo(x + step * 0.55, baseY - peak + 5);
    ctx.lineTo(x + step * 0.58, baseY - peak * 0.55);
    ctx.lineTo(x + step * 0.76, baseY - peak * 0.55);
    ctx.lineTo(x + step, baseY + 10);
    x += step; i++;
  }
  ctx.lineTo(w, h * 0.85);
  ctx.lineTo(0, h * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTitleRuin(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 220, s / 220);
  ctx.fillStyle = 'rgba(27,18,15,.94)';
  // broken ring
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(32,22,17,.94)';
  ctx.beginPath(); ctx.arc(0, -76, 58, -2.45, 0.45); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -76, 58, 0.72, 1.9); ctx.stroke();
  // spokes
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = -2.2 + i * 0.75;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, -76 + Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 55, -76 + Math.sin(a) * 55); ctx.stroke();
  }
  // tower legs
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(-23, 16); ctx.lineTo(-8, -58); ctx.moveTo(23, 16); ctx.lineTo(8, -58); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(22, -4); ctx.moveTo(-16, -30); ctx.lineTo(16, -30); ctx.stroke();
  // lower slabs
  ctx.fillStyle = 'rgba(27,18,15,.94)';
  ctx.beginPath(); ctx.moveTo(-64, 16); ctx.lineTo(-31, -6); ctx.lineTo(-27, 22); ctx.lineTo(-58, 32); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(34, 14); ctx.lineTo(77, 3); ctx.lineTo(83, 22); ctx.lineTo(37, 34); ctx.closePath(); ctx.fill();
  // blinking light
  const blink = 0.55 + Math.sin(titleTime * 1.5) * 0.4;
  ctx.fillStyle = `rgba(124,220,205,${blink * 0.65})`;
  ctx.shadowColor = '#7cd8ca'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(0, -135, 2.8, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawTitleDune(w, h, yBase, amp, light, dark, phase) {
  const g = ctx.createLinearGradient(0, yBase - amp, 0, h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, yBase);
  for (let x = 0; x <= w; x += 20) {
    const y = yBase + Math.sin(x * 0.004 + phase) * amp * 0.24 + Math.sin(x * 0.011 + phase * 2) * amp * 0.1;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath(); ctx.fill();
  // crest
  ctx.strokeStyle = 'rgba(232,184,125,.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 20) {
    const y = yBase + Math.sin(x * 0.004 + phase) * amp * 0.24 + Math.sin(x * 0.011 + phase * 2) * amp * 0.1;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
function drawWorld(dt, freeze = false) {
  if (!state) return;
  const z = view.zoom;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  const shake = camera.shake > 0 ? camera.shake : 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;
  screenTransform(sx, sy);

  drawGround();
  drawLandmarks();
  for (const r of world.ruins) drawRuin(r);
  for (const n of world.desertScrap) drawNode(n);
  drawOutpost();
  for (const r of world.ruins) for (const n of r.nodes) drawNode(n);
  drawPlayer();
  drawEffects();

  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawLighting();
  drawAmbientScreen();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keyMap = {
  ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd',
  w: 'w', a: 'a', s: 's', d: 'd', W: 'w', A: 'a', S: 's', D: 'd'
};

addEventListener('keydown', (e) => {
  const k = keyMap[e.key];
  if (k) {
    keys[k] = true;
    if (mode === 'playing' && !panelOpen) e.preventDefault();
  }
  if (e.key === 'Shift') keys.shift = true;

  if (mode === 'title') {
    if ((e.key === 'Enter' || e.key === ' ') && !panelOpen) {
      e.preventDefault();
      startGame(false);
    }
    return;
  }

  if (e.key === 'Escape') {
    if (panelOpen) {
      if (mode === 'playing') hideOverlay();
    } else if (mode === 'playing') {
      pausePanel();
    }
    return;
  }

  if (mode !== 'playing' || panelOpen) return;
  if (k || e.key === 'Shift') return;

  if (e.key === 'e' || e.key === 'E') {
    if (!e.repeat) onInteractDown();
    e.preventDefault();
  } else if (e.key === 'q' || e.key === 'Q') {
    if (!e.repeat) doScan();
    e.preventDefault();
  } else if (e.key === 'm' || e.key === 'M') {
    if (!e.repeat) openMap();
    e.preventDefault();
  } else if (e.key === ' ') {
    e.preventDefault();
  }
});

addEventListener('keyup', (e) => {
  const k = keyMap[e.key];
  if (k) keys[k] = false;
  if (e.key === 'Shift') keys.shift = false;
  if ((e.key === 'e' || e.key === 'E') && !e.repeat) onInteractUp();
});

addEventListener('blur', () => {
  keys.w = keys.a = keys.s = keys.d = keys.shift = false;
  touchMove.active = false;
  el.thumb.style.transform = 'translate(-50%, -50%)';
  onInteractUp();
});

// Touch joystick
let joyPointer = null;
function updateJoystick(e) {
  const rect = el.joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  const max = rect.width * 0.36;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  touchMove.x = dx / max;
  touchMove.y = dy / max;
  touchMove.active = Math.hypot(touchMove.x, touchMove.y) > 0.16;
  el.thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
el.joystick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  joyPointer = e.pointerId;
  el.joystick.setPointerCapture(e.pointerId);
  touchMove.active = true;
  updateJoystick(e);
  Audio.resume();
});
el.joystick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyPointer) return;
  e.preventDefault();
  updateJoystick(e);
});
function releaseJoystick(e) {
  if (joyPointer === null || (e && e.pointerId !== joyPointer)) return;
  joyPointer = null;
  touchMove.active = false;
  touchMove.x = 0; touchMove.y = 0;
  el.thumb.style.transform = 'translate(-50%, -50%)';
}
el.joystick.addEventListener('pointerup', releaseJoystick);
el.joystick.addEventListener('pointercancel', releaseJoystick);

document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-action="interact-down"]');
  if (b) {
    e.preventDefault();
    b.setPointerCapture && b.setPointerCapture(e.pointerId);
    onInteractDown();
  }
});
document.addEventListener('pointerup', () => { onInteractUp(); });
document.addEventListener('pointercancel', () => { onInteractUp(); });
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#joystick, .touch-btn, .hud')) e.preventDefault();
});

// Click / tap actions
document.addEventListener('click', (e) => {
  const buy = e.target.closest('[data-buy]');
  if (buy && !buy.disabled) {
    buyItem(buy.dataset.buy);
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'interact-down') return;

  if (action === 'new-game') {
    startGame(false);
  } else if (action === 'continue-game') {
    startGame(true);
  } else if (action === 'toggle-sound') {
    Audio.resume();
    Audio.setMuted(!Audio.muted);
    try { localStorage.setItem('longdust-muted', Audio.muted ? '1' : '0'); } catch (err) {}
  } else if (action === 'map') {
    if (mode === 'playing' && !panelOpen) openMap();
    else if (panelOpen && document.querySelector('.map-panel')) hideOverlay();
  } else if (action === 'help') {
    openHelpFromButton();
  } else if (action === 'pause') {
    if (!panelOpen && mode === 'playing') pausePanel();
  } else if (action === 'close-panel') {
    hideOverlay();
  } else if (action === 'scan') {
    doScan();
  } else if (action === 'save') {
    saveGame(false);
    toast('Journey saved. The dust keeps its copy too.', 'good', 2400);
  } else if (action === 'title') {
    saveGame(true);
    returnToTitle();
  } else if (action === 'sell') {
    const total = state.scrap * 4 + state.relics * 45;
    if (total > 0) {
      state.credits += total;
      state.scrap = 0;
      state.relics = 0;
      Audio.blip(760, 0.1, 0.045);
      saveGame();
      updateHUD(true);
      renderShop(`Salvage sold — +${total} credits.`, '');
    }
  } else if (action === 'keep-walking') {
    hideOverlay();
    mode = 'playing';
    state.flags.relay = true;
    el.objTitle.textContent = 'THE RELAY SINGS';
    el.objBody.textContent = 'You woke the sky. Now there is only the walking, and whatever answers.';
    for (const i of el.objProgress.children) i.classList.add('on');
    toast('Somewhere above, a light is moving. It is not a star.', 'good', 5200);
    saveGame();
  }
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let lastTime = performance.now();
let lastRender = 0;
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - lastTime) / 1000));
  lastTime = ts;

  if (mode === 'title') {
    drawTitle(dt);
  } else {
    if (mode === 'playing' && !paused) {
      update(dt);
    }
    drawWorld(dt);
    if (state) {
      updateCompass();
      drawRadar();
    }
    hudTimer += dt;
    if (hudTimer > 0.11) { hudTimer = 0; updateHUD(); }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  try {
    if (localStorage.getItem('longdust-muted') === '1') Audio.muted = true;
  } catch (e) {}
  document.body.classList.toggle('muted', Audio.muted);
  resize();
  initWorld();
  el.continueBtn.classList.toggle('is-hidden', !hasSave());
  el.continueBtn.textContent = hasSave() ? 'CONTINUE JOURNEY' : 'CONTINUE JOURNEY';
  camera.x = START.x; camera.y = START.y;
  lastTime = performance.now();
  requestAnimationFrame(frame);
}

addEventListener('beforeunload', () => saveGame(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame(true);
});
setInterval(() => { if (mode === 'playing' && !paused) saveGame(true); }, 18000);

boot();
})();
