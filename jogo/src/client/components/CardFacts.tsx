import type { Card } from '../../data/types.ts';
import { currentElement } from '../../engine/cardsInPlay.ts';
import type { CreatureInPlay } from '../../engine/state.ts';
import { currentStats } from '../../engine/stats.ts';
import { useCardZoomStore } from '../stores/cardZoomStore.ts';
import { ELEMENT_COLOR, RARITY_COLOR, ZN } from '../theme.ts';
import { useTranslation } from '../useTranslation.ts';
import { CardImage } from './Card.tsx';

/**
 * A ficha da carta: o mosaico de fatos e o texto de regras em corpo de leitura.
 *
 * É a MESMA peça na coleção (painel da direita) e na carta ampliada (decisão
 * nº 31) — antes eram dois desenhos diferentes para os mesmos cinco dados, e a
 * carta ampliada ainda estava no tema anterior. O que ela não repete é o que a
 * carta composta já imprime grande ao lado: nome e ilustração.
 */
export function CardFacts({ card }: { card: Card }) {
  const { t, cardRulesText } = useTranslation();

  return (
    <>
      <div className="zn-hair grid-cols-2">
        <Fact label={t('collection.fact.type')} value={t(`cardType.${card.type}`)} />
        <Fact
          label={t('collection.fact.element')}
          value={t(`element.${card.element}`)}
          color={ELEMENT_COLOR[card.element]}
        />
        <Fact
          label={t('collection.fact.rarity')}
          value={t(`rarity.${card.rarity}`)}
          color={RARITY_COLOR[card.rarity]}
        />
        {card.type === 'creature' ? (
          <Fact
            label={t('collection.fact.stats')}
            value={`${t(`race.${card.race}`)} · ${card.attack} / ${card.health}`}
          />
        ) : (
          <Fact label={t('collection.fact.edition')} value={t(`edition.${card.edition}`)} />
        )}
      </div>

      <p className="mt-3.5 whitespace-pre-line text-[13px] leading-relaxed text-zn-dim">
        {cardRulesText(card.id) ?? t('card.noText')}
      </p>
    </>
  );
}

/**
 * A ficha da CÓPIA em campo: o que vale para esta criatura agora.
 *
 * A carta impressa (ao lado) nunca muda — e é isso que o jogador precisa ler
 * quando quer a regra. O que faltava era o outro lado: os números depois de
 * marcadores e dano, o que está anexado nela e as restrições em vigor
 * (obrigada a atacar, protegida, já atacou). Pedido do DevLukkas: "mostrar
 * também as cartas anexadas e, em algum lugar, o status atualizado".
 *
 * Some sozinha: quem decide se ela existe é o `CardZoom`, olhando se a coluna
 * ampliada ainda tem a mesma criatura.
 */
export function InPlayFacts({
  creature,
  field,
  turn,
}: {
  creature: CreatureInPlay;
  field: readonly (CreatureInPlay | null)[];
  /** turno corrente: é o que decide o que ainda está em vigor */
  turn: number;
}) {
  const { t, cardName } = useTranslation();
  const zoom = useCardZoomStore((state) => state.zoom);
  const stats = currentStats(creature, field);
  const element = currentElement(creature);
  const temporary = creature.temporaryModifiers.reduce(
    (total, modifier) => ({
      attack: total.attack + modifier.attack,
      defense: total.defense + modifier.defense,
    }),
    { attack: 0, defense: 0 },
  );

  const status: string[] = [];
  if ((creature.mustAttackUntilTurn ?? 0) >= turn) {
    status.push(t('card.inPlay.mustAttack', { turn: creature.mustAttackUntilTurn ?? 0 }));
  }
  if ((creature.cannotAttackUntilTurn ?? 0) >= turn) {
    status.push(t('card.inPlay.cannotAttack', { turn: creature.cannotAttackUntilTurn ?? 0 }));
  }
  if ((creature.cannotBeTargetedUntilTurn ?? 0) >= turn) {
    status.push(t('card.inPlay.protected', { turn: creature.cannotBeTargetedUntilTurn ?? 0 }));
  }
  if (creature.attackedOnTurn === turn) status.push(t('card.inPlay.attacked'));
  if (creature.canAttackFromTurn > turn) {
    status.push(t('card.inPlay.summoningSickness', { turn: creature.canAttackFromTurn }));
  }

  return (
    <>
      <div className="zn-hair grid-cols-2">
        <Fact
          label={t('card.inPlay.stats')}
          value={`${stats.attack} / ${stats.defense}`}
          color={creature.damage > 0 ? ZN.redLight : ZN.greenLight}
        />
        <Fact label={t('card.inPlay.damage')} value={String(creature.damage)} />
        <Fact
          label={t('card.inPlay.markers')}
          value={signed(creature.markers.attack, creature.markers.defense)}
        />
        {temporary.attack || temporary.defense ? (
          <Fact
            label={t('card.inPlay.temporary')}
            value={signed(temporary.attack, temporary.defense)}
          />
        ) : (
          <Fact
            label={t('card.inPlay.element')}
            value={t(`element.${element}`)}
            color={ELEMENT_COLOR[element]}
          />
        )}
      </div>

      <h3 className="zn-label mt-4 uppercase">{t('card.inPlay.attachments')}</h3>
      {creature.attachments.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {creature.attachments.map((attachment) => (
            <button
              key={attachment.uid}
              type="button"
              onClick={() => zoom(attachment.cardId)}
              title={`${cardName(attachment.cardId)} — ${t('card.inPlay.openAttachment')}`}
              className="zn-tile w-20 cursor-pointer p-0"
              style={{ ['--tile-line' as string]: ZN.green }}
            >
              <CardImage cardId={attachment.cardId} className="w-full" />
            </button>
          ))}
        </div>
      ) : (
        <p className="zn-num mt-2 text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
          {t('card.inPlay.noAttachments')}
        </p>
      )}

      <h3 className="zn-label mt-4 uppercase">{t('card.inPlay.status')}</h3>
      {status.length ? (
        <ul className="mt-2 flex flex-col gap-1">
          {status.map((line) => (
            <li
              key={line}
              className="zn-num border-l-2 border-zn-edge pl-2 text-[10px] leading-relaxed text-zn-muted"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="zn-num mt-2 text-[10px] uppercase tracking-[0.14em] text-zn-ghost">
          {t('card.inPlay.statusClear')}
        </p>
      )}
    </>
  );
}

/** "+2 / -1", com o sinal sempre à vista (0 vira "—"). */
function signed(attack: number, defense: number): string {
  if (!attack && !defense) return '—';
  const withSign = (value: number): string => (value > 0 ? `+${value}` : String(value));
  return `${withSign(attack)} / ${withSign(defense)}`;
}

/** uma célula do mosaico: etiqueta mono apagada em cima, valor mono forte embaixo */
export function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-2.5">
      <span className="zn-num text-[9px] uppercase tracking-[0.2em] text-zn-faint">{label}</span>
      <span className="zn-num truncate text-[13px] font-bold" style={{ color: color ?? '#e6e2d8' }}>
        {value}
      </span>
    </div>
  );
}
