import type { Circle } from './player';

/**
 * Joins several collider lists into one array, rebuilding only when a list is swapped out or its length
 * changes (colliders are only ever pushed, never edited or removed one by one). Callers must not mutate
 * the returned array.
 */
export class ColliderList {
  private parts: readonly (readonly Circle[])[] = [];
  private lengths: number[] = [];
  private joined: Circle[] = [];

  get(parts: readonly (readonly Circle[])[]): Circle[] {
    if (this.fresh(parts)) return this.joined;
    this.parts = parts.slice();
    this.lengths = parts.map((p) => p.length);
    this.joined = parts.flat();
    return this.joined;
  }

  private fresh(parts: readonly (readonly Circle[])[]): boolean {
    if (parts.length !== this.parts.length) return false;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] !== this.parts[i] || parts[i].length !== this.lengths[i]) return false;
    }
    return true;
  }
}
