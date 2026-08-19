import fs from 'node:fs/promises';
import path from 'node:path';
import type { StaticHandler } from './http.ts';

const MIME_BY_EXTENSION: Record<string, string> = {
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

export const serveFolder = (folder: string): StaticHandler => {
  const root = path.resolve(folder);

  return async (urlPath, reply) => {
    const wanted = ((): string | null => {
      try {
        return decodeURIComponent(urlPath);
      } catch {
        return null;
      }
    })();

    if (wanted === null) return false;

    const target = path.resolve(root, wanted === '/' ? 'index.html' : wanted.replace(/^\/+/, ''));

    // caminho que sai da pasta é recusado antes de o disco ser tocado. `..`,
    // barra invertida e a forma percentual dos dois chegam aqui já resolvidos,
    // que é o motivo de a conferência ser depois do resolve e não antes
    if (target !== root && !target.startsWith(root + path.sep)) return false;

    const data = await fs.readFile(target).catch(() => null);
    if (data === null) return false;

    reply.writeHead(200, {
      'content-type': MIME_BY_EXTENSION[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': data.length,
    });
    reply.end(data);
    return true;
  };
};
