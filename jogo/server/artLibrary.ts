/**
 * A biblioteca de imagens do estúdio: os arquivos de `public/assets/arte` mais o
 * pouco que o disco não sabe dizer sobre eles (decisão nº 41).
 *
 * Duas marcas vivem aqui, e nenhuma cabe no nome do arquivo:
 *
 * - `final` — a arte está aprovada, não é rascunho de ilustração;
 * - `archived` — saiu de circulação. É a antessala do apagar: a tela só oferece
 *   excluir o que já está arquivado, e o servidor recusa apagar o que não está.
 *
 * Elas moram num JSON ao lado das imagens (`library.json`), e não num banco, pela
 * mesma razão que as cartas moram no código (decisão nº 22): quem edita arte é o
 * time, o resultado tem de virar diff no git e viajar com o repositório. O arquivo
 * é só a lista de exceções — arte sem marca nenhuma não aparece nele.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export const ART_EXTENSIONS = ['.png', '.webp', '.jpg'];

/** o nome do índice dentro da pasta de arte; nunca é listado como ilustração */
export const LIBRARY_FILE = 'library.json';

export interface ArtMarks {
  final: Set<string>;
  archived: Set<string>;
}

export interface ArtFile {
  file: string;
  bytes: number;
  /** lidas do cabeçalho da imagem; `null` quando o formato não foi reconhecido */
  width: number | null;
  height: number | null;
  final: boolean;
  archived: boolean;
  /** a carta que aponta para este arquivo hoje, ou `null` se nenhuma aponta */
  usedBy: number | null;
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** As marcas gravadas. Índice ausente ou estragado é biblioteca sem marca nenhuma. */
export async function readMarks(folder: string): Promise<ArtMarks> {
  const empty: ArtMarks = { final: new Set(), archived: new Set() };
  const raw = await fs.readFile(path.join(folder, LIBRARY_FILE), 'utf8').catch(() => null);
  if (raw === null) return empty;

  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    return {
      final: new Set(isStringList(stored.final) ? stored.final : []),
      archived: new Set(isStringList(stored.archived) ? stored.archived : []),
    };
  } catch {
    return empty;
  }
}

/**
 * Grava o índice. Sai ordenado e com quebra no fim para o diff do git ser a linha
 * que mudou, e não o arquivo inteiro reescrito noutra ordem.
 */
export async function writeMarks(folder: string, marks: ArtMarks): Promise<void> {
  const body = {
    final: [...marks.final].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    archived: [...marks.archived].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
  };
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, LIBRARY_FILE), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Dimensões
// ---------------------------------------------------------------------------

/**
 * Largura e altura lidas do CABEÇALHO do arquivo — sem decodificar a imagem e sem
 * dependência (invariante nº 6).
 *
 * A biblioteca mostra a dimensão porque é ela que denuncia a arte que veio do
 * lugar errado (miniatura de 120px, captura de tela esticada) antes de a carta ser
 * publicada com ela. Formato que não for reconhecido devolve `null`, e a tela
 * simplesmente não mostra o dado.
 */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  // PNG: assinatura de 8 bytes e o IHDR logo em seguida
  if (bytes.length > 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // WEBP: contêiner RIFF, e três formas de guardar o tamanho conforme a compressão
  if (bytes.length > 30 && bytes.toString('ascii', 0, 4) === 'RIFF') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8 ') {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L') {
      const packed = bytes.readUInt32LE(21);
      return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') {
      const read24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
      return { width: read24(24) + 1, height: read24(27) + 1 };
    }
  }

  // JPEG: percorre os marcadores até um SOF, que é onde o tamanho está
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        at += 1;
        continue;
      }
      const marker = bytes[at + 1]!;
      // SOF0..SOF15, menos os três que não carregam tamanho (DHT, JPG, DAC)
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      at += 2 + bytes.readUInt16BE(at + 2);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// A lista
// ---------------------------------------------------------------------------

/**
 * As ilustrações que estão no disco, com marca e dono.
 *
 * A lista sai do DISCO, e não do catálogo, porque nem toda arte chegou pelo
 * estúdio: as 45 clássicas foram recortadas da carta impressa e as 33 do Quatro
 * Elementos saíram do Figma por script. É o que permite reaproveitar um arquivo
 * que ainda não é de carta nenhuma.
 */
export async function listArt(
  folder: string,
  owners: Map<string, number>,
): Promise<ArtFile[]> {
  const marks = await readMarks(folder);
  const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
  const files: ArtFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!ART_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;

    const full = path.join(folder, entry.name);
    const info = await fs.stat(full);
    // só o cabeçalho: ler a imagem inteira de uma pasta com centenas de arquivos
    // custaria uma listagem lenta para mostrar dois números
    const head = await readHead(full);
    const size = head ? imageSize(head) : null;

    files.push({
      file: entry.name,
      bytes: info.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
      final: marks.final.has(entry.name),
      archived: marks.archived.has(entry.name),
      usedBy: owners.get(entry.name) ?? null,
    });
  }

  // `01.webp` antes de `2.webp`: a ordem que o autor espera é a numérica
  files.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
  return files;
}

/** os primeiros bytes do arquivo, que é onde todo formato guarda o tamanho */
async function readHead(file: string, size = 64): Promise<Buffer | null> {
  const handle = await fs.open(file, 'r').catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
