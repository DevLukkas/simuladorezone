import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Baixa e self-hospeda as fontes do molde de carta.
 *
 * As quatro são Google Fonts sob SIL Open Font License, então podem ser servidas do
 * próprio domínio — sem chamada a fonts.gstatic.com em runtime (o jogo carrega offline e
 * não vaza navegação do jogador).
 *
 * Só os subconjuntos latin e latin-ext entram: o catálogo é em português, e as outras
 * faixas (tailandês, malaiala, devanágari) somam alguns megabytes sem serventia.
 *
 *   node scripts/fontes.ts
 */

const DESTINO = 'public/assets/fontes';
const SUBCONJUNTOS = ['latin', 'latin-ext'];

/**
 * Papéis em CartaComposta: nome/subtítulo, texto de efeito, ATQ/VIDA, rodapé.
 *
 * Grenze no lugar da Montserrat Subrayada que o Figma reporta para o nome: a Subrayada
 * é sublinhada, e a arte impressa mostra uma serifada condensada de peso médio em caixa
 * alta. Entre as candidatas do Google Fonts comparadas lado a lado com o título impresso
 * (Cinzel, Alegreya SC, Vollkorn SC, Eczar, Oranienbaum, Forum...), a Grenze Medium é a
 * que casa em peso, condensação e serifas.
 */
const FAMILIAS =
  'family=Kanit:wght@400' +
  '&family=Manjari:wght@700' +
  '&family=Grenze:wght@500' +
  '&family=Palanquin+Dark:wght@400;600';

/** o UA decide o formato servido; este garante woff2 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const destino = join(import.meta.dirname, '..', DESTINO);
if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

const css = await (
  await fetch(`https://fonts.googleapis.com/css2?${FAMILIAS}&display=swap`, {
    headers: { 'User-Agent': UA },
  })
).text();

/** cada bloco vem precedido de um comentário com o nome do subconjunto */
const blocos = css.split('/*').slice(1);
const regras: string[] = [];
let baixadas = 0;

for (const bloco of blocos) {
  const subconjunto = bloco.slice(0, bloco.indexOf('*/')).trim();
  if (!SUBCONJUNTOS.includes(subconjunto)) continue;

  const familia = /font-family: '([^']+)'/.exec(bloco)?.[1];
  const peso = /font-weight: (\d+)/.exec(bloco)?.[1];
  const url = /src: url\(([^)]+)\)/.exec(bloco)?.[1];
  const faixa = /unicode-range: ([^;]+);/.exec(bloco)?.[1];
  if (!familia || !peso || !url) continue;

  const arquivo = `${familia.toLowerCase().replace(/\s+/g, '-')}-${peso}-${subconjunto}.woff2`;
  writeFileSync(join(destino, arquivo), Buffer.from(await (await fetch(url)).arrayBuffer()));
  baixadas += 1;

  regras.push(
    `@font-face {\n` +
      `  font-family: '${familia}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${peso};\n` +
      `  font-display: swap;\n` +
      `  src: url('/assets/fontes/${arquivo}') format('woff2');\n` +
      (faixa ? `  unicode-range: ${faixa};\n` : '') +
      `}`,
  );
  console.log(`  ${arquivo}`);
}

writeFileSync(
  join(destino, 'fontes.css'),
  `/* Gerado por scripts/fontes.ts — não edite à mão.\n` +
    `   Kanit, Manjari, Grenze e Palanquin Dark, todas sob SIL OFL. */\n\n` +
    regras.join('\n\n') +
    '\n',
);

console.log(`${baixadas} arquivos + fontes.css em ${DESTINO}`);
