import fs from 'node:fs/promises';
import path from 'node:path';
import type { Estatico } from './http.ts';

const TIPO_POR_EXTENSAO: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export const servirPasta = (pasta: string): Estatico => {
  const raiz = path.resolve(pasta);

  return async (caminho, resposta) => {
    const pedido = ((): string | null => {
      try {
        return decodeURIComponent(caminho);
      } catch {
        return null;
      }
    })();

    if (pedido === null) return false;

    const alvo = path.resolve(raiz, pedido === '/' ? 'index.html' : pedido.replace(/^\/+/, ''));

    // caminho que sai da pasta é recusado antes de o disco ser tocado. `..`,
    // barra invertida e a forma percentual dos dois chegam aqui já resolvidos,
    // que é o motivo de a conferência ser depois do resolve e não antes
    if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return false;

    const dados = await fs.readFile(alvo).catch(() => null);
    if (dados === null) return false;

    resposta.writeHead(200, {
      'content-type': TIPO_POR_EXTENSAO[path.extname(alvo).toLowerCase()] ?? 'application/octet-stream',
      'content-length': dados.length,
    });
    resposta.end(dados);
    return true;
  };
};
