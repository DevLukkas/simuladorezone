import http from 'node:http';
import https from 'node:https';

// Roteador mínimo sobre node:http (padrão jogo-gacha). Rotas JSON devolvem
// `Resposta`; rotas `bruta` (SSE) recebem a resposta crua e cuidam dela.

export type Pedido = {
  metodo: string;
  caminho: string;
  parametros: Record<string, string>;
  busca: URLSearchParams;
  corpo: unknown;
  autorizacao: string | null;
  // endereço de quem pediu, usado só pelo contador de tentativas de login.
  // Atrás de proxy é o do proxy — confiar em x-forwarded-for sem conhecer o
  // proxy deixaria quem varre escolher a própria chave
  origem: string;
};

export type Resposta = {
  status: number;
  corpo: unknown;
};

export type Rota =
  | {
      metodo: string;
      padrao: string;
      responder: (pedido: Pedido) => Promise<Resposta> | Resposta;
      bruta?: undefined;
    }
  | {
      metodo: string;
      padrao: string;
      responder?: undefined;
      bruta: (pedido: Pedido, resposta: http.ServerResponse) => Promise<void> | void;
    };

export const ok = (corpo: unknown): Resposta => ({ status: 200, corpo });

export const criado = (corpo: unknown): Resposta => ({ status: 201, corpo });

export const recusado = (status: number, motivo: string): Resposta => ({
  status,
  corpo: { erro: motivo },
});

const LIMITE_DO_CORPO = 256 * 1024;

const lerCorpo = async (requisicao: http.IncomingMessage): Promise<unknown> => {
  const pedacos: Buffer[] = [];
  let tamanho = 0;

  for await (const pedaco of requisicao) {
    const bloco = pedaco as Buffer;
    tamanho += bloco.length;
    if (tamanho > LIMITE_DO_CORPO) throw new Error('corpo grande demais');
    pedacos.push(bloco);
  }

  if (pedacos.length === 0) return null;

  try {
    return JSON.parse(Buffer.concat(pedacos).toString('utf8'));
  } catch {
    throw new Error('corpo não é json');
  }
};

const casar = (padrao: string, caminho: string): Record<string, string> | null => {
  const doPadrao = padrao.split('/').filter(Boolean);
  const doCaminho = caminho.split('/').filter(Boolean);
  if (doPadrao.length !== doCaminho.length) return null;

  const parametros: Record<string, string> = {};

  for (let indice = 0; indice < doPadrao.length; indice += 1) {
    const esperado = doPadrao[indice] ?? '';
    const veio = doCaminho[indice] ?? '';
    if (esperado.startsWith(':')) {
      parametros[esperado.slice(1)] = decodeURIComponent(veio);
      continue;
    }
    if (esperado !== veio) return null;
  }

  return parametros;
};

const responderJson = (resposta: http.ServerResponse, status: number, corpo: unknown): void => {
  const texto = JSON.stringify(corpo ?? null);
  resposta.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'cache-control': 'no-store',
  });
  resposta.end(texto);
};

export type Estatico = (caminho: string, resposta: http.ServerResponse) => Promise<boolean>;

export type Tls = { cert: string | Buffer; key: string | Buffer };

export const montarServidor = (
  rotas: Rota[],
  estatico: Estatico | null,
  tls: Tls | null = null,
): http.Server => {
  const atender = montarManipulador(rotas, estatico);
  return tls
    ? (https.createServer(tls, atender) as unknown as http.Server)
    : http.createServer(atender);
};

type Manipulador = (requisicao: http.IncomingMessage, resposta: http.ServerResponse) => void;

const montarManipulador =
  (rotas: Rota[], estatico: Estatico | null): Manipulador =>
  (requisicao, resposta) => {
    void (async (): Promise<void> => {
      const endereco = new URL(requisicao.url ?? '/', 'http://interno');
      const caminho = endereco.pathname;
      const metodo = requisicao.method ?? 'GET';

      if (!caminho.startsWith('/api/')) {
        if (estatico && (await estatico(caminho, resposta))) return;
        responderJson(resposta, 404, { erro: 'não existe' });
        return;
      }

      const compativel = rotas.filter((rota) => casar(rota.padrao, caminho) !== null);
      if (compativel.length === 0) {
        responderJson(resposta, 404, { erro: 'não existe' });
        return;
      }

      const rota = compativel.find((candidata) => candidata.metodo === metodo);
      if (!rota) {
        responderJson(resposta, 405, { erro: 'método não vale para este caminho' });
        return;
      }

      try {
        const corpo = metodo === 'GET' ? null : await lerCorpo(requisicao);
        const pedido: Pedido = {
          metodo,
          caminho,
          parametros: casar(rota.padrao, caminho) ?? {},
          busca: endereco.searchParams,
          corpo,
          autorizacao: requisicao.headers.authorization ?? null,
          origem: requisicao.socket.remoteAddress ?? 'desconhecida',
        };

        if (rota.bruta) {
          await rota.bruta(pedido, resposta);
          return;
        }

        const devolvida = await rota.responder(pedido);
        responderJson(resposta, devolvida.status, devolvida.corpo);
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : 'falha ao atender';
        const doCliente = motivo === 'corpo não é json' || motivo === 'corpo grande demais';
        if (!doCliente) console.error('[servidor]', erro);
        if (!resposta.headersSent) {
          responderJson(resposta, doCliente ? 400 : 500, { erro: motivo });
        }
      }
    })();
  };
