/**
 * Joins an adapter's per-store classes into its `Repo` class (quality Q16): every method of each store's
 * prototype is copied onto the aggregate's prototype. A name defined twice (two stores, or a store and the
 * aggregate) throws at load, so one store can never silently replace another's method.
 */
type StoreClass = abstract new (...args: never[]) => object;

export function composeStores(target: StoreClass, stores: StoreClass[]): void {
  for (const store of stores) {
    for (const name of Object.getOwnPropertyNames(store.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) throw new Error(`${target.name}: ${name} is defined by more than one store`);
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(store.prototype, name)!);
    }
  }
}
