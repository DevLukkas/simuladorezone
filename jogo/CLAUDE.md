# Ezone TCG — jogo/

Reescrita do simulador legado (`../frontend` + `../backend`, Laravel+Phaser) como TCG online
autoritativo. O legado é somente-leitura e serve de especificação de regras até a paridade.

## Os 7 invariantes (não negociáveis)

1. **O engine é puro e determinístico.** `src/engine/` não importa React/DOM/servidor, não usa
   `Math.random`, `Date.now` nem I/O. Todo acaso passa pelo PRNG seedado dentro do `GameState`.
   Mesma seed + mesmos comandos = mesmo estado final, em qualquer máquina.
2. **O engine nunca espera.** Nenhum async na resolução de regras: decisão humana vira
   `awaiting` no retorno de `reduce`, e o jogo re-entra com `SUBMIT_CHOICE`.
3. **Toda mutação observável emite `GameEvent`.** O cliente anima consumindo eventos,
   nunca diffando estado. O vocabulário de eventos é fechado (união em `events.ts`).
4. **O servidor é a autoridade.** Cliente envia comandos; o servidor valida com o MESMO
   engine (import relativo) e distribui eventos redigidos por jogador. Informação oculta
   (mão/deck do oponente) nunca sai do servidor.
5. **Cartas são dados, nunca código.** Comportamento novo = novo tipo na união de
   `src/data/types.ts` + handler no motor. O compilador acusa efeito sem handler. O
   vocabulário é normalizado: `TriggerType` (quando) + `ActionTarget` (em quem) +
   `Action` (o quê), uma união só para gatilho, habilidade ativada, entrada, anexo e
   comando — carta nova se escreve combinando o que já existe.
6. **Servidor zero-dependências.** `server/` usa apenas `node:http`, `node:sqlite`,
   `node:crypto` e `node:zlib` (padrão jogo-gacha; o zlib entrou com a decisão nº 44, para
   a fita do replay). Migrações por `PRAGMA user_version`.
7. **Texto e regras das cartas são paridade com o legado.** Corrigir texto, balancear valores
   ou criar regra nova é decisão de produto (DevLukkas), registrada em `decisions.md`.
8. **Código em inglês, texto em i18n.** Arquivos, identificadores e valores de união são em
   inglês; nenhuma frase para o jogador nasce no motor ou no servidor — eles devolvem
   `TextRef` (chave + parâmetros) ou `ErrorCode`, e o cliente traduz (`src/i18n`, pt-BR /
   en-US / es-ES, idioma do sistema com fallback pt-BR). O texto impresso das cartas
   continua no catálogo, em pt-BR, e cada idioma o traduz por id em
   `locales/cards.<locale>.ts` — carta nova sem tradução quebra o teste de i18n.

## Comandos

- `npm run dev` — cliente Vite (5173, proxy `/api` → 8788; `API=http://…` muda o alvo)
- `npm run servidor` — servidor Node (8788; serve `dist/` em produção; `PORTA=` muda)
- `npm run estudio` — o mesmo servidor com o estúdio de cartas ligado (`--admin`); a chave
  de acesso sai no console, e sem ela nenhuma rota de escrita atende. A chave é sorteada a
  cada reinício (fixe com `EZONE_ADMIN_KEY=` para ela sobreviver): a tela confere a que
  está guardada ao abrir e, se o servidor recusar, volta ao hub e pede a nova
  (decisão nº 32)
- `npm run typecheck && npm test` — obrigatório verde antes de qualquer entrega
- `npm run sim` — partidas bot vs bot headless (fumaça das regras)
- `npm run api` — sobe servidor em porta efêmera com banco descartável e exercita o protocolo

## Estrutura

- `src/data/` — catálogo declarativo (78 cartas num formato só — decisão nº 37 —, 5 heróis,
  regras de deck) e o vocabulário de efeitos (`types.ts`). `vocabulary.ts` descreve esse
  vocabulário como DADO (campo a campo, amarrado ao compilador), e é dele que saem o
  formulário do estúdio (`validate.ts`, `defaults.ts`, `canonical.ts`) e a validação do
  servidor. `Edition` é a PROCEDÊNCIA da carta (arte, rodapé impresso, faixa de id), não
  um formato de jogo: toda carta é legal em todo deck. A carta tem SITUAÇÃO (decisão
  nº 41): rascunho, em revisão, publicada e arquivada. Só a publicada chega ao jogo —
  tela de jogo lê `PLAYABLE_CARDS`, o estúdio lê `ALL_CARDS`, e campo ausente é
  `published` (as 78 anteriores à esteira)
- `src/engine/` — regras puras: `reduce(state, command) → { state, events, pending? }`.
  `replay.ts` reexecuta uma partida a partir da receita (seed + decks + comandos): é o
  invariante 1 virado ferramenta. Desde a decisão nº 44 ele NÃO faz mais o replay do
  histórico — grava a fita do treino no ato de arquivar, reconstitui partida antiga sem
  fita e sustenta o teste do invariante. Comando que o motor de hoje recusa interrompe
  (`truncated`) em vez de inventar tabuleiro
- `src/shared/` — o que motor, servidor e cliente compartilham: `TextRef`, `ErrorCode`, o
  relógio da partida (`clock.ts`: prazo de turno e janela de reação; mora fora do motor
  porque depende de hora de parede, e é o MESMO no servidor e no treino local), a versão
  do jogo (`version.ts`, carimbada em toda partida arquivada) e a FITA (`tape.ts`, decisão
  nº 44): o formato congelado em que a partida é gravada quadro a quadro. Gravar conhece o
  `GameState`; TOCAR não consulta regra nenhuma — é o que faz uma partida de agosto
  continuar sendo a partida de agosto depois de qualquer mudança no motor
- `src/i18n/` — dicionários por idioma (`locales/pt-BR.ts` é a fonte; os outros são
  tipados contra ele, então tradução faltando não compila)
- `src/client/` — React 18 + Zustand + Tailwind. O tema da interface é o bloco
  `@theme` + `@layer components` de `styles.css`. O sistema é o `zn-` (decisões
  nº 29, nº 31 e nº 41) e vale para TODAS as telas, partida e estúdio inclusive —
  `.zn-shell`, `.zn-panel`, `.zn-btn zn-btn-<papel>`, `.zn-input`, `.zn-area`,
  `.zn-label`, `.zn-num`, `.zn-head`, `.zn-plate`, `.zn-slot`. Tela nova escolhe o
  botão pelo PAPEL e não escreve gradiente nem canto arredondado na mão. O `ez-`
  anterior (decisão nº 26) não existe mais: saiu junto com o redesenho do estúdio.
  REVER uma partida não tem tela própria (decisão nº 43): o quadro do replay entra pelo
  `view` da `matchStore` com `mode: 'replay'` e quem o desenha é o `Board` de sempre. No
  canto do tabuleiro fica o carimbo da versão que JOGOU a partida (decisão nº 44) — ouro
  para fita gravada, vermelho para reconstituição
- `server/` — Node 22+, SQLite, SSE para push + POST para comandos. `history.ts` é o
  arquivo de partidas (decisões nº 43 e nº 44): uma linha por CONTA, apontando para uma
  FITA por partida (`tapes.ts`, gzipada em `match_tapes`). Rever é TOCAR a fita, nunca
  reexecutar — regra nova não reescreve partida velha. A partida online é gravada ao vivo
  (`match_frames`, o log oculto que sobrevive a restart); o treino sobe a receita e é
  reexecutado UMA vez, ao arquivar, para virar fita — o placar que o cliente relata não é
  gravado. A redação é na SAÍDA: a fita guarda as duas mãos, e é o servidor que esconde a
  do oponente (invariante 4)
- `scripts/` — harness headless

## Editar cartas

Carta se edita pelo **estúdio** (`npm run estudio` + `npm run dev`, "Estúdio" na trilha),
não à mão: a tela grava de volta no literal daquela carta em `src/data/*.ts` e nos
dicionários de idioma, o resto do arquivo fica byte a byte, e a edição vira diff no git.
O servidor valida contra o vocabulário antes de escrever, e recusa carta sem tradução.

Três abas (decisão nº 41): **nova carta** (formulário + a prévia, que é o `ComposedCard`
de verdade recebendo o rascunho), **cartas criadas** (o catálogo pela esteira: rascunho, em
revisão, publicada, arquivada — só a publicada aparece em jogo) e **biblioteca de imagens**
(envio, filtro, marca de ARTE FINAL e de ARQUIVADA, gravadas em
`public/assets/arte/library.json`). Apagar carta ou imagem só é oferecido depois de
arquivar, e quem cobra isso é o servidor.

Vale editar o arquivo à mão também — o formato é o mesmo. O que NÃO vale é inventar um
tipo de efeito: o motor conhece a união fechada de `types.ts`, e todo bloco declarativo do
catálogo é conferido contra ela pelo teste de integridade.

O identificador do vocabulário aparece CRU na tela (`add_marker`, `until_end_of_turn`), com a
explicação do que ele faz na linha de baixo, sempre à vista — ela vem de `vocab.*` (e de
`admin.hint.*` nos campos de identidade), e o compilador exige uma para cada ação, gatilho,
efeito contínuo, custo e alvo (asserções no fim de `vocabulary.ts`; nome de campo é cobrado
por teste). Trocar de carta com campo mexido pergunta antes o que fazer com as mudanças
(decisão nº 30).

Depois de gravar, o cliente recarrega sozinho (HMR); **o servidor precisa ser reiniciado**
para as partidas usarem a carta nova.

O porquê de cada decisão de arquitetura/regra está em `decisions.md`, numerado.
