import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eraseLabel } from './badge-label.ts';

/**
 * Baixa as peças do molde de carta do Figma (arquivo "TCG - Games").
 *
 * Script de desenvolvimento, não entra no build: roda quando o desenho da carta muda.
 * Exige um token com escopo `file_content:read`:
 *
 *   FIGMA_TOKEN=figd_... node scripts/figma.ts
 *
 * As coordenadas de cada peça dentro da carta 415x555 ficam em CartaComposta — aqui só
 * baixamos os bitmaps. O componente-mestre é o `Relvus` (415x555); as paletas de
 * elemento e raridade vêm do frame "ESTRUTURA DAS CARTAS".
 */

const FILE = 'dCUmMnHvcwT43ift0nOnN4';
const DEST = 'public/assets/molde';
/** 2x para a carta continuar nítida ampliada */
const SCALE = 2;

interface Piece {
  node: string;
  name: string;
}

const PIECES: Piece[] = [
  // estrutura, do componente-mestre
  { node: '197:3346', name: 'moldura' },
  { node: '197:3355', name: 'pill-nome' },
  { node: '197:3392', name: 'pill-subtitulo' },
  { node: '197:3349', name: 'caixa-efeito' },
  { node: '203:5', name: 'barra-rodape' },
  // badges de ATQ/VIDA, da carta modelo
  { node: '236:115', name: 'badge-ataque' },
  { node: '236:114', name: 'badge-vida' },
  // paleta de elementos (frame ESTRUTURA DAS CARTAS)
  { node: '439:4321', name: 'hexagono-1' },
  { node: '439:4322', name: 'hexagono-2' },
  { node: '439:4323', name: 'hexagono-3' },
  { node: '439:4324', name: 'hexagono-4' },
  { node: '439:4325', name: 'hexagono-5' },
  { node: '439:4327', name: 'hexagono-6' },
  { node: '439:4326', name: 'hexagono-7' },
  { node: '439:4329', name: 'hexagono-8' },
  { node: '439:4328', name: 'hexagono-9' },
  // paleta de raridade
  { node: '439:4317', name: 'diamante-1' },
  { node: '439:4319', name: 'diamante-2' },
  { node: '439:4318', name: 'diamante-3' },
  { node: '439:4314', name: 'diamante-4' },
  { node: '439:4316', name: 'diamante-5' },
  { node: '439:4315', name: 'diamante-6' },
];

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Defina FIGMA_TOKEN (token do Figma com escopo file_content:read).');
  process.exit(1);
}

const dest = join(import.meta.dirname, '..', DEST);
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const ids = PIECES.map((p) => p.node).join(',');
const reply = await fetch(
  `https://api.figma.com/v1/images/${FILE}?ids=${encodeURIComponent(ids)}&format=png&scale=${SCALE}`,
  { headers: { 'X-Figma-Token': token } },
);
if (!reply.ok) {
  console.error(`Figma respondeu ${reply.status}: ${await reply.text()}`);
  process.exit(1);
}

const { images, err } = (await reply.json()) as {
  images: Record<string, string | null>;
  err: string | null;
};
if (err) {
  console.error(`Figma: ${err}`);
  process.exit(1);
}

// caixa do NÓ (layout) e caixa RENDERIZADA (com efeitos), para a sangria de cada peça
const nodesReply = await fetch(
  `https://api.figma.com/v1/files/${FILE}/nodes?ids=${encodeURIComponent(ids)}&depth=0`,
  { headers: { 'X-Figma-Token': token } },
);
interface FigmaBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
const { nodes } = (await nodesReply.json()) as {
  nodes: Record<
    string,
    { document: { absoluteBoundingBox: FigmaBox; absoluteRenderBounds: FigmaBox | null } }
  >;
};

/**
 * O Figma exporta a peça COM os efeitos (sombra), então o PNG é maior que o nó e sobra
 * uma borda transparente em volta — e a sombra NÃO é simétrica (cai para baixo/direita),
 * então a folga precisa ser medida POR LADO: repartir meio a meio desloca a peça alguns
 * px do lugar. A diferença entre `absoluteRenderBounds` (o que o PNG cobre) e
 * `absoluteBoundingBox` (a caixa lógica) dá a sangria exata de cada lado.
 *
 * O manifesto guarda tudo em unidades do molde (415x555); a carta infla a caixa lógica
 * por esses valores na hora de desenhar.
 */
const manifest: Record<string, { left: number; top: number; right: number; bottom: number }> = {};

for (const piece of PIECES) {
  const url = images[piece.node];
  if (!url) {
    console.error(`  sem imagem para ${piece.name} (${piece.node})`);
    continue;
  }
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  const pngPath = join(dest, `${piece.name}.png`);
  writeFileSync(pngPath, png);
  // os badges vêm com ATQ/VIDA achatados no bitmap; a carta escreve o rótulo traduzido
  const erased = eraseLabel(piece.name, pngPath);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', pngPath,
    '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6',
    join(dest, `${piece.name}.webp`),
  ]);

  const doc = nodes[piece.node]?.document;
  const box = doc?.absoluteBoundingBox;
  const render = doc?.absoluteRenderBounds ?? box;
  const side = (v: number) => Number(Math.max(0, v).toFixed(2));
  const s =
    box && render
      ? {
          left: side(box.x - render.x),
          top: side(box.y - render.y),
          right: side(render.x + render.width - (box.x + box.width)),
          bottom: side(render.y + render.height - (box.y + box.height)),
        }
      : { left: 0, top: 0, right: 0, bottom: 0 };
  manifest[piece.name] = s;
  const label = erased === null ? '' : `  (rótulo apagado: ${erased} pixels)`;
  console.log(`  ${piece.name}  sangria e${s.left} t${s.top} d${s.right} b${s.bottom}${label}`);
}

// o manifesto é entrada de build (o componente importa), não asset servido
writeFileSync(
  join(import.meta.dirname, '..', 'src/client/components/frame.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`${PIECES.length} peças em ${DEST} + molde.json em src/client/componentes`);
