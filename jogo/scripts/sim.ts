/**
 * Fumaça das regras: joga N partidas bot vs bot, headless e determinístico.
 * Falha (exit 1) se qualquer partida travar, gerar comando ilegal ou violar a
 * conservação de cartas. Uso: `npm run sim` (ou `node scripts/sim.ts 500`).
 */
import { createMatch } from '../src/engine/createMatch.ts';
import { reduce } from '../src/engine/reduce.ts';
import { decideCommand } from '../src/engine/bot.ts';
import { shuffle, randomInt, normalizeSeed } from '../src/engine/rng.ts';
import { ALL_CARDS } from '../src/data/cards.ts';
import { heroes } from '../src/data/heroes.ts';
import { MAX_COPIES, MAX_DECK_CARDS } from '../src/data/deckRules.ts';
import type { GameState, SideId } from '../src/engine/state.ts';

const TURN_LIMIT = 300;

/** Sorteia do catálogo inteiro: formato único (decisão nº 37). */
function randomDeck(rng: number): { rng: number; hero: string; cards: number[] } {
  const pool: number[] = [];
  for (const card of ALL_CARDS) {
    for (let i = 0; i < MAX_COPIES; i++) pool.push(card.id);
  }
  const shuffled = shuffle(rng, pool);
  const heroRoll = randomInt(shuffled.rng, 0, heroes.length - 1);
  return {
    rng: heroRoll.rng,
    hero: heroes[heroRoll.value]!.key,
    cards: shuffled.items.slice(0, MAX_DECK_CARDS),
  };
}

interface MatchSummary {
  winner: SideId | null;
  turns: number;
  commands: number;
}

function play(seed: number): MatchSummary {
  let rng = normalizeSeed(seed * 7919);
  const deckA = randomDeck(rng);
  rng = deckA.rng;
  const deckB = randomDeck(rng);

  const created = createMatch({
    seed,
    decks: {
      a: { hero: deckA.hero, cards: deckA.cards },
      b: { hero: deckB.hero, cards: deckB.cards },
    },
  });

  let state: GameState = created.state;
  let commands = 0;

  while (!state.winner && state.turn <= TURN_LIMIT) {
    const preferred = state.pending?.side ?? (state.phase === 'mulligan' ? 'a' : state.activeSide);
    const command =
      decideCommand(state, preferred) ??
      decideCommand(state, preferred === 'a' ? 'b' : 'a');
    if (!command) throw new Error(`seed ${seed}: bot sem comando no turno ${state.turn}`);
    const result = reduce(state, command);
    if (result.error) {
      throw new Error(`seed ${seed}: comando ilegal ${command.type}: ${result.error}`);
    }
    state = result.state;
    if (++commands > 100_000) throw new Error(`seed ${seed}: partida não converge`);
  }

  checkConservation(state, seed);
  return { winner: state.winner, turns: state.turn, commands };
}

function checkConservation(state: GameState, seed: number): void {
  for (const side of ['a', 'b'] as const) {
    const owner = state.sides[side];
    const uids = new Set<string>();
    const coletar = (uid: string, onde: string) => {
      if (uids.has(uid)) throw new Error(`seed ${seed}: uid ${uid} duplicado em ${onde}`);
      uids.add(uid);
    };
    owner.deck.forEach((card) => coletar(card.uid, 'deck'));
    owner.hand.forEach((card) => coletar(card.uid, 'mao'));
    owner.discard.forEach((card) => coletar(card.uid, 'descarte'));
    owner.exile.forEach((card) => coletar(card.uid, 'exilio'));
    if (owner.scenario) coletar(owner.scenario.uid, 'scenario');
    for (const creature of owner.field) {
      if (!creature) continue;
      if (creature.cardId !== null) coletar(creature.uid, 'campo');
      creature.attachments.forEach((attachment) => coletar(attachment.uid, 'anexo'));
    }
    if (uids.size !== MAX_DECK_CARDS) {
      throw new Error(`seed ${seed}: lado ${side} tem ${uids.size} cartas (esperava 40)`);
    }
  }
}

function run(howMany: number): void {
  const start = performance.now();
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalCommands = 0;

  for (let seed = 1; seed <= howMany; seed++) {
    const summary = play(seed);
    if (summary.winner === 'a') winsA++;
    else if (summary.winner === 'b') winsB++;
    else draws++;
    totalTurns += summary.turns;
    totalCommands += summary.commands;
  }

  const duration = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`${howMany} partidas em ${duration}s`);
  console.log(`  vitorias A: ${winsA} | vitorias B: ${winsB} | sem vencedor ate o turno ${TURN_LIMIT}: ${draws}`);
  console.log(`  media de turnos: ${(totalTurns / howMany).toFixed(1)} | media de comandos: ${(totalCommands / howMany).toFixed(0)}`);

  if (draws > howMany * 0.2) {
    console.error('Empate demais: as regras atuais estao travando partidas.');
    process.exit(1);
  }
}

const howMany = Number(process.argv[2]) || 200;
run(howMany);
