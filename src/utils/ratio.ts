import type { Ratio } from "../model/project";

export function simplifyRatio({ num, den }: Ratio): Ratio {
  const gcd = (a: number, b: number): number =>
    b === 0 ? a : gcd(b, a % b);

  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export function ratioToFloat(r: Ratio): number {
  return r.num / r.den;
}

export function multiplyRatios(a: Ratio, b: Ratio): Ratio {
  return simplifyRatio({ num: a.num * b.num, den: a.den * b.den });
}

export function divideRatios(a: Ratio, b: Ratio): Ratio {
  return simplifyRatio({ num: a.num * b.den, den: a.den * b.num });
}
