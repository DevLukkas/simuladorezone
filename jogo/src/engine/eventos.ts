import type { Elemento, FichaDeCriatura } from '../data/tipos.ts';
import type { CartaNaZona, Fase, LadoId } from './estado.ts';

/**
 * Vocabulário fechado de eventos — o contrato com o cliente (animação) e o
 * event log do servidor. Campos marcados como "ocultável" são removidos pela
 * redação (`redigirEvento`) quando o destinatário não pode vê-los.
 */
export type Evento =
  | { tipo: 'PARTIDA_INICIADA'; primeiroLado: LadoId; turno: number }
  | { tipo: 'MULLIGAN_DECIDIDO'; lado: LadoId; trocou: boolean }
  /** carta ausente = compra oculta (visão do oponente) */
  | { tipo: 'CARTA_COMPRADA'; lado: LadoId; carta?: CartaNaZona }
  | { tipo: 'MAO_CHEIA_DESCARTOU'; lado: LadoId; carta: CartaNaZona }
  | { tipo: 'TURNO_INICIADO'; lado: LadoId; turno: number }
  | { tipo: 'FASE_MUDOU'; fase: Fase }
  | { tipo: 'CRIATURA_INVOCADA'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'FICHA_CRIADA'; lado: LadoId; slot: number; uid: string; ficha: FichaDeCriatura }
  | { tipo: 'CARTA_ANEXADA'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'CENARIO_JOGADO'; lado: LadoId; carta: CartaNaZona }
  | { tipo: 'ATAQUE_DECLARADO'; lado: LadoId; slot: number }
  | {
      tipo: 'COMBATE';
      atacante: { lado: LadoId; slot: number; uid: string };
      defensor: { lado: LadoId; slot: number; uid: string };
      danoAoDefensor: number;
      danoAoAtacante: number;
    }
  | { tipo: 'DANO_DIRETO'; sofredor: LadoId; valor: number; origemUid: string }
  | { tipo: 'PONTUOU'; lado: LadoId; ganhos: number; total: number }
  | {
      tipo: 'CRIATURA_DESTRUIDA';
      lado: LadoId;
      slot: number;
      uid: string;
      emBatalha: boolean;
      /** fichas somem; cartas reais vão ao descarte */
      paraDescarte: boolean;
    }
  | { tipo: 'ANEXO_DESCARTADO'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'ANEXO_DEVOLVIDO_A_MAO'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'TURNO_ENCERRADO'; lado: LadoId; turno: number }
  | { tipo: 'FIM_DE_JOGO'; vencedor: LadoId; motivo: 'pontos' | 'desistencia' | 'tempo' }
  // ── habilidades e efeitos ──────────────────────────────────────────────
  | { tipo: 'CARTA_DESCARTADA'; lado: LadoId; carta: CartaNaZona; motivo: 'efeito' | 'custo' }
  /** busca no deck: carta pública ao dono, oculta ao oponente */
  | { tipo: 'CARTA_BUSCADA'; lado: LadoId; carta?: CartaNaZona }
  | { tipo: 'CARTA_REVELADA'; lado: LadoId; carta: CartaNaZona }
  | { tipo: 'CARTA_EMBARALHADA_NO_DECK'; lado: LadoId; carta: CartaNaZona }
  | { tipo: 'MOIDA_DO_DECK'; lado: LadoId; carta: CartaNaZona }
  | { tipo: 'MARCADOR_ADICIONADO'; lado: LadoId; criaturaUid: string; attack: number; defense: number }
  | { tipo: 'MODIFICADOR_TEMPORARIO'; lado: LadoId; criaturaUid: string; attack: number; defense: number }
  | { tipo: 'DANO_EM_CRIATURA'; lado: LadoId; criaturaUid: string; valor: number }
  | { tipo: 'CURA_EM_CRIATURA'; lado: LadoId; criaturaUid: string; valor: number }
  | { tipo: 'ELEMENTO_ALTERADO'; lado: LadoId; criaturaUid: string; de: Elemento; para: Elemento }
  | {
      tipo: 'STATS_TROCADOS';
      lado: LadoId;
      criaturaUid: string;
      /** Sapotristan: a troca dura enquanto o elemento estiver alterado */
      enquantoElementoAlterado: boolean;
    }
  | { tipo: 'ATAQUE_NEGADO'; lado: LadoId; slot: number; anexoCartaId: number }
  | { tipo: 'ATAQUE_BLOQUEADO_NAO_PODE_ATACAR'; lado: LadoId; slot: number }
  | { tipo: 'IMPEDIDA_DE_ATACAR'; lado: LadoId; criaturaUid: string; ateTurno: number }
  | { tipo: 'PROTEGIDA_DE_ATAQUES'; lado: LadoId; criaturaUid: string; ateTurno: number }
  | { tipo: 'COMANDO_JOGADO'; lado: LadoId; carta: CartaNaZona }
  /** o lado recusou (ou deixou expirar) uma janela de reação */
  | { tipo: 'REACAO_RECUSADA'; lado: LadoId }
  | { tipo: 'HABILIDADE_ATIVADA'; lado: LadoId; origemUid: string; habilidadeId: string }
  | { tipo: 'CRIATURA_SACRIFICADA'; lado: LadoId; slot: number; uid: string }
  | { tipo: 'INVOCADA_DO_DECK'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'INVOCADA_DO_DESCARTE'; lado: LadoId; slot: number; carta: CartaNaZona }
  | { tipo: 'HEROI_ATIVADO'; lado: LadoId; heroi: string }
  | { tipo: 'CENARIO_ATIVOU'; lado: LadoId; cartaId: number };
