/**
 * Cartas do tipo CRIATURA
 *
 * Campos:
 *   id       — número único da carta (corresponde ao nome do arquivo: 01.png, 02.png ...)
 *   nome     — nome da carta
 *   raca     — raça/espécie da criatura (ex: Dragão, Elfo, Golem...)
 *   ataque   — valor de ataque
 *   vida     — pontos de vida / defesa
 *   efeito   — descrição do efeito/habilidade especial (null se não tiver)
 *   elemento — fogo | agua | terra | vento | neutro | vazio | cosmico
 *   raridade — comum | rara | lendaria
 *   img      — nome do arquivo em /assets/cards/ (ex: '01.png')
 *   edicao   — nome da edição/expansão
 */
export const criaturas = [
  {
    id: 1,
    nome: 'Azzure, Sacerdotisa de Atlantis',
    raca: 'Acquarium',
    ataque: 2,
    vida: 4,
    efeito: 'Enquanto estiver em campo, todas as criaturas do tipo Acquarium recebem +1 de ataque e vida.',
    elemento: 'agua',
    raridade: 'rara',
    img: '01.png',
    edicao: 'Abismos & Profundezas',
    effects: [
      {
        type: 'aura_modify_stat',
        target: 'your_field',
        filter: { race: 'Acquarium' },
        stats: ['attack', 'defense'],
        value: 1,
      },
    ],
  },
  {
    id: 2,
    nome: 'Dheron, Aprendiz de Sapomago',
    raca: 'Anfibio',
    ataque: 1,
    vida: 2,
    efeito: 'Sempre que uma criatura do tipo Anfibio aliada mudar de elemento, ela receberá +1 de vida permanentemente.',
    elemento: 'agua',
    raridade: 'comum',
    img: '02.png',
    edicao: 'Abismos & Profundezas',
    triggeredAbilities: [
      {
        id: 'dheron_anfibio_element_changed',
        trigger: 'your_creature_element_changed',
        filter: { race: 'Anfibio' },
        action: {
          type: 'add_permanent_marker',
          stats: ['defense'],
          value: 1,
        },
      },
    ],
  },
  {
    id: 3,
    nome: 'Mysticus, Arquimago de Atlantis',
    raca: 'Acquarium',
    ataque: 1,
    vida: 5,
    efeito: 'Uma vez por turno, você pode destruir um anexo de nome "tridente" desta criatura. Se fizer isto, anule a ativação de  uma carta de habilidade do oponente. Se este efeito for ativado, esta criatura nao pode atacar durante o seu próximo turno.',
    elemento: 'agua',
    raridade: 'lendario',
    img: '03.png',
    edicao: 'Abismos & Profundezas',
    activatedAbilities: [
      {
        id: 'mysticus_destroy_tridente',
        timing: 'once_per_turn',
        source: 'field_creature',
        cost: {
          type: 'destroy_attachment',
          name_includes: 'Tridente',
        },
        action: {
          type: 'cannot_attack_next_turn',
          target: 'self',
        },
      },
    ],
  },
  {
    id: 4,
    nome: 'Leviathan de Esdras',
    raca: 'Mutante',
    ataque: 3,
    vida: 3,
    efeito: 'Esta criatura não pode ser invocada normalmente. Você pode descartar esta carta da sua mão, se fizer isso escolha uma criatura que você controle, Invoque uma criatura do tipo Mutante de nome Esdras da sua mão sobre a criatura ecolhida.',
    elemento: 'agua',
    raridade: 'rara',
    img: '04.png',
    edicao: 'Abismos & Profundezas',
    summonRule: {
      normal: false,
    },
    activatedAbilities: [
      {
        id: 'leviathan_special_summon',
        source: 'hand',
        cost: { type: 'discard_self' },
        action: {
          type: 'special_summon_over_your_creature',
          filter: { race: 'Mutante', name_includes: 'Esdras' },
        },
      },
    ],
  },
  {
    id: 5,
    nome: 'Atlas, Principe de Atlantis',
    raca: 'Acquarium',
    ataque: 2,
    vida: 2,
    efeito: 'Ao entrar em campo, você pode descartar uma carta de nome Tridente. Se fizer isso, busque uma carta de nome Atlantis no seu baralho e adicione-a à sua mão.',
    elemento: 'agua',
    raridade: 'comum',
    img: '05.png',
    edicao: 'Abismos & Profundezas',
    onEnter: [
      {
        type: 'discard_hand_card_then_search_deck',
        optional: true,
        discard: { name_includes: 'Tridente' },
        search: { name_includes: 'Atlantis' },
      },
    ],
  },
  {
    id: 6,
    nome: 'Pirata Afogado',
    raca: 'Zumbi',
    ataque: 1,
    vida: 2,
    efeito: 'Quando esta criatura é destruída, cause 1 de dano a criatura que a destruiu.',
    elemento: 'agua',
    raridade: 'comum',
    img: '06.png',
    edicao: 'Abismos & Profundezas',
    triggeredAbilities: [
      {
        id: 'pirata_afogado_revenge_damage',
        trigger: 'destroyed_by_creature',
        action: {
          type: 'deal_damage_to_destroyer',
          damage: 1,
        },
      },
    ],
  },
  {
    id: 7,
    nome: 'Sapomerlim, Mago dos Contos',
    raca: 'Anfibio',
    ataque: 2,
    vida: 3,
    efeito: 'Sempre que o elemento desta criatura for alterado, você pode escolher uma criatura do tipo anfíbio que você controla, o elemento dela pode ser alterado para um elemento a sua escolha até o fim do turno.',
    elemento: 'agua',
    raridade: 'rara',
    img: '07.png',
    edicao: 'Abismos & Profundezas',
    triggeredAbilities: [
      {
        id: 'sapomerlim_change_anfibio_element',
        trigger: 'self_element_changed',
        action: {
          type: 'choose_your_creature_change_element_until_end_turn',
          filter: { race: 'Anfibio' },
        },
      },
    ],
  },
  {
    id: 8,
    nome: 'O mímico do Baú',
    raca: 'Demônio',
    ataque: 2,
    vida: 2,
    efeito: 'Quando esta criatura for enviada para o seu descarte, você pode escolher uma critura que você controla, após coloque um marcador +1/+1 nela.' ,
    elemento: 'agua',
    raridade: 'comum',
    img: '08.png',
    edicao: 'Abismos & Profundezas',
    triggeredAbilities: [
      {
        id: 'mimico_marker_on_discard',
        trigger: 'sent_from_field_to_your_discard',
        action: {
          type: 'add_marker_to_your_creature',
          stats: ['attack', 'defense'],
          value: 1,
        },
      },
    ],
  },
  {
    id: 28,
    nome: 'Lobo do Uivo sombrio',
    raca: 'Besta',
    ataque: 1,
    vida: 3,
    efeito: 'Sempre que outra criatura com Lobo em seu nome entrar em campo sob seu controle, coloquei um marcador +1/+1 nesta criatura.' ,
    elemento: 'terra',
    raridade: 'rara',
    img: '28.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'lobo_uivo_marker_on_lobo_enter',
        trigger: 'other_creature_enters',
        filter: { name_includes: 'Lobo' },
        action: {
          type: 'add_permanent_marker',
          target: 'self',
          stats: ['attack', 'defense'],
          value: 1,
        },
      },
    ],
  },
  {
    id: 29,
    nome: 'Lobo das Presas Prateadas',
    raca: 'Besta',
    ataque: 2,
    vida: 1,
    efeito: 'Quando esta criatura for enviada do campo para o seu descarte, você pode invocar outra criatura com nome "Lobo das Presas Prateadas" do seu baralho.' ,
    elemento: 'terra',
    raridade: 'comum',
    img: '29.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'lobo_presas_summon_copy',
        trigger: 'sent_from_field_to_your_discard',
        action: {
          type: 'summon_from_deck',
          filter: { name: 'Lobo das Presas Prateadas' },
          count: 1,
        },
      },
    ],
  },
  {
    id: 30,
    nome: 'Badur, o Bebê Urso',
    raca: 'Besta',
    ataque: 0,
    vida: 2,
    efeito: 'Sacrifique esta criatura: Você pode invocar uma criatura de nome "Badur, o Urso Guardião" do seu descarte.',
    elemento: 'terra',
    raridade: 'comum',
    img: '30.png',
    edicao: 'Matilhas & Predadores',
    activatedAbilities: [
      {
        id: 'badur_bebe_sacrifice',
        source: 'field_creature',
        cost: { type: 'sacrifice_self' },
        action: {
          type: 'summon_from_discard',
          filter: { name: 'Badur, o Urso Guardião' },
          count: 1,
        },
      },
    ],
  },
  {
    id: 31,
    nome: 'Badur, o Urso Guardião',
    raca: 'Besta',
    ataque: 2,
    vida: 5,
    efeito: 'Enquanto esta criatura estiver em campo, outras criaturas do tipo besta e do elemento Terra que você controla recebem -1 de dano de combate. Sempre que outra criatura do tipo Besta que você controla for enviada do campo para o seu descarte, coloque um marcador +1/+1 nesta criatura.',
    elemento: 'terra',
    raridade: 'lendaria',
    img: '31.png',
    edicao: 'Matilhas & Predadores',
    effects: [
      {
        type: 'reduce_combat_damage_taken',
        target: 'other_your_creatures',
        filter: { race: 'Besta', element: 'terra' },
        value: 1,
      },
    ],
    triggeredAbilities: [
      {
        id: 'badur_guardiao_marker_on_besta_discard',
        trigger: 'other_creature_sent_to_your_discard',
        filter: { race: 'Besta' },
        action: {
          type: 'add_permanent_marker',
          target: 'self',
          stats: ['attack', 'defense'],
          value: 1,
        },
      },
    ],
  },
  {
    id: 32,
    nome: 'Feiticeiro Tribal Badur',
    raca: 'Orc',
    ataque: 2,
    vida: 2,
    efeito: 'Uma vez por turno do oponente, você pode escolher uma criatura inimiga e uma criatura do tipo Besta que você controla.  Neste turno, a criatura inimiga escolhida deve atacar a criatura escolhida , se possivel.',
    elemento: 'terra',
    raridade: 'comum',
    img: '32.png',
    edicao: 'Matilhas & Predadores',
    activatedAbilities: [
      {
        id: 'feiticeiro_tribal_forcar_ataque',
        timing: 'once_per_turn',
        source: 'field_creature',
        condition: { active_player: 'opponent' },
        action: {
          type: 'force_enemy_attack_your_creature',
          yourFilter: { race: 'Besta' },
        },
      },
    ],
  },
  {
    id: 33,
    nome: 'Sapotristan, o Escudeiro dos Contos',
    raca: 'Anfibio',
    ataque: 1,
    vida: 3,
    efeito: 'Sempre que o elemento desta criatura for alterado você pode escolher uma criatura com "Contos" em seu nome. Troque o ATQ e a VIDA dela enquanto o elemento dela estiver alterado. Se essa criatura for destruida enquanto seu elemento estiver alterado, compre uma carta.',
    elemento: 'terra',
    raridade: 'rara',
    img: '33.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'sapotristan_swap_contos',
        trigger: 'self_element_changed',
        action: {
          type: 'choose_creature_swap_stats_while_element_changed',
          filter: { name_includes: 'Contos' },
        },
      },
    ],
  },
   {
    id: 34,
    nome: 'Poltergeist, Voz do Vácuo',
    raca: 'Espectro',
    ataque: 1,
    vida: 2,
    efeito: 'Quando esta critura for enviada para o seu descarte, você pode escolher uma criatura inimiga. Ela nao pode atacar no próximo turno do seu  controlador.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '34.png',
    edicao: 'Matilhas & Predadores',
    triggeredAbilities: [
      {
        id: 'poltergeist_prevent_enemy_attack',
        trigger: 'sent_from_field_to_your_discard',
        action: {
          type: 'choose_enemy_creature_prevent_attack_next_turn',
        },
      },
    ],
  },
   {
    id: 35,
    nome: 'Ceifador do castelo Amaldiçoado',
    raca: 'Espectro',
    ataque: 2,
    vida: 3,
    efeito: 'Ao entrar no campo, você pode escolher uma criatura do tipo Espectro no seu descarte e embaralhar devolta ao seu baralho. Se fizer isso, escolha uma criatura inimiga, ela recebe - ATQ igual ao ATQ da criatura embaralhada até o fim do turno. Quando essa criatura for enviada do campo par o seu descarte, crie uma ficha de criatura Espectro 1/1 (Elemento: Vazio).',
    elemento: 'vazio',
    raridade: 'rara',
    img: '35.png',
    edicao: 'Matilhas & Predadores',
    onEnter: [
      {
        type: 'shuffle_discard_creature_then_debuff_enemy',
        discardFilter: { race: 'Espectro' },
        debuff: { stat: 'attack', value_from: 'shuffled_card_attack', duration: 'until_end_of_turn' },
      },
    ],
    triggeredAbilities: [
      {
        id: 'ceifador_summon_token_on_discard',
        trigger: 'sent_from_field_to_your_discard',
        action: {
          type: 'summon_token',
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
      },
    ],
  },
   {
    id: 36,
    nome: 'Mamuthe Ancestral',
    raca: 'Besta',
    ataque: 0,
    vida: 5,
    efeito: 'Ao entrar no campo, você pode enviar duas cartas do topo do seu baralho para o seu descarte, Após recebe +1 de VIDA para cada elemento diferente entre as cartas do seu descarte.',
    elemento: 'vazio',
    raridade: 'comum',
    img: '36.png',
    edicao: 'Matilhas & Predadores',
    onEnter: [
      {
        type: 'mill_then_gain_defense_per_discard_element',
        mill: 2,
        value: 1,
      },
    ],
  },
]
