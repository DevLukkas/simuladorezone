/**
 * PRNG determinístico (mulberry32). O estado é um número que vive dentro do
 * `EstadoDoJogo` — todo acaso do motor passa por aqui. Mesma seed, mesma
 * sequência, em qualquer runtime.
 */

export function normalizarSeed(seed: number): number {
  return seed >>> 0 || 1;
}

/** Um passo do mulberry32: devolve o próximo estado e um valor em [0, 1). */
export function passoAleatorio(rng: number): { rng: number; valor: number } {
  let a = (rng + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const valor = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { rng: a, valor };
}

/** Inteiro uniforme em [min, max] (inclusivo). */
export function inteiroAleatorio(
  rng: number,
  min: number,
  max: number,
): { rng: number; valor: number } {
  const passo = passoAleatorio(rng);
  return { rng: passo.rng, valor: min + Math.floor(passo.valor * (max - min + 1)) };
}

/** Fisher–Yates; devolve um novo array e o novo estado do PRNG. */
export function embaralhar<T>(rng: number, itens: readonly T[]): { rng: number; itens: T[] } {
  const copia = [...itens];
  let estado = rng;
  for (let i = copia.length - 1; i > 0; i--) {
    const sorteio = inteiroAleatorio(estado, 0, i);
    estado = sorteio.rng;
    const j = sorteio.valor;
    const a = copia[i]!;
    copia[i] = copia[j]!;
    copia[j] = a;
  }
  return { rng: estado, itens: copia };
}
