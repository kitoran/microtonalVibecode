import { ratioToFloat } from "../utils/ratio";
import type { Ratio } from "../model/project";

const ctx = new AudioContext();
const mainGain = ctx.createGain();
mainGain.connect(ctx.destination);
mainGain.gain.value = 0.5; // Default volume
export function playTone(
  baseHz: number,
  ratio: Ratio,
  duration: number,
  velocity = 1
) {
  const freq = baseHz * ratioToFloat(ratio);
console.log(`Playing tone: ${freq}Hz, duration: ${duration}s, velocity: ${velocity}`);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.value = velocity;

  osc.connect(gain).connect(mainGain);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function startTone(
  baseHz: number,
  ratio: Ratio,
  velocity = 1
) {
  const freq = baseHz * ratioToFloat(ratio);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (ctx.state === "suspended") {
    // Resume on user gesture if needed
    ctx.resume().catch(() => {});
  }

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.value = Math.max(0, Math.min(1, velocity));

  osc.connect(gain).connect(mainGain);

  osc.start();

  const setRatio = (r: Ratio) => {
    const f = baseHz * ratioToFloat(r);
    try {
      // Smoothly retune to avoid clicks
      if ((osc.frequency as any).setTargetAtTime) {
        (osc.frequency as any).setTargetAtTime(f, ctx.currentTime, 0.01);
      } else {
        osc.frequency.setValueAtTime(f, ctx.currentTime);
      }
    } catch {}
  };

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    try {
      const current = gain.gain.value;
      gain.gain.setValueAtTime(current > 0 ? current : 0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    } catch {}
    try {
      osc.stop(t + 0.03);
    } catch {}
    // Cleanup after stop
    setTimeout(() => {
      try { osc.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    }, 60);
  };

  return { stop, setRatio };
}
