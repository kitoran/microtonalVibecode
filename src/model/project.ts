/** A rational number representing a frequency ratio */
export interface Ratio {
  num: number;
  den: number;
}

/** A musical note event */
export interface Note {
  start: number;         // In beats
  duration: number;      // In beats
  ratio: Ratio;          // Just Intonation pitch ratio
  velocity: number;      // 0.0–1.0
}

/** Tuning map: pitch class → JI ratio */
export type TuningMap = Record<string, Ratio>; // e.g. { C: {num: 1, den: 1}, D: {num: 9, den: 8} }

/** A single instrument or voice lane */
export interface Channel {
  id: string;
  name: string;
  instrument: "sine" | "sampler" | string; // Extendable
  notes: Note[];
  tuning: TuningMap;                       // Optional per-channel tuning
  volume: number;                          // 0.0–1.0
  pan: number;                             // -1.0 (left) to 1.0 (right)
}

/** Full editor project */
export interface Project {
  id: string;
  name: string;
  tempo: number;                 // BPM
  channels: Channel[];
  tuningRootHz: number;         // e.g. 261.63 for C4
  tuningBaseRatio: Ratio;       // e.g. {num: 1, den: 1}
}
