import { describe, expect, test } from 'vitest';
import { aplicarComando } from '../reduzir.ts';
import { ladoOposto } from '../estado.ts';
import type { EstadoDoJogo, LadoId } from '../estado.ts';
import {
  anexarDireto,
  aplicarOk,
  colocarCriatura,
  irParaBatalha,
  partidaPronta,
  porNaMao,
  responderOk,
} from './ajuda.ts';

/** Invoca uma criatura qualquer pelo lado ativo, no slot 0. */
function invocarPeloAtivo(estado: EstadoDoJogo): { estado: EstadoDoJogo; ativo: LadoId; reator: LadoId } {
  const ativo = estado.ladoAtivo;
  const uid = porNaMao(estado, ativo, 1);
  return {
    estado: aplicarOk(estado, { tipo: 'INVOCAR', lado: ativo, uidCarta: uid, slot: 0 }),
    ativo,
    reator: ladoOposto(ativo),
  };
}

describe('janela de reação com comandos', () => {
  test('invocação abre a janela para o oponente com comando na mão; recusar não muda nada', () => {
    const base = partidaPronta();
    const uidComando = porNaMao(base, ladoOposto(base.ladoAtivo), 22); // Escolha as Cegas
    const { estado, reator } = invocarPeloAtivo(base);

    expect(estado.pendencia?.reacao).toBe(true);
    expect(estado.pendencia?.lado).toBe(reator);
    expect(estado.pendencia?.opcoes.map((opcao) => opcao.id)).toEqual([uidComando]);

    const resultado = aplicarComando(estado, {
      tipo: 'RESPONDER',
      lado: reator,
      pendenciaId: estado.pendencia!.id,
      opcaoId: 'recusar',
    });
    expect(resultado.erro).toBeUndefined();
    expect(resultado.eventos.some((evento) => evento.tipo === 'REACAO_RECUSADA')).toBe(true);
    expect(resultado.estado.pendencia).toBeNull();
    expect(resultado.estado.lados[reator].mao.some((carta) => carta.uid === uidComando)).toBe(true);
  });

  test('reagir com comando sem alvo resolve na hora e não reabre janela', () => {
    const base = partidaPronta();
    const uidComando = porNaMao(base, ladoOposto(base.ladoAtivo), 22);
    const { estado, reator } = invocarPeloAtivo(base);

    const resultado = aplicarComando(estado, {
      tipo: 'RESPONDER',
      lado: reator,
      pendenciaId: estado.pendencia!.id,
      opcaoId: uidComando,
    });
    expect(resultado.erro).toBeUndefined();
    expect(resultado.eventos.some((evento) => evento.tipo === 'COMANDO_JOGADO')).toBe(true);
    expect(resultado.estado.pendencia).toBeNull();
    expect(resultado.estado.lados[reator].descarte.some((carta) => carta.uid === uidComando)).toBe(
      true,
    );
  });

  test('reagir com comando que exige alvo pede o alvo e aplica o efeito', () => {
    const base = partidaPronta();
    const uidComando = porNaMao(base, ladoOposto(base.ladoAtivo), 21); // Riso Histérico
    let { estado } = invocarPeloAtivo(base);
    const ativo = ladoOposto(estado.pendencia!.lado);

    estado = responderOk(estado, uidComando);
    expect(estado.pendencia?.tipo).toBe('escolher_alvo');
    expect(estado.pendencia?.reacao).toBe(true);

    estado = responderOk(estado, `${ativo}:0`);
    expect(estado.pendencia).toBeNull();
    expect(estado.lados[ativo].campo[0]?.naoPodeAtacarAteTurno).toBe(estado.turno);
  });

  test('sem comando jogável na mão do oponente, nenhuma janela abre', () => {
    const { estado } = invocarPeloAtivo(partidaPronta());
    expect(estado.pendencia).toBeNull();
  });

  test('comando cujo alvo obrigatório não existe fica fora da oferta', () => {
    const base = partidaPronta();
    // Ritual da Esfera exige criatura própria do reator — ele não tem nenhuma
    porNaMao(base, ladoOposto(base.ladoAtivo), 25);
    const { estado } = invocarPeloAtivo(base);
    expect(estado.pendencia).toBeNull();
  });

  test('ataque abre a janela depois de o combate resolver', () => {
    let estado = partidaPronta();
    const ativo = estado.ladoAtivo;
    const reator = ladoOposto(ativo);
    colocarCriatura(estado, ativo, 0, 1);
    porNaMao(estado, reator, 22);
    estado = irParaBatalha(estado, ativo);

    const resultado = aplicarComando(estado, { tipo: 'ATACAR', lado: ativo, slot: 0 });
    expect(resultado.erro).toBeUndefined();
    expect(resultado.eventos.some((evento) => evento.tipo === 'DANO_DIRETO')).toBe(true);
    expect(resultado.estado.pendencia?.reacao).toBe(true);
    expect(resultado.estado.pendencia?.lado).toBe(reator);
  });

  test('TEMPO_ESGOTADO recusa a janela aberta e encerra o turno', () => {
    const base = partidaPronta();
    porNaMao(base, ladoOposto(base.ladoAtivo), 22);
    const { estado, ativo, reator } = invocarPeloAtivo(base);
    expect(estado.pendencia?.reacao).toBe(true);

    const resultado = aplicarComando(estado, { tipo: 'TEMPO_ESGOTADO' });
    expect(resultado.erro).toBeUndefined();
    expect(resultado.eventos.some((evento) => evento.tipo === 'REACAO_RECUSADA')).toBe(true);
    expect(resultado.estado.pendencia).toBeNull();
    expect(resultado.estado.ladoAtivo).toBe(reator);
    expect(resultado.estado.ladoAtivo).not.toBe(ativo);
  });
});

describe('janela de reação com habilidades de criatura', () => {
  test('início da batalha oferece ativar Mysticus (custo: Tridente anexado)', () => {
    let estado = partidaPronta();
    const ativo = estado.ladoAtivo;
    const reator = ladoOposto(ativo);
    const mysticus = colocarCriatura(estado, reator, 2, 3);
    anexarDireto(mysticus, 9); // Tridente Poderoso de Atlas

    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado: ativo });
    expect(estado.pendencia?.reacao).toBe(true);
    expect(estado.pendencia?.lado).toBe(reator);
    expect(estado.pendencia?.opcoes.map((opcao) => opcao.id)).toEqual([`${reator}:2`]);

    estado = responderOk(estado, `${reator}:2`);
    const criatura = estado.lados[reator].campo[2]!;
    expect(criatura.naoPodeAtacarAteTurno).toBe(estado.turno + 1);
    expect(criatura.anexos).toHaveLength(0);
    expect(estado.lados[reator].descarte.some((carta) => carta.cartaId === 9)).toBe(true);
  });

  test('sem custo pagável, a criatura não entra na oferta', () => {
    let estado = partidaPronta();
    const ativo = estado.ladoAtivo;
    colocarCriatura(estado, ladoOposto(ativo), 2, 3); // Mysticus sem Tridente
    estado = aplicarOk(estado, { tipo: 'AVANCAR_FASE', lado: ativo });
    expect(estado.pendencia).toBeNull();
  });

  test('habilidade condicionada ao turno do oponente segue bloqueada fora da reação', () => {
    const estado = partidaPronta();
    const ativo = estado.ladoAtivo;
    const feiticeiro = colocarCriatura(estado, ativo, 0, 32);
    const resultado = aplicarComando(estado, {
      tipo: 'ATIVAR_HABILIDADE',
      lado: ativo,
      origemUid: feiticeiro.uid,
      habilidadeId: 'feiticeiro_tribal_forcar_ataque',
    });
    expect(resultado.erro).toContain('reação');
  });
});
