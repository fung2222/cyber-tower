"""NEON BASTION smoke test (Playwright + system Chrome).

usage: python tests/smoke.py [BASE_URL] [OUT_DIR]
  BASE_URL defaults to http://127.0.0.1:18940/cyber-tower/
Runs phone (412x915 touch) and desktop (1280x800) in zh-HK and EN, walks every
screen, plays through the hooks, and fails on any console error / page error.
"""
import asyncio, json, os, sys
from urllib.parse import quote
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('BASE_URL', 'http://127.0.0.1:18940/cyber-tower/')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/cyber-tower-shots'
os.makedirs(OUT, exist_ok=True)
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
fails = []

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

async def poll(pg, js, timeout=20000, step=250):
    t = 0
    while t < timeout:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await pg.wait_for_timeout(step); t += step
    return False

async def settle(pg):
    # wait for the camera glide (menu -> play framing) to finish: headless Chrome renders at ~3 fps
    await poll(pg, "__td.api.settled()", 30000)

async def tap(pg, sel, mobile):
    if mobile: await pg.tap(sel)
    else: await pg.click(sel)

async def tap_xy(pg, x, y, mobile):
    if mobile: await pg.touchscreen.tap(x, y)
    else: await pg.mouse.click(x, y)

async def run(b, name, w, h, mobile, lang):
    print(f'== {name} {w}x{h} {lang}')
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    shot = lambda n: pg.screenshot(path=f'{OUT}/{name}-{lang}-{n}.png')

    await pg.goto(f'{BASE}?lang={lang}')
    check(await poll(pg, "window.__td && __td.state === 'attract' && !!__td.game"), 'attract mode boots')
    await pg.wait_for_timeout(2500); await shot('01-start')
    check(await pg.evaluate("document.documentElement.dataset.lang") == lang, 'html data-lang matches')

    # maps
    await tap(pg, '#btn-campaign', mobile)
    check(await poll(pg, "__td.state === 'maps'"), 'maps screen opens')
    n = await pg.evaluate("document.querySelectorAll('#screen-maps [data-map]').length")
    check(n == 9, f'9 map cards (8 + endless), got {n}')
    locked = await pg.evaluate("document.querySelectorAll('#screen-maps .map-card.locked').length")
    check(locked == 7, f'fresh save: maps 2-8 locked, got {locked}')
    await pg.wait_for_timeout(1200); await shot('02-maps')

    # map 1
    await tap(pg, '#screen-maps [data-map="1"]', mobile)
    check(await poll(pg, "__td.state === 'playing' && __td.mapId === 1"), 'map 1 starts')
    await pg.wait_for_timeout(2500)   # let the intro banner fade
    await settle(pg)
    # tap a pad -> radial build menu
    pad = await pg.evaluate("(() => { const p = __td.api.pads()[2]; const s = __td.api.screenOf(p[0], p[1]); return {c: p[0], r: p[1], x: s.x, y: s.y}; })()")
    await tap_xy(pg, pad['x'], pad['y'], mobile)
    check(await poll(pg, "!document.getElementById('radial').classList.contains('hidden') && document.querySelectorAll('#radial [data-build]').length === 5", 4000), 'tap pad opens 5-tower radial')
    await pg.wait_for_timeout(500); await shot('03-radial')
    c0 = await pg.evaluate("__td.game.credits")
    await pg.dispatch_event('#radial [data-build="laser"]', 'pointerdown')
    check(await poll(pg, "__td.game.towers.size === 1", 3000), 'laser built')
    c1 = await pg.evaluate("__td.game.credits")
    check(c0 - c1 == 50, f'laser cost 50 ({c0}->{c1})')
    # building opens the tower menu straight away; tapping the same cell closes it, tapping again re-opens it
    check(await poll(pg, "!!document.querySelector('#radial [data-up]')", 3000), 'build -> tower menu (upgrade/sell)')
    await pg.dispatch_event('#radial [data-up]', 'pointerdown')
    check(await poll(pg, "[...__td.game.towers.values()][0].level === 2", 3000), 'tower upgraded to L2')
    await pg.wait_for_timeout(700)
    await tap_xy(pg, pad['x'], pad['y'], mobile)   # lands on the radial's centre close button
    check(await poll(pg, "document.getElementById('radial').classList.contains('hidden')", 3000), 'tap selected tower closes menu')
    await pg.wait_for_timeout(700)
    await tap_xy(pg, pad['x'], pad['y'], mobile)
    check(await poll(pg, "!!document.querySelector('#radial [data-up]')", 3000), 'tap tower opens upgrade/sell')
    await pg.wait_for_timeout(500); await shot('04-tower-menu')
    await pg.dispatch_event('#radial [data-sell]', 'pointerdown')
    check(await poll(pg, "__td.game.towers.size === 0", 3000), 'tower sold')
    cs = await pg.evaluate("__td.game.credits")
    check(cs == c1 - 45 + round((50 + 45) * 0.7), f'sell refunds 70% ({cs})')

    # call wave, speed, pause
    await tap(pg, '#btn-wave', mobile)
    check(await poll(pg, "__td.game.wave === 1 && __td.game.state === 'wave'", 3000), 'wave button starts wave 1')
    await tap(pg, '#btn-speed', mobile)
    check(await pg.evaluate("__td.speed") == 2, 'speed toggles to 2x')
    await tap(pg, '#btn-speed', mobile)
    check(await pg.evaluate("__td.speed") == 1, 'speed toggles back to 1x')
    await tap(pg, '#btn-pause', mobile)
    check(await poll(pg, "__td.state === 'paused'", 2000), 'pause')
    t0 = await pg.evaluate("__td.game.t"); await pg.wait_for_timeout(800); t1 = await pg.evaluate("__td.game.t")
    check(t0 == t1, 'sim frozen while paused')
    await tap(pg, '#btn-resume', mobile)
    check(await poll(pg, "__td.state === 'playing'", 2000), 'resume')

    # AI plays the rest at fast-forward -> win screen with stars
    await pg.evaluate("__td.api.autopilot(true)")
    for _ in range(40):
        r = await pg.evaluate("__td.api.ff(20)")
        if r['state'] != 'wave' and r['state'] != 'build': break
        if r['wave'] == 6 and name == 'phone':
            await pg.wait_for_timeout(1500); await shot('05-battle'); await pg.evaluate("__td.api.ff(4)"); await pg.wait_for_timeout(900); await shot('05b-battle')
    check(r['state'] == 'won', f"AI beats map 1 ({r})")
    check(await poll(pg, "__td.state === 'win'", 6000), 'win screen')
    stars = await pg.evaluate("document.querySelectorAll('#win-stars .on').length")
    check(1 <= stars <= 3, f'{stars} star(s) shown')
    await pg.wait_for_timeout(1200); await shot('06-win')
    saved = await pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('cyber-tower') && k.includes('stars'))) || '{}')")
    check(str(saved.get('1', saved.get(1, 0))) != '0', f'stars saved {saved}')

    # next map -> lose -> over -> revive
    await tap(pg, '#btn-next', mobile)
    check(await poll(pg, "__td.state === 'playing' && __td.mapId === 2"), 'next map (2) unlocked + started')
    await pg.evaluate("__td.api.wave(3); __td.api.lose()")
    check(await poll(pg, "__td.state === 'over'", 10000), 'core destroyed -> game over')
    await pg.wait_for_timeout(800); await shot('07-over')
    if await pg.evaluate("!document.getElementById('btn-revive').classList.contains('hidden')"):
        await tap(pg, '#btn-revive', mobile)
        check(await poll(pg, "__td.state === 'playing' && __td.game.hp === 10 && __td.game.continued", 8000), 'rewarded continue: +10 core HP')
        await pg.evaluate("__td.api.lose()")
        check(await poll(pg, "__td.state === 'over'", 10000), 'second loss -> over')
        check(await pg.evaluate("document.getElementById('btn-revive').classList.contains('hidden')"), 'continue only once per run')
    else:
        check(False, 'revive button visible')
    await tap(pg, '#btn-menu', mobile)
    check(await poll(pg, "__td.state === 'attract'", 8000), 'over -> menu')

    # endless milestone + best wave
    await tap(pg, '#btn-endless', mobile)
    check(await poll(pg, "__td.state === 'playing' && __td.game.map.endless"), 'endless starts')
    await pg.evaluate("__td.api.money(5000); __td.api.autopilot(true)")
    for _ in range(30):
        r = await pg.evaluate("__td.api.ff(20)")
        if r['wave'] >= 12 or r['state'] == 'lost': break
    check(r['wave'] >= 11, f'endless passes wave 10 milestone ({r})')
    await pg.wait_for_timeout(600)
    if name == 'desktop': await shot('08-endless')
    await pg.evaluate("__td.api.lose()")
    await poll(pg, "__td.state === 'over'", 10000)
    bw = await pg.evaluate("parseInt(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('cyber-tower') && k.includes('bestWave'))) || '0')")
    check(bw >= 11, f'best wave saved ({bw})')

    # language toggle persists
    other = 'en' if lang == 'zh' else 'zh'
    await tap(pg, '#btn-menu', mobile); await poll(pg, "__td.state === 'attract'", 8000)
    await tap(pg, '#btn-lang', mobile)
    await pg.goto(BASE)   # no ?lang= this time: the stored cyber.lang must win
    await poll(pg, "window.__td && __td.state === 'attract'")
    got = await pg.evaluate("document.documentElement.dataset.lang")
    check(got == other, f'language toggle persisted ({got})')
    if errs: print('  errors:', json.dumps(errs, ensure_ascii=False)[:1500])
    check(not errs, f'zero console errors ({len(errs)})')
    await ctx.close()

async def trial(b, lang, hub):
    print(f'== trial {lang}')
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    url = f'{BASE}?lang={lang}&hub=1&tier=free&ads=1&trial=1&trialLeft=2&ret={quote(hub, safe="")}'
    await pg.goto(url)
    await poll(pg, "window.__td && __td.state === 'attract'")
    # cheat a full star save so maps 1-8 would be unlocked: trial must still lock 3+
    await pg.evaluate("__td.api.unlockAll && __td.api.unlockAll()")
    await pg.tap('#btn-campaign'); await poll(pg, "__td.state === 'maps'")
    tl = await pg.evaluate("document.querySelectorAll('#screen-maps .map-card.trial').length")
    check(tl == 6, f'trial: maps 3-8 tagged locked ({tl})')
    await pg.wait_for_timeout(800); await pg.screenshot(path=f'{OUT}/trial-{lang}-maps.png')
    await pg.tap('#screen-maps [data-map="3"]')
    check(await poll(pg, "__td.state === 'trial'", 4000), 'trial: map 3 -> unlock prompt')
    await pg.wait_for_timeout(600); await pg.screenshot(path=f'{OUT}/trial-{lang}-prompt.png')
    await pg.tap('#btn-trial-back'); await poll(pg, "__td.state === 'attract'", 4000)
    await pg.tap('#btn-endless'); await poll(pg, "__td.state === 'playing' && __td.game.map.endless")
    check(not await pg.evaluate("document.getElementById('trial-tag').classList.contains('hidden')"), 'trial tag shown in HUD')
    await pg.evaluate("__td.api.money(9000); __td.api.autopilot(true)")
    for _ in range(30):
        r = await pg.evaluate("__td.api.ff(20)")
        if r['state'] not in ('wave', 'build'): break
    check(r['state'] == 'trialEnd' and r['wave'] == 10, f'trial: endless stops after wave 10 ({r})')
    check(await poll(pg, "__td.state === 'trial'", 4000), 'trial: endless -> unlock prompt')
    await pg.tap('#btn-unlock')
    ok = await poll(pg, f"location.href.startsWith({json.dumps(hub.split('?')[0])}) && location.search.includes('store=1')", 8000)
    check(ok, f'unlock returns to hub with store=1 ({pg.url})')
    if errs: print('  errors:', json.dumps(errs, ensure_ascii=False)[:1500])
    check(not errs, f'trial: zero console errors ({len(errs)})')
    await ctx.close()

async def demo(b):
    print('== demo')
    ctx = await b.new_context(viewport={'width': 1280, 'height': 800})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    await pg.goto(f'{BASE}?demo=1&lang=en')
    check(await poll(pg, "window.__td && __td.demo && __td.state === 'playing'"), 'demo autostarts')
    check(await poll(pg, "__td.game.wave >= 1 && __td.game.towers.size >= 1", 40000), 'demo AI builds + runs waves')
    if errs: print('  errors:', json.dumps(errs, ensure_ascii=False)[:1500])
    check(not errs, 'demo: zero console errors')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=ARGS)
        hub = os.environ.get('HUB_URL', BASE + 'tests/fake-hub.html')
        await run(b, 'phone', 412, 915, True, 'zh')
        await run(b, 'desktop', 1280, 800, False, 'en')
        await run(b, 'phone', 412, 915, True, 'en')
        await run(b, 'desktop', 1280, 800, False, 'zh')
        await trial(b, 'zh', hub)
        await trial(b, 'en', hub)
        await demo(b)
        await b.close()
    print(f'\n{"PASS" if not fails else "FAIL"}: {len(fails)} failure(s)')
    for f in fails: print('  -', f)
    sys.exit(1 if fails else 0)

asyncio.run(main())
