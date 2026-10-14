// node tables.mjs <markedPrefix> <inMd> <outMd> <figDir> <workDir>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const [markedPrefix, inMd, outMd, figDir, work] = process.argv.slice(2);
const { marked } = createRequire(markedPrefix + "/package.json")("marked");
const BASE = "https://zhenyan1214.github.io/TallyPay/figures/";

const META = [
  null,
  ["table-01-arc-timeline", "Arc, as of October 2026"],
  ["table-02-evidence", "The demand is measured, not assumed"],
  ["table-03-tools-on-arc", "What exists on Arc today"],
  ["table-04-why-arc", "Why Arc: properties that make the join deterministic"],
  ["table-05-modules", "Four modules"],
  ["table-06-seven-states", "Every transfer and ledger line ends in exactly one state"],
  ["table-07-evidence-grades", "Four grades of evidence, strongest first"],
  ["table-08-exports", "Output an accountant can use"],
  ["table-09-demo-cases", "PromptBazaar demo: every case is a real Arc mainnet transaction"],
  ["table-10-cost", "Measured on Arc mainnet · 21 gwei · 2026-10-13"],
  ["table-11-comparison", "How Tieout relates to existing tools"],
  ["table-12-prior-art", "Patterns brought to Arc from production payment systems"],
  ["table-13-roadmap", "Roadmap"],
];
const TAG = { matched: "ok", matched_by_intent: "in", mismatch: "mm", ambiguous: "am", missing: "np", duplicate: "ux", unexpected: "ux" };

const lines = readFileSync(inMd, "utf8").split("\n");
const out = []; const jobs = [];
let i = 0, n = 0;
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const linkRe = /\[([^\]]+)\]\((https?:[^)]+)\)/g;
const plain = (s) => s.replace(linkRe, "$1").replace(/[*`]/g, "").replace(/<[^>]+>/g, "").trim();
while (i < lines.length) {
  if (!lines[i].startsWith("|")) { out.push(lines[i++]); continue; }
  const block = [];
  while (i < lines.length && lines[i].startsWith("|")) block.push(lines[i++]);
  const idx = n++;
  if (idx === 0) {
    for (const r of block.slice(2)) { const [k, v] = cells(r); out.push(`- ${k}: ${v}`); }
    continue;
  }
  const [slug, title] = META[idx];
  const rows = block.filter((_, j) => j !== 1).map(cells);
  const head = rows[0], body = rows.slice(1);
  const md = block.join("\n").replace(/✅/g, '<span class="tag ok">Yes</span>').replace(/❌ not listed/g, '<span class="tag ux">Not listed</span>').replace(/❌/g, '<span class="tag ux">No</span>');
  let html = marked.parse(md, { gfm: true })
    .replace(/<code>([a-z_]+)<\/code>/g, (m, s) => (TAG[s] ? `<span class="tag ${TAG[s]}">${s}</span>` : m))
    .replace(/<tr>\s*<td><strong>Tieout<\/strong>/g, '<tr class="us"><td><strong>Tieout</strong>');
  const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${work}/../fig/base.css"><style>
  body{background:#f7f8fa} .wrap{width:1080px;padding:34px 40px 30px}
  .kicker{font-size:15px} h2{font-size:26px;font-weight:600;letter-spacing:-0.03em;margin:4px 0 18px}
  table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:16px;line-height:1.45}
  th{background:#f8fafc;text-align:left;font-weight:600;font-size:14px;color:#475569;padding:11px 16px;border-bottom:1px solid #e2e8f0}
  td{padding:12px 16px;border-bottom:1px solid #eef2f6;vertical-align:top;color:#1e293b}
  tr:last-child td{border-bottom:none} td:first-child{font-weight:500;color:#0b1220}
  th[align=right],td[align=right]{text-align:right;font-family:"JetBrains Mono";font-size:14.5px}
  code{font-family:"JetBrains Mono";font-size:13.5px;background:#f1f5f9;border-radius:5px;padding:1px 5px;color:#0f172a}
  a{color:#047857;text-decoration:none;font-family:"JetBrains Mono";font-size:14px}
  strong{font-weight:600} .tag{font-size:13.5px;font-family:"JetBrains Mono";white-space:nowrap}
  tr.us td{background:#ecfdf5} a{white-space:nowrap} ${idx === 9 || idx === 1 ? "td:first-child{white-space:nowrap}" : ""}
  .foot{position:static;margin-top:14px;font-size:13px;color:#94a3b8}
  </style></head><body><div class="wrap"><div class="kicker">Table ${idx} · Tieout</div><h2>${title}</h2>${html}<div class="foot">Tieout · reconciliation for USDC on Arc · github.com/ZhenYan1214/TallyPay</div></div></body></html>`;
  const file = `${work}/${slug}.html`;
  writeFileSync(file, page);
  jobs.push({ file, png: `${figDir}/${slug}.png` });
  out.push(`![${title}](${BASE}${slug}.png)`);
  // keep links clickable below the image
  const links = []; let prevFirst = "";
  for (const r of body) {
    const first = plain(r[0]) || prevFirst; prevFirst = first;
    for (const c of r) for (const m of c.matchAll(linkRe)) {
      const label = plain(r[0]) === plain(m[1]) ? plain(r[1]) : first;
      links.push(`- ${label}: [${m[1]}](${m[2]})`);
    }
  }
  if (links.length) out.push("", ...links);
}
writeFileSync(outMd, out.join("\n"));
console.log("tables:", n - 1, "images");

// capture
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(work + "/prof", { recursive: true });
const port = 9334;
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${work}/prof`, "--window-size=1160,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let k = 0; k < 50 && !target; k++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: 1160, height: 900, deviceScaleFactor: 2, mobile: false });
await send("Page.enable");
for (const j of jobs) {
  await send("Page.navigate", { url: "file:///" + j.file });
  await sleep(900);
  const r = await send("Runtime.evaluate", { expression: `document.fonts.ready.then(()=>{const b=document.querySelector('.wrap').getBoundingClientRect();return JSON.stringify({w:b.width,h:b.height})})`, awaitPromise: true, returnByValue: true });
  const { w, h } = JSON.parse(r.result.result.value);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(j.png, Buffer.from(shot.result.data, "base64"));
  console.log(j.png.split("/").pop(), Math.round(w), "x", Math.round(h));
}
ws.close(); proc.kill();
