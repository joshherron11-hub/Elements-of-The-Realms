import { Kernel } from './core';
import { BUILD } from './config/build';
import { createStage } from './render/stage';

/**
 * Browser entry point. Wires the simulation kernel to the presentation stage.
 * Simulation advances via kernel.tick(); the stage only reads and draws.
 */
const kernel = new Kernel();
kernel.start();

const app = document.getElementById('app');
const hud = document.getElementById('hud');
if (!app || !hud) throw new Error('index.html is missing #app or #hud');

hud.innerHTML = `<h1>ELEMENTS OF THE REALMS</h1>
<p>Realm: Happy Fall · Location: Blackmere · ${BUILD.release} · v${BUILD.version}</p>
<p>Kernel foundation online. Blackmere is under construction.</p>`;

const stage = createStage(app);
stage.start((dt) => kernel.tick(dt));
