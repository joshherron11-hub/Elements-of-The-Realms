import * as THREE from 'three';
import { PATTERN, SLOTS, type HumanoidPalette } from './palette';

/**
 * The humanoid surface: one material per character, one shader program for all.
 *
 * - Colour comes from the per-character palette, indexed by the slot baked
 *   into UV.x, so every NPC can share the same meshes.
 * - UV.y carries ambient occlusion baked in the rest pose (folds, collars,
 *   under brims and between fingers).
 * - Fine surface detail (weave, leather grain, hair strands, skin) is a
 *   channel-packed texture sampled triplanar in bind-pose space, so it sticks
 *   to the cloth as the body moves and needs no UV unwrap.
 * - Soft stylized shading: a smooth light ramp with a cel rim, matching the
 *   world's rim light.
 */
export interface Rim {
  color: { value: THREE.Color };
  strength: { value: number };
}

let detail: THREE.DataTexture | undefined;
let ramp: THREE.DataTexture | undefined;

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function valueNoise(x: number, y: number, px: number, py = px): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const h = (a: number, b: number) => hash(((a % px) + px) % px, ((b % py) + py) % py);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx;
  const bot = h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx;
  return top * (1 - sy) + bot * sy;
}

/** 128x128 tileable detail: R weave, G leather grain, B hair strands, A skin. Pure maths (works anywhere). */
export function detailTexture(): THREE.DataTexture {
  if (detail) return detail;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const warp = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
      const weft = Math.sin(v * Math.PI * 2 * 16) * 0.5 + 0.5;
      const checker = (Math.floor(u * 16) + Math.floor(v * 16)) % 2;
      const weave = 0.78 + 0.22 * (checker ? warp : weft) - valueNoise(x / 4, y / 4, N / 4) * 0.08;
      const grain = 0.82 + 0.18 * (valueNoise(x / 6, y / 6, N / 6) * 0.6 + valueNoise(x / 2, y / 2, N / 2) * 0.4);
      const strands = 0.66 + 0.24 * valueNoise(x / 2, y / 16, N / 2, N / 16) + 0.1 * valueNoise(x / 4, y / 32, N / 4, N / 32);
      const skin = 0.93 + 0.07 * valueNoise(x / 3, y / 3, Math.round(N / 3));
      const i = (y * N + x) * 4;
      data[i] = Math.round(Math.min(1, weave) * 255);
      data[i + 1] = Math.round(Math.min(1, grain) * 255);
      data[i + 2] = Math.round(Math.min(1, strands) * 255);
      data[i + 3] = Math.round(Math.min(1, skin) * 255);
    }
  }
  detail = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.magFilter = THREE.LinearFilter;
  detail.minFilter = THREE.LinearMipmapLinearFilter;
  detail.generateMipmaps = true;
  detail.needsUpdate = true;
  return detail;
}

/** A soft light ramp: dark core shadow, gentle terminator, full light. */
function rampTexture(): THREE.DataTexture {
  if (ramp) return ramp;
  const levels = [128, 136, 160, 196, 224, 242, 252, 255];
  ramp = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  ramp.minFilter = THREE.LinearFilter;
  ramp.magFilter = THREE.LinearFilter;
  ramp.needsUpdate = true;
  return ramp;
}

export function humanoidMaterial(palette: HumanoidPalette, rim?: Rim): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampTexture() });
  const pal = SLOTS.map((s) => new THREE.Color(palette[s]));
  const pat = SLOTS.map((s) => PATTERN[s]);
  m.userData.palette = pal;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPal = { value: pal };
    shader.uniforms.uPat = { value: pat };
    shader.uniforms.uDetail = { value: detailTexture() };
    shader.uniforms.rimColor = rim?.color ?? { value: new THREE.Color(0xffe0b0) };
    shader.uniforms.rimStrength = rim?.strength ?? { value: 0.5 };
    shader.vertexShader = `varying vec3 vBindPos;\nvarying vec3 vBindNrm;\nvarying vec2 vSlot;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvBindPos = position;\nvBindNrm = normal;\nvSlot = uv;',
    );
    shader.fragmentShader = `uniform vec3 uPal[${SLOTS.length}];
uniform float uPat[${SLOTS.length}];
uniform sampler2D uDetail;
uniform vec3 rimColor;
uniform float rimStrength;
varying vec3 vBindPos;
varying vec3 vBindNrm;
varying vec2 vSlot;
float eotrDetail(float pat) {
  if (pat < 0.5) return 1.0;
  vec3 w = pow(abs(normalize(vBindNrm)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  float sc = pat > 3.5 ? 22.0 : pat > 2.5 ? 34.0 : pat > 1.5 ? 18.0 : 46.0;
  vec4 a = texture2D(uDetail, vBindPos.yz * sc);
  vec4 b = texture2D(uDetail, vBindPos.xz * sc);
  vec4 c = texture2D(uDetail, vBindPos.xy * sc);
  vec4 t = a * w.x + b * w.y + c * w.z;
  return pat > 3.5 ? t.a : pat > 2.5 ? t.b : pat > 1.5 ? t.g : t.r;
}
${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          int slot = int(clamp(floor(vSlot.x), 0.0, ${SLOTS.length - 1}.0));
          float ao = mix(0.55, 1.0, smoothstep(0.0, 1.0, vSlot.y));
          diffuseColor.rgb *= uPal[slot] * eotrDetail(uPat[slot]) * ao * 1.1;
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float facing = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
          float rim = smoothstep( 0.74, 0.84, 1.0 - facing );
          outgoingLight += rimColor * rim * rimStrength * (0.25 + diffuseColor.rgb * 1.2);
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'eotr-humanoid';
  return m;
}

/** Recolour a character in place (same program, new uniforms). */
export function setPalette(m: THREE.Material, palette: HumanoidPalette): void {
  const pal = m.userData.palette as THREE.Color[] | undefined;
  if (pal) SLOTS.forEach((s, i) => pal[i]!.set(palette[s]));
}

/** Ink outline for skinned meshes: pushes along the skinned normal after skinning. */
export function skinnedInk(color: number, width: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.inkWidth = { value: width };
    shader.vertexShader = `uniform float inkWidth;\n${shader.vertexShader}`.replace(
      '#include <skinning_vertex>',
      '#include <skinning_vertex>\ntransformed += normalize(objectNormal) * inkWidth;',
    );
  };
  m.customProgramCacheKey = () => `eotr-ink-skinned-${width}`;
  return m;
}
