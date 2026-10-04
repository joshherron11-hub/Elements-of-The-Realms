import * as THREE from 'three';
import type { Vec2 } from '../render/layout';

/**
 * Mouse / touch controls. Presentation only: produces a walk target, a
 * joystick axis, or a key press — the same things the keyboard produces.
 */
export interface TapResult {
  /** Ground point under the tap. */
  ground: Vec2;
  /** Screen position of the tap (CSS pixels). */
  screen: [number, number];
}

export class PointerControls {
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Current joystick vector (x right, z down-screen), length ≤ 1. */
  stick: [number, number] = [0, 0];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: () => THREE.Camera,
    private readonly onTap: (t: TapResult) => void,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.camera());
      const hit = new THREE.Vector3();
      if (this.ray.ray.intersectPlane(this.plane, hit)) this.onTap({ ground: [hit.x, hit.z], screen: [x, y] });
    });
  }

  /** Attach a virtual joystick to a DOM pad element. */
  attachStick(pad: HTMLElement, knob: HTMLElement): void {
    let id: number | null = null;
    let cx = 0;
    let cy = 0;
    const radius = 46;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const n = Math.hypot(dx, dy) / radius;
      this.stick = n < 0.15 ? [0, 0] : [dx / radius, dy / radius];
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick = [0, 0];
      knob.style.transform = '';
    };
    pad.addEventListener('pointerdown', (e) => {
      const r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      id = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      move(e);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }
}

/** True on phones/tablets (coarse pointer) — show touch controls. */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
