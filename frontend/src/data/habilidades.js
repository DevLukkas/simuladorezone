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
    id: 14,
    nome: 'Chama Devastadora',
    tipo: 'Ataque',
    efeito: 'Causa 800 de dano direto ao oponente.',
    elemento: 'fogo',
    raridade: 'rara',
    img: '14.png',
    edicao: 'Base',
  },
  {
    id: 15,
    nome: 'Cura da Floresta',
    tipo: 'Cura',
    efeito: 'Restaura 600 de vida ao jogador que a usa.',
    elemento: 'terra',
    raridade: 'comum',
    img: '15.png',
    edicao: 'Base',
  },
  {
    id: 16,
    nome: 'Raio Celestial',
    tipo: 'Ataque',
    efeito: 'Destrói uma criatura do oponente com até 1500 de vida.',
    elemento: 'cosmico',
    raridade: 'comum',
    img: '16.png',
    edicao: 'Base',
  },
  {
    id: 17,
    nome: 'Vento Cortante',
    tipo: 'Controle',
    efeito: 'Retorna uma criatura do campo do oponente para a mão dele.',
    elemento: 'vento',
    raridade: 'comum',
    img: '17.png',
    edicao: 'Base',
  },
]
