// node --test tests/  — pure-logic tests for NEON BASTION (no browser needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, ENDLESS_MAP, TOWERS, ENEMIES, TRIAL, SELL_REFUND, EARLY, STEP, buildMap, waveSpec, hpMul, isBossWave, starsFor, towerSpent } from '../js/config.js';
import { Game } from '../js/logic.js';
import { play } from './balance.mjs';

const ALL = [...MAPS, ENDLESS_MAP];
const k = (c, r) => c + ',' + r;

test('8 campaign maps + endless, each path valid', () => {
  assert.equal(MAPS.length, 8);
  for (const m of ALL) {
    const L = buildMap(m), seen = new Set();
    for (const [c, r] of L.cells) { assert.ok(!seen.has(k(c, r)), `map ${m.id}: path crosses itself at ${c},${r}`); seen.add(k(c, r)); }
    // no two non-consecutive path cells 4-adjacent (lanes never touch, so the flow is readable)
    const idx = new Map(L.cells.map(([c, r], i) => [k(c, r), i]));
    L.cells.forEach(([c, r], i) => { for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx.get(k(c + dc, r + dr)); if (j != null) assert.equal(Math.abs(j - i), 1, `map ${m.id}: lanes touch at ${c},${r}`); } });
    assert.ok(L.pads.length >= 10, `map ${m.id}: ${L.pads.length} pads`);
    for (const [c, r] of L.pads) assert.ok(!seen.has(k(c, r)), `map ${m.id}: pad on path`);
  }
});

test('build / upgrade / sell economy', () => {
  const g = new Game(MAPS[0]), [c, r] = g.L.pads[0]; g.credits = 1000; const c0 = g.credits;
  const [pc, pr] = g.L.cells[3]; assert.equal(g.build('laser', pc, pr), null, 'cannot build on the path');
  const t = g.build('laser', c, r); assert.ok(t);
  assert.equal(g.credits, c0 - TOWERS.laser.cost[0]);
  assert.equal(g.build('cryo', c, r), null, 'pad occupied');
  assert.ok(g.upgrade(t)); assert.ok(g.upgrade(t)); assert.equal(t.level, 3);
  assert.equal(g.upgradeCost(t), null); assert.equal(g.upgrade(t), false, 'max level');
  const spent = towerSpent('laser', 3); assert.equal(c0 - g.credits, spent);
  const v = g.sell(t); assert.equal(v, Math.floor(spent * SELL_REFUND)); assert.equal(g.towers.size, 0);
  g.credits = 10; assert.equal(g.build('missile', c, r), null, 'not enough credits');
});

test('armor, shields and splitters', () => {
  const g = new Game(MAPS[0]);
  const tank = g.spawn('tank', 1); const hp0 = tank.hp; g.damage(tank, 10, null);
  assert.equal(hp0 - tank.hp, 10 - ENEMIES.tank.armor, 'armor subtracts flat');
  g.damage(tank, 2, null); assert.equal(hp0 - tank.hp, 10 - ENEMIES.tank.armor + 0.5, 'chip damage floors at 25%');
  const sh = g.spawn('shield', 1); const hpS = sh.hp; g.damage(sh, 10, null);
  assert.equal(sh.hp, hpS, 'shield absorbs first'); assert.ok(sh.shield < sh.maxShield);
  const sh2 = g.spawn('shield', 1); g.damage(sh2, 10, null, { shieldMul: TOWERS.tesla.shieldMul });
  assert.ok(sh2.shield < sh.shield, 'tesla strips shields faster');
  const sp = g.spawn('splitter', 1), n0 = g.enemies.length; g.damage(sp, 1e6, null);
  assert.equal(g.enemies.filter((e) => e.alive && e.type === 'mini').length, ENEMIES.splitter.split, 'splitter -> minis');
  assert.ok(g.enemies.length >= n0 + ENEMIES.splitter.split - 1);
});

test('drones fly straight, ground-only towers ignore them', () => {
  const g = new Game(MAPS[0]); const d = g.spawn('drone', 3);
  assert.ok(d.flying); assert.ok(g.flyLen < g.len, 'flight line shorter than the path');
  assert.equal(TOWERS.missile.air, false); assert.equal(TOWERS.laser.air, true);
});

test('calling a wave early pays a bonus', () => {
  const g = new Game(MAPS[0]);
  assert.equal(g.callWave(), 0, 'first wave: no bonus'); assert.equal(g.wave, 1);
  while (g.queue.length) g.step(STEP);
  const c = g.credits, b = g.callWave();
  assert.ok(b >= EARLY.base, `bonus ${b}`); assert.equal(g.credits, c + b); assert.equal(g.wave, 2);
});

test('stars from core HP; continue caps at 1 star', () => {
  assert.equal(starsFor(20, false), 3); assert.equal(starsFor(18, false), 3); assert.equal(starsFor(12, false), 2); assert.equal(starsFor(3, false), 1); assert.equal(starsFor(20, true), 1);
});

test('rewarded continue works once', () => {
  const g = new Game(MAPS[0]); g.callWave(); g.hp = 0; g.state = 'lost';
  assert.ok(g.continueRun(10)); assert.equal(g.hp, 10); assert.equal(g.state, 'wave');
  g.state = 'lost'; assert.equal(g.continueRun(10), false);
});

test('trial: endless stops after wave 10', () => {
  const r = play(ENDLESS_MAP, { skill: 1, stopAfter: TRIAL.endlessWave });
  assert.equal(r.state, 'trialEnd'); assert.equal(r.wave, TRIAL.endlessWave);
});

test('waveSpec deterministic, bosses every 10 + final wave', () => {
  for (const m of ALL) for (let n = 1; n <= 30; n++) assert.deepEqual(waveSpec(n, m), waveSpec(n, m));
  assert.ok(isBossWave(10, ENDLESS_MAP) && isBossWave(20, ENDLESS_MAP) && !isBossWave(9, ENDLESS_MAP));
  assert.ok(isBossWave(12, MAPS[7]) && isBossWave(10, MAPS[7]) && !isBossWave(11, MAPS[7]), 'boss every 10 + final campaign wave');
  assert.ok(waveSpec(10, MAPS[0]).groups.some((g) => g.type === 'boss'));
});

test('endless never ends: hp keeps rising, no final wave', () => {
  assert.equal(ENDLESS_MAP.waves, Infinity);
  let prev = 0; for (const n of [1, 10, 30, 60, 100, 200, 400]) { const h = hpMul(n, ENDLESS_MAP); assert.ok(h > prev, `wave ${n}`); prev = h; }
  const g = new Game(ENDLESS_MAP); g.wave = 500; assert.ok(g.canCallWave());
});

test('autopilot (skill 0.8) beats every campaign map', () => {
  for (const m of MAPS) { const r = play(m, { skill: 0.8 }); assert.equal(r.state, 'won', `map ${m.id}: ${JSON.stringify(r)}`); assert.ok(r.t > 120 && r.t < 480, `map ${m.id} session ${r.t.toFixed(0)}s`); }
});
