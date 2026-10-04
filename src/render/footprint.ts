import type { PropSpec } from './layout';

/** Default footprint (w, d) of solid props. Decorative ones return undefined. */
export function footprint(prop: PropSpec): [number, number] | undefined {
  // Overhead or flat decoration never blocks, whatever its size.
  if (prop.type === 'bunting' || prop.type === 'lantern' || prop.type === 'rug' || prop.type === 'banner' || prop.type === 'flowers' || prop.type === 'stool' || prop.type === 'basket' || prop.type === 'bucket') return undefined;
  if (prop.size) {
    if (prop.type === 'field' || prop.type === 'fence') return prop.type === 'fence' ? [prop.size[0], 0.4] : undefined;
    return [prop.size[0], prop.size[1]];
  }
  switch (prop.type) {
    case 'well': return [2.4, 2.4];
    case 'stall': return [3.6, 2.4];
    case 'tree': case 'orchard': return [1.2, 1.2];
    case 'rock': return [1.6, 1.4];
    case 'crate': case 'barrel': return [1, 1];
    case 'table': return [2, 1.4];
    case 'hearth': return [1.4, 2.6];
    case 'board': case 'signpost': case 'lamp': return [0.4, 0.4];
    case 'scarecrow': case 'shrine': case 'memorial': return [0.8, 0.8];
    case 'haystack': return [2, 2];
    case 'cart': return [3, 1.6];
    case 'bed': return [2, 3];
    case 'chest': return [1.2, 0.8];
    case 'bench': return [2, 0.6];
    case 'shelf': return [2.2, 0.6];
    case 'boat': return [3.2, 1.4];
    case 'sack': return [0.8, 0.8];
    case 'woodpile': return [2, 1];
    case 'pumpkins': return [1.2, 1.2];
    case 'bush': return [1.4, 1.4];
    case 'planter': return [1.6, 0.6];
    case 'keg-rack': return [2.3, 0.9];
    case 'tool-rack': return [1.9, 0.5];
    case 'wheelbarrow': return [0.9, 1.8];
    case 'trough': return [2.1, 0.9];
    case 'milestone': return [0.7, 0.5];
    case 'waymarker': return [0.4, 0.4];
    default: return undefined;
  }
}
