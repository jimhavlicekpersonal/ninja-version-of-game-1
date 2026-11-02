import type { ResourceKind } from '../../gameplay/sim/types';

/** Messages between the HUD (DOM) and the village scene (Phaser). */
export interface UiEvents {
  select: string | null;
  'placement:start': { kind: 'new'; buildingType: string } | { kind: 'move'; id: string };
  'placement:changed': { active: boolean; valid: boolean };
  'placement:confirm': void;
  'placement:cancel': void;
  toast: { text: string; kind?: 'info' | 'error' | 'success' };
  collected: { id: string; resource: ResourceKind; amount: number };
  'camera:focus': { id: string };
}

type Handler<T> = (payload: T) => void;

export class Bus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(k);
    if (!set) this.handlers.set(k, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }
  emit<K extends keyof E>(k: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    const set = this.handlers.get(k);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K] | undefined>)(payload[0]);
  }
}

export type UiBus = Bus<UiEvents>;
