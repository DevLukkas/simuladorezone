# Decisões — Ezone TCG

Registro numerado do porquê de cada decisão. Nunca apague; se mudar, escreva uma nova
decisão apontando para a antiga.

## 1. Reescrita completa na stack da casa (2026-08-12)

O protótipo legado (Laravel + Phaser) tem o motor de regras entrelaçado numa cena de 7.206
linhas, com `await` de modais no meio da resolução de efeitos, e o online é espelhamento de
eventos sem autoridade de servidor. Decidido com o time: reescrever em TypeScript no padrão
dos outros projetos (engine puro + servidor Node zero-dep + React), no mesmo repo, pasta
`jogo/`, mantendo o legado como especificação até a paridade. Escopo v1: PvP ao vivo
autoritativo, contas/coleção/decks, salas+fila, treino vs bot. Alvo: desktop browser.

## 2. SSE + POST em vez de WebSocket (2026-08-12)

O jogo é por turnos; o cliente só precisa de push servidor→cliente (ações do oponente) e de
um canal comum de comandos. `EventSource` + `node:http` dão push com reconexão automática e
re-entrega via `Last-Event-ID`, sem nenhuma dependência — WebSocket exigiria lib externa ou
implementação de handshake/frames à mão. Se um dia houver recurso de tempo real contínuo
(cronômetro sincronizado ao décimo de segundo, drag ao vivo), reavaliar.

## 3. Schema declarativo das cartas mantido, dualidade PT/EN eliminada (2026-08-12)

Os blocos `effects`/`triggeredAbilities`/`activatedAbilities`/`onEnter`/`onAttach` do legado
foram mantidos com o mesmo vocabulário (é o design das 45 cartas, validado em jogo), mas
agora tipados como uniões estritas em `src/data/tipos.ts`. Os campos duplicados
(`nome`/`name`, `ataque`/`attack`, lidos com `??` no legado) viraram um campo canônico único
em português. Texto impresso das cartas (`efeito`) preservado byte a byte, typos incluídos —
corrigir texto de carta é decisão de produto, não de código.

## 4. Deck: máximo 40, até 3 cópias, herói obrigatório, mínimo 1 (2026-08-12)

Paridade com o `DeckController` do legado, que só exigia deck não-vazio. Um mínimo real de
cartas (ex.: 20 ou 40 exatas) muda o metagame e fica pendente de decisão do DevLukkas.

## 5. Pendências herdadas do legado, adiadas para o milestone de paridade (2026-08-12)

- ~7 tipos de efeito e ~6 gatilhos declarados nas cartas nunca tiveram implementação
  (ids 7, 11, 13, 14, 18, 33 e parte de 29/34/35).
- Heróis Tennor, Gimlou e Morgon só têm texto; Gimlou menciona "Goblin aliado" e não existe
  criatura Goblin no catálogo — precisa de design.
- Mysticus (id 3): o texto promete anular ativação de habilidade do oponente, mas o bloco
  declarativo do legado só modela o custo e a restrição de ataque. Modelado igual; a anulação
  é design pendente.

## 6. Esclarecimentos de regra na reescrita do motor (2026-08-12)

Comportamentos que no legado dependiam de qual cliente rodava o código e que aqui
ficaram simétricos e uniformes (o motor não distingue "meu lado" de "lado do bot"):

- `sent_to_your_discard` (Mímico) dispara para QUALQUER dono, inclusive quando o
  descarte veio de efeito do oponente (Tridente de Atlas em dobro, Escolha às
  Cegas). No legado só disparava para o jogador local.
- Descarte por estouro de mão (8+) NÃO dispara gatilhos de descarte (paridade).
- Afogamento pode destruir a criatura ao reduzir a vida a 0 (o legado deixava a
  criatura em campo com vida ≤ 0 — tratado como bug).
- Custo de habilidade ativada só é pago se a ação puder resolver (o legado
  sacrificava o Bebê Urso mesmo sem Badur no descarte — tratado como bug).
- Marionete de Guerra e Feiticeiro Tribal (forçar ataque) não têm efeito sob a
  regra de ataque por coluna — igual ao legado, onde os campos eram gravados e
  ignorados. Redesenhar as duas cartas ou a regra é decisão de produto.
- Janelas de resposta (comandos/habilidades no turno do oponente, 7s no legado
  solo) ficam para depois do PvP básico; a Proteção do Escudeiro — a única
  reação essencial ao combate — já funciona como pendência do defensor.

## 7. Decks prontos no construtor (2026-08-12)

Os 4 baralhos iniciais do legado (`backend/config/starter_decks.php`) foram portados para
`src/data/decksProntos.ts` e aparecem num select do editor de deck: escolher um preenche
nome, herói e cartas, tudo editável em seguida. Duas adaptações em relação ao legado:

- O legado escolhia starter (StarterDeckScene) e herói em fluxos separados; aqui cada deck
  pronto sugere o herói do seu elemento — água→Ispisher, terra→Badur, fogo→Gimlou e
  vento→Tennor (não há herói de vento; Tennor é neutro e sinergiza com habilidades).
- O starter de fogo trazia 4 cópias da carta 34; o seeder legado gravava direto no banco,
  sem passar pela validação do DeckController. Aqui a 4ª cópia foi capada em 3 para o deck
  obedecer à regra (decisão nº 4).

## 8. Janela de reação pós-jogada, com prazo curto (2026-08-12)

Retoma a pendência da decisão nº 6: o legado solo oferecia 7 segundos para responder à
jogada do bot (comando da mão após invocar/anexar/atacar; habilidade de criatura ao
iniciar a fase de batalha). Na reescrita isso virou mecânica do motor, simétrica e válida
também no PvP:

- A jogada do lado ativo agenda uma `JanelaDeReacao`; ela só vira pendência do oponente
  quando a fila de efeitos esvazia — é reação PÓS-jogada (a ação já resolveu), não uma
  interrupção em pilha, igual ao legado.
- Só entram na oferta comandos que podem resolver (alvo disponível quando exigido) e
  habilidades cujo custo é pagável e cuja ação o motor implementa — oferta vazia = nenhuma
  janela, nenhum atraso.
- A pendência carrega `reacao: true`: o servidor arma 7s (`SEGUNDOS_DE_REACAO`) em vez dos
  60s do turno e recusa sozinho no estouro (evento `REACAO_RECUSADA`, sem contar como
  passe de W.O.); o treino faz o mesmo no cliente. Recusar emite evento para destravar a
  visão do atacante, que fica bloqueado enquanto a janela está aberta.
- O bot recusa toda janela de reação (paridade com o soloAi, que nunca reagia).
- A condição `active_player: 'opponent'` (Feiticeiro Tribal) agora significa "só em
  reação"; a ação dele continua pendente de design (decisão nº 6).

## 9. A arte impressa passa a ser a fonte de verdade das regras (2026-08-13)

Pedido do DevLukkas: ler as 45 artes em `public/assets/cards/` e implementar o que elas
dizem. Onde o texto herdado do legado divergia da carta impressa, a ARTE venceu — o que
revoga, nesses pontos, a paridade com o legado da decisão nº 3/invariante 7. O campo
`efeito` de cada carta divergente foi reescrito com o texto da arte (os typos do legado
saíram junto). Divergências corrigidas:

- **Azzure (1)**, **Badur, o Urso Guardião (31)**, **Esfera da Aura Espectral (17)** e
  **Guardião Enlouquecido (39)**: a arte diz "OUTRAS criaturas"/"cada OUTRO"; a fonte do
  efeito agora fica de fora (`exclude_source` / `exclude_holder`). Azzure não se buffa
  mais, Badur não reduz o próprio dano, a Esfera não conta o portador, o Guardião não
  buffa quem atacou.
- **Mamuthe Ancestral (36)**: a arte é "Uma vez por turno, você pode enviar as 2 cartas do
  topo" — habilidade ATIVADA repetível, não um `onEnter` de uma vez só.
- **Resistência (44)**: a arte reduz o dano só "na primeira vez que ela receber dano a cada
  turno" (`once_per_turn`), não em todo golpe. Mantida como redução de dano de COMBATE
  (é o que o motor modela); dano de efeito continua passando inteiro.
- **Caverna do Guardião Badur (45)**: a arte não exige controlar o Urso para comprar na
  primeira destruição em combate — o `requiresYourCreature` do legado caiu. E o primeiro
  parágrafo, que o legado nunca modelou, virou efeito de cenário
  (`buff_named_on_your_creature_to_discard`).

## 10. Gatilhos declarados e nunca resolvidos, agora implementados (2026-08-13)

Fecha a maior parte da pendência da decisão nº 5. O sintoma que abriu o assunto: o
Ceifador (35) ia ao descarte depois da batalha e não criava a ficha, porque
`sent_from_field_to_your_discard` nunca era despachado.

- `sent_from_field_to_your_discard` (Lobo das Presas Prateadas 29, Poltergeist 34,
  Ceifador 35): entra no MESMO lote do `sent_to_your_discard`, então dois gatilhos da
  mesma leva viram escolha de ordem. Ações novas: `summon_token` (automático — a arte diz
  "crie", não "você pode") e `summon_from_deck` (opcional). Um gatilho só entra na corrente
  se puder resolver (ficha precisa de slot, busca precisa de cópia no deck).
- `self_element_changed` (Sapomerlim 7, Sapotristan 33). O Sapomerlim não pode mirar a si
  mesmo — sem isso a corrente de troca de elemento não terminaria. O elemento emprestado é
  temporário de verdade (`elementoAlteradoAteTurno`), varrido no fim do turno.
- Sapotristan (33): a troca de ATQ/VIDA vale "enquanto o elemento estiver alterado"
  (`trocaDeStatsComElementoAlterado`, aplicada em `statsAtuais` antes do dano) e a compra
  ao morrer só acontece se o elemento ainda estiver alterado.
- `attached_creature_is_attacked` (Reflexos de Morte 13): dispara com a lista de anexos
  PRÉ-batalha, então vale mesmo se a criatura morreu no golpe.
- `attached_creature_deals_player_damage` (Mapa do Tesouro 18): vale no ataque direto e no
  excedente de ATROPELAR.
- `chosen_enemy_creature_dies` (Afogamento 14): o anexo guarda o uid da criatura que mirou
  e cai no descarte quando ela morre.
- `special_summon_over_your_creature` (Leviathan 4): descarta-se da mão, escolhe a criatura
  a ser coberta (vai ao descarte sem pontuar) e invoca da mão a cópia de Esdras. O custo só
  é pago se houver criatura em campo E carta compatível na mão (mesma regra da decisão nº 6).

Continuam pendentes de DESIGN, não de implementação:

- **Mysticus (3)**: anular a ativação de uma carta de habilidade do oponente exige uma
  mecânica de contra-magia que o motor não tem. Segue modelado só o custo + a restrição de
  ataque (decisão nº 5).
- **Marionete de Guerra (23)** e **Feiticeiro Tribal Badur (32)**: forçar alvo não faz nada
  sob a regra de ataque por coluna (decisão nº 6).
- **Defesa Absoluta do Tridente (11)**: `self_exiled` nunca dispara porque nada no jogo
  exila cartas — a zona `exilio` existe e fica sempre vazia.
- **Afogamento (14)**: a arte diz "a criatura ANEXADA recebe -1 VIDA para cada anexo ligado
  a ela", mas só dá para anexar em criatura própria — ao pé da letra a carta seria só
  prejuízo. Mantido o comportamento do legado (escolher uma criatura inimiga e debuffá-la).
  Rebalancear a carta ou liberar anexo em criatura inimiga é decisão de produto.

## 11. Quatro Elementos entra como formato paralelo, sem derrubar o clássico (2026-08-13)

O Figma "TCG - Games" não contém as 45 cartas do jogo: o frame `Baralhos - Iniciais
(Quatro Elementos)` traz OUTRO conjunto, com nomes, raças, palavras-chave e mecânicas
próprias — zero nomes em comum com o clássico. É um desenho de jogo novo, não uma revisão
de arte, e o DevLukkas adotou-o como direção sem aposentar o que já roda.

Por isso `Formato = 'classico' | 'quatro-elementos'` vive no `EstadoDoJogo` e não em
variável de build: servidor e cliente precisam concordar por partida, e o replay
determinístico depende disso. O formato de uma carta é o da sua `edicao` (não há campo
redundante), decks não misturam formatos, e cada formato ocupa uma faixa contígua de ids
(clássico 1..45, Quatro Elementos a partir de 46). Quando um dos dois for descartado,
apagar o membro da união faz o compilador apontar tudo que sai junto.

## 12. As 33 cartas do Quatro Elementos entram como catálogo, sem comportamento (2026-08-13)

Importadas do frame do Figma: 13 criaturas, 5 itens, 10 habilidades e 5 comandos, nos 3
baralhos iniciais desenhados lá (30 cartas cada, com 3x/2x por carta). Identidade completa
e conferida contra o print do DevLukkas; comportamento nenhum.

De onde veio cada campo, porque o Figma esconde metade deles fora do grupo da carta:

- **nome, ATQ/VIDA, texto, ref**: nós de texto da instância do molde. Os nomes vinham em
  caixa inconsistente ("wargh", "Éria, RAINHA HARPIA", "CAtapulta") e foram normalizados
  para o padrão do catálogo; o resto é verbatim, typos inclusive.
- **raça e raridade**: ficam FORA do grupo, só sobrepostas visualmente. A raça é o texto da
  pill (o de dentro do grupo é o placeholder "planta" em todas as 33 — foi o que enganou a
  primeira extração). A raridade é a COR do losango: `#701b1b` = rara, `#e2c5c0` = comum,
  e só as 18 criaturas a marcam, porque é a raridade delas que vale ponto ao serem
  destruídas em batalha.
- **elemento**: o bitmap do hexágono, também fora do grupo. Cinco distintos, batendo com a
  paleta do clássico: baralho A = vento, baralho B = fogo, Cacheralossauro = terra, itens =
  neutro (o manual diz que item É neutro) e comandos = símbolo de comando.

O que ficou pendente, e por quê:

- **Comportamento das 33** (`efeitoPendente: true`): os textos dependem de mecânicas que o
  motor não tem — exilar (a zona existe e nunca é usada), recrutar do baralho/descarte,
  contadores, revelar, inverter buff em debuff, carta que "é considerada" outra pelo nome.
  Sem bloco declarativo a carta é baunilha: entra em deck e aparece na coleção, e o motor
  não a oferece nem resolve nada dela (comando sem `effects` já era filtrado por
  `comandosJogaveis`). Apagar a marca ao implementar mantém a conta honesta no teste.
- **MARCIAL, VORPAL e REGENERAR**: sem definição em lugar nenhum — o mini-manual só define
  AGRESSIVO. O DevLukkas vai definir e enviar (pedido dele, 2026-08-13).
- **Arte**: as ilustrações só existem como nós do Figma e exportá-las exige token com
  escopo `file_content:read` (o do histórico perdeu o escopo). `img` virou opcional; sem
  arte, a carta só renderiza no modo composto — que é justamente o que a decisão anterior
  preparou. *Resolvido na decisão nº 14.*
- **Códigos GES-0001..0004 se repetem** entre cartas no Figma; entraram como estão.
- **Baralhos iniciais** não viraram decks prontos: o número de cópias extraído (31/30/30)
  não fecha com o cabeçalho do quadro (30 cada), então falta acertar 1 carta do baralho A.

## 13. MARCIAL, VORPAL e REGENERAR: palavra-chave é campo declarado (2026-08-13)

O DevLukkas fechou as três definições que faltavam (decisão nº 12 as deixava em aberto):

- **MARCIAL** — ataca primeiro; se matar a criatura oposta, não sofre dano.
- **VORPAL** — se destruir a criatura inimiga, causa seu ataque original no oponente como
  dano adicional.
- **REGENERAR** — recupera 1 de vida no início do seu turno.

Como entraram no motor, e o que precisou de leitura (as três definições são de uma linha;
o resto abaixo é interpretação minha, e é o primeiro lugar a mexer se alguma estiver errada):

- **Modelo**: `palavrasChave?: PalavraChave[]` na carta de criatura, não parsing do texto
  impresso como o `temAptidao` do legado. Carta é dado (invariante nº 5); o motor pergunta
  por `temPalavraChave`, que soma a palavra impressa às concedidas por anexo
  (`grant_keyword`) — `atropelar` passou a ser consultada pelo mesmo caminho. Um teste de
  integridade exige que texto impresso e campo declarado digam a mesma coisa, e barra
  palavra nova em caixa alta sem definição no motor.
- **MARCIAL vale atacando E defendendo.** "Ataca primeiro" descreve o caso de ataque, mas
  o manual diz que "ataques são simultâneos" e é justamente a simultaneidade que dá sentido
  a "não sofre dano" — num motor assim, first strike só de ataque seria letra morta na
  metade das batalhas. Com a palavra dos dois lados ninguém antecipa e o dano volta a ser
  simultâneo. O golpe que não mata continua sendo revidado normalmente.
- **VORPAL usa o ATQ IMPRESSO** ("ataque original"), não o modificado por anexos, auras ou
  marcadores, e o dano vai no dono da criatura destruída — dano direto, contando para os 5
  que valem 1 ponto. Dispara nos dois papéis, pela mesma leitura do MARCIAL, e mesmo que a
  portadora tenha caído no mesmo golpe (igual ao excedente de `atropelar`).
- **REGENERAR** cura 1 de dano no início do turno do dono, antes do efeito do herói; não
  passa da vida impressa e não faz nada em criatura intacta.
- **Ordem dos golpes e reduções**: `danoAposReducao` gasta a redução 1x-por-turno
  (Resistência), então o cálculo virou preguiçoso — o golpe que MARCIAL cancela não
  consome mais a redução do alvo, que era o que aconteceria calculando os dois danos
  antes de aplicar.

As 6 cartas com palavra impressa (46, 51, 63 e 77 MARCIAL; 47 VORPAL; 50 REGENERAR) seguem
com `efeitoPendente: true`: a palavra vale em jogo, o parágrafo em prosa continua devendo —
inclusive o texto repetido nas 4 de MARCIAL, que é placeholder da extração do Figma e ainda
espera o texto real do DevLukkas.

A fumaça (`npm run sim`) passou a rodar os DOIS formatos, agora que o Quatro Elementos tem
regra ativa: 200 partidas cada, e as três palavras aparecem de fato nas partidas do bot.

## 14. Ilustração é campo próprio, e a do Quatro Elementos vem do nó do Figma (2026-08-13)

Com o token novo (escopo `file_content:read`), as 33 ilustrações do Quatro Elementos saíram
do Figma e a pendência de arte da decisão nº 12 fechou. Duas escolhas no caminho:

- **A fonte é o nó da arte, não a carta inteira.** Exportar a instância do `Relvus` seria o
  atalho — daria uma "carta impressa" como as 45 clássicas —, mas sairia errada: raça,
  raridade e elemento ficam FORA do grupo da carta no Figma (só sobrepostos visualmente), e
  dentro do grupo o subtítulo é o placeholder "planta" em todas. O retângulo 382x476 com
  fill de imagem é a ilustração limpa, e a identidade correta já está no catálogo — quem a
  desenha é a carta composta. Por isso o Quatro Elementos segue sem modo "arte impressa":
  não existe carta impressa dessas 33, e `img` continua ausente nelas.
- **`arte` virou campo, em vez de derivar de `img`.** Antes a ilustração era o nome de `img`
  com a extensão trocada, o que só funciona quando ela é recorte da carta impressa. Agora as
  duas procedências convivem: no clássico `arte` fica ausente e o caminho é derivado como
  sempre; no Quatro Elementos `arte` aponta o arquivo baixado do Figma. Quem resolve isso é
  `caminhoDaArte`, um lugar só, usado pela carta na mão/campo e pela ampliada.

O recorte (`scripts/arte4e.ts`) é a janela que a carta composta mostra — x 22..393, y 16..340
do molde —, então o `object-fit: cover` não tem o que cortar e a ilustração cai onde o Figma
a desenhou. Medido no navegador: clássica e nova ocupam a mesma caixa (x22 y16 371x324), com
proporções de origem 1,1455 e 1,1486.
