import { criarPartida, type ConfiguracaoDaPartida } from '../criar.ts';
import { aplicarComando } from '../reduzir.ts';
import type { CriaturaEmCampo, EstadoDoJogo, LadoId } from '../estado.ts';

/** Deck simples para testes: repete a lista até dar 40 cartas. */
export function deckDeTeste(ids: number[], tamanho = 40): number[] {
  const cartas: number[] = [];
  while (cartas.length < tamanho) {
    for (const id of ids) {
      if (cartas.length >= tamanho) break;
      cartas.push(id);
    }
  }
  return cartas;
}

/** Cria a partida e resolve o mulligan (ambos mantêm). */
export function partidaPronta(config?: Partial<ConfiguracaoDaPartida>): EstadoDoJogo {
  const criada = criarPartida({
    seed: config?.seed ?? 42,
    decks: config?.decks ?? {
      a: { heroi: 'badur', cartas: deckDeTeste([1, 2, 5, 6, 28, 29, 30, 36]) },
      b: { heroi: 'ispisher', cartas: deckDeTeste([1, 2, 5, 6, 28, 29, 30, 36]) },
    },
  });
  let estado = criada.estado;
  for (const lado of ['a', 'b'] as const) {
    const resultado = aplicarComando(estado, { tipo: 'DECIDIR_MULLIGAN', lado, trocar: false });
    if (resultado.erro) throw new Error(resultado.erro);
    estado = resultado.estado;
  }
  return estado;
}

let uidsDeTeste = 0;

/** Coloca uma criatura direto no campo (atalho de teste), já apta a atacar. */
export function colocarCriatura(
  estado: EstadoDoJogo,
  lado: LadoId,
  slot: number,
  cartaId: number,
): CriaturaEmCampo {
  const criatura: CriaturaEmCampo = {
    uid: `teste${++uidsDeTeste}`,
    cartaId,
    dano: 0,
    marcadores: { attack: 0, defense: 0 },
    modificadoresTemporarios: [],
    anexos: [],
    invocadaNoTurno: 0,
    podeAtacarAPartirDoTurno: 0,
    habilidadesUsadas: {},
  };
  estado.lados[lado].campo[slot] = criatura;
  return criatura;
}

/** Anexa uma carta direto (atalho de teste, sem passar pela mão). */
export function anexarDireto(criatura: CriaturaEmCampo, cartaId: number): void {
  criatura.anexos.push({ uid: `teste${++uidsDeTeste}`, cartaId });
}

/** Aplica um comando que DEVE ser aceito; lança se o motor recusar. */
export function aplicarOk(
  estado: EstadoDoJogo,
  comando: Parameters<typeof aplicarComando>[1],
): EstadoDoJogo {
  const resultado = aplicarComando(estado, comando);
  if (resultado.erro) throw new Error(`Comando recusado: ${resultado.erro}`);
  return resultado.estado;
}

/** Responde a pendência atual; lança se não houver pendência ou o motor recusar. */
export function responderOk(estado: EstadoDoJogo, opcaoId: string): EstadoDoJogo {
  const pendencia = estado.pendencia;
  if (!pendencia) throw new Error('Não há pendência para responder.');
  return aplicarOk(estado, {
    tipo: 'RESPONDER',
    lado: pendencia.lado,
    pendenciaId: pendencia.id,
    opcaoId,
  });
}

/** Coloca uma carta específica na mão do lado (atalho de teste). */
export function porNaMao(estado: EstadoDoJogo, lado: 'a' | 'b', cartaId: number): string {
  const uid = `mao${++uidsDeTesteMao}`;
  estado.lados[lado].mao.push({ uid, cartaId });
  return uid;
}

let uidsDeTesteMao = 0;

/** Deixa o lado indicado como ativo, em fase de batalha. */
export function irParaBatalha(estado: EstadoDoJogo, lado: LadoId): EstadoDoJogo {
  let atual = estado;
  if (atual.ladoAtivo !== lado) {
    atual = aplicarOk(atual, { tipo: 'ENCERRAR_TURNO', lado: atual.ladoAtivo });
  }
  return aplicarOk(atual, { tipo: 'AVANCAR_FASE', lado });
}
