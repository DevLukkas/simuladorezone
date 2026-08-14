/**
 * Fumaça das regras: joga N partidas bot vs bot, headless e determinístico.
 * Falha (exit 1) se qualquer partida travar, gerar comando ilegal ou violar a
 * conservação de cartas. Uso: `npm run sim` (ou `node scripts/sim.ts 500`).
 */
import { criarPartida } from '../src/engine/criar.ts';
import { aplicarComando } from '../src/engine/reduzir.ts';
import { decidirComando } from '../src/engine/ia.ts';
import { embaralhar, inteiroAleatorio, normalizarSeed } from '../src/engine/rng.ts';
import { cartasDoFormato } from '../src/data/cartas.ts';
import { herois } from '../src/data/herois.ts';
import { MAXIMO_DE_COPIAS, MAXIMO_DE_CARTAS_NO_DECK } from '../src/data/regras.ts';
import { FORMATOS, NOME_DO_FORMATO, type Formato } from '../src/data/tipos.ts';
import type { EstadoDoJogo, LadoId } from '../src/engine/estado.ts';

const TURNO_LIMITE = 300;

/**
 * Sorteia dentro de UM formato: partida tem um formato só. A fumaça roda os dois —
 * o Quatro Elementos entrou aqui quando as palavras-chave (MARCIAL, VORPAL,
 * REGENERAR) passaram a valer em jogo, mesmo com o resto do texto pendente.
 */
function deckAleatorio(
  rng: number,
  formato: Formato,
): { rng: number; heroi: string; cartas: number[] } {
  const pool: number[] = [];
  for (const carta of cartasDoFormato(formato)) {
    for (let i = 0; i < MAXIMO_DE_COPIAS; i++) pool.push(carta.id);
  }
  const embaralhado = embaralhar(rng, pool);
  const sorteioHeroi = inteiroAleatorio(embaralhado.rng, 0, herois.length - 1);
  return {
    rng: sorteioHeroi.rng,
    heroi: herois[sorteioHeroi.valor]!.chave,
    cartas: embaralhado.itens.slice(0, MAXIMO_DE_CARTAS_NO_DECK),
  };
}

interface ResumoDaPartida {
  vencedor: LadoId | null;
  turnos: number;
  comandos: number;
}

function jogar(seed: number, formato: Formato): ResumoDaPartida {
  let rng = normalizarSeed(seed * 7919);
  const deckA = deckAleatorio(rng, formato);
  rng = deckA.rng;
  const deckB = deckAleatorio(rng, formato);

  const criada = criarPartida({
    seed,
    formato,
    decks: {
      a: { heroi: deckA.heroi, cartas: deckA.cartas },
      b: { heroi: deckB.heroi, cartas: deckB.cartas },
    },
  });

  let estado: EstadoDoJogo = criada.estado;
  let comandos = 0;

  while (!estado.vencedor && estado.turno <= TURNO_LIMITE) {
    const preferido = estado.pendencia?.lado ?? (estado.fase === 'mulligan' ? 'a' : estado.ladoAtivo);
    const comando =
      decidirComando(estado, preferido) ??
      decidirComando(estado, preferido === 'a' ? 'b' : 'a');
    if (!comando) throw new Error(`seed ${seed}: bot sem comando no turno ${estado.turno}`);
    const resultado = aplicarComando(estado, comando);
    if (resultado.erro) {
      throw new Error(`seed ${seed}: comando ilegal ${comando.tipo}: ${resultado.erro}`);
    }
    estado = resultado.estado;
    if (++comandos > 100_000) throw new Error(`seed ${seed}: partida não converge`);
  }

  verificarConservacao(estado, seed);
  return { vencedor: estado.vencedor, turnos: estado.turno, comandos };
}

function verificarConservacao(estado: EstadoDoJogo, seed: number): void {
  for (const lado of ['a', 'b'] as const) {
    const dono = estado.lados[lado];
    const uids = new Set<string>();
    const coletar = (uid: string, onde: string) => {
      if (uids.has(uid)) throw new Error(`seed ${seed}: uid ${uid} duplicado em ${onde}`);
      uids.add(uid);
    };
    dono.deck.forEach((carta) => coletar(carta.uid, 'deck'));
    dono.mao.forEach((carta) => coletar(carta.uid, 'mao'));
    dono.descarte.forEach((carta) => coletar(carta.uid, 'descarte'));
    dono.exilio.forEach((carta) => coletar(carta.uid, 'exilio'));
    if (dono.cenario) coletar(dono.cenario.uid, 'cenario');
    for (const criatura of dono.campo) {
      if (!criatura) continue;
      if (criatura.cartaId !== null) coletar(criatura.uid, 'campo');
      criatura.anexos.forEach((anexo) => coletar(anexo.uid, 'anexo'));
    }
    if (uids.size !== MAXIMO_DE_CARTAS_NO_DECK) {
      throw new Error(`seed ${seed}: lado ${lado} tem ${uids.size} cartas (esperava 40)`);
    }
  }
}

function rodarFormato(formato: Formato, quantas: number): void {
  const inicio = performance.now();
  let vitoriasA = 0;
  let vitoriasB = 0;
  let empates = 0;
  let totalTurnos = 0;
  let totalComandos = 0;

  for (let seed = 1; seed <= quantas; seed++) {
    const resumo = jogar(seed, formato);
    if (resumo.vencedor === 'a') vitoriasA++;
    else if (resumo.vencedor === 'b') vitoriasB++;
    else empates++;
    totalTurnos += resumo.turnos;
    totalComandos += resumo.comandos;
  }

  const duracao = ((performance.now() - inicio) / 1000).toFixed(1);
  console.log(`${NOME_DO_FORMATO[formato]}: ${quantas} partidas em ${duracao}s`);
  console.log(`  vitorias A: ${vitoriasA} | vitorias B: ${vitoriasB} | sem vencedor ate o turno ${TURNO_LIMITE}: ${empates}`);
  console.log(`  media de turnos: ${(totalTurnos / quantas).toFixed(1)} | media de comandos: ${(totalComandos / quantas).toFixed(0)}`);

  if (empates > quantas * 0.2) {
    console.error(`Empate demais em ${NOME_DO_FORMATO[formato]}: as regras atuais estao travando partidas.`);
    process.exit(1);
  }
}

const quantas = Number(process.argv[2]) || 200;
for (const formato of FORMATOS) rodarFormato(formato, quantas);
