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
   `src/data/tipos.ts` + handler no registry do engine. O compilador acusa efeito sem handler.
6. **Servidor zero-dependências.** `server/` usa apenas `node:http`, `node:sqlite`,
   `node:crypto` (padrão jogo-gacha). Migrações por `PRAGMA user_version`.
7. **Texto e regras das cartas são paridade com o legado.** Corrigir texto, balancear valores
   ou criar regra nova é decisão de produto (DevLukkas), registrada em `decisions.md`.

## Comandos

- `npm run dev` — cliente Vite (5173, proxy `/api` → 8787)
- `npm run servidor` — servidor Node (8787; serve `dist/` em produção)
- `npm run typecheck && npm test` — obrigatório verde antes de qualquer entrega
- `npm run sim` — partidas bot vs bot headless (fumaça das regras)
- `npm run api` — sobe servidor em porta efêmera com banco descartável e exercita o protocolo

## Estrutura

- `src/data/` — catálogo declarativo (45 cartas, 5 heróis, regras de deck)
- `src/engine/` — regras puras: `reduce(state, command) → { state, events, awaiting? }`
- `src/shared/` — tipos do protocolo cliente↔servidor
- `src/client/` — React 18 + Zustand + Tailwind
- `server/` — Node 22+, SQLite, SSE para push + POST para comandos
- `scripts/` — harness headless

O porquê de cada decisão de arquitetura/regra está em `decisions.md`, numerado.
