import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Extrai a ilustração das 45 artes impressas para uso na carta composta.
 *
 * As cartas do formato clássico só existem como composto finalizado (moldura, pills,
 * badges e caixa de efeito já achatados sobre a arte) — não há fonte de arte limpa em
 * lugar nenhum, nem no Figma. Então a ilustração é recortada da própria carta impressa.
 *
 * O recorte é fixo porque o template é pixel-consistente: a varredura das 45 achou a
 * caixa de efeito bege começando em 59,9%–60,0% da altura em TODAS.
 *
 * O topo entra em y=36, ACIMA das pills de nome e raça impressas (que ocupam y62..132).
 * Parece contraintuitivo trazer lixo junto, mas é o que dá o enquadramento certo: sem
 * essa faixa o recorte fica 1,41 (paisagem) contra uma caixa de 1,15 na carta composta,
 * e o `object-fit: cover` come 19% das laterais. Com ela o recorte fica 1,146 e quase
 * nada é cortado. As pills impressas caem em y30..69 da carta composta, sob as pills do
 * molde novo (y22,7..71), que são maiores e opacas.
 *
 * O mesmo vale embaixo: a faixa dos badges de ATQ/VIDA impressos cai sob os badges do
 * molde novo — ver CartaComposta.
 */

const SOURCE = 'public/assets/cards';
const DEST = 'public/assets/arte';

/** 749x1033 é o tamanho de todas as 45 */
const CROP = { x: 40, y: 36, width: 669, height: 584 };
const QUALITY = 82;

const root = join(import.meta.dirname, '..');
const source = join(root, SOURCE);
const dest = join(root, DEST);

if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const files = readdirSync(source)
  .filter((name) => name.endsWith('.png'))
  .sort();

let total = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const file of files) {
  const output = file.replace(/\.png$/, '.webp');
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(source, file),
      '-vf',
      `crop=${CROP.width}:${CROP.height}:${CROP.x}:${CROP.y}`,
      '-c:v',
      'libwebp',
      '-quality',
      String(QUALITY),
      '-compression_level',
      '6',
      join(dest, output),
    ],
    { stdio: 'inherit' },
  );

  const { statSync } = await import('node:fs');
  bytesBefore += statSync(join(source, file)).size;
  bytesAfter += statSync(join(dest, output)).size;
  total += 1;
  process.stdout.write(`\r${total}/${files.length} ${output}          `);
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
process.stdout.write(
  `\r${total} artes recortadas: ${mb(bytesBefore)} MB -> ${mb(bytesAfter)} MB` +
    ` (${Math.round((1 - bytesAfter / bytesBefore) * 100)}% menor)\n`,
);
