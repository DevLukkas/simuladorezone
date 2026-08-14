# Ezone TCG — reescrita online

TCG online autoritativo do Ezone: engine determinístico compartilhado entre cliente e
servidor, servidor Node **zero dependências** (node:http + node:sqlite + SSE) e cliente
React 18 + Zustand + Tailwind. O legado (`../frontend` + `../backend`, Laravel + Phaser)
fica como referência de regras até ser aposentado.

## Rodar em desenvolvimento

```bash
npm install
npm run dev        # cliente Vite em http://localhost:5173 (proxy /api → 8787)
npm run servidor   # servidor em http://127.0.0.1:8787 (noutro terminal)
```

Requisitos: Node 22.18+ (o servidor roda TypeScript direto, sem build).

Para mostrar o dev server por um túnel https (`cloudflared tunnel --url http://localhost:5173`),
suba o Vite com `TUNEL=1` — no PowerShell, `$env:TUNEL=1; npm run dev`. Só nesse modo o HMR
aponta para `wss://<host>:443`; sem a variável ele usa a porta local, como deve ser.

## Verificação

```bash
npm run typecheck && npm test   # 219+ testes: pureza, determinismo, suíte por carta
npm run sim                     # 200 partidas bot vs bot headless
npm run api                     # servidor em porta efêmera + protocolo completo
```

## Deploy (Railway / Render / Fly)

Um único serviço Node: o servidor serve o `dist/` do Vite e a API na mesma origem.

- Build: `npm ci && npm run build`
- Start: `npm start` (respeita `PORTA`, padrão 8787; a maioria dos PaaS injeta `PORT` —
  configure `PORTA=$PORT`)
- Banco: SQLite em `server/dados/jogo.db` (ou `BANCO=/caminho/jogo.db`); monte um volume
  persistente nesse caminho
- TLS: pelo proxy do PaaS (o servidor fala HTTP puro)

## Mapa do código

| Pasta | O quê |
|---|---|
| `src/data/` | 45 cartas + 5 heróis declarativos, regras de deck |
| `src/engine/` | regras puras: `aplicarComando(estado, comando) → { estado, eventos }` |
| `src/client/` | telas, tabuleiro (consome a visão filtrada), stores Zustand |
| `server/` | contas (scrypt), decks, salas/fila, partidas autoritativas + SSE |
| `scripts/` | `sim.ts` (bot vs bot em lote) e `api.ts` (teste de protocolo) |

Invariantes de arquitetura em `CLAUDE.md`; decisões numeradas em `decisions.md`.
