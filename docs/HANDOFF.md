# NEON BASTION 霓虹堡壘 — Handoff

Status: **web build done (v1.0, 2026-10-02)** · live https://fung2222.github.io/cyber-tower/ · `noindex` (not public yet) · not yet packaged for Android · CYBER ARCADE tier **Gold** (trial: maps 1–2 + endless to wave 10).
Series rules: `fung2222/cyber-arcade/docs/ARCADE-HANDOFF.md`. Written from scratch on cyber-kit v0.2.1 (`vendor/cyber-kit/`), no build step.

## 1. Design
- **Quick, relaxing commute sessions.** One campaign map ≈ 3–5 min at 1×, playable one-handed in portrait (also fine on desktop / landscape).
- **Board:** a tilted 3D neon city grid (9 × 13 cells). Viruses and drones flow along a glowing chevron **data path** from the spawn portal to the **core crystal**. Build **pads** (glowing squares) are generated next to the path; the rest of the grid is mini neon blocks.
- **Towers** (5 types × 3 levels; each level adds pips, L3 adds a halo; own SFX):
  | Tower | Role | Air? |
  |---|---|---|
  | 激光塔 Laser | fast single target, first-in-line | ✓ |
  | 冷凍脈衝 Cryo pulse | area pulse, slows 35/45/55 % for 1.6 s | ✓ |
  | 導彈塔 Missile | slow homing missiles, splash | ✗ ground only |
  | 電弧塔 Tesla | chain lightning 3/4/5 targets, ×2 vs shields | ✓ |
  | 超頻節點 Overclock | no attack: nearby towers +20/32/45 % dmg, +8/12/18 % fire rate | — |
- **Enemies:** runner (fast), tank (armor 5: flat damage reduction, min 25 % gets through), shield (regenerating shield; Tesla strips it ×2), splitter (splits into 3 minis), **drone** (flies a straight dashed line spawn → core, ignoring the path, so missiles can't hit it), **boss every 10 waves** and on every campaign map's final wave (boss bar, armor 4, leaks 6 core HP).
- **Economy:** credits per kill, wave-clear bonus (10 + 2n, max 50) and **interest** (6 % of banked credits per cleared wave, max 30). Core HP 20. **Speed 1×/2×.** After wave 1 the next wave auto-starts after a 5 s countdown; **call early** at any time once the current wave has finished spawning: bonus = 8 + 2 per second skipped.
- **Campaign:** 8 Hong Kong-named maps (旺角, 廟街, 中環, 九龍灣, 深水埗, 尖沙咀, 蘭桂坊, 太平山), 10/10/10/10/12/12/12/15 waves. **Stars:** 3★ = core ≥ 18, 2★ = ≥ 10, 1★ = cleared (a used continue caps at 1★). A map unlocks when the previous one has a star.
- **Endless 無限核心 INFINITE CORE:** a long spiral map, 24 pads; waves never end (no final wave). Milestone every 10 waves: +1000 × n/10 score, +3 core HP, banner. Saved best wave + best score.
- **Attract mode:** the autopilot plays a random campaign map behind the start/maps screens. `?demo=1` loops real AI runs on maps 1, 3, 6 and endless (`?demo=1&level=N` pins one map; `level=0` = endless).
- Progress (stars, best wave, best score, speed) is saved in localStorage. There is no mid-run save (runs are short).

## 2. Controls
| Action | Touch | Keyboard |
|---|---|---|
| Build | tap an empty pad → radial menu of 5 towers (greyed if you can't afford it) | tap pad, then 1–5 |
| Upgrade / sell | tap a tower → upgrade (cost) / sell (70 % refund) + info card with range ring | U / X |
| Close menu | tap the ✕ in the middle, the same cell, or empty ground | Esc |
| Start / call next wave | bottom-centre button | Space / Enter |
| Speed 1×/2× | bottom-left `1×` | F |
| Pause | ⏸ | P / Esc |
| Mute | 🔊 | M |
Android back: menu → pause → resume; game over → menu; maps/win/trial → start screen.

## 3. Tuning (`js/config.js`)
| Constant | Value |
|---|---|
| `GRID` / `STEP` | 9 × 13 cells / fixed 1/30 s simulation |
| `CORE_HP` / `CONTINUE_HP` / `SELL_REFUND` | 20 / +10 / 70 % |
| `INTEREST` / `EARLY` / `COUNTDOWN` | 6 % (max 30) / 8 + 2 per s / first wave waits, then 5 s |
| `TOWERS` cost per level | laser 50/45/90 · cryo 60/55/100 · missile 80/70/130 · tesla 90/80/150 · overclock 70/60/110 |
| `TOWERS` dmg | laser 7/12/21 @ 3.0–3.8/s · cryo 3/6/10 pulse · missile 32/58/100 splash 0.95–1.25 · tesla 13/22/36 chain falloff 0.82 |
| `ENEMIES` hp / speed (cells/s) | runner 26/2.4 · tank 110/1.0 (armor 5) · shield 45+45 shield/1.5 · splitter 60/1.2 → 3 × mini 16/2.4 · drone 30/1.2 (flying) · boss 950/0.65 (armor 4) |
| `hpMul(n)` campaign | `(1 + (diff−1)·min(1,(n−1)/8)) · (1 + 0.15k + 0.0095k²)`; map diff 1.0 → 2.0 |
| `hpMul(n)` endless | `1 + 0.16k + 0.0105k²·(1 − min(0.6, k/160))`: keeps rising, growth rate saturates (k = n−1) |
| `speedMul` / `rewardMul` | +1.2 %/wave, max +20 % (campaign) / +35 % (endless) · +3.5 %/wave, max +150 % |
| `bossMul` | `hpMul^0.8` (bosses stay killable) |
| `waveSpec(n, map)` | seeded (`mulberry32`), threat budget 7 + 2.6n (+0.8 per map), count growth capped after wave 60 in endless; types unlock: tank w3, splitter w4, drone w5, shield w6 (earlier on later maps); a new type debuts as the wave's first group |
| `TRIAL` | maps 1–2, endless stops after wave 10 |
| `ADS` | interstitial cooldown 180 s, every 2nd break, 120 s grace |

## 4. Balance (autopilot, `node tests/balance.mjs 0.8`, 1× sim time)
| Map | Waves | Result | Core left | ★ | Time |
|---|---|---|---|---|---|
| 1 旺角 | 10 | won | 20 | 3 | 3.1 min |
| 2 廟街 | 10 | won | 18 | 3 | 3.1 min |
| 3 中環 | 10 | won | 20 | 3 | 2.9 min |
| 4 九龍灣 | 10 | won | 18 | 3 | 5.2 min |
| 5 深水埗 | 12 | won | 6 | 1 | 4.6 min |
| 6 尖沙咀 | 12 | won | 19 | 3 | 3.6 min |
| 7 蘭桂坊 | 12 | won | 12 | 2 | 6.0 min |
| 8 太平山 | 15 | won | 14 | 2 | 5.8 min |
| Endless | ∞ | lost at wave 59 | — | — | 42 min |
The same numbers reproduce in headless Chrome via `tests/demo_run.py` (the real in-page demo AI, fast-forwarded). The AI is greedy (no selling, no repositioning), so a human player has headroom; skill 0.7 and 1.0 also clear every map (skill 1.0 loses map 7 once in a while).

## 5. Endless mode & i18n
- No final state: after any number of waves `canCallWave()` stays true. HP growth saturates, speed is capped, wave size is capped after wave 60, and bosses scale slower than the crowd, so it stays playable but is never beatable (towers top out at L3 on 24 pads).
- Natural ad-break points: **only** the game-over screen (after the player taps Retry / Menu). Never mid-wave, never at the milestone banner.
- Strings: `js/strings.js` (`{key: [zh-HK, en]}`, cyber-kit `i18n`). HTML uses `data-i18n*`; dynamic text uses `t()`. Toggles: `#btn-lang` (start) and `#btn-lang2` (pause). Persisted in `localStorage cyber.lang` (shared by all CYBER games); `?lang=en|zh` forces.

## 6. CYBER ARCADE hub hooks
URL params (from the hub's launch URL): `?hub=1&tier=free|silver|gold&ads=0|1&trial=0|1&trialLeft=N&ret=<hub page URL>`.
- `trial=1`: maps 3–8 show a 🔒 試玩 tag and open the **trial prompt**; endless stops after wave 10 (`Game` option `stopAfter`) → trial prompt. The prompt's **解鎖金級 UNLOCK GOLD** button returns to `ret` + `store=1` (same-origin only, no open redirect), else `history.back()`, else a toast. The HUD shows a TRIAL tag; the start screen shows "trialLeft" runs left today.
- `ads=0` (paid tier in the hub): no interstitials. Outside the hub, interstitials follow the normal cyber-kit `createAds` rules (a no-op on the web build).

### Ad placements
| Placement | Type | Code | Rule |
|---|---|---|---|
| `gameover` | interstitial | `retry()` / `overToMenu()` → `ads.naturalBreak('gameover')` | only after the player taps Retry / Menu on the game-over screen; skipped when `hub=1&ads=0`; capped by `ADS` |
| `continue` | rewarded | `revive()` → `ads.rewarded('continue')` | opt-in, once per run: core +10 HP and an EMP clears enemies past 80 % of the path; caps the map at 1★. On the web build it's free (stub). |

## 7. File map
```
index.html       HUD (core/credits, wave/score, boss bar, trial tag, speed/pause/wave/mute buttons, radial menu), screens: start, maps, pause, over, win, trial
css/game.css     layout (portrait + landscape menus)
js/config.js     constants, maps, buildMap, hpMul/waveSpec/starsFor (pure, unit-tested)
js/logic.js      Game: build/upgrade/sell, waves, targeting, damage, economy, events (pure, no DOM)
js/ai.js         autopilot (attract mode, ?demo=1, balance tests)
js/view.js       Three.js board: glass slab + grid shader, flowing path tiles, pads, city blocks, towers, enemies, beams/lightning, missiles, range ring
js/audio.js      TowerAudio (cyber-kit SynthAudio, 'chill' music, per-tower SFX)
js/strings.js    zh-HK / EN strings
js/main.js       states, input, radial menus, camera framing, effects, hub hooks, ads, save
vendor/cyber-kit cyber-kit v0.2.1
tests/           logic.test.mjs, balance.mjs, smoke.py, demo_run.py, fake-hub.html
```
Test hook: `window.__td` (state, game, speed, mapId, `api.ff(sec) / tap(c,r) / pads() / screenOf / autopilot / lose / win / wave(n) / money(n) / unlockAll / settled`).

## 8. Tests
- `node --test tests/`: map validity (no crossing/touching lanes, pads off-path), build/upgrade/sell economy, armor/shield/split, drones, early-call bonus, stars, continue once, trial stop at wave 10, deterministic waves + bosses, endless keeps scaling, autopilot clears all 8 maps in 2–8 min.
- `python tests/smoke.py [url] [out]`: 412×915 touch + 1280×800, zh + en: start, maps (locks), map 1, tap pad → radial → build, upgrade, close/reopen, sell refund, call wave, speed, pause/resume, AI to victory (stars + save), next map unlock, game over, rewarded continue (once), endless past the wave-10 milestone + best wave saved, language toggle persisted; trial (maps locked, map 3 → prompt, endless stops at 10 → unlock returns to `ret?store=1`); `?demo=1`; zero console errors. Last run 2026-10-02: ALL PASSED.
- `python tests/demo_run.py [url]`: in-browser demo AI on all maps + endless (table in §4).
- `node tests/balance.mjs [skill]`: balance table.

## 9. Android packaging
As DATA FUSE (Capacitor 8 + `@capacitor-community/admob` v8; app id suggestion `hk.fung2222.neonbastion`; lock portrait). Shipped inside the CYBER ARCADE app as a Gold title.

## 10. Known issues / ideas
- Headless SwiftShader runs at about 3 FPS, so tests wait on game state and fast-forward with `api.ff`; phones run at 60 FPS with auto-quality.
- No mid-run save (a run is 3–6 min). Balance is tuned against the autopilot, not yet against human playtests.
- Ideas: targeting modes (first/strong/last), per-map modifiers, tower skins as cosmetic rewards, daily challenge seed.
