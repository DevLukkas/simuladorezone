import type { Evento } from './eventos.ts';
import { MAO_MAXIMA, type EstadoDoJogo, type LadoId } from './estado.ts';
import { inteiroAleatorio } from './rng.ts';

/**
 * Compra do topo do deck (índice 0). Deck vazio: simplesmente não compra
 * (paridade com o legado — não existe derrota por deck esgotado).
 * Estourou a mão (8): descarta aleatória até caber.
 */
export function comprarCartas(
  estado: EstadoDoJogo,
  lado: LadoId,
  quantidade: number,
  eventos: Evento[],
): void {
  const dono = estado.lados[lado];
  for (let i = 0; i < quantidade; i++) {
    const carta = dono.deck.shift();
    if (!carta) return;
    dono.mao.push(carta);
    eventos.push({ tipo: 'CARTA_COMPRADA', lado, carta });
    descartarSeMaoCheia(estado, lado, eventos);
  }
}

export function descartarSeMaoCheia(estado: EstadoDoJogo, lado: LadoId, eventos: Evento[]): void {
  const dono = estado.lados[lado];
  while (dono.mao.length > MAO_MAXIMA) {
    const sorteio = inteiroAleatorio(estado.rng, 0, dono.mao.length - 1);
    estado.rng = sorteio.rng;
    const [descartada] = dono.mao.splice(sorteio.valor, 1);
    if (!descartada) return;
    dono.descarte.push(descartada);
    eventos.push({ tipo: 'MAO_CHEIA_DESCARTOU', lado, carta: descartada });
  }
}
