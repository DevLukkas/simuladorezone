import { Scene } from 'phaser'
import { saveScene } from '../utils/session.js'
import { criaturas }   from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens }       from '../data/itens.js'
import { comandos }    from '../data/comandos.js'
import { cenarios }    from '../data/cenarios.js'

/**
 * DeckBuilderScene — editor de baralho estilo Duel Links / Duel Masters
 *
 * Layout (1280 × 720):
 * ┌────────────────────┬──────────────┬───────────────────────────┐
 * │  COLEÇÃO  (460px)  │ PREVIEW(220) │  BARALHO ATUAL  (600px)   │
 * │  [busca + filtros] │  [imagem]    │  [nome] [salvar] [limpar]  │
 * │  [grade de cartas] │  [stats]     │  [grade 10×4 de slots]    │
 * └────────────────────┴──────────────┴───────────────────────────┘
 */

// ── Cor padrão por tipo ─────────────────────────────────────────────────────
const TYPE_DEFAULT_COLOR = {
  criatura:   0x886633,
  habilidade: 0x2255aa,
  item:       0x668844,
  comando:    0x773399,
  cenario:    0x336655,
}

// ── Normaliza um array de cartas para o formato interno da cena ─────────────
function normalize(cards, card_type) {
  return cards.map(c => ({
    ...c,
    name:      c.nome,
    card_type,
    attack:    c.ataque   ?? 0,
    defense:   c.vida     ?? 0,
    element:   c.elemento ?? null,
    rarity:    c.raridade,
    color:     TYPE_DEFAULT_COLOR[card_type],
  }))
}

// ── Coleção completa montada a partir dos arquivos de dados ─────────────────
const ALL_CARDS = [
  ...normalize(criaturas,   'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(c => ({ ...c, elemento: 'neutro' })), 'item'),
  ...normalize(comandos,    'comando'),
  ...normalize(cenarios,    'cenario'),
]

// Elementos: criaturas e habilidades têm elemento; itens = sempre neutro; comando/cenário = sem elemento
const ELEMENT_LABEL = {
  fogo: '🔥 Fogo', agua: '💧 Água', terra: '⛰ Terra',
  vento: '🌬 Vento', neutro: '○ Neutro', vazio: '■ Vazio', cosmico: '★ Cósmico',
}
const ELEMENT_COLOR = {
  fogo: 0xff4400, agua: 0x2299ff, terra: 0x886644,
  vento: 0x88ddaa, neutro: 0x888888, vazio: 0x6633aa, cosmico: 0xcc55ff,
}
const ELEMENT_HEX = {
  fogo: '#ff6633', agua: '#2299ff', terra: '#bb8855',
  vento: '#88ddaa', neutro: '#888888', vazio: '#9955cc', cosmico: '#dd77ff',
}

const RARITY_COLOR = { comum: 0x888888, rara: 0xffcc00, lendaria: 0xff44ff }
const RARITY_HEX   = { comum: '#888888', rara: '#ffcc00', lendaria: '#ff44ff' }

const TYPE_LABEL = { criatura: 'CRIATURA', habilidade: 'HABILIDADE', comando: 'COMANDO', cenario: 'CENÁRIO', item: 'ITEM' }
const TYPE_COLOR = { criatura: '#cc8844', habilidade: '#4488ff', comando: '#aa44cc', cenario: '#44aa88', item: '#44cc44' }
const MAX_DECK     = 40
const MAX_COPIES   = 3   // máximo de cópias por carta
const LOCAL_DECK_KEY = 'ezone_deck_builder_draft'

export default class DeckBuilderScene extends Scene {
  constructor() {
    super({ key: 'DeckBuilderScene' })

    this._allCards    = []   // coleção completa
    this._filtered    = []   // resultado do filtro atual
    this._deck        = []   // [{ card, qty }]
    this._deckName    = 'Novo Baralho'
    this._filterType  = 'all'
    this._searchText  = ''
    this._collScroll  = 0    // índice do topo da grade de coleção
    this._preview     = null // carta sendo pré-visualizada
    this._htmlEls     = []

    // layout fixo
    this._L = {
      collX: 0,   collW: 460,
      prevX: 460, prevW: 220,
      deckX: 680, deckW: 600,
      topH:  60,  // altura da barra de topo
    }
  }

  // ────────────────────────────────────────────────────────────────
  preload() {
    // Carrega imagem de cada carta pelo id: 01.png, 02.png ...
    ALL_CARDS.forEach(card => {
      const key  = `card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) {
        this.load.image(key, file)
      }
    })
  }

  // ────────────────────────────────────────────────────────────────
  create() {
    saveScene('DeckBuilderScene')
    this._allCards   = [...ALL_CARDS]
    this._filtered   = [...ALL_CARDS]
    this._loadLocalDeck()

    const { width, height } = this.cameras.main
    this._W = width; this._H = height

    // Fundo
    this.add.rectangle(0, 0, width, height, 0x080d0a).setOrigin(0)

    this._buildTopBar()
    this._buildCollectionPanel()
    this._buildPreviewPanel()
    this._buildDeckPanel()

    this.events.on('shutdown', () => this._destroyHtml())
  }

  // ══════════════════════════════════════════════════════════════
  // BARRA SUPERIOR
  // ══════════════════════════════════════════════════════════════

  _buildTopBar() {
    const { _W, _H } = this
    const topH = this._L.topH

    this.add.rectangle(0, 0, _W, topH, 0x0d1a10).setOrigin(0)
    this.add.rectangle(0, topH, _W, 2, 0x2a5a2a).setOrigin(0)

    // Voltar
    this.add.text(20, topH / 2, '← MENU', { fontSize: '14px', color: '#aaaaaa' })
      .setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ color: '#ffffff' }) })
      .on('pointerout',  function () { this.setStyle({ color: '#aaaaaa' }) })
      .on('pointerdown', () => this.scene.start('MenuScene'))

    // Título
    this.add.text(_W / 2, topH / 2, 'Biblioteca de Cartas', {
      fontSize: '20px', color: '#4caf50', fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  // ══════════════════════════════════════════════════════════════
  // PAINEL DE COLEÇÃO (esquerda)
  // ══════════════════════════════════════════════════════════════

  _buildCollectionPanel() {
    const { collX, collW, topH } = this._L
    const panelH = this._H - topH

    // fundo
    this.add.rectangle(collX, topH, collW, panelH, 0x0a1208).setOrigin(0)
    this.add.rectangle(collX + collW, topH, 2, panelH, 0x1a3a1a).setOrigin(0)

    // título painel
    this.add.text(collX + collW / 2, topH + 22, 'COLEÇÃO', {
      fontSize: '14px', color: '#4caf50', fontStyle: 'bold',
    }).setOrigin(0.5)

    // barra de busca via HTML
    this._searchInput = this._addHtmlInput(collX + 12, topH + 48, collW - 24, 26, 'Buscar carta...')
    this._searchInput.addEventListener('input', () => {
      this._searchText = this._searchInput.value.trim().toLowerCase()
      this._applyFilter()
    })

    // filtros de tipo
    const filters = [
      { key: 'all',        label: 'TODOS'      },
      { key: 'criatura',   label: 'CRIATURA'   },
      { key: 'habilidade', label: 'HABILIDADE' },
      { key: 'item',       label: 'ITEM'       },
      { key: 'comando',    label: 'COMANDO'    },
      { key: 'cenario',    label: 'CENÁRIO'    },
    ]
    const fw = (collW - 16) / filters.length
    filters.forEach((f, i) => {
      const active = this._filterType === f.key
      const btn = this.add.text(
        collX + 8 + i * fw + fw / 2,
        topH + 82,
        f.label,
        {
          fontSize: '11px',
          color:           active ? '#ffffff' : '#888888',
          backgroundColor: active ? '#1b5e20' : '#111a13',
          padding: { x: 6, y: 4 },
        }
      ).setOrigin(0.5).setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => {
        this._filterType = f.key
        // rebuilda para atualizar estado dos filtros
        this._collContainer.removeAll(true)
        this._collScroll = 0
        this._buildFilterButtons()
        this._applyFilter()
      })
      this._filterBtns = this._filterBtns ?? []
      this._filterBtns.push(btn)
    })

    // container de cards
    this._collContainer = this.add.container(0, 0)
    this._collStartY = topH + 106
    this._collBounds = { x: collX, y: this._collStartY, w: collW, h: this._H - this._collStartY - 30 }

    // Máscara para a grade de cartas
    const maskShape = this.make.graphics()
    maskShape.fillRect(
      this._collBounds.x,
      this._collBounds.y,
      this._collBounds.w,
      this._collBounds.h
    )
    this._collContainer.setMask(maskShape.createGeometryMask())

    // scroll com roda do mouse
    this.input.on('wheel', (pointer, objs, dx, dy) => {
      if (pointer.x < this._L.collX + this._L.collW) {
        this._collScroll = Math.max(
          0,
          Math.min(
            this._collScroll + (dy > 0 ? 3 : -3),
            Math.max(0, this._filtered.length - this._visibleRows() * this._cardsPerRow())
          )
        )
        this._renderCollection()
      }
    })

    this._renderCollection()
  }

  _buildFilterButtons() {
    // remove botões de filtro antigos e recria
    const { collX, collW, topH } = this._L
    const filters = [
      { key: 'all',        label: 'TODOS'      },
      { key: 'criatura',   label: 'CRIATURA'   },
      { key: 'habilidade', label: 'HABILIDADE' },
      { key: 'item',       label: 'ITEM'       },
      { key: 'comando',    label: 'COMANDO'    },
      { key: 'cenario',    label: 'CENÁRIO'    },
    ]
    if (this._filterBtns) {
      this._filterBtns.forEach(b => b.destroy())
    }
    this._filterBtns = []
    const fw = (collW - 16) / filters.length
    filters.forEach((f, i) => {
      const active = this._filterType === f.key
      const btn = this.add.text(
        collX + 8 + i * fw + fw / 2,
        topH + 82,
        f.label,
        {
          fontSize: '11px',
          color:           active ? '#ffffff' : '#888888',
          backgroundColor: active ? '#1b5e20' : '#111a13',
          padding: { x: 6, y: 4 },
        }
      ).setOrigin(0.5).setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => {
        this._filterType = f.key
        this._collScroll  = 0
        this._buildFilterButtons()
        this._applyFilter()
      })
      this._filterBtns.push(btn)
    })
  }

  _cardsPerRow()  { return 4 }
  _visibleRows()  { return Math.floor(this._collBounds.h / 108) }

  _applyFilter() {
    const type = this._filterType
    const text = this._searchText
    this._filtered = this._allCards.filter(c => {
      const matchType = type === 'all' || c.card_type === type
      const matchText = !text || c.name.toLowerCase().includes(text)
      return matchType && matchText
    })
    this._collScroll = 0
    this._renderCollection()
  }

  _renderCollection() {
    this._collContainer.removeAll(true)

    const cw   = 90,  ch   = 100
    const padX = 16,  padY = 8
    const cols = this._cardsPerRow()
    const { collX, collW } = this._L
    const startX = collX + (collW - cols * cw - (cols - 1) * padX) / 2
    const startY = this._collStartY

    const startIdx = this._collScroll
    const visible  = this._visibleRows() * cols + cols
    const toRender = this._filtered.slice(startIdx, startIdx + visible)

    toRender.forEach((card, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x   = startX + col * (cw + padX)
      const y   = startY + row * (ch + padY)

      const inDeck   = this._deckCount(card.id)
      const maxed    = inDeck >= MAX_COPIES || this._deckTotal() >= MAX_DECK

      // fundo / imagem da mini-carta
      const key     = `card_${card.id}`
      const hasImg  = this.textures.exists(key)
      let bg
      if (hasImg) {
        bg = this.add.image(x + cw / 2, y + ch / 2, key)
          .setDisplaySize(cw, ch)
          .setAlpha(maxed ? 0.35 : 1)
          .setInteractive({ useHandCursor: true })
        // borda de raridade por cima
        const border = this.add.rectangle(x + cw / 2, y + ch / 2, cw, ch)
          .setStrokeStyle(1, RARITY_COLOR[card.rarity] ?? 0x555555)
          .setFillStyle()
        this._collContainer.add(border)
      } else {
        bg = this.add.rectangle(x + cw / 2, y + ch / 2, cw, ch, card.color ?? 0x223344, maxed ? 0.4 : 1)
          .setStrokeStyle(1, RARITY_COLOR[card.rarity] ?? 0x555555)
          .setInteractive({ useHandCursor: true })
      }

      bg.on('pointerover', () => {
        hasImg ? bg.setAlpha(maxed ? 0.25 : 0.85) : bg.setStrokeStyle(2, 0xffffff)
        this._showPreview(card)
      })
      bg.on('pointerout', () => {
        hasImg ? bg.setAlpha(maxed ? 0.35 : 1) : bg.setStrokeStyle(1, RARITY_COLOR[card.rarity] ?? 0x555555)
      })
      bg.on('pointerdown', () => this._addCardToDeck(card))

      // tipo
      const typeLabel = this.add.text(x + cw / 2, y + 10, TYPE_LABEL[card.card_type] ?? '', {
        fontSize: '8px', color: TYPE_COLOR[card.card_type] ?? '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      // stats se criatura
      const statsY = y + ch - 18
      let statsEl = null
      if (card.card_type === 'criatura') {
        statsEl = this.add.text(x + cw / 2, statsY, `ATK ${card.attack}`, {
          fontSize: '9px', color: '#ffcc44',
        }).setOrigin(0.5)
      }

      // ponto de elemento (cartas que têm elemento)
      if (card.element) {
        const elDot = this.add.circle(x + 10, y + ch - 10, 5, ELEMENT_COLOR[card.element] ?? 0x888888)
        this._collContainer.add(elDot)
      }

      // contador de cópias no deck
      let countEl = null
      if (inDeck > 0) {
        const badgeBg = this.add.rectangle(x + cw - 10, y + 10, 18, 18, 0x000000, 0.8)
        countEl = this.add.text(x + cw - 10, y + 10, String(inDeck), {
          fontSize: '11px', color: '#4caf50', fontStyle: 'bold',
        }).setOrigin(0.5)
        this._collContainer.add([badgeBg, countEl])
      }

      const els = [bg, typeLabel]
      if (statsEl) els.push(statsEl)
      this._collContainer.add(els)
    })

    // contador total
    if (this._collFooter) this._collFooter.destroy()
    const { collX: cx, collW: cw2 } = this._L
    this._collFooter = this.add.text(
      cx + cw2 / 2, this._H - 16,
      `${this._filtered.length} carta(s)`,
      { fontSize: '12px', color: '#555555' }
    ).setOrigin(0.5)
  }

  // ══════════════════════════════════════════════════════════════
  // PAINEL DE PREVIEW (centro)
  // ══════════════════════════════════════════════════════════════

  _buildPreviewPanel() {
    const { prevX, prevW, topH } = this._L
    const panelH = this._H - topH

    this.add.rectangle(prevX, topH, prevW, panelH, 0x080d0a).setOrigin(0)
    this.add.rectangle(prevX + prevW, topH, 2, panelH, 0x1a3a1a).setOrigin(0)

    this.add.text(prevX + prevW / 2, topH + 22, 'DETALHES', {
      fontSize: '13px', color: '#4caf50', fontStyle: 'bold',
    }).setOrigin(0.5)

    this._previewContainer = this.add.container(0, 0)
    this._showPreview(null)
  }

  _showPreview(card) {
    if (!this._previewContainer) return
    this._previewContainer.removeAll(true)
    const { prevX, prevW, topH } = this._L
    const cx = prevX + prevW / 2

    if (!card) {
      this._previewContainer.add(
        this.add.text(cx, topH + 200, 'Passe o mouse\nsobre uma carta', {
          fontSize: '13px', color: '#444444', align: 'center',
        }).setOrigin(0.5)
      )
      return
    }

    // Arte da carta (aumentada)
    const cardH = 193, cardW = 150
    const artY  = topH + 46
    const artCX = cx, artCY = artY + cardH / 2
    const imgKey = `card_${card.id}`
    let bg
    if (this.textures.exists(imgKey)) {
      bg = this.add.image(artCX, artCY, imgKey).setDisplaySize(cardW, cardH)
    } else {
      bg = this.add.rectangle(artCX, artCY, cardW, cardH, card.color ?? 0x223344)
    }
    bg.setStrokeStyle && bg.setStrokeStyle(2, RARITY_COLOR[card.rarity] ?? 0x555555)

    // Nome
    const nameY = artY + cardH + 18
    const nameT = this.add.text(cx, nameY, card.name, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: prevW - 16 }, align: 'center',
    }).setOrigin(0.5)

    // Raridade
    const rarityT = this.add.text(cx, nameY + 22, (card.rarity ?? 'comum').toUpperCase(), {
      fontSize: '10px', color: RARITY_HEX[card.rarity] ?? '#888888', fontStyle: 'bold',
    }).setOrigin(0.5)

    // Elemento (se houver)
    let elementT = null
    if (card.element) {
      elementT = this.add.text(cx, nameY + 40, ELEMENT_LABEL[card.element] ?? card.element, {
        fontSize: '12px', color: ELEMENT_HEX[card.element] ?? '#aaaaaa', fontStyle: 'bold',
      }).setOrigin(0.5)
    }

    // Cópias no deck
    const copies  = this._deckCount(card.id)
    const copyBaseY = card.element ? nameY + 60 : nameY + 42
    const copyT = this.add.text(cx, copyBaseY, `No deck: ${copies}/${MAX_COPIES}`, {
      fontSize: '11px', color: copies >= MAX_COPIES ? '#cc3333' : '#4caf50',
    }).setOrigin(0.5)

    // Divisor
    const divider = this.add.rectangle(cx, copyBaseY + 16, prevW - 24, 1, 0x1a3a1a).setOrigin(0.5)

    // Efeito da carta
    const efeitoY = copyBaseY + 28
    const efeitoTxt = card.efeito ?? card.effect ?? ''
    const efeitoT = this.add.text(cx, efeitoY, efeitoTxt, {
      fontSize: '10px', color: '#cccccc',
      wordWrap: { width: prevW - 20 }, align: 'center',
      lineSpacing: 3,
    }).setOrigin(0.5, 0)




    // ATK / Vida (apenas criaturas)
    const statsBase = efeitoY + (efeitoT.height || 0) + 22
    if (card.card_type === 'criatura') {
      const statsDivider = this.add.rectangle(cx, statsBase - 20, prevW - 24, 1, 0x1a3a1a).setOrigin(0.5)
      const atkT = this.add.text(cx - 36, statsBase, `ATK\n${card.attack}`, {
        fontSize: '12px', color: '#ff8844', align: 'center',
      }).setOrigin(0.5)
      const defT = this.add.text(cx + 36, statsBase, `Vida\n${card.defense}`, {
        fontSize: '12px', color: '#4488ff', align: 'center',
      }).setOrigin(0.5)
      this._previewContainer.add([statsDivider, atkT, defT])
    }

    const baseEls = [bg, nameT, rarityT, copyT, divider, efeitoT]
    if (elementT) baseEls.push(elementT)
    this._previewContainer.add(baseEls)

    // atalho texto
    const hintT = this.add.text(cx, this._H - 80, 'Clique na carta\npara adicionar\nao baralho', {
      fontSize: '10px', color: '#334433', align: 'center',
    }).setOrigin(0.5)
    this._previewContainer.add(hintT)
  }

  // ══════════════════════════════════════════════════════════════
  // PAINEL DO BARALHO (direita)
  // ══════════════════════════════════════════════════════════════

  _buildDeckPanel() {
    const { deckX, deckW, topH } = this._L
    const panelH = this._H - topH

    this.add.rectangle(deckX, topH, deckW, panelH, 0x090d08).setOrigin(0)

    // cabeçalho do deck
    const hdrY = topH + 22
    this.add.text(deckX + 16, hdrY, 'BARALHO:', { fontSize: '13px', color: '#888888' }).setOrigin(0, 0.5)

    // input nome do deck
    this._deckNameInput = this._addHtmlInput(deckX + 95, hdrY, 200, 28, 'Nome do baralho')
    this._deckNameInput.value = this._deckName
    this._deckNameInput.addEventListener('input', () => {
      this._deckName = this._deckNameInput.value
      this._saveLocalDeck()
    })

    // contador
    this._deckCountText = this.add.text(deckX + deckW - 80, hdrY, '0 / 40', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0, 0.5)

    // botões
    const btnSave = this.add.text(deckX + deckW - 170, hdrY, 'SALVAR', {
      fontSize: '12px', color: '#ffffff', backgroundColor: '#1b5e20', padding: { x: 10, y: 5 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    btnSave.on('pointerover', () => btnSave.setStyle({ backgroundColor: '#2e7d32' }))
    btnSave.on('pointerout',  () => btnSave.setStyle({ backgroundColor: '#1b5e20' }))
    btnSave.on('pointerdown', () => this._saveDeck())

    const btnClear = this.add.text(deckX + deckW - 66, topH + 46, 'LIMPAR', {
      fontSize: '11px', color: '#888888', backgroundColor: '#1a0808', padding: { x: 8, y: 4 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    btnClear.on('pointerover', () => btnClear.setStyle({ color: '#ff6666' }))
    btnClear.on('pointerout',  () => btnClear.setStyle({ color: '#888888' }))
    btnClear.on('pointerdown', () => { this._deck = []; this._refreshDeck() })

    const btnExport = this.add.text(deckX + 340, topH + 400, 'EXPORTAR DECKLIST', {
      fontSize: '11px', color: '#ffffff', backgroundColor: '#14415f', padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnExport.on('pointerover', () => btnExport.setStyle({ backgroundColor: '#1d5f88' }))
    btnExport.on('pointerout',  () => btnExport.setStyle({ backgroundColor: '#14415f' }))
    btnExport.on('pointerdown', () => this._exportDecklist())

    const btnImport = this.add.text(deckX + 480, topH + 400, 'IMPORTAR DECKLIST', {
      fontSize: '11px', color: '#ffffff', backgroundColor: '#4a2b61', padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnImport.on('pointerover', () => btnImport.setStyle({ backgroundColor: '#68408a' }))
    btnImport.on('pointerout',  () => btnImport.setStyle({ backgroundColor: '#4a2b61' }))
    btnImport.on('pointerdown', () => this._deckFileInput?.click())

    this._deckFileInput = this._addHtmlFileInput('.txt')
    this._deckFileInput.addEventListener('change', () => this._importDecklist(this._deckFileInput.files?.[0]))

    // legenda de raridade
    const legendY = topH + 46
    const rarities = [
      { key: 'common',    label: '● Comum',    color: '#888888' },
      { key: 'uncommon',  label: '● Incomum',  color: '#44aaff' },
      { key: 'rare',      label: '● Raro',     color: '#ffcc00' },
      { key: 'legendary', label: '● Lendário', color: '#ff44ff' },
    ]
    rarities.forEach((r, i) => {
      this.add.text(deckX + 16 + i * 120, legendY, r.label, {
        fontSize: '10px', color: r.color,
      })
    })

    this.add.rectangle(deckX, topH + 62, deckW, 1, 0x1a3a1a).setOrigin(0)

    // container de slots
    this._deckContainer = this.add.container(0, 0)
    this._deckSlotStartY = topH + 72

    this._renderDeck()
  }

  _renderDeck() {
    this._deckContainer.removeAll(true)

    const { deckX, deckW } = this._L
    const cols  = 10
    const rows  = Math.ceil(MAX_DECK / cols)
    const sw    = 48, sh = 64
    const sidePad = 24
    const gridH = 300
    const padX = (deckW - sidePad * 2 - cols * sw) / (cols - 1)
    const padY = (gridH - rows * sh) / (rows - 1)
    const startX = deckX + sidePad
    const startY = this._deckSlotStartY

    // achata o deck em array de cartas individuais para exibir nos slots
    const flat = []
    for (const entry of this._deck) {
      for (let q = 0; q < entry.qty; q++) flat.push(entry.card)
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        const x   = startX + col * (sw + padX) + sw / 2
        const y   = startY + row * (sh + padY) + sh / 2
        const card = flat[idx]

        if (card) {
          // slot preenchido
          const slotKey = `card_${card.id}`
          let bg
          if (this.textures.exists(slotKey)) {
            bg = this.add.image(x, y, slotKey).setDisplaySize(sw, sh)
              .setInteractive({ useHandCursor: true })
          } else {
            bg = this.add.rectangle(x, y, sw, sh, card.color ?? 0x223344)
              .setStrokeStyle(1, RARITY_COLOR[card.rarity] ?? 0x555555)
              .setInteractive({ useHandCursor: true })
          }

          bg.on('pointerover', () => {
            bg.setStrokeStyle ? bg.setStrokeStyle(2, 0xff4444) : bg.setAlpha(0.7)
            this._showPreview(card)
          })
          bg.on('pointerout', () => {
            bg.setStrokeStyle ? bg.setStrokeStyle(1, RARITY_COLOR[card.rarity] ?? 0x555555) : bg.setAlpha(1)
          })
          bg.on('pointerdown', () => this._removeCardFromDeck(card))

          const nameT = this.add.text(x, y, card.name, {
            fontSize: '7px', color: '#ffffff',
            wordWrap: { width: sw - 4 }, align: 'center',
          }).setOrigin(0.5)

          const typeT = this.add.text(x, y + sh / 2 - 9, TYPE_LABEL[card.card_type]?.slice(0, 3) ?? '', {
            fontSize: '7px', color: TYPE_COLOR[card.card_type] ?? '#fff',
          }).setOrigin(0.5)

          this._deckContainer.add([bg, nameT, typeT])
        } else {
          // slot vazio
          const empty = this.add.rectangle(x, y, sw, sh, 0x111811)
            .setStrokeStyle(1, 0x1a2a1a)
          this._deckContainer.add(empty)
        }
      }
    }

    // atualiza contador
    const total = flat.length
    if (this._deckCountText) {
      this._deckCountText.setText(`${total} / ${MAX_DECK}`)
      this._deckCountText.setStyle({ color: total >= MAX_DECK ? '#ff4444' : '#aaaaaa' })
    }

  }

  // ══════════════════════════════════════════════════════════════
  // LÓGICA DO DECK
  // ══════════════════════════════════════════════════════════════

  _deckTotal() {
    return this._deck.reduce((s, e) => s + e.qty, 0)
  }

  _deckCount(cardId) {
    return this._deck.find(e => e.card.id === cardId)?.qty ?? 0
  }

  _addCardToDeck(card) {
    if (this._deckTotal() >= MAX_DECK) return
    const entry = this._deck.find(e => e.card.id === card.id)
    if (entry) {
      if (entry.qty >= MAX_COPIES) return
      entry.qty++
    } else {
      this._deck.push({ card, qty: 1 })
    }
    this._refreshDeck()
  }

  _removeCardFromDeck(card) {
    const idx = this._deck.findIndex(e => e.card.id === card.id)
    if (idx === -1) return
    this._deck[idx].qty--
    if (this._deck[idx].qty <= 0) this._deck.splice(idx, 1)
    this._refreshDeck()
  }

  _refreshDeck() {
    this._saveLocalDeck()
    this._renderDeck()
    this._renderCollection()      // atualiza badges de cópia
    this._showPreview(this._preview ?? null)
  }

  _saveDeck() {
    const name  = this._deckNameInput?.value?.trim() || 'Meu Baralho'
    const total = this._deckTotal()
    if (total === 0) {
      this._toast('Adicione cartas ao baralho primeiro!')
      return
    }
    // TODO: chamar API /api/decks quando o backend estiver pronto
    this._saveLocalDeck()
    console.log('Salvar deck local:', this._localDeckData())
    this._toast(`"${name}" salvo localmente com ${total} carta(s) ✔`)
  }

  _localDeckData() {
    return {
      name: this._deckNameInput?.value?.trim() || this._deckName || 'Novo Baralho',
      cards: this._deck.map(entry => ({
        id: entry.card.id,
        qty: entry.qty,
      })),
    }
  }

  _saveLocalDeck() {
    try {
      localStorage.setItem(LOCAL_DECK_KEY, JSON.stringify(this._localDeckData()))
    } catch (err) {
      console.warn('Não foi possível salvar o deck localmente:', err)
    }
  }

  _loadLocalDeck() {
    try {
      const raw = localStorage.getItem(LOCAL_DECK_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)
      if (typeof saved?.name === 'string' && saved.name.trim()) {
        this._deckName = saved.name.trim()
      }
      if (!Array.isArray(saved?.cards)) return

      const deck = []
      let total = 0
      for (const item of saved.cards) {
        if (total >= MAX_DECK) break

        const id = Number(item?.id)
        const qty = Math.min(Number(item?.qty), MAX_COPIES, MAX_DECK - total)
        const card = this._allCards.find(c => Number(c.id) === id)
        if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0 || !card) continue

        deck.push({ card, qty })
        total += qty
      }
      this._deck = deck
    } catch (err) {
      console.warn('Não foi possível carregar o deck local:', err)
    }
  }

  _decklistText() {
    const name = this._deckNameInput?.value?.trim() || this._deckName || 'Meu Baralho'
    const lines = [
      '# Ezone decklist',
      `# Nome: ${name}`,
      '# Formato: id;quantidade;nome',
      '',
    ]
    for (const entry of this._deck) {
      lines.push(`${entry.card.id};${entry.qty};${entry.card.name}`)
    }
    return lines.join('\n') + '\n'
  }

  _exportDecklist() {
    if (!this._deck.length) {
      this._toast('Adicione cartas antes de exportar!')
      return
    }

    const name = this._deckNameInput?.value?.trim() || this._deckName || 'deck'
    const safeName = name.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'deck'
    const blob = new Blob([this._decklistText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    this._toast('Decklist exportada em TXT!')
  }

  _parseDecklist(text) {
    const entries = new Map()
    const errors = []

    text.split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return

      let id
      let qty
      const parts = line.split(';').map(p => p.trim())
      if (parts.length >= 2) {
        id = Number(parts[0])
        qty = Number(parts[1])
      } else {
        const match = line.match(/^(\d+)\s+(\d+)\b/)
        if (match) {
          id = Number(match[1])
          qty = Number(match[2])
        }
      }

      const card = this._allCards.find(c => Number(c.id) === id)
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
        errors.push(`linha ${index + 1}: formato inválido`)
      } else if (!card) {
        errors.push(`linha ${index + 1}: carta ${id} não encontrada`)
      } else {
        entries.set(card.id, { card, qty: (entries.get(card.id)?.qty ?? 0) + qty })
      }
    })

    const deck = [...entries.values()]
    const total = deck.reduce((sum, entry) => sum + entry.qty, 0)
    const overCopies = deck.find(entry => entry.qty > MAX_COPIES)
    if (overCopies) errors.push(`${overCopies.card.name}: máximo de ${MAX_COPIES} cópias`)
    if (total > MAX_DECK) errors.push(`deck com ${total} cartas; máximo é ${MAX_DECK}`)

    return { deck, total, errors }
  }

  _importDecklist(file) {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const { deck, total, errors } = this._parseDecklist(String(reader.result ?? ''))
      this._deckFileInput.value = ''

      if (errors.length) {
        this._toast(`Importação falhou: ${errors[0]}`)
        return
      }
      if (!deck.length) {
        this._toast('Decklist vazia ou inválida!')
        return
      }

      this._deck = deck
      this._refreshDeck()
      this._toast(`Decklist importada com ${total} carta(s)!`)
    }
    reader.onerror = () => {
      this._deckFileInput.value = ''
      this._toast('Não foi possível ler o arquivo!')
    }
    reader.readAsText(file)
  }

  _toast(msg) {
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(this._W / 2, this._H - 30, msg, {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#1b5e20',
      padding: { x: 20, y: 8 },
    }).setOrigin(0.5).setDepth(20)
    this.time.delayedCall(2500, () => { if (this._toastText) { this._toastText.destroy(); this._toastText = null } })
  }

  // ══════════════════════════════════════════════════════════════
  // UTILITÁRIOS HTML
  // ══════════════════════════════════════════════════════════════

  _addHtmlInput(x, y, w, h, placeholder) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width  / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    input.style.cssText = [
      'position: fixed',
      'left: '   + (canvas.left + x * scaleX) + 'px',
      'top: '    + (canvas.top  + y * scaleY - (h * scaleY) / 2) + 'px',
      'width: '  + (w * scaleX) + 'px',
      'height: ' + (h * scaleY) + 'px',
      'background: #1e1e2e',
      'color: #fff',
      'border: 1px solid #334455',
      'border-radius: 4px',
      'padding: 0 8px',
      'font-size: 12px',
      'outline: none',
      'z-index: 10',
    ].join(';')
    document.body.appendChild(input)
    this._htmlEls.push(input)
    return input
  }

  _addHtmlFileInput(accept) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)
    this._htmlEls.push(input)
    return input
  }

  _destroyHtml() {
    this._htmlEls.forEach(el => el.remove())
    this._htmlEls = []
  }
}
