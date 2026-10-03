import { asId } from './core/ids';
import { BUILD } from './config/build';
import { content } from './config/content';
import { paletteFrom } from './render/stage';
import { bootstrapWorld, joinRealm } from './seed';
import { Game } from './ui/game';
import { loadSceneLayouts } from './ui/scenes';

/**
 * Browser entry point: resolve the server's rules, build the world from
 * content, bring the player in, and hand over to the game loop.
 */
const app = document.getElementById('app');
if (!app) throw new Error('index.html is missing #app');

const rules = content.rulesFor(BUILD.defaultServer);
const booted = bootstrapWorld({
  rules,
  pack: content.pack(rules.realm.id),
  modes: content.modes,
  seed: 20261003,
});
if (!booted.ok) throw new Error(booted.error.message);
const sim = booted.value;

const joined = joinRealm(sim, { displayName: 'Traveller', startAt: asId('location_blackmere-square') });
if (!joined.ok) throw new Error(joined.error.message);

const game = new Game(sim, joined.value.actor.id, loadSceneLayouts(), app, paletteFrom(rules.realm.presentation));
game.start();

// Debug handle for the browser console and automated smoke tests. Presentation only.
(window as unknown as { __eotr: unknown }).__eotr = { sim, game, playerId: joined.value.actor.id };
