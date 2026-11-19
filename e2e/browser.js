// Proves al navegador sense dependències: Chrome sense finestra controlat pel protocol de DevTools (CDP).
// Cada prova obre una pàgina en un context propi (galetes i emmagatzematge a part) i fa clics i tecleja com una
// persona. Si no hi ha Chrome, les proves se salten, tret que E2E_REQUIRED=1 (a la CI): llavors fallen.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [process.env.CHROME_PATH, 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const onPath = (bin) => (bin.includes('/') ? fs.existsSync(bin) && bin
  : (process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, bin)).find((p) => fs.existsSync(p)));
export const chromePath = CANDIDATES.map(onPath).find(Boolean) || null;
export const skip = chromePath ? false : process.env.E2E_REQUIRED === '1' ? false : 'no hi ha Chrome (posa CHROME_PATH)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser() {
  if (!chromePath) throw new Error('No hi ha Chrome per a les proves al navegador (posa CHROME_PATH)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'colla-e2e-'));
  const proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  // Chrome diu per on escolta a la sortida d'errors.
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`Chrome no arrenca:\n${buf}`)), 20_000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.once('exit', (code) => reject(new Error(`Chrome ha sortit (${code}):\n${buf}`)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else for (const l of listeners) l(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  return {
    newPage: (opts) => newPage(send, listeners, opts),
    async close() {
      ws.close();
      proc.kill();
      await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function newPage(send, listeners, { width = 390, height = 844 } = {}) {
  const { browserContextId } = await send('Target.createBrowserContext');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  const errors = [];
  const onEvent = (m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  listeners.add(onEvent);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 768 });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Espera fins que l'expressió doni un valor «cert» i el torna.
  const waitFor = async (expression, { timeout = 8000, what = expression } = {}) => {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try { last = await evaluate(expression); if (last) return last; } catch { /* la pàgina encara carrega */ }
      await sleep(80);
    }
    throw new Error(`No ha passat a temps: ${what}`);
  };
  // Busca un element per selector i, si cal, pel text que conté (sense distingir majúscules).
  const find = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((el) => el.offsetParent !== null && (${JSON.stringify(text ?? '')} === '' || el.textContent.toLowerCase().includes(${JSON.stringify((text ?? '').toLowerCase())})))`;

  const page = {
    errors,
    evaluate,
    waitFor,
    async goto(url) {
      await s('Page.navigate', { url });
      await waitFor('document.readyState === "complete" && document.querySelector("#app")?.children.length > 0', { what: `carregar ${url}` });
    },
    // Espera que hi hagi un element visible (amb el text, si n'hi ha) i el torna descrit.
    async see(selector, text) {
      return waitFor(`(() => { const el = ${find(selector, text)}; return el ? (el.textContent.trim().slice(0, 80) || el.tagName) : null; })()`,
        { what: `veure ${selector}${text ? ` «${text}»` : ''}` });
    },
    // Clic de debò (amb el ratolí, al mig de l'element), com el faria una persona.
    async click(selector, text) {
      const box = await waitFor(`(() => { const el = ${find(selector, text)}; if (!el) return null; el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`,
      { what: `clicar ${selector}${text ? ` «${text}»` : ''}` });
      for (const type of ['mousePressed', 'mouseReleased']) await s('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(60);
    },
    async type(selector, text) {
      await page.click(selector);
      await s('Input.insertText', { text });
      await sleep(60);
    },
    // La pàgina no s'ha d'escapar pels costats (res més ample que la pantalla).
    overflowX: () => evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'),
    async screenshot(file) {
      const shot = await s('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    },
    async close() {
      listeners.delete(onEvent);
      await send('Target.closeTarget', { targetId }).catch(() => {});
      await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
    },
  };
  return page;
}
