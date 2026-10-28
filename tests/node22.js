// Es carrega abans del servidor a les proves (--import). A Node 22, node:sqlite només accepta per als «?» valors
// null, números, bigint, text i bytes: un «undefined» o un booleà llancen un error que amb les versions noves no surt.
// Aquí es fa fallar igual, i amb «NODE22» al missatge perquè les proves ho puguin buscar al registre del servidor.
import { StatementSync } from 'node:sqlite';

const ok = (v) => v === null || typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string' || v instanceof Uint8Array;
for (const name of ['run', 'get', 'all', 'iterate']) {
  const original = StatementSync.prototype[name];
  StatementSync.prototype[name] = function (...args) {
    const values = args.length === 1 && args[0] && typeof args[0] === 'object' && !(args[0] instanceof Uint8Array) ? Object.values(args[0]) : args;
    const bad = values.find((v) => !ok(v));
    if (bad !== undefined || values.some((v) => v === undefined)) {
      console.error(`NODE22: valor no vàlid per a SQLite (${typeof bad}) a: ${this.sourceSQL?.slice(0, 80)}`);
      throw new TypeError('NODE22: Provided value cannot be bound to SQLite parameter');
    }
    return original.apply(this, args);
  };
}
