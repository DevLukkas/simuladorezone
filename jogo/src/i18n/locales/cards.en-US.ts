import type { CardTexts } from '../keys.ts';

/**
 * Nome e texto de regras das 78 cartas em inglês.
 *
 * Convenções desta tradução (decisão nº 18):
 * - nome próprio cunhado fica como impresso (Azzure, Sapomerlim, Yanturai, Arborium…);
 *   o que é descritivo é traduzido, para o jogador ler o mesmo grupo que o motor filtra
 *   por nome — "Lobo" → "Wolf", "Tridente" → "Trident", "Contos" → "Tales",
 *   "Moeda da Floresta" → "Forest Coin", "Nortenho" → "Northman", "Harpia" → "Harpy";
 * - carta citada dentro do texto usa o MESMO nome traduzido da carta citada;
 * - ATQ vira ATK e VIDA vira HEALTH, na mesma caixa do impresso;
 * - "rota" e "coluna" viram os dois "column" (a regra é uma só: a linha de frente);
 * - erros de digitação do impresso não são reproduzidos — a tradução sai limpa.
 */
export const cards: CardTexts = {
  1: {
    name: 'Azzure, Priestess of Atlantis',
    text: 'While this creature is on the field, your other "Aquarium" creatures get +1 ATK and +1 HEALTH.',
  },
  2: {
    name: 'Dheron, Frogmage Apprentice',
    text: 'Whenever an allied Amphibian creature changes element, it permanently gets +1 health.',
  },
  3: {
    name: 'Mysticus, Archmage of Atlantis',
    text: 'Once per turn, you may destroy a "Trident" attachment on this creature. If you do, negate the activation of an opponent\'s ability card. If this effect is used, this creature cannot attack during your next turn.',
  },
  4: {
    name: 'Leviathan of Esdras',
    text: 'This creature cannot be summoned normally. You may discard this card from your hand; if you do, choose a creature you control and summon a Mutant creature named Esdras from your hand over the chosen creature.',
  },
  5: {
    name: 'Atlas, Prince of Atlantis',
    text: 'When it enters the field, you may discard a card named Trident. If you do, search your deck for a card named Atlantis and add it to your hand.',
  },
  6: {
    name: 'Drowned Pirate',
    text: 'When this creature is destroyed, deal 1 damage to the creature that destroyed it.',
  },
  7: {
    name: 'Sapomerlim, Mage of Tales',
    text: 'Whenever this creature\'s element changes, you may choose an Amphibian creature you control and change its element to an element of your choice until the end of the turn.',
  },
  8: {
    name: 'The Chest Mimic',
    text: 'When this creature is sent to your discard pile, you may choose a creature you control and put a +1/+1 marker on it.',
  },
  9: {
    name: 'Mighty Trident of Atlas',
    text: 'The attached creature gets +1/+1. If two "Mighty Trident of Atlas" are attached to the same creature, your opponent discards a random card.',
  },
  10: {
    name: 'Assassin\'s Trident',
    text: 'The attached creature gets +2 ATK.',
  },
  11: {
    name: 'Absolute Defense of the Trident',
    text: 'The attached creature gets +2 health. If this card is exiled, return it to its owner\'s hand.',
  },
  12: {
    name: 'Magic Coral Trident',
    text: 'The attached creature gets +1/+1. Whenever the attached creature attacks, choose an enemy creature. On the next turn, the chosen creature cannot attack.',
  },
  13: {
    name: 'Death Reflexes',
    text: 'The attached creature gets +1 health. Whenever it is attacked, deal 1 direct damage to an enemy creature.',
  },
  14: {
    name: 'Drowning',
    text: 'With the attached creature, choose an enemy creature. The chosen creature gets -1 health for each card attached to it. If the chosen creature dies, destroy this card.',
  },
  15: {
    name: 'True Trident of Atlantis',
    text: 'The equipped creature gets +1/+1. It gets an extra +1 ATK for each other card named Trident you control.',
  },
  16: {
    name: 'Sapocalibur, the Legendary Sword',
    text: 'Gets +2 ATK. Once per turn, if it is attached to an Amphibian, you may change that creature\'s element.',
  },
  17: {
    name: 'Orb of the Spectral Aura',
    text: 'The equipped creature gets +1 ATK for each other Ghost you control. When this card is attached, create a 1/1 Ghost creature token of the Void element.',
  },
  18: {
    name: 'Treasure Map',
    text: 'When the attached creature deals damage to the opposing player, you may draw a card and then discard a card.',
  },
  19: {
    name: 'Gauntlet of Power',
    text: 'The attached creature gets +3 ATK. At the end of the next turn, it takes 1 direct damage.',
  },
  20: {
    name: 'Mermaid\'s Jar',
    text: 'When it is attached, choose an element. The attached creature becomes that element while this card remains attached. If there are three or more creatures of the same element on your side of the field, the attached creature gets +2 health.',
  },
  21: {
    name: 'Hysterical Laughter of Tashaa O',
    text: 'Target enemy creature cannot attack this turn.',
  },
  22: {
    name: 'Blind Choice',
    text: 'Discard your entire hand, then draw as many cards as you discarded with this effect.',
  },
  23: {
    name: 'War Puppet',
    text: 'Choose target enemy creature: until its next turn it must attack a creature of your choice.',
  },
  24: {
    name: 'Eye of the Ancient Oracle',
    text: 'Your opponent reveals two random cards from their hand; you choose one to be shuffled back into their deck.',
  },
  25: {
    name: 'Ritual of the Spectral Orb',
    text: 'Sacrifice a creature you control: summon up to two Ghost creatures with 2 ATK or less from your deck. Creatures summoned by this effect cannot attack on the turn they are summoned.',
  },
  26: {
    name: 'Blood Moon of Esdras',
    text: 'Choose a creature you control: it gets +1/+1 until the end of your turn for each creature named Esdras in your discard pile.',
  },
  27: {
    name: 'Changing Course',
    text: 'Choose a creature you control: it cannot be targeted by attacks this turn.',
  },
  28: {
    name: 'Wolf of the Dark Howl',
    text: 'Whenever another creature with Wolf in its name enters the field under your control, put a +1/+1 marker on this creature.',
  },
  29: {
    name: 'Wolf of the Silver Fangs',
    text: 'When this creature is sent from the field to your discard pile, you may summon another creature named "Wolf of the Silver Fangs" from your deck.',
  },
  30: {
    name: 'Badur, the Bear Cub',
    text: 'Sacrifice this creature: you may summon a creature named "Badur, the Guardian Bear" from your discard pile.',
  },
  31: {
    name: 'Badur, the Guardian Bear',
    text: 'While this creature is on the field, your other Earth Beast creatures take 1 less combat damage. Whenever another Beast creature you control is sent from the field to your discard pile, put a +1 ATK and HEALTH marker on this creature.',
  },
  32: {
    name: 'Badur Tribal Sorcerer',
    text: 'Once per opponent\'s turn, you may choose an enemy creature and a Beast creature you control. This turn, the chosen enemy creature must attack the chosen creature if possible.',
  },
  33: {
    name: 'Sapotristan, the Squire of Tales',
    text: 'Whenever this creature\'s element changes, you may choose a creature with "Tales" in its name. Swap its ATK and HEALTH while its element remains changed. If that creature is destroyed while its element is changed, draw a card.',
  },
  34: {
    name: 'Poltergeist, Voice of the Void',
    text: 'When this creature is sent to your discard pile, you may choose an enemy creature. It cannot attack during its controller\'s next turn.',
  },
  35: {
    name: 'Reaper of the Cursed Castle',
    text: 'When it enters the field, you may choose a Ghost creature in your discard pile and shuffle it back into your deck. If you do, choose an enemy creature: it gets -ATK equal to the ATK of the shuffled creature until the end of the turn. When this creature is sent from the field to your discard pile, create a 1/1 Ghost creature token (Element: Void).',
  },
  36: {
    name: 'Ancestral Mamuthe',
    text: 'Once per turn, you may send the top 2 cards of your deck to your discard pile. This creature gets +1 HEALTH for each different element among the cards in your discard pile.',
  },
  37: {
    name: 'Totem of the Ancestral Guardian',
    text: 'The attached creature gets +0/+2. If it is a Beast, it gets +3 health instead of +0/+2.',
  },
  38: {
    name: 'Stampede of the Pack',
    text: 'The attached creature gets +1/+1. The attached creature gains the TRAMPLE keyword.',
  },
  39: {
    name: 'Maddened Guardian',
    text: 'The attached creature gets +2 ATK and +2 HEALTH. When it attacks, your other Beast creatures get +1 ATK until the end of the turn. If it does not attack this turn, destroy this card.',
  },
  40: {
    name: 'Heart of the Frog Squire',
    text: 'When the attached creature\'s element changes, you may choose a creature with Tales in its name and swap its ATK and HEALTH until the end of the turn. If the creature\'s element changes, return this card to your hand immediately instead of sending it to the discard pile.',
  },
  41: {
    name: 'Possession of Inanimate Objects',
    text: 'The attached creature gets +1/+1. When this card leaves the field for the discard pile, except during the battle phase, you may draw a card.',
  },
  42: {
    name: 'Translucent Body',
    text: 'The attached creature cannot be attacked by creatures with 3 or more HEALTH.',
  },
  43: {
    name: 'Squire\'s Protection',
    text: 'The attached creature gets +1/+2. Once per turn, when a creature you control with Tales in its name is targeted by an attack, you may send this card to the discard pile and negate the attack.',
  },
  44: {
    name: 'Resilience',
    text: 'The attached creature gets +2 HEALTH. The first time it takes damage each turn, reduce that damage by 1.',
  },
  45: {
    name: 'Cave of the Guardian Badur',
    text: 'When a Beast creature you control is sent from the field to your discard pile, you may choose a creature named "Badur, the Guardian Bear". If you do, it gets +1 ATK until the end of the turn. The first time each turn an enemy creature is destroyed in combat, you may draw 1 card.',
  },
  46: {
    name: 'Devourer of Virgins',
    text: 'MARTIAL\n\nDuring your opponent\'s battle phase: return a Wind Ability card from your discard pile to your hand, then give an enemy creature -1/0 until the end of the turn.',
  },
  47: {
    name: 'Éria, Harpy Queen',
    text: 'VORPAL\n\nWhen it enters the field: add a card named "Harpy" from your deck to your hand.',
  },
  48: {
    name: 'Hera, Arborium Witch',
    text: 'Once per turn, during your turn, you may choose two allied creatures and swap their columns. If a "Forest Coin" card is attached to this creature, you may use this effect as a quick effect on either player\'s turn.',
  },
  49: {
    name: 'Relvus, Arborium General',
    text: 'Allied creatures attached with "Forest Coin" get +1/+1.\n\nExile a "Forest Coin" card from your hand,\nthen draw 2 cards.\n(activate this effect only once per turn)',
  },
  50: {
    name: 'Wargh, Arborium Guardian',
    text: 'REGENERATE\n\nWhen it is attached with a "Forest Coin" card, reveal the top 4 cards of your deck;\ndeal damage to the enemy creature in the same column equal to the number of cards named "Arborium" revealed by this effect.',
  },
  51: {
    name: 'Yen, Yanturai of the Storm',
    text: 'MARTIAL\n\nDuring your opponent\'s battle phase: return a Wind Ability card from your discard pile to your hand, then give an enemy creature -1/0 until the end of the turn.',
  },
  52: {
    name: 'Ancestral Yanturai Sword',
    text: 'The attached creature gets +1/0.\nWhenever an ability card is returned to its owner\'s hand, the attached creature gets +2/+1 until the end of the turn.',
  },
  53: {
    name: 'Forest Coin',
    text: 'The attached creature gets +1/+1.\nWhen this card is sent to the discard pile, both players discard a card from their hand; a player with no cards in hand exiles the top card of their deck.',
  },
  54: {
    name: 'Life Bulb Seed',
    text: 'The attached creature gets 0/+1. If it is a Plant, it automatically heals 1 health at the start of your turn.',
  },
  55: {
    name: 'Forest Embrace',
    text: 'This card is treated as "Forest Coin" on the field or in the deck.\nThe attached creature gets +1/0, and the enemy creature in the same column gets -1/0.',
  },
  56: {
    name: 'Harpy Air Strike',
    text: 'The attached creature gets +2/+1. When it attacks a creature that is not of the "Wind" element, it gets +1 for each differently named Wind Ability card in your discard pile.',
  },
  57: {
    name: 'Virgin-Devouring Sprout',
    text: 'During the enemy turn, the attached creature gets +0/+3 until the end of the turn. When it is attached to "Devourer of Virgins" and that creature is destroyed, add a Plant creature from your deck to your hand.',
  },
  58: {
    name: 'Arborium Sprouts',
    text: 'This card is treated as "Forest Coin" on the field or in the deck.\nThe attached creature gets +1/+1 for each allied Arborium creature on the field.',
  },
  59: {
    name: 'Storm Spirit',
    text: 'When you attach this card to your creature, the enemy creature in the same column permanently gets -1/0. If two cards with the same name are attached to this creature, it gets a\n+2/+1 counter.',
  },
  60: {
    name: 'Definitely Not a Northman',
    text: 'This card is named "Northman Kaboom Contraption" on the field or in your deck.\n\nReturn three exiled cards to your deck, shuffle it and then draw a card.',
  },
  61: {
    name: 'Emergency Request',
    text: 'Choose an allied creature: recruit from your deck, into a free zone, a creature of the same race as the chosen creature and with equal or lower attack.',
  },
  62: {
    name: 'Twisted Trunks',
    text: 'This card is treated as "Forest Coin" in the deck.\nInvert the effects of the cards attached in a chosen column until the end of the turn. (buffs become debuffs, and debuffs become buffs)',
  },
  63: {
    name: 'Aikãn, Yanturai of Wrath',
    text: 'MARTIAL\n\nDuring your opponent\'s battle phase: return a Wind Ability card from your discard pile to your hand, then give an enemy creature -1/0 until the end of the turn.',
  },
  64: {
    name: 'Grouz, Northman Barbarian',
    text: 'Whenever an enemy creature has its stats reduced by an effect, this creature gets +1/+1.\nWhen this creature attacks or is attacked, reduce an enemy creature\'s ATK by 1.',
  },
  65: {
    name: 'Kraven, Northman Marksman',
    text: 'Once per turn, you may send the top two cards of your deck to the discard pile, then reduce by 1 the ATK of the enemy creature in the same column as this creature.',
  },
  66: {
    name: 'Sapoceloth, Hero of Tales',
    text: 'At the start of your turn, reveal a card "of Tales" in your hand and change the element of the enemy creature in the same column as this one. This creature takes no battle damage from enemy creatures of the "Water" element.',
  },
  67: {
    name: 'Stiven, Northman Scientist',
    text: 'When it is attached with the card "Northman Kaboom Contraption", it gets +2/+0.\n\nOnce per turn, you may send a "Northman Kaboom Contraption" card from your hand to the discard pile. Search your deck for two "Northman" cards and reveal them. Your opponent chooses one of them. Add the chosen card to your hand and put the other on the bottom of your deck.',
  },
  68: {
    name: 'Vulkron, Dragonata of Flames',
    text: 'Whenever this creature destroys an enemy creature, the enemy creatures in the columns to the left and to the right take 1 extra damage.',
  },
  69: {
    name: 'Northman Catapult',
    text: 'The allied creature gets +1/0 for each allied Goblin creature.\n\nAt the start of your turn, you may send a creature named "Northman" from your deck to the discard pile; the enemy creature in this column gets -X/0, where X is the health of the creature sent to the discard pile by this effect.',
  },
  70: {
    name: 'Northman War Contraption',
    text: 'The attached creature gets +1/0 and the enemy creature in the same column gets -1/0.\n\nIf it is attached to a Goblin creature, that creature gets 0/+2.\nIf it is attached to a Beast creature, that creature gets -1/-1.',
  },
  71: {
    name: 'Ifreet\'s Breath',
    text: 'The attached creature gets +2/+1.',
  },
  72: {
    name: 'Northman\'s Hunt',
    text: 'When it is attached, the enemy creature in the same column gets -2/0.',
  },
  73: {
    name: 'Northman Kaboom Contraption',
    text: 'The enemy creature in the same column permanently gets -1/0.\n\nExile this card together with two other "Northman" cards from your discard pile. Choose an enemy creature: it gets -1/0.',
  },
  74: {
    name: 'Runes of Hephaestus',
    text: 'The attached creature gets +3/+0. If an enemy creature is destroyed in battle while this card is attached, the attached creature takes 1 point of damage to its HEALTH.',
  },
  75: {
    name: 'Flaming Breath',
    text: 'The attached creature gets +4/0; after it attacks, destroy this card. The attached creature does not attack on your next turn when this card is destroyed.',
  },
  76: {
    name: 'Meteor Barrage',
    text: 'Every creature on the field takes 1 direct damage to its health.',
  },
  77: {
    name: 'Cacheralossauro',
    text: 'MARTIAL\n\nDuring your opponent\'s battle phase: return a Wind Ability card from your discard pile to your hand, then give an enemy creature -1/0 until the end of the turn.',
  },
  78: {
    name: 'Call of the Dead',
    text: 'Recruit from the enemy discard pile a creature that was defeated this turn.\nThat creature becomes a Zombie while it is on the field.',
  },
  79: {
    name: 'asf',
    text: 'asf',
  },
};
