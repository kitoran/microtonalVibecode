import { ratioToFloat } from "../utils/ratio";
import type { Ratio } from "../model/project";

// Shared audio context and master gain
const ctx = new AudioContext();
const mainGain = ctx.createGain();
mainGain.connect(ctx.destination);
mainGain.gain.value = 0.5; // Default volume

// Minimal sample-based piano using the provided soundbank (SFZ+FLAC set)
// We pre-load the available key centers (A, C, D#, F#) for octaves and choose
// the nearest sample, then pitch-shift with playbackRate to the requested freq.

type VelocityLayer = "L" | "H";

type SampleEntry = {
  midi: number;       // MIDI note number of the key center
  freq: number;       // Frequency of the key center
  vL?: AudioBuffer;   // Low velocity buffer
  vH?: AudioBuffer;   // High velocity buffer
};

const sampleMap = new Map<string, SampleEntry>(); // key like "A4", "D#2" -> entry
let samplesReady: Promise<void> | null = null;

function noteIndex(name: string): number {
  switch (name) {
    case "C": return 0;
    case "C#": return 1;
    case "D": return 2;
    case "D#": return 3;
    case "E": return 4;
    case "F": return 5;
    case "F#": return 6;
    case "G": return 7;
    case "G#": return 8;
    case "A": return 9;
    case "A#": return 10;
    case "B": return 11;
    default: return 0;
  }
}

function midiFrom(name: string, octave: number): number {
  return (octave + 1) * 12 + noteIndex(name);
}

function freqFromMidi(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

async function loadSamples(): Promise<void> {
  if (samplesReady) return samplesReady;
  samplesReady = (async () => {
    // Get URLs for all FLAC samples via Vite glob import
    const files = import.meta.glob(
      "../assets/UprightPianoKW-SFZ+FLAC-20220221/UprightPianoKW-SFZ+FLAC-20220221/samples/{A,B,C}[0-8]v{H,L}.flac",
      { as: "url", eager: true }
    ) as Record<string, string>;

    // Example filename: .../samples/D#4vH.flac
    const re = /samples\/([A-G]#?)(\d)v([HL])\.flac$/;

    const tasks: Promise<void>[] = [];
    for (const [path, url] of Object.entries(files)) {
      const m = path.match(re);
      if (!m) continue;
      const [, name, octStr, vel] = m as unknown as [string, string, string, VelocityLayer];
      const octave = parseInt(octStr, 10);
      const key = `${name}${octave}`;

      tasks.push((async () => {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);

        let entry = sampleMap.get(key);
        if (!entry) {
          const midi = midiFrom(name, octave);
          entry = { midi, freq: freqFromMidi(midi) };
        }
        if (vel === "L") entry.vL = audioBuf; else entry.vH = audioBuf;
        sampleMap.set(key, entry);
      })());
    }

    await Promise.all(tasks);
  })();
  return samplesReady;
}

function findClosestSample(targetFreq: number, velocity: number): { buffer: AudioBuffer; entry: SampleEntry } {
  if (sampleMap.size === 0) throw new Error("Samples not loaded");

  const preferHigh = velocity > 0.6;
  const targetMidi = 69 + 12 * Math.log2(targetFreq / 440);

  let best: SampleEntry | null = null;
  let bestDist = Infinity;
  for (const entry of sampleMap.values()) {
    const d = Math.abs(targetMidi - entry.midi);
    if (d < bestDist) { best = entry; bestDist = d; }
  }
  if (!best) throw new Error("No sample entries available");

  const buffer = preferHigh ? (best.vH ?? best.vL) : (best.vL ?? best.vH);
  if (!buffer) throw new Error("Missing velocity layer in sample set");

  return { buffer, entry: best };
}

function createVoice(targetFreq: number, velocity: number) {
  const { buffer, entry } = findClosestSample(targetFreq, velocity);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, velocity));

  // Pitch shift from key center to requested frequency
  const rate = targetFreq / entry.freq;
  source.playbackRate.value = rate;

  source.connect(gain).connect(mainGain);
  source.start();

  return { source, gain, entry };
}

export function playTone(
  baseHz: number,
  ratio: Ratio,
  duration: number,
  velocity = 1
) {
  const freq = baseHz * ratioToFloat(ratio);

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const start = () => {
    try {
      const voice = createVoice(freq, velocity);
      const t = ctx.currentTime;
      const end = t + Math.max(0, duration);

      try {
        const current = voice.gain.gain.value;
        voice.gain.gain.setValueAtTime(current > 0 ? current : 0.0001, end - 0.02);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, end);
      } catch {}
      try {
        voice.source.stop(end + 0.01);
      } catch {}

      // Cleanup shortly after stop
      setTimeout(() => {
        try { voice.source.disconnect(); } catch {}
        try { voice.gain.disconnect(); } catch {}
      }, Math.ceil((duration + 0.1) * 1000));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("playTone failed:", e);
    }
  };

  // Ensure samples are loaded before playing
  loadSamples().then(start).catch(() => {});
}

export function startTone(
  baseHz: number,
  ratio: Ratio,
  velocity = 1
) {
  const initialFreq = baseHz * ratioToFloat(ratio);

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  let voice: { source: AudioBufferSourceNode; gain: GainNode; entry: SampleEntry } | null = null;
  let stopped = false;

  // Lazily create the voice once samples are ready
  loadSamples().then(() => {
    if (stopped) return;
    try {
      voice = createVoice(initialFreq, velocity);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("startTone failed:", e);
    }
  }).catch(() => {});

  const setRatio = (r: Ratio) => {
    const f = baseHz * ratioToFloat(r);
    if (!voice) return; // Not started yet

    try {
      const pr = f / voice.entry.freq;
      const param: any = voice.source.playbackRate;
      if (typeof param.setTargetAtTime === "function") {
        param.setTargetAtTime(pr, ctx.currentTime, 0.01);
      } else {
        voice.source.playbackRate.setValueAtTime(pr, ctx.currentTime);
      }
    } catch {}
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;

    if (voice) {
      const t = ctx.currentTime;
      try {
        const current = voice.gain.gain.value;
        voice.gain.gain.setValueAtTime(current > 0 ? current : 0.0001, t);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      } catch {}
      try {
        voice.source.stop(t + 0.03);
      } catch {}
      setTimeout(() => {
        try { voice!.source.disconnect(); } catch {}
        try { voice!.gain.disconnect(); } catch {}
      }, 60);
    }
  };

  return { stop, setRatio };
}
