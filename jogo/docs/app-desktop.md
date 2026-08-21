# App desktop (Tauri ou Electron) — estudo

Estudo de viabilidade, não decisão tomada. Se aprovado, vira a decisão nº 32 em
`decisions.md`. Levantado em 2026-08-19 sobre o código deste commit.

## Resposta curta

**Dá, e é barato** — o cliente já é uma SPA estática; qualquer casca nativa a carrega sem
mudar o build. Atualização automática também é resolvida, com assinatura criptográfica, nos
dois frameworks.

O caminho recomendado é **Tauri v2, com o `dist/` embutido no aplicativo, servidor
continuando remoto, e o `updater` apontando para um endpoint do nosso próprio servidor**.
Electron só ganha se um dia quisermos rodar o servidor autoritativo DENTRO do aplicativo
(partida offline de verdade, LAN sem internet) — isso hoje não está no escopo, e a seção 3
explica por que continuar sem ele é a escolha certa.

O trabalho real **não está no empacotamento** (1–2 dias). Está em três consertos no nosso
código que hoje só funcionam porque o cliente e o servidor moram na mesma origem —
seção 4. Sem eles, nenhuma casca funciona; com eles, as duas funcionam.

---

## 1. O que o jogo é hoje, e por que isso decide tudo

Fatos tirados do código, não suposições:

| Fato | Onde | O que impõe ao desktop |
|---|---|---|
| O cliente é uma SPA estática Vite | `vite.config.ts`, `dist/` | a casca carrega `dist/` como está; nenhuma mudança de build |
| Toda chamada de API é `/api` **relativa** | `services/api.ts:77` | fora da web `/api` não resolve para lugar nenhum — conserto obrigatório nº 1 |
| O push é `EventSource` com token na query | `stores/matchStore.ts:348` | segundo ponto com URL relativa; SSE entre origens exige CORS |
| A sessão vive em `localStorage` | `services/api.ts` | continua funcionando no WebView, mas a chave passa a ser por origem do app (quem estava logado no site não está logado no app) |
| O servidor é a autoridade, Node zero-dep + `node:sqlite` | `server/`, invariante nº 6 | Tauri não roda Node; Electron roda. Relevante só se o servidor for junto |
| O treino contra o bot roda **inteiro no cliente** | `matchStore.ts` importa `engine/bot.ts` | já existe um modo que não precisa de servidor — o offline parcial sai de graça |
| As cartas são **dados compilados no bundle** | `src/data/*.ts` | um app instalado há dois meses não conhece a carta criada ontem — conserto obrigatório nº 3 |
| `dist/` tem 75 MB, dos quais 74 MB são arte | `public/assets` | o instalador nasce gordo e cada atualização carrega o peso |
| O código pesa 494 KB de JS + 48 KB de CSS | `dist/assets/index-*.js` | **o que muda toda semana pesa 0,5 MB; o que pesa 74 MB quase não muda** |
| `public/assets/cards` (42 MB) não é usado em runtime | `Card.tsx:24`, decisão nº 23 | é fonte do recorte (`scripts/art.ts`), e o Vite copia mesmo assim: 42 MB mortos no `dist/` hoje, inclusive na web |

As duas últimas linhas são o achado mais útil deste estudo. A intuição de que "o jogo pesa
75 MB, então o app desktop é um monstro de atualizar" está errada: **o app é 0,5 MB de
código sobre 33 MB de arte que raramente muda, mais 42 MB que nem deviam estar lá.**

---

## 2. As três formas de empacotar

### A. Casca sobre a URL remota (o "navegador dedicado")

A janela nativa abre `https://jogo.exemplo.com` e nada mais. É um Chrome sem barra de
endereço.

- **A favor:** trabalho quase zero — nenhum conserto da seção 4 é necessário, porque a
  origem continua sendo a do servidor. Atualização de conteúdo é instantânea: subiu o
  deploy, todo mundo está atualizado, sem instalador nenhum.
- **Contra:** servidor fora do ar = janela em branco, sem nem a tela de treino. Sem
  offline. Cada abertura rebaixa os 33 MB de arte que já estavam no disco (hoje o servidor
  **não manda `cache-control` nenhum** — `server/staticFiles.ts` só põe `content-type` e
  `content-length`). Loja de aplicativos (Steam, Microsoft Store) implica com aplicativo
  que é só um invólucro de site.
- **Quando serve:** protótipo de uma tarde, para mostrar ao DevLukkas como fica com janela
  e ícone próprios.

### B. Casca com o `dist/` embutido, servidor remoto — **recomendado**

O aplicativo carrega os arquivos que ele mesmo instalou; só as chamadas de API e o SSE saem
para a rede.

- **A favor:** abre rápido e sem rede; a tela de login, a coleção e o **treino contra o bot
  funcionam offline** (o engine e o bot já rodam no cliente). Nada de rebaixar arte a cada
  abertura. É o modelo de qualquer jogo digital.
- **Contra:** exige os três consertos da seção 4, e o aplicativo passa a ter versão própria
  — que precisa de atualização automática (seção 5) e de um portão de compatibilidade
  (4.3), porque o catálogo de cartas viaja dentro dele.
- **Quando serve:** é o alvo real.

### C. Aplicativo completo, com o servidor dentro

O processo nativo sobe o `server/` local, e o cliente fala com `127.0.0.1`.

- **A favor:** partida contra outro humano sem internet (LAN), conta e deck locais, o jogo
  inteiro numa pasta.
- **Contra:** só Electron faz isso sem reescrever nada, porque só Electron traz um Node
  embutido (Tauri precisaria empacotar o binário do Node como *sidecar*, ~50 MB, ou portar
  o servidor para Rust — o que é reescrever a autoridade do jogo). E aparecem problemas
  novos e feios: duas fontes de verdade para conta/coleção, decidir o que fazer quando o
  jogador entra online com decks criados offline, e o estúdio de cartas, que grava em
  `src/data/*.ts`, não pode existir num app instalado.
- **Quando serve:** se um dia "jogar em LAN sem internet" virar requisito de produto. Não
  é hoje. Vale só registrar que essa porta se fecha ao escolher Tauri.

---

## 3. Tauri × Electron, para este jogo

| | **Tauri v2** (2.10.1) | **Electron** (42.x) |
|---|---|---|
| Motor de tela | WebView do sistema: WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux) | Chromium embutido |
| Instalador | ~6–12 MB + a nossa arte | ~90–110 MB + a nossa arte |
| Instalado em disco | ~15 MB + arte | ~250 MB + arte |
| Memória em repouso | ~80–150 MB | ~200–350 MB |
| Precisa na máquina de build | Rust + MSVC Build Tools (Win) / Xcode (mac) | só Node |
| Roda o nosso `server/` Node dentro? | **não** (só como sidecar binário) | **sim** — `node:sqlite` já vem no Node embutido das versões recentes |
| Atualização automática | `@tauri-apps/plugin-updater`, assinatura minisign obrigatória | `electron-updater`, garantia pelo certificado da plataforma |
| Atualização diferencial | não — baixa o pacote inteiro | sim no Windows (blockmap NSIS) |
| Consistência entre SOs | o WebView varia com o SO do jogador | idêntico em todos |

### O que pesa de verdade aqui

**A favor do Tauri.** O nosso app desktop é um *cliente*, não um hospedeiro de servidor —
a única vantagem estrutural do Electron (ter Node dentro) não é cobrada por nada no
escopo B. Pagar 90 MB de instalador e 250 MB de disco por um recurso que não vamos usar é
o negócio ruim clássico. Fora isso, a diferença de memória importa para um jogo: o Chromium
do Electron concorre pela RAM e pela GPU que a linha do tempo de animação (decisão nº 25)
quer para si.

**A favor do Electron.** Dois pontos honestos:

1. **Tela idêntica em todo lugar.** O `styles.css` é Tailwind 4, que exige Safari 16.4+ /
   Chrome 111+ (usa `@property`, cores em `oklch`, aninhamento nativo). No Windows isso é
   um não-problema: o WebView2 é Chromium e se atualiza sozinho. No macOS o WKWebView é
   preso ao sistema — **macOS 13 Ventura vira o piso**, e o macOS 12 fica de fora. No Linux
   o WebKitGTK precisa ser 2.40+, o que exclui distribuições antigas. Com Electron, todos
   veem exatamente o mesmo Chromium.
2. **Atualização diferencial.** O `electron-updater` manda só o que mudou; o Tauri rebaixa
   o pacote inteiro a cada versão. Com 33 MB de arte dentro, isso é 33 MB por correção de
   bug. **A solução não é trocar de framework, é encolher o pacote** (4.4): com a arte
   servida pela rede e cacheada, o pacote do Tauri cai para ~10 MB e o assunto morre.

**Veredito:** Tauri, com o piso de macOS 13 declarado e a arte fora do pacote. Se um dia o
requisito virar "LAN offline" ou "macOS 12", a decisão se revisa — e o custo de trocar é
baixo, porque **nada dos consertos da seção 4 é específico de framework.** Eles são a parte
cara, e servem aos dois.

---

## 4. O trabalho real: o que muda no nosso código

Tudo nesta seção vale para Tauri e para Electron, e nada disso quebra a web.

### 4.1 A origem da API deixa de ser implícita

Hoje `api()` faz `fetch('/api/decks')`. Na web isso é a mesma origem; no desktop a página
mora em `tauri://localhost` (macOS/Linux) ou `http://tauri.localhost` (Windows), e `/api`
não existe ali.

```ts
// src/client/services/api.ts
/** Vazio na web (mesma origem). No desktop, o endereço do servidor. */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
export const apiUrl = (path: string): string => `${API_BASE}${path}`;
```

Dois lugares passam a usar isso: o `fetch` de `api.ts:77` e o `new EventSource(...)` de
`matchStore.ts:348`. O build da web continua sem a variável e sai byte a byte igual; o
build do desktop sai com `VITE_API_BASE=https://jogo.exemplo.com npm run build`.

Vale um escape para desenvolvimento: se o app achar `ezone:apiBase` no `localStorage`, usa
esse valor — assim dá para apontar o app instalado para uma máquina local sem recompilar.

### 4.2 CORS no servidor (hoje não existe nenhum)

Com a origem diferente, o WebView exige permissão explícita. Em `server/http.ts`:

- responder `OPTIONS` com 204 e `access-control-allow-methods` +
  `access-control-allow-headers: authorization, content-type`;
- em toda resposta, `access-control-allow-origin` **de uma lista fechada** —
  `tauri://localhost`, `http://tauri.localhost` e a origem do site. Nunca `*`;
- repetir o cabeçalho também na rota crua do SSE, que não passa pelo mesmo caminho das
  rotas JSON.

Um detalhe a nosso favor: a autenticação é `Bearer` em cabeçalho, não cookie, então **não**
precisamos de `access-control-allow-credentials` nem das regras de `SameSite` — a parte
chata do CORS não nos alcança.

### 4.3 O portão de versão (o problema das cartas compiladas)

Este é o risco específico deste jogo, e o mais fácil de esquecer. **As cartas são dados
compilados no bundle** (invariante nº 5): o cliente desenha a carta a partir de
`src/data/*.ts`, que viaja dentro do JS. Na web isso nunca deu problema, porque o mesmo
deploy sobe cliente e servidor juntos. No desktop, o jogador pode estar com um app de junho
contra um servidor de agosto — e aí o servidor manda um evento citando uma carta que o app
não conhece, ou um `TriggerType` novo que o motor local não sabe animar. O sintoma é feio:
carta em branco no meio da partida, ou o cliente travando na linha do tempo.

Proposta mínima:

- o servidor expõe `GET /api/version` → `{ protocol, minClient, catalogHash }`;
- o cliente manda `x-client-version` em toda chamada; abaixo de `minClient`, o servidor
  recusa **as rotas de partida** com um `ErrorCode` novo (`client.outdated`), e o cliente
  mostra "atualize para jogar" em vez de erro genérico. Login e coleção continuam
  atendendo, para o jogador não ficar preso numa tela morta;
- `catalogHash` é o hash do catálogo, calculado no build dos dois lados. Igual = tudo bem;
  diferente = o app avisa que há cartas novas e dispara a atualização. É o diagnóstico
  exato de "app velho, servidor novo", e serve também para a web.

Isso **precisa existir antes do primeiro instalador sair da nossa mão** — é muito pior de
retroagir depois, porque a versão que não sabe checar já está instalada.

### 4.4 Os 74 MB de arte

| Pasta | Peso | Runtime usa? |
|---|---|---|
| `assets/cards` | 42 MB | **não** — fonte do recorte (decisão nº 23) |
| `assets/heroes` | 19 MB | sim |
| `assets/arte` | 7,4 MB | sim |
| `assets/img` | 5,7 MB | sim |
| `assets/fontes` + `assets/molde` | 1,4 MB | sim |

Passos, do mais barato ao mais caro:

1. **Tirar `assets/cards` do `dist/`** (mover para fora de `public/`, já que os scripts leem
   do repositório). `dist/` cai de 75 MB para 33 MB — e isso melhora a web hoje,
   independente de desktop.
2. **Mandar `cache-control: public, max-age=31536000, immutable` + `etag` nos estáticos**
   (`server/staticFiles.ts`, que hoje não manda nada). Também melhora a web hoje.
3. **Servir a arte pela rede no build desktop**: um `assetUrl()` irmão do `apiUrl()`, usado
   nos ~8 lugares que hoje escrevem `/assets/...` na mão (`Card.tsx:17`,
   `ComposedCard.tsx:159/191/372`, `HeroPortrait.tsx:39/69`, `Board.tsx:359/1257`,
   `Studio.tsx:270/751`). Embute-se só a casca (fontes, molde, img ≈ 7 MB) e a arte de carta
   e herói (26 MB) desce sob demanda, cacheada pelo WebView graças ao passo 2.

Resultado: instalador de ~10 MB, atualização de ~10 MB, e a vantagem do update diferencial
do Electron deixa de valer alguma coisa.

### 4.5 O estúdio não vai junto

`npm run estudio` grava em `src/data/*.ts` e nos dicionários — ele existe onde há
repositório. O `main.ts` já se defende sozinho (não sobe o estúdio sem achar as fontes),
então o app desktop herda o comportamento certo de graça: o `adminStore` consulta
`/api/admin/status`, o servidor de produção responde desligado, e o item some da trilha.

---

## 5. Atualização automática

### 5.1 Como funciona no Tauri

O app pergunta a um endpoint se há versão nova, baixa o instalador, **confere a assinatura
minisign** e instala, reiniciando. Sem a chave privada correta o pacote é recusado — então
um servidor de atualização invadido não vira execução de código na máquina do jogador.

```jsonc
// tauri.conf.json
{
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<conteúdo da chave pública>",
      "endpoints": ["https://jogo.exemplo.com/api/updates/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

```ts
import { check } from '@tauri-apps/plugin-updater';

const update = await check();
if (update) await update.downloadAndInstall((e) => { /* Started | Progress | Finished */ });
```

O par de chaves sai de `tauri signer generate`. A pública vai no `tauri.conf.json`
(versionada); a privada vira segredo de CI (`TAURI_SIGNING_PRIVATE_KEY`) e **não pode ser
perdida** — perdê-la significa que nenhum app instalado aceita mais atualização, e todo
mundo precisa reinstalar à mão. Guardar cópia offline, fora do GitHub.

Alvos suportados: NSIS e MSI no Windows, `.app` no macOS, AppImage no Linux (a documentação
cita AppImage; o changelog do plugin menciona deb/rpm em versões recentes — conferir na
hora, se Linux entrar no escopo).

### 5.2 Como seria no Electron

`electron-updater`, com `provider: github` ou `generic` (qualquer hospedagem estática).
Diferencial no Windows via blockmap. Não tem assinatura própria: a garantia vem do
certificado de assinatura de código da plataforma — o que significa que **no macOS a
atualização automática simplesmente não funciona sem app assinado e notarizado**, enquanto
no Tauri o minisign funciona mesmo sem certificado (o instalador só vai dar susto no
SmartScreen).

### 5.3 Onde hospedar, e por que no nosso servidor

Recomendação: **os binários num bucket** (Cloudflare R2 ou S3; o egress do R2 é gratuito) e
o **manifesto respondido pelo nosso servidor**, no formato dinâmico do endpoint acima. O
GitHub Releases é a opção de zero infraestrutura, mas quer repositório público — este é
privado.

Deixar o manifesto no nosso servidor paga três coisas que um JSON estático não dá:

- **liberação gradual** — responder "sem novidade" para 90% e a versão nova para 10%,
  crescendo conforme o erro não aparece;
- **voltar atrás** — publicou uma versão ruim, o manifesto volta a apontar a anterior e o
  estrago para de se espalhar (o Tauri instala a versão que o manifesto mandar, inclusive
  mais velha);
- **um lugar só para a compatibilidade** — quem responde o manifesto é quem sabe o
  `minClient` de 4.3. "O servidor exige 1.4 e existe 1.4 para baixar" vira uma decisão só,
  não duas que podem discordar.

### 5.4 Política de atualização

- **Checar** ao abrir e a cada 6 h com o app aberto.
- **Aplicar**: baixar em segundo plano, instalar ao fechar. Nunca no meio de uma partida —
  o `matchStore` sabe se há partida em curso; adiar até o fim.
- **Obrigatória** quando a versão está abaixo do `minClient`: aí é bloqueio de tela com
  botão de atualizar, não convite. É o caso "o servidor tem cartas que você não conhece".
- **Nota de versão** nos três idiomas, pelo `src/i18n` — mesma regra do resto: nenhuma
  frase nasce fora do dicionário (invariante nº 8).

---

## 6. Assinatura de código: o custo real e uma pegadinha

Sem assinatura o jogo funciona, mas o Windows mostra "aplicativo não reconhecido"
(SmartScreen) e o macOS recusa abrir sem o jogador ir no menu de contexto — e, no Electron,
a atualização automática no macOS nem funciona.

| Plataforma | O que precisa | Custo/ano |
|---|---|---|
| Windows | certificado OV de assinatura de código (desde 2023 exige token físico ou HSM na nuvem) | ~US$ 200–400 |
| macOS | Apple Developer Program + notarização | US$ 99 |
| Linux | nada (AppImage não é assinado) | — |

**A pegadinha:** a saída barata que todo mundo recomenda hoje é o *Azure Trusted Signing*
(rebatizado Azure Artifact Signing), a US$ 9,99/mês — mas ele **só aceita empresas e
autônomos verificados dos EUA, Canadá, União Europeia e Reino Unido**. Para uma empresa
brasileira isso está fechado, e o caminho é uma CA tradicional (Certum, SSL.com, DigiCert)
com token ou HSM na nuvem, na faixa dos US$ 200–400/ano. Vale reconferir antes de orçar,
porque a lista de países muda.

Recomendação prática: **começar sem certificado**. O Tauri assina a *atualização* com
minisign de qualquer jeito, que é a parte que importa para segurança; o aviso do SmartScreen
é atrito de instalação, e enquanto o público for o círculo do DevLukkas e testadores, é
atrito aceitável. Comprar certificado quando houver distribuição aberta.

---

## 7. Como isso constrói (CI)

GitHub Actions com matriz `windows-latest` + `macos-latest` (arm64 e x64), disparada por
tag. Não há atalho: **cada sistema constrói no seu** — não se assina um `.app` fora do
macOS, e o instalador Windows quer Windows.

Segredos: `TAURI_SIGNING_PRIVATE_KEY` (+ senha), e depois os de certificado. O job publica
os artefatos no bucket e registra a versão nova no nosso servidor, que é o que o manifesto
passa a responder.

O que continua valendo, do `CLAUDE.md`: `npm run typecheck && npm test` verde antes de
empacotar. O empacotamento entra **depois** dos 350 testes, no mesmo fluxo.

---

## 8. Esforço

| Fase | O quê | Dias |
|---|---|---|
| 0 | `apiUrl`/`assetUrl`, CORS, portão de versão (§4.1–4.3) — **serve a qualquer framework** | 2–3 |
| 1 | Casca Tauri com o `dist/` embutido: janela, ícone, instalador | 1–2 |
| 2 | Updater assinado + endpoint de manifesto no servidor | 1–2 |
| 3 | Enxugar o pacote: tirar `assets/cards`, `cache-control`, arte remota (§4.4) | 1–2 |
| 4 | CI com matriz Windows/macOS + publicação | 2–3 |
| 5 | Assinatura de código (quando houver certificado) | 1 + custo |
| | **Total até o primeiro instalador que se atualiza sozinho** | **7–12** |

A fase 0 é a única com risco de estourar, porque mexe no servidor e no cliente ao mesmo
tempo. As outras são configuração.

---

## 9. Riscos

| Risco | Gravidade | O que fazer |
|---|---|---|
| App velho não conhece carta nova | **alto** — é o modo de falha mais provável | §4.3, e antes do primeiro instalador |
| WKWebView antigo (macOS 12) quebra o Tailwind 4 | médio | declarar macOS 13 como piso; testar em macOS real cedo |
| Perder a chave privada do updater | **alto** — irreversível | cópia offline, fora do GitHub |
| Atualização baixando 33 MB por correção | médio | §4.4 derruba para ~10 MB |
| SmartScreen assustando o jogador | baixo | aceitar no começo; certificado depois |
| Duas plataformas para manter (web + desktop) | médio | o desktop é o MESMO `dist/`; a divergência só existe se deixarmos entrar |

---

## 10. Prova de conceito de um dia

Para ver na tela antes de decidir qualquer coisa:

```bash
npm create tauri-app@latest      # frontend: nenhum; aponta para o dist/ existente
# tauri.conf.json: build.frontendDist = "../dist"
npm run build && npm run tauri dev
```

Com o servidor local rodando e `VITE_API_BASE=http://127.0.0.1:8788` no build, isso já sobe
a janela nativa jogando de verdade — e é nesse momento que os erros de CORS aparecem no
console, confirmando §4.2 sem depender de teoria.

---

## 11. O que precisa ser decidido (DevLukkas)

1. **Desktop entra no escopo?** Se sim, é distribuição direta (link no site/Discord) ou
   loja (Steam)? Steam muda a conversa: a plataforma tem atualizador próprio, e aí o updater
   do Tauri sobra.
2. **Quais sistemas?** Windows sozinho corta metade do trabalho de CI e todo o custo da
   Apple.
3. **Piso de macOS 13** é aceitável?
4. **Offline/LAN é requisito?** Se for, a conversa muda para Electron e o custo cresce muito.
5. **Certificado agora ou depois?**

## Fontes

- [Tauri — Updater plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri — Ecosystem releases](https://v2.tauri.app/release/)
- [Electron — Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [electron-updater (npm)](https://www.npmjs.com/package/electron-updater)
- [Azure Trusted Signing — preços](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/)
- [Trusted Signing aberto a desenvolvedores individuais](https://techcommunity.microsoft.com/blog/microsoft-security-blog/trusted-signing-is-now-open-for-individual-developers-to-sign-up-in-public-previ/4273554)
