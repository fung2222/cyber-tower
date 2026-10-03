// NEON BASTION autopilot — used by ?demo=1, the attract mode behind the start screen and the balance tests.
// A sensible (not optimal) builder: rank pads by how much path a tower would cover, follow a build order, then upgrade.
import { TOWERS } from './config.js';

const ORDER = ['laser', 'missile', 'laser', 'cryo', 'tesla', 'missile', 'overclock', 'laser', 'tesla', 'missile', 'overclock', 'cryo', 'tesla', 'laser', 'missile', 'overclock'];

function coverage(g, c, r, range, air = false) {
  let n = 0; const [x, z] = [c - (9 - 1) / 2, r - (13 - 1) / 2];
  for (const p of g.pts) if (Math.hypot(p[0] - x, p[1] - z) <= range) n++;
  if (air) {   // drones fly straight from the portal to the core: anti-air towers also value that line
    const [sx, sz] = g.spawnPos, [cx, cz] = g.corePos, N = Math.ceil(g.flyLen * 2);
    for (let i = 0; i <= N; i++) { const k = i / N; if (Math.hypot(sx + (cx - sx) * k - x, sz + (cz - sz) * k - z) <= range) n += 0.6; }
  }
  return n;
}
function bestPad(g, type) {
  let best = null, bs = -1;
  for (const [c, r] of g.L.pads) {
    if (g.towerAt(c, r)) continue;
    let s;
    if (type === 'overclock') { s = 0; for (const t of g.towers.values()) if (t.type !== 'overclock' && Math.hypot(t.c - c, t.r - r) <= 1.51) s += t.level * 2; s += coverage(g, c, r, 2) * 0.1; }
    else s = coverage(g, c, r, TOWERS[type].range[0], TOWERS[type].air && type !== 'cryo' && g.wave >= 2);
    if (s > bs) { bs = s; best = [c, r]; }
  }
  return best;
}
export function createAI({ skill = 1, early = true } = {}) {
  const mem = { i: 0, t: 0 };
  return function think(g, dt) {
    mem.t += dt; if (mem.t < 0.4) return; mem.t = 0;
    if (!g.active()) return;
    const want = Math.min(g.L.pads.length, Math.floor((3 + g.wave * 0.75) * skill));
    const next = ORDER[mem.i % ORDER.length];
    const free = g.L.pads.some(([c, r]) => !g.towerAt(c, r));
    const allMax = [...g.towers.values()].every((t) => t.level >= 3);
    if (free && (g.towers.size < want || allMax)) {
      if (g.credits >= TOWERS[next].cost[0]) { const p = bestPad(g, next); if (p && g.build(next, p[0], p[1])) mem.i++; }
    } else {
      // upgrade the most useful affordable tower (prefer high coverage, low level)
      let best = null, bs = -1;
      for (const t of g.towers.values()) {
        const cost = g.upgradeCost(t); if (cost == null || cost > g.credits) continue;
        const s = (t.type === 'overclock' ? 6 : coverage(g, t.c, t.r, TOWERS[t.type].range[t.level - 1])) / (cost * t.level);
        if (s > bs) { bs = s; best = t; }
      }
      if (best) g.upgrade(best);
    }
    if (g.state === 'build' && g.towers.size >= 2) g.callWave();
    // call the next wave early when the defence is comfortably ahead (keeps demos and sessions brisk)
    else if (early && g.canCallWave() && g.wave > 0 && g.enemies.length < 4 && g.enemies.every((e) => g.progress(e) < 0.4) && g.hp >= g.maxHp - 2) g.callWave();
  };
}
