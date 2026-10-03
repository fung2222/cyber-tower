"""Headless-Chrome auto-demo check: loads ?demo=1&level=N for every map, fast-forwards the demo's own
autopilot through the real in-page game, and prints result / core HP / stars / sim time per map.
usage: python tests/demo_run.py [BASE_URL]"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18940/cyber-tower/'
async def main():
    rows, errs = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 800})).new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        for lvl in [1, 2, 3, 4, 5, 6, 7, 8, 0]:
            await pg.goto(f'{BASE}?demo=1&lang=en&level={lvl}')
            await pg.wait_for_function("window.__td && __td.game && __td.state === 'playing'")
            r = None
            for _ in range(400):
                r = await pg.evaluate("__td.api.ff(15)")
                if r['state'] not in ('wave', 'build'): break
            info = await pg.evaluate("({ t: __td.game.t, towers: __td.game.towers.size, kills: __td.game.kills, score: __td.game.score })")
            stars = 3 if r['hp'] >= 18 else 2 if r['hp'] >= 10 else 1
            rows.append({'map': lvl or 'endless', **r, 'stars': stars if r['state'] == 'won' else 0, **info})
            print(json.dumps(rows[-1]))
        await b.close()
    print('console errors:', errs)
asyncio.run(main())
