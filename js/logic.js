// NEON BASTION — pure simulation (no DOM / Three.js): grid, path, towers, enemies, projectiles, economy, waves.
// Fixed-step and deterministic for a given map + action sequence. The view reads state and consumes `events`.
import { STEP, CORE_HP, SELL_REFUND, INTEREST, EARLY, COUNTDOWN, TOWERS, ENEMIES, MILESTONE_EVERY, buildMap, cellPos, waveSpec, hpMul, bossMul, speedMul, rewardMul, waveClearBonus, towerSpent, mulberry32 } from './config.js';

const key = (c, r) => c + ',' + r;

export class Game {
  /** @param map from config MAPS / ENDLESS_MAP; opts.stopAfter = trial wave cap (endless) */
  constructor(map, opts = {}) {
    this.map = map; this.L = buildMap(map);
    this.rng = mulberry32(opts.seed ?? 12345);
    this.pts = this.L.cells.map(([c, r]) => cellPos(c, r));       // path polyline in world units
    this.seg = []; let acc = 0;
    for (let i = 0; i < this.pts.length - 1; i++) { const d = Math.hypot(this.pts[i + 1][0] - this.pts[i][0], this.pts[i + 1][1] - this.pts[i][1]); this.seg.push(acc); acc += d; }
    this.len = acc;
    this.spawnPos = this.pts[0]; this.corePos = this.pts[this.pts.length - 1];
    this.flyLen = Math.hypot(this.corePos[0] - this.spawnPos[0], this.corePos[1] - this.spawnPos[1]);
    this.pads = new Set(this.L.pads.map(([c, r]) => key(c, r)));
    this.credits = map.credits; this.hp = opts.coreHp ?? CORE_HP; this.maxHp = this.hp;
    this.wave = 0; this.maxWave = map.waves; this.stopAfter = opts.stopAfter || Infinity;
    this.state = 'build';             // build (before wave 1) | wave | won | lost | trialEnd
    this.countdown = COUNTDOWN.first || null;
    this.enemies = []; this.towers = new Map(); this.shots = []; this.events = []; this.queue = [];
    this.t = 0; this.acc = 0; this.nextId = 1; this.score = 0; this.kills = 0; this.leaked = 0; this.continued = false;
    this.pendingBonus = 0;            // clear bonuses accumulate until the field is empty
    this.stats = { built: 0, spent: 0, earlyCalls: 0 };
  }
  // ------------------------------------------------------------ queries
  isPad(c, r) { return this.pads.has(key(c, r)); }
  towerAt(c, r) { return this.towers.get(key(c, r)) || null; }
  canBuild(type, c, r) { return this.isPad(c, r) && !this.towerAt(c, r) && this.credits >= TOWERS[type].cost[0] && this.active(); }
  upgradeCost(t) { return t.level >= 3 ? null : TOWERS[t.type].cost[t.level]; }
  sellValue(t) { return Math.floor(towerSpent(t.type, t.level) * SELL_REFUND); }
  active() { return this.state === 'build' || this.state === 'wave'; }
  canCallWave() { return this.active() && this.wave < this.maxWave && this.wave < this.stopAfter && this.queue.length === 0; }
  earlyBonus() { if (!this.canCallWave() || this.wave === 0) return 0; return this.countdown != null ? Math.round(EARLY.base + EARLY.perSec * this.countdown) : EARLY.base; }
  posAt(s) {   // path distance → [x, z]
    if (s <= 0) return this.pts[0]; if (s >= this.len) return this.corePos;
    let lo = 0, hi = this.seg.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.seg[m] <= s) lo = m; else hi = m - 1; }
    const a = this.pts[lo], b = this.pts[lo + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = (s - this.seg[lo]) / d;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  progress(e) { return e.flying ? e.s / this.flyLen : e.s / this.len; }
  // ------------------------------------------------------------ player actions
  build(type, c, r) {
    if (!this.canBuild(type, c, r)) return null;
    const [x, z] = cellPos(c, r);
    const t = { id: this.nextId++, type, level: 1, c, r, x, z, cd: 0.2, aim: 0, target: null, buffD: 0, buffR: 0, kills: 0, dealt: 0 };
    this.credits -= TOWERS[type].cost[0]; this.stats.built++; this.stats.spent += TOWERS[type].cost[0];
    this.towers.set(key(c, r), t); this.recalcBuffs(); this.events.push({ k: 'build', t });
    return t;
  }
  upgrade(t) {
    const cost = this.upgradeCost(t); if (cost == null || this.credits < cost || !this.active()) return false;
    this.credits -= cost; this.stats.spent += cost; t.level++; this.recalcBuffs(); this.events.push({ k: 'upgrade', t }); return true;
  }
  sell(t) {
    if (!this.active() || !this.towers.has(key(t.c, t.r))) return 0;
    const v = this.sellValue(t); this.credits += v; this.towers.delete(key(t.c, t.r)); this.recalcBuffs(); this.events.push({ k: 'sell', t, v }); return v;
  }
  /** start the next wave now (from the build phase, the countdown, or once the current wave has finished spawning) */
  callWave() {
    if (!this.canCallWave()) return 0;
    const bonus = this.earlyBonus();
    if (bonus) { this.credits += bonus; this.score += bonus * 5; this.stats.earlyCalls++; }
    this.startWave(); return bonus;
  }
  continueRun(hp) { if (this.state !== 'lost' || this.continued) return false; this.continued = true; this.hp = hp; this.state = 'wave'; this.events.push({ k: 'continue' }); return true; }
  // ------------------------------------------------------------ internals
  recalcBuffs() {
    const list = [...this.towers.values()];
    for (const t of list) { t.buffD = 0; t.buffR = 0; }
    for (const o of list) if (o.type === 'overclock') {
      const d = TOWERS.overclock, L = o.level - 1;
      for (const t of list) if (t !== o && t.type !== 'overclock' && Math.hypot(t.x - o.x, t.z - o.z) <= d.range[L] + 0.01) { t.buffD += d.buffDmg[L]; t.buffR += d.buffRate[L]; }
    }
    for (const t of list) { t.buffD = Math.min(0.8, t.buffD); t.buffR = Math.min(0.35, t.buffR); }
  }
  startWave() {
    this.wave++; this.state = 'wave'; this.countdown = null;
    const spec = waveSpec(this.wave, this.map);
    for (const g of spec.groups) for (let i = 0; i < g.count; i++) this.queue.push({ at: this.t + g.at + i * g.gap, type: g.type, wave: this.wave });
    this.queue.sort((a, b) => a.at - b.at);
    this.events.push({ k: 'wave', n: this.wave, boss: spec.boss });
    this.pendingBonus += waveClearBonus(this.wave);
  }
  spawn(type, wave, s = 0, offset = 0) {
    const d = ENEMIES[type], hm = type === 'boss' ? bossMul(wave, this.map) : hpMul(wave, this.map);
    const e = { id: this.nextId++, type, def: d, hp: d.hp * hm, maxHp: d.hp * hm, shield: (d.shield || 0) * hm, maxShield: (d.shield || 0) * hm, s, off: offset,
      speed: d.speed * speedMul(wave, this.map), slowT: 0, slowF: 0, flying: !!d.flying, lastHit: -9, reward: Math.round(d.reward * rewardMul(wave)), wave, x: 0, z: 0, alive: true };
    this.place(e); this.enemies.push(e); this.events.push({ k: 'spawn', e }); return e;
  }
  place(e) {
    if (e.flying) { const k = Math.min(1, e.s / this.flyLen); e.x = this.spawnPos[0] + (this.corePos[0] - this.spawnPos[0]) * k; e.z = this.spawnPos[1] + (this.corePos[1] - this.spawnPos[1]) * k; }
    else { const p = this.posAt(e.s); e.x = p[0] + e.off; e.z = p[1] + e.off * 0.6; }
  }
  damage(e, dmg, src, opts = {}) {
    if (!e.alive) return;
    let d = dmg;
    if (e.shield > 0) { const mul = opts.shieldMul || 1, absorb = Math.min(e.shield, d * mul); e.shield -= absorb; d -= absorb / mul; if (e.shield <= 0) this.events.push({ k: 'shieldBreak', e }); }
    if (d > 0) { const eff = Math.max(d * 0.25, d - e.def.armor); e.hp -= eff; if (src) src.dealt += eff; }
    e.lastHit = this.t;
    if (e.hp <= 0) this.kill(e, src);
  }
  kill(e, src) {
    e.alive = false; this.kills++; this.credits += e.reward; this.score += e.reward * 10; if (src) src.kills++;
    this.events.push({ k: 'kill', e });
    if (e.def.split) for (let i = 0; i < e.def.split; i++) { const m = this.spawn('mini', e.wave, Math.max(0, e.s - i * 0.25), (i - 1) * 0.18); if (e.flying) m.flying = true; }
  }
  inRange(t, e, range) { return Math.hypot(e.x - t.x, e.z - t.z) <= range; }
  pickFirst(t, range, ground) {
    let best = null, bp = -1;
    for (const e of this.enemies) if (e.alive && (!ground || !e.flying) && this.inRange(t, e, range)) { const p = this.progress(e); if (p > bp) { bp = p; best = e; } }
    return best;
  }
  fire(t, dt) {
    const d = TOWERS[t.type], L = t.level - 1;
    if (t.type === 'overclock') return;
    t.cd -= dt * (1 + t.buffR); if (t.cd > 0) return;
    const range = d.range[L], dmg = (d.dmg[L]) * (1 + t.buffD);
    if (t.type === 'cryo') {
      let any = false;
      for (const e of this.enemies) if (e.alive && this.inRange(t, e, range)) { any = true; e.slowF = Math.max(e.slowF, d.slow[L]); e.slowT = d.slowT; this.damage(e, dmg, t); }
      if (any) { t.cd = 1 / d.rate[L]; this.events.push({ k: 'pulse', t, r: range }); }
      return;
    }
    const tgt = this.pickFirst(t, range, !d.air); if (!tgt) return;
    t.cd = 1 / d.rate[L]; t.aim = Math.atan2(tgt.x - t.x, tgt.z - t.z); t.target = tgt.id;
    if (t.type === 'laser') { this.events.push({ k: 'beam', t, x: tgt.x, z: tgt.z, fly: tgt.flying }); this.damage(tgt, dmg, t); }
    else if (t.type === 'missile') { this.shots.push({ id: this.nextId++, t, tgt, x: t.x, z: t.z, tx: tgt.x, tz: tgt.z, dmg, splash: d.splash[L], speed: d.speed }); this.events.push({ k: 'launch', t }); }
    else if (t.type === 'tesla') {
      const hit = [tgt]; let cur = tgt, k = dmg; const pts = [[t.x, t.z, 0], [tgt.x, tgt.z, tgt.flying ? 1 : 0]];
      this.damage(tgt, k, t, { shieldMul: d.shieldMul });
      for (let i = 1; i < d.chain[L]; i++) {
        let nb = null, nd = 1.7;
        for (const e of this.enemies) if (e.alive && !hit.includes(e)) { const dd = Math.hypot(e.x - cur.x, e.z - cur.z); if (dd < nd) { nd = dd; nb = e; } }
        if (!nb) break; k *= d.falloff; hit.push(nb); pts.push([nb.x, nb.z, nb.flying ? 1 : 0]); this.damage(nb, k, t, { shieldMul: d.shieldMul }); cur = nb;
      }
      this.events.push({ k: 'chain', t, pts });
    }
  }
  /** one fixed step */
  step(dt = STEP) {
    if (!this.active()) return;
    this.t += dt;
    // countdown → auto start
    if (this.countdown != null) { this.countdown -= dt; if (this.countdown <= 0) this.startWave(); }
    // spawns
    while (this.queue.length && this.queue[0].at <= this.t) { const q = this.queue.shift(); this.spawn(q.type, q.wave); }
    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 0; }
      if (e.maxShield && e.shield < e.maxShield && this.t - e.lastHit > e.def.regenDelay) e.shield = Math.min(e.maxShield, e.shield + e.def.regen * hpMul(e.wave, this.map) * dt);
      e.s += e.speed * (1 - e.slowF) * dt; this.place(e);
      if ((e.flying ? e.s >= this.flyLen : e.s >= this.len)) {
        e.alive = false; this.hp -= e.def.leak; this.leaked += e.def.leak; this.events.push({ k: 'leak', e });
        if (this.hp <= 0) { this.hp = 0; this.state = 'lost'; this.events.push({ k: 'lost' }); }
      }
    }
    // towers
    for (const t of this.towers.values()) this.fire(t, dt);
    // missiles
    for (const m of this.shots) {
      if (m.tgt.alive) { m.tx = m.tgt.x; m.tz = m.tgt.z; }
      const dx = m.tx - m.x, dz = m.tz - m.z, dist = Math.hypot(dx, dz), stepLen = m.speed * dt;
      if (dist <= stepLen + 0.05) {
        m.dead = true; this.events.push({ k: 'boom', x: m.tx, z: m.tz, r: m.splash, t: m.t });
        for (const e of this.enemies) if (e.alive && !e.flying && Math.hypot(e.x - m.tx, e.z - m.tz) <= m.splash) this.damage(e, m.dmg, m.t);
      } else { m.x += dx / dist * stepLen; m.z += dz / dist * stepLen; m.ang = Math.atan2(dx, dz); }
    }
    this.shots = this.shots.filter((m) => !m.dead);
    this.enemies = this.enemies.filter((e) => e.alive);
    if (this.state !== 'wave') return;
    // field clear → payout, next phase
    if (!this.queue.length && !this.enemies.length && this.wave > 0 && this.countdown == null) {
      const interest = Math.min(INTEREST.cap, Math.floor(this.credits * INTEREST.rate));
      const bonus = this.pendingBonus; this.pendingBonus = 0;
      this.credits += bonus + interest; this.score += this.wave * 50;
      let milestone = 0;
      if (this.map.endless && this.wave % MILESTONE_EVERY === 0) { milestone = this.wave; this.score += 1000 * (this.wave / MILESTONE_EVERY); this.hp = Math.min(this.maxHp, this.hp + 3); }
      this.events.push({ k: 'clear', n: this.wave, bonus, interest, milestone });
      if (this.wave >= this.maxWave) { this.state = 'won'; this.events.push({ k: 'won' }); }
      else if (this.wave >= this.stopAfter) { this.state = 'trialEnd'; this.events.push({ k: 'trialEnd' }); }
      else this.countdown = COUNTDOWN.between;
    }
  }
  /** advance by real dt (× speed), running fixed steps; returns steps run */
  update(dt, maxSteps = 240) {
    this.acc += dt; let n = 0;
    while (this.acc >= STEP && n < maxSteps) { this.step(STEP); this.acc -= STEP; n++; }
    if (n >= maxSteps) this.acc = 0;
    return n;
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
}
