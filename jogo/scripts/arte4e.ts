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

const ARQUIVO = 'dCUmMnHvcwT43ift0nOnN4';
const DESTINO = 'public/assets/arte';
/** 2x, mesma ordem de grandeza do recorte clássico (669 px de largura) */
const ESCALA = 2;
const QUALIDADE = 82;

/**
 * O nó da arte de cada carta, medido no JSON do frame "Baralhos - Iniciais (Quatro
 * Elementos)": é o retângulo 382x476 com fill de imagem, em x=15 y=17 dentro da carta
 * 415x555. A mesma arte aparece em mais de um baralho; aqui fica uma instância por id.
 */
const ARTES: { id: number; no: string }[] = [
  { id: 46, no: 'I268:202;197:3347' }, // Devoradora de Virgens
  { id: 47, no: 'I268:231;197:3347' }, // Éria, Rainha Harpia
  { id: 48, no: 'I248:286;197:3347' }, // Hera, Bruxa Arborium
  { id: 49, no: 'I236:110;197:3347' }, // Relvus, General Arborium
  { id: 50, no: 'I239:202;197:3347' }, // Wargh, Guardião Arborium
  { id: 51, no: 'I249:315;197:3347' }, // Yen, Yanturai da Tempestade
  { id: 52, no: 'I262:109;197:3347' }, // Espada Ancestral Yanturai
  { id: 53, no: 'I271:336;197:3347' }, // Moeda da Floresta
  { id: 54, no: 'I274:365;197:3347' }, // Semente de Bulbo da Vida
  { id: 55, no: 'I268:124;197:3347' }, // Abraço da Floresta
  { id: 56, no: 'I277:675;197:3347' }, // Ataque Aéreo da Harpia
  { id: 57, no: 'I277:696;197:3347' }, // Broto Devorador de Virgens
  { id: 58, no: 'I277:654;197:3347' }, // Brotos de Arborium
  { id: 59, no: 'I277:717;197:3347' }, // Espírito da Tempestade
  { id: 60, no: 'I277:784;197:3347' }, // Certamente não é um Nortenho
  { id: 61, no: 'I277:742;197:3347' }, // Pedido de Emergência
  { id: 62, no: 'I277:763;197:3347' }, // Troncos Retorcidos
  { id: 63, no: 'I295:378;197:3347' }, // Aikãn, Yanturai da Ira
  { id: 64, no: 'I295:389;197:3347' }, // Grouz, Barbaro Nortenho
  { id: 65, no: 'I295:334;197:3347' }, // Kraven, Atirador Nortenho
  { id: 66, no: 'I295:356;197:3347' }, // Sapoceloth, Herois dos Contos
  { id: 67, no: 'I295:345;197:3347' }, // Stiven, Cientista Nortenho
  { id: 68, no: 'I295:365;197:3347' }, // Vulkron, Dragonata das Chamas
  { id: 69, no: 'I295:400;197:3347' }, // Catapulta de Nortenho
  { id: 70, no: 'I295:397;197:3347' }, // Engenhoca de Guerra Nortenho
  { id: 71, no: 'I295:421;197:3347' }, // Baforada do Ifreet
  { id: 72, no: 'I295:412;197:3347' }, // Caçada do Nortenho
  { id: 73, no: 'I295:418;197:3347' }, // Engenhoca Kabum Nortenho
  { id: 74, no: 'I295:403;197:3347' }, // Runas de Hefestus
  { id: 75, no: 'I295:415;197:3347' }, // Sopro Flamejante
  { id: 76, no: 'I295:406;197:3347' }, // Saraivada de Meteoros
  { id: 77, no: 'I356:645;197:3347' }, // Cacheralossauro
  { id: 78, no: 'I356:677;197:3347' }, // Chamado do Mortos
];

/**
 * O PNG exportado cobre a arte inteira (x 15..397, y 17..493 da carta), mas na carta
 * composta a caixa de efeito tampa tudo abaixo de y=330 e a janela de arte é
 * x 22..393, y 16..340 (ver MOLDE.arte em CartaComposta). Recortar essa faixa aqui faz
 * o `object-fit: cover` não ter o que cortar, e a ilustração cai onde o Figma a desenhou.
 */
const CARTA = { arteX: 15, arteY: 17 };
const JANELA = { x: 22, y: 16, l: 371, a: 324 };
const RECORTE = {
  x: (JANELA.x - CARTA.arteX) * ESCALA,
  y: Math.max(0, JANELA.y - CARTA.arteY) * ESCALA,
  largura: JANELA.l * ESCALA,
  altura: (JANELA.y + JANELA.a - CARTA.arteY) * ESCALA,
};

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Defina FIGMA_TOKEN (token do Figma com escopo file_content:read).');
  process.exit(1);
}

const destino = join(import.meta.dirname, '..', DESTINO);
if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

const ids = ARTES.map((a) => a.no).join(',');
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

let total = 0;
let bytes = 0;

for (const arte of ARTES) {
  const url = images[arte.no];
  if (!url) {
    console.error(`  sem imagem para a carta ${arte.id} (${arte.no})`);
    continue;
  }

  const nome = String(arte.id).padStart(2, '0');
  const bruto = join(destino, `${nome}.origem.png`);
  const saida = join(destino, `${nome}.webp`);
  writeFileSync(bruto, Buffer.from(await (await fetch(url)).arrayBuffer()));

  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', bruto,
    '-vf', `crop=${RECORTE.largura}:${RECORTE.altura}:${RECORTE.x}:${RECORTE.y}`,
    '-c:v', 'libwebp', '-quality', String(QUALIDADE), '-compression_level', '6',
    saida,
  ]);
  unlinkSync(bruto);

  bytes += statSync(saida).size;
  total += 1;
  process.stdout.write(`\r${total}/${ARTES.length} ${nome}.webp          `);
}

process.stdout.write(
  `\r${total} ilustrações em ${DESTINO} (${(bytes / 1024 / 1024).toFixed(1)} MB)\n`,
);
