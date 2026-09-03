/**
 * Ceasul simulării. Implicit merge odată cu ceasul real, dar pentru prezentare
 * poate fi accelerat sau mutat la o anumită oră (ex. ora de vârf).
 */
export class SimClock {
  private anchorReal = Date.now();
  private anchorSim = Date.now();
  private _speed = 1;
  private _paused = false;
  private listeners = new Set<() => void>();

  now(): number {
    if (this._paused) return this.anchorSim;
    return this.anchorSim + (Date.now() - this.anchorReal) * this._speed;
  }

  private reanchor() {
    this.anchorSim = this.now();
    this.anchorReal = Date.now();
  }

  get speed() {
    return this._speed;
  }

  set speed(v: number) {
    this.reanchor();
    this._speed = v;
    this.emit();
  }

  get paused() {
    return this._paused;
  }

  set paused(v: boolean) {
    if (v === this._paused) return;
    this.reanchor();
    this._paused = v;
    if (!v) this.anchorReal = Date.now();
    this.emit();
  }

  /** sare la o anumită oră din ziua curentă (minute de la miezul nopții, ora Bacăului) */
  jumpTo(minutesOfDay: number) {
    const now = new Date(this.now());
    const local = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
    const diffMin = minutesOfDay - (local.getHours() * 60 + local.getMinutes());
    this.anchorSim = this.now() + diffMin * 60000 - local.getSeconds() * 1000;
    this.anchorReal = Date.now();
    this.emit();
  }

  /** revine la ceasul real */
  reset() {
    this.anchorSim = Date.now();
    this.anchorReal = Date.now();
    this._speed = 1;
    this._paused = false;
    this.emit();
  }

  get isLive() {
    return !this._paused && this._speed === 1 && Math.abs(this.now() - Date.now()) < 90_000;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const clock = new SimClock();
