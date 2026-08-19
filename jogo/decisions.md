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

## 15. Código todo em inglês, inclusive o banco (2026-08-14)

Pedido do DevLukkas: o projeto estava metade em português (identificadores, arquivos,
valores de união, colunas) e metade em inglês (o vocabulário de efeitos herdado das
cartas). Agora é inglês em tudo que é código — arquivos (`estado.ts` → `state.ts`,
`Tabuleiro.tsx` → `Board.tsx`, `componentes/` → `components/`…), identificadores,
valores de união (`'criatura'` → `'creature'`, `'fogo'` → `'fire'`, raças, formatos,
eventos, comandos), rotas da API (`/api/partidas` → `/api/matches`) e esquema do banco.

Isto REVOGA a decisão nº 3 na parte em que ela fixava os campos da carta em português.
O texto impresso da carta (`text`) e os nomes próprios (cartas, heróis, edições)
continuam em pt-BR: são conteúdo, não código.

O banco migra na leva 4 (`server/schema.ts`), com `ALTER TABLE ... RENAME`: contas,
sessões, decks e salas atravessam a virada com os dados. Partidas em andamento, não —
o `estado_json` gravado tem a forma antiga do `GameState` e não teria como ser retomado,
então a migração esvazia `partidas`/`partida_eventos` antes de renomeá-las. As levas
1–3 ficaram intactas (a regra do arquivo é nunca editar leva antiga).

## 16. i18n: o motor devolve chave, o cliente escolhe o idioma (2026-08-14)

Três idiomas de cara — pt-BR, en-US e es-ES —, escolhidos pelo idioma do sistema
(`navigator.languages`, com fallback pt-BR) e trocáveis no seletor da tela de entrada e
do menu. O que isso exigiu do desenho, e que é a parte que interessa:

- **Nenhuma frase nasce no motor.** `reduce` devolve `ErrorCode` (`'not_your_turn'`),
  pendências carregam `TextRef` (`{ key, params }`), e o registro da partida é uma lista
  de `TextRef`. O servidor responde `{ error: TextRef, details?: TextRef[] }`. Um só
  estado de partida serve dois jogadores em idiomas diferentes.
- **Chave conferida pelo compilador.** `TextKey` é derivada do dicionário pt-BR, e
  `ErrorCode` é derivada das chaves `error.*` — código inexistente não compila, e
  `en-US`/`es-ES` são tipados contra o pt-BR, então tradução faltando também não compila.
- **Carta é conteúdo, não interface.** Nome e texto impressos continuam no catálogo em
  pt-BR (fonte); cada idioma sobrescreve por id (`cards[31].text`). Os dois mapas de
  sobrescrita nasceram vazios — o jogador em inglês lia a carta em português — e foram
  preenchidos na decisão nº 18.
- Palavra-chave, elemento, raça, raridade, tipo, herói e ficha viraram chave + nome no
  dicionário. É por isso que o teste de integridade compara a palavra impressa na arte
  com `pt-BR.keyword.*`: a arte é pt-BR, o identificador é inglês.

## 17. Vocabulário de efeitos normalizado, e AGRESSIVO no lugar de "Aptidão" (2026-08-14)

Eram sete uniões de ação (gatilho, ativada, entrada, anexo, comando, cenário, contínua)
com nomes que embutiam o alvo (`choose_enemy_creature_then_deal_damage`), duplicatas
(`choose_enemy_creature_prevent_attack_next_turn` **e**
`choose_enemy_creature_then_prevent_attack`) e o "opcional" colado no nome
(`optional_draw_cards`). Carta nova quase sempre pedia handler novo — o oposto do que o
formato declarativo promete.

Agora são três listas fechadas, em `src/data/types.ts`:

- **`TriggerType` — quando.** Sujeito na primeira palavra: `self_*` (a própria carta),
  `host_*` (a criatura que carrega o anexo), `ally_*` (outra criatura sua),
  `chosen_*` (a criatura que esta carta escolheu antes).
- **`ActionTarget` — em quem.** `self`, `host`, `trigger_source`, `destroyer`,
  `chosen_ally`, `chosen_enemy`, `all_allies`. O alvo do comando é o mesmo
  `chosen_ally`/`chosen_enemy` — a escolha só acontece no tabuleiro em vez de numa
  pendência.
- **`Action` — o quê.** União única usada por gatilho, habilidade ativada, `onEnter`,
  `onAttach` e comando: um handler por tipo, e qualquer gancho pode usar qualquer ação.
  `optional: true` é modificador, não nome — é ele que faz o motor perguntar "você pode…".

Efeito contínuo (aura, `modify_stat`, redução de dano, `grant_keyword`) segue uma união
à parte de propósito: é recalculado, não executado. O cenário ainda tem dois efeitos
próprios, com nomes no padrão novo; vira `triggeredAbilities` quando houver mais cartas
de cenário para justificar.

**AGRESSIVO** fecha a pendência da decisão nº 13: o legado lia a palavra "Aptidão" do
texto impresso (`temAptidao`) para liberar o ataque no turno da invocação. Virou palavra-
chave declarada como as outras (`keywords: ['aggressive']`), com o nome do mini-manual, e
a espera de invocação passou a ser decidida num lugar só (`newCreatureInPlay`), que
motor, invocação por efeito e invocação do deck usam igual.

## 18. As 78 cartas traduzidas: nome próprio fica, descritivo vai (2026-08-14)

A interface já falava três idiomas, mas a carta — que é o que o jogador lê o tempo todo —
seguia em português: nome, texto de efeito e a edição do rodapé. Os mapas `cards` de
`en-US` e `es-ES` foram preenchidos com as 78 cartas, em `locales/cards.<locale>.ts`
(arquivo à parte para o dicionário de interface continuar legível).

As regras da tradução, que valem para carta nova:

- **Nome próprio cunhado fica como impresso** (Azzure, Sapomerlim, Yanturai, Arborium,
  Cacheralossauro); o que é descritivo é traduzido. O critério não é estético: o motor
  filtra por trecho de nome (`name_includes: 'Tridente'`, `'Lobo'`, `'Contos'`), e se a
  tradução quebra o grupo o jogador deixa de enxergar em tela o que a regra faz. Por isso
  o grupo tem tradução única e obrigatória — Trident/Tridente, Wolf/Lobo, Tales/Cuentos,
  Forest Coin/Moneda del Bosque, Northman/Norteño, Harpy/Arpía.
- **Carta citada dentro do texto usa o nome traduzido da carta citada**, nunca o impresso.
- **Palavra-chave é regra, não prosa**: a primeira linha traduzida é a palavra daquele
  idioma (MARTIAL/MARCIAL), e o teste de i18n compara com `ui.keyword`.
- **Erro de digitação do impresso não é reproduzido.** O pt-BR mantém a paridade com o
  impresso (invariante 7); a tradução sai limpa, porque é texto novo.
- `Edition` também virou chave de dicionário (`edition.*`), então o rodapé da carta
  ampliada deixa de dizer "Matilhas & Predadores" para quem joga em inglês.

O que continua em português por não ser texto: a **arte impressa** das 45 clássicas (o PNG
é a carta física fotografada — no modo composto a mesma carta sai traduzida) e as palavras
ATQ/VIDA **desenhadas** nos badges do molde do Figma. Trocar isso é trabalho de arte, não
de i18n.

`src/i18n/__tests__/locales.test.ts` fecha a porta: todo idioma que não é o fonte tem de
traduzir o catálogo inteiro, com nome e texto, sem id fantasma e sem nome repetido — carta
nova sem tradução quebra o teste, do mesmo jeito que chave de interface faltando não
compila.

## 19. Animação é fantasma sobre o tabuleiro, não gate da jogada (2026-08-15)

O DevLukkas não conseguia acompanhar a partida: "tem coisas acontecendo e não sei o que é
pois é muito rápido". Três momentos passaram a ser mostrados — a criatura destruída indo
até o descarte e sumindo numa **fumaça vermelha**, o atacante indo até o alvo (ou até o
herói, no ataque direto), **batendo e voltando**, e o **ponto conquistado escrito grande**
no meio da tela.

A animação consome EVENTO, como manda o invariante 3 (`animationStore.push`), e não diffa
estado. Duas decisões estruturais:

- **A jogada não espera a animação** — revisto pela decisão nº 25, que passou a segurar
  modal, lance e relógio até a fila esvaziar. O resto deste ponto continua valendo:
  a visão é aplicada na hora; o que voa na tela é uma
  CÓPIA da carta (`Ghost`) posicionada por `getBoundingClientRect`. É isso que permite a
  criatura destruída "fazer o caminho" mesmo já tendo saído do campo — e evita ter de
  segurar snapshot do servidor, que chega por SSE fora do ritmo do vídeo. O preço é a
  animação ficar alguns segundos atrás da verdade num turno cheio do bot; a fila é curta
  (12 passos) justamente para o atraso não crescer sem limite.
- **A âncora é DOM, não React.** O tabuleiro marca origem e destino com `data-anchor`
  ("slot:a:2", "discard:b", "hero:b"); a camada mede e interpola. Assim a animação não
  precisa de ref, contexto nem prop atravessando a árvore, e um alvo novo é um atributo.

A identidade de quem morreu não está no evento (`CREATURE_DESTROYED` só carrega `uid`), e
o alvo do ataque pode morrer no mesmo lance. Por isso o campo é memorizado ANTES de cada
comando (`rememberFields` no treino, `rememberView` no online, sempre depois de animar os
eventos daquele lance). Trocar isso por `cardId` dentro do evento é possível, mas mexeria
no motor e no servidor para resolver um problema que é só do cliente.

## 20. Rótulo do badge sai do bitmap e passa a ser texto traduzido (2026-08-17)

Os badges de status da criatura vinham do Figma com a palavra achatada no PNG — `ATQ` no
badge de ataque, `VIDA` no de vida. Ou seja: em inglês e espanhol a carta mostrava número
traduzido pelo motor e rótulo em português, contra o invariante 8.

A placa vinho do badge foi **repintada sem a palavra** (`scripts/badge-label.ts`: marca o
que não é vinho na faixa do rótulo e resolve Laplace ali, com o vinho em volta de
contorno) e quem escreve a palavra agora é `ComposedCard`, com `card.attackBadge` /
`card.healthBadge` do dicionário. O retoque roda dentro de `figma.ts`, entre baixar o PNG
e converter para webp, então reexportar o molde não traz o rótulo de volta; se o desenho do
badge mudar, a conferência do próprio script acusa a faixa fora de lugar.

A caixa e o corpo da fonte foram calibrados sobre o rótulo que estava impresso no bitmap
(altura de caixa alta de 9 unidades no badge de ataque, 7,5 no de vida) — o rótulo novo
cai onde o antigo estava.

Em inglês o badge diz **ATK** e **HP**, escolha do DevLukkas. O texto de regras traduzido
continua escrevendo `HEALTH` por extenso (decisão nº 18): na caixa de efeito cabe, na placa
do badge não — ela aceita umas 4 letras em caixa alta.

## 21. A carta composta vira o modo padrão (2026-08-17)

Os dois modos de desenho existiam para comparar lado a lado antes de escolher um (decisão
nº 9 em diante); a escolha do DevLukkas é a **composta**. `renderModeStore` passa a abrir em
`composed`, e o `localStorage` só derruba para `printed` se o jogador pedir pelo toggle —
quem já tinha o modo salvo mantém o que escolheu, porque a chave continua a mesma.

Só formaliza o que o resto do cliente já assumia: as 33 do Quatro Elementos não têm arte
impressa e sempre caíram no modo composto (decisão nº 14), a composta sai traduzida
enquanto o PNG clássico é pt-BR fotografado (decisão nº 18) e é ela que mostra ATQ/VIDA
vigentes em vez do valor impresso — com o padrão invertido, o badge de stats sobreposto no
tabuleiro deixa de aparecer no caminho normal.

A arte impressa fica: é a carta física das 45 clássicas e o toggle continua em toda tela.

## 22. Estúdio de cartas: a tela edita o CÓDIGO, não um banco (2026-08-17)

Pedido do DevLukkas: uma área administrativa para criar e editar cartas — imagem, texto,
tipo, raridade, ref, autoria, efeitos. A pergunta de arquitetura não era a tela, era **onde
a carta editada passa a morar**.

A alternativa óbvia — cartas viram linhas no SQLite e o servidor entrega o catálogo por
API — foi recusada. Ela custaria os quatro pilares que o catálogo em código sustenta:
`cardById` deixaria de ser import estático e o motor puro passaria a receber catálogo
injetado (invariantes 1 e 5); efeito inválido só quebraria em runtime, porque o compilador
não veria mais a união; os testes que afirmam sobre cartas (integridade, i18n, decks
prontos, as 245 do motor) perderiam o objeto sobre o qual afirmam; e uma carta editada
mudaria as regras de partidas gravadas, que guardam `state_json` referenciando id.

**O estúdio reescreve `src/data/*.ts`.** A carta editada volta para o mesmo literal de onde
saiu, os arquivos seguem sendo a fonte da verdade e cada edição vira diff no git —
revisável, reversível e com autor. O que mudou de verdade é que agora existe uma tela para
escrever esse literal em vez de digitá-lo.

Cinco peças sustentam isso:

- **O vocabulário virou dado** (`src/data/vocabulary.ts`): para cada ação, gatilho, efeito
  contínuo e custo, quais campos existem e de que natureza são. O tipo `SpecFor<T>` exige um
  campo descrito para cada propriedade da variante — **ação nova, campo novo ou campo
  renomeado em `types.ts` e o arquivo para de compilar**. É o invariante 5 ("o compilador
  acusa efeito sem handler") aplicado à autoria: carta nova se escreve combinando o que
  existe, e o formulário sabe disso sem ninguém escrever tela por tipo de ação.
- **O formulário é gerado** (`FieldInput.tsx` + `EffectBuilder.tsx`): um `FieldSpec` vira um
  controle. Não há uma tela por ação, então acrescentar ação ao motor já a deixa montável.
- **O servidor valida** (`validate.ts`), pelo mesmo descritor, antes de escrever — o cliente
  não é confiável (invariante 4). O que ele devolve é DADO (`{ path, problem }`), traduzido
  pelo cliente em `admin.problem.*` (invariante 8).
- **A escrita é cirúrgica** (`server/cardSource.ts`): só o literal daquela carta é
  substituído, o resto do arquivo fica byte a byte. Regravar carta sem mudança produz o
  arquivo idêntico — há teste disso.
- **A gravação não sai sem tradução.** O dicionário de cada idioma é atualizado junto, senão
  a carta nasceria quebrando o teste de i18n (decisão nº 18).

**Não sobe por padrão.** Só com `--admin` (ou `EZONE_ADMIN=1`), só se as fontes estiverem no
disco, e ainda assim exige conta E a chave impressa no console — o `vite.config.ts` deste
projeto serve o dev por túnel público, então uma rota que escreve no repositório não pode
depender de ninguém saber o endereço.

O **vocabulário de efeitos não é traduzido** na tela: `add_marker`, `trigger_source`,
`until_end_of_turn` aparecem como estão em `types.ts`. É assim que se fala deles neste
arquivo e nas cartas; traduzir criaria um segundo idioma de regras para o autor decorar.
Só o chrome da tela sai do i18n.

Dois efeitos colaterais assumidos:

- **O servidor em execução continua com o catálogo de quando subiu.** Quem vê a carta na
  hora é o cliente, pelo HMR do Vite; para as PARTIDAS usarem a carta nova é preciso
  reiniciar o servidor. Recarregar módulo em processo vivo no meio de partidas valendo
  ponto seria pior do que reiniciar.
- **Ids deixaram de ser contíguos por formato.** Id novo é sempre o maior + 1, então uma
  carta clássica criada hoje cai depois do Quatro Elementos, e apagar abre buraco. O teste
  de integridade passou a exigir o que ainda protege — formatos não dividirem id — e as
  contas fixas (45 impressas, 33 importadas, a distribuição por tipo do Figma) foram
  recortadas por faixa de id, porque são fato histórico daquelas levas e não regra do
  catálogo.

Campo novo na carta: `author`, crédito de ilustração. Fica fora de tudo que o motor lê.

## 23. Só a carta composta: o modo "arte impressa" sai do cliente (2026-08-18)

Pedido do DevLukkas: "remove as opções de cartas impressas, usaremos somente as compostas".
A decisão nº 21 já tinha eleito a composta como padrão e deixado o toggle como escolha do
jogador; agora o modo impresso deixa de existir na interface — `renderModeStore` e
`RenderModeToggle` foram apagados, e `Card.tsx`/`CardZoom.tsx` desenham `ComposedCard`
sempre.

O que isso simplifica, além de uma tela a menos: o badge de ATQ/VIDA sobreposto no
tabuleiro sumiu de vez (a composta imprime o número vigente; só a FICHA, que não tem carta,
ainda desenha os seus), e nenhuma tela precisa mais decidir entre dois desenhos da mesma
carta.

**Os PNGs de `public/assets/cards` ficam no repositório.** Eles não são mais interface, mas
continuam sendo a carta física das 45 clássicas, a fonte do recorte da ilustração
(`scripts/art.ts` → `public/assets/arte`) e a referência visual contra a qual a composta foi
calibrada (`card-lab.html`). Apagá-los custaria a calibração e a arte; mantê-los não custa
nada, porque nada os serve ao jogador.

## 24. O tabuleiro passa a caber na tela, e a partida a se explicar (2026-08-18)

Cinco pedidos do DevLukkas na mesma leva, todos sobre a mesma queixa: o tabuleiro não conta
o que está acontecendo.

- **O turno do bot era instantâneo.** `runBot` resolvia o turno inteiro num laço síncrono e
  só então devolvia a visão: o jogador via o resultado, nunca os lances. Agora o bot joga um
  comando por vez (`botStep`, 850 ms entre lances) e o passo seguinte ainda espera a
  animação do anterior terminar — sem isso a fila de fantasmas engoliria a pausa. Vale só no
  treino; no online quem dá o ritmo é o outro jogador.
- **Anexo era um contador.** A criatura mostrava "+2" no canto e não havia como saber o que
  estava anexado sem abrir a carta. Os anexos dos DOIS lados agora aparecem desenhados numa
  faixa debaixo da criatura (clique amplia). A faixa só reserva altura quando existe anexo
  na fileira — carta grande vale mais que espaço vazio.
- **A tela não cabia no monitor.** O tabuleiro era uma coluna que crescia e rolava. Agora é
  `h-[100dvh]` sem rolagem: cada fileira mede a própria caixa (`ResizeObserver`) e, como a
  carta tem proporção fixa, a ALTURA da fileira decide a largura da carta — limitada também
  pela largura, para caber em monitor baixo, largo ou estreito. O registro vira coluna
  recolhível (`› Registro`), e some sozinho abaixo de `lg`.
  Peça central disso: `FieldLine` desenha a fileira inteira (zonas + campo + ESPAÇADOR da
  largura das zonas do outro lado). O espaçador não é enfeite — sem ele o campo do jogador
  começaria colado na borda e o do oponente depois da coluna de deck/descarte, e as colunas
  de ataque, que são regra do jogo ("só ataca quem está em frente"), não ficariam uma sobre
  a outra na tela.
- **Virada de turno e de fase eram invisíveis.** `TURN_STARTED` e `PHASE_CHANGED` viram uma
  faixa no meio da tela ("SEU TURNO / RODADA 3", "FASE DE BATALHA"). Ela consome evento como
  o resto da camada de animação (invariante 3), mas corre FORA da fila: segurar a fila 1,5 s
  a cada fase atrasaria a animação do que de fato aconteceu.
- **Efeito ativável não se anunciava.** Criatura que pode ativar algo agora ganha um brilho
  pulsante, e a carta na mão que pode ser ativada ganha um ícone piscando. Quem responde
  "pode ativar?" é `src/engine/activation.ts`, novo e PURO: ele repete a porta de entrada de
  `activateAbility` (custo pagável, 1x por turno, condição de raça, alvo existente) porque a
  tela não pode "tentar e ver se dá erro". O painel de ativação e o botão da mão passaram a
  sair da mesma função — antes o painel listava habilidades sem conferir nada e oferecia
  botão que o motor recusaria. `__tests__/activation.test.ts` cobra o acordo entre a oferta
  e o motor, caso a caso.

De quebra, carta que "não pode ser invocada normalmente" (Leviathan de Esdras) deixa de
dizer INVOCAR na mão: o botão é ATIVAR e manda a habilidade, para o jogador ler do motor o
que falta em vez de uma recusa de invocação que nunca ia funcionar.

## 25. A animação vira linha do tempo, e ninguém atropela ninguém (2026-08-18)

A decisão nº 19 escolheu o contrário: "a jogada não espera a animação". Na prática isso
virou atropelo — o modal de vitória abria por cima do "+1 PONTO" que tinha acabado de
vencer a partida, o aviso "SEU TURNO" cruzava a tela enquanto a criatura do turno anterior
ainda voava para o descarte, e a pergunta de reação aparecia antes de o jogador enxergar a
jogada à qual devia reagir. **Uma coisa de cada vez** passa a ser a regra.

O fantasma sobre o tabuleiro e a âncora por `data-anchor` (nº 19) continuam iguais. O que
muda é o ritmo:

- **Uma fila só.** Ataque, destruição, ponto conquistado E o aviso de virada de turno/fase
  dividem a mesma `Animation` em `animationStore`. O aviso saiu de fora da fila: ele carimba
  um momento da partida e precisa cair na ordem dos eventos, não por cima do lance anterior.
  Em troca ele encurtou (1,15 s), porque agora custa tempo de verdade.
- **`animationBusy` é o freio do cliente inteiro.** Enquanto a fila toca: o tabuleiro não
  aceita lance (`canAct`; o botão do turno fica desenhado e DESLIGADO, sumir e voltar é o
  atropelo que se veio corrigir), o bot do treino não joga o passo seguinte, nenhum modal
  abre — reação, mulligan e vitória — e o registro segura as linhas. `whenAnimationIdle` é o
  gancho de quem precisa acordar no instante em que ela esvazia.
- **O prazo começa quando a pergunta aparece.** No treino o fusível (60 s de turno, 7 s de
  reação) não é mais armado junto com o lance: ele espera a fila esvaziar, que é quando o
  modal enfim abre. Antes, a janela de reação queimava atrás de um modal que ainda nem
  estava na tela.
- **No online o relógio manda.** O prazo é do servidor e corre desde o lance — a espera pela
  animação não pode custar a resposta. Com menos de `MIN_ANSWER_MS` (5 s) sobrando numa
  janela de reação, a pergunta entra por cima da animação: perder o direito de responder é
  pior que ver a pergunta sobre o vídeo.

Bloquear o oponente durante a janela de reação **não é trabalho da tela**: o motor já recusa
qualquer comando com escolha pendente (`pending_choice`) e qualquer resposta de quem não é o
dono da escolha (`choice_not_yours`), então o lado ativo fica travado até a resposta ou o
estouro do prazo — no treino, no PvP e no replay. `__tests__/reaction.test.ts` passou a
cobrar isso caso a caso, para a trava não depender de o cliente lembrar de travar.

O preço aceito: num turno cheio a animação fica alguns segundos atrás da verdade, e o teto
da fila (24 passos) derruba os passos MAIS ANTIGOS numa reconexão que desaba de uma vez —
num atraso desses o que interessa é alcançar o presente.

## 26. A interface ganha tema próprio, e o "Tatics" some da tela (2026-08-18)

O redesign veio pronto do Claude Design (projeto "Ezone TCG Redesign", telas de login,
menu, coleção, baralhos, editor e partida) e foi importado para dentro do cliente. Até
aqui a tela era Tailwind cru — `bg-slate-800`, `bg-emerald-700` — repetido arquivo a
arquivo; o que entrou no lugar é um TEMA, e as decisões abaixo são o que sobrou dele.

**O tema vive em `styles.css`, não nos componentes.** Um bloco `@theme` com os tokens
(`--color-ez-gold`, `--color-ez-muted`, `--font-title`…) e um `@layer components` com as
peças que se repetem: `.ez-panel`, `.ez-btn` +
`.ez-btn-gold|blue|ember|emerald|panel|ghost|danger`, `.ez-input`, `.ez-select`,
`.ez-chip`, `.ez-pill`, `.ez-rules`, `.ez-card-tile`, `.ez-hand-card`, `.ez-gem`,
`.ez-page`. Botão novo escolhe um `ez-btn-*` pelo PAPEL — ouro é a ação principal da
tela, azul a paralela, brasa o que empurra o jogo adiante, esmeralda o que fica
esperando outra pessoa, painel a secundária que não é recuo, fantasma o que volta,
sangue o que apaga — e não inventa gradiente. As cores que entram
em `style` calculado (halo da raridade, cor do elemento na pílula) vivem em
`src/client/theme.ts`, porque `bg-ez-water` não resolve em string montada em runtime.

**Cinzel e Alegreya Sans entram self-hospedadas.** O `.dc.html` as puxava do Google
Fonts; `scripts/fonts.ts` passou a baixá-las junto com as quatro do molde (SIL OFL), pelo
mesmo motivo das outras: o jogo carrega offline e não vaza navegação do jogador.

**"Tatics" não aparece em lugar nenhum da interface.** O desenho trazia "EZONE ·
TACTICS" sob o brasão do login, copiado do verso impresso da carta — e o verso é de OUTRO
jogo do DevLukkas. O nome deste é **Elemental Zone: Trading Card Game** (EZone TCG), então
o filete do login diz `app.subtitle` = "Trading Card Game" (marca: igual nos três idiomas,
como `app.title`), e a carta que boia no menu deixou de ser o verso `cover.png` e passou a
ser uma carta do jogo, SORTEADA do catálogo inteiro a cada volta ao menu
(`randomShowcaseCard` em `App.tsx`; nasceu fixa em Badur, o Urso Guardião, e virou
aleatória a pedido do DevLukkas em 18/08/2026 — o menu é vitrine, e vitrine fixa cansa). O verso segue onde é a
coisa certa: na PILHA do baralho em campo, que é literalmente um monte de cartas viradas.

**A tela de jogar online passou a seguir o desenho, e trouxe três papéis novos.** Ela
tinha ficado de fora da primeira leva (o desenho cobria login, menu, coleção, baralhos,
editor e partida) e continuava num cartão estreito de 460px com o ouro no botão da fila.
Agora é a coluna de 640px do desenho, e o que mudou de papel:

- **ENTRAR NA FILA é esmeralda (`.ez-btn-emerald`), não ouro.** É a única ação do jogo
  que não termina no clique — fica pendurada esperando OUTRA pessoa aparecer. O ouro
  promete resposta imediata e o azul é a ação paralela; nenhum dos dois diz "isso vai
  demorar o quanto demorar".
- **"Criar sala" e "Entrar" são painel em forma de botão (`.ez-btn-panel`).** São a via
  do convite, uma linha abaixo da fila, e o desenho as desenha como superfície de painel
  com letra de pergaminho — não são recuo (isso é o fantasma) nem ação principal. O
  "Entrar" só acende a borda de ouro quando há código digitado: até lá não promete nada.
- **O "Cancelar" da espera é fantasma com hover de sangue (`.ez-btn-ghost-danger`).**
  Sair da fila não é destruir nada, então não merece o `.ez-btn-danger` cheio; mas
  também não é "voltar", e o hover em ouro dizia isso. Só o hover muda.

E o código da sala deixou de ser ouro: ele é para ser LIDO EM VOZ ALTA para o oponente,
e vale mais na esmeralda do pareamento — o ouro é dos títulos, e ali o título já é
"Jogar online", logo acima. `--color-ez-soft` (#c3cfe8) virou token no caminho: já era o
texto do `.ez-btn-ghost`, do `.ez-chip` e da `.ez-pill`, escrito em hexadecimal nos três.

**O que o desenho pedia e não entrou, porque a carta composta já faz:**

- **Os losangos de ATQ/VIDA sobre a criatura em campo.** O protótipo desenhava dois
  diamantes nos cantos de baixo com os números vigentes, porque lá a carta era um PNG
  achatado. Aqui `ComposedCard` já imprime o ATQ e a VIDA de AGORA nos badges do molde
  (decisão nº 23) — repetir viraria dois números para o mesmo dado, e um deles cairia em
  desacordo no primeiro buff. A faixa de anexos sob a criatura (nº 24) fica.
- **A gema de elemento no canto da carta na coleção.** Mesma razão: o hexágono do
  elemento já está impresso ali, e o enfeite caía exatamente em cima dele.

**O registro virou gaveta, revogando a coluna da decisão nº 24.** Ele deixou de reservar
largura ao lado do tabuleiro e passou a deslizar POR CIMA dele, fechado por padrão. A
coluna custava uns 230px de campo em toda partida para um painel que se lê de vez em
quando; agora o campo nasce com a janela inteira e o registro é um clique.

**A mão vira leque.** As cartas se sobrepõem, inclinam a partir do centro
(`FAN_TILT_PER_CARD`) e caem um pouco nas pontas (`FAN_DROP_PER_CARD`); a de baixo do
ponteiro sobe reta e ampliada, e a escolhida sai do leque e fica de pé — é nela que mora o
botão INVOCAR/ANEXAR. Sobrepor é o que deixa oito cartas caberem sem encolher todas. A
altura continua mandando no tamanho (nº 24), agora descontando o tombo do leque.

Verificado no navegador em 1600x1000, 1366x768 e 1280x720: login, menu, coleção, carta
ampliada, baralhos, editor, lobby, sala, mulligan, tabuleiro, gaveta do registro e janela
de reação, sem rolagem e sem erro de console. O estúdio de cartas recebeu só o cromo
(cabeçalho, campos, botões): o formulário por dentro segue como estava, que é ferramenta
de bastidor e o desenho não a cobria.

## 27. O formato do deck vira escolha explícita, e a grade obedece a ela (2026-08-18)

**O problema, relatado pelo DevLukkas:** montou um deck de 40 cartas, mandou gravar e levou
"A carta 60 é do formato Quatro Elementos, mas o deck é Clássico. A carta 77 é do formato
Quatro Elementos, mas o deck é Clássico." — sem nunca ter escolhido formato nenhum.

O editor não tinha formato. `DeckEditor` gravava `{ name, hero, cards }` e o servidor
completava com `'classic'` (o padrão de `draftFromBody`), enquanto a grade oferecia
`ALL_CARDS` — as 78 cartas dos DOIS formatos. Dava para montar o deck inteiro misturando as
edições e a regra da decisão nº 11 (formatos não se misturam) só aparecia no fim, como
erro, com o trabalho já feito. Pior: editar um deck de Quatro Elementos já gravado o
rebaixava a clássico em silêncio, porque o `format` do deck nem chegava a entrar no estado
da tela.

**O formato é agora do DECK, e escolhido na barra.** Dois chips (`FORMATS`) ao lado do
herói, o valor nasce de `initial.format`, viaja no `validateDeck` e vai no corpo do
gravar. A grade passou a ser `cardsOfFormat(format)`, então **a carta ilegal não é
oferecida** — a validação de formato deixou de ser alcançável pela tela e virou o que
sempre devia ter sido: a rede de segurança do servidor. Trocar de formato com o deck
montado pergunta antes e tira só o que o formato novo não conhece; os decks prontos ganharam
`format` declarado (`StarterDeck.format`, os 4 do legado são clássicos) e o select some
quando o formato aberto não tem nenhum. A linha do deck na lista passou a dizer o formato.

De quebra, clicar na carta parou de furar o teto de 40: `adjust` já limitava as cópias
(`MAX_COPIES`), mas o total só era conferido no botão `+` embaixo da carta.

**A lista do que está no deck vai para o lado direito (pedido do DevLukkas).** Painel
`DeckContents` grudado ao lado da grade, agrupado por tipo, com as cópias de cada carta
(`3×`), o total do grupo e o `n/40` no cabeçalho; clicar na linha AMPLIA a carta (o gesto
da coleção), e `−`/`+` acertam a quantidade sem procurar a carta na grade. Antes, a única
pista de quantidade era o número no canto da carta lá na grade, e conferir um deck de 40
exigia rolar o catálogo inteiro procurando o que já tinha entrado.

O painel gruda logo ABAIXO da barra do deck, e a altura da barra é **medida**
(`ResizeObserver` sobre ela, `--deck-top` na aside): em 1280 de largura a barra quebra em
duas linhas, e com um `top` fixo o painel sumia por baixo dela ao rolar. Abaixo de `lg` o
painel vira um resumo de 45vh acima da grade, com rolagem própria.

**O formato passou a aparecer onde o deck é ESCOLHIDO, não só onde é montado.** O select
do treino (menu) e o do lobby dizem `Nome — Formato`. O servidor já tratava disso direito —
a fila é uma POR formato (`server/rooms.ts`) e entrar numa sala de outro formato leva
`format_mismatch` —, mas na tela os dois decks eram só nomes: quem escolhia o 4E ficava na
fila para sempre sem entender, ou levava "os dois decks precisam ser do mesmo formato" sem
ter como saber qual era o de quem.

Verificado no navegador em 1600x1000, 1280x720 e 1920x1080 (23 checagens): grade com 45
cartas no clássico e 33 no Quatro Elementos, busca de carta 4E não achando nada no
clássico, painel contando 3×, `−` do painel tirando cópia, aviso na troca de formato,
deck 4E de 40 cartas gravando e reabrindo no formato certo, deck pronto sem nenhum
problema de formato e nenhum erro de console.

## 28. A carta composta vira caixa fechada de empilhamento, o dano vira cristal e desistir passa a perguntar (2026-08-18)

**O problema, relatado pelo DevLukkas:** "não estou conseguindo colocar criatura em campo,
seleciono mas não consigo colocar em campo".

Não era regra do motor: o botão INVOCAR **não recebia o clique**. A carta escolhida na mão
desenha a `ComposedCard` dentro de um botão que ocupa a carta inteira, e o INVOCAR é um
irmão posicionado por cima dela. Só que a composta é montada com z-index internos que vão
até 11 (os losangos de ATQ/VIDA, e o do rodapé fica exatamente onde o botão mora) e a raiz
dela era `position: relative` **sem criar contexto de empilhamento** — então aqueles 11
disputavam a mesma pilha do INVOCAR (z-index automático) e ganhavam. O clique caía no botão
de baixo, que só alterna a seleção: selecionar funcionava, invocar nunca. Medido no
navegador com `elementFromPoint` sobre o centro do botão — o que atendia era
`img/molde/diamante-1.webp`, com e sem o hover do leque.

**A carta composta passa a isolar o próprio empilhamento** (`isolation: isolate` na raiz de
`ComposedCard`). Todo cartaz posto POR CIMA da carta — o INVOCAR/ANEXAR da mão, o ✦ de
ativável, o ATACAR do campo, a etiqueta de elemento alterado — volta a ficar em cima sem
precisar caçar um z-index maior que o do molde, e o molde deixa de vazar para a pilha de
quem o desenha. É a regra que faltava desde que a composta virou o modo único (decisão nº
23): quem desenha a carta não deve precisar saber como ela é montada por dentro.

**O dano direto vira cristal, e o "Dano 0/5" sai (pedido do DevLukkas: "deixa ele mais
visual, no mockup são uns cristais que vão se destruindo com os danos").** Um cristal por
ponto de `DIRECT_DAMAGE_PER_POINT` na placa do herói: aceso enquanto está inteiro, escuro e
rachado depois de quebrar — e o quebrado **continua desenhado**, como os losangos de ponto,
porque é o contorno vazio que deixa a fileira contável de longe. O número não se perdeu:
`board.damage` virou o `title` da fileira.

O estilhaço do instante da quebra sai do EVENTO, não de uma comparação de estado
(invariante 3): `push` separa o `DIRECT_DAMAGE` do lote num canal próprio do
`animationStore` (`shattered` por lado, lido por `useShatter`) e a `key` com o id do lote é
o que faz o CSS tocar de novo. O canal fica **fora da linha do tempo** de propósito —
quebrar cristal é decoração da placa, não um momento que o jogo tenha de esperar, e
enfileirar ali travaria o tabuleiro a cada ponto de dano direto (decisão nº 25 vale para o
que o jogador precisa VER acontecer, não para todo enfeite).

**Desistir passa a perguntar antes.** O botão mora na mesma barra do "fim de turno" e
entregava a partida no primeiro clique; agora abre confirmação (`board.concedeTitle` /
`concedeQuestion` / `concedeConfirm`, nos três idiomas) e o botão do tabuleiro trocou o
fantasma neutro pelo `ez-btn-ghost-danger` — o sangue do tema já era, por escrito, a cor de
"apagar deck, desistir da partida" (decisão nº 26). `ModalButton` ganhou o tom `danger`
para a confirmação. O modal some sozinho se a partida acabar de outro jeito, senão o
desfecho apareceria por baixo da pergunta.

Verificado no navegador (1600x1000, 1366x768 e 1280x720): invocar de ponta a ponta em todas
as larguras, `elementFromPoint` acertando o botão com e sem hover, os cristais quebrando
numa partida de treino com o estilhaço na tela, e desistir → cancelar → desistir →
confirmar levando a "DERROTA — Por desistência". 374 testes, `sim` e `api` verdes.

## 29. O console: o redesign entra por fora da partida, e o baralho ganha dono (2026-08-19)

O DevLukkas trouxe um desenho novo do Claude Design (projeto "Estilo TCG atraente", arquivo
`Elemental Zone.dc.html`) e pediu fidelidade total a ele, **deixando o login e o tabuleiro
fora do escopo desta leva**. O que entrou foram hub, construtor, coleção e jogar online,
mais a moldura que passa a embrulhar as quatro.

**O desenho é outro sistema visual, e ele ganhou prefixo próprio (`zn-`).** Nada de canto
arredondado, gradiente ou sombra: a hierarquia sai de filete de 1px, chapada de fundo e
tipografia. Quatro vozes, cada uma com um trabalho — Cinzel 800 só no brasão, Barlow
Condensed em nome próprio e título de ação, JetBrains Mono em toda etiqueta e todo número
(é dela o `letter-spacing` largo que dá o ar de terminal), Alegreya Sans só na prosa. Como
o login e o tabuleiro **não** foram refeitos, reescrever `--color-ez-panel` por baixo deles
trocaria a cara de telas que ninguém revisou; então os dois sistemas convivem em
`styles.css`, cada um no seu prefixo, e o `ez-` sai inteiro quando os dois últimos
migrarem. Barlow Condensed e JetBrains Mono entram self-hospedadas por `scripts/fonts.ts`,
pelo mesmo motivo das outras seis (SIL OFL, e o jogo carrega offline sem vazar navegação).

**A moldura substitui o menu, e com ele o botão "voltar".** `AppShell` é trilha à esquerda
(brasão, os quatro itens numerados, o estúdio como 05 quando o servidor sobe com `--admin`)
e barra no topo (título, subtítulo, idioma, formato, quem está logado). Toda tela de fora da
partida mora dentro dela, e nenhuma tem mais `ScreenHeader` nem `← Voltar`: a trilha nunca
sai da vista, então o recuo virou ruído. `ScreenHeader.tsx` foi apagado.

**O seletor de idioma foi acrescentado ao desenho.** O protótipo nasceu só em português e
não previa nenhum; ele entra na barra do topo como `.zn-select`, no mesmo tamanho e na mesma
voz mono das outras etiquetas, para não virar o único controle "de site" no meio de um
painel de terminal. `LanguagePicker` ficou com duas peças — a do login (tema anterior) e a
do console —, e a primeira sai junto com o login.

**O baralho ativo passa a existir.** O desenho supõe UM baralho: o nome no rodapé da trilha,
o construtor editando aquele, a fila online mandando aquele. A conta tem vários desde sempre
(`/api/decks`), e o que reconcilia as duas coisas é o **ativo**, guardado no cliente
(`decksStore` + `localStorage`), nunca no servidor — qual baralho está na mesa é escolha de
quem está sentado nela, não um dado da conta. O rodapé da trilha é a porta da gaveta: lista,
troca, cria e apaga. Criar é ficar sem ativo e ir ao construtor, que sem ativo abre um
rascunho vazio; gravar é que devolve o ativo. Com isso saíram três coisas: a tela "Meus
decks" (virou a gaveta), o `select` de deck do lobby (agora é o ativo) e o `select` de deck
do menu (o treino usa o ativo).

**O construtor edita rascunho; a coleção grava na hora.** São superfícies diferentes e a
promessa de cada uma precisa ser diferente: o construtor tem "salvar baralho" no rodapé, e o
± da ficha da coleção não tem onde prometer isso — então ali a cópia entra no baralho ativo
na hora. Trocar de ativo recarrega o rascunho.

**O que o desenho pedia e não entrou, porque a carta composta já faz** (mesma régua da
decisão nº 26): a faixa "tipo · raridade" no pé da carta na coleção. A composta imprime os
dois, e a faixa em largura inteira ainda tapava o rodapé impresso (código de coleção e
crédito da arte). Sobrou dela o que a carta NÃO sabe — quantas cópias já estão no baralho
ativo —, e encolhida para o canto direito.

**As condições de vitória são as do MOTOR, não as do protótipo.** O `.dc.html` listava "A
Entidade" e "Apocalipse", que são regras do legado sem nenhuma implementação aqui. O quadro
mantém as quatro casas do desenho e mostra o que o `reduce` de fato faz: `POINTS_TO_WIN`,
`DIRECT_DAMAGE_PER_POINT`, desistência e `TURN_SECONDS`. Mesma coisa no resumo da mesa, em
"jogar online", e no adversário da mesa: o protótipo desenhava dois heróis fixos, e aqui o
segundo é uma moldura vazia — antes do pareamento não existe oponente para retratar.

**Três ajustes de layout que o protótipo não tinha como pegar**, todos medidos no
navegador: a fileira da curva de ataque perdeu a altura fixa de 52px (ela empurrava a
contagem do topo da barra mais alta para fora da caixa, em cima da etiqueta); o painel do
deck passa a rolar inteiro quando os blocos fixos não cabem, com a barra de gravar grudada
no rodapé (em 720px de altura ela saía pela borda e não havia como salvar); e o filete de
repouso das cartas em grade virou `--tile-line` em vez de cor no `style`, porque inline
vence classe e o `:hover` nunca chegava a acontecer.

Verificado no navegador (Chrome headless por CDP) em 1600x1000, 1280x720 e 1000x800: hub,
construtor, coleção, online, escolha de herói, gaveta de baralhos, mão inicial simulada,
ficha da coleção, conta sem nenhum baralho e o estúdio como item 05 — sem rolagem
horizontal em nenhuma largura e sem erro de console. 374 testes, `typecheck` e `build`
verdes.
