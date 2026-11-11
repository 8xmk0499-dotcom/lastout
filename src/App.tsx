import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io();
const AV = ["🦁","🐯","🐼","🦊","🐸","🐵","🦄","🐙","🐲","🦖","🤖","👽","🥷","🧙","🦸","🧛"];
const SYM = ["🔴", "🟢", "🔵", "🟡"];
const HELP: Record<string, string> = {
  reaction: "⚡ झटपट प्रतिक्रिया: हिरवा होताच टॅप करा! आधी टॅप केलात तर बाद.",
  memory: "🧠 आठवण: क्रम लक्षात ठेवा आणि तोच क्रम दाबा.",
  tiles: "🧱 फुटणाऱ्या टाइल्स: सुरक्षित टाइल निवडा, काही फुटतील!",
  rlgl: "🚦 हिरवा = वेगाने टॅप करा, लाल = थांबा! लाल वर टॅप केला तर बाद.",
  showdown: "🔥 अंतिम सामना: सिग्नल येताच सर्वात आधी टॅप करा!",
};
type PV = { pid: string; name: string; avatar: string; connected: boolean; alive: boolean; score: number };
type St = { code: string; host: string; min: number; phase: string; round: number; ch: any; t0: number; dur: number; now: number; fallen: string[]; info: any; players: PV[] };
const tok = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const big = "w-full py-4 rounded-2xl text-lg font-bold shadow-lg active:scale-95 transition";

function Challenge({ st, go, srv }: { st: St; go: number; srv: () => number }) {
  const t = st.ch.type as string;
  const [done, setDone] = useState<any>(null);
  const [seq, setSeq] = useState<number[]>([]);
  const [taps, setTaps] = useState(0);
  const act = (d: any = {}) => socket.emit("act", d);
  if (t === "reaction" || t === "showdown") {
    const live = go > 0 && srv() >= go;
    return <button disabled={!!done} onClick={() => { setDone(1); act(); }} className={`h-64 w-full rounded-3xl text-4xl font-extrabold ${done ? "bg-slate-600" : live ? "bg-green-500" : "bg-red-600"}`}>{done ? "✔" : live ? "टॅप!" : "थांबा…"}</button>;
  }
  if (t === "memory") {
    if (srv() < st.t0 + st.ch.showMs) return <div className="text-5xl text-center p-6 bg-slate-800 rounded-3xl leading-relaxed">{st.ch.seq.map((i: number) => SYM[i]).join(" ")}</div>;
    return (
      <div className="flex flex-col gap-4 items-center">
        <div className="text-4xl min-h-12">{seq.map((i) => SYM[i]).join(" ")}</div>
        <div className="grid grid-cols-2 gap-4 w-full">
          {SYM.map((s, i) => (
            <button key={i} disabled={!!done} className="text-6xl py-6 rounded-3xl bg-slate-700 active:scale-95" onClick={() => {
              const n = [...seq, i]; setSeq(n); if (n.length === st.ch.seq.length) { setDone(1); act({ seq: n }); }
            }}>{s}</button>
          ))}
        </div>
      </div>
    );
  }
  if (t === "tiles") {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: st.ch.n }, (_, i) => (
          <button key={i} disabled={done !== null} onClick={() => { setDone(i); act({ i }); }}
            className={`h-28 rounded-2xl text-4xl ${done === i ? "bg-pink-500" : "bg-slate-700"}`}>{done === i ? "🧍" : "⬜"}</button>
        ))}
      </div>
    );
  }
  const seg = st.ch.sched.find((x: any) => srv() >= x.from && srv() < x.to);
  return (
    <div className="flex flex-col gap-3 items-center">
      <button onClick={() => { setTaps(taps + 1); act(); }} className={`h-64 w-full rounded-3xl text-4xl font-extrabold ${seg?.g ? "bg-green-500" : "bg-red-600"}`}>{seg?.g ? "टॅप टॅप टॅप!" : "थांबा! ✋"}</button>
      <div className="text-xl">टॅप: {taps}</div>
    </div>
  );
}

export default function App() {
  const [st, setSt] = useState<St | null>(null);
  const [me, setMe] = useState("");
  const [err, setErr] = useState("");
  const [, tick] = useState(0);
  const [go, setGo] = useState(0);
  const [name, setName] = useState(() => localStorage.getItem("lo_name") || "");
  const [av, setAv] = useState(() => localStorage.getItem("lo_av") || AV[0]);
  const [code, setCode] = useState((location.pathname.match(/^\/join\/([A-Za-z0-9]{3,8})/)?.[1] || "").toUpperCase());
  const [token] = useState(() => localStorage.getItem("lo_tok") || tok());
  const off = useRef(0); const room = useRef(""); const prof = useRef({ token, name, avatar: av });
  prof.current = { token, name, avatar: av };
  const srv = () => Date.now() + off.current;

  useEffect(() => {
    socket.on("state", (s: St) => { off.current = s.now - Date.now(); room.current = s.code; if (s.phase !== "play") setGo(0); setSt(s); });
    socket.on("go", (d: { at: number }) => setGo(d.at));
    socket.on("connect", () => { if (room.current) socket.emit("join", { code: room.current, ...prof.current }, (r: any) => { if (!r.ok) { room.current = ""; setSt(null); } }); });
    const i = setInterval(() => tick((n) => n + 1), 100);
    return () => { socket.off("state"); socket.off("go"); socket.off("connect"); clearInterval(i); };
  }, []);

  const enter = (ev: string, extra: any = {}) => {
    const n = name.trim(); if (!n) return setErr("टोपणनाव लिहा");
    localStorage.setItem("lo_name", n); localStorage.setItem("lo_av", av); localStorage.setItem("lo_tok", token);
    socket.emit(ev, { ...prof.current, name: n, ...extra }, (r: any) => { if (r.ok) { setMe(r.pid); setErr(""); room.current = r.code; history.replaceState(null, "", "/"); } else setErr(r.error); });
  };
  const leave = () => { socket.emit("leave"); room.current = ""; setSt(null); };
  const left = st ? Math.max(0, Math.ceil((st.t0 + st.dur - srv()) / 1000)) : 0;
  const alive = st?.players.filter((p) => p.alive).length ?? 0;
  const mine = st?.players.find((p) => p.pid === me);
  const isHost = st?.host === me;
  const link = st ? `${location.origin}/join/${st.code}` : "";
  const byPid = (pid: string) => st?.players.find((p) => p.pid === pid);

  return (
    <div className="max-w-md mx-auto p-4 min-h-screen flex flex-col gap-4">
      <h1 className="text-center text-4xl font-extrabold bg-gradient-to-r from-pink-500 to-yellow-400 bg-clip-text text-transparent">LastOut</h1>

      {!st && (
        <>
          <div className="text-center text-6xl">{av}</div>
          <input value={name} maxLength={16} placeholder="तुमचे टोपणनाव" onChange={(e) => setName(e.target.value)} className="p-4 rounded-2xl text-lg bg-slate-800 border-2 border-pink-400 outline-none" />
          <div className="grid grid-cols-8 gap-1">{AV.map((a) => <button key={a} onClick={() => setAv(a)} className={`text-2xl p-1 rounded-lg ${av === a ? "bg-pink-500" : "bg-slate-800"}`}>{a}</button>)}</div>
          {err && <div className="p-3 rounded-xl bg-red-200 text-red-900 text-center font-semibold">{err}</div>}
          <button onClick={() => enter("create")} className={`${big} bg-green-600`}>➕ रूम तयार करा</button>
          <input value={code} maxLength={8} placeholder="रूम कोड" onChange={(e) => setCode(e.target.value.toUpperCase())} className="p-4 rounded-2xl text-2xl tracking-widest text-center bg-slate-800 border-2 border-indigo-400 outline-none" />
          <button onClick={() => enter("join", { code })} disabled={code.length < 3} className={`${big} bg-indigo-600 disabled:opacity-40`}>सामील व्हा</button>
        </>
      )}

      {st && st.phase === "lobby" && (
        <>
          <div className="text-center p-4 rounded-3xl bg-indigo-700"><div className="text-sm opacity-80">रूम कोड</div><div className="text-5xl font-extrabold tracking-[0.3em]">{st.code}</div></div>
          <a href={`https://wa.me/?text=${encodeURIComponent("LastOut मध्ये माझ्यासोबत खेळा! कोड: " + st.code + "\n" + link)}`} target="_blank" rel="noreferrer" className={`${big} bg-green-500 text-center block`}>💬 WhatsApp वर पाठवा</a>
          <div className="flex flex-col gap-2">{st.players.map((p) => (
            <div key={p.pid} className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-800 ${p.connected ? "" : "opacity-40"}`}>
              <span className="text-3xl">{p.avatar}</span><span className="flex-1 font-semibold">{p.name} {p.pid === me && "⭐"}</span>{p.pid === st.host && <span>👑</span>}
            </div>))}</div>
          {isHost ? <button disabled={st.players.filter((p) => p.connected).length < st.min} onClick={() => socket.emit("start")} className={`${big} bg-pink-600 disabled:opacity-40`}>▶ खेळ सुरू करा (किमान {st.min})</button>
            : <p className="text-center opacity-70">होस्ट खेळ सुरू करेल…</p>}
          <button onClick={leave} className={`${big} bg-red-600`}>रूम सोडा</button>
        </>
      )}

      {st && st.phase !== "lobby" && (
        <>
          <div className="flex justify-between font-bold"><span>फेरी {st.round}</span><span>⏱ {left}</span><span>जिवंत {alive}/{st.players.length}</span></div>
          <div className="flex flex-wrap gap-2 justify-center">{st.players.map((p) => <span key={p.pid} className={`text-3xl ${p.alive ? "" : "opacity-25 grayscale"}`} title={p.name}>{p.avatar}</span>)}</div>
          {st.phase === "countdown" && <div className="text-center text-6xl font-extrabold py-16">{left || "🚀"}</div>}
          {st.phase === "intro" && <div className="text-center text-xl p-6 bg-slate-800 rounded-3xl">{HELP[st.ch.type]}</div>}
          {st.phase === "play" && (mine?.alive ? <Challenge key={st.round + st.ch.type} st={st} go={go} srv={srv} /> : <div className="text-center text-2xl p-8">💀 तुम्ही बाद झालात — बाकीचे खेळ पाहा</div>)}
          {st.phase === "result" && (
            <div className="flex flex-col gap-2 text-center">
              {st.info?.safe && <div className="text-xl">सुरक्षित टाइल्स: {st.info.safe.map((i: number) => i + 1).join(", ")}</div>}
              {st.fallen.length ? st.fallen.map((pid) => <div key={pid} className="p-3 rounded-2xl bg-red-900 text-xl">{byPid(pid)?.avatar} {byPid(pid)?.name} बाद झाले 💀</div>) : <div className="text-xl">या फेरीत कोणी बाद नाही!</div>}
            </div>)}
          {st.phase === "end" && (
            <div className="flex flex-col gap-3 text-center">
              <div className="text-6xl">🏆</div>
              <div className="text-3xl font-extrabold">{byPid(st.info?.winner)?.avatar} {byPid(st.info?.winner)?.name ?? "—"} चॅम्पियन!</div>
              {[...st.players].sort((a, b) => b.score - a.score).map((p, i) => <div key={p.pid} className="flex justify-between p-3 rounded-2xl bg-slate-800"><span>{i + 1}. {p.avatar} {p.name}</span><b>{p.score}</b></div>)}
              {isHost && <button onClick={() => socket.emit("again")} className={`${big} bg-pink-600`}>🔁 पुन्हा खेळा</button>}
              <button onClick={leave} className={`${big} bg-red-600`}>रूम सोडा</button>
            </div>)}
        </>
      )}
    </div>
  );
}
