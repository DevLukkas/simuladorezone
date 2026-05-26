/**
 * Cartas do tipo COMANDO
 *
 * Comandos são ordens táticas sem elemento.
 * Têm efeito imediato ao serem jogados e vão para o descarte.
 *
 * Campos:
 *   id       — número único da carta
 *   nome     — nome da carta
 *   tipo     — subtipo do comando (ex: Tático, Reação, Ordem...)
 *   efeito   — descrição do efeito
 *   raridade — comum | rara | lendaria
 *   img      — nome do arquivo em /assets/cards/
 *   edicao   — nome da edição/expansão
 */
export const comandos = [
  {
    id: 21,
    nome: 'Riso Histérico de Tashaa O',
    tipo: 'Comando',
    efeito: 'Uma criatura inimiga alvo , nao pode atacar neste turno.',
    raridade: 'comum',
    img: '21.png',
    edicao: 'Abismos & Profundezas',
  },
  {
    id: 22,
    nome: 'Escolha as Cegas',
    tipo: 'Comando',
    efeito: 'Descarte todas as cartas da sua mão, em seguida compre a mesma quantidade descartada por este efeito.',
    raridade: 'lendaria',
    img: '22.png',
    edicao: 'Abismos & Profundezas',
  },
   {
    id: 23,
    nome: 'Marionete de Guerra',
    tipo: 'Comando',
    efeito: 'Escolha uma criatura inimiga alvo , até o proximo turno dela deve atacar uma criatura a sua escolha.',
    raridade: 'comum',
    img: '23.png',
    edicao: 'Abismos & Profundezas',
  },
  {
    id: 24,
    nome: 'Olo do Antigo Oráculo',
    tipo: 'Comando',
    efeito: 'Seu oponente revela duas cartas aleatoras da sua mão, você escolhe uma para ser embaralha de volta em seu baralho.',
    raridade: 'comum',
    img: '24.png',
    edicao: 'Abismos & Profundezas',
  },
  {
    id: 25,
    nome: 'Ritual da Esfera Espectral',
    tipo: 'Comando',
    efeito: 'Sacrifique uma criatura que você controle: invoque até duas criaturas do tipo Espectro do seu baralho com ATQ 2 ou menor. Criaturas invocadas por este efeito não podem atacar no turno que são invocadas.',
    raridade: 'rara',
    img: '25.png',
    edicao: 'Abismos & Profundezas',
  },
  {
    id: 26,
    nome: 'Lua Sangrenta de Esdras',
    tipo: 'Comando',
    efeito: 'Esolha uma criatura que você controle: Ela recebe +1/+1 até o fim do seu turno, para cada criatura de nome Esdras em seu descarte..',
    raridade: 'comum',
    img: '26.png',
    edicao: 'Abismos & Profundezas',
  },
  {
    id: 27,
    nome: 'Alterando as Rotas',
    tipo: 'Comando',
    efeito: 'Escolha uma criatura que você controle: ela não pode ser alvo de ataques neste turno.',
    raridade: 'comum',
    img: '27.png',
    edicao: 'Abismos & Profundezas',
  },
]
