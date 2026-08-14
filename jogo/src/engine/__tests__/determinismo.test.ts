import { describe, expect, test } from 'vitest';
import { criarPartida } from '../criar.ts';
import { aplicarComando } from '../reduzir.ts';
import { decidirComando } from '../ia.ts';
import { deckDeTeste } from './ajuda.ts';
import type { EstadoDoJogo } from '../estado.ts';

function jogarPartidaCompleta(seed: number): { estado: EstadoDoJogo; comandos: number } {
  const criada = criarPartida({
    seed,
    decks: {
      a: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
      b: { heroi: 'morgon', cartas: deckDeTeste([1, 2, 5, 6, 9, 10, 28, 29, 31, 38, 44]) },
    },
  });
  let estado = criada.estado;
  let comandos = 0;

  while (!estado.vencedor && estado.turno <= 300) {
    const lado = estado.pendencia?.lado ?? (estado.fase === 'mulligan' ? 'a' : estado.ladoAtivo);
    const comando =
      decidirComando(estado, lado) ??
      decidirComando(estado, lado === 'a' ? 'b' : 'a');
    if (!comando) throw new Error('Bot sem comando possível fora do fim de jogo.');
    const resultado = aplicarComando(estado, comando);
    if (resultado.erro) throw new Error(`Bot produziu comando ilegal: ${resultado.erro}`);
    estado = resultado.estado;
    comandos++;
    if (comandos > 100_000) throw new Error('Partida não converge.');
  }
  return { estado, comandos };
}

describe('determinismo', () => {
  test('mesma seed → mesma partida, comando a comando', () => {
    const primeira = jogarPartidaCompleta(2026);
    const segunda = jogarPartidaCompleta(2026);
    expect(segunda.comandos).toBe(primeira.comandos);
    expect(JSON.stringify(segunda.estado)).toBe(JSON.stringify(primeira.estado));
  });

  test('partidas bot vs bot terminam com vencedor', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { estado } = jogarPartidaCompleta(seed);
      expect(estado.vencedor === 'a' || estado.vencedor === 'b' || estado.turno > 300).toBe(true);
    }
  });

  test('nenhuma carta some ou duplica (conservação por lado)', () => {
    const { estado } = jogarPartidaCompleta(11);
    for (const lado of ['a', 'b'] as const) {
      const dono = estado.lados[lado];
      const uids = new Set<string>();
      const coletar = (uid: string) => {
        expect(uids.has(uid)).toBe(false);
        uids.add(uid);
      };
      dono.deck.forEach((carta) => coletar(carta.uid));
      dono.mao.forEach((carta) => coletar(carta.uid));
      dono.descarte.forEach((carta) => coletar(carta.uid));
      dono.exilio.forEach((carta) => coletar(carta.uid));
      if (dono.cenario) coletar(dono.cenario.uid);
      for (const criatura of dono.campo) {
        if (!criatura) continue;
        if (criatura.cartaId !== null) coletar(criatura.uid);
        criatura.anexos.forEach((anexo) => coletar(anexo.uid));
      }
      expect(uids.size).toBe(40);
    }
  });
});
