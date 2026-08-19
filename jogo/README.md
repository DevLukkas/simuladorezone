# Ezone TCG — reescrita online

TCG online autoritativo do Ezone: engine determinístico compartilhado entre cliente e
servidor, servidor Node **zero dependências** (node:http + node:sqlite + SSE) e cliente
React 18 + Zustand + Tailwind. O legado (`../frontend` + `../backend`, Laravel + Phaser)
fica como referência de regras até ser aposentado.

## Rodar em desenvolvimento

```bash
npm install
npm run dev        # cliente Vite em http://localhost:5173 (proxy /api → 8788)
npm run servidor   # servidor em http://127.0.0.1:8788 (noutro terminal)
```

Requisitos: Node 22.18+ (o servidor roda TypeScript direto, sem build).

Se a porta 8788 estiver ocupada por outro projeto, suba os dois apontados um para o outro:
`PORTA=8789 npm run servidor` e `API=http://127.0.0.1:8789 npm run dev`.

## Estúdio de cartas

Para criar ou editar carta pela tela — identidade, arte, texto nos três idiomas, raridade,
`ref`, autoria e os blocos de efeito montados por formulário — troque o servidor por:

```bash
npm run estudio    # mesmo servidor, com --admin; imprime a chave de acesso no console
```

O **Estúdio** vira o item 05 da trilha da esquerda; ele pede a chave que saiu no console. Fixe a chave com
`EZONE_ADMIN_KEY=...` se preferir uma estável.

O estúdio grava **nos arquivos do catálogo** (`src/data/*.ts` + `src/i18n/locales/cards.*`),
não num banco: cada carta salva vira diff no git. Só o literal daquela carta é reescrito.
Depois de gravar, o cliente recarrega sozinho pelo HMR; **reinicie o servidor** para as
partidas usarem a carta nova.

Sem `--admin` nenhuma rota de escrita existe — é o padrão, inclusive em produção, onde as
fontes nem estão no disco.

Para mostrar o dev server por um túnel https (`cloudflared tunnel --url http://localhost:5173`),
suba o Vite com `TUNEL=1` — no PowerShell, `$env:TUNEL=1; npm run dev`. Só nesse modo o HMR
aponta para `wss://<host>:443`; sem a variável ele usa a porta local, como deve ser.

## Verificação

```bash
npm run typecheck && npm test   # 350 testes: pureza, determinismo, suíte por carta, estúdio
npm run sim                     # 200 partidas bot vs bot headless
npm run api                     # servidor em porta efêmera + protocolo completo
```

## Deploy (Railway / Render / Fly)

Um único serviço Node: o servidor serve o `dist/` do Vite e a API na mesma origem.

- Build: `npm ci && npm run build`
- Start: `npm start` (respeita `PORTA`, padrão 8788; a maioria dos PaaS injeta `PORT` —
  configure `PORTA=$PORT`)
- Banco: SQLite em `server/dados/jogo.db` (ou `BANCO=/caminho/jogo.db`); monte um volume
  persistente nesse caminho
- TLS: pelo proxy do PaaS (o servidor fala HTTP puro)

## Mapa do código

| Pasta | O quê |
|---|---|
| `src/data/` | 78 cartas + 5 heróis declarativos, regras de deck, e o vocabulário de efeitos descrito como dado (`vocabulary.ts`) |
| `src/engine/` | regras puras: `aplicarComando(estado, comando) → { estado, eventos }` |
| `src/client/` | telas, tabuleiro (consome a visão filtrada), stores Zustand |
| `server/` | contas (scrypt), decks, salas/fila, partidas autoritativas + SSE, e o estúdio que reescreve o catálogo (`admin.ts` + `cardSource.ts`, só com `--admin`) |
| `scripts/` | `sim.ts` (bot vs bot em lote) e `api.ts` (teste de protocolo) |

Invariantes de arquitetura em `CLAUDE.md`; decisões numeradas em `decisions.md`.
