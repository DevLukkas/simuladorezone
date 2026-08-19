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
   `node:crypto` (padrão jogo-gacha). Migrações por `PRAGMA user_version`.
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
  de acesso sai no console, e sem ela nenhuma rota de escrita atende
- `npm run typecheck && npm test` — obrigatório verde antes de qualquer entrega
- `npm run sim` — partidas bot vs bot headless (fumaça das regras)
- `npm run api` — sobe servidor em porta efêmera com banco descartável e exercita o protocolo

## Estrutura

- `src/data/` — catálogo declarativo (78 cartas, 5 heróis, regras de deck) e o
  vocabulário de efeitos (`types.ts`). `vocabulary.ts` descreve esse vocabulário como
  DADO (campo a campo, amarrado ao compilador), e é dele que saem o formulário do
  estúdio (`validate.ts`, `defaults.ts`, `canonical.ts`) e a validação do servidor
- `src/engine/` — regras puras: `reduce(state, command) → { state, events, pending? }`
- `src/shared/` — o que motor, servidor e cliente compartilham: `TextRef` e `ErrorCode`
- `src/i18n/` — dicionários por idioma (`locales/pt-BR.ts` é a fonte; os outros são
  tipados contra ele, então tradução faltando não compila)
- `src/client/` — React 18 + Zustand + Tailwind. O tema da interface é o bloco
  `@theme` + `@layer components` de `styles.css`, e ali convivem DOIS sistemas:
  o **console** `zn-` (decisão nº 29), que é o redesign e vale para tudo que fica
  fora da partida — `.zn-shell`, `.zn-panel`, `.zn-btn zn-btn-<papel>`,
  `.zn-label`, `.zn-num`, `.zn-head` —, e o `ez-` anterior (decisão nº 26), que
  sobrevive só no login e no tabuleiro até eles serem refeitos. Tela nova é `zn-`,
  escolhe o botão pelo PAPEL e não escreve gradiente nem canto arredondado na mão
- `server/` — Node 22+, SQLite, SSE para push + POST para comandos
- `scripts/` — harness headless

## Editar cartas

Carta se edita pelo **estúdio** (`npm run estudio` + `npm run dev`, botão "Estúdio" no
menu), não à mão: a tela grava de volta no literal daquela carta em `src/data/*.ts` e nos
dicionários de idioma, o resto do arquivo fica byte a byte, e a edição vira diff no git.
O servidor valida contra o vocabulário antes de escrever, e recusa carta sem tradução.

Vale editar o arquivo à mão também — o formato é o mesmo. O que NÃO vale é inventar um
tipo de efeito: o motor conhece a união fechada de `types.ts`, e todo bloco declarativo do
catálogo é conferido contra ela pelo teste de integridade.

Depois de gravar, o cliente recarrega sozinho (HMR); **o servidor precisa ser reiniciado**
para as partidas usarem a carta nova.

O porquê de cada decisão de arquitetura/regra está em `decisions.md`, numerado.
