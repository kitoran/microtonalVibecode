import type { Project } from "./project";

export const exampleProject: Project = {
  id: "example-1",
  name: "Just Jam",
  tempo: 120,
  tuningRootHz: 261.63,
  tuningBaseRatio: { num: 1, den: 1 },
  channels: [
    {
      id: "ch1",
      name: "Lead",
      instrument: "sine",
      volume: 1,
      pan: 0,
      tuning: {
        C: { num: 1, den: 1 },
        D: { num: 9, den: 8 },
        E: { num: 5, den: 4 },
        G: { num: 3, den: 2 },
        A: { num: 5, den: 3 },
      },
      notes: [
        { start: 0, duration: 1, ratio: { num: 1, den: 1 }, velocity: 1 },
        { start: 1, duration: 0.5, ratio: { num: 5, den: 4 }, velocity: 0.9 },
        { start: 3, duration: 1, ratio: { num: 3, den: 2 }, velocity: 0.8 },
      ],
    },
  ],
};
