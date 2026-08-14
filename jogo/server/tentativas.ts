import { inteiro, texto } from './banco.ts';
import type { Banco } from './banco.ts';

// abaixo disso ninguém espera nada: errar a senha três vezes é uma tarde ruim, e
// não um ataque
export const ERROS_ATE_A_ESPERA = 5;
export const ESPERA_INICIAL_EM_SEGUNDOS = 5;
export const ESPERA_MAXIMA_EM_SEGUNDOS = 15 * 60;

// duas chaves, e não uma. Só por e-mail, varrer mil endereços com a senha
// `123456` nunca esbarra no limite, porque cada e-mail erra uma vez; só por
// origem, quem tem muitos endereços de saída passa igual. As duas juntas não
// fecham o problema — nada fecha, sem HTTPS na frente —, e o que elas compram é
// o preço: espera que dobra torna a varredura cara em vez de gratuita
const chaves = (email: string, origem: string): string[] => [
  `email:${email}`,
  `origem:${origem}`,
];

const esperaDe = (erros: number): number => {
  if (erros <= ERROS_ATE_A_ESPERA) return 0;
  const dobras = erros - ERROS_ATE_A_ESPERA - 1;
  return Math.min(ESPERA_MAXIMA_EM_SEGUNDOS, ESPERA_INICIAL_EM_SEGUNDOS * 2 ** dobras);
};

const segundosQueFaltam = (banco: Banco, chave: string, agora: Date): number => {
  const linha = banco.uma('SELECT liberada_em FROM tentativas WHERE chave = ?', chave);
  if (!linha) return 0;

  const liberada = Date.parse(texto(linha.liberada_em));
  if (!Number.isFinite(liberada)) return 0;

  return Math.max(0, Math.ceil((liberada - agora.getTime()) / 1000));
};

export const esperaDaPorta = (
  banco: Banco,
  email: string,
  origem: string,
  agora = new Date(),
): number =>
  Math.max(...chaves(email, origem).map((chave) => segundosQueFaltam(banco, chave, agora)), 0);

export const anotarErro = (
  banco: Banco,
  email: string,
  origem: string,
  agora = new Date(),
): void => {
  for (const chave of chaves(email, origem)) {
    const linha = banco.uma('SELECT erros FROM tentativas WHERE chave = ?', chave);
    const erros = inteiro(linha?.erros) + 1;

    banco.executar(
      `INSERT INTO tentativas (chave, erros, liberada_em) VALUES (?, ?, ?)
         ON CONFLICT (chave)
         DO UPDATE SET erros = excluded.erros, liberada_em = excluded.liberada_em`,
      chave,
      erros,
      new Date(agora.getTime() + esperaDe(erros) * 1000).toISOString(),
    );
  }
};

// acertar zera as duas chaves. A de origem também, porque quem acertou dali é
// gente e não varredura — e deixá-la contando puniria a casa inteira pelo
// primeiro que errou a senha algumas vezes
export const limparErros = (banco: Banco, email: string, origem: string): void => {
  for (const chave of chaves(email, origem)) {
    banco.executar('DELETE FROM tentativas WHERE chave = ?', chave);
  }
};
