import { Kernel } from './core';
import { BUILD } from './config/build';
import { content } from './config/content';
import { createStage, paletteFrom } from './render/stage';

/**
 * Browser entry point. Wires the simulation kernel to the presentation stage.
 * Simulation advances via kernel.tick(); the stage only reads and draws.
 */
const kernel = new Kernel();
kernel.start();

const app = document.getElementById('app');
const hud = document.getElementById('hud');
if (!app || !hud) throw new Error('index.html is missing #app or #hud');

const rules = content.rulesFor(BUILD.defaultServer);
const v = rules.variables;
hud.innerHTML = `<h1>ELEMENTS OF THE REALMS</h1>
<p>${rules.realm.name} (${rules.realm.type}) · ${rules.server.name} · ${BUILD.release} · v${BUILD.version}</p>
<p>War ${v.war} · PvP ${v.pvp} · Property ${v.propertyRisk} · Crime ${v.crime} · Technology ${v.technology} · AI ${v.aiDensity}</p>
<p>Blackmere is under construction.</p>`;

const stage = createStage(app, paletteFrom(rules.realm.presentation));
stage.start((dt) => kernel.tick(dt));
