import { AiService, OfflineProvider, narrate } from './ai';
import { BUILD } from './config/build';
import { content } from './config/content';
import { SaveService } from './persistence/saves';
import { MemoryStorage, WebStorage, type StorageAdapter } from './persistence/storage';
import { paletteFrom } from './render/stage';
import { Game } from './ui/game';
import { loadSceneLayouts } from './ui/scenes';
import { SAVE_SLOT, openSession, saveSession } from './ui/session';

/**
 * Browser entry point: continue the saved world if there is one, otherwise
 * found a new one; then hand over to the game loop. Saves automatically.
 */
const AUTOSAVE_MS = 30_000;

const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');

function browserStorage(): StorageAdapter {
  try {
    const probe = '__eotr_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return new WebStorage(window.localStorage);
  } catch {
    return new MemoryStorage(); // private mode etc. — play still works, saving lasts for the tab
  }
}

const saves = new SaveService(browserStorage(), () => Date.now());
const session = openSession({
  content,
  saves,
  serverId: BUILD.defaultServer,
  startLocation: 'location_blackmere-square',
  newWorldSeed: Math.floor(Math.random() * 2 ** 31),
  displayName: 'Traveller',
});
const { sim, playerId } = session;
const rules = sim.ctx.rules!;

const game = new Game(sim, playerId, loadSceneLayouts(), app, paletteFrom(rules.realm.presentation));

let leaving = false; // set when the page reloads on purpose, so unload does not overwrite the save
// AI gateway. The Blackmere server runs at MINIMAL density, so narration uses the
// deterministic narrator and no model is ever called. No real provider is connected.
const ai = new AiService({ providers: [new OfflineProvider()], now: () => Date.now() });
game.narrator = async (entries) =>
  (await narrate(ai, { density: rules.variables.aiDensity }, playerId, entries, (id) => sim.state.locations[id]?.name)).text;

const save = (quiet = false): string | undefined => {
  if (leaving) return undefined;
  const r = saveSession(saves, session, game.snapshot());
  if (!r.ok) return `Could not save: ${r.error.message}`;
  return quiet ? undefined : `Saved · ${r.value.chronicleEntries} Chronicle entries`;
};
game.onSave = () => save();
game.onLoad = () => {
  if (!saves.has(SAVE_SLOT)) return game.toast('No save to load yet.', true);
  leaving = true;
  window.location.reload(); // the page reopens from the last save
};
game.onNewGame = () => {
  if (!window.confirm('Start a new life in Happy Fall? Your saved world in this browser will be erased.')) return;
  leaving = true;
  saves.delete(SAVE_SLOT);
  window.location.reload();
};

game.start(session.presentation);
if (session.resumed) {
  const mins = Math.round((session.awayMs ?? 0) / 60000);
  game.toast(`Welcome back to ${sim.state.realm.name}.${mins > 0 ? ` You were away ${mins} minute${mins === 1 ? '' : 's'}.` : ''}`);
} else {
  if (session.loadError) game.toast(`Your old save could not be loaded (${session.loadError}). Starting fresh.`, true);
  game.toast(`You arrive in Blackmere. Talk to people (E), and press K to save.`);
}

setInterval(() => save(true), AUTOSAVE_MS);
window.addEventListener('beforeunload', () => save(true));
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save(true));

// Debug handle for the browser console and automated smoke tests. Presentation only.
(window as unknown as { __eotr: unknown }).__eotr = { sim, game, playerId, saves, save, ai };
