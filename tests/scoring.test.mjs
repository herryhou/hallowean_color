/* End-to-end scoring regression test.
   Runs the real app in Chrome against the two committed test photos and
   asserts front/back/final scores per target color stay within tolerance
   of the values measured for COLOR_STANDARD_V4 (commit e70cb31).

   Usage: node tests/scoring.test.mjs
   Needs: system Chrome, network (AI models download once, then cached).
   First run can take a few minutes (RMBG ~44MB + MediaPipe ~16MB). */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const PORT = 8899;
const ROOT = new URL("..", import.meta.url).pathname;

/* [color, photo, expected score, tolerance] — expected = measured on T1/T2
   under V4 (RED: CbCr adaptive cluster; YELLOW: MediaPipe-label rule;
   BLUE: no skin exclusion). Tolerance covers model nondeterminism and
   minor segmentation jitter, not rule changes. */
const EXPECTED = [
  ["RED",    "T1", 17.07, 1.5],
  ["RED",    "T2", 19.99, 1.5],
  ["YELLOW", "T1", 25.65, 1.5],
  ["YELLOW", "T2", 27.09, 1.5],
  ["BLUE",   "T1", 33.24, 1.5],
  ["BLUE",   "T2", 29.85, 1.5]
];
const FINAL_EXPECTED = [
  ["RED",    18.53],
  ["YELLOW", 26.37],
  ["BLUE",   31.54]
];

const MIME = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".ico": "image/x-icon" };

function serve() {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      try {
        const path = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
        const buf = await readFile(join(ROOT, path));
        res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
        res.end(buf);
      } catch {
        res.writeHead(404); res.end("not found");
      }
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

let failures = 0;
function check(label, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual.toFixed(2)} (expected ${expected} ±${tol})`);
  return actual;
}

const srv = await serve();
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/index.html`);

  // analyzePhoto awaits the segmentation models internally; first run
  // downloads them, so allow a long budget.
  const results = await page.evaluate(async () => {
    const loadImg = src => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("img load " + src));
      im.src = src;
    });
    const out = {};
    for (const name of ["T1", "T2"]) {
      const img = await loadImg("/assets/" + name + ".jpg");
      out[name] = {};
      for (const color of ["RED", "YELLOW", "BLUE"]) {
        const r = await scoringEngine.analyzePhoto(img, color);
        out[name][color] = { score: r.score, skinMode: r.skinMode };
      }
    }
    return out;
  }, null, { timeout: 300000 });

  const perPhoto = {};
  for (const [color, photo, expected, tol] of EXPECTED) {
    const r = results[photo][color];
    perPhoto[color] = perPhoto[color] || {};
    perPhoto[color][photo] = check(`${color} ${photo === "T1" ? "front" : "back "}`, r.score, expected, tol);
    if (r.skinMode !== "adaptive" && r.skinMode !== "global") {
      failures++;
      console.log(`FAIL  ${color} ${photo}: unexpected skinMode ${r.skinMode}`);
    }
  }
  for (const [color, expected] of FINAL_EXPECTED) {
    const final = (perPhoto[color].T1 + perPhoto[color].T2) / 2;
    check(`${color} final`, final, expected, 1.0);
  }
} finally {
  await browser.close();
  srv.close();
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
