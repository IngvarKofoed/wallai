// node-stream-web-compat.d.ts — dependency type-compat shim (integration).
//
// happy-dom 20.x (pulled into the graph via `vitest`'s optional-types when tsc compiles
// the *.test.ts files) references `UnderlyingDefaultSource` from `node:stream/web`, but
// @types/node v24 no longer exports that name from its `stream/web` module — it lives only
// in lib.dom. That mismatch produces a TS2694 error inside node_modules that blocks the
// whole typecheck. We restore the missing export via module augmentation so the shared
// contracts still type-check. This adds nothing to the product surface; it is purely a
// version-bridge between two dependencies.

declare module "stream/web" {
  interface UnderlyingDefaultSource<R = any> {
    cancel?: UnderlyingSourceCancelCallback;
    pull?: (controller: ReadableStreamDefaultController<R>) => void | PromiseLike<void>;
    start?: (controller: ReadableStreamDefaultController<R>) => any;
    type?: undefined;
  }
}
