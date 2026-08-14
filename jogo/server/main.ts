import fs from 'node:fs';
import path from 'node:path';
import { montar } from './servidor.ts';

const porta = Number(process.env.PORTA) || Number(process.env.PORT) || 8787;
const caminhoDoBanco =
  process.env.BANCO ?? path.join(import.meta.dirname, 'dados', 'jogo.db');

fs.mkdirSync(path.dirname(caminhoDoBanco), { recursive: true });

const { servidor } = montar(caminhoDoBanco, path.join(import.meta.dirname, '..', 'dist'));

servidor.listen(porta, () => {
  console.log(`Ezone TCG servindo em http://127.0.0.1:${porta}`);
});
