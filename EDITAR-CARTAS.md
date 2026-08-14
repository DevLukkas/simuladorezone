# 🃏 Editar e atualizar cartas do Ezone

Guia de como o jogo lê uma carta, o que muda sozinho ao editar os arquivos de dados
e o que exige mexer em código.

**Resposta curta para a dúvida mais comum:**
mudar o texto do campo `efeito` **não muda o comportamento da carta**. O texto é
legenda; quem manda nas regras são os campos `effects`, `triggeredAbilities`,
`activatedAbilities` e `onAttach` — e cada `type`/`trigger` deles só funciona se
existir um *handler* escrito no código. Há **uma exceção real**, a palavra
"Aptidão", explicada na seção [A exceção](#-a-exceção-a-palavra-aptidão-é-lida-do-texto).

---

## 📁 Onde ficam as cartas

Existem dois catálogos no repositório. Eles têm o mesmo formato, mas são projetos
diferentes — edite o do jogo que você está rodando.

| Projeto | Catálogo | Motor de efeitos |
|---|---|---|
| `frontend/` (legado, Phaser) | `frontend/src/data/*.js` | `frontend/src/scenes/GameScene.js` + `frontend/src/effects/` |
| `jogo/` (reescrita, TS) | `jogo/src/data/*.ts` | `jogo/src/engine/` |

Arquivos por tipo de carta (iguais nos dois): `criaturas`, `habilidades`, `itens`,
`comandos`, `cenarios`.

**As cartas não vêm do banco de dados.** No legado, o catálogo é montado em tempo de
import em [GameScene.js:88-97](frontend/src/scenes/GameScene.js#L88-L97):

```js
const ALL_CARDS = [
  ...normalize(criaturas, "criatura"),
  ...normalize(habilidades, "habilidade"),
  ...
]
```

O backend Laravel guarda só *posse* de carta (`source_id`, `nome_card`, `quantity` —
ver [PlayerCollectionController.php](backend/app/Http/Controllers/PlayerCollectionController.php)).
Stats, elemento, raridade e efeito saem sempre dos arquivos `.js`/`.ts`.

---

## 🧬 Anatomia de uma carta

```js
{
  // ---- IDENTIDADE: aparece na tela, não decide regra ----
  id: 43,
  nome: 'Proteção do Escudeiro',
  tipo: 'Habilidade',
  efeito: 'A criatura anexada recebe +1/+2. Uma vez por turno, quando...',  // ← LEGENDA
  img: '43.png',
  edicao: 'Matilhas & Predadores',

  // ---- REGRA: é isto que o motor executa ----
  elemento: 'terra',      // decide em que criatura pode ser anexada
  raridade: 'comum',      // decide quantos pontos vale ao ser destruída
  ataque: 2, vida: 4,     // só criaturas

  effects: [              // contínuo, enquanto estiver em campo/anexada
    { type: 'modify_stat', target: 'attached_creature', stat: 'attack', value: 1 },
    { type: 'modify_stat', target: 'attached_creature', stat: 'defense', value: 2 },
  ],
  triggeredAbilities: [   // dispara sozinho quando algo acontece
    {
      id: 'protecao_escudeiro_nega_ataque',
      trigger: 'your_creature_matching_is_targeted_by_attack',
      action: { type: 'optional_discard_self_prevent_attack',
                filter: { name_includes: 'Contos' } },
    },
  ],
  activatedAbilities: [], // o jogador ativa manualmente (tem custo/timing)
  onAttach: [],           // resolve uma vez, no momento em que anexa
}
```

Regra mental: **`efeito` é o que o jogador lê; `effects` é o que o jogo faz.** Os dois
precisam ser mantidos em sincronia à mão — nada valida um contra o outro.

Onde o `efeito` é realmente usado: preview do deck builder
([DeckBuilderScene.js:780](frontend/src/scenes/DeckBuilderScene.js#L780)) e o painel de
detalhes em jogo ([GameScene.js:5979](frontend/src/scenes/GameScene.js#L5979)).

---

## ⚠️ A exceção: a palavra "Aptidão" é lida do texto

Este é o único caso em que escrever no `efeito` muda a regra. Em
[GameScene.js:5790-5801](frontend/src/scenes/GameScene.js#L5790-L5801):

```js
const hasAptidao = String(cardData.efeito ?? cardData.effect ?? "")
  .toLowerCase().includes("aptidão") || ....includes("aptidao");

creature.canAttackFromTurn = hasAptidao ? this._turnNumber : this._turnNumber + 1;
```

Ou seja: **qualquer carta cuja descrição contenha "Aptidão" ou "aptidao" ataca no
mesmo turno em que é invocada** (ignora a summoning sickness). A reescrita mantém o
mesmo comportamento em `temAptidao()`
([cartasEmJogo.ts:89](jogo/src/engine/cartasEmJogo.ts#L89), usada em
[reduzir.ts:312](jogo/src/engine/reduzir.ts#L312)).

Hoje **nenhuma carta** dos dois catálogos tem essa palavra no texto — então é uma
armadilha adormecida. Cuidado ao escrever descrições: uma frase como *"tem aptidão
para o combate"* concede ataque imediato sem querer.

---

## ✅ O que já funciona só editando os dados

Estes `type` têm handler genérico e aceitam qualquer valor/filtro novo sem tocar em código:

| `type` | O que faz | Onde vive |
|---|---|---|
| `modify_stat` | +X/+Y na criatura anexada; aceita `conditionals` (por raça/elemento) e `value_per_card` | [modifyStat.js](frontend/src/effects/modifyStat.js) |
| `aura_modify_stat` | buff contínuo no campo inteiro, com `filter` por raça/elemento/nome | [creatureEffects.js](frontend/src/effects/creatureEffects.js) |

Portanto, editar **só os dados** basta para:

- mudar `ataque`/`vida` de uma criatura;
- mudar o `value` de um buff (de +1 para +2);
- mudar o `filter`/`conditionals` de um buff (de `Besta` para `Anfibio`);
- mudar `elemento`, `raridade`, `edicao`, `nome`, `img`;
- corrigir o texto do `efeito` (só a legenda);
- criar uma carta nova cujo efeito use apenas os tipos acima.

---

## 🔧 O que exige código

Todo o resto. O motor **não interpreta** `type`/`trigger` desconhecido — ele é um
`if`/`switch` escrito à mão, carta a carta.

No legado, o final do despacho de criatura é literalmente
([GameScene.js:5277-5280](frontend/src/scenes/GameScene.js#L5277-L5280)):

```js
this._logAction("Efeito de criatura registrado para implementação de escolha/resposta.");
return false;
```

Traduzindo: **um `type` que ninguém implementou não dá erro — a carta simplesmente
não faz nada**, e o log solta uma mensagem genérica. É o modo de falha mais perigoso
deste projeto, porque parece que funcionou.

### Cartas hoje com efeito declarado e sem handler (legado)

Levantamento feito cruzando os `type`/`trigger` dos arquivos de dados com o que o
código de `frontend/src/` realmente procura:

| Carta | Arquivo | O que não roda |
|---|---|---|
| 11 — defesa Absoluta do Tridente | `habilidades.js` | `self_exiled` / `return_to_hand` |
| 13 — Reflexos de Morte | `habilidades.js` | `attached_creature_is_attacked` / `choose_enemy_creature_then_deal_damage` |
| 14 — Afogamento | `habilidades.js` | `chosen_enemy_creature_dies` / `destroy_self` |
| 18 — Mapa do Tesouro | `itens.js` | `attached_creature_deals_player_damage` / `draw_then_discard` |
| 7 — Sapomerlim, Mago dos Contos | `criaturas.js` | `choose_your_creature_change_element_until_end_turn` |
| 33 — Sapotristan, o Escudeiro dos Contos | `criaturas.js` | `choose_creature_swap_stats_while_element_changed` |

O buff de stat dessas cartas funciona (é `modify_stat`); o parágrafo em prosa é que
não acontece. Em `jogo/` a maioria já foi implementada — segue pendente só
`self_exiled`/`return_to_hand` (carta 11), porque **nada no jogo exila** ainda: é
decisão de design, não bug.

### Onde escrever o handler

**Legado (`frontend/`)** — pontos de entrada por categoria:

| Categoria | Função |
|---|---|
| Efeito contínuo de stat | `EFFECT_HANDLERS` em [effects/index.js](frontend/src/effects/index.js) |
| Gatilho de criatura | `_resolveCreatureTriggerAction` ([GameScene.js:5218](frontend/src/scenes/GameScene.js#L5218)) |
| Gatilho de anexo | `_resolveAttachmentTriggeredAbilities` ([GameScene.js:3867](frontend/src/scenes/GameScene.js#L3867)) |
| Ao anexar | `_resolveOnAttachEffects` ([GameScene.js:3845](frontend/src/scenes/GameScene.js#L3845)) |
| Habilidade ativada | `ABILITY_HANDLERS` em [effects/index.js](frontend/src/effects/index.js) |

**Reescrita (`jogo/`)** — despacho central em
[engine/efeitos.ts](jogo/src/engine/efeitos.ts) (`switch (acao.type)` nas linhas 343 e
539) e os tipos em [data/tipos.ts](jogo/src/data/tipos.ts).

Diferença importante entre os dois:

- em `frontend/` (JS puro), um `type` **inventado ou com typo** passa batido e vira no-op silencioso;
- em `jogo/` (TS), um `type` fora da união `AcaoDeGatilho`/`GatilhoTipo` **quebra o `npm run typecheck`**. Mas atenção: se você adicionar o membro na união e esquecer o `case` no `switch`, volta a ser no-op silencioso — não há guarda de exaustividade (`never`).

---

## 📝 Fluxos de edição

### 1. Só ajustar número ou texto

1. Edite o objeto em `frontend/src/data/<tipo>.js` (ou `jogo/src/data/<tipo>.ts`).
2. Com o Vite rodando (`npm run dev`), o HMR recarrega sozinho.
3. **Comece uma partida nova** — cartas já em campo guardam cópia dos stats no
   momento da invocação (`baseStats`), então o valor antigo persiste até o reinício.

### 2. Mudar o comportamento de uma carta existente

1. Reescreva o `efeito` (legenda) **e** o bloco de regra correspondente.
2. Confira se todo `type`/`trigger` usado tem handler (busque a string em
   `frontend/src/scenes/` e `frontend/src/effects/`; se der zero, não existe).
3. Se não existir, implemente no ponto de entrada da tabela acima.
4. Em `jogo/`: `npm run typecheck && npm test`.

### 3. Criar uma carta nova

1. **Escolha o `id`** — precisa ser único no catálogo inteiro (não só no arquivo).
   Em `jogo/` os ids são contíguos por formato (clássico 1–45, Quatro Elementos
   46–78) e há teste que falha se abrir lacuna.
2. **Arte**: coloque o PNG em `frontend/public/assets/cards/` com o nome no padrão
   `NN.png` (zero à esquerda) e aponte `img`.
3. **Monte o objeto** — ou use o Admin Panel: ele tem formulário com campo de JSON
   para `effects`/`triggeredAbilities`/`activatedAbilities`, gera o objeto pronto e
   copia para a área de transferência
   ([AdminPanelScene.js:655](frontend/src/scenes/AdminPanelScene.js#L655)).
   ⚠️ Dois detalhes: o Admin Panel **não salva no jogo** — só monta o JSON e guarda
   rascunho no `localStorage`, você cola no `.js` à mão. E o botão ADMINISTRADOR no
   menu só aparece para quem é admin; hoje o atalho por nome de usuário está
   desativado ([MenuScene.js:590-592](frontend/src/scenes/MenuScene.js#L590-L592) —
   a linha com `'xlukao'` está comentada), então vale `is_admin` ou `role === 'admin'`
   na conta.
4. **Cole** no array do arquivo do tipo certo.
5. Implemente os handlers que faltarem.
6. Teste no deck builder (a carta aparece?) e em partida (o efeito roda?).

---

## 🪤 Armadilhas conhecidas

**Nome é chave de regra.** Vários filtros casam por texto do nome —
`filter: { name_includes: 'Contos' }`, `attachedName: 'Tridente Poderoso de Atlas'`,
`name_includes: 'Tridente'`. Renomear uma carta pode desligar silenciosamente o efeito
de outra. Antes de renomear, procure o nome antigo nos arquivos de dados.

**Elemento decide o que pode anexar.** Habilidade/item só anexa em criatura de
elemento igual, ou se ambos forem `neutro`/`vazio`
([targeting.js:23](frontend/src/game/targeting.js#L23)):

```js
if (attachmentElement === creatureElement) return true
return ['neutro','vazio'].includes(attachmentElement)
    && ['neutro','vazio'].includes(creatureElement)
```

Trocar o `elemento` de uma habilidade pode torná-la inanexável nos decks existentes.

**Raridade vale ponto.** `lendaria` = 2 pontos, `rara` = 1, resto 0
([gameRules.js:22](frontend/src/game/gameRules.js#L22)). As variantes `lendario`,
`legendary`, `raro`, `rare` são aceitas — o catálogo tem 3 `'lendaria'` e 1
`'lendario'` (carta 3) e ambos pontuam igual. Mas prefira `lendaria`/`rara`: em
`jogo/` o tipo `Raridade` só aceita `'comum' | 'rara' | 'lendaria'`.

**Trocar o `id` quebra coleção e decks salvos.** O banco referencia cartas por
`source_id`. Mudar o `id` de uma carta existente faz decks e coleções apontarem para
carta errada ou para o vazio. Ids são para nascer e não mudar.

**`ataque`/`vida` vs. `attack`/`defense`.** Os dados usam português; o motor normaliza
para inglês em `normalize()` ([GameScene.js:74](frontend/src/scenes/GameScene.js#L74)).
Dentro dos blocos `effects`, sempre use `attack`/`defense` — `stat: 'vida'` é ignorado
em silêncio (`if (!['attack','defense'].includes(stat)) return`).

---

## 🧪 Como validar depois de editar

**Legado (`frontend/`)** — não tem suíte de testes; a validação é manual:

```bash
cd frontend
npm run dev
```

- a carta aparece na Biblioteca e no Deck Builder com os dados novos?
- em partida, o efeito realmente acontece?
- o log de ações mostrou *"Efeito de criatura registrado para implementação de
  escolha/resposta."*? → o handler não existe.

**Reescrita (`jogo/`)** — tem rede de segurança:

```bash
cd jogo
npm run typecheck   # type inválido em carta quebra aqui
npm test            # inclui integridade do catálogo (ids, nomes, artes)
npm run sim         # 200 partidas simuladas, pega travamento de efeito
```

---

## 📌 Resumo

| Você mudou... | Funciona sozinho? |
|---|---|
| Texto do `efeito` | ✅ (só a legenda muda — **regra nenhuma**) |
| Texto do `efeito` contendo "Aptidão" | ⚠️ muda regra: ataca no turno da invocação |
| `ataque`, `vida`, `nome`, `img`, `edicao` | ✅ |
| `value`/`filter` de `modify_stat` ou `aura_modify_stat` | ✅ |
| `elemento`, `raridade` | ✅ (mas afeta anexo e pontuação — ver armadilhas) |
| `id` | ⚠️ quebra decks/coleção salvos no banco |
| Qualquer outro `type` ou `trigger` novo | ❌ exige handler no código |
