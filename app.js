const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS = 16;
const BARS = 8;
const SR = 48000;

const RECIPES = [
  { id: "third-walk", name: "Third walk", blurb: "Piano third steps up on the second pass, then home." },
  { id: "violin-hold", name: "Violin hold", blurb: "Violin sustains the 9th across the second pass and resolves." },
  { id: "nylon-answer", name: "Nylon answer", blurb: "Nylon answers on the and of 2 and 4. Pass one stays whole notes." },
  { id: "ghost-snare", name: "Ghost snare", blurb: "Soft snare on the e of 2. Still a snare. Not a shaker." },
  { id: "bass-approach", name: "Bass approach", blurb: "Upright walks into the next root on beat 4 of the second pass." },
  { id: "pedal-inner", name: "Pedal inner", blurb: "Piano holds a common tone. The other voices move." },
  { id: "hat-thin", name: "Hat thin", blurb: "Closed hats drop to quarters on the second pass." },
  { id: "trumpet-color", name: "Trumpet color", blurb: "Trumpet plays the 5 on bar 6 only, then out." },
  { id: "violin-swell", name: "Violin swell", blurb: "Violin attack ramps inside the bar. Not a volume bump." },
  { id: "top-fall", name: "Top fall", blurb: "Piano top voice falls a step. Bass root stays." }
];

const KEYS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const NAMES = { C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11 };

const SAMPLE_DEFS = [
  ["kick","drums/kick.mp3", null],
  ["snare","drums/snare.mp3", null],
  ["hat","drums/hihat.mp3", null],
  ["piano-C2","piano/C2.mp3", 36],
  ["piano-C3","piano/C3.mp3", 48],
  ["piano-E3","piano/E3.mp3", 52],
  ["piano-G3","piano/G3.mp3", 55],
  ["piano-A3","piano/A3.mp3", 57],
  ["piano-C4","piano/C4.mp3", 60],
  ["piano-E4","piano/E4.mp3", 64],
  ["piano-G4","piano/G4.mp3", 67],
  ["piano-A4","piano/A4.mp3", 69],
  ["piano-C5","piano/C5.mp3", 72],
  ["bass-E1","bass/E1.mp3", 28],
  ["bass-G1","bass/G1.mp3", 31],
  ["bass-A1","bass/A1.mp3", 33],
  ["bass-C2","bass/C2.mp3", 36],
  ["bass-E2","bass/E2.mp3", 40],
  ["bass-G2","bass/G2.mp3", 43],
  ["bass-A2","bass/A2.mp3", 45],
  ["nylon-E2","guitar/E2.mp3", 40],
  ["nylon-A2","guitar/A2.mp3", 45],
  ["nylon-D3","guitar/D3.mp3", 50],
  ["nylon-E3","guitar/E3.mp3", 52],
  ["nylon-G3","guitar/G3.mp3", 55],
  ["nylon-A3","guitar/A3.mp3", 57],
  ["nylon-B3","guitar/B3.mp3", 59],
  ["nylon-E4","guitar/E4.mp3", 64],
  ["trumpet-C4","trumpet/C4.mp3", 60],
  ["trumpet-E4","trumpet/E4.mp3", 64],
  ["trumpet-G4","trumpet/G4.mp3", 67],
  ["trumpet-A4","trumpet/A4.mp3", 69],
  ["trumpet-C5","trumpet/C5.mp3", 72],
  ["violin-G3","violin/G3.mp3", 55],
  ["violin-A3","violin/A3.mp3", 57],
  ["violin-C4","violin/C4.mp3", 60],
  ["violin-E4","violin/E4.mp3", 64],
  ["violin-A4","violin/A4.mp3", 69],
  ["violin-C5","violin/C5.mp3", 72]
];

const CHAIRS = ["kick","snare","hat","piano","bass","nylon","trumpet","violin"];
const raw = {};
const buffers = {};
const missing = [];
let ctx, master, comp, chairGain = {}, timerId = null, nextStepTime = 0, step = 0, raf = 0;
const active = [];
let playOrigin = 0;

const state = {
  bpm: 98,
  key: "A",
  chordText: "Am F C G",
  chords: [],
  recipe: RECIPES[0].id,
  mode: "develop",
  playing: false,
  bars: BARS,
  mutes: Object.fromEntries(CHAIRS.map(c => [c, false]))
};

function $(id){ return document.getElementById(id); }

function parseChord(token){
  const m = String(token).trim().match(/^([A-G](?:#|b)?)(.*)$/);
  if (!m || NAMES[m[1]] == null) return null;
  const qual = m[2].toLowerCase();
  const minor = qual.startsWith("m") && !qual.startsWith("maj");
  return { symbol: token.trim(), root: NAMES[m[1]], minor };
}

function defaultChords(){
  return ["Am","F","C","G"].map(parseChord);
}

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem("passtwo-v1") || "{}");
    if (s.bpm) state.bpm = Math.max(60, Math.min(180, +s.bpm));
    if (s.key) state.key = s.key;
    if (s.chordText) state.chordText = s.chordText;
    if (s.recipe) state.recipe = s.recipe;
    if (s.mutes) state.mutes = { ...state.mutes, ...s.mutes };
  } catch (e) {}
  state.chords = parseProgression(state.chordText);
}

function saveState(){
  localStorage.setItem("passtwo-v1", JSON.stringify({
    bpm: state.bpm, key: state.key, chordText: state.chordText, recipe: state.recipe, mutes: state.mutes
  }));
}

function parseProgression(text){
  const parts = String(text).split(/[\s,]+/).filter(Boolean).slice(0, 4);
  const parsed = parts.map(parseChord).filter(Boolean);
  while (parsed.length < 4) parsed.push(defaultChords()[parsed.length]);
  return parsed;
}

function keyShift(){
  return (NAMES[state.key] ?? 9) - 9;
}

function chordAt(bar){
  const c = state.chords[bar % 4];
  const shift = keyShift();
  return { ...c, root: (c.root + shift + 120) % 12, symbol: transposeSymbol(c.symbol, shift) };
}

function transposeSymbol(symbol, semis){
  const p = parseChord(symbol);
  if (!p) return symbol;
  const name = KEYS[(p.root + semis + 120) % 12];
  const rest = symbol.replace(/^([A-G](?:#|b)?)/, "");
  return name + rest;
}

function third(c){ return c.minor ? 3 : 4; }

function voiceMidi(midi, bank){
  let n = midi;
  while (n > 76) n -= 12;
  while (n < 28) n += 12;
  let best = bank[0];
  for (const s of bank) if (Math.abs(s.midi - n) < Math.abs(best.midi - n)) best = s;
  let delta = n - best.midi;
  if (delta > 4) { n -= 12; best = bank[0]; for (const s of bank) if (Math.abs(s.midi - n) < Math.abs(best.midi - n)) best = s; delta = n - best.midi; }
  if (delta < -4) { n += 12; best = bank[0]; for (const s of bank) if (Math.abs(s.midi - n) < Math.abs(best.midi - n)) best = s; delta = n - best.midi; }
  delta = Math.max(-4, Math.min(4, delta));
  return { name: best.name, rate: Math.pow(2, delta / 12), midi: best.midi + delta };
}

function bank(prefix){
  return SAMPLE_DEFS.filter(d => d[0].startsWith(prefix) && d[2] != null).map(d => ({ name: d[0], midi: d[2] }));
}

async function ensureAudio(){
  if (!ctx) {
    ctx = new AudioContext();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    master = ctx.createGain();
    master.gain.value = 0.8;
    CHAIRS.forEach(c => {
      const g = ctx.createGain();
      g.gain.value = 1;
      chairGain[c] = g;
      g.connect(master);
    });
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state !== "running") await ctx.resume();
  started = true;
  $("tap").classList.add("hidden");
}

async function loadSamples(){
  missing.length = 0;
  let n = 0;
  for (const [name, path] of SAMPLE_DEFS) {
    const url = `${CDN}/${path}`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const ab = await r.arrayBuffer();
      raw[name] = ab;
      buffers[name] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(name);
    }
    n++;
    $("status").textContent = `Seating chairs ${n}/${SAMPLE_DEFS.length}`;
  }
  if (missing.length) {
    $("status").textContent = "Missing instruments: " + missing.join(", ");
  } else {
    $("status").textContent = "Chairs seated · FluidR3 pinned to d58301e";
  }
}

function track(src){
  active.push(src);
  src.onended = () => {
    const i = active.indexOf(src);
    if (i >= 0) active.splice(i, 1);
  };
}

function playHit(audio, name, chair, when, rate, gain, dur){
  if (state.mutes[chair] || !buffers[name] || missing.includes(name)) return;
  const src = audio.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate || 1;
  const g = audio.createGain();
  const peak = gain;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.008);
  const end = when + (dur || 0.18);
  g.gain.setValueAtTime(peak, Math.max(when + 0.01, end - 0.02));
  g.gain.linearRampToValueAtTime(0.0001, end);
  src.connect(g);
  g.connect(chairGain[chair] || master);
  src.start(when);
  src.stop(end + 0.02);
  if (audio === ctx) track(src);
}

function playHold(audio, name, chair, when, rate, gain, dur, swell){
  if (state.mutes[chair] || !buffers[name]) return;
  const src = audio.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate || 1;
  src.loop = true;
  const bufDur = buffers[name].duration;
  if (bufDur > 0.2) {
    src.loopStart = bufDur * 0.35;
    src.loopEnd = bufDur * 0.85;
  }
  const g = audio.createGain();
  const attack = swell ? Math.min(0.45, dur * 0.55) : 0.03;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(gain, when + attack);
  g.gain.setValueAtTime(gain, when + Math.max(attack, dur - 0.04));
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  src.connect(g);
  g.connect(chairGain[chair] || master);
  src.start(when);
  src.stop(when + dur + 0.02);
  if (audio === ctx) track(src);
}

function developing(bar){
  return state.mode === "develop" && bar >= 4;
}

function notesFor(bar, s, stepDur){
  const c = chordAt(bar);
  const next = chordAt((bar + 1) % 8);
  const root = 48 + c.root;
  const thirdN = root + third(c);
  const fifth = root + 7;
  const rec = state.recipe;
  const dev = developing(bar);
  const events = [];
  const kick = (when, g) => events.push({ chair:"kick", sample:"kick", when, rate:1, gain:g, dur:0.2 });
  const snare = (when, g) => events.push({ chair:"snare", sample:"snare", when, rate:1, gain:g, dur:0.18 });
  const hat = (when, g) => events.push({ chair:"hat", sample:"hat", when, rate:1, gain:g, dur:0.08 });
  if (s % 4 === 0) kick(0, 0.72);
  if (s === 8) snare(0, 0.48);
  if (dev && rec === "ghost-snare" && s === 6) snare(0, 0.16);
  if (!(dev && rec === "hat-thin" && s % 4 !== 0)) {
    if (s % 2 === 0) hat(0, dev && rec === "hat-thin" ? 0.05 : 0.08);
  }
  if (s === 0) {
    let t = thirdN;
    let top = fifth;
    if (dev && rec === "third-walk") t = thirdN + (bar % 2 === 0 ? 2 : 0);
    if (dev && rec === "top-fall") top = fifth - 2;
    if (dev && rec === "pedal-inner") top = 48 + state.chords[0].root + keyShift() + 12;
    events.push({ chair:"piano", midi: root, when:0, gain:0.22, dur: stepDur * 15, hold:true });
    events.push({ chair:"piano", midi: t, when:0, gain:0.18, dur: stepDur * 15, hold:true });
    events.push({ chair:"piano", midi: top, when:0, gain:0.16, dur: stepDur * 15, hold:true });
    events.push({ chair:"nylon", midi: root - 12, when:0, gain:0.2, dur: stepDur * 14, hold:true });
    events.push({ chair:"bass", midi: root - 24, when:0, gain:0.42, dur: stepDur * 12, hold:true });
  }
  if (dev && rec === "nylon-answer" && (s === 6 || s === 14)) {
    events.push({ chair:"nylon", midi: thirdN, when:0, gain:0.18, dur: stepDur * 1.5, hold:false });
  }
  if (dev && rec === "bass-approach" && s === 12) {
    const approach = next.root + 48 - 24 - 1;
    events.push({ chair:"bass", midi: approach, when:0, gain:0.36, dur: stepDur * 3, hold:true });
  }
  if (dev && (rec === "violin-hold" || rec === "violin-swell") && s === 0) {
    const tone = rec === "violin-hold" && bar < 7 ? root + 14 : root + 12;
    events.push({ chair:"violin", midi: tone, when:0, gain:0.2, dur: stepDur * 16, hold:true, swell: rec === "violin-swell" });
  }
  if (dev && rec === "trumpet-color" && bar === 5 && (s === 0 || s === 8)) {
    events.push({ chair:"trumpet", midi: root + 7, when:0, gain:0.22, dur: stepDur * 6, hold:true });
  }
  return events.map(e => ({ ...e, when: e.when }));
}

function scheduleStep(audio, stepIndex, when){
  const stepDur = 60 / state.bpm / 4;
  const bar = Math.floor(stepIndex / STEPS);
  const s = stepIndex % STEPS;
  const events = notesFor(bar, s, stepDur);
  for (const e of events) {
    const t = when + e.when;
    if (e.sample) playHit(audio, e.sample, e.chair, t, e.rate || 1, e.gain, e.dur);
    else {
      const prefix = e.chair === "piano" ? "piano-" : e.chair === "bass" ? "bass-" : e.chair === "nylon" ? "nylon-" : e.chair === "trumpet" ? "trumpet-" : "violin-";
      const v = voiceMidi(e.midi, bank(prefix));
      if (e.hold) playHold(audio, v.name, e.chair, t, v.rate, e.gain, e.dur, e.swell);
      else playHit(audio, v.name, e.chair, t, v.rate, e.gain, e.dur);
    }
  }
}

function scheduler(){
  if (!state.playing || !ctx) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(ctx, step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars * STEPS);
  }
}

function stop(){
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  active.forEach(s => { try { s.stop(0); } catch (e) {} });
  active.length = 0;
  paint();
}

async function play(mode){
  await ensureAudio();
  if (!Object.keys(buffers).length) await loadSamples();
  if (missing.length) return;
  stop();
  state.mode = mode;
  state.playing = true;
  nextStepTime = ctx.currentTime + 0.1;
  playOrigin = nextStepTime;
  step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  paint();
}

function playhead(){
  if (state.playing && ctx) {
    const stepDur = 60 / state.bpm / 4;
    const idx = Math.floor((ctx.currentTime - playOrigin) / stepDur);
    const bar = Math.floor(((idx % (BARS * STEPS)) + BARS * STEPS) % (BARS * STEPS) / STEPS);
    document.querySelectorAll(".bar").forEach((el, i) => el.classList.toggle("active", i === bar));
  }
  raf = requestAnimationFrame(playhead);
}

function punch(){
  const lines = state.chords.map((c, i) => `  ${i + 1}. ${transposeSymbol(c.symbol, keyShift())}`);
  const rec = RECIPES.find(r => r.id === state.recipe);
  return `PassTwo punch list\n${state.bpm} BPM · ${state.key} · ${rec.name}\n\nThe problem: the four-bar loop reprints until the track flatlines.\nThe move: ${rec.blurb}\nA is the photocopy. B keeps the chords and moves the inside on bars 5–8.\n\nChords\n${lines.join("\n")}\n\nBars 1–4 reprint. Bars 5–8 ${state.mode === "develop" ? "develop" : "reprint"}.\nLive chairs only. Distinct from TagFour, LiftTwo, PreEight, AfterHook, EndEight, LastHook, ModEight.\nDrop the WAV on bar 1. Loop it. The downbeat is sample 0.`;
}

function paint(){
  $("recipes").innerHTML = "";
  RECIPES.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r.id; saveState(); paint(); };
    $("recipes").appendChild(b);
  });
  $("mutes").innerHTML = "";
  CHAIRS.forEach(c => {
    const b = document.createElement("button");
    b.textContent = (state.mutes[c] ? "Muted " : "") + c;
    b.className = state.mutes[c] ? "on" : "";
    b.onclick = () => { state.mutes[c] = !state.mutes[c]; saveState(); paint(); };
    $("mutes").appendChild(b);
  });
  $("bars").innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const d = document.createElement("div");
    d.className = "bar" + (i >= 4 ? " pass" : "");
    d.innerHTML = `<div class="n">${i + 1} · ${i >= 4 ? "pass 2" : "pass 1"}</div><div class="c">${chordAt(i).symbol}</div>`;
    $("bars").appendChild(d);
  }
  $("punch").textContent = punch();
  $("bpm").value = state.bpm;
  $("chords").value = state.chordText;
  $("key").value = state.key;
}

function encodeWav(audioBuffer, withTail){
  const channels = 2;
  const len = audioBuffer.length;
  const outLen = withTail ? len : Math.round(BARS * 4 * 60 / state.bpm * SR);
  const peakTarget = Math.pow(10, -1 / 20);
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const data = audioBuffer.getChannelData(Math.min(c, audioBuffer.numberOfChannels - 1));
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const gain = peak > 0 ? Math.min(1, peakTarget / peak) : 1;
  const bytesPer = 3;
  const block = channels * bytesPer;
  const buffer = new ArrayBuffer(44 + outLen * block);
  const view = new DataView(buffer);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, 36 + outLen * block, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, SR, true);
  view.setUint32(28, SR * block, true); view.setUint16(32, block, true); view.setUint16(34, 24, true);
  writeStr(36, "data"); view.setUint32(40, outLen * block, true);
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(Math.min(1, audioBuffer.numberOfChannels - 1));
  let o = 44;
  for (let i = 0; i < outLen; i++) {
    for (const ch of [left, right]) {
      let s = (ch[i] || 0) * gain;
      if (!withTail && i < len - outLen) s += (ch[outLen + i] || 0) * gain;
      s = Math.max(-1, Math.min(1, s));
      const v = Math.round(s * 8388607);
      view.setUint8(o, v & 255); view.setUint8(o + 1, (v >> 8) & 255); view.setUint8(o + 2, (v >> 16) & 255);
      o += 3;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function renderOffline(withTail){
  const rendered = await bounce(withTail);
  if (!rendered) return;
  const blob = encodeWav(rendered.buffer, withTail);
  const rec = state.recipe;
  const name = `passtwo-${rec}-${state.bpm}bpm-${state.key}${withTail ? "-tail" : ""}.wav`;
  download(blob, name);
  return { blob, ...rendered };
}

async function bounce(){
  await ensureAudio();
  if (!Object.keys(raw).length) await loadSamples();
  if (missing.length) return null;
  const tailSec = 0.45;
  const exact = Math.round(BARS * 4 * 60 / state.bpm * SR);
  const total = exact + Math.round(tailSec * SR);
  const off = new OfflineAudioContext(2, total, SR);
  const oMaster = off.createGain();
  oMaster.gain.value = 0.8;
  const oComp = off.createDynamicsCompressor();
  oComp.threshold.value = -12; oComp.ratio.value = 8; oComp.attack.value = 0.003; oComp.release.value = 0.12;
  oMaster.connect(oComp); oComp.connect(off.destination);
  const localGains = {};
  CHAIRS.forEach(c => { const g = off.createGain(); g.gain.value = 1; g.connect(oMaster); localGains[c] = g; });
  const decoded = {};
  for (const name of Object.keys(raw)) decoded[name] = await off.decodeAudioData(raw[name].slice(0));
  const prev = chairGain;
  const prevBuf = { ...buffers };
  chairGain = localGains;
  Object.keys(buffers).forEach(k => delete buffers[k]);
  Object.assign(buffers, decoded);
  const stepDur = 60 / state.bpm / 4;
  let t = 0;
  for (let i = 0; i < BARS * STEPS; i++) {
    scheduleStep(off, i, t);
    t += stepDur;
  }
  chairGain = prev;
  Object.keys(buffers).forEach(k => delete buffers[k]);
  Object.assign(buffers, prevBuf);
  const rendered = await off.startRendering();
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const data = rendered.getChannelData(c);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  const left = rendered.getChannelData(0);
  let first = -1;
  for (let i = 0; i < left.length; i++) if (Math.abs(left[i]) > 0.01) { first = i; break; }
  return { buffer: rendered, exact, samples: rendered.length, firstTransientSample: first, peak };
}

async function exportCheck(){
  const prev = { bpm: state.bpm, key: state.key, mode: state.mode };
  state.bpm = 92;
  state.key = "A";
  state.mode = "develop";
  saveState();
  paint();
  const result = await bounce();
  state.bpm = prev.bpm; state.key = prev.key; state.mode = prev.mode;
  saveState();
  paint();
  if (!result) return { ok: false, missing: missing.slice() };
  const expected = 1001739;
  const blob = encodeWav(result.buffer, false);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const wavSamples = (bytes.length - 44) / 6;
  let seam = 0;
  const left = result.buffer.getChannelData(0);
  for (let i = 0; i < 64; i++) seam = Math.max(seam, Math.abs((left[i] || 0) + (left[expected + i] || 0)));
  return {
    ok: wavSamples === expected && result.firstTransientSample >= 0 && result.firstTransientSample <= 48,
    expected,
    exact: result.exact,
    wavSamples,
    renderedWithTail: result.samples,
    firstTransientSample: result.firstTransientSample,
    firstTransientMs: result.firstTransientSample / SR * 1000,
    peak: result.peak,
    peakDbfs: result.peak > 0 ? 20 * Math.log10(result.peak) : -Infinity,
    seamPreview: seam
  };
}
window.passTwoExportCheck = exportCheck;

function midiBytes(){
  const tpq = 480;
  const tempo = Math.round(60000000 / state.bpm);
  const tracks = [];
  function vlq(n){ const b = [n & 127]; n >>= 7; while (n){ b.push((n & 127) | 128); n >>= 7; } return b.reverse(); }
  function pushTrack(events){
    const data = [];
    const w = (arr) => arr.forEach(x => data.push(x));
    events.forEach(ev => { w(vlq(ev.delta)); w(ev.bytes); });
    const len = data.length;
    const head = [0x4d,0x54,0x72,0x6b, (len>>24)&255,(len>>16)&255,(len>>8)&255,len&255];
    tracks.push(new Uint8Array([...head, ...data]));
  }
  const meta = [
    { delta:0, bytes:[0xFF,0x58,0x04,0x04,0x02,0x18,0x08] },
    { delta:0, bytes:[0xFF,0x51,0x03,(tempo>>16)&255,(tempo>>8)&255,tempo&255] },
    { delta: BARS * 4 * tpq, bytes:[0xFF,0x2F,0x00] }
  ];
  pushTrack(meta);
  CHAIRS.forEach((chair, idx) => {
    const ev = [{ delta:0, bytes:[0xFF,0x03,chair.length, ...[...chair].map(ch => ch.charCodeAt(0))] }];
    const stepDurTicks = tpq / 4;
    let last = 0;
    const notes = [];
    for (let i = 0; i < BARS * STEPS; i++) {
      const bar = Math.floor(i / STEPS);
      const s = i % STEPS;
      const stepDur = 60 / state.bpm / 4;
      notesFor(bar, s, stepDur).forEach(e => {
        if (e.chair !== chair || state.mutes[chair]) return;
        const midi = e.sample ? (chair === "kick" ? 36 : chair === "snare" ? 38 : 42) : Math.max(0, Math.min(127, Math.round(e.midi)));
        const start = Math.round(i * stepDurTicks);
        const dur = Math.max(1, Math.round((e.dur / stepDur) * stepDurTicks));
        notes.push({ t: start, on: true, midi });
        notes.push({ t: start + dur, on: false, midi });
      });
    }
    notes.sort((a,b) => a.t - b.t || (a.on ? -1 : 1));
    notes.forEach(n => {
      const delta = n.t - last; last = n.t;
      ev.push({ delta, bytes:[n.on ? 0x90 + idx : 0x80 + idx, n.midi, n.on ? 90 : 0] });
    });
    ev.push({ delta: Math.max(0, BARS * 4 * tpq - last), bytes:[0xFF,0x2F,0x00] });
    pushTrack(ev);
  });
  const header = new Uint8Array([0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0, tracks.length, (tpq>>8)&255, tpq&255]);
  const size = header.length + tracks.reduce((n,t) => n + t.length, 0);
  const out = new Uint8Array(size);
  out.set(header, 0);
  let o = header.length;
  tracks.forEach(t => { out.set(t, o); o += t.length; });
  return new Blob([out], { type: "audio/midi" });
}

function download(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function bind(){
  $("key").innerHTML = KEYS.map(k => `<option>${k}</option>`).join("");
  loadState();
  $("bpm").onchange = () => { state.bpm = Math.max(60, Math.min(180, +$("bpm").value || 98)); saveState(); paint(); };
  $("key").onchange = () => { state.key = $("key").value; saveState(); paint(); };
  $("chords").onchange = () => { state.chordText = $("chords").value; state.chords = parseProgression(state.chordText); saveState(); paint(); };
  $("playA").onclick = () => play("reprint");
  $("playB").onclick = () => play("develop");
  $("stop").onclick = stop;
  $("copy").onclick = () => navigator.clipboard.writeText(punch());
  $("wav").onclick = () => renderOffline(false);
  $("wavTail").onclick = () => renderOffline(true);
  $("mid").onclick = () => download(midiBytes(), `passtwo-${state.recipe}-${state.bpm}bpm-${state.key}.mid`);
  const startAudio = async () => { await ensureAudio(); if (!Object.keys(buffers).length) await loadSamples(); };
  $("tap").onclick = startAudio;
  $("tapBtn").onclick = (e) => { e.stopPropagation(); startAudio(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  paint();
  requestAnimationFrame(playhead);
}

bind();
