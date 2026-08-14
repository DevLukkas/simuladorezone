import type { Carta, Elemento, Raridade } from '../../data/tipos.ts';
import sangrias from './molde.json';

/**
 * Carta montada em runtime a partir dos dados do catálogo, no molde do Figma
 * (componente `Relvus`, 415x555).
 *
 * Por que compor em vez de exibir a arte impressa: os números impressos no PNG não
 * acompanham buff, dano nem marcador, então o tabuleiro precisava desenhar um badge
 * `ATQ/VIDA` por cima da carta. Aqui o número impresso É o número vigente — `stats`
 * chega de `statsAtuais` e a carta não tem como divergir do motor.
 *
 * As peças (moldura, pills, caixa, hexágonos, diamantes, badges) vêm de
 * `scripts/figma.ts`; a ilustração do clássico vem de `scripts/arte.ts`.
 *
 * As coordenadas abaixo foram calibradas pixel a pixel contra a arte impressa
 * (cards/01.png, 749x1033; molde = x*0,5541, y*0,5373), que é a referência visual —
 * o componente-mestre do Figma diverge dela em vários pontos (pill mais largo, rodapé
 * mais alto, diamante mais gordo).
 */

/** largura do molde original — toda medida abaixo está nesta escala */
const BASE = 415;
const ALTURA = 555;

/** px do molde -> unidade de container, para a carta escalar sem perder proporção */
const u = (px: number) => `${((px / BASE) * 100).toFixed(4)}cqw`;

/** contorno entre o preto e o símbolo dos diamantes de raridade, medido na impressa */
const AZUL_ACO = '#4a83b3';

interface Caixa {
  x: number;
  y: number;
  l: number;
  a: number;
}

const MOLDE = {
  /**
   * Recuo lateral e superior iguais aos da arte impressa (5,3% do lado, 2,9% do topo),
   * para a ilustração casar com a borda preta da moldura. O rodapé passa de y=330 para
   * a caixa de efeito cobrir a emenda — sem isso sobrava um vão preto entre as duas.
   *
   * Não vale esticar até o fim da janela do molde (y=493): o recorte é paisagem (1,41) e
   * uma caixa muito alta faria o `object-fit: cover` ampliar demais a arte.
   */
  arte: { x: 22, y: 16, l: 371, a: 324 } satisfies Caixa,
  /** faixa preta que corta a caixa de efeito reta e abriga ref, crédito e diamante */
  faixaRodape: { x: 0, y: 524.5, l: 415, a: 30.5 } satisfies Caixa,
  pillNome: { x: 28.5, y: 29.5, l: 310, a: 28.5 } satisfies Caixa,
  pillSubtitulo: { x: 131.5, y: 55.5, l: 152, a: 18 } satisfies Caixa,
  caixaEfeito: { x: 27.5, y: 330.5, l: 359, a: 203.5 } satisfies Caixa,
  diamanteTopo: { x: 180.5, y: 7.5, l: 54, a: 21.5 } satisfies Caixa,
  /** montado na emenda: metade sobre a caixa de efeito, metade sobre a faixa preta */
  diamanteRodape: { x: 180.5, y: 513.5, l: 54, a: 21.5 } satisfies Caixa,
  hexagono: { x: 339.5, y: 4.5, l: 67, a: 77 } satisfies Caixa,
  /** preenche o canto entre a placa do hexágono e a moldura — sem ele a arte vaza ali */
  cantoHexagono: { x: 371, y: 0, l: 44, a: 42 } satisfies Caixa,
  badgeAtaque: { x: 13.5, y: 253.5, l: 56.5, a: 91 } satisfies Caixa,
  badgeVida: { x: 343.5, y: 270, l: 53.5, a: 78 } satisfies Caixa,
  textoNome: { x: 33, y: 32.5, l: 301, a: 23 } satisfies Caixa,
  textoSubtitulo: { x: 135, y: 59.5, l: 145, a: 12 } satisfies Caixa,
  textoEfeito: { x: 39, y: 350, l: 337, a: 158 } satisfies Caixa,
  textoRef: { x: 28, y: 527.5, l: 90, a: 12 } satisfies Caixa,
  textoCredito: { x: 280, y: 527.5, l: 106, a: 12 } satisfies Caixa,
  numeroAtaque: { x: 12, y: 247, l: 60, a: 72 } satisfies Caixa,
  numeroVida: { x: 340, y: 252, l: 60, a: 72 } satisfies Caixa,
};

/** ordem da paleta do Figma (frame ESTRUTURA DAS CARTAS), confirmada pelo DevLukkas */
const HEXAGONO_POR_ELEMENTO: Record<Elemento, string> = {
  agua: 'hexagono-1',
  fogo: 'hexagono-2',
  terra: 'hexagono-3',
  vento: 'hexagono-4',
  neutro: 'hexagono-5',
  arcano: 'hexagono-6',
  vazio: 'hexagono-7',
};

/**
 * Cenário e comando não têm elemento (mini-manual): no lugar do hexágono vem o símbolo
 * do tipo. Item não precisa de exceção — o manual diz que item É elemento Neutro, e o
 * hexágono neutro já é o dourado que a arte usa.
 */
const HEXAGONO_POR_TIPO: Partial<Record<Carta['tipo'], string>> = {
  cenario: 'hexagono-8',
  comando: 'hexagono-9',
};

/**
 * O diamante indica a raridade, e o desenho muda conforme a carta seja criatura ou não:
 * a versão de criatura leva as marcas (a raridade dela vale ponto para quem a destruir —
 * comum 0, rara 1, lendária 2), a das demais é lisa.
 */
const DIAMANTE_DE_CRIATURA: Record<Raridade, string> = {
  rara: 'diamante-1',
  lendaria: 'diamante-2',
  comum: 'diamante-3',
};

const DIAMANTE_DE_NAO_CRIATURA: Record<Raridade, string> = {
  rara: 'diamante-4',
  lendaria: 'diamante-5',
  comum: 'diamante-6',
};

const ROTULO_DO_TIPO: Record<Carta['tipo'], string> = {
  criatura: 'Criatura',
  habilidade: 'Habilidade',
  item: 'Item',
  comando: 'Comando',
  cenario: 'Cenário',
};

function posicao(caixa: Caixa): React.CSSProperties {
  return {
    position: 'absolute',
    left: u(caixa.x),
    top: u(caixa.y),
    width: u(caixa.l),
    height: u(caixa.a),
  };
}

interface Sangria {
  esq: number;
  topo: number;
  dir: number;
  baixo: number;
}

/**
 * Infla a caixa lógica pela sangria da peça: o PNG do Figma inclui a sombra, e ela NÃO
 * é simétrica (cai para baixo/direita). Repartir a folga meio a meio, como era antes,
 * deslocava a peça alguns px do lugar. Os valores por lado estão em molde.json.
 */
function comSangria(nome: string, caixa: Caixa, extra = 0): Caixa {
  const s = (sangrias as Record<string, Sangria>)[nome];
  const esq = (s?.esq ?? 0) + extra;
  const topo = (s?.topo ?? 0) + extra;
  const dir = (s?.dir ?? 0) + extra;
  const baixo = (s?.baixo ?? 0) + extra;
  return { x: caixa.x - esq, y: caixa.y - topo, l: caixa.l + esq + dir, a: caixa.a + topo + baixo };
}

function Peca({ nome, caixa, z }: { nome: string; caixa: Caixa; z: number }) {
  return (
    <img
      src={`/assets/molde/${nome}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        ...posicao(comSangria(nome, caixa)),
        zIndex: z,
        objectFit: 'fill',
      }}
    />
  );
}

/**
 * A silhueta da peça pintada de uma cor chapada, via CSS mask — serve de contorno que
 * acompanha qualquer desenho sem redesenhar a forma em CSS: um pouco maior (`aumento`)
 * e atrás da peça, vira a moldura preta ou o filete azul que a arte impressa tem.
 */
function Silhueta({
  nome,
  caixa,
  z,
  cor,
  aumento = 0,
}: {
  nome: string;
  caixa: Caixa;
  z: number;
  cor: string;
  /** unidades a mais em cada lado, para a silhueta sobrar além da peça */
  aumento?: number;
}) {
  const mascara = `url(/assets/molde/${nome}.webp)`;
  return (
    <div
      aria-hidden
      style={{
        ...posicao(comSangria(nome, caixa, aumento)),
        zIndex: z,
        backgroundColor: cor,
        maskImage: mascara,
        maskSize: '100% 100%',
        WebkitMaskImage: mascara,
        WebkitMaskSize: '100% 100%',
      }}
    />
  );
}

/**
 * Ícone com os contornos que a arte impressa tem: placa preta em volta e, nos diamantes
 * de raridade, um filete azul-aço entre o preto e o símbolo.
 */
function IconeComPlaca({
  nome,
  caixa,
  z,
  espessura,
  filete,
}: {
  nome: string;
  caixa: Caixa;
  z: number;
  espessura: number;
  filete?: number;
}) {
  return (
    <>
      <Silhueta nome={nome} caixa={caixa} z={z} cor="#000000" aumento={espessura} />
      {filete !== undefined && (
        <Silhueta nome={nome} caixa={caixa} z={z + 1} cor={AZUL_ACO} aumento={filete} />
      )}
      <Peca nome={nome} caixa={caixa} z={z + 2} />
    </>
  );
}

/**
 * O texto de efeito varia muito de tamanho entre cartas. Em vez de medir no DOM (que
 * causaria layout thrashing numa mão com 8 cartas), a fonte cai em degraus por volume
 * de texto — o suficiente para as 45 caberem na caixa.
 */
function corpoDoEfeito(texto: string): number {
  if (texto.length > 260) return 10;
  if (texto.length > 180) return 11.5;
  if (texto.length > 120) return 13;
  return 14;
}

/**
 * Mesma ideia para o nome, que é uma linha só e não pode quebrar nem vazar a pill.
 * Os degraus são calibrados para a Grenze, condensada como a fonte da impressa: 17
 * reproduz o corpo do título impresso e ainda cabe em nomes de 31 caracteres na
 * largura útil de 301 unidades; o maior nome do catálogo tem 35.
 */
function corpoDoNome(nome: string): number {
  if (nome.length > 35) return 13;
  if (nome.length > 31) return 15;
  return 17;
}

export interface StatsVigentes {
  attack: number;
  defense: number;
}

export function CartaComposta({
  carta,
  arte,
  stats,
  className,
  title,
  onContextMenu,
}: {
  carta: Carta;
  /** caminho da ilustração; ausente = só a moldura (fichas, cartas sem arte) */
  arte?: string | undefined;
  /** stats do motor; ausente = os impressos na carta */
  stats?: StatsVigentes | undefined;
  className?: string | undefined;
  title?: string | undefined;
  onContextMenu?: ((evento: React.MouseEvent) => void) | undefined;
}) {
  const criatura = carta.tipo === 'criatura' ? carta : null;
  const ataque = stats?.attack ?? criatura?.ataque;
  const vida = stats?.defense ?? criatura?.vida;
  /** ferida ou buffada em relação ao impresso: destaca a divergência */
  const alterado =
    criatura !== null && (ataque !== criatura.ataque || vida !== criatura.vida);

  const hexagono = HEXAGONO_POR_TIPO[carta.tipo] ?? HEXAGONO_POR_ELEMENTO[carta.elemento];
  const diamante = criatura
    ? DIAMANTE_DE_CRIATURA[carta.raridade]
    : DIAMANTE_DE_NAO_CRIATURA[carta.raridade];
  const subtitulo = criatura ? criatura.raca : ROTULO_DO_TIPO[carta.tipo];
  const efeito = carta.efeito ?? '';

  return (
    <div
      className={className ?? 'w-full'}
      title={title ?? `${carta.nome} — ${efeito}`}
      onContextMenu={onContextMenu}
      style={{
        containerType: 'inline-size',
        position: 'relative',
        aspectRatio: `${BASE} / ${ALTURA}`,
        userSelect: 'none',
      }}
    >
      {/* base preta do molde */}
      <img
        src="/assets/molde/moldura.webp"
        alt=""
        aria-hidden
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
      />

      {/* ilustração: a caixa de efeito cobre a parte de baixo, então o recorte
          das artes clássicas é enquadrado pela região que fica à vista */}
      {arte && (
        <img
          src={arte}
          alt={carta.nome}
          draggable={false}
          style={{
            ...posicao(MOLDE.arte),
            zIndex: 1,
            objectFit: 'cover',
            objectPosition: 'center top',
          }}
        />
      )}

      <Peca nome="caixa-efeito" caixa={MOLDE.caixaEfeito} z={2} />

      {/* corta a caixa de efeito reta e serve de fundo ao rodapé, como na arte impressa */}
      <div style={{ ...posicao(MOLDE.faixaRodape), zIndex: 3, backgroundColor: '#000000' }} />

      {/* pills com contorno reforçado (a impressa tem traço mais grosso que o do Figma);
          o subtítulo vem antes para o pill do nome cobrir a emenda entre os dois */}
      <Silhueta nome="pill-subtitulo" caixa={MOLDE.pillSubtitulo} z={4} cor="#000000" aumento={1.3} />
      <Peca nome="pill-subtitulo" caixa={MOLDE.pillSubtitulo} z={4} />
      <Silhueta nome="pill-nome" caixa={MOLDE.pillNome} z={5} cor="#000000" aumento={1.3} />
      <Peca nome="pill-nome" caixa={MOLDE.pillNome} z={5} />

      <IconeComPlaca nome={diamante} caixa={MOLDE.diamanteTopo} z={6} espessura={5.5} filete={1.8} />
      <IconeComPlaca nome={diamante} caixa={MOLDE.diamanteRodape} z={6} espessura={5.5} filete={1.8} />
      <div
        aria-hidden
        style={{
          ...posicao(MOLDE.cantoHexagono),
          zIndex: 6,
          backgroundColor: '#000000',
          borderTopRightRadius: u(11),
        }}
      />
      <IconeComPlaca nome={hexagono} caixa={MOLDE.hexagono} z={6} espessura={7} />

      {/* nome */}
      <div
        style={{
          ...posicao(MOLDE.textoNome),
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Grenze', Georgia, serif",
          fontWeight: 500,
          fontSize: u(corpoDoNome(carta.nome)),
          lineHeight: 1,
          letterSpacing: u(1),
          textTransform: 'uppercase',
          color: '#12100e',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {carta.nome}
      </div>

      {/* subtítulo: raça na criatura, tipo nas demais */}
      <div
        style={{
          ...posicao(MOLDE.textoSubtitulo),
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Grenze', Georgia, serif",
          fontWeight: 500,
          fontSize: u(10.5),
          lineHeight: 1,
          letterSpacing: u(0.8),
          textTransform: 'uppercase',
          color: '#12100e',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {subtitulo}
      </div>

      {/* texto de regras */}
      <div
        style={{
          ...posicao(MOLDE.textoEfeito),
          zIndex: 9,
          fontFamily: "'Manjari', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: u(corpoDoEfeito(efeito)),
          lineHeight: 1.25,
          color: '#12100e',
          /* o texto do Quatro Elementos separa palavra-chave e parágrafos com quebras */
          whiteSpace: 'pre-line',
          overflow: 'hidden',
        }}
      >
        {efeito}
      </div>

      {/* rodapé */}
      <div
        style={{
          ...posicao(MOLDE.textoRef),
          zIndex: 9,
          fontFamily: "'Kanit', system-ui, sans-serif",
          fontSize: u(8),
          lineHeight: 1,
          color: '#e8e2d6',
        }}
      >
        {carta.ref ?? `RDI - 080/${String(carta.id).padStart(3, '0')}`}
      </div>
      <div
        style={{
          ...posicao(MOLDE.textoCredito),
          zIndex: 9,
          textAlign: 'right',
          fontFamily: "'Kanit', system-ui, sans-serif",
          fontSize: u(8),
          lineHeight: 1,
          color: '#e8e2d6',
        }}
      >
        Lucas Antônio
      </div>

      {/* ATQ e VIDA: só criatura, e o número é o vigente no motor */}
      {criatura && (
        <>
          <Peca nome="badge-ataque" caixa={MOLDE.badgeAtaque} z={10} />
          <Peca nome="badge-vida" caixa={MOLDE.badgeVida} z={10} />
          <div
            style={{
              ...posicao(MOLDE.numeroAtaque),
              zIndex: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Palanquin Dark', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: u(40),
              lineHeight: 1,
              color: alterado ? '#ffd569' : '#ffffff',
              textShadow: `0 ${u(1)} ${u(2)} rgba(0,0,0,.85)`,
            }}
          >
            {ataque}
          </div>
          <div
            style={{
              ...posicao(MOLDE.numeroVida),
              zIndex: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Palanquin Dark', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: u(40),
              lineHeight: 1,
              color: alterado ? '#ffd569' : '#ffffff',
              textShadow: `0 ${u(1)} ${u(2)} rgba(0,0,0,.85)`,
            }}
          >
            {vida}
          </div>
        </>
      )}
    </div>
  );
}
