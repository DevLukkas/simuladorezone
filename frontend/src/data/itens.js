/**
 * Cartas do tipo ITEM
 *
 * Itens são sempre de elemento NEUTRO e equipam-se a criaturas
 * ou têm efeito imediato ao serem jogados.
 *
 * Campos:
 *   id       — número único da carta
 *   nome     — nome da carta
 *   tipo     — subtipo do item (ex: Equipamento, Consumível, Relíquia...)
 *   efeito   — descrição do efeito
 *   raridade — comum | rara | lendaria
 *   img      — nome do arquivo em /assets/cards/
 *   edicao   — nome da edição/expansão
 *
 * Nota: elemento é sempre 'neutro' — não precisa declarar no arquivo,
 *       o sistema preenche automaticamente.
 */
export const itens = [
  {
    id: 15,
    nome: 'Verdadeiro Tridente de Atlantis',
    tipo: 'Item',
    efeito: 'A criatura equipada ganha +1/+1. Ela recebe +1 de ATQ adicional para cada outro card de nome Tridente que você controlar.',
    raridade: 'rara',
    img: '15.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value: 1,
      },
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'defense',
        value: 1,
      },
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value_per_card: {
          zone: 'your_field',
          name_includes: 'Tridente',
          exclude_self: true,
          value: 1,
        },
      },
    ],
  },
  {
    id: 16,
    nome: 'Sapocalibur, A Espada Lendária',
    tipo: 'item',
    efeito: 'Receba +2 ATQ. Uma vez por turno, se estiver anexado em um Anfibio você pode mudar o elemento desta criatura.',
    raridade: 'lendaria',
    img: '16.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value: 2,
      },
    ],
    activatedAbilities: [
      {
        id: 'sapocalibur_change_element',
        timing: 'once_per_turn',
        source: 'attached_card',
        condition: {
          attached_creature_race: 'Anfibio',
        },
        action: {
          type: 'change_element',
          target: 'attached_creature',
          choose: ['fogo', 'agua', 'terra', 'vento', 'neutro', 'vazio', 'cosmico'],
          duration: 'permanent',
        },
      },
    ],
  },

  {
    id: 17,
    nome: 'Esfera da Aura Espectral',
    tipo: 'Item',
    efeito: 'A criatura equipada ganha +1 ATQ para cada criatura do tipo Espectro que você controla. Quando esta carta for anexada, crie uma ficha de criatura Espectro 1/1 do elemento Vazio.',
    raridade: 'comum',
    img: '17.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value_per_card: {
          zone: 'your_field',
          card_type: 'criatura',
          race: 'Espectro',
          value: 1,
        },
      },
    ],
    onAttach: [
      {
        type: 'summon_token',
        target: 'your_field',
        token: {
          id: 'token_espectro_vazio_1_1',
          nome: 'Ficha Espectro',
          raca: 'Espectro',
          ataque: 1,
          vida: 1,
          elemento: 'vazio',
          raridade: 'comum',
          color: 0x4b2a68,
        },
      },
    ],
  },
]
