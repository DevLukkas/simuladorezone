import { DatabaseSync } from 'node:sqlite';

// único arquivo do servidor que conhece node:sqlite (padrão jogo-gacha):
// trocar de banco um dia é reescrever este arquivo, não caçar conexões
export type Valor = string | number | bigint | null | Uint8Array;

export type Linha = Record<string, unknown>;

export type Banco = {
  todas: (sql: string, ...parametros: Valor[]) => Linha[];
  uma: (sql: string, ...parametros: Valor[]) => Linha | null;
  executar: (sql: string, ...parametros: Valor[]) => number;
  cru: (sql: string) => void;
  emTransacao: <T>(corpo: () => T) => T;
  versao: () => number;
  definirVersao: (numero: number) => void;
  fechar: () => void;
};

export const abrirBanco = (caminho: string): Banco => {
  const conexao = new DatabaseSync(caminho);
  conexao.exec('PRAGMA journal_mode = WAL');
  conexao.exec('PRAGMA foreign_keys = ON');

  return {
    todas: (sql, ...parametros) => conexao.prepare(sql).all(...parametros),
    uma: (sql, ...parametros) => conexao.prepare(sql).get(...parametros) ?? null,
    executar: (sql, ...parametros) => Number(conexao.prepare(sql).run(...parametros).changes),
    cru: (sql) => conexao.exec(sql),
    emTransacao: (corpo) => {
      conexao.exec('BEGIN');
      try {
        const devolvido = corpo();
        conexao.exec('COMMIT');
        return devolvido;
      } catch (erro) {
        conexao.exec('ROLLBACK');
        throw erro;
      }
    },
    versao: () => {
      const linha = conexao.prepare('PRAGMA user_version').get();
      return inteiro(linha?.user_version);
    },
    // PRAGMA não aceita parâmetro ligado; o número nunca vem de fora — é o
    // comprimento da lista de migrações deste código
    definirVersao: (numero) => conexao.exec(`PRAGMA user_version = ${Math.trunc(numero)}`),
    fechar: () => conexao.close(),
  };
};

export const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

export const inteiro = (valor: unknown): number => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return Math.trunc(valor);
  if (typeof valor === 'bigint') return Number(valor);
  return 0;
};
