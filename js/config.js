// NEON BASTION 霓虹堡壘 — every tuning constant + pure data (maps, towers, enemies, wave generator). Unit-tested in tests/.
export const GAME_ID = 'cyber-tower';
export const GRID = { w: 9, h: 13 };            // portrait grid, 1 world unit per cell
export const STEP = 1 / 30;                      // fixed simulation step (s)
export const CORE_HP = 20;
export const CONTINUE_HP = 10;                   // rewarded "continue" adds this much core HP (once per run)
export const SELL_REFUND = 0.7;
export const INTEREST = { rate: 0.06, cap: 30 };  // paid on every wave clear: 6 % of banked credits, max 30
export const EARLY = { perSec: 2, base: 8 };      // calling the next wave early: base + 2 per second skipped
export const COUNTDOWN = { first: 0, between: 5 };// first wave waits for the player; later waves auto-start after 5 s
export const BOSS_EVERY = 10;
export const MILESTONE_EVERY = 10;               // endless: milestone banner + bonus every 10 waves
export const TRIAL = { maps: 2, endlessWave: 10 };// trial=1 from the CYBER ARCADE hub: maps 1–2 and endless up to wave 10

// ---------------------------------------------------------------- towers (3 levels each)
// range in cells, rate = shots per second, dmg per hit. Overclock buffs towers whose centre is within its range.
export const TOWERS = {
  laser:     { cost: [50, 45, 90],   color: 0x00e5ff, air: true,  range: [2.5, 2.7, 2.9], rate: [3.0, 3.4, 3.8], dmg: [7, 12, 21] },
  cryo:      { cost: [60, 55, 100],  color: 0x7fd8ff, air: true,  range: [1.8, 2.0, 2.2], rate: [0.8, 0.85, 0.9], dmg: [3, 6, 10], slow: [0.35, 0.45, 0.55], slowT: 1.6 },
  missile:   { cost: [80, 70, 130],  color: 0xff8a2b, air: false, range: [3.0, 3.3, 3.6], rate: [0.55, 0.6, 0.65], dmg: [32, 58, 100], splash: [0.95, 1.05, 1.25], speed: 6.5 },
  tesla:     { cost: [90, 80, 150],  color: 0xb26bff, air: true,  range: [2.2, 2.4, 2.6], rate: [0.95, 1.05, 1.15], dmg: [13, 22, 36], chain: [3, 4, 5], falloff: 0.82, shieldMul: 2 },
  overclock: { cost: [70, 60, 110],  color: 0xfff35c, air: false, range: [1.5, 1.5, 2.3], buffDmg: [0.2, 0.32, 0.45], buffRate: [0.08, 0.12, 0.18] },
};
export const TOWER_ORDER = ['laser', 'cryo', 'missile', 'tesla', 'overclock'];
export const towerSpent = (type, level) => TOWERS[type].cost.slice(0, level).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- enemies
// hp at wave 1 / map 1, speed in cells per second, armor = flat damage removed per hit (min 25 % gets through)
export const ENEMIES = {
  runner:   { hp: 26,  speed: 2.4, reward: 4,   leak: 1,  armor: 0, color: 0xff2bd6, size: 0.26 },
  tank:     { hp: 110, speed: 1.0, reward: 11,  leak: 2,  armor: 5, color: 0xff8a2b, size: 0.38 },
  shield:   { hp: 45,  speed: 1.5,  reward: 8,   leak: 1,  armor: 0, color: 0x3bb8ff, size: 0.3, shield: 45, regenDelay: 2.5, regen: 18 },
  splitter: { hp: 60,  speed: 1.2, reward: 6,   leak: 1,  armor: 0, color: 0x3bff8a, size: 0.34, split: 3 },
  mini:     { hp: 16,  speed: 2.4,  reward: 2,   leak: 1,  armor: 0, color: 0x9dffc4, size: 0.18 },
  drone:    { hp: 30,  speed: 1.0,  reward: 7,   leak: 1,  armor: 0, color: 0xfff35c, size: 0.28, flying: true },
  boss:     { hp: 950, speed: 0.65, reward: 120, leak: 6 , armor: 4, color: 0xa66bff, size: 0.62 },
};
// threat cost used by the wave builder
const THREAT = { runner: 1, tank: 4.2, shield: 2.6, splitter: 3, drone: 2.8 };

// ---------------------------------------------------------------- maps
// Paths are waypoint lists on the 9×13 grid [col, row]; first = spawn portal (edge), last = core. Segments are axis-aligned.
// Build pads are generated next to the path (see buildMap). waves = campaign length; diff = HP multiplier (ramps in over 8 waves; map 1 is a gentle tutorial at 0.85); credits = start money.
export const MAPS = [
  { id: 1, zh: '旺角', en: 'MONG KOK',       waves: 10, diff: 0.85,  credits: 180, pads: 18, theme: 1, path: [[1, 0], [1, 3], [7, 3], [7, 7], [1, 7], [1, 10], [5, 10], [5, 12]] },
  { id: 2, zh: '廟街', en: 'TEMPLE STREET',  waves: 10, diff: 1.0, credits: 180, pads: 18, theme: 2, path: [[7, 0], [7, 2], [1, 2], [1, 5], [7, 5], [7, 8], [1, 8], [1, 11], [4, 11], [4, 12]] },
  { id: 3, zh: '中環', en: 'CENTRAL',        waves: 10, diff: 1.15, credits: 190, pads: 17, theme: 3, path: [[1, 0], [1, 10], [4, 10], [4, 2], [7, 2], [7, 12]] },
  { id: 4, zh: '九龍灣', en: 'KOWLOON BAY',  waves: 10, diff: 1.3, credits: 200, pads: 17, theme: 4, path: [[8, 2], [1, 2], [1, 10], [7, 10], [7, 5], [4, 5], [4, 7]] },
  { id: 5, zh: '深水埗', en: 'SHAM SHUI PO', waves: 10, diff: 1.25, credits: 200, pads: 16, theme: 5, path: [[0, 1], [6, 1], [6, 4], [2, 4], [2, 7], [6, 7], [6, 10], [2, 10], [2, 12]] },
  { id: 6, zh: '尖沙咀', en: 'TSIM SHA TSUI', waves: 10, diff: 1.5, credits: 210, pads: 16, theme: 6, path: [[0, 0], [0, 2], [2, 2], [2, 4], [4, 4], [4, 6], [6, 6], [6, 8], [8, 8], [8, 10], [4, 10], [4, 12]] },
  { id: 7, zh: '蘭桂坊', en: 'LAN KWAI FONG', waves: 10, diff: 1.65, credits: 210, pads: 15, theme: 7, path: [[0, 0], [7, 0], [7, 3], [1, 3], [1, 6], [7, 6], [7, 9], [1, 9], [1, 12]] },
  { id: 8, zh: '太平山', en: 'VICTORIA PEAK', waves: 12, diff: 1.8, credits: 230, pads: 15, theme: 8, path: [[8, 0], [8, 3], [2, 3], [2, 7], [6, 7], [6, 10], [4, 10], [4, 12]] },
];
export const ENDLESS_MAP = { id: 0, zh: '無限核心', en: 'INFINITE CORE', waves: Infinity, diff: 1.0, credits: 200, pads: 24, theme: 3, endless: true,
  path: [[0, 0], [8, 0], [8, 12], [0, 12], [0, 3], [6, 3], [6, 10], [2, 10], [2, 5], [4, 5], [4, 8]] };
export const mapById = (id) => (id === 0 ? ENDLESS_MAP : MAPS.find((m) => m.id === id));

/** Rasterise the waypoint path; returns { cells:[[c,r]...], pads:[[c,r]...], spawn, core, decor:[[c,r]...] }. Pure. */
export function buildMap(m) {
  const cells = [];
  for (let i = 0; i < m.path.length - 1; i++) {
    const [c0, r0] = m.path[i], [c1, r1] = m.path[i + 1];
    if (c0 !== c1 && r0 !== r1) throw new Error(`map ${m.id}: diagonal segment ${i}`);
    const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)), dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    for (let k = i === 0 ? 0 : 1; k <= n; k++) cells.push([c0 + dc * k, r0 + dr * k]);
  }
  const key = (c, r) => c + ',' + r, onPath = new Set(cells.map(([c, r]) => key(c, r)));
  const inGrid = (c, r) => c >= 0 && r >= 0 && c < GRID.w && r < GRID.h;
  // candidates: non-path cells touching the path (8-neighbourhood), scored by path cells within 2.2 cells
  const cand = [];
  for (let r = 0; r < GRID.h; r++) for (let c = 0; c < GRID.w; c++) {
    if (onPath.has(key(c, r))) continue;
    let touch = false; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (onPath.has(key(c + dc, r + dr))) touch = true;
    if (!touch) continue;
    const [sc, sr] = cells[0], [cc, cr] = cells[cells.length - 1];
    if (Math.max(Math.abs(c - sc), Math.abs(r - sr)) <= 1 || Math.max(Math.abs(c - cc), Math.abs(r - cr)) <= 0) continue;
    let cov = 0; for (const [pc, pr] of cells) if (Math.hypot(pc - c, pr - r) <= 2.2) cov++;
    cand.push({ c, r, cov: cov + ((c * 7 + r * 13) % 5) * 0.01 });
  }
  cand.sort((a, b) => b.cov - a.cov);
  const pads = [], padSet = new Set();
  for (const p of cand) {
    if (pads.length >= m.pads) break;
    if (padSet.has(key(p.c + 1, p.r)) || padSet.has(key(p.c - 1, p.r)) || padSet.has(key(p.c, p.r + 1)) || padSet.has(key(p.c, p.r - 1))) continue;
    pads.push([p.c, p.r]); padSet.add(key(p.c, p.r));
  }
  const decor = [];
  for (let r = 0; r < GRID.h; r++) for (let c = 0; c < GRID.w; c++) if (!onPath.has(key(c, r)) && !padSet.has(key(c, r)) && inGrid(c, r)) decor.push([c, r]);
  return { cells, pads, decor, spawn: cells[0], core: cells[cells.length - 1], length: cells.length - 1 };
}
/** world position (x,z) of a cell centre */
export const cellPos = (c, r) => [c - (GRID.w - 1) / 2, r - (GRID.h - 1) / 2];

// ---------------------------------------------------------------- waves
/** deterministic RNG */
export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** HP multiplier for wave n. Campaign: gentle quadratic. Endless: keeps rising but the growth rate saturates (capped curve, never a wall). */
export function hpMul(n, map) {
  const k = n - 1;
  if (map.endless) return 1 + 0.16 * k + 0.0105 * k * k * (1 - Math.min(0.6, k / 160));
  return (1 + (map.diff - 1) * Math.min(1, k / 8)) * (1 + 0.15 * k + 0.0095 * k * k);   // map difficulty ramps in over 8 waves
}
export const speedMul = (n, map) => 1 + Math.min(map.endless ? 0.35 : 0.2, (n - 1) * 0.012);
export const rewardMul = (n) => 1 + Math.min(1.5, (n - 1) * 0.035);
/** boss every 10 waves, and every campaign map ends with a boss */
export const isBossWave = (n, map) => n % BOSS_EVERY === 0 || (!!map && !map.endless && n === map.waves);
/** bosses scale slower than the crowd (hpMul^0.8) so every boss stays killable */
export const bossMul = (n, map) => Math.pow(hpMul(n, map), 0.8);

/**
 * Wave spec for wave n on map m → { boss, groups:[{type, count, gap, at}] } (pure; same input → same waves).
 * Enemy types unlock with the wave number (earlier on later maps). Threat budget grows linearly (count growth capped in endless).
 */
export function waveSpec(n, map) {
  const rng = mulberry32(map.id * 7919 + n * 104729);
  const shift = map.endless ? 0 : Math.floor((map.id - 1) / 3);
  const types = ['runner'];
  if (n + shift >= 3 && n >= 2) types.push('tank');
  if (n + shift >= 4) types.push('splitter');
  if (n + shift >= 5 && n >= 3) types.push('drone');
  if (n + shift >= 6) types.push('shield');
  let budget = 7 + n * 2.6 + (map.endless ? 0 : (map.id - 1) * 0.8);
  if (map.endless) budget = Math.min(budget, 7 + 60 * 2.6 + (n - 60) * 0.6 * (n > 60 ? 1 : 0));
  const groups = []; let at = 0;
  if (isBossWave(n, map)) { groups.push({ type: 'boss', count: 1 + (map.endless ? Math.floor(n / 40) : 0), gap: 6, at: 3 }); budget *= 0.45; }
  // the newest type features in its debut wave
  const debut = types.length > 1 && !isBossWave(n, map) ? types[types.length - 1] : null;
  let first = true;
  while (budget >= 1) {
    const type = first && debut && rng() < 0.85 ? debut : types[Math.floor(rng() * types.length)];
    first = false;
    const cost = THREAT[type];
    const count = Math.max(1, Math.min(Math.floor(budget / cost), Math.round((type === 'tank' ? 2 : type === 'runner' ? 7 : 4) * (0.6 + rng() * 0.8))));
    const gap = type === 'runner' ? 0.42 : type === 'tank' ? 1.2 : type === 'drone' ? 0.7 : 0.75;
    groups.push({ type, count, gap, at });
    at += count * gap * 0.6 + 0.5 + rng() * 0.8;
    budget -= count * cost;
  }
  return { boss: isBossWave(n, map), groups };
}
export const waveClearBonus = (n) => 10 + Math.min(40, n * 2);

/** campaign stars from remaining core HP (a used continue caps the result at 1 star) */
export function starsFor(hp, continued) { if (continued) return 1; return hp >= 18 ? 3 : hp >= 10 ? 2 : 1; }

export const ADS = { interstitialCooldownSec: 180, breaksBetweenInterstitials: 2, graceSec: 120, units: { android: {} } };
