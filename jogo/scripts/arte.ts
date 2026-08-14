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

const ORIGEM = 'public/assets/cards';
const DESTINO = 'public/assets/arte';

/** 749x1033 é o tamanho de todas as 45 */
const RECORTE = { x: 40, y: 36, largura: 669, altura: 584 };
const QUALIDADE = 82;

const raiz = join(import.meta.dirname, '..');
const origem = join(raiz, ORIGEM);
const destino = join(raiz, DESTINO);

if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

const arquivos = readdirSync(origem)
  .filter((nome) => nome.endsWith('.png'))
  .sort();

let total = 0;
let bytesAntes = 0;
let bytesDepois = 0;

for (const arquivo of arquivos) {
  const saida = arquivo.replace(/\.png$/, '.webp');
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(origem, arquivo),
      '-vf',
      `crop=${RECORTE.largura}:${RECORTE.altura}:${RECORTE.x}:${RECORTE.y}`,
      '-c:v',
      'libwebp',
      '-quality',
      String(QUALIDADE),
      '-compression_level',
      '6',
      join(destino, saida),
    ],
    { stdio: 'inherit' },
  );

  const { statSync } = await import('node:fs');
  bytesAntes += statSync(join(origem, arquivo)).size;
  bytesDepois += statSync(join(destino, saida)).size;
  total += 1;
  process.stdout.write(`\r${total}/${arquivos.length} ${saida}          `);
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
process.stdout.write(
  `\r${total} artes recortadas: ${mb(bytesAntes)} MB -> ${mb(bytesDepois)} MB` +
    ` (${Math.round((1 - bytesDepois / bytesAntes) * 100)}% menor)\n`,
);
