import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fiscaliza o invariante 1 do CLAUDE.md: o engine é puro. Nada de acaso fora
 * do PRNG, nada de relógio, nada de browser, nada de imports para fora de
 * engine/ e data/.
 */
const pastaEngine = join(import.meta.dirname, '..');

const arquivos = readdirSync(pastaEngine)
  .filter((nome) => nome.endsWith('.ts'))
  .map((nome) => ({ nome, conteudo: readFileSync(join(pastaEngine, nome), 'utf8') }));

describe('pureza do engine', () => {
  test('há arquivos para fiscalizar', () => {
    expect(arquivos.length).toBeGreaterThan(5);
  });

  const proibidos: [string, RegExp][] = [
    ['Math.random', /Math\.random/],
    ['Date.now', /Date\.now/],
    ['new Date', /new Date\(/],
    ['setTimeout/setInterval', /set(Timeout|Interval)\(/],
    ['fetch', /\bfetch\(/],
    ['localStorage', /localStorage/],
    ['document/window', /\b(document|window)\./],
    ['import de react', /from 'react/],
    ['import do client', /from '\.\.\/client/],
    ['import do servidor', /from '\.\.\/\.\.\/server/],
    ['import de node:', /from 'node:/],
  ];

  for (const { nome, conteudo } of arquivos) {
    for (const [rotulo, padrao] of proibidos) {
      test(`${nome} não usa ${rotulo}`, () => {
        expect(conteudo).not.toMatch(padrao);
      });
    }
  }
});
