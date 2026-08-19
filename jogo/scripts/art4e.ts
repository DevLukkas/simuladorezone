import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Baixa a ilustração das 33 cartas do Quatro Elementos (ids 46..78) do Figma.
 *
 * Por que não dá para usar o `scripts/arte.ts`: lá a ilustração é recortada da carta
 * impressa em `public/assets/cards`, e o Quatro Elementos não tem carta impressa — essas
 * cartas só existem como nós do Figma. Aqui a fonte é o próprio nó da arte dentro da
 * instância do componente `Relvus`, que já é a ilustração limpa (sem pills nem badges).
 *
 * NÃO vale exportar a instância inteira da carta: raça, raridade e elemento ficam FORA
 * do grupo no Figma (só sobrepostos visualmente), e dentro do grupo o subtítulo é o
 * placeholder "planta" em todas — a carta exportada sairia errada. A identidade correta
 * já está no catálogo e é a carta composta que a desenha.
 *
 * Script de desenvolvimento, não entra no build. Exige token com `file_content:read`:
 *
 *   FIGMA_TOKEN=figd_... node scripts/arte4e.ts
 */

const FILE = 'dCUmMnHvcwT43ift0nOnN4';
const DEST = 'public/assets/arte';
/** 2x, mesma ordem de grandeza do recorte clássico (669 px de largura) */
const SCALE = 2;
const QUALITY = 82;

/**
 * O nó da arte de cada carta, medido no JSON do frame "Baralhos - Iniciais (Quatro
 * Elementos)": é o retângulo 382x476 com fill de imagem, em x=15 y=17 dentro da carta
 * 415x555. A mesma arte aparece em mais de um baralho; aqui fica uma instância por id.
 */
const ARTS: { id: number; node: string }[] = [
  { id: 46, node: 'I268:202;197:3347' }, // Devoradora de Virgens
  { id: 47, node: 'I268:231;197:3347' }, // Éria, Rainha Harpia
  { id: 48, node: 'I248:286;197:3347' }, // Hera, Bruxa Arborium
  { id: 49, node: 'I236:110;197:3347' }, // Relvus, General Arborium
  { id: 50, node: 'I239:202;197:3347' }, // Wargh, Guardião Arborium
  { id: 51, node: 'I249:315;197:3347' }, // Yen, Yanturai da Tempestade
  { id: 52, node: 'I262:109;197:3347' }, // Espada Ancestral Yanturai
  { id: 53, node: 'I271:336;197:3347' }, // Moeda da Floresta
  { id: 54, node: 'I274:365;197:3347' }, // Semente de Bulbo da Vida
  { id: 55, node: 'I268:124;197:3347' }, // Abraço da Floresta
  { id: 56, node: 'I277:675;197:3347' }, // Ataque Aéreo da Harpia
  { id: 57, node: 'I277:696;197:3347' }, // Broto Devorador de Virgens
  { id: 58, node: 'I277:654;197:3347' }, // Brotos de Arborium
  { id: 59, node: 'I277:717;197:3347' }, // Espírito da Tempestade
  { id: 60, node: 'I277:784;197:3347' }, // Certamente não é um Nortenho
  { id: 61, node: 'I277:742;197:3347' }, // Pedido de Emergência
  { id: 62, node: 'I277:763;197:3347' }, // Troncos Retorcidos
  { id: 63, node: 'I295:378;197:3347' }, // Aikãn, Yanturai da Ira
  { id: 64, node: 'I295:389;197:3347' }, // Grouz, Barbaro Nortenho
  { id: 65, node: 'I295:334;197:3347' }, // Kraven, Atirador Nortenho
  { id: 66, node: 'I295:356;197:3347' }, // Sapoceloth, Herois dos Contos
  { id: 67, node: 'I295:345;197:3347' }, // Stiven, Cientista Nortenho
  { id: 68, node: 'I295:365;197:3347' }, // Vulkron, Dragonata das Chamas
  { id: 69, node: 'I295:400;197:3347' }, // Catapulta de Nortenho
  { id: 70, node: 'I295:397;197:3347' }, // Engenhoca de Guerra Nortenho
  { id: 71, node: 'I295:421;197:3347' }, // Baforada do Ifreet
  { id: 72, node: 'I295:412;197:3347' }, // Caçada do Nortenho
  { id: 73, node: 'I295:418;197:3347' }, // Engenhoca Kabum Nortenho
  { id: 74, node: 'I295:403;197:3347' }, // Runas de Hefestus
  { id: 75, node: 'I295:415;197:3347' }, // Sopro Flamejante
  { id: 76, node: 'I295:406;197:3347' }, // Saraivada de Meteoros
  { id: 77, node: 'I356:645;197:3347' }, // Cacheralossauro
  { id: 78, node: 'I356:677;197:3347' }, // Chamado do Mortos
];

/**
 * O PNG exportado cobre a arte inteira (x 15..397, y 17..493 da carta), mas na carta
 * composta a caixa de efeito tampa tudo abaixo de y=330 e a janela de arte é
 * x 22..393, y 16..340 (ver MOLDE.arte em CartaComposta). Recortar essa faixa aqui faz
 * o `object-fit: cover` não ter o que cortar, e a ilustração cai onde o Figma a desenhou.
 */
const CARD = { artX: 15, artY: 17 };
const WINDOW = { x: 22, y: 16, l: 371, a: 324 };
const CROP = {
  x: (WINDOW.x - CARD.artX) * SCALE,
  y: Math.max(0, WINDOW.y - CARD.artY) * SCALE,
  width: WINDOW.l * SCALE,
  height: (WINDOW.y + WINDOW.a - CARD.artY) * SCALE,
};

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Defina FIGMA_TOKEN (token do Figma com escopo file_content:read).');
  process.exit(1);
}

const dest = join(import.meta.dirname, '..', DEST);
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const ids = ARTS.map((a) => a.node).join(',');
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

let total = 0;
let bytes = 0;

for (const art of ARTS) {
  const url = images[art.node];
  if (!url) {
    console.error(`  sem imagem para a carta ${art.id} (${art.node})`);
    continue;
  }

  const name = String(art.id).padStart(2, '0');
  const raw = join(dest, `${name}.origem.png`);
  const output = join(dest, `${name}.webp`);
  writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', raw,
    '-vf', `crop=${CROP.width}:${CROP.height}:${CROP.x}:${CROP.y}`,
    '-c:v', 'libwebp', '-quality', String(QUALITY), '-compression_level', '6',
    output,
  ]);
  unlinkSync(raw);

  bytes += statSync(output).size;
  total += 1;
  process.stdout.write(`\r${total}/${ARTS.length} ${name}.webp          `);
}

process.stdout.write(
  `\r${total} ilustrações em ${DEST} (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`,
);
