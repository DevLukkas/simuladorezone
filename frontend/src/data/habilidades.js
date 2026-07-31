/**
 * Cartas do tipo HABILIDADE
 *
 * Campos:
 *   id       — número único da carta
 *   nome     — nome da carta
 *   tipo     — subtipo da habilidade (ex: Ataque, Suporte, Cura, Controle...)
 *   efeito   — descrição do efeito
 *   elemento — fogo | agua | terra | vento | neutro | vazio | cosmico
 *   raridade — comum | rara | lendaria
 *   img      — nome do arquivo em /assets/cards/
 *   edicao   — nome da edição/expansão
 */
export const habilidades = [
  {
    id: 9,
    nome: 'Tridente Poderoso de Atlas',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1/+1. Se houver dois "Tridente Poderosos de Atlas" anexados a uma criatura, seu oponente descarta uma carta aleatoria.',
    elemento: 'agua',
    raridade: 'comum',
    img: '09.png',
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
    ],
    triggeredAbilities: [
      {
        id: 'tridente_atlas_double_discard',
        trigger: 'attached_count_reaches',
        attachedName: 'Tridente Poderoso de Atlas',
        count: 2,
        action: {
          type: 'opponent_discard_random',
          discard: 1,
        },
      },
    ],
  },
  {
    id: 10,
    nome: 'Tridente do Assassino',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +2 de ATQ.',
    elemento: 'agua',
    raridade: 'comum',
    img: '10.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'attack',
        value: 2,
      },
    ],
  },
  {
    id: 11,
    nome: 'defesa Absoluta do Tridente',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +2 de Vida. Se esta carta for exilada, retorne-a para a mão do seu dono.',
    elemento: 'agua',
    raridade: 'comum',
    img: '11.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'defense',
        value: 2,
      },
    ],
    triggeredAbilities: [
      {
        id: 'defesa_absoluta_return_on_exile',
        trigger: 'self_exiled',
        action: {
          type: 'return_to_hand',
          target: 'self',
        },
      },
    ],
  },
  {
    id: 12,
    nome: 'Tridente Mágico de Corais',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1/+1. Sempre que esta criatura anexada atacar, escolha uma criatura inimiga. No proxio turno, a criatura especificada não pode atacar.',
    elemento: 'agua',
    raridade: 'comum',
    img: '12.png',
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
    ],
    triggeredAbilities: [
      {
        id: 'corais_prevent_attack_on_attached_attack',
        trigger: 'attached_creature_attacks',
        action: {
          type: 'choose_enemy_creature_then_prevent_attack',
          duration: 'next_turn',
        },
      },
    ],
  },


  {
    id: 13,
    nome: 'Reflexos de Morte',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1 de Vida. Sempre que esta criatura for atacada , voce causa 1 de dano na direto em uma criatura inimiga.',
    elemento: 'agua',
    raridade: 'comum',
    img: '13.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'defense',
        value: 1,
      },
    ],
    triggeredAbilities: [
      {
        id: 'reflexos_damage_on_attacked',
        trigger: 'attached_creature_is_attacked',
        action: {
          type: 'choose_enemy_creature_then_deal_damage',
          damage: 1,
        },
      },
    ],
  },


   {
    id: 14,
    nome: 'Afogamento',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada escolha uma criatura inimiga. A criatura escolhida recebe -1 de Vida para cada carta anexada a ela. Se a criatura escolhida morrer destrua esta carta.',
    elemento: 'agua',
    raridade: 'comum',
    img: '14.png',
    edicao: 'Abismos & Profundezas',
    onAttach: [
      {
        type: 'choose_creature_then_modify_stat',
        target: 'enemy_creature',
        stat: 'defense',
        value_per_card: {
          zone: 'target_attachments',
          value: -1,
        },
      },
    ],
    triggeredAbilities: [
      {
        id: 'afogamento_destroy_self_on_target_death',
        trigger: 'chosen_enemy_creature_dies',
        action: {
          type: 'destroy_self',
        },
      },
    ],
  },

  {
    id: 37,
    nome: 'Totem do guardião Ancestral',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +0/+2. Se ela for do tipo besta, recebe +3 de Vida ao invés de +0/+2.',
    elemento: 'terra',
    raridade: 'comum',
    img: '37.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'modify_stat',
        target: 'attached_creature',
        stat: 'defense',
        value: 2,
        conditionals: [{ if: { race: 'Besta' }, value: 3 }],
      },
    ],
  },
  {
    id: 38,
    nome: 'Estouro da Manada',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1/+1. A criatura anexada recebe a palavra-chave ATROPELAR.',
    elemento: 'terra',
    raridade: 'comum',
    img: '38.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
      { type: 'grant_keyword', target: 'attached_creature', keyword: 'atropelar' },
    ],
  },
  {
    id: 39,
    nome: 'Guardião Enlouquecido',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +2/+2. Quando ela atacar, criaturas aliadas do tipo Besta recebem +1/+0 até o fim deste turno. Se a criatura anexada não atacar, destrua-a no fim do turno.',
    elemento: 'terra',
    raridade: 'comum',
    img: '39.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 2 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
    ],
    triggeredAbilities: [
      {
        id: 'guardiao_enlouquecido_besta_ataca',
        trigger: 'attached_creature_attacks',
        action: {
          type: 'temporary_modify_allied_creatures',
          filter: { race: 'Besta' },
          stats: ['attack'],
          value: 1,
        },
      },
      {
        id: 'guardiao_enlouquecido_sem_ataque',
        trigger: 'attached_creature_end_turn_if_not_attacked',
        action: { type: 'destroy_attached_creature' },
      },
    ],
  },
  {
    id: 40,
    nome: 'Coração do Sapoescudeiro',
    tipo: 'Habilidade',
    efeito: 'Quando o elemento da criatura anexada for alterado, você pode escolher uma criatura com Contos no nome, troque o ATQ e VIDA dela até o final do turno. Se o elemento da criatura for alterado, retorne esta carta para sua mão imediatamente ao invés de enviá-la para o descarte.',
    elemento: 'terra',
    raridade: 'comum',
    img: '40.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'coracao_sapoescudeiro_elemento_alterado',
        trigger: 'attached_creature_element_changed',
        action: {
          type: 'optional_swap_allied_creature_stats_until_end_turn',
          filter: { name_includes: 'Contos' },
          return_attachment_to_hand: true,
        },
      },
    ],
  },
  {
    id: 41,
    nome: 'Posse de Objetos Inanimados',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1/+1. Quando esta carta sai do campo para o descarte, exceto durante a fase de batalha, você pode comprar uma carta.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '41.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 1 },
    ],
    triggeredAbilities: [
      {
        id: 'posse_objetos_descartada',
        trigger: 'attachment_sent_from_field_to_your_discard_outside_battle',
        action: { type: 'optional_draw_cards', count: 1 },
      },
    ],
  },
  {
    id: 42,
    nome: 'Corpo Translúcido',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada nao pode ser atacada por criaturas com 3+ de VIDA.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '42.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'cannot_be_attacked_by_creatures_with_min_defense',
        target: 'attached_creature',
        min_defense: 3,
      },
    ],
  },
  {
    id: 43,
    nome: 'Proteção do Escudeiro',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +1/+2. Uma vez por turno, quando uma criatura que você controla que tenha Contos no nome for alvo de um ataque, você pode enviar esta carta para o descarte e negar o ataque.',
    elemento: 'terra',
    raridade: 'comum',
    img: '43.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
    ],
    triggeredAbilities: [
      {
        id: 'protecao_escudeiro_nega_ataque',
        trigger: 'your_creature_matching_is_targeted_by_attack',
        action: {
          type: 'optional_discard_self_prevent_attack',
          filter: { name_includes: 'Contos' },
        },
      },
    ],
  },
  {
    id: 44,
    nome: 'Resistência',
    tipo: 'Habilidade',
    efeito: 'A criatura anexada recebe +0/+2 e ignora 1 ponto de dano de combate.',
    elemento: 'terra',
    raridade: 'comum',
    img: '44.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
      {
        type: 'reduce_combat_damage_taken',
        target: 'attached_creature',
        value: 1,
      },
    ],
  },

]
