/** Keyboard state. Presentation only: produces movement vectors and key presses. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed: string[] = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.down.has(k)) this.pressed.push(k);
      this.down.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Movement intent in screen-aligned axes: x right, z towards camera. */
  axis(): [number, number] {
    const x = (this.has('d', 'ArrowRight') ? 1 : 0) - (this.has('a', 'ArrowLeft') ? 1 : 0);
    const z = (this.has('s', 'ArrowDown') ? 1 : 0) - (this.has('w', 'ArrowUp') ? 1 : 0);
    const len = Math.hypot(x, z) || 1;
    return [x / len, z / len];
  }

  running(): boolean {
    return this.down.has('Shift');
  }

  /** Keys pressed since last call. */
  takePresses(): string[] {
    return this.pressed.splice(0);
  }

  private has(...keys: string[]): boolean {
    return keys.some((k) => this.down.has(k));
  }
}
