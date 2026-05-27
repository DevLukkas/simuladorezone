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




]
