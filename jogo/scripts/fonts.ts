import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Baixa e self-hospeda as fontes do molde de carta.
 *
 * As seis são Google Fonts sob SIL Open Font License, então podem ser servidas do
 * próprio domínio — sem chamada a fonts.gstatic.com em runtime (o jogo carrega offline e
 * não vaza navegação do jogador).
 *
 * Só os subconjuntos latin e latin-ext entram: o catálogo é em português, e as outras
 * faixas (tailandês, malaiala, devanágari) somam alguns megabytes sem serventia.
 *
 *   node scripts/fonts.ts
 */

const DEST = 'public/assets/fontes';
const SUBSETS = ['latin', 'latin-ext'];

/**
 * Papéis em ComposedCard: nome/subtítulo, texto de efeito, ATQ/VIDA, rodapé.
 *
 * Grenze no lugar da Montserrat Subrayada que o Figma reporta para o nome: a Subrayada
 * é sublinhada, e a arte impressa mostra uma serifada condensada de peso médio em caixa
 * alta. Entre as candidatas do Google Fonts comparadas lado a lado com o título impresso
 * (Cinzel, Alegreya SC, Vollkorn SC, Eczar, Oranienbaum, Forum...), a Grenze Medium é a
 * que casa em peso, condensação e serifas.
 *
 * Cinzel e Alegreya Sans não entram na carta: são a tipografia da INTERFACE (decisão
 * nº 26) — Cinzel nos títulos e botões de ação, Alegreya Sans no corpo. Ficam aqui, e
 * não num <link> para o Google, porque o jogo carrega offline e não vaza navegação do
 * jogador — o mesmo motivo das quatro da carta.
 */
const FAMILIES =
  'family=Kanit:wght@400' +
  '&family=Manjari:wght@700' +
  '&family=Grenze:wght@500' +
  '&family=Palanquin+Dark:wght@400;600' +
  '&family=Cinzel:wght@600;700;800' +
  '&family=Alegreya+Sans:wght@400;500;700';

/** o UA decide o formato servido; este garante woff2 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const dest = join(import.meta.dirname, '..', DEST);
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

const css = await (
  await fetch(`https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`, {
    headers: { 'User-Agent': UA },
  })
).text();

/** cada bloco vem precedido de um comentário com o nome do subconjunto */
const blocks = css.split('/*').slice(1);
const deckRules: string[] = [];
let downloaded = 0;

for (const block of blocks) {
  const subset = block.slice(0, block.indexOf('*/')).trim();
  if (!SUBSETS.includes(subset)) continue;

  const family = /font-family: '([^']+)'/.exec(block)?.[1];
  const weight = /font-weight: (\d+)/.exec(block)?.[1];
  const url = /src: url\(([^)]+)\)/.exec(block)?.[1];
  const range = /unicode-range: ([^;]+);/.exec(block)?.[1];
  if (!family || !weight || !url) continue;

  const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}-${subset}.woff2`;
  writeFileSync(join(dest, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
  downloaded += 1;

  deckRules.push(
    `@font-face {\n` +
      `  font-family: '${family}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${weight};\n` +
      `  font-display: swap;\n` +
      `  src: url('/assets/fontes/${file}') format('woff2');\n` +
      (range ? `  unicode-range: ${range};\n` : '') +
      `}`,
  );
  console.log(`  ${file}`);
}

writeFileSync(
  join(dest, 'fontes.css'),
  `/* Gerado por scripts/fontes.ts — não edite à mão.\n` +
    `   Kanit, Manjari, Grenze e Palanquin Dark, todas sob SIL OFL. */\n\n` +
    deckRules.join('\n\n') +
    '\n',
);

console.log(`${downloaded} arquivos + fontes.css em ${DEST}`);
