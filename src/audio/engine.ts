import { ratioToFloat } from "../utils/ratio";
import type { Ratio } from "../model/project";

const ctx = new AudioContext();

export function playTone(
  baseHz: number,
  ratio: Ratio,
  duration: number,
  velocity = 1
) {
  const freq = baseHz * ratioToFloat(ratio);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.value = velocity;

  osc.connect(gain).connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + duration);
}
