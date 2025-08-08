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
