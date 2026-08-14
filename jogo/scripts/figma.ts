import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const ARQUIVO = 'dCUmMnHvcwT43ift0nOnN4';
const DESTINO = 'public/assets/molde';
/** 2x para a carta continuar nítida ampliada */
const ESCALA = 2;

interface Peca {
  no: string;
  nome: string;
}

const PECAS: Peca[] = [
  // estrutura, do componente-mestre
  { no: '197:3346', nome: 'moldura' },
  { no: '197:3355', nome: 'pill-nome' },
  { no: '197:3392', nome: 'pill-subtitulo' },
  { no: '197:3349', nome: 'caixa-efeito' },
  { no: '203:5', nome: 'barra-rodape' },
  // badges de ATQ/VIDA, da carta modelo
  { no: '236:115', nome: 'badge-ataque' },
  { no: '236:114', nome: 'badge-vida' },
  // paleta de elementos (frame ESTRUTURA DAS CARTAS)
  { no: '439:4321', nome: 'hexagono-1' },
  { no: '439:4322', nome: 'hexagono-2' },
  { no: '439:4323', nome: 'hexagono-3' },
  { no: '439:4324', nome: 'hexagono-4' },
  { no: '439:4325', nome: 'hexagono-5' },
  { no: '439:4327', nome: 'hexagono-6' },
  { no: '439:4326', nome: 'hexagono-7' },
  { no: '439:4329', nome: 'hexagono-8' },
  { no: '439:4328', nome: 'hexagono-9' },
  // paleta de raridade
  { no: '439:4317', nome: 'diamante-1' },
  { no: '439:4319', nome: 'diamante-2' },
  { no: '439:4318', nome: 'diamante-3' },
  { no: '439:4314', nome: 'diamante-4' },
  { no: '439:4316', nome: 'diamante-5' },
  { no: '439:4315', nome: 'diamante-6' },
];

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Defina FIGMA_TOKEN (token do Figma com escopo file_content:read).');
  process.exit(1);
}

const destino = join(import.meta.dirname, '..', DESTINO);
if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

const ids = PECAS.map((p) => p.no).join(',');
const resposta = await fetch(
  `https://api.figma.com/v1/images/${ARQUIVO}?ids=${encodeURIComponent(ids)}&format=png&scale=${ESCALA}`,
  { headers: { 'X-Figma-Token': token } },
);
if (!resposta.ok) {
  console.error(`Figma respondeu ${resposta.status}: ${await resposta.text()}`);
  process.exit(1);
}

const { images, err } = (await resposta.json()) as {
  images: Record<string, string | null>;
  err: string | null;
};
if (err) {
  console.error(`Figma: ${err}`);
  process.exit(1);
}

// caixa do NÓ (layout) e caixa RENDERIZADA (com efeitos), para a sangria de cada peça
const respostaNos = await fetch(
  `https://api.figma.com/v1/files/${ARQUIVO}/nodes?ids=${encodeURIComponent(ids)}&depth=0`,
  { headers: { 'X-Figma-Token': token } },
);
interface CaixaFigma {
  x: number;
  y: number;
  width: number;
  height: number;
}
const { nodes } = (await respostaNos.json()) as {
  nodes: Record<
    string,
    { document: { absoluteBoundingBox: CaixaFigma; absoluteRenderBounds: CaixaFigma | null } }
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
const manifesto: Record<string, { esq: number; topo: number; dir: number; baixo: number }> = {};

for (const peca of PECAS) {
  const url = images[peca.no];
  if (!url) {
    console.error(`  sem imagem para ${peca.nome} (${peca.no})`);
    continue;
  }
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  const caminhoPng = join(destino, `${peca.nome}.png`);
  writeFileSync(caminhoPng, png);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', caminhoPng,
    '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6',
    join(destino, `${peca.nome}.webp`),
  ]);

  const doc = nodes[peca.no]?.document;
  const caixa = doc?.absoluteBoundingBox;
  const render = doc?.absoluteRenderBounds ?? caixa;
  const lado = (v: number) => Number(Math.max(0, v).toFixed(2));
  const s =
    caixa && render
      ? {
          esq: lado(caixa.x - render.x),
          topo: lado(caixa.y - render.y),
          dir: lado(render.x + render.width - (caixa.x + caixa.width)),
          baixo: lado(render.y + render.height - (caixa.y + caixa.height)),
        }
      : { esq: 0, topo: 0, dir: 0, baixo: 0 };
  manifesto[peca.nome] = s;
  console.log(`  ${peca.nome}  sangria e${s.esq} t${s.topo} d${s.dir} b${s.baixo}`);
}

// o manifesto é entrada de build (o componente importa), não asset servido
writeFileSync(
  join(import.meta.dirname, '..', 'src/client/componentes/molde.json'),
  `${JSON.stringify(manifesto, null, 2)}\n`,
);
console.log(`${PECAS.length} peças em ${DESTINO} + molde.json em src/client/componentes`);
