import { cartaPorId } from '../data/cartas.ts';
import { cartaAnexavel } from './cartasEmJogo.ts';
import type { Comando } from './comandos.ts';
import { podeSerAlvoDeAtaque } from './combate.ts';
import { ladoOposto, type EstadoDoJogo, type LadoId } from './estado.ts';
import { podeAnexarEm, podeAtacar, podeInvocarNormalmente } from './alvos.ts';

/**
 * Bot heurístico mínimo (paridade com o soloAi do legado): invoca a primeira
 * criatura no primeiro slot vazio, anexa o que der, ataca com todo mundo e
 * passa. Um comando por chamada — o chamador re-invoca até receber null.
 */
export function decidirComando(estado: EstadoDoJogo, lado: LadoId): Comando | null {
  if (estado.vencedor) return null;

  if (estado.pendencia) {
    if (estado.pendencia.lado !== lado) return null;
    const pendencia = estado.pendencia;
    // política do soloAi: opcionais recusados, exceto o escudo (a IA do legado
    // sempre nega o ataque); listas de escolha pegam a primeira opção
    let opcaoId: string | undefined;
    if (pendencia.tipo === 'sim_nao') {
      opcaoId = pendencia.contexto.tipo === 'escudo' ? 'sim' : 'nao';
    } else if (pendencia.podeRecusar) {
      opcaoId = 'recusar';
    } else {
      opcaoId = pendencia.opcoes[0]?.id;
    }
    if (!opcaoId) return null;
    return { tipo: 'RESPONDER', lado, pendenciaId: pendencia.id, opcaoId };
  }

  const dono = estado.lados[lado];

  if (estado.fase === 'mulligan') {
    if (dono.mulliganDecidido) return null;
    return { tipo: 'DECIDIR_MULLIGAN', lado, trocar: false };
  }

  if (estado.ladoAtivo !== lado) return null;

  if (estado.fase === 'principal') {
    if (!dono.acoes.invocou) {
      const slotVazio = dono.campo.findIndex((slot) => slot === null);
      if (slotVazio >= 0) {
        for (const naMao of dono.mao) {
          const carta = cartaPorId(naMao.cartaId);
          if (carta.tipo === 'criatura' && podeInvocarNormalmente(carta)) {
            return { tipo: 'INVOCAR', lado, uidCarta: naMao.uid, slot: slotVazio };
          }
        }
      }
    }

    for (const naMao of dono.mao) {
      const carta = cartaPorId(naMao.cartaId);
      if (!cartaAnexavel(carta)) continue;
      const slot = dono.campo.findIndex(
        (criatura) => criatura !== null && criatura.anexos.length < 2 && podeAnexarEm(carta, criatura),
      );
      if (slot >= 0) return { tipo: 'ANEXAR', lado, uidCarta: naMao.uid, slot };
    }

    if (!dono.cenario) {
      const cenario = dono.mao.find((naMao) => cartaPorId(naMao.cartaId).tipo === 'cenario');
      if (cenario) return { tipo: 'JOGAR_CENARIO', lado, uidCarta: cenario.uid };
    }

    return { tipo: 'AVANCAR_FASE', lado };
  }

  const slotAtacante = dono.campo.findIndex((criatura, slot) => {
    if (criatura === null || !podeAtacar(estado, lado, criatura)) return false;
    const defensor = estado.lados[ladoOposto(lado)].campo[slot];
    return !defensor || podeSerAlvoDeAtaque(estado.turno, defensor, criatura, dono.campo);
  });
  if (slotAtacante >= 0) return { tipo: 'ATACAR', lado, slot: slotAtacante };

  return { tipo: 'ENCERRAR_TURNO', lado };
}
