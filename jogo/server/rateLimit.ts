/**
 * Fusível de repetição para as rotas que CRIAM coisa.
 *
 * O `loginAttempts.ts` cuida de quem erra a senha; isto cuida de quem acerta
 * tudo e só repete rápido demais. São problemas diferentes: lá a espera dobra
 * para encarecer a varredura de senha, aqui o teto é fixo e existe para que uma
 * conta (ou um script) não encha o banco sozinho — 50 contas convidadas em 125
 * ms era o que uma linha de `fetch` conseguia antes deste arquivo existir.
 *
 * **Mora na memória, e não no banco, de propósito.** Gravar uma linha por
 * pedido para descobrir se o pedido pode gravar uma linha é o próprio abuso que
 * se quer evitar. O preço é que reiniciar o servidor zera as contagens — o que
 * é aceitável num fusível de enxurrada, porque quem ataca não controla o
 * restart.
 *
 * **Cuidado com a chave.** `origin` é o endereço do soquete; atrás de proxy ele
 * é o do PROXY, e aí o teto vale para a plateia inteira em vez de por pessoa
 * (a mesma ressalva que está no `http.ts`). Por isso os tetos por origem são
 * folgados — são fusível de enxurrada, não cota por jogador. Rota com conta na
 * frente é chaveada pela CONTA, que não sofre disso.
 */

/** varre as chaves vencidas a cada N chamadas: o mapa não pode virar o vazamento */
const SWEEP_EVERY = 500;

/**
 * Devolve os segundos que faltam para liberar, ou 0 quando o pedido passa — e
 * passar já CONTA, então chame uma vez por pedido.
 */
export type Fuse = (key: string) => number;

export function fuse(max: number, windowSeconds: number): Fuse {
  const windowMs = windowSeconds * 1000;
  const slots = new Map<string, { count: number; resetAt: number }>();
  let sinceSweep = 0;

  return (key) => {
    const now = Date.now();

    sinceSweep += 1;
    if (sinceSweep >= SWEEP_EVERY) {
      sinceSweep = 0;
      for (const [old, slot] of slots) {
        if (slot.resetAt <= now) slots.delete(old);
      }
    }

    const slot = slots.get(key);
    // janela nova: a primeira do período é sempre aceita
    if (!slot || slot.resetAt <= now) {
      slots.set(key, { count: 1, resetAt: now + windowMs });
      return 0;
    }
    if (slot.count < max) {
      slot.count += 1;
      return 0;
    }
    // arredonda para cima e nunca devolve 0, que significaria "pode passar"
    return Math.max(1, Math.ceil((slot.resetAt - now) / 1000));
  };
}
