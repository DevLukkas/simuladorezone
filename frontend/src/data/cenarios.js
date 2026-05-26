/**
 * Cartas do tipo CENÁRIO
 *
 * Cenários alteram as regras do campo enquanto estiverem em jogo.
 * Não têm elemento pois afetam o campo todo, não criaturas específicas.
 *
 * Campos:
 *   id       — número único da carta
 *   nome     — nome da carta
 *   tipo     — subtipo do cenário (ex: Natural, Urbano, Dimensional...)
 *   efeito   — descrição do efeito contínuo
 *   raridade — comum | rara | lendaria
 *   img      — nome do arquivo em /assets/cards/
 *   edicao   — nome da edição/expansão
 */
export const cenarios = [
  {
    id: 45,
    nome: 'Caverna do Guardião Badur',
    tipo: 'Cenário',
    efeito: 'quando uma criatura do tipo Besta que você controla for enviada do campo para o descarte, criaturas de nom "Badur, o Urso Guardião" recebem +1 de ATQ até o final do turno. A primeira vez que uma criatura inimiga for destruída em combate a cada turno, você pode comprar uma carta.',
    raridade: 'rara',
    img: '45.png',
    edicao: 'Matilhas & Predadores',
  },

]
