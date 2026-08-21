/**
 * O relógio da partida: quanto falta do turno e quanto falta de uma janela de
 * reação.
 *
 * Vive FORA do motor porque depende do relógio de parede, e o motor não olha
 * `Date.now` (invariante 1) — mas é a mesma peça no servidor (autoridade) e no
 * treino local, senão as duas contagens divergiriam. Puro do mesmo jeito: recebe
 * o `agora` de quem chama e devolve o prazo; quem arma `setTimeout` é o dono.
 *
 * A regra que ele existe para garantir: **o prazo do turno não recomeça a cada
 * lance**. Antes, cada comando re-armava 60 segundos (o servidor) ou trocava a
 * chave do prazo (o treino), e a barra do turno voltava ao cheio toda vez que o
 * jogador invocava, anexava ou atacava — relato do DevLukkas. Aqui o prazo do
 * turno nasce UMA vez por turno, é SEGURADO enquanto uma janela de reação corre
 * (quem gasta os 7 segundos é o outro lado) e volta de onde parou.
 */

export const TURN_SECONDS = 60;
/** janela de reação à jogada do oponente (paridade com os 7s do legado) */
export const REACTION_SECONDS = 7;

export interface MatchClock {
  /** identidade do turno corrente; mudou, o prazo do turno recomeça cheio */
  turnKey: string;
  /** epoch ms em que o turno vence; 0 = o prazo do turno não está correndo */
  turnDeadline: number;
  /** ms que sobravam quando o prazo do turno foi segurado */
  turnLeftMs: number;
  /** id da pendência de reação vigente; '' = nenhuma */
  reactionKey: string;
  /** epoch ms em que a janela de reação vence; 0 = não está correndo */
  reactionDeadline: number;
}

/** O prazo que vale AGORA — é o que vai para a tela e o que o timer persegue. */
export interface ClockDeadline {
  /** epoch ms; 0 = nenhum prazo correndo (partida acabada ou relógio segurado) */
  deadlineMs: number;
  /** o prazo vigente é o da janela de reação (curto), não o do turno */
  reaction: boolean;
}

/** O recorte do estado que o relógio consulta — serve `GameState` e `GameView`. */
export interface ClockSubject {
  turn: number;
  phase: string;
  activeSide: string;
  pending: { id: string; reaction?: true } | null;
  winner: unknown;
}

export function newClock(): MatchClock {
  return {
    turnKey: '',
    turnDeadline: 0,
    turnLeftMs: TURN_SECONDS * 1000,
    reactionKey: '',
    reactionDeadline: 0,
  };
}

/**
 * Reacerta o relógio para o estado atual e devolve o prazo vigente.
 *
 * `start: false` reconhece a situação e NÃO deixa o prazo correr ainda — é o que
 * o treino usa enquanto a animação do lance está tocando (decisão nº 25): o
 * relógio só começa quando o jogador enfim enxerga a situação.
 */
export function advanceClock(
  clock: MatchClock,
  subject: ClockSubject,
  now: number,
  options: { start?: boolean } = {},
): ClockDeadline {
  const start = options.start !== false;

  if (subject.winner) {
    clock.turnDeadline = 0;
    clock.reactionKey = '';
    clock.reactionDeadline = 0;
    return { deadlineMs: 0, reaction: false };
  }

  const turnKey = `${subject.turn}:${subject.activeSide}:${subject.phase === 'mulligan' ? 'm' : 'j'}`;
  if (turnKey !== clock.turnKey) {
    clock.turnKey = turnKey;
    clock.turnDeadline = 0;
    clock.turnLeftMs = TURN_SECONDS * 1000;
  }

  const reaction = subject.pending?.reaction ? subject.pending : null;
  if (reaction) {
    // o prazo do turno PARA: o tempo da janela é gasto por quem responde, não
    // por quem está no turno
    if (clock.turnDeadline) {
      clock.turnLeftMs = Math.max(0, clock.turnDeadline - now);
      clock.turnDeadline = 0;
    }
    if (clock.reactionKey !== reaction.id) {
      clock.reactionKey = reaction.id;
      clock.reactionDeadline = 0;
    }
    if (!clock.reactionDeadline && start) {
      clock.reactionDeadline = now + REACTION_SECONDS * 1000;
    }
    return { deadlineMs: clock.reactionDeadline, reaction: true };
  }

  clock.reactionKey = '';
  clock.reactionDeadline = 0;
  if (!clock.turnDeadline && start) clock.turnDeadline = now + clock.turnLeftMs;
  return { deadlineMs: clock.turnDeadline, reaction: false };
}
