/**
 * Headless Chrome CDP smoke: click 1+2= and check SpaceRain WebGL2.
 * Usage: node/bun scripts/browser-smoke.mjs [baseUrl]
 */
const baseUrl = process.argv[2] || "http://127.0.0.1:3460";

const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 9223;
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-angle=metal",
    `--remote-debugging-port=${port}`,
    "--user-data-dir=/tmp/ahcalc-chrome-profile",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

await sleep(800);

async function waitForDebug() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error("Chrome debug port not ready");
}

await waitForDebug();

const newPage = await fetch(
  `http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl + "/")}`,
  { method: "PUT" },
);
const page = await newPage.json();
if (!page.webSocketDebuggerUrl) {
  console.error(page);
  chrome.kill();
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  // oxlint-disable-next-line eqeqeq -- nullish check; === null would miss undefined
  if (msg.id != null && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

function send(method, params = {}) {
  const id = ++mid;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");
await send("Runtime.enable");
await send("Page.enable");

const networkFails = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Network.responseReceived") {
    const { response, type } = msg.params;
    if (response.status >= 400 && response.url.includes("/assets/")) {
      networkFails.push({ status: response.status, url: response.url, type });
    }
  }
  if (msg.method === "Network.loadingFailed") {
    networkFails.push({ failed: true, ...msg.params });
  }
});

await send("Page.navigate", { url: baseUrl + "/" });
await sleep(2500);

const evalRes = await send("Runtime.evaluate", {
  expression: `(() => {
    const click = (id) => {
      const el = document.querySelector('[data-testid="ahcalc-key-' + id + '"]');
      if (!el) throw new Error('missing key ' + id);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };
    click('1');
    click('add');
    click('2');
    click('eq');
    return new Promise((r) => setTimeout(() => {
      const display = document.querySelector('[data-testid="ahcalc-display"]')?.textContent?.trim();
      const canvas = document.querySelector('[data-testid="ahcalc-space-rain"]');
      let rain = null;
      if (canvas instanceof HTMLCanvasElement) {
        rain = {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        };
      }
      const resources = performance.getEntriesByType('resource')
        .filter((e) => e.name.includes('/assets/'))
        .map((e) => ({ name: e.name, status: e.responseStatus }));
      const bad = resources.filter((e) => e.status && e.status >= 400);
      r({ display, rain, diagnostics: window.__spaceRainDiagnostics, bad, assetCount: resources.length });
    }, 400));
  })()`,
  awaitPromise: true,
  returnByValue: true,
});

const value = evalRes.result?.result?.value ?? evalRes.result;
console.log(JSON.stringify({ value, networkFails }, null, 2));

ws.close();
chrome.kill();

const displayOk = value?.display === "3";
const rainOk =
  value?.rain &&
  value.rain.clientWidth > 0 &&
  value.rain.clientHeight > 0 &&
  value.rain.width > 0 &&
  ["running", "paused"].includes(value?.diagnostics?.status) &&
  value?.diagnostics?.resources?.contexts === 1;
const assetsOk = !value?.bad?.length && !networkFails.length;

if (!displayOk || !rainOk || !assetsOk) {
  console.error("SMOKE_FAIL", { displayOk, rainOk, assetsOk });
  process.exit(1);
}
console.log("SMOKE_OK");
