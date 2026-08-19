import type { Card, Element, Rarity } from '../../data/types.ts';
import { useTranslation } from '../useTranslation.ts';
import bleeds from './frame.json';

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
const STEEL_BLUE = '#4a83b3';

interface Box {
  x: number;
  y: number;
  l: number;
  a: number;
}

const FRAME = {
  /**
   * Recuo lateral e superior iguais aos da arte impressa (5,3% do lado, 2,9% do topo),
   * para a ilustração casar com a borda preta da moldura. O rodapé passa de y=330 para
   * a caixa de efeito cobrir a emenda — sem isso sobrava um vão preto entre as duas.
   *
   * Não vale esticar até o fim da janela do molde (y=493): o recorte é paisagem (1,41) e
   * uma caixa muito alta faria o `object-fit: cover` ampliar demais a arte.
   */
  art: { x: 22, y: 16, l: 371, a: 324 } satisfies Box,
  /** faixa preta que corta a caixa de efeito reta e abriga ref, crédito e diamante */
  footerBand: { x: 0, y: 524.5, l: 415, a: 30.5 } satisfies Box,
  namePill: { x: 28.5, y: 29.5, l: 310, a: 28.5 } satisfies Box,
  subtitlePill: { x: 131.5, y: 55.5, l: 152, a: 18 } satisfies Box,
  textBox: { x: 27.5, y: 330.5, l: 359, a: 203.5 } satisfies Box,
  diamondTop: { x: 180.5, y: 7.5, l: 54, a: 21.5 } satisfies Box,
  /** montado na emenda: metade sobre a caixa de efeito, metade sobre a faixa preta */
  diamondFooter: { x: 180.5, y: 513.5, l: 54, a: 21.5 } satisfies Box,
  hex: { x: 339.5, y: 4.5, l: 67, a: 77 } satisfies Box,
  /** preenche o canto entre a placa do hexágono e a moldura — sem ele a arte vaza ali */
  hexCorner: { x: 371, y: 0, l: 44, a: 42 } satisfies Box,
  attackBadge: { x: 13.5, y: 253.5, l: 56.5, a: 91 } satisfies Box,
  healthBadge: { x: 343.5, y: 270, l: 53.5, a: 78 } satisfies Box,
  nameText: { x: 33, y: 32.5, l: 301, a: 23 } satisfies Box,
  subtitleText: { x: 135, y: 59.5, l: 145, a: 12 } satisfies Box,
  rulesText: { x: 39, y: 350, l: 337, a: 158 } satisfies Box,
  refText: { x: 28, y: 527.5, l: 90, a: 12 } satisfies Box,
  creditText: { x: 280, y: 527.5, l: 106, a: 12 } satisfies Box,
  attackNumber: { x: 12, y: 247, l: 60, a: 72 } satisfies Box,
  healthNumber: { x: 340, y: 252, l: 60, a: 72 } satisfies Box,
  /**
   * Rótulo na placa vinho do badge, calibrado sobre o rótulo que o bitmap tinha antes de
   * `scripts/badge-label.ts` apagá-lo: a caixa é centrada no traço da palavra impressa
   * (não na placa) e a fonte casa a altura de caixa alta dela — 9 unidades no badge de
   * ataque, 7,5 no de vida, que é menor. O deslocamento de ¾ de unidade para cima
   * compensa a métrica da Palanquin Dark, cujo miolo cai abaixo do centro da linha.
   */
  attackLabel: { x: 27.5, y: 319.75, l: 26, a: 9 } satisfies Box,
  healthLabel: { x: 357.5, y: 325.75, l: 24, a: 7.5 } satisfies Box,
};

/** altura de caixa alta de cada rótulo, em unidades do molde -> corpo da fonte */
const ATTACK_LABEL_SIZE = 13;
const HEALTH_LABEL_SIZE = 11;

/** ordem da paleta do Figma (frame ESTRUTURA DAS CARTAS), confirmada pelo DevLukkas */
const HEX_BY_ELEMENT: Record<Element, string> = {
  water: 'hexagono-1',
  fire: 'hexagono-2',
  earth: 'hexagono-3',
  wind: 'hexagono-4',
  neutral: 'hexagono-5',
  arcane: 'hexagono-6',
  void: 'hexagono-7',
};

/**
 * Cenário e comando não têm elemento (mini-manual): no lugar do hexágono vem o símbolo
 * do tipo. Item não precisa de exceção — o manual diz que item É elemento Neutro, e o
 * hexágono neutro já é o dourado que a arte usa.
 */
const HEX_BY_TYPE: Partial<Record<Card['type'], string>> = {
  scenario: 'hexagono-8',
  command: 'hexagono-9',
};

/**
 * O diamante indica a raridade, e o desenho muda conforme a carta seja criatura ou não:
 * a versão de criatura leva as marcas (a raridade dela vale ponto para quem a destruir —
 * comum 0, rara 1, lendária 2), a das demais é lisa.
 */
const CREATURE_DIAMOND: Record<Rarity, string> = {
  rare: 'diamante-1',
  legendary: 'diamante-2',
  common: 'diamante-3',
};

const NON_CREATURE_DIAMOND: Record<Rarity, string> = {
  rare: 'diamante-4',
  legendary: 'diamante-5',
  common: 'diamante-6',
};



function position(box: Box): React.CSSProperties {
  return {
    position: 'absolute',
    left: u(box.x),
    top: u(box.y),
    width: u(box.l),
    height: u(box.a),
  };
}

interface Bleed {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Infla a caixa lógica pela sangria da peça: o PNG do Figma inclui a sombra, e ela NÃO
 * é simétrica (cai para baixo/direita). Repartir a folga meio a meio, como era antes,
 * deslocava a peça alguns px do lugar. Os valores por lado estão em molde.json.
 */
function withBleed(name: string, box: Box, extra = 0): Box {
  const s = (bleeds as Record<string, Bleed>)[name];
  const left = (s?.left ?? 0) + extra;
  const top = (s?.top ?? 0) + extra;
  const right = (s?.right ?? 0) + extra;
  const bottom = (s?.bottom ?? 0) + extra;
  return { x: box.x - left, y: box.y - top, l: box.l + left + right, a: box.a + top + bottom };
}

function Piece({ name, box, z }: { name: string; box: Box; z: number }) {
  return (
    <img
      src={`/assets/molde/${name}.webp`}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        ...position(withBleed(name, box)),
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
function Silhouette({
  name,
  box,
  z,
  color,
  grow = 0,
}: {
  name: string;
  box: Box;
  z: number;
  color: string;
  /** unidades a mais em cada lado, para a silhueta sobrar além da peça */
  grow?: number;
}) {
  const mask = `url(/assets/molde/${name}.webp)`;
  return (
    <div
      aria-hidden
      style={{
        ...position(withBleed(name, box, grow)),
        zIndex: z,
        backgroundColor: color,
        maskImage: mask,
        maskSize: '100% 100%',
        WebkitMaskImage: mask,
        WebkitMaskSize: '100% 100%',
      }}
    />
  );
}

/**
 * Ícone com os contornos que a arte impressa tem: placa preta em volta e, nos diamantes
 * de raridade, um filete azul-aço entre o preto e o símbolo.
 */
function IconWithPlate({
  name,
  box,
  z,
  thickness,
  hairline,
}: {
  name: string;
  box: Box;
  z: number;
  thickness: number;
  hairline?: number;
}) {
  return (
    <>
      <Silhouette name={name} box={box} z={z} color="#000000" grow={thickness} />
      {hairline !== undefined && (
        <Silhouette name={name} box={box} z={z + 1} color={STEEL_BLUE} grow={hairline} />
      )}
      <Piece name={name} box={box} z={z + 2} />
    </>
  );
}

/**
 * Rótulo do badge (ATQ/VIDA). Vem do dicionário porque a placa do badge foi limpa em
 * `scripts/badge-label.ts` — texto dentro de bitmap não traduz. O tom quase branco com
 * sombra vinho é o do rótulo que estava impresso ali.
 */
function BadgeLabel({ text, box, size }: { text: string; box: Box; size: number }) {
  return (
    <div
      style={{
        ...position(box),
        zIndex: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Palanquin Dark', system-ui, sans-serif",
        fontWeight: 600,
        fontSize: u(size),
        lineHeight: 1,
        color: '#f7f4f6',
        textShadow: `0 ${u(0.5)} ${u(0.8)} rgba(45,0,35,.85)`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

/**
 * O texto de efeito varia muito de tamanho entre cartas. Em vez de medir no DOM (que
 * causaria layout thrashing numa mão com 8 cartas), a fonte cai em degraus por volume
 * de texto — o suficiente para as 45 caberem na caixa.
 */
function rulesFontSize(text: string): number {
  if (text.length > 260) return 10;
  if (text.length > 180) return 11.5;
  if (text.length > 120) return 13;
  return 14;
}

/**
 * Mesma ideia para o nome, que é uma linha só e não pode quebrar nem vazar a pill.
 * Os degraus são calibrados para a Grenze, condensada como a fonte da impressa: 17
 * reproduz o corpo do título impresso e ainda cabe em nomes de 31 caracteres na
 * largura útil de 301 unidades; o maior nome do catálogo tem 35. O degrau de 11,5
 * é folga para a tradução, que alonga o nome (o maior em espanhol tem 39).
 */
function nameFontSize(name: string): number {
  if (name.length > 40) return 11.5;
  if (name.length > 35) return 13;
  if (name.length > 31) return 15;
  return 17;
}

export interface DisplayStats {
  attack: number;
  defense: number;
}

export function ComposedCard({
  card,
  art,
  stats,
  className,
  title,
  onContextMenu,
  draft,
}: {
  card: Card;
  /** caminho da ilustração; ausente = só a moldura (fichas, cartas sem arte) */
  art?: string | undefined;
  /** stats do motor; ausente = os impressos na carta */
  stats?: DisplayStats | undefined;
  className?: string | undefined;
  title?: string | undefined;
  onContextMenu?: ((event: React.MouseEvent) => void) | undefined;
  /**
   * Nome e texto de uma carta que ainda NÃO está no catálogo — o estúdio desenha a
   * prévia do que está sendo digitado. No jogo isto nunca é passado: lá o texto sai
   * do i18n pelo id, que é o único jeito de sair traduzido.
   */
  draft?: { name: string; text: string } | undefined;
}) {
  const creature = card.type === 'creature' ? card : null;
  const attack = stats?.attack ?? creature?.attack;
  const health = stats?.defense ?? creature?.health;
  /** ferida ou buffada em relação ao impresso: destaca a divergência */
  const changed =
    creature !== null && (attack !== creature.attack || health !== creature.health);

  const hex = HEX_BY_TYPE[card.type] ?? HEX_BY_ELEMENT[card.element];
  const diamond = creature
    ? CREATURE_DIAMOND[card.rarity]
    : NON_CREATURE_DIAMOND[card.rarity];
  const { t, cardName, cardRulesText } = useTranslation();
  const subtitle = creature ? t(`race.${creature.race}`) : t(`cardType.${card.type}`);
  const name = draft?.name ?? cardName(card.id);
  const effect = draft?.text ?? cardRulesText(card.id) ?? '';

  return (
    <div
      className={className ?? 'w-full'}
      title={title ?? `${name} — ${effect}`}
      onContextMenu={onContextMenu}
      style={{
        containerType: 'inline-size',
        position: 'relative',
        /*
          A carta e uma CAIXA FECHADA de empilhamento. Os z-index daqui de dentro
          chegam a 11 (os losangos de ATQ/VIDA) e, sem isto, eles disputam a mesma
          pilha de quem desenha a carta e ganham de qualquer coisa posta POR CIMA
          dela: o botao INVOCAR da mao ficava debaixo do losango do rodape e o
          clique caia na carta, que so trocava a selecao — era o "seleciono mas nao
          consigo colocar em campo". Isolando aqui, todo cartaz de fora (botao de
          jogar, icone de ativavel, ATACAR, elemento alterado) fica por cima sem
          precisar caçar um z-index maior que o do molde.
        */
        isolation: 'isolate',
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
      {art && (
        <img
          src={art}
          alt={name}
          draggable={false}
          style={{
            ...position(FRAME.art),
            zIndex: 1,
            objectFit: 'cover',
            objectPosition: 'center top',
          }}
        />
      )}

      <Piece name="caixa-efeito" box={FRAME.textBox} z={2} />

      {/* corta a caixa de efeito reta e serve de fundo ao rodapé, como na arte impressa */}
      <div style={{ ...position(FRAME.footerBand), zIndex: 3, backgroundColor: '#000000' }} />

      {/* pills com contorno reforçado (a impressa tem traço mais grosso que o do Figma);
          o subtítulo vem antes para o pill do nome cobrir a emenda entre os dois */}
      <Silhouette name="pill-subtitulo" box={FRAME.subtitlePill} z={4} color="#000000" grow={1.3} />
      <Piece name="pill-subtitulo" box={FRAME.subtitlePill} z={4} />
      <Silhouette name="pill-nome" box={FRAME.namePill} z={5} color="#000000" grow={1.3} />
      <Piece name="pill-nome" box={FRAME.namePill} z={5} />

      <IconWithPlate name={diamond} box={FRAME.diamondTop} z={6} thickness={5.5} hairline={1.8} />
      <IconWithPlate name={diamond} box={FRAME.diamondFooter} z={6} thickness={5.5} hairline={1.8} />
      <div
        aria-hidden
        style={{
          ...position(FRAME.hexCorner),
          zIndex: 6,
          backgroundColor: '#000000',
          borderTopRightRadius: u(11),
        }}
      />
      <IconWithPlate name={hex} box={FRAME.hex} z={6} thickness={7} />

      {/* nome */}
      <div
        style={{
          ...position(FRAME.nameText),
          zIndex: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Grenze', Georgia, serif",
          fontWeight: 500,
          fontSize: u(nameFontSize(name)),
          lineHeight: 1,
          letterSpacing: u(1),
          textTransform: 'uppercase',
          color: '#12100e',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {name}
      </div>

      {/* subtítulo: raça na criatura, tipo nas demais */}
      <div
        style={{
          ...position(FRAME.subtitleText),
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
        {subtitle}
      </div>

      {/* texto de regras */}
      <div
        style={{
          ...position(FRAME.rulesText),
          zIndex: 9,
          fontFamily: "'Manjari', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: u(rulesFontSize(effect)),
          lineHeight: 1.25,
          color: '#12100e',
          /* o texto do Quatro Elementos separa palavra-chave e parágrafos com quebras */
          whiteSpace: 'pre-line',
          overflow: 'hidden',
        }}
      >
        {effect}
      </div>

      {/* rodapé */}
      <div
        style={{
          ...position(FRAME.refText),
          zIndex: 9,
          fontFamily: "'Kanit', system-ui, sans-serif",
          fontSize: u(8),
          lineHeight: 1,
          color: '#e8e2d6',
        }}
      >
        {card.ref ?? `RDI - 080/${String(card.id).padStart(3, '0')}`}
      </div>
      <div
        style={{
          ...position(FRAME.creditText),
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
      {creature && (
        <>
          <Piece name="badge-ataque" box={FRAME.attackBadge} z={10} />
          <Piece name="badge-vida" box={FRAME.healthBadge} z={10} />
          <BadgeLabel
            text={t('card.attackBadge')}
            box={FRAME.attackLabel}
            size={ATTACK_LABEL_SIZE}
          />
          <BadgeLabel
            text={t('card.healthBadge')}
            box={FRAME.healthLabel}
            size={HEALTH_LABEL_SIZE}
          />
          <div
            style={{
              ...position(FRAME.attackNumber),
              zIndex: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Palanquin Dark', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: u(40),
              lineHeight: 1,
              color: changed ? '#ffd569' : '#ffffff',
              textShadow: `0 ${u(1)} ${u(2)} rgba(0,0,0,.85)`,
            }}
          >
            {attack}
          </div>
          <div
            style={{
              ...position(FRAME.healthNumber),
              zIndex: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Palanquin Dark', system-ui, sans-serif",
              fontWeight: 600,
              fontSize: u(40),
              lineHeight: 1,
              color: changed ? '#ffd569' : '#ffffff',
              textShadow: `0 ${u(1)} ${u(2)} rgba(0,0,0,.85)`,
            }}
          >
            {health}
          </div>
        </>
      )}
    </div>
  );
}
