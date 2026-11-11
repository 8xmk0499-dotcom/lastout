import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { randomInt, randomUUID } from "crypto";

const MIN = Number(process.env.MIN_PLAYERS) || 4, MAX = 15, GRACE = 60000;
const AV = ["🦁","🐯","🐼","🦊","🐸","🐵","🦄","🐙","🐲","🦖","🤖","👽","🥷","🧙","🦸","🧛"];
const CC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
type P = { token: string; pid: string; name: string; avatar: string; connected: boolean; sid: string | null; alive: boolean; score: number; timer?: NodeJS.Timeout };
type R = { code: string; host: string; players: Map<string, P>; phase: string; round: number; ch: any; sec: any; t0: number; dur: number; last: string; inp: Map<string, any>; live: boolean; gen: number; fallen: string[]; info: any };
const rooms = new Map<string, R>();

const app = express(); const http = createServer(app); const io = new Server(http);
app.get("/health", (_q, r) => { r.json({ ok: true, rooms: rooms.size }); });
const dist = path.resolve(process.cwd(), "dist");
app.use(express.static(dist));
app.get("*", (_q, r) => { r.sendFile(path.join(dist, "index.html")); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + randomInt(b - a + 1);
const view = (r: R) => ({ code: r.code, host: r.host, min: MIN, phase: r.phase, round: r.round, ch: r.ch, t0: r.t0, dur: r.dur, now: Date.now(), fallen: r.fallen, info: r.info,
  players: [...r.players.values()].map((p) => ({ pid: p.pid, name: p.name, avatar: p.avatar, connected: p.connected, alive: p.alive, score: p.score })) });
const push = (r: R) => io.to(r.code).emit("state", view(r));
const setPhase = (r: R, phase: string, dur: number, ch: any) => { r.phase = phase; r.t0 = Date.now(); r.dur = dur; r.ch = ch; push(r); };

async function play(r: R) {
  const g = ++r.gen; const ok = () => r.gen === g && rooms.has(r.code);
  const ps = () => [...r.players.values()];
  r.round = 0; r.last = ""; r.fallen = []; r.info = null;
  ps().forEach((p) => { p.alive = p.connected; p.score = 0; });
  setPhase(r, "countdown", 3000, null); await sleep(3000);
  let wasShow = false;
  while (ok()) {
    const alive = ps().filter((p) => p.alive);
    if (alive.length <= 1) break;
    r.round++; const lvl = r.round;
    const type = alive.length === 2 ? "showdown" : ["reaction", "memory", "tiles", "rlgl"].filter((t) => t !== r.last)[randomInt(3)];
    r.last = type; wasShow = type === "showdown";
    const pub: any = { type }; const sec: any = {}; let dur = 0;
    if (type === "reaction" || type === "showdown") { sec.delay = rnd(2000, 5000); sec.win = type === "showdown" ? 2000 : Math.max(450, 1200 - lvl * 130); pub.win = sec.win; dur = sec.delay + sec.win + 500; }
    else if (type === "memory") { const n = Math.min(3 + lvl, 10); pub.seq = Array.from({ length: n }, () => randomInt(4)); pub.showMs = n * 700; sec.seq = pub.seq; dur = pub.showMs + n * 1300 + 3000; }
    else if (type === "tiles") { pub.n = 6; sec.safe = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, Math.max(2, 5 - Math.floor(lvl / 2))); dur = 6000; }
    r.fallen = []; r.info = null; r.inp = new Map(); r.live = false;
    setPhase(r, "intro", 3500, { type }); await sleep(3500); if (!ok()) return;
    const start = Date.now();
    if (type === "rlgl") {
      const sched: any[] = []; let t = start;
      for (let i = 0; i < 5; i++) { const gr = i % 2 === 0; const len = gr ? rnd(1800, 3200) : rnd(1200, 2400); sched.push({ g: gr, from: t, to: t + len }); t += len; }
      pub.sched = sched; sec.min = 6 + lvl * 2; dur = t - start + 300;
    }
    if (type === "reaction" || type === "showdown") { sec.goAt = start + sec.delay; setTimeout(() => { if (ok()) io.to(r.code).emit("go", { at: sec.goAt }); }, sec.delay); }
    r.sec = sec; r.live = true; setPhase(r, "play", dur, pub);
    await sleep(dur); if (!ok()) return; r.live = false;
    const pass = (p: P) => { const e = r.inp.get(p.token); if (!e) return false;
      if (type === "memory") return !!e.seq && e.seq.length === sec.seq.length && e.seq.every((v: number, i: number) => v === sec.seq[i]);
      if (type === "tiles") return sec.safe.includes(e.i);
      if (type === "rlgl") return e.red === 0 && e.taps >= sec.min;
      return e.t >= sec.goAt && e.t <= sec.goAt + sec.win; };
    const perf = (p: P) => { const e = r.inp.get(p.token); return !e ? Infinity : type === "rlgl" ? -e.taps : (e.t ?? Infinity); };
    const passers = alive.filter(pass); let out = alive.filter((p) => !passers.includes(p));
    if (out.length === alive.length) out = [];                       // everyone failed: nobody is eliminated
    else if (out.length === 0) out = [alive.reduce((a, b) => (perf(b) > perf(a) ? b : a))]; // everyone passed: slowest is out
    while (alive.length > 2 && alive.length - out.length < 2) out.sort((a, b) => perf(a) - perf(b)).shift(); // always reach a 2-player showdown
    passers.forEach((p) => { p.score += 100; }); out.forEach((p) => { p.alive = false; });
    r.fallen = out.map((p) => p.pid); r.info = type === "tiles" ? { safe: sec.safe } : {};
    setPhase(r, "result", 4000, pub); await sleep(4000);
  }
  if (!ok()) return;
  const w = ps().find((p) => p.alive);
  if (w) { if (wasShow) w.score += 500; w.score += 1000; }
  r.info = { winner: w?.pid }; r.fallen = []; setPhase(r, "end", 0, null);
}

function validProfile(d: any) {
  if (!d || typeof d.token !== "string" || d.token.length < 8 || d.token.length > 64) return null;
  const name = typeof d.name === "string" ? d.name.trim().slice(0, 16) : "";
  return name && AV.includes(d.avatar) ? { token: d.token, name, avatar: d.avatar } : null;
}
function removePlayer(r: R, token: string) {
  const p = r.players.get(token); if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  r.players.delete(token);
  if (r.players.size === 0) { rooms.delete(r.code); return; }
  if (r.host === p.pid) r.host = [...r.players.values()][0].pid;
  push(r);
}

io.on("connection", (socket) => {
  const ack = (cb: any, res: any) => { if (typeof cb === "function") cb(res); };
  const enter = (r: R, p: P) => { if (p.timer) clearTimeout(p.timer); p.sid = socket.id; p.connected = true; socket.join(r.code); socket.data.code = r.code; socket.data.token = p.token; push(r); };
  const mine = () => { const r = rooms.get(socket.data.code); const p = r?.players.get(socket.data.token); return r && p ? { r, p } : null; };
  const mk = (prof: any): P => ({ ...prof, pid: randomUUID().slice(0, 8), connected: true, sid: null, alive: true, score: 0 });

  socket.on("create", (d: any, cb: any) => {
    const prof = validProfile(d); if (!prof) return ack(cb, { ok: false, error: "प्रोफाइल चुकीची" });
    let code = ""; do { code = Array.from({ length: 5 }, () => CC[randomInt(CC.length)]).join(""); } while (rooms.has(code));
    const p = mk(prof);
    const r: R = { code, host: p.pid, players: new Map([[p.token, p]]), phase: "lobby", round: 0, ch: null, sec: {}, t0: 0, dur: 0, last: "", inp: new Map(), live: false, gen: 0, fallen: [], info: null };
    rooms.set(code, r); enter(r, p); ack(cb, { ok: true, code, pid: p.pid });
  });
  socket.on("join", (d: any, cb: any) => {
    const prof = validProfile(d); if (!prof) return ack(cb, { ok: false, error: "प्रोफाइल चुकीची" });
    const r = rooms.get(String(d.code || "").trim().toUpperCase()); if (!r) return ack(cb, { ok: false, error: "रूम सापडली नाही" });
    let p = r.players.get(prof.token);
    if (!p) {
      if (r.phase !== "lobby") return ack(cb, { ok: false, error: "खेळ आधीच सुरू झाला आहे" });
      if (r.players.size >= MAX) return ack(cb, { ok: false, error: "रूम भरली आहे" });
      p = mk(prof); r.players.set(p.token, p);
    }
    enter(r, p); ack(cb, { ok: true, code: r.code, pid: p.pid });
  });
  socket.on("start", () => {
    const m = mine(); if (!m || m.r.host !== m.p.pid || m.r.phase !== "lobby") return;
    if ([...m.r.players.values()].filter((p) => p.connected).length < MIN) return;
    play(m.r).catch((e) => console.error(e));
  });
  socket.on("again", () => { const m = mine(); if (m && m.r.host === m.p.pid && m.r.phase === "end") { m.r.gen++; m.r.phase = "lobby"; m.r.round = 0; m.r.info = null; push(m.r); } });
  socket.on("act", (d: any) => {
    const m = mine(); if (!m) return; const { r, p } = m;
    if (r.phase !== "play" || !r.live || !p.alive) return;
    const now = Date.now(); let e = r.inp.get(p.token); if (!e) { e = { taps: 0, red: 0 }; r.inp.set(p.token, e); }
    if (r.last === "rlgl") {
      if (e.taps > 300) return; e.taps++;
      const s = r.ch.sched.find((x: any) => now >= x.from && now < x.to);
      if (s && !s.g && now > s.from + 300) e.red++;
      return;
    }
    if (e.t) return; e.t = now;
    if (r.last === "memory") { if (Array.isArray(d?.seq) && d.seq.length <= 12 && d.seq.every((v: any) => Number.isInteger(v) && v >= 0 && v < 4)) e.seq = d.seq; }
    else if (r.last === "tiles") { if (Number.isInteger(d?.i)) e.i = d.i; }
  });
  socket.on("leave", () => {
    const m = mine(); if (!m) return; socket.leave(m.r.code); socket.data.code = undefined;
    if (m.r.phase === "lobby" || m.r.phase === "end") removePlayer(m.r, m.p.token);
    else { m.p.alive = false; m.p.connected = false; push(m.r); }
  });
  socket.on("disconnect", () => {
    const m = mine(); if (!m || m.p.sid !== socket.id) return;
    const { r, p } = m; p.connected = false; p.sid = null;
    if (r.host === p.pid) { const n = [...r.players.values()].find((x) => x.connected); if (n) r.host = n.pid; }
    if (r.phase === "lobby") p.timer = setTimeout(() => removePlayer(r, p.token), GRACE);
    push(r);
    if (![...r.players.values()].some((x) => x.connected)) setTimeout(() => { if (![...r.players.values()].some((x) => x.connected)) rooms.delete(r.code); }, 5 * 60000);
  });
});

http.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () => console.log("LastOut server running"));
