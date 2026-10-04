/**
 * Browser smoke test of the first complete playable loop.
 *
 *   npm run smoke            (first time: npx playwright install chromium)
 *
 * Starts the Vite dev server, opens the game in headless Chromium, plays the
 * loop through the real UI (keys + clicks), reloads the page and checks the
 * world came back. Long walks use the debug teleport, which still crosses
 * zones through ordinary travel intents. Exits non-zero on any failure.
 *
 * Env: CHROMIUM_PATH (optional executable), SMOKE_SHOTS (folder for screenshots).
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const shots = process.env.SMOKE_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
} catch (e) {
  console.error(`Could not start Chromium (${e.message.split('\n')[0]}).\nRun "npx playwright install chromium" or set CHROMIUM_PATH.`);
  await server.close();
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let step = 0;
const check = (cond, what) => {
  step++;
  if (!cond) throw new Error(`step ${step} failed: ${what}`);
  console.log(`  ✓ ${what}`);
};
const shot = (name) => shots && page.screenshot({ path: `${shots}/${String(step).padStart(2, '0')}-${name}.png` });
const state = () =>
  page.evaluate(() => {
    const g = window.__eotr;
    const me = { kind: 'actor', id: g.playerId };
    const st = g.sim.state;
    return {
      playerId: g.playerId,
      loc: st.actors[g.playerId].locationId,
      scene: g.game.sceneId,
      coin: g.sim.economy.balance(me, 'currency_mark'),
      contracts: g.sim.contracts.heldBy(me).map((c) => [c.id, c.status]),
      bramble: g.sim.familiars.ownerOf('familiar_bramble')?.id === g.playerId,
      brambleBond: st.familiars['familiar_bramble'].bond,
      stall: g.sim.property.ownerOf('property_stall-4')?.id === g.playerId,
      chronicle: g.sim.chronicle.personal(g.playerId).entries().map((e) => e.event),
      rep: g.sim.reputation.get(me, { kind: 'location', id: 'location_blackmere' }),
    };
  });
const walkTo = (x, z) => page.evaluate(([x, z]) => window.__eotr.game.debugPlace([x, z]), [x, z]);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
};
const choose = async (rowText) => {
  await page.locator('#hud-panel .row', { hasText: rowText }).first().locator('button').click();
  await page.waitForTimeout(250);
};

try {
  console.log('First playable loop — browser smoke test');
  await page.goto('http://localhost:5199/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);

  let s = await state();
  check(s.loc === 'location_blackmere-square' && s.coin === 40, 'ENTER BLACKMERE: arrive in the Town Square with 40 marks');

  await hold('a', 900); // real keyboard movement
  await hold('d', 900);
  await walkTo(-20, 2);
  check((await state()).loc === 'location_blackmere-hearth-row', 'MOVE THROUGH TOWN: walked into Hearth Row');
  await walkTo(0, 3);
  await walkTo(2.4, 2.2);

  await press('e');
  check(await page.locator('#hud-panel h2', { hasText: 'Pip Ashdown' }).isVisible(), 'SPEAK TO NPC: Pip answers');
  await shot('pip');
  await choose('The Lost Satchel');
  s = await state();
  check(s.contracts.some(([id, st]) => id === 'contract_pip-satchel' && st === 'accepted'), 'RECEIVE SMALL CONTRACT: The Lost Satchel accepted');
  await press('Escape');

  await walkTo(19, 0);
  await walkTo(17, 0.6);
  check((await state()).loc === 'location_blackmere-market', 'VISIT MARKET');
  await press('e');
  await choose('Hound Biscuits');
  await choose('Hound Biscuits');
  check((await state()).coin === 36, 'bought two Hound Biscuits at Quill’s Sundries');
  await press('Escape');

  await walkTo(28, 0);
  await walkTo(30.5, 0);
  await page.waitForTimeout(300);
  check((await state()).scene === 'blackmere-outskirts', 'left town by the east gate');
  await walkTo(-20, 0);
  await walkTo(8, 7);
  await walkTo(18, 8);
  await press('e');
  await choose('Bramble');
  s = await state();
  check(s.bramble && s.coin === 24, 'ACQUIRE A COMPANION: Bramble comes home');
  await press('Escape');

  await press('2'); // Companion mode
  await press('c');
  await choose('Feed Hound Biscuits');
  await choose('Spend time together');
  await shot('companion');
  check((await state()).brambleBond === 13, 'CARE FOR COMPANION: fed and played (bond 13)');
  await press('Escape');

  await press('6'); // Search mode
  await walkTo(8, -6);
  check((await state()).loc === 'location_hollowmere-wood', 'reached Hollowmere Woodland Edge');
  await press('f');
  const inv = await page.evaluate(() => window.__eotr.sim.inventory.count({ kind: 'actor', id: window.__eotr.playerId }, 'item_courier-satchel'));
  check(inv === 1, 'SEARCH: found Pip’s satchel');

  await walkTo(-20, 0);
  await walkTo(-37, 0);
  await page.waitForTimeout(300);
  await walkTo(19, 0);
  await walkTo(0, 3);
  await walkTo(2.4, 2.2);
  await press('e');
  await choose('Find Pip');
  await choose('Return the satchel');
  s = await state();
  check(s.contracts.some(([id, st]) => id === 'contract_pip-satchel' && st === 'completed'), 'COMPLETE SEARCH OR DELIVERY: satchel returned');
  check(s.coin === 39 && s.rep === 5, 'RECEIVE CURRENCY / REPUTATION: +15 marks, Blackmere +5');
  await press('Escape');

  await press('1'); // Live mode
  await walkTo(0, -12);
  await walkTo(2.5, -21.5);
  await press('e');
  await choose('Market Stall No. 4');
  s = await state();
  check(s.stall && s.coin === 9, 'OWNERSHIP DECISION: bought Market Stall No. 4 from the Reeve');
  await press('Escape');

  await press('j');
  await page.waitForTimeout(400);
  await shot('journal');
  const tale = await page.locator('#hud-panel').innerText();
  check(/Helped Pip Ashdown: The Lost Satchel/.test(tale) && /Bought Market Stall No\. 4/.test(tale), 'CHRONICLE RECORDS THE EXPERIENCE (journal shows it)');
  await press('Escape');

  const before = await state();
  await press('k');
  check(await page.locator('.toast', { hasText: 'Saved' }).count() > 0, 'SAVE');

  await page.reload();
  await page.waitForTimeout(1500);
  const after = await state();
  await shot('resumed');
  check(JSON.stringify(after) === JSON.stringify(before), 'RELOAD → STATE REMAINS (identical)');
  check(await page.locator('.toast', { hasText: 'Welcome back' }).count() > 0, 'welcomed back');

  console.log('Living Blackmere — depth checks');
  const clock = await page.locator('#hud-status .clock').innerText();
  check(/^Day 1 · (09|10|11):\d\d · Morning$/.test(clock), `the day has a clock (${clock})`);
  const pip = await page.evaluate(() => [window.__eotr.sim.state.npcActivity['actor_pip-ashdown'].activity, window.__eotr.game.npcPosition('actor_pip-ashdown')]);
  check(pip[0] === 'sorting-letters' && pip[1] !== undefined, 'NPC ROUTINES: Pip is sorting letters by the well');

  await walkTo(0, -8);
  await walkTo(5, -4.4);
  await press('e');
  const board = await page.locator('#hud-panel').innerText();
  check(/Blackmere Notice Board/.test(board) && /WANTED — /.test(board) && /FOR SALE — Wicket Cottage/.test(board), 'READABLES: the notice board lists work and property for sale');
  await press('Escape');

  await walkTo(12, 0);
  await walkTo(19, 3);
  await walkTo(21, 7.1);
  await press('e');
  check(await page.locator('#hud-panel h2', { hasText: 'Market Stall No. 4' }).isVisible(), 'STALL: tending your own stall');
  await choose('— fair');
  const listed = await page.evaluate(() => Object.keys(window.__eotr.sim.stall.get('property_stall-4')?.listings ?? {}).length);
  check(listed === 1, 'STALL: laid out goods for sale');
  await shot('stall');
  await press('Escape');

  await walkTo(12, 0);
  await walkTo(0, 3);
  await page.waitForTimeout(600); // let the camera settle
  const before2 = await page.evaluate(() => window.__eotr.game.position);
  await page.mouse.click(700, 330);
  await page.waitForTimeout(1200);
  const after2 = await page.evaluate(() => window.__eotr.game.position);
  check(Math.hypot(after2[0] - before2[0], after2[1] - before2[1]) > 1, 'MOUSE: click to walk');

  await walkTo(-12, 2);
  await walkTo(-21, 12.3);
  await walkTo(-23, 11.4);
  await page.waitForTimeout(200);
  check((await state()).scene === 'blackmere-town' && (await page.locator('.toast', { hasText: 'Wicket Cottage is locked' }).count()) > 0, 'PROPERTY: Wicket Cottage is locked to non-owners');
  await shot('evening-town');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.goto('http://localhost:5199/');
  await phone.waitForTimeout(1500);
  check(await phone.locator('#hud-touch .pad').isVisible(), 'PHONE: joystick and action buttons shown');
  await phone.locator('#hud-touch button', { hasText: 'Journal' }).tap();
  await phone.waitForTimeout(300);
  check(await phone.locator('#hud-panel h2', { hasText: 'Journal' }).isVisible(), 'PHONE: action buttons open panels');
  if (shots) await phone.screenshot({ path: `${shots}/phone.png` });
  await phone.close();

  check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log('\nLoop complete.');
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (errors.length) console.error('browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
