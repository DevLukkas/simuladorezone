import { createMatch, type MatchConfig } from './createMatch.ts';
import { reduce } from './reduce.ts';
import type { Command } from './commands.ts';
import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';

/**
 * Reexecutar uma partida a partir da receita: seed + decks + comandos.
 *
 * Isto é o invariante 1 virado ferramenta — mesma seed + mesmos comandos = mesmo
 * estado final, em qualquer máquina e a qualquer momento. A peça mora aqui e não
 * no servidor porque é pura: não faz I/O e não conhece nem HTTP nem banco.
 *
 * **O que ela NÃO é mais (decisão nº 44): o replay do histórico.** Rever uma
 * partida arquivada é tocar a FITA gravada durante ela (`src/shared/tape.ts`), e
 * a fita não pergunta nada ao motor. Reexecutar aqui virou a ferramenta de dois
 * momentos, ambos de GRAVAÇÃO ou de depuração:
 *
 * - o treino chega do cliente como receita e o servidor o reexecuta UMA vez, no
 *   ato de arquivar, para conferir o desfecho e gravar a fita;
 * - partida anterior à decisão nº 44 não tem fita, e sobra reconstituí-la com o
 *   motor de hoje — a tela avisa que é reconstituição, porque pode divergir.
 *
 * E é justamente por isso que `truncated` existe: a receita envelhece, a fita
 * não.
 */

export interface ReplayStep {
  /** `null` só no primeiro passo: a abertura da partida não é lance de ninguém */
  command: Command | null;
  /** o estado DEPOIS do passo */
  state: GameState;
  /** o que o passo emitiu, na ordem */
  events: GameEvent[];
}

export interface ReplayResult {
  steps: ReplayStep[];
  /**
   * O registro parou de ser aceito no meio: uma REGRA mudou depois da partida, e
   * o comando que era legal na época deixou de ser.
   *
   * É a fraqueza da receita, e a razão de a decisão nº 44 ter trocado o replay
   * do histórico por uma fita. Aqui ela continua honesta: em vez de inventar um
   * tabuleiro que nunca existiu, o registro para e diz que parou.
   */
  truncated: boolean;
}

/**
 * Reexecuta a partida inteira, um passo por comando aceito.
 *
 * Comando recusado interrompe: o registro deixou de casar com as regras de hoje,
 * e seguir aplicando o resto daria um tabuleiro que nunca existiu.
 */
export function replayMatch(config: MatchConfig, commands: readonly Command[]): ReplayResult {
  const opened = createMatch(config);
  const steps: ReplayStep[] = [{ command: null, state: opened.state, events: opened.events }];

  let state = opened.state;
  for (const command of commands) {
    const result = reduce(state, command);
    if (result.error) return { steps, truncated: true };
    state = result.state;
    steps.push({ command, state, events: result.events });
  }
  return { steps, truncated: false };
}
