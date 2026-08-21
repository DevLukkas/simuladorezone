/**
 * A versão do jogo, carimbada em toda partida arquivada (decisão nº 44).
 *
 * Ela existe por um motivo só: a fita do replay é um SNAPSHOT, não uma
 * reexecução, então quem a assiste precisa saber com que motor ela foi gravada.
 * "Esse combate resolveu errado" e "esse combate resolvia assim em agosto" são
 * respostas diferentes, e sem o carimbo não dá para distinguir uma da outra.
 *
 * Suba a versão quando REGRA, evento ou formato de carta mudar — é o que torna
 * o carimbo informativo. Mudança de cor de botão não precisa.
 */
export const GAME_VERSION = '0.2.0';
