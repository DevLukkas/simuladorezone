/**
 * PRNG determinístico (mulberry32). O estado é um número que vive dentro do
 * `EstadoDoJogo` — todo acaso do motor passa por aqui. Mesma seed, mesma
 * sequência, em qualquer runtime.
 */

export function normalizeSeed(seed: number): number {
  return seed >>> 0 || 1;
}

/** Um passo do mulberry32: devolve o próximo estado e um valor em [0, 1). */
export function randomStep(rng: number): { rng: number; value: number } {
  let a = (rng + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { rng: a, value };
}

/** Inteiro uniforme em [min, max] (inclusivo). */
export function randomInt(
  rng: number,
  min: number,
  max: number,
): { rng: number; value: number } {
  const step = randomStep(rng);
  return { rng: step.rng, value: min + Math.floor(step.value * (max - min + 1)) };
}

/** Fisher–Yates; devolve um novo array e o novo estado do PRNG. */
export function shuffle<T>(rng: number, items: readonly T[]): { rng: number; items: T[] } {
  const copy = [...items];
  let state = rng;
  for (let i = copy.length - 1; i > 0; i--) {
    const roll = randomInt(state, 0, i);
    state = roll.rng;
    const j = roll.value;
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return { rng: state, items: copy };
}
