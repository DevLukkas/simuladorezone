# Estudo: o Ezone TCG no celular

**O que este documento é:** um levantamento de viabilidade, medido contra o código de hoje.
Nada foi alterado para escrevê-lo, e ele **não** é uma decisão — se virar, entra em
`decisions.md` com número. O que ele faz é responder "dá para fazer?" com o custo real de
cada caminho, para a escolha ser de produto e não de improviso.

**Resposta curta:** dá, pelas quatro portas descritas abaixo. Mas a parte cara não é a que
parece: não é "reescrever o jogo em outra linguagem" (isso não é necessário em nenhuma das
portas viáveis) — é **fazer o tabuleiro caber num retângulo de 390pt de largura e obedecer
ao dedo**. Essa conta é a mesma nas quatro portas, e é o primeiro trabalho de qualquer uma.

---

## 1. O que já viaja de graça

A arquitetura de hoje separa regra de tela por invariante, e isso é exatamente o que decide
a viabilidade de um app. Medido agora (linhas, sem testes):

| Camada | Linhas | Viaja para o celular? |
|---|---:|---|
| `src/engine/` | 4.122 | **Inteiro.** JS puro, sem DOM, sem React, sem `node:` |
| `src/data/` | 3.451 | **Inteiro.** Catálogo declarativo, 78 cartas + 5 heróis |
| `src/i18n/` | 3.382 | **Inteiro**, menos a detecção de idioma do sistema |
| `src/shared/` | 51 | **Inteiro.** `TextRef` e `ErrorCode` |
| `server/` | 2.191 | **Não muda.** Já fala HTTP+JSON+SSE; o app é só mais um cliente |
| `src/client/` | 8.513 + 1.465 de CSS | **É aqui que mora o custo** |

São **11.006 linhas de lógica pura** que rodam em qualquer runtime JavaScript sem uma linha
de adaptação, e **~10.000 linhas de interface** que dependem do navegador em grau variável
conforme a porta escolhida.

E isso não é promessa: o invariante 1 é **fiscalizado por teste**. O `purity.test.ts` reprova
o build se algum arquivo do motor mencionar `document`, `window`, `localStorage`, `fetch`,
`Math.random`, `Date.now` ou `node:` ([purity.test.ts:24-33](../src/engine/__tests__/purity.test.ts#L24-L33)).
O motor é portátil por construção, não por sorte, e continua sendo a cada commit.

O servidor idem: ele já expõe 14 rotas em `/api` (13 REST + o fluxo SSE), com informação oculta redigida
por jogador dentro do próprio servidor (`view.ts`, `redactEvent`). Um cliente nativo se
autentica com o mesmo `Bearer` e recebe a mesma visão filtrada. Nenhuma rota nova.

---

## 2. O que não viaja: o inventário do navegador no cliente

Onde o cliente encosta no DOM, arquivo por arquivo. Esta lista é curta — o que a torna cara
não é o tamanho, é o último item:

| O quê | Onde | Custo fora do navegador |
|---|---|---|
| `localStorage` da sessão | [api.ts:17-30](../src/client/services/api.ts#L17-L30) | trivial: `AsyncStorage` / `SecureStore` |
| `EventSource` (SSE) | [matchStore.ts:348](../src/client/stores/matchStore.ts#L348) | polyfill (`react-native-sse`) ou trocar por WebSocket |
| `window.confirm` | [DeckBuilder.tsx:85](../src/client/screens/DeckBuilder.tsx#L85), [DeckSwitcher.tsx:70](../src/client/components/DeckSwitcher.tsx#L70) | trivial: `Alert.alert` |
| `keydown` para fechar modal | [CardZoom.tsx:27](../src/client/components/CardZoom.tsx#L27), [ConsoleModal.tsx:33](../src/client/components/ConsoleModal.tsx#L33) | some (não há teclado); vira gesto |
| `beforeunload` do estúdio | [Studio.tsx:87](../src/client/screens/Studio.tsx#L87) | o estúdio não vai para o celular (ver §4.5) |
| `navigator.language` | [LanguagePicker.tsx:5](../src/client/components/LanguagePicker.tsx#L5) | `expo-localization` |
| **Medição por `getBoundingClientRect`** | [AnimationLayer.tsx:96-97](../src/client/components/AnimationLayer.tsx#L96-L97) | a camada de animação inteira: os passos voam entre âncoras medidas no DOM |
| **A geometria em CSS** | [styles.css](../src/client/styles.css) (1.465 linhas), `clamp/vw/vh` em [Board.tsx:55-58](../src/client/components/Board.tsx#L55-L58), unidades `cqw` em [ComposedCard.tsx:29](../src/client/components/ComposedCard.tsx#L29) | **este é o item caro** |

Sobre o último: a carta composta é desenhada em **unidades de container** (`cqw`) — 40+
coordenadas calibradas contra a arte impressa, que escalam sozinhas porque o CSS resolve a
proporção. React Native não tem `cqw`, não tem `clamp()`, não tem `vh`, não tem
container query. Recriar a `ComposedCard` (562 linhas) fora do CSS significa medir o
container com `onLayout` e multiplicar cada coordenada — é mecânico, mas são 562 linhas de
mecânico, e a calibração pixel a pixel volta a ser trabalho manual.

---

## 3. As quatro portas

### A. PWA — o site vira instalável

Adiciona `manifest.json`, ícones e um service worker ao que já existe. O jogador instala
pela tela inicial do navegador; abre em tela cheia, sem barra de endereço.

- **Reaproveita:** tudo. Zero linha de lógica nova.
- **Custo real:** só o item que toda porta paga — o tabuleiro responsivo (§4.1). O resto é
  meia dúzia de arquivos.
- **Onde dói:** não está na App Store nem na Play Store. Notificação push em iOS só funciona
  depois de instalado, e a instalação depende de o jogador saber fazê-la (é o ponto fraco
  conhecido do formato). Sem cobrança pela loja, se um dia houver.
- **Veredito:** é a porta de entrada natural, e paga adiantado a conta das outras três.

### B. Capacitor — o mesmo cliente dentro de uma casca nativa

O `dist/` do Vite roda numa WebView empacotada como app de verdade, com ícone, splash e
presença nas duas lojas.

- **Reaproveita:** tudo, inclusive `getBoundingClientRect`, `localStorage` e o CSS. É o mesmo
  navegador, só sem barra de endereço.
- **Custo real:** o responsivo (de novo, o mesmo) + contas de desenvolvedor, ícones, revisão
  de loja, e o servidor obrigatoriamente em HTTPS (o iOS bloqueia HTTP puro por ATS; o
  Android bloqueia cleartext por padrão). O README já prevê TLS pelo proxy do PaaS — isso já
  está resolvido.
- **Onde dói:** a WebView tem tato de site. Rolagem com inércia diferente, toque com atraso
  se o CSS não estiver certo, animação de 60fps sob suspeita em aparelho antigo. E é o motivo
  clássico de recusa na App Store ("app que é só um site") — mitigado por integrar algo
  nativo de verdade (push, haptics, compartilhamento).
- **Veredito:** o menor caminho até a loja, se estar na loja for requisito.

### C. Expo / React Native — interface nova, motor o mesmo

O `src/engine/`, `src/data/`, `src/i18n/` e `src/shared/` entram como estão. `src/client/` é
reescrito em `View`/`Text`/`Pressable`, com Reanimated no lugar das animações CSS.

- **Reaproveita:** as 11.006 linhas de lógica, os stores Zustand (Zustand roda em RN sem
  mudança), e a arquitetura de eventos — a `AnimationLayer` consome `GameEvent`, e o
  vocabulário de eventos é fechado e agnóstico de tela; o que muda é como se desenha o
  passo, não o que se desenha.
- **Custo real:** ~10.000 linhas de interface reescritas, sendo as 562 da `ComposedCard` e as
  1.811 do `Board` as mais densas. Semanas, não dias.
- **Onde dói:** duas incógnitas de ecossistema a confirmar na hora — (a) se o Metro resolve os
  imports com extensão explícita (`from '../../shared/text.ts'`), que é o estilo do projeto
  inteiro; (b) o casamento **NativeWind + Tailwind 4**, já que o `styles.css` usa `@theme` e
  `@layer components` da v4. Se a segunda não fechar, o tema vira `StyleSheet` à mão — o que
  aliás já está semiorganizado em [theme.ts](../src/client/theme.ts).
- **Ganho que só ele tem:** atualização OTA (Expo Updates) publica JS **e** assets sem passar
  pela revisão da loja. Isso resolve o §4.4, que é um problema de verdade.
- **Veredito:** o único que dá tato nativo. Vale se o app virar produto, não se for vitrine.

### D. Nativo (Kotlin / Swift) — **não**

Exigiria reescrever o motor em outra linguagem. Dois motores são duas verdades: o invariante
4 diz que o servidor valida com o **mesmo** motor que o cliente, por import relativo. Um
motor em Kotlin e outro em TypeScript divergem no primeiro caso de borda da pilha de
efeitos, e a divergência aparece como dessincronia em partida real, não como teste vermelho.
O determinismo do `reduce` deixa de ser verificável entre as duas pontas.

Descartado por arquitetura, não por esforço.

---

## 4. A conta que toda porta paga

### 4.1. O tabuleiro é desenhado para monitor

São 5 slots por lado (`SLOTS_PER_SIDE = 5`), duas fileiras, mais mão, zonas e placas de
herói. A geometria é `clamp(70px, min(8.6vw, 16.5vh), 142px)` — o piso é 720p, e o único
`@media` do CSS quebra em 1100px, movendo a trilha lateral para 62px. Abaixo disso não há
desenho: num retrato de 390pt, cinco slots dão 78pt de largura por carta, **antes** das
bordas. A carta vira selo e os números impressos ficam ilegíveis.

Isto é decisão de produto, não de tecnologia. As saídas conhecidas: paisagem obrigatória;
mão em gaveta que sobe; toque longo para ampliar (o `CardZoom` já existe); campo com rolagem
horizontal. Nenhuma é grátis, e a escolha muda o desenho.

**A boa notícia:** o fluxo de alvo já é *toque-toque*, não arrastar. `TargetMode` no
[Board.tsx:34-38](../src/client/components/Board.tsx#L34-L38) faz clicar-a-carta →
clicar-o-alvo, que é exatamente o gesto certo para dedo. O que não viaja é `hover:` — 8 usos
no TSX e 25 no CSS, todos precisando virar estado de pressão ou sumir.

### 4.2. Os assets estão em resolução de impressão

`public/assets/` tem **74MB**. Mas o que o cliente **carrega** hoje é menos que isso, porque
a decisão nº 23 aposentou a arte impressa — `public/assets/cards` (42MB) sobrevive só como
fonte de recorte, offline.

| Pasta | Tamanho | Carregada? | Observação |
|---|---:|---|---|
| `cards/` | 42MB | **não** | fonte do recorte, não vai para o app |
| `heroes/` | 19MB | sim | 9 PNGs de ~2,1MB **cada** |
| `img/` | 5,7MB | parcial | `bg_gameBattle.png` = 3,1MB; `black-merchant.png` (2,5MB) não é referenciada em lugar nenhum |
| `arte/` | 7,4MB | sim | 78 webp de ~95KB — **bem otimizada** |
| `molde/` | 699KB | sim | webp |
| `fontes/` | 720KB | sim | woff2 self-hospedadas |

Payload de runtime: ~33MB, dos quais **~22MB são 10 arquivos PNG que nunca foram
otimizados** enquanto a pasta `arte/` era. Converter heróis e fundo para webp em resolução de
tela derruba isso para algo perto de 12MB — e isso **vale para a web também**, hoje, com ou
sem app. É provavelmente a melhoria de maior retorno deste documento inteiro.

### 4.3. Rede móvel quebra SSE, e o relógio não perdoa

A partida online vive de um `EventSource` aberto. No celular ele cai a cada troca de
Wi-Fi/4G e a cada ida para segundo plano (o iOS suspende o socket). O cliente já tem o
mecanismo de recuperação — `lastSeq` descarta repetido e o servidor reentrega por `?desde=N`
([matches.ts:325-336](../server/matches.ts#L325-L336)) — então reconectar funciona.

Dois detalhes que só aparecem no celular:

1. O cliente sempre pede `desde=0` ([matchStore.ts:348-349](../src/client/stores/matchStore.ts#L348-L349)),
   e o `Last-Event-ID` que o navegador reenvia na reconexão não é lido pelo servidor, apesar
   de o comentário da rota dizer que é. Na web isso é inofensivo (o `lastSeq` filtra). No
   celular, com reconexão a cada poucos minutos, cada uma reentrega **a partida inteira**
   desde o começo. Custa banda e cresce com a duração do jogo.
2. O relógio é de 60s por turno e 7s por reação, e três passes seguidos entregam a partida
   (`PASSES_UNTIL_FORFEIT = 3`). Um telefonema no meio do turno pode custar a partida. Um app
   precisa de pausa por segundo plano, ou de prazos diferentes no celular — e isso é regra de
   jogo, então é decisão do DevLukkas.

### 4.4. Carta nova exige build nova (só nas portas de loja)

O catálogo é **código compilado no cliente** (`src/data/*.ts`), por decisão nº 22 — é o que
faz o estúdio gravar diff no git em vez de linha em banco. Na web isso é ótimo: carta nova é
deploy, minutos. Numa loja, carta nova vira submissão e revisão — dias.

Quem escapa: PWA e Capacitor com os assets web servidos remotamente, e Expo com OTA. Quem não
escapa: nativo. É mais um prego no caixão da porta D.

### 4.5. O estúdio não vai junto

`npm run estudio` reescreve arquivos `.ts` no disco do repositório. Isso não existe num
telefone, e não deveria: sem `--admin` nenhuma rota de escrita sequer é montada, inclusive em
produção. O app é cliente de jogo — hub, coleção, construtor, partida. O estúdio fica no
desktop, onde o git está.

---

## 5. Recomendação

Em fases, cada uma entregando valor sozinha e pagando a próxima:

1. **Responsivo + PWA.** Resolve o §4.1 (que é a conta cara e inevitável), o §4.2 (que
   beneficia a web hoje) e o §4.3.1. Entrega jogável no celular sem loja, sem conta de
   desenvolvedor, sem revisão. Se parar aqui, ainda assim foi a melhoria mais valiosa.
2. **Capacitor**, se estar na loja virar requisito. Sobre a fase 1, é embalagem: ícones,
   splash, HTTPS e submissão.
3. **Expo/RN**, só se o tato nativo virar requisito de produto. É reescrita de interface, e
   as fases 1 e 2 já terão respondido as perguntas de desenho que ela precisa como entrada.

O que **não** fazer em nenhum cenário: reimplementar o motor fora do TypeScript.

---

## 6. O que este estudo não decide

Nada aqui é compromisso. As perguntas em aberto, todas de produto:

- O celular joga em retrato ou paisagem travada?
- O relógio de turno muda no celular, ou o app precisa pausar em segundo plano?
- A loja é requisito, ou instalar pela tela inicial basta?
- O treino offline (que roda o motor local, sem servidor) é argumento suficiente para app?

Respondidas essas, vira decisão nº 31.
