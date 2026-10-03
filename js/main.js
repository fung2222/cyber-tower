// NEON BASTION 霓虹堡壘 — controller: states, campaign / endless, radial build menu, tower panel, HUD, camera,
// CYBER ARCADE hub hooks (?hub=1&tier&ads&trial&trialLeft&ret), ad hooks, autopilot demo / attract.
import * as THREE from 'three';
import { i18n, t, flags, createStore, createStage, ThemeController, U, Particles, Shockwaves, FxState, NeonCity, createInput, CyberUI, Platform, createAds } from 'cyber-kit';
import { GAME_ID, MAPS, ENDLESS_MAP, mapById, TOWERS, TOWER_ORDER, ENEMIES, CONTINUE_HP, TRIAL, STEP, GRID, starsFor, cellPos, ADS } from './config.js';
import './strings.js';
import { Game } from './logic.js';
import { createAI } from './ai.js';
import { View } from './view.js';
import { TowerAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
// CYBER ARCADE hub launch params (see cyber-arcade docs/MONETIZATION.md §8). Without ?hub=1 the web build is the full free game.
const ENT = (() => { try { return JSON.parse(localStorage.getItem('cyber.entitlement') || 'null'); } catch { return null; } })();   // written by the hub
const HUB = { on: Q.get('hub') === '1', tier: Q.get('tier') || ENT?.tier || 'free', ads: Q.get('ads'), trial: Q.get('trial') === '1', trialLeft: Q.get('trialLeft'), ret: Q.get('ret') };
// launched by the hub without an explicit ads param: fall back to the cached entitlement (Free tier → ads=1, paid → ads=0)
if (HUB.on && HUB.ads == null && ENT?.tier) HUB.ads = ENT.tier === 'free' ? '1' : '0';
// Interstitial (game over only) runs ONLY when the launch URL says ads=1 (a Free player in the hub). ads=0 / no param → never.
// (?adsim=1 forces the simulated flow for testing; a future standalone native build without the hub may opt in via Platform.isNative.)
const ADS_ON = HUB.ads === '1' || (!HUB.on && (flags.adsim || Platform.isNative));
// Web stub: when ads=1 we show cyber-kit's simulated ad overlays (same as ?adsim=1) so the flow is testable without AdMob.
const AD_FLAGS = { adsim: flags.adsim || HUB.ads === '1', debug: flags.debug };
const store = createStore(GAME_ID);
if (flags.reset) store.clear();
const ui = new CyberUI({ screens: ['start', 'maps', 'pause', 'over', 'win', 'trial'] });
const stage = createStage({ canvas: $('scene'), bloom: 0.85, bloomRadius: 0.45, bloomThreshold: 0.8, fov: 40, exposure: 1.05, onFatal: (m) => ui.fatal(m) });
const { scene, camera } = stage;
const theme = new ThemeController(); theme.set(1, true);
const city = new NeonCity(stage, { floor: 'plain', floorY: -0.6, innerRadius: 10.5, buildings: 240, billboard: { zh: '霓虹堡壘', en: 'N E O N   B A S T I O N', pos: [0, 13, -20], width: 20 }, dustArea: 12, dustHeight: 5 });
// keep the camera corridor clear: the high portrait camera sits at z ≈ +17, so tall towers / signs in the front half of the city
// (random per load) could hide the board. Flatten those buildings to low-rise blocks and drop their signs.
(function clearSightline() {
  const inZone = (x, z, pad = 0) => z > -3 - pad && Math.abs(x) < 17 + pad;
  const m = city.city, m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  if (m) {
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, m4); m4.decompose(p, q, sc);
      if (inZone(p.x, p.z + sc.z / 2, sc.x / 2) && sc.y > 3) { sc.y = 1.5 + Math.random() * 2; m4.compose(p, q, sc); m.setMatrixAt(i, m4); }
    }
    m.instanceMatrix.needsUpdate = true;
  }
  for (const b of city.nearBuildings || []) if (inZone(b.x, b.z + b.d / 2, b.w / 2)) b.h = Math.min(b.h, 3.5);
  city.group.children.forEach((o) => { if (o !== m && o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' && o.position.y > 2 && inZone(o.position.x, o.position.z, 2)) o.visible = false; });
})();
const view = new View(stage);
const particles = new Particles(scene, 2600, { floorY: 0.02 });
stage.onResize((w, h, pr) => particles.resize(h, pr));
const waves = new Shockwaves(scene, 16);
const fx = new FxState();
const audio = new TowerAudio(store); ui.setMuted(audio.muted);
// ?adfast=1 (tests only): drop the launch grace / cooldown / break counter so the game-over interstitial stub shows on the first break
const AD_CAPS = flags.get('adfast') === '1' ? { graceSec: 0, interstitialCooldownSec: 0, breaksBetweenInterstitials: 1 } : {};
const ads = createAds({ gameId: GAME_ID, ...ADS, ...AD_CAPS, flags: AD_FLAGS, onAdOpen: (on) => audio.duckAll(on) });

const S = { state: 'attract', demo: !!flags.demo, game: null, mapId: 1, speed: store.getNum('speed', 1) === 2 ? 2 : 1, ai: null, sel: null, t: 0, runT: 0, seen: new Set(), newRecord: false, endT: 0, hub: HUB };
window.__td = S;   // test hook

// ---------------------------------------------------------------- progress
const stars = () => store.getJSON('stars', {}) || {};
function setStars(id, n) { const s = stars(); if ((s[id] || 0) < n) { s[id] = n; store.setJSON('stars', s); } }
const totalStars = () => Object.values(stars()).reduce((a, b) => a + b, 0);
const trialLocked = (id) => HUB.trial && id > TRIAL.maps;
const unlocked = (id) => id === 0 || id === 1 || (stars()[id - 1] || 0) > 0 || flags.get('unlockall') === '1';
const mapName = (m) => (i18n.isZh() ? m.zh : m.en);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

// ---------------------------------------------------------------- game setup
function newGame(mapId, { attract = false } = {}) {
  const map = mapById(mapId);
  S.mapId = mapId;
  S.game = new Game(map, { stopAfter: map.endless && HUB.trial && !attract && !S.demo ? TRIAL.endlessWave : undefined });
  view.setMap(S.game); theme.set(map.theme);
  S.seen = new Set(['runner']); S.runT = 0; S.endT = 0; closeRadial();
  S.ai = attract || S.demo ? createAI({ skill: 0.8 }) : null;
  frameCamera(0, 0, true); updateHUD();
}
function startRun(mapId) {
  if (trialLocked(mapId)) { showTrial('map'); return; }
  audio.init(); audio.startMusic(); audio.unduckMusic();
  newGame(mapId); setState('playing'); audio.confirm();
  const m = mapById(mapId);
  ui.banner(mapName(m), m.endless ? t('endless') : t('wavesN', { n: m.waves }), S.demo ? '' : t('firstHint'));
}
function attract() { const ids = [1, 2, 3, 4, 5, 6, 7, 8]; newGame(ids[Math.floor(Math.random() * ids.length)], { attract: true }); }
function setState(s) {
  S.state = s;
  ui.show({ attract: 'start', maps: 'maps', paused: 'pause', over: 'over', win: 'win', trial: 'trial' }[s] || null);
  ui.hud(s === 'playing' || s === 'paused' || s === 'over' || s === 'win' || s === 'trial' || s === 'dying');
  $('demo-tag').classList.toggle('hidden', !S.demo);
  if (s !== 'playing') { closeRadial(); const tEl = document.querySelector('.ck-toast'); if (tEl) tEl.classList.add('hidden'); }
  updateHUD();
}
function showStart() {
  if (S.state !== 'maps') attract();
  setState('attract'); refreshStart(); audio.duckMusic && audio.unduckMusic();
}
function refreshStart() {
  ui.setText('start-best', fmt(store.best)); ui.setText('start-wave', store.getNum('bestWave', 0) || '—'); ui.setText('start-stars', `★ ${totalStars()}/24`);
  const tn = $('start-trial'); tn.classList.toggle('hidden', !HUB.trial);
  if (HUB.trial) tn.textContent = HUB.trialLeft != null ? t('trialNote', { n: HUB.trialLeft }) : t('trialNoteBare');
}
function showMaps() { renderMaps(); setState('maps'); }
function renderMaps() {
  const s = stars(), grid = $('map-grid');
  const card = (m) => {
    const locked = !unlocked(m.id), tl = trialLocked(m.id), st = s[m.id] || 0;
    const starHtml = m.endless ? `<div class="mw">${t('bestWave')} ${store.getNum('bestWave', 0) || '—'} · ${t('best')} ${fmt(store.best)}</div>` : `<div class="st">${[1, 2, 3].map((i) => `<span class="${i <= st ? 'on' : ''}">★</span>`).join('')}</div>`;
    return `<button class="map-card${locked ? ' locked' : ''}${tl ? ' trial' : ''}${m.endless ? ' endless' : ''}" data-map="${m.id}">
      ${tl ? `<span class="lock">🔒 ${t('trialLock')}</span>` : locked ? `<span class="lock">🔒</span>` : ''}
      <div class="no">${m.endless ? '∞' : m.id}</div><div class="mn">${mapName(m)}</div><div class="me">${i18n.isZh() ? m.en : m.zh}</div>
      <div class="mw">${m.endless ? t('endlessS') : t('wavesN', { n: m.waves })}</div>${starHtml}</button>`;
  };
  grid.innerHTML = MAPS.map(card).join('') + card(ENDLESS_MAP);
  grid.querySelectorAll('[data-map]').forEach((b) => b.addEventListener('click', () => {
    const id = +b.dataset.map; audio.init();
    if (trialLocked(id)) { showTrial('map'); return; }
    if (!unlocked(id)) { audio.denied(); ui.toast(t('locked')); return; }
    startRun(id);
  }));
}

// ---------------------------------------------------------------- HUD
function updateHUD() {
  const g = S.game; if (!g) return;
  ui.setText('hud-hp', Math.max(0, Math.ceil(g.hp)));
  $('hud-hpbar').style.width = (Math.max(0, g.hp / g.maxHp) * 100).toFixed(0) + '%';
  $('hud-hpbar').parentElement.classList.toggle('low', g.hp <= 5);
  ui.setText('hud-cr', fmt(g.credits));
  ui.setText('hud-wave', g.map.endless ? `${g.wave}` : `${g.wave}/${g.maxWave}`);
  ui.setText('hud-score', fmt(g.score));
  const bosses = g.enemies.filter((e) => e.type === 'boss');
  $('boss-bar').classList.toggle('hidden', !bosses.length);
  if (bosses.length) { const hp = bosses.reduce((a, e) => a + Math.max(0, e.hp), 0), mx = bosses.reduce((a, e) => a + e.maxHp, 0); $('boss-fill').style.width = (hp / mx * 100).toFixed(1) + '%'; }
  const sp = $('btn-speed'); ui.setText(sp, S.speed + '×'); sp.classList.toggle('fast', S.speed === 2);
  const tt = $('trial-tag'); tt.classList.toggle('hidden', !HUB.trial || S.state === 'attract' || S.state === 'maps');
  if (HUB.trial) tt.textContent = g.map.endless ? `${t('trialNoteBare')} · ${t('waveN', { n: TRIAL.endlessWave })}` : t('trialNoteBare');
  updateWaveBtn(); refreshRadial();
}
function updateWaveBtn() {
  const g = S.game, b = $('btn-wave'); if (!g) return;
  let main, sub, can = g.canCallWave() && S.state === 'playing' && !S.demo, go = false;
  if (g.state === 'build') { main = t('startWave', { n: 1 }); sub = t('startWaveS'); go = true; }
  else if (g.canCallWave() && g.countdown != null) { main = t('nextIn', { s: Math.ceil(g.countdown) }); sub = t('callEarly', { b: g.earlyBonus() }); }
  else if (g.canCallWave()) { main = t('callEarly', { b: g.earlyBonus() }); sub = t('callEarlyS'); }
  else { main = t('waveRunning', { n: g.wave }); sub = t('waveRunningS'); can = false; }
  ui.setText('wave-main', main); ui.setText('wave-sub', sub); b.disabled = !can; b.classList.toggle('go', go && can);
}
function callWave() {
  const g = S.game; if (!g || S.state !== 'playing' || S.demo || !g.canCallWave()) return;
  const bonus = g.callWave(); audio.init();
  if (bonus) { ui.toast('+' + bonus + ' · ' + t('callEarlyS'), 1200); audio.coin(); }
  updateHUD();
}

// ---------------------------------------------------------------- radial menus
const ICON = {
  laser: '<svg viewBox="0 0 24 24"><path d="M12 3l5 9-5 9-5-9z"/><path d="M12 7v10"/></svg>',
  cryo: '<svg viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 3 3-3M9 20l3-3 3 3"/></svg>',
  missile: '<svg viewBox="0 0 24 24"><path d="M12 2c3 3 4 7 3 12H9C8 9 9 5 12 2z"/><path d="M9 14l-3 4h4M15 14l3 4h-4M11 18h2v3h-2z"/></svg>',
  tesla: '<svg viewBox="0 0 24 24"><path d="M13 2L5 13h6l-2 9 9-12h-6z"/></svg>',
  overclock: '<svg viewBox="0 0 24 24"><path d="M6 13l6-6 6 6M6 19l6-6 6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M5 14l7-7 7 7M5 20l7-7 7 7"/></svg>',
  sell: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-1-2-1.5-3.2-1.5-1.7 0-3 .9-3 2.3 0 3.2 6.4 1.7 6.4 5 0 1.4-1.4 2.4-3.2 2.4-1.3 0-2.6-.6-3.3-1.6M12 5v2M12 17v2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>',
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function towerStats(type, L) {
  const d = TOWERS[type], i = L - 1, parts = [];
  if (d.dmg) parts.push(`${t('sDmg')} <b>${d.dmg[i]}</b>`);
  if (d.range) parts.push(`${t('sRange')} <b>${d.range[i]}</b>`);
  if (d.rate && type !== 'cryo') parts.push(`${t('sRate')} <b>${d.rate[i]}/s</b>`);
  if (d.slow) parts.push(`${t('sSlow')} <b>${Math.round(d.slow[i] * 100)}%</b>`);
  if (d.chain) parts.push(`${t('sChain')} <b>${d.chain[i]}</b>`);
  if (d.buffDmg) parts.push(`${t('sBuff')} <b>+${Math.round(d.buffDmg[i] * 100)}%</b>`);
  return parts.join(' · ');
}
function placeRadial(c, r) {
  const p = view.screenOf(c, r, 0.2), R = Math.min(84, innerWidth * 0.19), m = R + 40;
  const x = Math.max(m, Math.min(innerWidth - m, p.x)), y = Math.max(m + 70, Math.min(innerHeight - m - 70, p.y));
  const el = $('radial'); el.style.left = x + 'px'; el.style.top = y + 'px'; el.classList.remove('hidden');
  return R;
}
function openBuild(c, r) {
  const g = S.game; S.sel = { kind: 'pad', c, r };
  view.select({ c, r });
  const R = placeRadial(c, r);
  $('radial').innerHTML = TOWER_ORDER.map((type, i) => {
    const a = -Math.PI / 2 + (i / TOWER_ORDER.length) * Math.PI * 2, x = Math.cos(a) * R, y = Math.sin(a) * R;
    return `<button class="rb" data-build="${type}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--tc:${hex(TOWERS[type].color)}" title="${t('tw.' + type)} — ${t('td.' + type)}">${ICON[type]}<b>${TOWERS[type].cost[0]}</b><span class="nm">${t('tw.' + type)}</span></button>`;
  }).join('') + `<button class="rb close" data-close style="left:0;top:0">${ICON.close}</button>`;
  bindRadial(); refreshRadial(); audio.click();
}
function openTower(tw) {
  S.sel = { kind: 'tower', id: tw.id, c: tw.c, r: tw.r };
  const d = TOWERS[tw.type];
  view.select({ c: tw.c, r: tw.r, range: d.range[tw.level - 1], color: d.color });
  const R = placeRadial(tw.c, tw.r), up = S.game.upgradeCost(tw);
  const p = view.screenOf(tw.c, tw.r, 0.2), below = p.y < innerHeight * 0.5;
  $('radial').innerHTML = `
    <button class="rb" data-up style="left:${(R * 0.75).toFixed(0)}px;top:${(-R * 0.62).toFixed(0)}px;--tc:${hex(d.color)}">${ICON.up}<b>${up == null ? t('maxed') : up}</b><span class="nm">${t('upgrade')}</span></button>
    <button class="rb" data-sell style="left:${(-R * 0.75).toFixed(0)}px;top:${(-R * 0.62).toFixed(0)}px;--tc:#ff8aa5">${ICON.sell}<b>+${S.game.sellValue(tw)}</b><span class="nm">${t('sell')}</span></button>
    <button class="rb close" data-close style="left:0;top:0">${ICON.close}</button>
    <div class="rinfo" style="left:0;top:${below ? R * 0.55 : -R * 1.62 - 40}px;--tc:${hex(d.color)}"><h4>${t('tw.' + tw.type)} · ${t('lvl', { n: tw.level })}</h4>${towerStats(tw.type, tw.level)}<br><i>${t('td.' + tw.type)} · ${t('sKills')} ${tw.kills}</i></div>`;
  bindRadial(); refreshRadial(); audio.click();
}
function bindRadial() {
  const el = $('radial');
  el.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); doBuild(b.dataset.build); }));
  el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); doUpgrade(); }));
  el.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); doSell(); }));
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); closeRadial(); audio.back(); }));
}
function refreshRadial() {
  const g = S.game; if (!g || !S.sel) return;
  $('radial').querySelectorAll('[data-build]').forEach((b) => b.classList.toggle('dis', g.credits < TOWERS[b.dataset.build].cost[0]));
  const up = $('radial').querySelector('[data-up]');
  if (up) { const tw = selTower(); const c = tw ? g.upgradeCost(tw) : null; up.classList.toggle('dis', c == null || g.credits < c); }
}
function selTower() { const g = S.game; return S.sel && S.sel.kind === 'tower' ? [...g.towers.values()].find((x) => x.id === S.sel.id) || null : null; }
function closeRadial() { S.sel = null; $('radial').classList.add('hidden'); $('radial').innerHTML = ''; view.select(null); }
function doBuild(type) {
  const g = S.game, s = S.sel; if (!s || s.kind !== 'pad') return;
  if (g.credits < TOWERS[type].cost[0]) { audio.denied(); ui.toast(t('noCredits'), 900); return; }
  const tw = g.build(type, s.c, s.r); if (!tw) { audio.denied(); return; }
  Platform.haptic('light'); openTower(tw); updateHUD();
}
function doUpgrade() {
  const g = S.game, tw = selTower(); if (!tw) return;
  const c = g.upgradeCost(tw); if (c == null) return;
  if (g.credits < c) { audio.denied(); ui.toast(t('noCredits'), 900); return; }
  if (g.upgrade(tw)) { Platform.haptic('medium'); openTower(tw); updateHUD(); }
}
function doSell() { const g = S.game, tw = selTower(); if (!tw) return; g.sell(tw); Platform.haptic('light'); closeRadial(); updateHUD(); }

// ---------------------------------------------------------------- events → effects
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function handleEvents(evs, quiet = false) {
  const loud = S.state === 'playing' && !quiet, g = S.game;
  for (const ev of evs) {
    switch (ev.k) {
      case 'build': if (quiet) break; waves.spawn(V3(ev.t.x, 0.05, ev.t.z), new THREE.Color(TOWERS[ev.t.type].color), { r0: 0.2, r1: 1.1, h: 0.4, dur: 0.45 }); particles.ring(V3(ev.t.x, 0.1, ev.t.z), new THREE.Color(TOWERS[ev.t.type].color), 30, 3, 0.1); if (loud) audio.build(); break;
      case 'upgrade': if (quiet) break; particles.burst(V3(ev.t.x, 0.4, ev.t.z), new THREE.Color(TOWERS[ev.t.type].color), 40, { speed: 2, up: 5, life: 0.7, size: 0.8, grav: -2 }); if (loud) audio.upgrade(); break;
      case 'sell': if (quiet) break; particles.burst(V3(ev.t.x, 0.3, ev.t.z), new THREE.Color(0xfff35c), 24, { speed: 3, up: 3, life: 0.5, size: 0.6 }); if (loud) audio.sell(); break;
      case 'beam': if (quiet) break; view.beam(view.muzzle(ev.t), V3(ev.x, ev.fly ? 0.9 : 0.3, ev.z), TOWERS.laser.color, 0.05 + ev.t.level * 0.012); view.beam(view.muzzle(ev.t), V3(ev.x, ev.fly ? 0.9 : 0.3, ev.z), 0xffffff, 0.018); if (loud) audio.laser(); break;
      case 'pulse': if (quiet) break; waves.spawn(V3(ev.t.x, 0.1, ev.t.z), new THREE.Color(TOWERS.cryo.color), { r0: 0.2, r1: ev.r, h: 0.25, dur: 0.4, a: 1.4 }); if (loud) audio.cryo(); break;
      case 'launch': if (loud) audio.launch(); break;
      case 'boom': if (quiet) break; particles.burst(V3(ev.x, 0.3, ev.z), new THREE.Color(0xff8a2b), 26, { speed: 4, up: 2, life: 0.45, size: 0.9, grav: 0, color2: new THREE.Color(0xfff35c) }); waves.spawn(V3(ev.x, 0.05, ev.z), new THREE.Color(0xff8a2b), { r0: 0.1, r1: ev.r, h: 0.3, dur: 0.3 }); if (loud) { audio.boom(); fx.kick({ trauma: 0.04 }); } break;
      case 'chain': if (quiet) break; view.zap(ev.pts.map(([x, z, f], i) => V3(x, i === 0 ? 0.98 * (1 + (ev.t.level - 1) * 0.09) : f ? 0.9 : 0.35, z)), TOWERS.tesla.color); if (loud) audio.tesla(); break;
      case 'kill': {
        const e = ev.e, big = e.type === 'boss' || e.type === 'tank';
        if (!quiet) { particles.burst(V3(e.x, e.flying ? 0.9 : 0.3, e.z), new THREE.Color(e.def.color), big ? 70 : 22, { speed: big ? 6 : 3.5, up: 2, life: big ? 1 : 0.55, size: big ? 1.2 : 0.7, grav: 0, color2: new THREE.Color(0xffffff) }); if (big) waves.spawn(V3(e.x, 0.05, e.z), new THREE.Color(e.def.color), { r0: 0.2, r1: e.type === 'boss' ? 3 : 1.2, h: 0.5, dur: 0.5 }); }
        if (loud) { audio.pop(big); if (e.type === 'boss') { fx.kick({ trauma: 0.5, aberr: 1, slowmo: 0.5 }); ui.flash('rgba(166,107,255,0.4)', 400); Platform.haptic('success'); } if (e.reward >= 10) { const sp = stage.toScreen(V3(e.x, 0.8, e.z)); ui.popup(sp.x, sp.y, '+' + e.reward); } }
        break;
      }
      case 'shieldBreak': if (quiet) break; particles.burst(V3(ev.e.x, 0.4, ev.e.z), new THREE.Color(0x7fd8ff), 18, { speed: 3, up: 1, life: 0.4, size: 0.6 }); if (loud) audio.shieldBreak(); break;
      case 'leak': view.coreFlash = 1; if (!quiet) { waves.spawn(V3(g.corePos[0], 0.1, g.corePos[1]), new THREE.Color(0xff3b5c), { r0: 0.3, r1: 2, h: 0.6, dur: 0.5 }); } if (loud) { fx.kick({ trauma: 0.35, aberr: 0.9, glitch: 0.3 }); ui.flash('rgba(255,40,90,0.35)', 300); audio.leak(); Platform.haptic('heavy'); } break;
      case 'spawn':
        if (!S.seen.has(ev.e.type) && ev.e.type !== 'mini') { S.seen.add(ev.e.type); if (loud && ev.e.type !== 'boss') ui.toast(`${t('newEnemy', { name: t('en.' + ev.e.type) })} — ${t('eh.' + ev.e.type)}`, 2600); }
        break;
      case 'wave':
        if (loud) {
          const fin = !g.map.endless && ev.n === g.maxWave;
          if (ev.boss) { ui.banner(t('bossIncoming'), t('waveN', { n: ev.n }), fin ? t('finalWave') : t('warning')); fx.kick({ glitch: 0.5, aberr: 1 }); }
          else ui.banner(t('waveN', { n: ev.n }), g.map.endless ? '' : `${ev.n} / ${g.maxWave}`, fin ? t('finalWave') : '');
          audio.wave(ev.boss);
        }
        break;
      case 'clear':
        if (loud) {
          if (ev.milestone) { ui.banner(t('milestone', { n: ev.milestone }), t('milestoneS', { pts: fmt(1000 * ev.milestone / 10) }), ''); theme.set(g.map.theme + ev.milestone / 10); audio.levelUp ? audio.levelUp() : audio.win(); }
          else ui.toast(t('cleared', { bonus: ev.bonus, i: ev.interest }), 1500);
          audio.coin();
        }
        break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------- end states
function checkEnd() {
  const g = S.game; if (!g || S.state !== 'playing') return;
  if (g.state === 'lost') onLose(); else if (g.state === 'won') onWin(); else if (g.state === 'trialEnd') onTrialEnd();
}
function recordEndless() { const g = S.game; if (!g.map.endless || S.demo) return false; store.setNum('bestWave', Math.max(store.getNum('bestWave', 0), g.wave)); return store.submitBest(g.score); }
function onLose() {
  const g = S.game; S.state = 'dying'; closeRadial();
  fx.kick({ slowmo: 0.9, glitch: 1, trauma: 0.6 }); audio.fail(); audio.duckMusic();
  particles.burst(V3(g.corePos[0], 0.7, g.corePos[1]), new THREE.Color(0xff2bd6), 120, { speed: 7, up: 4, life: 1.2, size: 1.3, grav: 0, color2: new THREE.Color(0x00e5ff) });
  setTimeout(() => {
    if (S.demo) { startRun(nextDemoMap()); return; }
    S.newRecord = recordEndless();
    ui.setText('over-wave', g.wave); ui.setText('over-score', fmt(g.score)); ui.setText('over-kills', g.kills); ui.setText('over-best', fmt(g.map.endless ? store.best : g.score));
    $('newrecord').classList.toggle('hidden', !S.newRecord);
    $('btn-revive').classList.toggle('hidden', g.continued || !ads.rewardedAvailable());
    reviveText(); setState('over');
  }, 1200);
}
function reviveText() { ui.setText('revive-main', t('revive', { hp: CONTINUE_HP })); ui.setText('revive-sub', t(ads.isNative || AD_FLAGS.adsim ? 'reviveAd' : 'reviveFree')); }
async function revive() {
  const g = S.game; if (S.state !== 'over' || g.continued) return; audio.click();
  const r = await ads.rewarded('continue'); if (!r.rewarded) { ui.toast(t('noReward')); return; }
  for (const e of g.enemies) if (g.progress(e) > 0.8) e.alive = false;   // EMP clears the enemies at the gate
  g.enemies = g.enemies.filter((e) => e.alive);
  g.continueRun(CONTINUE_HP); setState('playing'); audio.unduckMusic(); ui.banner(t('revived'), '', ''); view.coreFlash = 1; updateHUD();
}
function onWin() {
  const g = S.game; S.state = 'dying'; closeRadial();
  const st = starsFor(g.hp, g.continued);
  if (!S.demo) setStars(g.map.id, st);
  audio.win(); fx.kick({ aberr: 0.8 }); ui.flash('rgba(255,243,92,0.3)', 500); Platform.haptic('success');
  setTimeout(() => {
    if (S.demo) { startRun(nextDemoMap()); return; }
    ui.setText('win-map', `${g.map.id} · ${mapName(g.map)}`);
    $('win-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= st ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`).join('');
    ui.setText('win-hp', `${g.hp}/${g.maxHp}`); ui.setText('win-score', fmt(g.score)); ui.setText('win-kills', g.kills);
    const s = Math.floor(S.runT); ui.setText('win-time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    const last = g.map.id >= MAPS.length; $('win-all').classList.toggle('hidden', !last);
    $('btn-next').classList.toggle('hidden', last);
    setState('win');
  }, 1300);
}
function onTrialEnd() { recordEndless(); showTrial('endless'); }
function showTrial(kind) {
  closeRadial();
  $('trial-text').textContent = kind === 'endless' ? t('trialEndless', { n: TRIAL.endlessWave }) : t('trialMap');
  S.trialKind = kind; setState('trial'); audio.duckMusic();
}
function returnToHub() {
  // back to the CYBER ARCADE hub's unlock screen. `ret` must be same-origin (no open redirect).
  try { if (HUB.ret) { const u = new URL(HUB.ret, location.href); if (u.origin === location.origin) { u.searchParams.set('store', '1'); S.lastReturn = u.toString(); location.href = u.toString(); return; } } } catch { /* ignore */ }
  if (HUB.on && history.length > 1) { history.back(); return; }
  ui.toast(t('noHub'), 2200);
}
let demoIdx = 0;
const LEVEL = (() => { const v = flags.raw.get('level'); const n = v == null || v === '' ? NaN : +v; return Number.isInteger(n) && (n === 0 || MAPS.some((m) => m.id === n)) ? n : null; })();   // ?level=0 = endless
function nextDemoMap() { return LEVEL != null ? LEVEL : [1, 3, 6, 0][demoIdx++ % 4]; }
async function adBreak() { if (!ADS_ON) return false; S.adBreaks = (S.adBreaks || 0) + 1; return ads.naturalBreak('gameover'); }   // the ONLY interstitial placement
async function retry() { if (S.state !== 'over') return; audio.click(); await adBreak(); startRun(S.mapId); }
async function overToMenu() { if (S.state !== 'over') return; await adBreak(); showStart(); }
function pause() { if (S.state !== 'playing' || S.demo) return; closeRadial(); setState('paused'); audio.duckMusic(); audio.back(); }
function resume() { if (S.state !== 'paused') return; setState('playing'); audio.unduckMusic(); audio.click(); }
function toggleSpeed() { S.speed = S.speed === 1 ? 2 : 1; store.setNum('speed', S.speed); audio.click(); ui.toast(t(S.speed === 2 ? 'speed2' : 'speed1'), 800); updateHUD(); }

// ---------------------------------------------------------------- input
const cv = $('scene'); let down = null;
cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
cv.addEventListener('pointerup', (e) => {
  if (!down || e.pointerId !== down.id) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (d > 16 || dt > 700) return; onTap(e.clientX, e.clientY);
});
function onTap(x, y) {
  if (S.state !== 'playing' || S.demo) return;
  const g = S.game, cell = view.cellAt(x, y);
  if (!cell) { closeRadial(); return; }
  const [c, r] = cell, tw = g.towerAt(c, r);
  if (S.sel && S.sel.c === c && S.sel.r === r) { closeRadial(); return; }
  if (tw) openTower(tw); else if (g.isPad(c, r)) openBuild(c, r); else closeRadial();
}
createInput({
  anyGesture() { audio.init(); audio.startMusic(); },
  action(a) {
    if (ui.modalOpen) { if (a === 'pause') ui.closeModal(); return; }
    if (a === 'primary') { if (S.state === 'attract') showMaps(); else if (S.state === 'playing') callWave(); else if (S.state === 'paused') resume(); else if (S.state === 'over') retry(); else if (S.state === 'win') nextMap(); }
    else if (a === 'pause') { if (S.sel) { closeRadial(); return; } if (S.state === 'playing') pause(); else if (S.state === 'paused') resume(); else if (S.state === 'maps') showStart(); }
    else if (a === 'mute') { audio.init(); ui.setMuted(audio.toggleMute()); }
    else if (a === 'restart') { if (S.state === 'over') retry(); else if (S.state === 'paused') startRun(S.mapId); }
    else if (a === 'fps') { if (S.state === 'playing') toggleSpeed(); }
    else if (a.startsWith('b') && S.state === 'playing') { const type = TOWER_ORDER[+a.slice(1)]; if (S.sel && S.sel.kind === 'pad') doBuild(type); }
    else if (a === 'up' && S.state === 'playing') doUpgrade();
    else if (a === 'sell' && S.state === 'playing') doSell();
  },
}, { actions: { Digit1: 'b0', Digit2: 'b1', Digit3: 'b2', Digit4: 'b3', Digit5: 'b4', KeyU: 'up', KeyX: 'sell', KeyF: 'fps' } });
function nextMap() { if (S.state !== 'win') return; const id = S.mapId + 1; if (id > MAPS.length) { showStart(); return; } if (trialLocked(id)) { showTrial('map'); return; } startRun(id); }
ui.on('btn-campaign', () => { audio.init(); showMaps(); });
ui.on('btn-endless', () => { audio.init(); startRun(0); });
ui.on('btn-maps-back', () => { audio.back(); showStart(); });
ui.on('btn-resume', resume); ui.on('btn-restart', () => startRun(S.mapId)); ui.on('btn-quit', () => { audio.back(); showStart(); });
ui.on('btn-pause', pause); ui.on('btn-speed', toggleSpeed); ui.on('btn-wave', callWave);
ui.on('btn-mute', () => { audio.init(); ui.setMuted(audio.toggleMute()); });
ui.on('btn-retry', retry); ui.on('btn-menu', overToMenu); ui.on('btn-revive', revive);
ui.on('btn-next', nextMap); ui.on('btn-win-retry', () => startRun(S.mapId)); ui.on('btn-win-menu', showStart);
ui.on('btn-unlock', returnToHub); ui.on('btn-trial-back', showStart);
i18n.bindToggle($('btn-lang')); i18n.bindToggle($('btn-lang2'));
i18n.onChange(() => { refreshStart(); if (S.state === 'maps') renderMaps(); if (S.state === 'over') reviveText(); if (S.state === 'trial') $('trial-text').textContent = S.trialKind === 'endless' ? t('trialEndless', { n: TRIAL.endlessWave }) : t('trialMap'); if (S.sel) { const tw = selTower(); if (tw) openTower(tw); else if (S.sel.kind === 'pad') openBuild(S.sel.c, S.sel.r); } updateHUD(); });
Platform.onBack(() => { if (ui.closeModal()) return true; if (S.sel) { closeRadial(); return true; } if (S.state === 'playing') { pause(); return true; } if (S.state === 'paused') { resume(); return true; } if (S.state === 'over') { overToMenu(); return true; } if (S.state === 'maps' || S.state === 'win' || S.state === 'trial') { showStart(); return true; } return false; });
Platform.onPause(() => { if (!S.demo) pause(); });

// test API (tests/smoke.py)
S.api = {
  ff(sec) { const g = S.game; const n = Math.round(sec / STEP); for (let i = 0; i < n && g.active(); i++) { if (S.ai) S.ai(g, STEP); g.step(STEP); handleEvents(g.drainEvents(), true); } S.runT += sec; checkEnd(); updateHUD(); return { wave: g.wave, hp: g.hp, state: g.state }; },
  tap(c, r) { const p = view.screenOf(c, r, 0.05); onTap(p.x, p.y); return p; },
  screenOf: (c, r) => view.screenOf(c, r, 0.05), pads: () => S.game.L.pads, autopilot(on = true) { S.ai = on ? createAI({ skill: 0.8 }) : null; },
  lose() { const g = S.game; g.hp = 1; g.continued = g.continued || false; const e = g.spawn('runner', g.wave || 1); e.s = g.len - 0.01; },
  win() { const g = S.game; g.wave = g.maxWave; g.queue = []; g.enemies = []; g.countdown = null; g.state = 'wave'; },
  wave(n) { const g = S.game; g.wave = n - 1; g.queue = []; g.enemies = []; g.countdown = null; g.state = 'wave'; g.startWave(); },
  money(n) { S.game.credits = n; updateHUD(); },
  cam() { return { pos: camera.position.toArray().map((v) => +v.toFixed(2)), tP: tP.toArray().map((v) => +v.toFixed(2)), tL: tL.toArray().map((v) => +v.toFixed(2)), fov: camera.fov, aspect: camera.aspect }; },
  settled() { return camPos.distanceTo(tP) < 0.02 && camLook.distanceTo(tL) < 0.02; },
  ads: () => ({ on: ADS_ON, sim: !!AD_FLAGS.adsim, breaks: S.adBreaks || 0, shown: ads.state.shown }),
  unlockAll() { for (const m of MAPS) setStars(m.id, 1); if (S.state === 'maps') renderMaps(); refreshStart(); },
};

// ---------------------------------------------------------------- camera
const fitCam = new THREE.PerspectiveCamera(40, 1, 0.1, 500), camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tP = new THREE.Vector3(), tL = new THREE.Vector3();
const HW = GRID.w / 2 + 0.3, HD = GRID.h / 2 + 0.3, PTS = [[-HW, 0, -HD], [HW, 0, -HD], [-HW, 0, HD], [HW, 0, HD], [-HW, 0.9, -HD], [HW, 0.9, -HD]].map((p) => new THREE.Vector3(...p));
function fitDistance(dir, look, lim) {
  fitCam.aspect = stage.width / stage.height; fitCam.updateProjectionMatrix();
  let lo = 4, hi = 80; const v = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    const d = (lo + hi) / 2; fitCam.position.copy(look).addScaledVector(dir, d); fitCam.lookAt(look); fitCam.updateMatrixWorld();
    let ok = true; for (const p of PTS) { v.copy(p).project(fitCam); if (Math.abs(v.x) > lim.x || v.y > lim.top || v.y < lim.bottom) { ok = false; break; } }
    if (ok) hi = d; else lo = d;
  }
  return hi;
}
function frameCamera(dt, now, instant = false) {
  const aspect = stage.width / stage.height, portrait = aspect < 0.9, menu = S.state === 'attract' || S.state === 'maps';
  const pitch = THREE.MathUtils.degToRad(portrait ? 60 : 54);
  const yaw = menu ? Math.sin(now * 0.12) * 0.22 : 0;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  tL.set(menu && !portrait ? -5.2 : 0, 0, menu && portrait ? HD + 2.4 : portrait ? 0.35 : 0.15);   // portrait menu: aim below the board so it sits above the hero panel
  const lim = portrait ? { x: 0.98, top: menu ? 0.9 : 0.74, bottom: menu ? 0.02 : -0.82 } : { x: menu ? 0.95 : 0.66, top: 0.86, bottom: -0.84 };
  const d = fitDistance(dir, tL, lim) * (menu && portrait ? 1.0 : 1);
  tP.copy(tL).addScaledVector(dir, d);
  const k = instant ? 1 : 1 - Math.exp(-dt * 3.5);
  camPos.lerp(tP, k); camLook.lerp(tL, k); camera.position.copy(camPos); camera.lookAt(camLook); fx.shake(camera, now, 0.5);
}

// ---------------------------------------------------------------- loop
function tick(rawDt, time) {
  const dt = rawDt * fx.timeScale; S.t += dt; U.uTime.value = time;
  theme.update(rawDt); fx.update(rawDt);
  const g = S.game; let simDt = 0;
  if (g && (S.state === 'playing' || S.state === 'attract' || S.state === 'maps' || S.state === 'dying')) {
    const sp = S.state === 'playing' ? (S.demo ? 2 : S.speed) : S.state === 'dying' ? 0.4 : 1.3;
    simDt = dt * sp;
    if (S.state !== 'dying') { if (S.ai) S.ai(g, simDt); g.update(simDt); handleEvents(g.drainEvents()); }
    if (S.state === 'playing') { S.runT += simDt; checkEnd(); updateHUD(); }
    else if ((S.state === 'attract' || S.state === 'maps') && !g.active()) { S.endT += rawDt; if (S.endT > 2) attract(); }
  }
  view.sync(g, simDt || rawDt * 0.25, time);
  particles.update(dt); waves.update(dt);
  frameCamera(rawDt, time); fx.applyPost(stage, time); ui.tick(rawDt);
  if (S.sel) { const p = view.screenOf(S.sel.c, S.sel.r, 0.2); if (p) { /* radial stays where it was opened; close if the tower vanished */ if (S.sel.kind === 'tower' && !selTower()) closeRadial(); } }
  stage.render(rawDt);
}
async function boot() {
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  if (S.demo) startRun(nextDemoMap());
  else if (flags.autostart) startRun(LEVEL != null ? LEVEL : 1);
  else { attract(); setState('attract'); refreshStart(); }
  frameCamera(0, 0, true); ui.loaded();
  stage.loop(tick, { isActive: () => S.state === 'playing' || S.state === 'attract', fpsEl: $('fps') });
  if (flags.fps) $('fps').classList.remove('hidden');
  ads.init().catch(() => {});
}
boot().catch((e) => { console.error(e); ui.fatal(t('fatal') + ': ' + e.message); });
