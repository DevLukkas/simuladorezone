import { validarDeck, type DeckProposto } from '../src/data/regras.ts';
import { FORMATOS, type Formato } from '../src/data/tipos.ts';
import { inteiro, texto } from './banco.ts';
import { comConta } from './contas.ts';
import { criado, ok, recusado } from './http.ts';
import type { Banco, Linha } from './banco.ts';
import type { Rota } from './http.ts';

// A validação usa a MESMA função do cliente (src/data/regras.ts) — o padrão da
// casa: servidor e jogo compartilham o código, o servidor é a autoridade.

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const NOME_MAXIMO = 60;

const ehFormato = (valor: unknown): valor is Formato =>
  FORMATOS.includes(valor as Formato);

function propostaDoCorpo(corpo: unknown): DeckProposto | null {
  if (!ehObjeto(corpo)) return null;
  if (typeof corpo.nome !== 'string' || typeof corpo.heroi !== 'string') return null;
  if (!ehObjeto(corpo.cartas)) return null;
  if (corpo.formato !== undefined && !ehFormato(corpo.formato)) return null;

  const cartas: Record<number, number> = {};
  for (const [chave, valor] of Object.entries(corpo.cartas)) {
    const id = Number(chave);
    const quantidade = Number(valor);
    if (!Number.isInteger(id) || !Number.isInteger(quantidade)) return null;
    cartas[id] = quantidade;
  }

  return {
    nome: corpo.nome.trim().slice(0, NOME_MAXIMO),
    heroi: corpo.heroi,
    cartas,
    formato: ehFormato(corpo.formato) ? corpo.formato : 'classico',
  };
}

function deckCompleto(banco: Banco, linha: Linha): Record<string, unknown> {
  const id = inteiro(linha.id);
  const cartas: Record<number, number> = {};
  for (const cartaLinha of banco.todas(
    'SELECT carta_id, quantidade FROM deck_cartas WHERE deck_id = ?',
    id,
  )) {
    cartas[inteiro(cartaLinha.carta_id)] = inteiro(cartaLinha.quantidade);
  }
  return {
    id,
    nome: texto(linha.nome),
    heroi: texto(linha.heroi),
    cartas,
    formato: texto(linha.formato) || 'classico',
  };
}

function gravarCartas(banco: Banco, deckId: number, cartas: Record<number, number>): void {
  banco.executar('DELETE FROM deck_cartas WHERE deck_id = ?', deckId);
  for (const [cartaId, quantidade] of Object.entries(cartas)) {
    banco.executar(
      'INSERT INTO deck_cartas (deck_id, carta_id, quantidade) VALUES (?, ?, ?)',
      deckId,
      Number(cartaId),
      quantidade,
    );
  }
}

export const rotasDeDecks = (banco: Banco): Rota[] => [
  {
    metodo: 'GET',
    padrao: '/api/decks',
    responder: comConta(banco, (_pedido, conta) => {
      const linhas = banco.todas(
        'SELECT id, nome, heroi, formato FROM decks WHERE conta_id = ? ORDER BY id',
        conta.id,
      );
      return ok({ decks: linhas.map((linha) => deckCompleto(banco, linha)) });
    }),
  },
  {
    metodo: 'POST',
    padrao: '/api/decks',
    responder: comConta(banco, (pedido, conta) => {
      const proposta = propostaDoCorpo(pedido.corpo);
      if (!proposta) return recusado(400, 'deck malformado');
      const problemas = validarDeck(proposta);
      if (problemas.length) return recusado(422, problemas.join(' '));

      return banco.emTransacao(() => {
        banco.executar(
          'INSERT INTO decks (conta_id, nome, heroi, formato, criada_em) VALUES (?, ?, ?, ?, ?)',
          conta.id,
          proposta.nome,
          proposta.heroi,
          proposta.formato ?? 'classico',
          new Date().toISOString(),
        );
        const id = inteiro(banco.uma('SELECT last_insert_rowid() AS id')?.id);
        gravarCartas(banco, id, proposta.cartas);
        return criado({
          id,
          nome: proposta.nome,
          heroi: proposta.heroi,
          cartas: proposta.cartas,
          formato: proposta.formato ?? 'classico',
        });
      });
    }),
  },
  {
    metodo: 'PUT',
    padrao: '/api/decks/:id',
    responder: comConta(banco, (pedido, conta) => {
      const id = Number(pedido.parametros.id);
      const dono = banco.uma('SELECT id FROM decks WHERE id = ? AND conta_id = ?', id, conta.id);
      if (!dono) return recusado(404, 'deck não encontrado');

      const proposta = propostaDoCorpo(pedido.corpo);
      if (!proposta) return recusado(400, 'deck malformado');
      const problemas = validarDeck(proposta);
      if (problemas.length) return recusado(422, problemas.join(' '));

      return banco.emTransacao(() => {
        banco.executar(
          'UPDATE decks SET nome = ?, heroi = ?, formato = ? WHERE id = ?',
          proposta.nome,
          proposta.heroi,
          proposta.formato ?? 'classico',
          id,
        );
        gravarCartas(banco, id, proposta.cartas);
        return ok({
          id,
          nome: proposta.nome,
          heroi: proposta.heroi,
          cartas: proposta.cartas,
          formato: proposta.formato ?? 'classico',
        });
      });
    }),
  },
  {
    metodo: 'DELETE',
    padrao: '/api/decks/:id',
    responder: comConta(banco, (pedido, conta) => {
      const id = Number(pedido.parametros.id);
      const apagadas = banco.executar(
        'DELETE FROM decks WHERE id = ? AND conta_id = ?',
        id,
        conta.id,
      );
      if (!apagadas) return recusado(404, 'deck não encontrado');
      return ok({ apagado: true });
    }),
  },
];

/** Carrega um deck da conta no formato do engine (lista de ids + herói). */
export function deckParaPartida(
  banco: Banco,
  contaId: number,
  deckId: number,
): { heroi: string; cartas: number[]; formato: Formato } | null {
  const linha = banco.uma(
    'SELECT id, heroi, formato FROM decks WHERE id = ? AND conta_id = ?',
    deckId,
    contaId,
  );
  if (!linha) return null;
  const cartas: number[] = [];
  for (const cartaLinha of banco.todas(
    'SELECT carta_id, quantidade FROM deck_cartas WHERE deck_id = ?',
    deckId,
  )) {
    for (let i = 0; i < inteiro(cartaLinha.quantidade); i++) {
      cartas.push(inteiro(cartaLinha.carta_id));
    }
  }
  if (!cartas.length) return null;
  const formato = texto(linha.formato);
  return {
    heroi: texto(linha.heroi),
    cartas,
    formato: FORMATOS.includes(formato as Formato) ? (formato as Formato) : 'classico',
  };
}
