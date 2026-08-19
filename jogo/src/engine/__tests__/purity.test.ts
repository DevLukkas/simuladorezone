import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fiscaliza o invariante 1 do CLAUDE.md: o engine é puro. Nada de acaso fora
 * do PRNG, nada de relógio, nada de browser, nada de imports para fora de
 * engine/ e data/.
 */
const engineFolder = join(import.meta.dirname, '..');

const files = readdirSync(engineFolder)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, content: readFileSync(join(engineFolder, name), 'utf8') }));

describe('pureza do engine', () => {
  test('há arquivos para fiscalizar', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  const forbidden: [string, RegExp][] = [
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
    ['import from node:', /from 'node:/],
  ];

  for (const { name, content } of files) {
    for (const [label, pattern] of forbidden) {
      test(`${name} não usa ${label}`, () => {
        expect(content).not.toMatch(pattern);
      });
    }
  }
});
