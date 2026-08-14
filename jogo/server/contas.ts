import crypto from 'node:crypto';
import { inteiro, texto } from './banco.ts';
import { criado, ok, recusado } from './http.ts';
import { anotarErro, esperaDaPorta, limparErros } from './tentativas.ts';
import type { Banco } from './banco.ts';
import type { Pedido, Resposta, Rota } from './http.ts';

export type Conta = {
  id: number;
  /** null = conta convidada (joga inteira; promover preenche a mesma linha) */
  email: string | null;
  apelido: string;
};

const TAMANHO_MINIMO_DA_SENHA = 8;
const TAMANHO_MAXIMO_DA_SENHA = 200;
const TAMANHO_MAXIMO_DO_EMAIL = 160;
const TAMANHO_MAXIMO_DO_APELIDO = 24;

// scrypt do node:crypto (padrão jogo-gacha): N=16384 leva dezenas de ms por
// tentativa — o rate limit de tentativas.ts faz o resto
const CUSTO_DA_SENHA = 16384;
const BYTES_DA_SENHA = 64;

const guardarSenha = (senha: string): string => {
  const sal = crypto.randomBytes(16);
  const derivada = crypto.scryptSync(senha, sal, BYTES_DA_SENHA, { N: CUSTO_DA_SENHA });
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
};

const senhaConfere = (senha: string, guardada: string): boolean => {
  const [algoritmo, sal, esperada] = guardada.split('$');
  if (algoritmo !== 'scrypt' || !sal || !esperada) return false;

  const alvo = Buffer.from(esperada, 'hex');
  const derivada = crypto.scryptSync(senha, Buffer.from(sal, 'hex'), alvo.length, {
    N: CUSTO_DA_SENHA,
  });

  return crypto.timingSafeEqual(derivada, alvo);
};

// o token viaja em claro e é guardado em hash: quem ler o banco não sai
// logando com o que leu
const impressaoDoToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const emailValido = (valor: string): boolean => {
  if (valor.length < 3 || valor.length > TAMANHO_MAXIMO_DO_EMAIL) return false;
  const partes = valor.split('@');
  return partes.length === 2 && (partes[0]?.length ?? 0) > 0 && (partes[1]?.includes('.') ?? false);
};

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

type Credencial = { email: string; senha: string; apelido: string | null };

const credencial = (corpo: unknown): Credencial | null => {
  if (!ehObjeto(corpo)) return null;
  if (typeof corpo.email !== 'string' || typeof corpo.senha !== 'string') return null;

  const email = corpo.email.trim().toLowerCase();
  if (!emailValido(email)) return null;
  if (corpo.senha.length < TAMANHO_MINIMO_DA_SENHA) return null;
  if (corpo.senha.length > TAMANHO_MAXIMO_DA_SENHA) return null;

  const apelido =
    typeof corpo.apelido === 'string' && corpo.apelido.trim().length > 0
      ? corpo.apelido.trim().slice(0, TAMANHO_MAXIMO_DO_APELIDO)
      : null;

  return { email, senha: corpo.senha, apelido };
};

const abrirSessao = (banco: Banco, contaId: number): string => {
  const token = crypto.randomBytes(32).toString('base64url');
  banco.executar(
    'INSERT INTO sessoes (token, conta_id, criada_em) VALUES (?, ?, ?)',
    impressaoDoToken(token),
    contaId,
    new Date().toISOString(),
  );
  return token;
};

const criarConta = (
  banco: Banco,
  email: string | null,
  senha: string | null,
  apelido: string,
): number => {
  const agora = new Date().toISOString();
  banco.executar(
    'INSERT INTO contas (email, senha, apelido, criada_em, ultimo_acesso) VALUES (?, ?, ?, ?, ?)',
    email,
    senha,
    apelido,
    agora,
    agora,
  );
  return inteiro(banco.uma('SELECT last_insert_rowid() AS id')?.id);
};

const emDia = (carimbo: string): string => carimbo.slice(0, 10);

// grava o último acesso quando o DIA muda, não a cada pedido
const anotarAcesso = (banco: Banco, contaId: number, guardado: string): void => {
  const agora = new Date().toISOString();
  if (emDia(guardado) === emDia(agora)) return;
  banco.executar('UPDATE contas SET ultimo_acesso = ? WHERE id = ?', agora, contaId);
};

export const contaDoPedido = (banco: Banco, pedido: Pedido): Conta | null => {
  const cabecalho = pedido.autorizacao ?? '';
  if (!cabecalho.startsWith('Bearer ')) return null;

  const linha = banco.uma(
    `SELECT contas.id AS id, contas.email AS email, contas.apelido AS apelido,
            contas.ultimo_acesso AS ultimo_acesso
       FROM sessoes JOIN contas ON contas.id = sessoes.conta_id
      WHERE sessoes.token = ?`,
    impressaoDoToken(cabecalho.slice(7)),
  );

  if (!linha) return null;

  const id = inteiro(linha.id);
  anotarAcesso(banco, id, texto(linha.ultimo_acesso));

  return {
    id,
    email: typeof linha.email === 'string' ? linha.email : null,
    apelido: texto(linha.apelido) || 'Jogador',
  };
};

export const comConta = (
  banco: Banco,
  responder: (pedido: Pedido, conta: Conta) => Promise<Resposta> | Resposta,
): ((pedido: Pedido) => Promise<Resposta> | Resposta) => {
  return (pedido) => {
    const conta = contaDoPedido(banco, pedido);
    if (!conta) return recusado(401, 'é preciso estar em uma conta');
    return responder(pedido, conta);
  };
};

const resumo = (conta: Conta): Record<string, unknown> => ({
  apelido: conta.apelido,
  email: conta.email,
  convidada: conta.email === null,
});

export const rotasDeConta = (banco: Banco): Rota[] => [
  {
    // a porta do jogo: quem chega ganha conta na hora, sem cadastro
    metodo: 'POST',
    padrao: '/api/convidada',
    responder: (pedido) => {
      const corpo = ehObjeto(pedido.corpo) ? pedido.corpo : {};
      const apelido =
        typeof corpo.apelido === 'string' && corpo.apelido.trim()
          ? corpo.apelido.trim().slice(0, TAMANHO_MAXIMO_DO_APELIDO)
          : 'Convidado';
      const id = criarConta(banco, null, null, apelido);
      return criado({ token: abrirSessao(banco, id), apelido, email: null, convidada: true });
    },
  },
  {
    metodo: 'POST',
    padrao: '/api/contas',
    responder: (pedido) => {
      const dados = credencial(pedido.corpo);
      if (!dados) {
        return recusado(400, `e-mail válido e senha de ${TAMANHO_MINIMO_DA_SENHA} caracteres ou mais`);
      }

      const existe = banco.uma('SELECT id FROM contas WHERE email = ?', dados.email);
      if (existe) return recusado(409, 'já existe conta com este e-mail');

      const apelido = dados.apelido ?? dados.email.split('@')[0]!.slice(0, TAMANHO_MAXIMO_DO_APELIDO);
      const id = criarConta(banco, dados.email, guardarSenha(dados.senha), apelido);
      return criado({ token: abrirSessao(banco, id), apelido, email: dados.email, convidada: false });
    },
  },
  {
    // promover convidada: preenche e-mail e senha na linha que já existe —
    // nada de progresso é copiado, então nada pode ser copiado duas vezes
    metodo: 'POST',
    padrao: '/api/conta/email',
    responder: comConta(banco, (pedido, conta) => {
      if (conta.email !== null) return recusado(409, 'esta conta já tem e-mail');

      const dados = credencial(pedido.corpo);
      if (!dados) {
        return recusado(400, `e-mail válido e senha de ${TAMANHO_MINIMO_DA_SENHA} caracteres ou mais`);
      }

      const existe = banco.uma(
        'SELECT id FROM contas WHERE email = ? AND id <> ?',
        dados.email,
        conta.id,
      );
      if (existe) return recusado(409, 'já existe conta com este e-mail');

      banco.executar(
        'UPDATE contas SET email = ?, senha = ? WHERE id = ?',
        dados.email,
        guardarSenha(dados.senha),
        conta.id,
      );
      return ok({ apelido: conta.apelido, email: dados.email, convidada: false });
    }),
  },
  {
    metodo: 'POST',
    padrao: '/api/sessoes',
    responder: (pedido) => {
      const dados = credencial(pedido.corpo);
      // recusa idêntica para e-mail inexistente e senha errada — distinguir
      // as duas entregaria a lista de quem tem conta
      const negar = (): Resposta => recusado(401, 'e-mail ou senha não conferem');

      const doCorpo = ehObjeto(pedido.corpo) ? pedido.corpo : {};
      const tentado = dados?.email ?? (typeof doCorpo.email === 'string' ? doCorpo.email : '');
      const espera = esperaDaPorta(banco, tentado.trim().toLowerCase(), pedido.origem);
      if (espera > 0) {
        return recusado(429, `tentativas demais: tente de novo em ${espera} segundos`);
      }

      if (!dados) return negar();

      const linha = banco.uma('SELECT id, senha, apelido FROM contas WHERE email = ?', dados.email);
      if (!linha || !senhaConfere(dados.senha, texto(linha.senha))) {
        anotarErro(banco, dados.email, pedido.origem);
        return negar();
      }

      limparErros(banco, dados.email, pedido.origem);
      return ok({
        token: abrirSessao(banco, inteiro(linha.id)),
        apelido: texto(linha.apelido) || 'Jogador',
        email: dados.email,
        convidada: false,
      });
    },
  },
  {
    metodo: 'DELETE',
    padrao: '/api/sessoes',
    responder: (pedido) => {
      const cabecalho = pedido.autorizacao ?? '';
      if (cabecalho.startsWith('Bearer ')) {
        banco.executar('DELETE FROM sessoes WHERE token = ?', impressaoDoToken(cabecalho.slice(7)));
      }
      return ok({ encerrada: true });
    },
  },
  {
    metodo: 'GET',
    padrao: '/api/conta',
    responder: comConta(banco, (_pedido, conta) => ok(resumo(conta))),
  },
];
