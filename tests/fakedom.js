// Un navegador de mentida per pintar les pantalles de l'app dins de les proves, sense dependències: el document accepta
// qualsevol cosa (tot és un element que no fa res) i es guarda tot l'HTML que l'app hi posa. Les crides a l'API van a un
// servidor de proves de debò, amb les galetes de qui toqui. No serveix per veure com queda, però sí per mirar què s'hi
// escriu (p. ex. que cap text de la gent hi arribi sense escapar).
export const written = [];
const bySelector = new Map();

function element(name) {
  const props = {};
  return new Proxy(function () {}, {
    get(_, k) {
      if (k in props) return props[k];
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'insertAdjacentHTML') return (_pos, html) => { written.push(String(html)); };
      // Els «addEventListener» queden com si fossin «onclick», «onsubmit»…, per poder-los cridar des de la prova.
      if (k === 'addEventListener') return (type, fn) => { props[`on${type}`] ??= fn; };
      // El mateix selector torna sempre el mateix element: així es poden prémer els botons que l'app ha preparat.
      if (k === 'querySelector' || k === 'getElementById') return (sel) => select(sel);
      return element(`${name}.${String(k)}`);
    },
    set(_, k, v) {
      if (k === 'innerHTML' || k === 'outerHTML') written.push(String(v));
      props[k] = v;
      return true;
    },
    apply: () => element(`${name}()`),
    construct: () => element(`new ${name}`),
  });
}
export function select(sel) {
  if (!bySelector.has(sel)) bySelector.set(sel, element(sel));
  return bySelector.get(sel);
}

const stored = {};
export function install({ base, cookies }) {
  globalThis.document = element('document');
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => stored[k] ?? null, setItem: (k, v) => { stored[k] = String(v); } };
  globalThis.location = { hash: '#/', href: `${base}/`, origin: base };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.dispatchEvent = () => true;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.confirm = () => false;
  globalThis.scrollTo = () => {};
  const realFetch = globalThis.fetch;
  // Les crides de l'app són relatives («/api/…»): van al servidor de proves amb les galetes de qui fa servir l'app.
  globalThis.fetch = (url, opts = {}) => (String(url).startsWith('/')
    ? realFetch(base + url, { ...opts, headers: { ...opts.headers, cookie: cookies() } })
    : realFetch(url, opts));
}
export const remember = (k, v) => { stored[k] = v; };
