import { initSentry } from "./sentry.js";

/**
 * R5-04 fix: `initSentry()` as a plain statement at the top of index.ts's
 * body does NOT run before the other imports there, despite a comment that
 * used to claim it did — ES module `import` declarations are hoisted and
 * every imported module is fully evaluated, top to bottom, before any
 * statement in the importing module's own body runs. `config.js`,
 * `db/pool.js`, etc. had therefore already executed by the time that
 * statement fired, so a throw during config validation or pool
 * construction — exactly the startup failures worth capturing — still
 * escaped unreported.
 *
 * The fix is to ride the import graph instead of the statement body: this
 * module's only job is the side effect below, and index.ts imports it
 * first, before anything else, so its module body (this file, executed
 * top to bottom) runs before any subsequent import's body does.
 */
initSentry();
