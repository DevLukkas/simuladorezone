import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildServer } from './app.ts';
import type { AdminOptions } from './admin.ts';

const port = Number(process.env.PORTA) || Number(process.env.PORT) || 8788;
const dbPath =
  process.env.BANCO ?? path.join(import.meta.dirname, 'dados', 'jogo.db');

const root = path.join(import.meta.dirname, '..');

/**
 * O estúdio de cartas grava no repositório, então não sobe sozinho: só com
 * `--admin` (ou `EZONE_ADMIN=1`) e só se as fontes estiverem por perto — num
 * deploy, onde roda o `dist/`, ele não teria o que editar.
 *
 * A chave sai do ambiente ou é sorteada e impressa aqui. Sem ela ninguém escreve,
 * mesmo tendo conta e mesmo com o dev exposto por túnel.
 */
function adminOptions(): AdminOptions | null {
  const asked = process.argv.includes('--admin') || process.env.EZONE_ADMIN === '1';
  if (!asked) return null;

  if (!fs.existsSync(path.join(root, 'src', 'data', 'creatures.ts'))) {
    console.warn('[estúdio] fontes não encontradas — estúdio de cartas não subiu');
    return null;
  }

  const key = process.env.EZONE_ADMIN_KEY ?? crypto.randomBytes(12).toString('base64url');
  console.log(`[estúdio] habilitado — chave: ${key}`);
  return { root, key };
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const { server } = buildServer(dbPath, path.join(root, 'dist'), adminOptions());

server.listen(port, () => {
  console.log(`Ezone TCG servindo em http://127.0.0.1:${port}`);
});
