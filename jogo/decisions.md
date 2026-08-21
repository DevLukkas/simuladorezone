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
  **Revogado pela decisão nº 34**: a metade que não depende da escolha (a
  OBRIGAÇÃO de atacar) passou a valer, e o motor a cobra no fim de turno.
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
  sob a regra de ataque por coluna (decisão nº 6) — resolvido pela decisão nº 34, que
  implementa a obrigação de atacar; segue pendente só a escolha de QUEM ela ataca.
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

## 30. O vocabulário se explica, e o estúdio para de perder trabalho (2026-08-19)

Três pedidos do DevLukkas na mesma conversa, e todos caem na mesma pergunta: o estúdio
mostra o vocabulário do motor cru, e quem escreve carta precisa saber de cor o que cada
identificador faz.

**A descrição entra, o identificador fica.** Isto REVOGA em parte a nota de `FieldInput.tsx`
que dizia que nada do vocabulário sai do i18n. O que continua cru é o IDENTIFICADOR
(`add_marker`, `until_end_of_turn`, `trigger_source`) — é o nome que o motor, este arquivo e
o catálogo usam, e traduzi-lo criaria um segundo idioma de regras. O que passou a existir ao
lado dele é a EXPLICAÇÃO, em `vocab.*` nos três dicionários: descrição sempre à vista para o
tipo escolhido (ação, gatilho, efeito contínuo, cenário, custo) e para o bloco; dica no hover
para o nome do campo (sublinhado pontilhado avisa que existe); e o VALOR se explica também
onde ele é regra e não número — `target` e `trigger`.

A cobertura é cobrada pelo compilador, no fim de `vocabulary.ts`: `Covers<'vocab.action.',
ActionKind['type']> extends TextKey` falha quando falta chave, então ação nova no motor sem
descrição não compila. Nome de campo é string livre e escapa disso, então quem cobra é um
teste (`vocabulary.test.ts` varre todo `FieldMap` e exige `vocab.field.<nome>`). É o mesmo
acordo do `SpecFor`, um degrau acima. Entrou junto `keywordHint.*`: a palavra-chave já tinha
nome traduzido (`keyword.*`), agora tem o que ela FAZ.

**Trocar de carta com campo mexido pergunta antes.** O rascunho aberto ganhou uma régua
(`pristine`, um JSON com as chaves ordenadas — sem ordenar, ligar e desligar uma caixa
"sujava" a carta sem mudar nada, porque o formulário apaga e recria a chave). Trocar de
carta, criar outra, fechar, sair pela trilha ou recarregar a página passam todos pela mesma
guarda: descartar, gravar e continuar, ou ficar. "Gravar e continuar" precisou de uma peça
nova: gravar reescreve `src/data` e o HMR RECARREGA a página, então o que a tela deve mostrar
depois virou uma INTENÇÃO em `sessionStorage` (`{kind:'edit',id}` / `{kind:'create'}`) em vez
do id aberto — sem isso a gravação sempre reabria a carta gravada e a troca pedida se perdia.
Sair do estúdio é a única guarda que NÃO mexe no rascunho (`intent: null`): voltar para cá tem
de reencontrar a carta aberta.

**A ilustração ganhou biblioteca.** O upload já existia; o que faltava era escolher um arquivo
que chegou por FORA (recorte da carta impressa, exportação do Figma, cópia na mão) sem saber
o nome de cor. `GET /api/admin/art` lista a pasta do disco — não o catálogo, justamente por
isso — e a tela mostra a grade com miniatura, nome e de que carta cada arquivo já é. De
quebra, o upload parou de gravar PNG dentro de um `.webp`: o nome mantém a base que a carta
já usava e troca a extensão pela do arquivo enviado.

**Limpeza de i18n no caminho.** Nome, raça e texto de efeito do herói viviam DUPLICADOS em
`src/data/heroes.ts`, em português, e ninguém os lia — a interface já resolvia tudo por
`t('hero.<key>.*')`. Saíram do tipo `Hero`, que ficou com o que é regra e caminho de arquivo
(`key`, `element`, `img`). No estúdio, nome e texto em pt-BR saíram da "Identidade" e foram
para o painel de textos, na primeira linha, marcados como FONTE: os três idiomas são a mesma
coisa dita três vezes, e separá-los em painéis diferentes escondia isso.

O que NÃO mudou, e foi decidido não mudar: o texto de carta continua num mapa por id
(`cards.<locale>.ts`), e não em chave nomeada dentro de `Ui`. O pt-BR do catálogo é a FONTE
que o motor lê (`cardById(id).name`, o filtro `name_includes`, o teste de integridade); movê-lo
para o dicionário duplicaria a verdade ou tiraria do motor o que ele usa para casar carta. E
uma chave com o TIPO dentro (`card_creature_5_title`) quebraria toda vez que o estúdio trocasse
o tipo da carta, que é uma operação que ele suporta.

Verificado no navegador (Chrome headless por CDP, 1600x1000): descrição de efeito e de bloco
à vista com o identificador cru ao lado, 26 dicas de campo, guarda aparecendo ao trocar de
carta e ao sair pela trilha, marca "não gravado" que some sozinha ao desfazer a edição,
descartar levando para a outra carta, gravar-e-continuar sobrevivendo ao recarregamento do
HMR, e a biblioteca com as 78 ilustrações identificadas por carta. 377 testes, `typecheck`,
`sim` e `api` verdes.

## 31. O console entra na partida, e a carta que se descarta ganha botão (2026-08-19)

O mockup do Claude Design foi atualizado com as duas telas que a decisão nº 29 tinha
deixado de fora — login e batalha — e o DevLukkas pediu alta fidelidade, com três ajustes
nomeados. Isto fecha a migração: o `zn-` passa a ser O tema do jogo, e o `ez-` fica só no
estúdio de cartas, que é bastidor e nunca entrou em redesign nenhum.

**O login.** Uma coluna centrada: brasão em Cinzel, cartão de canto chanfrado com as duas
abas (`.zn-tab-loud`/`.zn-tab-quiet`), campos altos (`.zn-input-lg`, 46px — o `.zn-input`
da barra tem 34 e é para etiqueta, não para digitar), o ouro chapado da ação principal e o
convidado SOLTO embaixo do cartão: dentro dele o olho o lia como um terceiro jeito de
entrar com e-mail e senha. Do rodapé do desenho ficaram o pulso verde e o seletor de
idioma; "SERVIDOR SA-BR" e "BUILD 0.5" não entraram porque seriam chrome inventado — o
servidor não tem região nem rota de saúde, e escrever um número de build que ninguém
incrementa é pior que não escrever. Saiu junto o par de seletores de idioma: com o login
no mesmo tema sobrou um `LanguagePicker` só, o mesmo da barra do console.

**O tabuleiro.** Quatro faixas em grade (`1fr / 50px / 1fr / 178px`), e cada fileira com as
MESMAS três colunas declaradas (`minmax(196px,252px) / 1fr / 128px`) — é isso que põe as
colunas de ataque uma sobre a outra, que é a regra do jogo ("só ataca quem está em frente")
desenhada em vez de explicada. Isto REVOGA a medição por `ResizeObserver` das fileiras
(decisão nº 24): a carta era dimensionada pela altura que sobrava, então crescer a placa do
herói encolhia a carta. Agora o tamanho é declarado em `clamp`, e por `min(vw, vh)` e não
só por `vw` — num monitor largo e alto o teto por largura deixava a carta pequena no meio
de uma faixa vazia.

A placa do herói ganhou os 15 cristais de vida: `POINTS_TO_WIN × DIRECT_DAMAGE_PER_POINT`
pedras em três fileiras, e a conta é `pontos do adversário × 5 + dano direto acumulado`.
Os três losangos ao lado do nome continuam sendo os pontos em si — a régua conta a mesma
história em outra escala, e é a que se lê de relance no meio de uma partida. Os cristais
azuis lapidados do tema anterior saíram inteiros: o desenho não tem gradiente.

A criatura em campo segue sendo a carta COMPOSTA (invariante da decisão nº 23), e ganhou
dois losangos pendurados meio para fora dos cantos de baixo com o ATQ e a VIDA vigentes. A
120px o badge impresso na carta não se lê, e ATQ/VIDA é o que se olha o tempo todo. Ficam
para FORA da carta de propósito: dentro tapariam a ilustração, e o número que interessa
mora na borda, onde o olho o encontra sem procurar. O vão entre colunas foi calibrado para
nunca ser menor que dois losangos vizinhos.

O que NÃO virou o desenho: o desenho troca a faixa de anexos por um contador "+2" no canto
do slot. A faixa ficou, porque ela responde uma pergunta que o contador não responde
("+2 de quê?"), e o contador entrou também, no alto do slot — quem só quer o número o tem
sem passar o ponteiro. E o botão de fase, que no desenho é um só que muda de rótulo, ficou
sendo dois na fase principal: encerrar o turno sem passar pelo combate é lance legítimo do
motor, e esconder isso custaria um clique inútil por turno.

**A carta que se descarta da mão.** O pedido concreto: Leviathan de Esdras nunca foi
jogável. O motor sempre soube resolvê-la (`activateAbility`, origem "carta na mão", custo
`discard_self`), mas a tela só desenhava o que já estava utilizável — e a carta só fica
utilizável com uma criatura sua em campo E uma segunda cópia na mão. Sem os dois, o
jogador não via botão nenhum e concluía, com razão, que a carta estava quebrada.

A correção é uma segunda leitura da mesma oferta, e não uma regra nova:
`handActivations` segue sendo "o que dá para fazer agora" (o ícone que pisca na carta) e
`handAbilityOffers` passa a ser "o que a carta SABE fazer" (o botão, desligado, com o
porquê no `title` — e o porquê é a MESMA recusa que o motor devolveria, `ErrorCode`, não
uma frase escrita à parte na tela). O acordo do teste continua valendo: a oferta ligada é
exatamente o que `activateAbility` aceita.

Com isso a carta escolhida na mão passa a mostrar uma LISTA de ações em vez de um botão:
a de jogar (invocar / anexar / ativar comando / pôr cenário) e a da própria carta
(descartar-se para ativar). Quando a primeira não existe — que é o caso do Leviathan, que
não se invoca — a segunda leva o ouro, porque aí ela É a ação principal daquela carta.
Carta sem ação nenhuma agora desenha um botão desligado dizendo por quê, em vez de nada.

Auditoria pedida junto: o catálogo tem 6 habilidades ativadas, e Leviathan é a ÚNICA de
origem "mão". As outras cinco (Mysticus, Badur bebê, Feiticeiro Tribal, Mamuthe,
Sapocalibur) já tinham caminho pelo painel da criatura. Descarte como CUSTO de efeito de
gatilho (Atlas, Mapa do Tesouro, Proteção do Escudeiro) já funcionava pela pendência —
`atlas_discard`, `map_discard`, `discard_self_to_prevent_attack` — e a janela dessas
escolhas agora desenha as cartas da mão no tema novo.

**A carta ampliada** virou a MESMA ficha do painel da coleção (`CardFacts`): mosaico de
fatos em fio de cabelo mais o texto de regras em corpo de leitura. Eram dois desenhos
diferentes para os mesmos cinco dados, e a ampliada ainda estava no tema anterior. Ampliar
segue sendo o clique DIREITO em qualquer carta, em qualquer tela.

**Limpeza.** Com login e tabuleiro migrados, 20 classes `.ez-*`, 10 `@keyframes` e 27
tokens de cor ficaram sem uso e saíram — o CSS caiu de 54 kB para 48,5 kB. O que sobrou do
`ez-` é exatamente o que o estúdio usa.

Verificado no navegador (Chrome headless por CDP) em 1920x1080, 1600x1000 e 1280x720:
login com as duas abas, tabuleiro com criatura em campo, anexo, faixa de virada de fase,
mão em leque, carta escolhida com os botões, Leviathan desligado com o motivo e ligado
depois da segunda cópia + criatura em campo, mulligan, registro, visor de descarte,
desistência e desfecho — sem rolagem horizontal em nenhuma largura e sem erro de console.
379 testes, `typecheck`, `build` e `sim` (200 partidas por formato) verdes.
## 32. A chave do estúdio se confere na porta, e a ilustração regravada aparece (2026-08-19)

Dois defeitos do estúdio relatados juntos, e os dois eram a mesma coisa vista de dois
lados: a tela acreditava em algo que só o servidor sabe.

**A chave.** Sem `EZONE_ADMIN_KEY` ela é sorteada a cada `--admin`, e o navegador a guarda
no `localStorage`. Reiniciar o servidor matava a chave guardada sem ninguém avisar: o
estúdio abria inteiro, deixava editar a carta e só recusava na hora de GRAVAR — e não havia
lugar nenhum na tela para pôr a chave nova, porque a portaria só aparecia quando NÃO havia
chave guardada.

Agora a chave se confere ao abrir a tela, na rota `GET /api/admin/access`, que passa pela
mesma guarda das rotas de escrita (conta E chave): um 200 ali é a promessa de que gravar vai
ser aceito. Ela é rota própria, e não uma bandeira no `/api/admin/status`, porque o status
atende sem conta nenhuma — quem quiser adivinhar a chave continua tendo de estar logado
para ouvir "não".

O que a tela faz com a resposta depende de haver trabalho em risco:

- **recusa na entrada** — a chave morta é esquecida, um aviso diz o que houve e o autor
  volta ao hub. Não há rascunho a perder, e entrar de novo cai na portaria pedindo a chave
  nova. É o pedido literal do DevLukkas: com chave errada a tela não se vê.
- **recusa com a tela já aberta** (o servidor reiniciou no meio da edição) — a portaria
  sobe POR CIMA do rascunho e recebe a chave nova ali mesmo. Mandar o autor embora aqui
  levaria junto a carta que ainda não foi para o catálogo, que é justamente o que a decisão
  nº 30 combinou não fazer.

A chave digitada também deixou de ser guardada no escuro: ela vai ao servidor antes, e só
é gravada se ele aceitar.

**A ilustração.** Enviar a arte gravava o arquivo certo em `public/assets/arte` e a prévia
continuava quebrada. São dois enganos empilhados, e nenhum deles no upload:

1. Em dev quem serve `public/` é o Vite, que responde pela lista de arquivos montada ao
   subir e atualizada pelo watcher. Existe uma janela em que o arquivo está no disco e
   ainda não está na lista — e o pedido que cai nela não volta 404: volta o **index.html do
   fallback da SPA, com status 200**, porque o `Accept` de uma tag `img` casa com `*/*`. O
   navegador guarda esse HTML como se fosse a imagem, e ele não decodifica.
2. O endereço da arte nunca mudava. Regravar `74.png` por cima de `74.png` deixa o `src`
   idêntico, então o navegador reaproveita o que já tem naquele endereço — inclusive a
   falha do item 1, e inclusive a imagem ANTIGA quando a nova entra com o mesmo nome.

A store passou a carimbar cada arquivo regravado (`artStamps` → `?v=<carimbo>`), e o
carimbo só sai depois que o endereço responde imagem de verdade — a espera pede com
`accept: image/*`, que é o que tira o fallback do caminho e faz o "ainda não" chegar como
404 honesto. Prévia e biblioteca leem o mesmo `useArtUrl`.

No caminho, `.webp` entrou na tabela de MIME do servidor estático: a ilustração das cartas
é webp e saía como `octet-stream`, dependendo de o navegador farejar o formato.

Verificado no navegador (Chrome headless por CDP): 18 conferências — envio de arte que
desenha, regravação por cima do mesmo nome que TROCA a prévia (sem o carimbo ela fica na
antiga, e o experimento foi rodado para confirmar), servidor reiniciado com a tela fechada
e com ela aberta, chave errada digitada, chave nova aceita — sem erro de console. 381
testes e `typecheck` verdes.


## 33. Bloqueio de ataque e proteção contam a janela do ALVO, não o turno corrente (2026-08-19)

Relato de partida do DevLukkas: "usei Alterando as Rotas para minha criatura não ser
atacada, e ela foi atacada do mesmo jeito". Estava certo — e não era só aquela carta.

O legado gravava o bloqueio no NÚMERO DO TURNO CORRENTE
(`cannotBeAttackTargetUntilTurn = this._turnNumber`), e a reescrita copiou. Só que uma
criatura sua só é atacada no turno do adversário, e uma criatura inimiga só ataca no turno
dela: a marca vencia antes de a janela que ela deveria cobrir sequer abrir. Na prática
quatro cartas não faziam nada:

| carta | o que prometia | o que acontecia |
| --- | --- | --- |
| **Alterando as Rotas (27)** | "não pode ser alvo de ataques neste turno" | protegia o seu próprio turno, em que ninguém a atacaria |
| **Riso Histérico de Tashaa O (21)** | "não pode atacar neste turno" | prendia a inimiga no turno em que ela já não atacaria |
| **Mysticus (3)** | "não pode atacar durante o SEU próximo turno" | soltava um turno antes |
| **Poltergeist (34)** | "não pode atacar no próximo turno do controlador dela" | idem |

A conta passa a ser sobre a janela do ALVO, e não sobre o relógio de quem jogou
(`attackBlockedUntil`/`protectedUntil` em `effects.ts`):

- **bloqueio de ataque, `this_turn`** → a próxima vez que o alvo atacaria: o turno corrente
  se ele for do lado ativo, o seguinte se não for;
- **bloqueio de ataque, `next_turn`** → a janela DEPOIS dessa (dois turnos à frente quando
  o alvo é do lado ativo);
- **proteção contra ataques** → espelho, com o sujeito trocado: quem ataca a criatura
  protegida é o adversário do dono dela, então a janela que interessa é a DELE.

As duas contas dependem de quem é o lado ativo, e é por isso que valem também jogadas
dentro da janela de reação (decisão nº 8): Alterando as Rotas jogada em reação, no turno do
oponente, protege o resto DAQUELE turno — não o seguinte.

Isto REVOGA o item correspondente da decisão nº 6 (paridade com o legado nesse ponto): o
legado errava a conta, e paridade com um efeito que nunca aconteceu não é paridade, é
carta morta. `__tests__/attackWindows.test.ts` guarda o relato.

## 34. Forçar ataque vira OBRIGAÇÃO de atacar, e o motor a cobra (2026-08-19)

Segundo relato da mesma partida: "usei Marionete de Guerra para controlar a criatura
inimiga, mas ao escolher ela nada aconteceu". Também estava certo — a decisão nº 6 tinha
deixado `force_attack` inerte, porque sob a regra de ataque por coluna o alvo do ataque já
está decidido pela geometria, e "deve atacar UMA CRIATURA À SUA ESCOLHA" não tinha o que
escolher.

Mas o texto das duas cartas tem duas metades, e só uma delas depende da escolha:

- **Marionete de Guerra (23)**: "até o próximo turno dela, DEVE ATACAR uma criatura a sua
  escolha";
- **Feiticeiro Tribal Badur (32)**: "a criatura inimiga escolhida DEVE ATACAR a criatura
  escolhida, se possível".

A metade que sobra é a obrigação, e ela vale por si: obrigar um 1/1 a atacar o 5/5 que está
na frente dele é o efeito inteiro da carta sob a regra de coluna. Foi o que entrou.

- `mustAttackUntilTurn` na criatura, com a mesma conta de janela da decisão nº 33;
- `END_TURN` é RECUSADO (`must_attack_first`) enquanto o dono tiver uma criatura obrigada
  que ainda pode atacar — em qualquer fase, senão bastava não ir ao combate;
- "se possível" é literal: criatura impedida de atacar por outro efeito, já invocada neste
  turno, ou com a coluna da frente intocável (Corpo Translúcido) não prende ninguém;
- o bot ataca com a obrigada PRIMEIRO, e por isso nunca fica preso no próprio turno;
- a criatura obrigada ganha etiqueta no tabuleiro, dos dois lados do campo: quem jogou a
  carta precisa ver que ela pegou, e quem a sofreu precisa saber por que o turno não fecha.

A escolha da criatura ALIADA que o Feiticeiro faria (o `filter` de Besta) continua sem
efeito, e agora é a única metade pendente. Redesenhar as duas cartas para a regra de coluna
segue sendo decisão de produto — o que não valia era a carta sair da mão e não fazer nada.

## 35. O prazo do turno não recomeça a cada lance (2026-08-19)

Terceiro relato: "sempre que faço uma ação — invocar, anexar — a linha do tempo diminui e
volta pra onde tava antes".

Eram dois defeitos, um de cada lado, com o mesmo sintoma:

- **no servidor**, `armTimer` rodava depois de TODO comando e dava 60 segundos novos. Quem
  jogasse sem parar tinha turno infinito, e a barra do cliente voltava ao cheio a cada
  lance;
- **no cliente** (treino e online), a janela de reação do oponente trocava o prazo por um
  de 7 segundos. A barra media esse prazo curto na régua de 60 — despencava para um
  sexto — e voltava ao cheio quando a janela fechava.

Agora o relógio é UMA peça só, em `src/shared/clock.ts`, usada pelo servidor e pelo treino
(fora do motor porque depende de hora de parede — invariante 1):

- o prazo do turno nasce uma vez por turno, identificado por `turno:lado:fase`;
- a janela de reação tem prazo próprio e **segura** o do turno em vez de substituí-lo:
  quem gasta os 7 segundos é quem responde, não quem está no turno. Fechada a janela, o
  turno volta com o que sobrava;
- o prazo que vai para a tela vem acompanhado do que ele É (`deadlineIsReaction`), e a
  barra mede na régua certa;
- no treino ele continua só COMEÇANDO a correr quando a animação esvazia (decisão nº 25) —
  isso virou o parâmetro `start` da mesma função.

## 36. A tela para de repetir a carta e passa a explicar a partida (2026-08-19)

Quatro pedidos da mesma leva de relato, todos sobre a mesma coisa: a interface repetia o
que a carta já dizia e calava o que só ela sabia.

**Os losangos de ATQ/VIDA saíram do slot.** Eles vieram de quando a carta em campo era o
PNG impresso, com números que não acompanhavam buff nem dano. Desde a carta composta
(decisão nº 23) o número impresso JÁ é o vigente (`stats` entra do motor), e os losangos
eram a mesma informação por cima da mesma carta, tapando a ilustração.

**A carta ampliada ganhou a aba "Em campo".** O impresso continua sendo o impresso — é o
que se lê para saber a regra. Ao lado, para uma criatura ampliada do tabuleiro: ATQ/VIDA
vigentes, dano acumulado, marcadores, elemento, AS CARTAS ANEXADAS (miniaturas que
ampliam) e as restrições em vigor com o turno em que vencem. A aba lê a visão de AGORA a
partir da posição (lado, coluna, uid) — a criatura que morrer com a janela aberta perde a
aba em vez de virar retrato velho. Desfazer é apagar `InPlayFacts` e o par de abas.

**A pergunta mostra a carta do efeito.** `Pending.sourceCardId` é dado da pendência, não
texto: o motor diz de que carta é a escolha e a tela desenha a ilustração ao lado. Vale
para a corrente de efeitos ("Mapa do Tesouro: comprar 1 e descartar 1?") e para a janela de
reação, onde a carta é a que o OPONENTE acabou de jogar — a segunda pergunta da mesma carta
herda a fonte da primeira.

**Só acende o que dá para escolher.** A fileira inteira acendia ao mirar um comando,
inclusive colunas vazias; o clique ia ao motor e voltava recusado. Agora a coluna consulta
a MESMA conta do motor (`commandTargetSpec`/`canBeCommandTarget`, `canAttachTo`), clicar
fora não faz nada, e o botão da mão que não tem alvo já nasce desligado com o porquê
(`Não há alvo válido para esta carta`, `Elemento incompatível`, `O efeito desta carta ainda
não foi implementado`).

**A habilidade que não dá para usar aparece desligada, dizendo o que falta.** O painel da
criatura só conhecia o que estava utilizável e, para o Bebê Urso sem o Urso no descarte,
respondia "esta criatura não tem habilidade ativável" — negando a existência da habilidade
que a carta promete no texto impresso. `creatureAbilityOffers` passa a devolver TODAS as
habilidades com o motivo da recusa (o mesmo `ErrorCode` que o motor devolveria), como já
era na mão desde o Leviathan.

## 37. Um formato só: o Quatro Elementos volta a ser edição (2026-08-19)

O relato foi curto: "não entendi o porquê abriu este formato, algumas cartas não estão
aparecendo no normal pois estão nele — temos que unir para apenas um".

A decisão nº 11 criou um SEGUNDO formato de jogo para as 33 cartas importadas do Figma, com
pool próprio, fila própria e deck que não mistura. Na prática o que isso produziu foi carta
sumida: quem construía no clássico não via metade do catálogo, e a divisa não pagava nada em
troca — não há uma regra que valha num formato e não valha no outro.

`Format` saiu do código inteiro. O que sobrou é `Edition`, que sempre foi outra coisa: a
PROCEDÊNCIA da carta (o rodapé impresso, a arte, a faixa de id — clássico em 1..45, Quatro
Elementos de 46 em diante). Toda carta é legal em todo deck; a fila online é uma só; o
construtor abre com o catálogo inteiro. As colunas `format` de `decks` e `matches` caíram
numa migração — decks gravados no formato antigo continuam válidos, porque as cartas são
exatamente as mesmas.

## 38. A reação ao ataque vem ANTES do combate (2026-08-19)

"Quando o oponente clica para atacar, caso tenhamos uma carta comando na mão podemos ativar
ela em resposta ao ataque; atualmente está perguntando apenas depois do ataque."

A janela de reação nasceu pós-jogada (decisão herdada do legado: a ação já resolveu e o
outro responde). Para invocação e anexo isso funciona — o que se responde é o estado novo.
Para o ATAQUE, não: quando a pergunta chegava, o dano já estava contado, e o comando que
existe justamente para impedir um ataque ("Riso Histérico") chegava tarde por definição.

Agora o ataque tem dois momentos, e a janela mora entre eles:

- `ATTACK` emite `ATTACK_DECLARED` e enfileira **dois** trabalhos, nesta ordem:
  `reaction_window` e depois `attack`;
- o oponente responde com o combate ainda por acontecer;
- `runAttack` **reconfere a permissão** antes de resolver. É a peça que faltava: o estado de
  quando o comando foi aceito não é o de quando o trabalho sai da fila. Atacante impedido ou
  alvo protegido no meio do caminho emite `ATTACK_BLOCKED` (evento que existia no vocabulário
  e nunca era emitido) e o dano não sai.

Invocação, anexo e início de batalha seguem abrindo a janela no fim da fila, como antes: lá
não há nada declarado esperando para resolver.

## 39. A espera de fachada: o relógio não pode entregar a mão do oponente (2026-08-19)

Consequência direta da nº 38, e veio no mesmo relato: "para não ficar na cara pro oponente a
espera, pois seria uma declaração de que temos ou não uma carta comando na mão".

Sem janela para abrir, a jogada resolvia instantaneamente — e o tempo de resposta virava
informação: resolveu na hora, o outro não tem comando. Com carta na mão, a pausa da decisão
denunciava o contrário.

O motor não espera (invariante 2), então a espera é da TELA. O que o motor faz é avisar:
`offerReaction` emite `REACTION_WINDOW` **sempre** que avalia uma janela — tendo ela resposta
possível ou não. Um aviso condicional teria exatamente o defeito que ele veio corrigir.

O cliente transforma o aviso num passo da linha do tempo de ~1,25s ("o oponente está
avaliando"), e só para quem NÃO decide: quem decide vê o próprio modal, e uma pausa antes
dele só comeria o relógio curto da reação. Como o evento é idêntico nos dois casos, o que
chega ao adversário é sempre a mesma espera.

## 40. O que a partida faz, a partida mostra (2026-08-19)

Quatro relatos da mesma leva, todos com a mesma forma: aconteceu no motor, não apareceu na
tela.

**Escolher entre cartas é escolher olhando as cartas.** A pergunta desenhava a ilustração
só quando a opção era carta da PRÓPRIA mão (a tela procurava o uid na mão); carta revelada
do oponente, criatura em campo, carta do deck e anexo caíam em botão com o nome escrito.
Quem diz que a opção é uma carta passou a ser o motor, em `PendingOption.cardId`, e a regra
vale para toda pergunta. Botão de texto ficou para o que carta não é: "Sim"/"Não", elemento,
ficha sem carta de catálogo.

**Descartar é um movimento.** Carta que ia para o descarte — da mão, do topo do deck
(moagem) ou de cima de uma criatura (anexo) — simplesmente sumia da origem enquanto a pilha
crescia. Agora ela faz o caminho até lá. Descartes seguidos para o mesmo lugar viram UM
passo com várias cartas em leque: "descarte a mão inteira" não pode custar um comboio de
dois segundos. Isso exigiu duas âncoras novas no tabuleiro — `hand:<lado>` (a minha é o
leque; a do oponente é a linha de contagens da placa dele, que é o único lugar onde a mão
dele existe na tela) e `deck:<lado>`.

**Morrer é em dois tempos.** A criatura destruída deslizava para o descarte e pronto. Agora
ela estoura NO SLOT — clarão, onda de choque, a carta branqueando e tremendo —, e só então
tomba, desbota e cai. O primeiro tempo é o que diz "esta criatura morreu", e ele acontece
onde ela estava lutando.

**O herói existe.** "O efeito dos heróis não está acontecendo, testei o Ispisher e ele não
curou minhas criaturas." O efeito acontecia: `HERO_ACTIVATED` + `CREATURE_HEALED` saíam do
motor na virada do turno. O que não havia era passo de animação nenhum — a cura passava
entre um turno e outro, e a leitura era "o herói não faz nada". Agora `HERO_ACTIVATED` vira
uma placa curta com o retrato e o nome do efeito.

Junto, dois defeitos de fora da tela na mesma leva:

- **a revanche perdia o baralho.** "Jogar de novo" chamava `startTraining()` sem argumento e
  caía no deck de demonstração do motor (com o herói Badur, o que ajudou a esconder o
  problema do Ispisher). O treino agora lembra o baralho da última partida;
- **a lista do deck estava espremida** (relato sobre o print): linha de 22px, nome truncado
  e os botões colados nele. Ela ganhou miniatura da carta, altura de verdade, nome e
  estatística em linhas separadas e cabeçalho de seção grudado no topo da rolagem — e o
  painel inteiro ganhou largura, que a saída do seletor de formato (decisão nº 37) devolveu.

## 41. O estúdio vira esteira: a carta ganha situação, a arte ganha marca e apagar é o fim da fila (2026-08-19)

O estúdio era a última tela do tema anterior (decisão nº 26) e a única que o redesign do
console (decisões nº 29 e nº 31) não tinha alcançado. O desenho novo veio do mesmo projeto
de design das outras telas, e o DevLukkas apontou o que faltava nele — que é o que esta
decisão resolve, junto com o redesenho.

**A carta passa a ter SITUAÇÃO, e o jogo só enxerga a publicada.** São quatro:
`draft` (rascunho), `review` (em revisão), `published` (publicada) e `archived`
(arquivada). A coleção, o construtor e a validação de deck leem `PLAYABLE_CARDS`, que é só
o publicado; `ALL_CARDS` — o catálogo inteiro — fica para o estúdio e para `cardById`, que
precisa achar carta de qualquer situação (uma partida em andamento pode ter em campo uma
carta que acabou de ser arquivada). É isto que permite escrever carta nova com o servidor
no ar sem ela vazar meio pronta para uma partida.

O campo é OPCIONAL e ausente quer dizer `published`. As 78 cartas que já estavam no jogo
não passaram por esteira nenhuma, e carimbá-las uma a uma seria escrever no arquivo uma
revisão que não houve — quem responde "em que situação esta carta está" é `cardStatus`,
nunca o campo cru. Carta nova nasce em `draft` (ver `blankCard`).

**Três abas, e a do meio é nova.** O formulário virava a tela inteira e a lista de cartas
era uma coluna de nomes ao lado dele. Agora: NOVA CARTA (o formulário e a prévia), CARTAS
CRIADAS (o catálogo visto pela esteira, com filtro por situação e a troca de situação na
própria linha) e BIBLIOTECA DE IMAGENS. A do meio existe porque a coleção do jogo mostra só
o publicado: sem ela, quem escrevesse uma carta em rascunho precisava lembrar o id para
reabri-la.

**A prévia é a carta de verdade.** O mockup desenhava uma aproximação da carta ao lado do
formulário. Quem desenha a prévia é o `ComposedCard`, o mesmo componente da coleção, da mão
e do tabuleiro (decisão nº 23), recebendo o rascunho que está sendo digitado. O que aparece
no estúdio é, letra por letra e pixel por pixel, o que vai aparecer em jogo — que é a única
maneira de a decisão de arte e de texto poder ser tomada aqui dentro.

**Todo campo se explica, e a explicação fica à vista.** A descrição do vocabulário existia
desde a decisão nº 30, mas morava no `title` do nome do campo — dica que só existe no hover
é dica que não existe para quem não passa o ponteiro por cima. Agora ela é uma linha embaixo
de cada campo, sempre visível: nos campos de identidade vem de `admin.hint.*`, nos do
vocabulário de `vocab.field.*`, e o tipo de ação/gatilho/efeito escolhido continua se
explicando ao lado do identificador cru. O componente `Field` EXIGE a descrição, então campo
novo sem explicação aparece na revisão em vez de passar batido.

**A arte ganha duas marcas: ARTE FINAL e ARQUIVADA.** Elas vivem num índice
(`public/assets/arte/library.json`) ao lado das imagens, e não num banco, pela mesma razão
que as cartas moram no código (decisão nº 22): quem edita arte é o time, e o resultado tem
de virar diff no git e viajar com o repositório. O índice é só a lista de exceções — arte
sem marca nenhuma não aparece nele, e biblioteca sem índice é biblioteca sem marca. A
biblioteca também passou a dizer as DIMENSÕES de cada arquivo, lidas do cabeçalho da
imagem: é o número que denuncia a arte que veio do lugar errado antes de a carta ser
publicada com ela.

**Apagar é o fim da esteira, nunca um atalho.** Só se apaga do catálogo a carta que está
ARQUIVADA, e só se apaga do disco a imagem que está ARQUIVADA — o botão de excluir aparece
apenas na faixa das arquivadas, nos dois casos. Quem confere é o SERVIDOR, lendo a situação
do literal que está no arquivo (invariante nº 4): o cliente manda o pedido, mas quem sabe o
que está gravado é quem grava. Some ainda uma trava a mais na arte: ilustração que uma
carta usa não é apagada nem arquivada, senão a carta publicada ficaria apontando para um
endereço que não responde mais.

**O tema `ez-` acabou.** Ele sobrevivia só aqui (era o que a decisão nº 29 registrou), e o
estúdio agora é `zn-` como todo o resto — o bloco inteiro saiu do `styles.css`. Entraram
duas peças no sistema: `.zn-area` (o campo de várias linhas, que só existia como `ez-`) e
`.zn-btn-blood`, o botão de apagar de vez, em contorno vermelho e não chapado: é a ação que
a tela oferece, nunca a que ela sugere.

## 42. O registro ganha cor, e o painel do deck ganha abas (2026-08-19)

Três relatos sobre o mesmo par de prints, todos de leitura: o que está na tela não se lê.

**O registro era uma parede.** Trinta linhas iguais, no mesmo cinza, no mesmo tamanho —
"não dá para entender muita coisa". A informação estava lá; o que faltava era o que separa
uma linha da outra. Agora cada linha é pintada duas vezes:

- por ASSUNTO, no filete da esquerda e na cor do texto — virada de turno em ouro, lance em
  ciano, pancada em vermelho, ponto e cura em verde, carta trocando de zona em azul,
  modificador em roxo, ataque impedido em laranja, moldura da partida em cinza. É por ela
  que se varre a gaveta procurando "onde começou o turno 4" sem ler frase nenhuma. O mapa
  vive em `src/client/logTone.ts`, como DADO, e um teste cobra assunto para toda chave de
  `log.*`: chave nova sem cor sumiria no cinza sem ninguém notar;
- por PAPEL dentro da frase — nome de carta em ouro, número em branco forte, autor do lance
  em verde quando é você e em vermelho quando é o oponente. Para isso o i18n ganhou
  `resolveParts`, que devolve a mesma frase do `resolve` em pedaços etiquetados. Ela mora
  no i18n, e não no cliente, porque quem sabe onde acaba a moldura e começa o parâmetro é
  quem preenche o `{...}` — reconstituir isso a partir da frase pronta seria adivinhar por
  casamento de texto, e quebraria no primeiro nome de carta que contivesse uma palavra da
  moldura.

A gaveta ganhou também um botão de COPIAR: o registro inteiro em texto puro, em ordem de
partida (a gaveta mostra ao contrário, mas quem cola quer ler do começo). É o que se anexa
a um relato de bug, e era feito à mão, print a print.

**A lista do deck continuava espremida.** A decisão nº 40 já tinha dado a ela miniatura,
altura de linha e cabeçalho grudado — e o print seguinte mostrou que não bastava, porque o
problema não era a LINHA, era a altura que sobrava para a lista: o resto de uma pilha de
cinco blocos fixos num painel de 440px. O painel virou de ABAS:

- **RESUMO** é a leitura de montagem, na ordem em que se monta: carregar um deck pronto,
  nome, herói, curva de ataque, mosaico de 40 slots e pendências — os NÚMEROS do baralho;
- **CARTAS** é a lista, com o painel inteiro para ela.

A lista mora numa aba só. A primeira versão a repetia no fim do resumo, e isso devolvia o
problema que a divisão veio resolver: o resumo voltava a ser uma pilha alta com a lista
espremida no fim dela.

O carregar-pronto subiu para o topo de propósito: é a única ação que decide o deck inteiro,
e estava enterrada abaixo do herói. As pendências saíram de dentro do bloco da curva e
viraram bloco próprio — elas respondem "por que o botão de gravar não salva?", e não têm
nada a ver com a distribuição de ataque.

**A barra de gravar acompanhava o painel.** Ela era o último filho de um `aside` que rolava
inteiro, então dependia de onde a rolagem tinha parado. Agora o `aside` não rola: ele é uma
coluna de altura fixa com UM rolador dentro (o conteúdo da aba), e a barra é IRMÃ desse
rolador. Como a coluna vai até o fim do `100dvh` do `.zn-shell`, o rodapé do painel é o
rodapé da tela. Abaixo de 1100px, onde o `.zn-split` empilha as colunas e passa a ser o
rolador da página, as colunas perderam a rolagem própria (`overflow: visible`) — coluna com
rolagem própria PRENDE o `sticky` da barra nela, e a barra ficaria colada no fim de uma
caixa que não rola em vez de no fim da tela.

## 43. O arquivo de partidas, e rever é reexecutar (2026-08-20)

O console tinha por onde jogar e por onde montar, e não tinha por onde OLHAR PARA TRÁS: a
partida acabava, o botão voltava ao hub e o que aconteceu ali morria com a aba. Entrou a
sexta tela da trilha, **Histórico**, e com ela o **replay** — pedido como experiência ("faz
com replay para vermos se fica legal"), então ele é uma peça avulsa de propósito: sai
inteiro tirando a rota `/replay`, a `ReplayControls` e o `mode: 'replay'`.

**O replay não guarda tabuleiro; guarda a receita.** A linha do arquivo tem a seed, os dois
baralhos e o registro de comandos ACEITOS, e rever é chamar `replayMatch` — o mesmo motor,
de novo, do começo. É o invariante 1 deixando de ser promessa de teste e virando
funcionalidade: se "mesma seed + mesmos comandos = mesmo estado" falhar um dia, o arquivo
inteiro passa a mentir, e um teste em `src/engine/__tests__/replay.test.ts` cobra estado
final E lista de eventos, evento a evento. Guardar um filme de estados custaria centenas de
KB por partida e envelheceria: a receita cabe em alguns KB e é o próprio motor que a lê.

O preço é honesto e está declarado: partida gravada por um motor de ontem pode ser recusada
por uma regra de hoje. Quando isso acontece, `replayMatch` PARA no comando recusado e
devolve `truncated` — a barra avisa, em vez de fingir que a partida terminou ali.

**Os quadros são montados no servidor, não no cliente.** A tentação era mandar seed, decks e
comandos para o cliente reexecutar — seriam 3 KB em vez de 100. Mas o deck do oponente é
informação oculta (invariante 4), e mandá-lo para "rever a própria partida" entregaria a mão
inteira do outro lado. Então o servidor reexecuta e devolve um quadro por comando, cada um
com a visão passada pelo MESMO `viewFor` + `redactEvent` da partida ao vivo. Custa de 60 a
300 KB por replay (medido: 9 a 26 turnos), pago uma vez ao abrir.

**Rever usa o tabuleiro de jogar.** Não há tela de replay: o quadro entra pelo `view` da
`matchStore` e quem desenha é o `Board` de sempre, com `mode: 'replay'`. Uma trava só
(`myTurn` nasce falso) apaga ataque, invocação, botão de turno, mulligan e desistência de
uma vez — e o fusível do turno, que no replay não conta nada, vira a fita de avanço: clicar
nela busca o passo. Andar um passo para a FRENTE anima o lance (é o que se quer ver
acontecer); qualquer outro salto assenta o tabuleiro sem animação e reescreve o registro,
porque pular trinta passos animado é um borrão, não uma leitura.

**A velocidade só virou verdade depois de medida.** A primeira versão escalava a PAUSA entre
os passos, e o navegador desmentiu: 1× dava 0,70 passo por segundo e 4× dava 0,90 — porque
quem dominava o passo era a animação (~1s), não a pausa. Acima de ~1,4× não existe passo
animado. Então acima de 1× o replay SALTA: assenta o quadro sem animar, que é o que avanço
rápido quer dizer em qualquer tocador, e o número no botão volta a ser verdade. As três
velocidades são `1×` (animado), `5×` e `20×` (salto), e o passo a passo manual para a frente
anima sempre — é o lance que se quer ver acontecer. Os números nos botões são os MEDIDOS
depois da mudança, não os pretendidos: 0,53 passo/s, 2,8 e 10,9 — um replay de 173 quadros
leva cinco minutos no primeiro e dezesseis segundos no último.

**O treino também entra no arquivo, e o servidor é quem apura.** O treino roda no cliente
(é ele que tem o bot), então a partida sobe como seed + decks + comandos e o servidor a
REEXECUTA para descobrir quem ganhou, em quantos turnos e de onde vieram os pontos. O placar
que o cliente relata não é lido em lugar nenhum — sem isso o histórico seria um campo de
texto que qualquer um preenche.

**A origem dos pontos sai da ordem dos eventos.** O motor emite `DIRECT_DAMAGE` e só então
`addPoints`, enquanto a destruição pontua ANTES de anunciar a criatura morta. Então o
`SCORED` colado num `DIRECT_DAMAGE` é dano direto, e o resto é abate — 2 de uma vez é
lendária, 1 é rara. Um teste cobra a soma: `lendárias × 2 + raras + direto` tem de bater
exatamente com o placar do dono da linha.

**Uma linha por CONTA, não por partida.** A online rende duas (uma de cada lado, cada uma
com o "você marca" / "Ravena marca" do seu ponto de vista), o treino rende uma. Assim a
consulta é `WHERE account_id = ?` e a tela nunca precisa saber se a conta era `a` ou `b`. O
nome do baralho é COPIADO para a linha: renomear ou apagar o deck não pode reescrever o que
se jogou em agosto.

## 44. O replay vira fita: a partida gravada para de depender do motor (2026-08-20)

A decisão nº 43 guardou a RECEITA — seed, decks e a lista de comandos — e fez de "rever"
uma reexecução: o motor de hoje rodando de novo a partida de ontem. Era elegante, cabia em
3 KB e tinha um defeito que a própria nº 43 declarou como preço aceitável: **motor muda**.
Uma regra nova reescrevia partidas antigas em silêncio, e um comando que deixou de ser legal
interrompia o replay no meio (`truncated`). Um arquivo que a próxima versão do jogo reescreve
não é arquivo — é uma simulação com data de validade.

**Rever deixa de ser reexecutar e passa a ser tocar uma fita.** A partida agora é gravada
enquanto acontece, quadro a quadro: cada passo guarda o tabuleiro dos dois lados, o comando
que o causou e os eventos que ele emitiu (`src/shared/tape.ts`). Tocar é PERCORRER esses
quadros. Nenhuma regra é consultada, nenhum comando é validado, nada é recalculado — o que
está gravado é o que aconteceu, e um motor de daqui a dois anos toca a mesma partida sem
opinar sobre ela. O teste que dá nome à decisão destrói a receita no banco (`seed = 0`,
`decks_json = ''`, `commands_json = '[]'`) e exige que o replay saia byte a byte igual.

**O custo era o argumento contra, e o gzip o derrubou.** A nº 43 rejeitou guardar o filme
por causa do tamanho, e estava certa sobre o número cru: medido em 5 partidas de bot, a fita
dá 114 KB de média. Comprimida, dá **3 KB** — menos do que custavam os quadros que a nº 43
montava sob demanda a cada abertura de replay (60 a 300 KB, pagos toda vez). O filme completo
saiu mais barato que a simulação dele. `node:zlib` entra no servidor por isso; é builtin do
Node, então o invariante 6 (zero dependências) continua de pé.

**A fita guarda a verdade inteira; quem esconde é a saída.** Um quadro tem as duas mãos, os
dois decks e os eventos sem redação — ela é a única testemunha da partida, e um arquivo que
já nasce censurado não serve para depurar nada. A redação acontece na LEITURA, no servidor,
com a mesma política da partida ao vivo: a mão do oponente vira contagem e a compra dele
chega sem carta (invariante 4). A fita crua não tem rota; ninguém a baixa.

**Uma fita por partida, não por jogador.** O histórico continua com uma linha por conta (nº
43), mas as duas linhas de uma partida online apontam para a MESMA fita: rever de qualquer
lado é rever o mesmo filme, com redação diferente. E o resumo do relatório — placar, origem
dos pontos, momentos — passou a ser lido da fita também, pelo mesmo motivo: o relatório de
uma partida de agosto tem de continuar dizendo o que ela dizia em agosto.

**A partida online é gravada AO VIVO; o treino, no ato de arquivar.** No online o servidor já
é quem roda o motor, então cada comando aceito deixa seu quadro em `match_frames` na hora — é
o log oculto da partida, e é ele que faz o filme sobreviver a um restart do servidor no meio
do jogo (reconstruir depois seria reexecutar, que é o que esta decisão tirou do caminho).
O treino roda no cliente, e subir a fita pronta seriam 114 KB contra 3 KB de receita: ele
sobe a receita, e o servidor a reexecuta UMA vez — no dia da partida, com o motor que a
jogou, que é o mesmo build do cliente — para conferir o desfecho e gravar a fita. Depois
disso, ninguém mais reexecuta nada.

**A versão fica carimbada no canto.** É o que torna a fita útil para a equipe: quando alguém
traz "esse combate resolveu errado", a primeira pergunta é de que época é a partida. Uma fita
de agosto mostra as regras de agosto, e sem o carimbo não dá para distinguir um bug do motor
de hoje do comportamento correto da versão que jogou. Em ouro quando é fita gravada; em
vermelho quando é **reconstituição** — partida anterior a esta decisão, que não tem fita e
cai na reexecução de antes. A tela diz que é reconstituição em vez de fingir que é o que se
viu na hora.

**`replayMatch` não morre; muda de emprego.** Ele era a leitura e virou a gravação: confere o
treino, reconstitui o arquivo velho e continua sendo o teste do invariante 1. `truncated`
continua existindo pelo mesmo motivo de sempre — a receita envelhece. A fita, não.

## 45. O que o cliente diz não vira regra: as bordas que faltavam (2026-08-20)

Uma varredura de segurança nas rotas do servidor — tentando burlar partida, replay e
histórico de fora, com `fetch` na mão — achou o núcleo firme e as bordas moles. Vale
registrar as duas coisas, porque a parte firme é o que NÃO precisa mudar.

**O que já estava de pé.** O lado do comando é imposto pelo servidor (`{ ...command, side }`),
então forjar `side` só faz o trapaceiro jogar contra si mesmo; invocar carta que não está na
mão, jogar fora do turno, repetir a ação principal e mandar `TIME_OUT` são todos recusados
pelo motor; a mão do oponente não vaza em nenhum dos quatro caminhos que a poderiam vazar
(visão ao vivo, SSE ao vivo, reentrega do SSE pelo banco e replay da fita); e o servidor
estático recusa toda forma de `..`. O invariante 4 e a autoridade do servidor **passaram no
teste de fogo** — nada aqui mexe neles.

**Regra de baralho é do servidor, inclusive no treino.** O PvP carrega os baralhos do banco,
já validados na gravação, mas o registro de treino chega inteiro pelo corpo do pedido — e ele
só conferia a FORMA (ids inteiros, lista não vazia). Um registro com 120 cópias da mesma
carta era aceito e virava fita: partida impossível arquivada como se tivesse acontecido. A
conta agora é a MESMA do construtor de decks, e por isso `validateDeck` se partiu em duas —
`validateDeckContents` tem as regras de herói, carta e cópias, e o nome ficou de fora porque
nem o baralho do bot nem o de demonstração têm um. Nome é etiqueta da linha de histórico; o
que faz um baralho ser legal é a outra metade.

**Fusível não é senha.** O `loginAttempts` cuida de quem erra a senha; faltava o oposto —
quem acerta tudo e só repete rápido demais. Uma linha de `fetch` criava 50 contas convidadas
em 125 ms. O `rateLimit.ts` mora na memória de propósito: gravar uma linha por pedido para
decidir se o pedido pode gravar uma linha é o próprio abuso. Os tetos por ORIGEM são folgados
porque atrás de proxy a origem é a do proxy e o teto vale para a plateia inteira — são
fusíveis de enxurrada, não cota por jogador. Onde há conta na frente (arquivar treino, palpitar
código de sala) a chave é a CONTA, que não sofre disso. No palpite de sala só o ERRO conta:
quem digitou o código certo entra mesmo com o fusível queimado.

**Partida alheia responde o mesmo que partida inexistente.** O 403 "essa não é sua" contra o
404 "não existe" é, com id sequencial, um contador de quantas partidas o servidor já teve
entregue a quem sabe somar 1. Os dois viraram 404. Cliente legítimo nunca viu a diferença —
ele só pede a partida que o próprio servidor acabou de lhe dar.

**Sessão que envelhece, mas devagar.** O token valia para sempre: copiado uma vez de um log ou
de um navegador emprestado, entrava pelo resto da vida do banco. Agora o prazo é de
OCIOSIDADE (90 dias) e não de idade, e cada dia de uso o empurra — quem joga não é deslogado
nunca. A folga é grande por um motivo que não é conforto: **numa conta convidada o token é a
única credencial que existe**. Não há e-mail nem senha para voltar, então expirar cedo demais
não trancaria a porta de ninguém, apagaria o baralho de quem passou um mês sem jogar.

## 46. O registro volta a ser coluna: aberto, ele ESPREME o campo (2026-08-20)

Pedido do DevLukkas, em uma linha: "o log fica sobreposto ao tabuleiro e aos botões, eu
quero que ele fique ao lado, espremendo o tabuleiro". Isto **revoga a gaveta da decisão
nº 31** e restabelece a coluna da nº 24 — com a peça que faltava da primeira vez.

**O defeito da gaveta.** Ela tinha um bom motivo (fechada, o campo fica com a janela
inteira) e um defeito que só aparece para quem joga: aberta, ela tapava exatamente o que se
confere ENQUANTO se lê o registro. Quem abre o registro está conferindo uma jogada, e
conferir é comparar com o tabuleiro — a última coluna do campo, as zonas de deck e
descarte, a barra do turno e os botões de fase, de registro e de desistir ficavam atrás de
340px de painel opaco. O registro respondia "o que aconteceu?" cobrindo "com o quê?".

**O que faltava na nº 24.** Reservar coluna para o registro já tinha sido tentado, e o que
derrubou a ideia não foi o desenho: foi a régua. A carta era medida em `vw` — 1% da
JANELA —, então tirar 340px de largura do campo não tirava um pixel da carta. O campo
continuava do tamanho de antes dentro de um espaço menor, e transbordava em 1366 e em
1280. Virou gaveta por isso.

Agora a régua é a coluna, e não a janela: a coluna do campo se declara contêiner
(`container-type: inline-size`) e a geometria toda passa a `cqw` — largura do slot, da
carta na mão, da zona, o vão entre colunas e as duas etiquetas da doca. Abrir o registro
encolhe a coluna, e a carta encolhe junto, sozinha, sem `ResizeObserver` e sem estado: em
1280 o slot vai de 108px para 81px e o campo termina em 782, com o registro começando em
973. Fechado, a coluna É a janela e a conta dá exatamente o que dava — a decisão nº 31
continua valendo inteira para a tela sem registro aberto.

O registro tem largura própria em `clamp(288px, 24vw, 380px)`: fração da janela, com teto
para não virar um painel largo e vazio em monitor grande, e piso para a linha do registro
continuar cabendo sem quebrar em três. E o carimbo da versão (decisão nº 44) mudou de
lugar no DOM: ele é do CAMPO, não da tela, e no canto da tela o registro aberto passaria
por cima dele.

O que NÃO mudou: a janela de pergunta, a de reação e a faixa de virada de fase seguem
sendo de tela cheia, por cima de tudo — inclusive do registro. Elas param a partida; o
registro não.

Verificado no navegador (Chrome headless por CDP) em 1920x1080, 1600x1000 e 1280x720, com
o registro aberto e fechado, em treino vs bot: mulligan, carta escolhida na mão com os
botões, invocação do bot, janela de reação e criatura em campo. Sem rolagem horizontal em
nenhuma das três larguras e sem erro de console. 471 testes e `typecheck` verdes.
