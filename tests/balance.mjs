// node tests/balance.mjs — runs the autopilot on every campaign map + endless and prints a balance table.
import { MAPS, ENDLESS_MAP, STEP, starsFor } from '../js/config.js';
import { Game } from '../js/logic.js';
import { createAI } from '../js/ai.js';
export function play(map, { skill = 1, stopAfter, maxT = 3600 } = {}) {
  const g = new Game(map, { stopAfter }); const ai = createAI({ skill });
  while (g.active() && g.t < maxT) { ai(g, STEP); g.step(STEP); g.events.length = 0; }
  return { won: g.state === 'won', state: g.state, hp: g.hp, wave: g.wave, t: g.t, stars: g.state === 'won' ? starsFor(g.hp, false) : 0, score: g.score, towers: g.towers.size, credits: g.credits };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const skill = +(process.argv[2] || 1);
  console.log('skill', skill);
  for (const m of MAPS) { const r = play(m, { skill }); console.log(`map ${m.id} ${m.en.padEnd(14)} waves ${m.waves} → ${r.state.padEnd(5)} wave ${r.wave} hp ${r.hp} stars ${r.stars} time ${(r.t / 60).toFixed(1)} min towers ${r.towers} credits ${Math.round(r.credits)}`); }
  const e = play(ENDLESS_MAP, { skill, maxT: 7200 }); console.log(`endless → wave ${e.wave} score ${e.score} time ${(e.t / 60).toFixed(1)} min towers ${e.towers}`);
}
