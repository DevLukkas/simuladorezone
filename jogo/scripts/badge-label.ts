import { execFileSync } from 'node:child_process';

/**
 * Apaga o rótulo impresso na placa dos badges de ATQ/VIDA.
 *
 * O badge que o Figma exporta vem com a palavra achatada no bitmap (`ATQ`, `VIDA`), e
 * texto dentro de imagem não traduz: o jogo é pt-BR/en-US/es-ES (invariante 8, o cliente
 * é quem escreve para o jogador). Então a peça fica sem rótulo e ComposedCard desenha a
 * palavra por cima, vinda do dicionário.
 *
 * Repintar a placa é possível porque ela é um degradê liso de vinho e a palavra está
 * inteiramente dentro dela: marcamos o que não é vinho na faixa do rótulo e resolvemos
 * Laplace ali (cada pixel vira a média dos quatro vizinhos, iterado), usando o vinho em
 * volta como contorno. O resultado é o degradê que estaria embaixo da palavra.
 *
 * Roda dentro de `figma.ts`, entre baixar o PNG e converter para webp — reexportar o
 * molde do Figma não traz o rótulo de volta.
 *
 * O ffmpeg entra só como codec (PNG -> RGBA cru -> PNG); o retoque é aqui.
 */

/** faixa onde procurar o rótulo, em pixels do PNG exportado (escala 2x do molde) */
interface Band {
  /** limites da placa, já com folga para dentro: a palavra nunca chega perto deles */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Medidas na exportação 2x atual (badge-ataque 164x246, badge-vida 136x206). Se o desenho
 * do badge mudar no Figma, refazer: a verificação no fim do arquivo acusa faixa errada.
 */
const BANDS: Record<string, Band> = {
  'badge-ataque': { x0: 48, x1: 112, y0: 172, y1: 201 },
  'badge-vida': { x0: 38, x1: 96, y0: 144, y1: 165 },
};

/** vinho da placa: vermelho dominante, azul acompanhando, nada estourado */
function isPlate(px: Uint8Array, i: number): boolean {
  const r = px[i]!;
  const g = px[i + 1]!;
  const b = px[i + 2]!;
  const a = px[i + 3]!;
  return a > 200 && r > 30 && r < 190 && r > g + 15 && b > g - 8;
}

/** miolo claro das letras, usado só para conferir que a faixa está no lugar */
function isLight(px: Uint8Array, i: number): boolean {
  return px[i + 3]! > 128 && px[i]! > 140 && px[i + 1]! > 130 && px[i + 2]! > 130;
}

function probeSize(path: string): { width: number; height: number } {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    path,
  ]).toString();
  const [width, height] = out.trim().split(',').map(Number) as [number, number];
  return { width, height };
}

function decode(path: string, width: number, height: number): Uint8Array {
  const raw = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { maxBuffer: width * height * 4 + 1024 },
  );
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
}

function encode(path: string, width: number, height: number, px: Uint8Array): void {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`,
      '-i', 'pipe:0',
      '-c:v', 'png',
      path,
    ],
    { input: Buffer.from(px.buffer, px.byteOffset, px.length) },
  );
}

/**
 * Repinta a placa do badge no lugar, sem o rótulo. Devolve quantos pixels mudaram, ou
 * `null` se a peça não tem faixa medida (aí não é badge e nada acontece).
 */
export function eraseLabel(name: string, path: string): number | null {
  const band = BANDS[name];
  if (!band) return null;

  const { width, height } = probeSize(path);
  const px = decode(path, width, height);
  const at = (x: number, y: number) => (y * width + x) * 4;

  /**
   * A placa é um hexágono: as bordas de cima e de baixo são diagonais, então a faixa útil
   * de cada linha é o vinho DAQUELA linha, recuado 2px para o contorno de Laplace nunca
   * cair sobre o bisel azul.
   */
  const span: Array<{ x0: number; x1: number } | null> = [];
  for (let y = 0; y < height; y++) {
    if (y < band.y0 - 3 || y > band.y1 + 3) {
      span.push(null);
      continue;
    }
    let min = width;
    let max = -1;
    let count = 0;
    for (let x = band.x0; x <= band.x1; x++) {
      if (!isPlate(px, at(x, y))) continue;
      count += 1;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    span.push(count > 12 ? { x0: min + 2, x1: max - 2 } : null);
  }

  const mask = new Uint8Array(width * height);
  for (let y = band.y0; y <= band.y1; y++) {
    const row = span[y];
    if (!row) continue;
    for (let x = row.x0; x <= row.x1; x++) {
      const i = at(x, y);
      if (px[i + 3]! > 200 && !isPlate(px, i)) mask[y * width + x] = 1;
    }
  }

  /** dilata para engolir o contorno escuro e a antisserra das letras, sem sair da faixa */
  for (let pass = 0; pass < 2; pass += 1) {
    const grown = mask.slice();
    for (let y = band.y0; y <= band.y1; y += 1) {
      const row = span[y];
      if (!row) continue;
      for (let x = row.x0; x <= row.x1; x += 1) {
        const i = y * width + x;
        if (mask[i]) continue;
        if (mask[i - 1] || mask[i + 1] || mask[i - width] || mask[i + width]) grown[i] = 1;
      }
    }
    mask.set(grown);
  }

  /**
   * Laplace por relaxamento: 1200 passadas bastam para uma mancha de ~60x30 estabilizar
   * (a maior letra tem 14px de largura, e o erro cai com o quadrado da distância à borda).
   */
  const channels = [0, 1, 2].map((c) => {
    const f = new Float64Array(width * height);
    for (let i = 0; i < width * height; i += 1) f[i] = px[i * 4 + c]!;
    return f;
  });
  for (let pass = 0; pass < 1200; pass += 1) {
    for (const f of channels) {
      for (let y = band.y0; y <= band.y1; y += 1) {
        const row = span[y];
        if (!row) continue;
        for (let x = row.x0; x <= row.x1; x += 1) {
          const i = y * width + x;
          if (!mask[i]) continue;
          f[i] = (f[i - 1]! + f[i + 1]! + f[i - width]! + f[i + width]!) / 4;
        }
      }
    }
  }

  let changed = 0;
  for (let i = 0; i < width * height; i += 1) {
    if (!mask[i]) continue;
    changed += 1;
    for (let c = 0; c < 3; c += 1) {
      px[i * 4 + c] = Math.round(Math.min(255, Math.max(0, channels[c]![i]!)));
    }
  }

  /**
   * Conferência: dentro da placa não pode ter sobrado nada claro. Só o miolo de cada
   * linha conta — o bisel azul, que é claro e entra na caixa nas linhas diagonais do
   * hexágono, fica de fora por construção.
   */
  let leftover = 0;
  for (let y = band.y0; y <= band.y1; y += 1) {
    const row = span[y];
    if (!row) continue;
    for (let x = row.x0; x <= row.x1; x += 1) {
      if (isLight(px, at(x, y))) leftover += 1;
    }
  }
  if (leftover > 0) {
    throw new Error(
      `${name}: sobraram ${leftover} pixels claros na placa — a faixa do rótulo em BANDS ` +
        `não casa com o bitmap exportado (${width}x${height}); remedir.`,
    );
  }

  encode(path, width, height, px);
  return changed;
}

/** `node scripts/badge-label.ts` reaplica o retoque nos PNGs já baixados */
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { join } = await import('node:path');
  const dest = join(import.meta.dirname, '..', 'public/assets/molde');
  for (const name of Object.keys(BANDS)) {
    const path = join(dest, `${name}.png`);
    const changed = eraseLabel(name, path);
    console.log(`  ${name}: ${changed} pixels repintados`);
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', path,
      '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6',
      join(dest, `${name}.webp`),
    ]);
  }
}
