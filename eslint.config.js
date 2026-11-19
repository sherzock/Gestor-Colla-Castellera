// Revisió automàtica del codi (npm run lint). L'app no té dependències: ESLint es baixa només per revisar
// (npx, versió fixa) i aquesta configuració no n'importa cap. Les regles busquen errors, no estil.
const shared = ['console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone', 'URL',
  'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'fetch', 'Response', 'Request', 'Headers', 'Blob',
  'WebSocket', 'crypto', 'performance', 'atob', 'btoa', 'Intl', 'Event', 'EventTarget'];
const node = ['process', 'Buffer', 'global', 'setImmediate'];
const browser = ['window', 'document', 'location', 'history', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame',
  'cancelAnimationFrame', 'matchMedia', 'getComputedStyle', 'alert', 'confirm', 'prompt', 'FileReader', 'Image', 'HTMLElement',
  'HTMLCanvasElement', 'OffscreenCanvas', 'createImageBitmap', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'CustomEvent', 'DOMParser', 'XMLSerializer', 'CSS', 'Notification', 'PushManager', 'File', 'FormData', 'caches', 'self',
  'clients', 'indexedDB', 'innerWidth', 'innerHeight', 'scrollY', 'devicePixelRatio', 'visualViewport', 'Node', 'KeyboardEvent', 'PointerEvent',
  'CompressionStream', 'DecompressionStream', 'ReadableStream', 'getSelection', 'isSecureContext'];
const asGlobals = (list) => Object.fromEntries(list.map((n) => [n, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-unsafe-finally': 'error',
  'no-control-regex': 'error',
  'no-unsafe-negation': 'error',
  'no-constant-binary-expression': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-async-promise-executor': 'error',
  'no-import-assign': 'error',
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-shadow-restricted-names': 'error',
  'no-useless-catch': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'eqeqeq': ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
};

export default [
  { ignores: ['node_modules/', 'data/'] },
  // Servidor, proves i eines (Node).
  { files: ['**/*.js'], ignores: ['public/**'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: asGlobals([...shared, ...node]) }, rules },
  // L'app (navegador). Les proves també criden alguns mòduls de public/ des de Node, però sense fer servir res del navegador.
  { files: ['public/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: asGlobals([...shared, ...browser]) }, rules },
];
