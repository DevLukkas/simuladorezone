import type { Elemento } from '../data/tipos.ts';
import type { LadoId } from './estado.ts';

/** Alvo de comando/habilidade: uma criatura em campo, por lado e slot. */
export interface AlvoDeSlot {
  lado: LadoId;
  slot: number;
}

/**
 * Vocabulário fechado de comandos: tudo que um jogador (ou o servidor, no
 * caso de TEMPO_ESGOTADO) pode pedir ao motor. Validar e recusar é papel do
 * `aplicarComando`; comando aceito nunca depende de quem o transportou.
 *
 * Escolhas conhecidas de antemão viajam como parâmetros (alvo, elemento,
 * substituição de anexo); escolhas que dependem de informação do servidor
 * (busca no deck, cartas reveladas, correntes) viram pendências + RESPONDER.
 */
export type Comando =
  | { tipo: 'DECIDIR_MULLIGAN'; lado: LadoId; trocar: boolean }
  | { tipo: 'INVOCAR'; lado: LadoId; uidCarta: string; slot: number }
  | {
      tipo: 'ANEXAR';
      lado: LadoId;
      uidCarta: string;
      slot: number;
      /** obrigatório quando a criatura já tem 2 anexos: qual descartar */
      substituirAnexoUid?: string;
    }
  | { tipo: 'JOGAR_CENARIO'; lado: LadoId; uidCarta: string }
  | {
      tipo: 'JOGAR_COMANDO';
      lado: LadoId;
      uidCarta: string;
      alvo?: AlvoDeSlot;
      alvoSecundario?: AlvoDeSlot;
    }
  | {
      tipo: 'ATIVAR_HABILIDADE';
      lado: LadoId;
      /** uid da criatura em campo, do anexo, ou da carta na mão */
      origemUid: string;
      habilidadeId: string;
      elemento?: Elemento;
      alvo?: AlvoDeSlot;
    }
  | { tipo: 'ATACAR'; lado: LadoId; slot: number }
  | { tipo: 'AVANCAR_FASE'; lado: LadoId }
  | { tipo: 'ENCERRAR_TURNO'; lado: LadoId }
  | { tipo: 'RESPONDER'; lado: LadoId; pendenciaId: string; opcaoId: string }
  | { tipo: 'CONCEDER'; lado: LadoId }
  /** emitido apenas pelo servidor quando o timer do turno estoura */
  | { tipo: 'TEMPO_ESGOTADO' };
