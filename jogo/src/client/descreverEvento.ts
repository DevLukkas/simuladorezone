import { cartaPorId } from '../data/cartas.ts';
import type { Evento } from '../engine/eventos.ts';
import type { LadoId } from '../engine/estado.ts';

function nome(cartaId: number): string {
  return cartaPorId(cartaId).nome;
}

/** Descrição legível de um evento, na perspectiva de `meuLado`. Null = silencioso. */
export function descreverEvento(evento: Evento, meuLado: LadoId): string | null {
  const meu = (lado: LadoId) => lado === meuLado;
  const quem = (lado: LadoId) => (meu(lado) ? 'Você' : 'O oponente');

  switch (evento.tipo) {
    case 'PARTIDA_INICIADA':
      return `Partida iniciada — ${meu(evento.primeiroLado) ? 'você começa' : 'o oponente começa'}.`;
    case 'MULLIGAN_DECIDIDO':
      return `${quem(evento.lado)} ${evento.trocou ? 'trocou a mão' : 'manteve a mão'}.`;
    case 'CARTA_COMPRADA':
      return meu(evento.lado) && evento.carta
        ? `Você comprou ${nome(evento.carta.cartaId)}.`
        : `${quem(evento.lado)} comprou 1 carta.`;
    case 'MAO_CHEIA_DESCARTOU':
      return `${quem(evento.lado)} descartou ${nome(evento.carta.cartaId)} (mão cheia).`;
    case 'TURNO_INICIADO':
      return `Turno ${evento.turno}: ${meu(evento.lado) ? 'sua vez' : 'vez do oponente'}.`;
    case 'FASE_MUDOU':
      return evento.fase === 'batalha' ? 'Fase de batalha.' : null;
    case 'CRIATURA_INVOCADA':
      return `${quem(evento.lado)} invocou ${nome(evento.carta.cartaId)}.`;
    case 'FICHA_CRIADA':
      return `${quem(evento.lado)} criou ${evento.ficha.nome}.`;
    case 'CARTA_ANEXADA':
      return `${quem(evento.lado)} anexou ${nome(evento.carta.cartaId)}.`;
    case 'CENARIO_JOGADO':
      return `${quem(evento.lado)} ativou o cenário ${nome(evento.carta.cartaId)}.`;
    case 'ATAQUE_DECLARADO':
      return null;
    case 'COMBATE':
      return `Combate na coluna ${evento.atacante.slot + 1}: ${evento.danoAoDefensor} de dano no defensor, ${evento.danoAoAtacante} no atacante.`;
    case 'DANO_DIRETO':
      return `${quem(evento.sofredor)} sofreu ${evento.valor} de dano direto.`;
    case 'PONTUOU':
      return `${quem(evento.lado)} marcou ${evento.ganhos} ponto(s) — total ${evento.total}.`;
    case 'CRIATURA_DESTRUIDA':
      return evento.paraDescarte ? 'Criatura destruída.' : 'A ficha se desfez.';
    case 'ANEXO_DESCARTADO':
      return `${nome(evento.carta.cartaId)} foi para o descarte.`;
    case 'ANEXO_DEVOLVIDO_A_MAO':
      return `${nome(evento.carta.cartaId)} voltou para a mão.`;
    case 'TURNO_ENCERRADO':
      return null;
    case 'FIM_DE_JOGO': {
      const motivo =
        evento.motivo === 'pontos' ? '' : evento.motivo === 'desistencia' ? ' (desistência)' : ' (tempo)';
      return meu(evento.vencedor) ? `VITÓRIA!${motivo}` : `Derrota.${motivo}`;
    }
    case 'CARTA_DESCARTADA':
      return `${quem(evento.lado)} descartou ${nome(evento.carta.cartaId)}.`;
    case 'CARTA_BUSCADA':
      return meu(evento.lado) && evento.carta
        ? `Você buscou ${nome(evento.carta.cartaId)}.`
        : `${quem(evento.lado)} buscou 1 carta no baralho.`;
    case 'CARTA_REVELADA':
      return `Revelada: ${nome(evento.carta.cartaId)}.`;
    case 'CARTA_EMBARALHADA_NO_DECK':
      return `${nome(evento.carta.cartaId)} foi embaralhada no baralho.`;
    case 'MOIDA_DO_DECK':
      return `${quem(evento.lado)} moeu ${nome(evento.carta.cartaId)}.`;
    case 'MARCADOR_ADICIONADO':
      return `Marcador ${sinal(evento.attack)}/${sinal(evento.defense)} aplicado.`;
    case 'MODIFICADOR_TEMPORARIO':
      return `Efeito até o fim do turno: ${sinal(evento.attack)}/${sinal(evento.defense)}.`;
    case 'DANO_EM_CRIATURA':
      return `Criatura sofreu ${evento.valor} de dano por efeito.`;
    case 'CURA_EM_CRIATURA':
      return `Criatura curou ${evento.valor} de vida.`;
    case 'ELEMENTO_ALTERADO':
      return `Elemento alterado: ${evento.de} → ${evento.para}.`;
    case 'STATS_TROCADOS':
      return evento.enquantoElementoAlterado
        ? 'ATQ e VIDA trocados enquanto o elemento estiver alterado.'
        : 'ATQ e VIDA trocados.';
    case 'ATAQUE_NEGADO':
      return `${nome(evento.anexoCartaId)} negou o ataque!`;
    case 'ATAQUE_BLOQUEADO_NAO_PODE_ATACAR':
      return null;
    case 'IMPEDIDA_DE_ATACAR':
      return 'Criatura impedida de atacar.';
    case 'PROTEGIDA_DE_ATAQUES':
      return 'Criatura protegida de ataques neste turno.';
    case 'COMANDO_JOGADO':
      return `${quem(evento.lado)} jogou ${nome(evento.carta.cartaId)}.`;
    case 'REACAO_RECUSADA':
      return meu(evento.lado) ? null : 'O oponente preferiu não reagir.';
    case 'HABILIDADE_ATIVADA':
      return `${quem(evento.lado)} ativou uma habilidade.`;
    case 'CRIATURA_SACRIFICADA':
      return `${quem(evento.lado)} sacrificou uma criatura.`;
    case 'INVOCADA_DO_DECK':
      return `${nome(evento.carta.cartaId)} foi invocada do baralho.`;
    case 'INVOCADA_DO_DESCARTE':
      return `${nome(evento.carta.cartaId)} foi invocada do descarte.`;
    case 'HEROI_ATIVADO':
      return `Efeito do herói ${evento.heroi} ativou.`;
    case 'CENARIO_ATIVOU':
      return `${nome(evento.cartaId)} ativou.`;
  }
}

function sinal(valor: number): string {
  return valor >= 0 ? `+${valor}` : String(valor);
}
