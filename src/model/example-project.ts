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
      tuning: (() => {
        const list: { name?: string; ratio: { num: number; den: number } }[] = [];
        const gcd = (a: number, b: number): number => {
          while (b !== 0) {
            const t = b;
            b = a % b;
            a = t;
          }
          return Math.abs(a);
        };
        for (let num = 1; num <= 9; num++) {
          for (let den = 1; den <= 9; den++) {
            if (gcd(num, den) === 1) {
              list.push({ ratio: { num, den } });
            }
          }
        }
        return list.sort((a, b) => {
          const ratioA = a.ratio.num / a.ratio.den; 
          const ratioB = b.ratio.num / b.ratio.den;
          return ratioA - ratioB;
        });
      })(),
      notes: [
        { start: 0, duration: 1, ratio: { num: 1, den: 1 }, velocity: 1 },
        { start: 1, duration: 0.5, ratio: { num: 5, den: 4 }, velocity: 0.9 },
        { start: 3, duration: 1, ratio: { num: 3, den: 2 }, velocity: 0.8 },
      ],
    },
  ],
};
