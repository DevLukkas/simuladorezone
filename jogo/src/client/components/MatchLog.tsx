import { useState } from 'react';
import type { TextRole } from '../../i18n/index.ts';
import type { TextRef } from '../../shared/text.ts';
import { LOG_TONE, logTone } from '../logTone.ts';
import { ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';

/**
 * A COLUNA do registro, AO LADO do tabuleiro. Foi coluna (decisão nº 24), virou
 * gaveta por cima do campo (nº 31) e voltou a ser coluna (nº 46): por cima, ela
 * tapava justamente o que se quer conferir enquanto se lê — o campo, a barra do
 * turno e os botões. Aberta, ela ESPREME o campo; o campo cabe encolhido porque
 * as cartas medem a coluna dele, não a janela (ver a geometria no `Board`).
 *
 * O que a decisão nº 42 acrescentou: o registro era uma parede de linhas iguais,
 * em cinza, do mesmo tamanho — "não dá para entender muita coisa" (relato do
 * DevLukkas sobre o print). Agora cada linha é pintada por ASSUNTO (o filete da
 * esquerda e a cor do texto) e por PAPEL dentro da frase (nome de carta em ouro,
 * número em destaque, autor do lance na cor de quem é), e a gaveta ganhou botão
 * de copiar — o registro inteiro em texto puro, que é o que se cola num relato
 * de bug.
 */

/** a cor de cada papel dentro da frase; sem cor própria, a linha manda */
const ROLE_COLOR: Partial<Record<TextRole, string>> = {
  card: ZN.goldLight,
  token: ZN.gold,
  you: ZN.greenLight,
  opponent: ZN.redLight,
  number: '#f0eadc',
};

export function MatchLog({ log, onClose }: { log: readonly TextRef[]; onClose: () => void }) {
  const { t, resolve, resolveParts } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    // em ordem de partida (a gaveta mostra ao contrário): quem cola quer ler do começo
    const plain = log.map((line) => resolve(line)).join('\n');
    if (!(await writeToClipboard(plain))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <aside
      /*
        A largura é fração da janela com teto e piso: em 1280 dá ~307px e sobra
        campo de sobra; num monitor largo ela cresce até 380 em vez de virar um
        filete perdido na borda. O piso é o ponto em que a linha do registro ainda
        se lê sem quebrar em três.
      */
      className="relative z-2 flex h-full w-[clamp(288px,24vw,380px)] shrink-0 flex-col border-l border-zn-edge bg-zn-bar/97"
      style={{ animation: 'zn-fade .2s ease both' }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zn-line px-4 py-3.5">
        <h2 className="zn-label mr-auto uppercase">{t('board.log')}</h2>
        <button
          type="button"
          disabled={log.length === 0}
          title={t('board.copyLog')}
          className="zn-btn zn-btn-quiet h-6.5 px-2.5 text-[9px] tracking-[0.14em] uppercase"
          style={copied ? { borderColor: ZN.green, color: ZN.green } : undefined}
          onClick={() => void copy()}
        >
          {copied ? t('board.logCopied') : t('board.copyLog')}
        </button>
        <button
          type="button"
          title={t('board.hideLog')}
          className="zn-btn zn-btn-quiet h-6.5 w-6.5"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* mais recente no alto: com poucas linhas o ancorado embaixo deixava a
          gaveta vazia por dois terços, e o que se procura é sempre a última */}
      <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {[...log].reverse().map((line, index) => {
          const tone = LOG_TONE[logTone(line.key)];
          return (
            <li
              key={log.length - index}
              className="zn-num py-1 pr-1.5 pl-2.5 text-[10px] leading-relaxed"
              style={{
                color: tone.text,
                borderLeft: `2px solid ${tone.line}`,
                background: `${tone.line}12`,
              }}
            >
              {resolveParts(line).map((part, at) => (
                <span key={at} style={colorOf(part.role)}>
                  {part.text}
                </span>
              ))}
            </li>
          );
        })}
        {log.length === 0 && (
          <li className="zn-num px-1 text-[10px] tracking-[0.12em] text-zn-ghost uppercase">
            {t('board.logEmpty')}
          </li>
        )}
      </ol>
    </aside>
  );
}

function colorOf(role: TextRole): React.CSSProperties | undefined {
  const color = ROLE_COLOR[role];
  return color ? { color, fontWeight: 600 } : undefined;
}

/**
 * Copiar sem HTTPS: fora de contexto seguro o `navigator.clipboard` nem existe,
 * e o jogo roda em `http://localhost` no dev e em rede local no teste com o
 * DevLukkas. O caminho velho (`execCommand`) é o que sobra ali.
 */
async function writeToClipboard(plain: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    // sem área de transferência moderna: segue para o caminho velho
  }
  try {
    const area = document.createElement('textarea');
    area.value = plain;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
