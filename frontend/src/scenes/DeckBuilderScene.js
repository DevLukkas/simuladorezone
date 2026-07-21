import { Scene } from 'phaser'
import { saveScene } from '../utils/session.js'
import { criaturas } from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens } from '../data/itens.js'
import { comandos } from '../data/comandos.js'
import { cenarios } from '../data/cenarios.js'
import { createDeck, deleteDeck, getDecks, getHeroes, getPlayerCards, shareBuild, updateDeck } from '../api/gameApi.js'

const LOCAL_DECK_KEY = 'ezone_deck_builder_draft'
const MAX_DECK = 40
const MAX_COPIES = 3

const TYPE_LABEL = {
  criatura: 'CRIATURA',
  habilidade: 'HABILIDADE',
  item: 'ITEM',
  comando: 'COMANDO',
  cenario: 'CENÁRIO',
}

const TYPE_COLOR = {
  criatura: '#ffdd77',
  habilidade: '#64e8ff',
  item: '#8dff9d',
  comando: '#d58dff',
  cenario: '#7dffc9',
}

const RARITY_COLOR = {
  comum: 0x888888,
  rara: 0xffdd77,
  lendaria: 0xff44ff,
}

function normalize(cards, cardType) {
  return cards.map(card => ({
    ...card,
    uid: `${cardType}:${card.id}`,
    name: card.nome ?? card.name,
    card_type: cardType,
    attack: card.ataque ?? 0,
    defense: card.vida ?? 0,
    element: card.elemento ?? card.element ?? null,
    rarity: card.raridade ?? card.rarity ?? 'comum',
  }))
}

const ALL_CARDS = [
  ...normalize(criaturas, 'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(card => ({ ...card, elemento: 'neutro' })), 'item'),
  ...normalize(comandos, 'comando'),
  ...normalize(cenarios, 'cenario'),
]

export default class DeckBuilderScene extends Scene {
  constructor() {
    super({ key: 'DeckBuilderScene' })

    this._allCards = []
    this._filtered = []
    this._deck = []
    this._deckName = 'Novo Baralho'
    this._filterType = 'todos'
    this._searchText = ''
    this._scroll = 0
    this._deckScroll = 0
    this._htmlElements = []
    this._collectionLoaded = false
    this._savedDecks = []
    this._deckLimits = null
    this._activeDeckId = null
    this._activeDeckLocked = false
    this._selectedSlot = 1
    this._ownedHeroes = []
    this._activeHero = null
  }

  preload() {
    ALL_CARDS.forEach(card => {
      const key = `deck_card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) this.load.image(key, file)
    })

    ;['tennor', 'ispisher', 'gimlou', 'badur', 'morgon'].forEach((key) => {
      const textureKey = this._heroTextureKey(key)
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, `/assets/heroes/avatar_heroi_${key}.png`)
      }
    })
  }

  create() {
    saveScene('DeckBuilderScene')

    const { width, height } = this.cameras.main

    this._allCards = []
    this._filtered = []

    this._buildBackground(width, height)
    this._buildHeader(width)
    this._buildPanels(width, height)
    this._renderCollection()
    this._renderCollection()
    this._renderDeck()
    this._showPreview(null)
    this._loadPlayerCollection()

 this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
  const l = this._layout

  const insideCollection =
    pointer.x >= l.collectionX &&
    pointer.x <= l.collectionX + l.collectionW &&
    pointer.y >= l.collectionY + 150 &&
    pointer.y <= l.collectionY + l.collectionH - 45

  const insideDeck =
    pointer.x >= l.deckX &&
    pointer.x <= l.deckX + l.deckW &&
    pointer.y >= l.deckY + 120 &&
    pointer.y <= l.deckY + l.deckH - 90

  if (insideCollection) {
    const maxScroll = Math.max(0, this._filtered.length - 15)

    if (deltaY > 0) {
      this._scroll = Math.min(maxScroll, this._scroll + 5)
    } else {
      this._scroll = Math.max(0, this._scroll - 5)
    }

    this._renderCollection()
    return
  }

  if (insideDeck) {
    const visibleDeckSlots = 28
    const maxDeckScroll = Math.max(0, MAX_DECK - visibleDeckSlots)

    if (deltaY > 0) {
      this._deckScroll = Math.min(maxDeckScroll, this._deckScroll + 7)
    } else {
      this._deckScroll = Math.max(0, this._deckScroll - 7)
    }

    this._renderDeck()
  }
})

    this.events.on('shutdown', () => this._removeHtmlElements())
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()

    for (let i = 0; i < 44; i++) {
      const t = i / 43
      const r = Math.round(4 + 18 * t)
      const g = Math.round(14 + 74 * t)
      const b = Math.round(36 + 108 * t)

      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      bg.fillRect((width / 44) * i - height * 0.35, 0, width / 44 + height * 0.7, height)
      bg.rotation = -0.1
    }

    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.48)
  }

  _buildHeader(width) {
    this.add.text(30, 38, '< MENU', {
      fontSize: '14px',
      color: '#bff5ff',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ color: '#ffffff' }) })
      .on('pointerout', function () { this.setStyle({ color: '#bff5ff' }) })
      .on('pointerdown', () => this.scene.start('MenuScene'))

    this.add.text(width / 2, 42, 'CONSTRUTOR DE BARALHOS', {
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 5,
    }).setOrigin(0.5)

    // this.add.text(width / 2, 76, 'Monte, salve, importe e exporte decks do EZone TCG', {
    //   fontSize: '13px',
    //   color: '#8fe8ff',
    // }).setOrigin(0.5)
  }

  _buildPanels(width, height) {
    this._layout = {
      collectionX: 40,
      collectionY: 120,
      collectionW: 430,
      collectionH: height - 160,

      previewX: 500,
      previewY: 120,
      previewW: 260,
      previewH: height - 160,

      deckX: 790,
      deckY: 120,
      deckW: width - 830,
      deckH: height - 160,
    }

    const l = this._layout

    this._drawPanel(l.collectionX, l.collectionY, l.collectionW, l.collectionH, 'COLEÇÃO')
    this._drawPanel(l.previewX, l.previewY, l.previewW, l.previewH, 'DETALHES')
    this._drawPanel(l.deckX, l.deckY, l.deckW, l.deckH, 'BARALHO ATUAL')

    this._buildCollectionControls()
    this._buildDeckControls()

    this._collectionContainer = this.add.container(0, 0)
    this._deckContainer = this.add.container(0, 0)
    this._previewContainer = this.add.container(0, 0)
  }

  _drawPanel(x, y, w, h, title) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x06111f, 0.82)
      .setStrokeStyle(1, 0x1e9cc1)

    this.add.rectangle(x + w / 2, y + 28, w - 24, 38, 0x071523, 0.94)
      .setStrokeStyle(1, 0x64e8ff)

    this.add.text(x + w / 2, y + 28, title, {
      fontSize: '13px',
      color: '#9df7ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _buildCollectionControls() {
    const l = this._layout

    this._searchInput = this._addHtmlInput(
      l.collectionX + 20,
      l.collectionY + 72,
      l.collectionW - 40,
      'Buscar carta...'
    )

    this._searchInput.addEventListener('input', () => {
      this._searchText = this._searchInput.value.trim().toLowerCase()
      this._applyFilter()
    })

    const filters = [
      { key: 'todos', label: 'TODAS' },
      { key: 'criatura', label: 'CRIATURA' },
      { key: 'habilidade', label: 'HABIL.' },
      { key: 'item', label: 'ITEM' },
      { key: 'comando', label: 'COM.' },
      { key: 'cenario', label: 'CEN.' },
    ]

    this._filterButtons = []

    filters.forEach((filter, i) => {
      const x = l.collectionX + 38 + i * 68
      const y = l.collectionY + 116

      const btn = this._addSmallButton(
        x,
        y,
        62,
        filter.label,
        filter.key === this._filterType ? 0x64e8ff : 0x1e9cc1,
        () => {
          this._filterType = filter.key
          this._scroll = 0
          this._refreshFilterButtons()
          this._applyFilter()
        }
      )

      btn._filterKey = filter.key
      this._filterButtons.push(btn)
    })
  }

  _refreshFilterButtons() {
    this._filterButtons.forEach(btn => {
      const bg = btn.getAt(0)
      const stripe = btn.getAt(1)
      const active = btn._filterKey === this._filterType

      bg.setStrokeStyle(1, active ? 0x64e8ff : 0x1e9cc1)
      stripe.setFillStyle(active ? 0x64e8ff : 0x1e9cc1, 0.95)
    })
  }

  _buildDeckControls() {
    const l = this._layout
    const topY = l.deckY + 72

    this.add.text(l.deckX + 20, l.deckY + 28, '|', {
      fontSize: '13px',
      color: '#64e8ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    this._buildHeroSelector(l.deckX + 46, l.deckY + 28)
    this._slotSelect = this._addHtmlSelect(l.deckX + 82, l.deckY + 28, 330)
    this._slotSelect.addEventListener('change', () => this._selectDeckSlot(Number(this._slotSelect.value)))

    this.add.text(l.deckX + 20, topY, 'Nome:', {
      fontSize: '13px',
      color: '#9df7ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    this._deckNameInput = this._addHtmlInput(l.deckX + 72, topY, 210, 'Nome do baralho')
    this._deckNameInput.value = this._deckName

    this._deckNameInput.addEventListener('input', () => {
      if (this._activeDeckLocked) {
        this._deckNameInput.value = this._deckName
        return
      }
      this._deckName = this._deckNameInput.value
      this._saveLocalDeck()
    })

    this._deckCounterText = this.add.text(l.deckX + l.deckW - 90, topY, `0 / ${MAX_DECK}`, {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const btnY = l.deckY + l.deckH - 38
    this._addNeonButton(l.deckX + 42, btnY, 76, 'SALVAR', 0x8dff9d, () => this._saveDeck())
    this._addNeonButton(l.deckX + 124, btnY, 74, 'EXPORT', 0x64e8ff, () => this._exportDecklist())
    this._addNeonButton(l.deckX + 204, btnY, 74, 'IMPORT', 0xd58dff, () => this._fileInput?.click())
    this._addNeonButton(l.deckX + 284, btnY, 70, 'SHARE', 0xffdd77, () => this._shareCurrentBuild())
    this._addNeonButton(l.deckX + 362, btnY, 70, 'LIMPAR', 0xff7777, () => {
      if (this._activeDeckLocked) {
        this._toast('Slot VIP bloqueado: não é possível editar.')
        return
      }
      this._deck = []
      this._refreshDeck()
    })

    this._fileInput = this._addHtmlFileInput('.txt')
    this._fileInput.addEventListener('change', () => this._importDecklist(this._fileInput.files?.[0]))
  }

  _buildHeroSelector(x, y) {
    const button = this.add.container(x, y)
    const shadow = this.add.rectangle(0, 2, 48, 48, 0x01060d, 0.92)
    const frame = this.add.rectangle(0, 0, 48, 48, 0x071523, 0.98)
      .setStrokeStyle(2, 0xffcc66)
    const artFrame = this.add.rectangle(0, 0, 40, 40, 0x020914, 0.95)
      .setStrokeStyle(1, 0xffdd77, 0.7)
    const art = this.add.image(0, 0, 'deck_card_1').setDisplaySize(36, 36).setVisible(false)
    const empty = this.add.text(0, 0, '+', {
      fontSize: '25px', color: '#ffdd77', fontStyle: 'bold',
    }).setOrigin(0.5)
    const label = this.add.text(0, 33, 'HERÓI', {
      fontSize: '8px', color: '#ffdd77', fontStyle: 'bold',
    }).setOrigin(0.5)

    button.add([shadow, frame, artFrame, art, empty, label])
    button.setSize(52, 58).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => {
      frame.setFillStyle(0x1f2330, 0.98)
      this.tweens.add({ targets: button, scaleX: 1.06, scaleY: 1.06, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerout', () => {
      frame.setFillStyle(0x071523, 0.98)
      this.tweens.add({ targets: button, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerdown', () => {
      if (this._activeDeckLocked) {
        this._toast('Slot VIP bloqueado: não é possível trocar o herói.')
        return
      }
      this._openHeroSelectorModal()
    })

    this._heroSelector = { button, frame, art, empty, label }
    this._refreshHeroSelector()
  }

  _refreshHeroSelector() {
    if (!this._heroSelector) return
    const { art, empty, label, frame } = this._heroSelector
    const hero = this._activeHero
    if (!hero) {
      art.setVisible(false)
      empty.setVisible(true)
      label.setText('HERÓI')
      frame.setStrokeStyle(2, 0xffcc66)
      return
    }

    const textureKey = this._heroTextureKey(hero.key)
    if (this.textures.exists(textureKey)) {
      art.setTexture(textureKey).setDisplaySize(36, 36).setVisible(true)
      empty.setVisible(false)
    } else {
      art.setVisible(false)
      empty.setText(hero.name.slice(0, 1)).setVisible(true)
    }
    label.setText(hero.name.toUpperCase().slice(0, 7))
    frame.setStrokeStyle(2, 0x8dff9d)
  }

  _openHeroSelectorModal() {
    if (!this._ownedHeroes.length) {
      this._toast('Você ainda não possui heróis disponíveis.')
      return
    }

    const { width, height } = this.cameras.main
    const modal = this.add.container(0, 0).setDepth(80)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.76).setOrigin(0).setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, 1070, 540, 0x06111f, 0.99)
      .setStrokeStyle(2, 0xffcc66)
    const title = this.add.text(width / 2, 112, 'ESCOLHA O HERÓI DO BARALHO', {
      fontSize: '25px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const subtitle = this.add.text(width / 2, 144, 'Somente heróis adquiridos podem liderar um baralho.', {
      fontSize: '13px', color: '#9fd6e8',
    }).setOrigin(0.5)
    const close = this.add.text(width / 2 + 493, 105, 'X', {
      fontSize: '18px', color: '#ff9999', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    close.on('pointerdown', () => modal.destroy(true))
    overlay.on('pointerdown', () => modal.destroy(true))
    modal.add([overlay, panel, title, subtitle, close])

    const cards = this._ownedHeroes.slice(0, 5)
    const gap = 198
    const startX = width / 2 - ((cards.length - 1) * gap) / 2
    cards.forEach((hero, index) => {
      const card = this._createOwnedHeroCard(startX + index * gap, height / 2 + 34, hero, () => {
        this._activeHero = hero
        this._refreshHeroSelector()
        this._saveLocalDeck()
        modal.destroy(true)
        this._toast(`${hero.name} agora lidera este baralho.`)
      })
      modal.add(card)
    })
  }

  _createOwnedHeroCard(x, y, hero, onChoose) {
    const card = this.add.container(x, y)
    const selected = this._activeHero?.id === hero.id
    const frame = this.add.rectangle(0, 0, 176, 340, 0x071523, 0.98)
      .setStrokeStyle(2, selected ? 0x8dff9d : 0x64e8ff)
    const name = this.add.text(0, -145, hero.name.toUpperCase(), {
      fontSize: '15px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 150 }, align: 'center',
    }).setOrigin(0.5)
    const race = this.add.text(0, -121, hero.race, {
      fontSize: '11px', color: '#9fd6e8', fontStyle: 'bold',
    }).setOrigin(0.5)
    const artFrame = this.add.rectangle(0, -40, 136, 136, 0x020914, 0.98).setStrokeStyle(1, 0x64e8ff, 0.75)
    const textureKey = this._heroTextureKey(hero.key)
    const art = this.textures.exists(textureKey)
      ? this.add.image(0, -40, textureKey).setDisplaySize(128, 128)
      : this.add.text(0, -40, hero.name.slice(0, 1), { fontSize: '46px', color: '#64e8ff', fontStyle: 'bold' }).setOrigin(0.5)
    const effectName = this.add.text(0, 47, hero.effect_name, {
      fontSize: '11px', color: '#ffdd77', fontStyle: 'bold', wordWrap: { width: 148 }, align: 'center',
    }).setOrigin(0.5)
    const effect = this.add.text(0, 84, hero.effect_description, {
      fontSize: '10px', color: '#d8f8ff', wordWrap: { width: 148 }, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5, 0)
    const select = this.add.text(0, 138, selected ? 'SELECIONADO' : 'USAR COMO LÍDER', {
      fontSize: '10px', color: selected ? '#8dff9d' : '#ffffff', backgroundColor: selected ? '#17321f' : '#17313f', padding: { x: 10, y: 6 }, fontStyle: 'bold',
    }).setOrigin(0.5)
    card.add([frame, name, race, artFrame, art, effectName, effect, select])
    card.setSize(176, 340).setInteractive({ useHandCursor: true })
    card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.035, duration: 120, ease: 'Sine.easeOut' }))
    card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 120, ease: 'Sine.easeOut' }))
    card.on('pointerdown', onChoose)
    return card
  }

  _heroTextureKey(key) {
    return `hero_avatar_${key}`
  }

  _addNeonButton(x, y, w, label, accent, onClick) {
    const btn = this.add.container(x, y)

    const bg = this.add.rectangle(0, 0, w, 38, 0x071523, 0.94)
      .setStrokeStyle(1, accent)

    const stripe = this.add.rectangle(-w / 2 + 4, 0, 4, 26, accent, 0.95)

    const text = this.add.text(0, 0, label, {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    btn.add([bg, stripe, text])
    btn.setSize(w, 38).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => {
      bg.setFillStyle(0x0b2740, 0.98)
      this.tweens.add({
        targets: btn,
        scaleX: 1.035,
        scaleY: 1.035,
        duration: 120,
        ease: 'Sine.easeOut',
      })
    })

    btn.on('pointerout', () => {
      bg.setFillStyle(0x071523, 0.94)
      this.tweens.add({
        targets: btn,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Sine.easeOut',
      })
    })

    btn.on('pointerdown', onClick)
    return btn
  }

  _addSmallButton(x, y, w, label, accent, onClick) {
    const btn = this.add.container(x, y)

    const bg = this.add.rectangle(0, 0, w, 30, 0x071523, 0.94)
      .setStrokeStyle(1, accent)

    const stripe = this.add.rectangle(-w / 2 + 3, 0, 3, 20, accent, 0.95)

    const text = this.add.text(2, 0, label, {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    btn.add([bg, stripe, text])
    btn.setSize(w, 30).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.98))
    btn.on('pointerout', () => bg.setFillStyle(0x071523, 0.94))
    btn.on('pointerdown', onClick)

    return btn
  }

  _applyFilter() {
    this._filtered = this._allCards.filter(card => {
      const matchType = this._filterType === 'todos' || card.card_type === this._filterType
      const matchText = !this._searchText || card.name.toLowerCase().includes(this._searchText)
      return matchType && matchText
    })

    this._renderCollection()
  }

  async _loadPlayerCollection() {
    try {
      const response = await getPlayerCards()
      const owned = response.data.data ?? response.data ?? []
      const ownedByUid = new Map(owned.map(entry => [entry.uid ?? `${entry.type}:${entry.id}`, entry]))

      this._allCards = ALL_CARDS
        .map(card => {
          const ownedEntry = ownedByUid.get(card.uid)
          if (!ownedEntry) return null
          return {
            ...card,
            owned_qty: Number(ownedEntry.quantity ?? 0),
          }
        })
        .filter(Boolean)

      this._collectionLoaded = true
      this._scroll = 0
      this._applyFilter()
      await Promise.all([this._loadSavedDecks(), this._loadOwnedHeroes()])
      this._refreshSlotSelect()
      this._selectDeckSlot(this._selectedSlot, { silent: true })
      if (!this._activeDeckId && !this._deck.length) this._loadLocalDeck()
      this._renderDeck()
      this._renderCollection()
    } catch (error) {
      console.warn('Erro ao carregar coleção do jogador:', error)
      this._allCards = []
      this._filtered = []
      this._collectionLoaded = true
      this._loadLocalDeck()
      this._applyFilter()
      this._toast('Não foi possível carregar sua coleção.')
    }
  }

  _renderCollection() {
  const l = this._layout
  this._collectionContainer.removeAll(true)

  if (!this._collectionLoaded) {
    this._collectionContainer.add(
      this.add.text(l.collectionX + l.collectionW / 2, l.collectionY + 260, 'Carregando coleção...', {
        fontSize: '14px',
        color: '#8fe8ff',
        align: 'center',
      }).setOrigin(0.5)
    )
    return
  }

  if (!this._filtered.length) {
    this._collectionContainer.add(
      this.add.text(l.collectionX + l.collectionW / 2, l.collectionY + 260, 'Nenhuma carta disponível\nna sua coleção.', {
        fontSize: '14px',
        color: '#8fe8ff',
        align: 'center',
      }).setOrigin(0.5)
    )
  }

  const visibleCards = this._filtered.slice(this._scroll, this._scroll + 15)

  const cols = 5
  const cardW = 75
  const cardH = 105
  const gapX = 3
  const gapY = 5

  const totalW = cols * cardW + (cols - 1) * gapX
  const startX = l.collectionX + l.collectionW / 2 - totalW / 2 + cardW / 2
  const startY = l.collectionY + 195

  visibleCards.forEach((card, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)

    const x = startX + col * (cardW + gapX)
    const y = startY + row * (cardH + gapY)

    this._collectionContainer.add(this._createCollectionCard(card, x, y, cardW, cardH))
  })

  if (this._collectionFooter) this._collectionFooter.destroy()

  const totalPages = Math.max(1, Math.ceil(this._filtered.length / 15))
  const currentPage = Math.floor(this._scroll / 15) + 1

  this._collectionFooter = this.add.text(
    l.collectionX + l.collectionW / 2,
    l.collectionY + l.collectionH - 18,
    `${this._filtered.length} carta(s) | Página ${currentPage}/${totalPages}`,
    {
      fontSize: '14px',
      color: '#8fe8ff',
    }
  ).setOrigin(0.5)
}

_createCollectionCard(card, x, y, w, h) {
  const tile = this.add.container(x, y)

  const copies = this._deckCount(card)
  const ownedQty = Number(card.owned_qty ?? MAX_COPIES)
  const maxCopies = Math.min(MAX_COPIES, ownedQty)
  const maxed = copies >= maxCopies || this._deckTotal() >= MAX_DECK

  const key = `deck_card_${card.id}`

  const art = this.textures.exists(key)
    ? this.add.image(0, 0, key).setDisplaySize(w, h).setAlpha(maxed ? 0.45 : 1)
    : this.add.rectangle(0, 0, w, h, 0x0b1a2d, maxed ? 0.45 : 0.96)

  tile.add(art)

  if (ownedQty > 0) {
    const badge = this.add.rectangle(w / 2 - 9, -h / 2 + 10, 22, 22, 0x000000, 0.85)
      .setStrokeStyle(1, 0x64e8ff)

    const badgeText = this.add.text(w / 2 - 9, -h / 2 + 10, `${copies}/${ownedQty}`, {
      fontSize: '9px',
      color: '#8dff9d',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    tile.add([badge, badgeText])
  }

  tile.setSize(w, h).setInteractive({ useHandCursor: true })

  tile.on('pointerover', () => {
    this._showPreview(card)

    this.tweens.add({
      targets: tile,
      scaleX: 1.06,
      scaleY: 1.06,
      duration: 120,
      ease: 'Sine.easeOut',
    })
  })

  tile.on('pointerout', () => {
    this.tweens.add({
      targets: tile,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
      ease: 'Sine.easeOut',
    })
  })

  tile.on('pointerdown', () => this._addCardToDeck(card))

  return tile
}

  _showPreview(card) {
    const l = this._layout
    this._previewContainer.removeAll(true)

    const cx = l.previewX + l.previewW / 2

    if (!card) {
      this._previewContainer.add(
        this.add.text(cx, l.previewY + 220, 'Passe o mouse\nsobre uma carta', {
          fontSize: '14px',
          color: '#8fe8ff',
          align: 'center',
        }).setOrigin(0.5)
      )
      return
    }

    const key = `deck_card_${card.id}`

    const frame = this.add.rectangle(cx, l.previewY + 190, 178, 250, 0x06111f, 0.88)
      .setStrokeStyle(2, RARITY_COLOR[card.rarity] ?? 0x64e8ff)

    const art = this.textures.exists(key)
      ? this.add.image(cx, l.previewY + 190, key).setDisplaySize(168, 238)
      : this.add.rectangle(cx, l.previewY + 190, 168, 238, 0x0b1a2d, 0.96)

    const name = this.add.text(cx, l.previewY + 335, card.name, {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: l.previewW - 30 },
    }).setOrigin(0.5)

    const type = this.add.text(cx, l.previewY + 365, TYPE_LABEL[card.card_type] ?? '', {
      fontSize: '12px',
      color: TYPE_COLOR[card.card_type] ?? '#64e8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const effect = this.add.text(cx, l.previewY + 375, card.efeito ?? card.effect ?? 'Sem efeito descrito.', {
      fontSize: '11px',
      color: '#d8f8ff',
      align: 'center',
      wordWrap: { width: l.previewW - 36 },
      lineSpacing: 3,
    }).setOrigin(0.5, 0)

    this._previewContainer.add([frame, art, name, type, effect])  

    if (card.card_type === 'criatura') {
      const stats = this.add.text(cx, l.previewY + l.previewH - 35, `ATQ ${card.attack}   VIDA ${card.defense}`, {
        fontSize: '14px',
        color: '#ffdd77',
        fontStyle: 'bold',
      }).setOrigin(0.5)

      this._previewContainer.add(stats)
    }
  }

  _renderDeck() {
    const l = this._layout
    this._deckContainer.removeAll(true)

    const cols = 7
    const visibleSlots = 28

    const cardW = 60
    const cardH = 80
    const gapX = 3
    const gapY = 3

    const totalW = cols * cardW + (cols - 1) * gapX
    const startX = l.deckX + l.deckW / 2 - totalW / 2 + cardW / 2
    const startY = l.deckY + 140

    for (let i = 0; i < visibleSlots; i++) {
      const slotIndex = this._deckScroll + i

      if (slotIndex >= MAX_DECK) break

      const col = i % cols
      const row = Math.floor(i / cols)

      const x = startX + col * (cardW + gapX)
      const y = startY + row * (cardH + gapY)

      const entry = this._deck[slotIndex]

      if (entry) {
        this._deckContainer.add(this._createDeckSlot(entry.card, entry.qty, x, y, cardW, cardH))
      } else {
        const empty = this.add.rectangle(x, y, cardW, cardH, 0x071523, 0.72)
          .setStrokeStyle(1, 0x123c4a)

        this._deckContainer.add(empty)
      }
    }

    if (this._deckFooter) this._deckFooter.destroy()

    const currentPage = Math.floor(this._deckScroll / 7) + 1
    const totalPages = Math.max(1, Math.ceil(MAX_DECK / 7))

    this._deckFooter = this.add.text(
      l.deckX + l.deckW / 2,
      l.deckY + l.deckH - 82,
      `Slots ${this._deckScroll + 1}-${Math.min(this._deckScroll + visibleSlots, MAX_DECK)} de ${MAX_DECK} | Página ${currentPage}/${totalPages}`,
      {
        fontSize: '12px',
        color: '#8fe8ff',
      }
    ).setOrigin(0.5)

    this._deckCounterText.setText(`${this._deckTotal()} / ${MAX_DECK}`)
    this._deckCounterText.setStyle({
      color: this._deckTotal() >= MAX_DECK ? '#ff7777' : '#ffffff',
    })
  }

  _createDeckSlot(card, qty, x, y, w, h) {
    const tile = this.add.container(x, y)

    const key = `deck_card_${card.id}`

    const art = this.textures.exists(key)
      ? this.add.image(0, 0, key).setDisplaySize(w, h)
      : this.add.rectangle(0, 0, w, h, 0x0b1a2d, 0.96)

    tile.add(art)

    const badge = this.add.rectangle(w / 2 - 10, -h / 2 + 10, 22, 22, 0x000000, 0.85)
      .setStrokeStyle(1, 0x64e8ff)

    const badgeText = this.add.text(w / 2 - 10, -h / 2 + 10, `x${qty}`, {
      fontSize: '12px',
      color: '#8dff9d',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    tile.add([badge, badgeText])

    tile.setSize(w, h).setInteractive({ useHandCursor: true })

    tile.on('pointerover', () => {
      this._showPreview(card)
      this.tweens.add({
        targets: tile,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 120,
        ease: 'Sine.easeOut',
      })
    })

    tile.on('pointerout', () => {
      this.tweens.add({
        targets: tile,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Sine.easeOut',
      })
    })

    tile.on('pointerdown', () => this._removeCardFromDeck(card))

    return tile
  }

  _deckTotal() {
    return this._deck.reduce((sum, entry) => sum + entry.qty, 0)
  }

  _deckCount(cardOrId) {
    const uid = typeof cardOrId === 'object' ? cardOrId.uid : null
    const id = typeof cardOrId === 'object' ? cardOrId.id : cardOrId
    return this._deck.find(entry => (
      uid ? entry.card.uid === uid : Number(entry.card.id) === Number(id)
    ))?.qty ?? 0
  }

  _addCardToDeck(card) {
    if (this._activeDeckLocked) {
      this._toast('Slot VIP bloqueado: não é possível editar.')
      return
    }

    if (this._deckTotal() >= MAX_DECK) {
      this._toast('O baralho já está com 40 cartas.')
      return
    }

    const entry = this._deck.find(item => item.card.uid === card.uid)
    const ownedQty = Number(card.owned_qty ?? MAX_COPIES)
    const maxCopies = Math.min(MAX_COPIES, ownedQty)

    if (entry) {
      if (entry.qty >= maxCopies) {
        this._toast(`Você possui ${ownedQty} cópia(s) dessa carta.`)
        return
      }

      entry.qty++
    } else {
      this._deck.push({ card, qty: 1 })
    }

    this._refreshDeck()
  }

  _removeCardFromDeck(card) {
    if (this._activeDeckLocked) {
      this._toast('Slot VIP bloqueado: não é possível editar.')
      return
    }

    const index = this._deck.findIndex(item => item.card.uid === card.uid)
    if (index === -1) return

    this._deck[index].qty--

    if (this._deck[index].qty <= 0) {
      this._deck.splice(index, 1)
    }

    this._refreshDeck()
  }

  _refreshDeck() {
    this._saveLocalDeck()
    this._renderDeck()
    this._renderCollection()
  }

  async _saveDeck() {
    if (this._deckTotal() <= 0) {
      this._toast('Adicione cartas ao baralho primeiro.')
      return
    }

    if (this._activeDeckLocked) {
      this._toast('Este baralho está em um espaço VIP bloqueado.')
      return
    }

    if (!this._activeHero?.id) {
      this._toast('Escolha um herói para liderar o baralho antes de salvar.')
      return
    }

    try {
      const payload = this._localDeckData()
      const response = this._activeDeckId
        ? await updateDeck(this._activeDeckId, payload)
        : await createDeck({ ...payload, slot_number: this._selectedSlot })

      const saved = response.data.data
      this._activeDeckId = saved.id
      this._activeDeckLocked = Boolean(saved.locked)
      await this._loadSavedDecks()
      this._refreshSlotSelect()
      this._saveLocalDeck()
      this._toast(response.data.message ?? 'Baralho salvo na conta.')
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível salvar no banco.')
    }
  }

  _localDeckData() {
    return {
      name: this._deckNameInput?.value?.trim() || this._deckName || 'Novo Baralho',
      hero_id: this._activeHero?.id ?? null,
      cards: this._deck.map(entry => ({
        uid: entry.card.uid,
        type: entry.card.card_type,
        id: entry.card.id,
        qty: entry.qty,
      })),
    }
  }

  _saveLocalDeck() {
    try {
      localStorage.setItem(LOCAL_DECK_KEY, JSON.stringify(this._localDeckData()))
    } catch (error) {
      console.warn('Erro ao salvar deck:', error)
    }
  }

  _loadLocalDeck() {
    try {
      const raw = localStorage.getItem(LOCAL_DECK_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)

      if (saved?.name) {
        this._deckName = saved.name
        if (this._deckNameInput) this._deckNameInput.value = saved.name
      }

      if (saved?.hero_id) {
        this._activeHero = this._ownedHeroes.find(hero => hero.id === Number(saved.hero_id)) ?? null
        this._refreshHeroSelector()
      }

      if (!Array.isArray(saved?.cards)) return

      const deck = []
      let total = 0

      saved.cards.forEach(item => {
        const id = Number(item.id)
        const qty = Math.min(Number(item.qty), MAX_COPIES, MAX_DECK - total)
        const uid = item.uid ?? (item.type ? `${item.type}:${id}` : null)
        const card = this._findCardByUidOrId(uid, id)

        if (!card || qty <= 0) return

        deck.push({ card, qty })
        total += qty
      })

      this._deck = deck
    } catch (error) {
      console.warn('Erro ao carregar deck:', error)
    }
  }

  async _loadSavedDecks() {
    try {
      const response = await getDecks()
      this._savedDecks = response.data.data ?? []
      this._deckLimits = response.data.limits ?? null
    } catch (error) {
      console.warn('Erro ao carregar baralhos salvos:', error)
      this._savedDecks = []
      this._deckLimits = null
    }
  }

  async _loadOwnedHeroes() {
    try {
      const response = await getHeroes()
      const heroes = response.data.data ?? response.data ?? []
      this._ownedHeroes = heroes.filter(hero => hero.owned)
      this._refreshHeroSelector()
    } catch (error) {
      console.warn('Erro ao carregar heróis do jogador:', error)
      this._ownedHeroes = []
      this._refreshHeroSelector()
    }
  }

  _refreshSlotSelect() {
    if (!this._slotSelect) return

    const allowedSlots = Number(this._deckLimits?.allowed_slots ?? 2)
    const maxSlots = Number(this._deckLimits?.max_slots ?? 8)
    this._slotSelect.innerHTML = ''

    for (let slot = 1; slot <= maxSlots; slot++) {
      const deck = this._savedDecks.find(item => Number(item.slot_number) === slot)
      const locked = slot > allowedSlots
      const option = document.createElement('option')
      option.value = String(slot)
      option.textContent = deck
        ? `${locked ? 'Slot VIP ' : ''}#${slot}: ${deck.name}`
        : locked
          ? `#${slot}: Slot VIP`
          : `#${slot}: vazio`
      option.disabled = locked && !deck
      this._slotSelect.appendChild(option)
    }

    this._slotSelect.value = String(this._selectedSlot)
    this._refreshSlotSelectStyle()
  }

  _selectDeckSlot(slot, options = {}) {
    this._selectedSlot = slot
    if (this._slotSelect && this._slotSelect.value !== String(slot)) {
      this._slotSelect.value = String(slot)
    }
    this._refreshSlotSelectStyle()

    const deck = this._savedDecks.find(item => Number(item.slot_number) === slot)
    if (deck) {
      this._loadDeckFromServer(deck, options)
      return
    }

    this._activeDeckId = null
    this._activeDeckLocked = slot > Number(this._deckLimits?.allowed_slots ?? 2)
    this._activeHero = null
    this._deck = []
    this._deckName = 'Novo Baralho'
    if (this._deckNameInput) this._deckNameInput.value = this._deckName
    this._refreshHeroSelector()
    this._refreshDeck()
    this._refreshSlotSelectStyle()
    if (!options.silent) {
      this._toast(this._activeDeckLocked ? 'Slot VIP bloqueado.' : `Espaço #${slot} vazio.`)
    }
  }

  _openSavedDecksModal() {
    const { width, height } = this.cameras.main
    const modal = this.add.container(0, 0).setDepth(80)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.72).setOrigin(0).setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, 760, 510, 0x06111f, 0.98).setStrokeStyle(2, 0xffdd77)
    const title = this.add.text(width / 2, 128, 'Meus baralhos', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const limit = this._deckLimits
    const subtitle = this.add.text(width / 2, 158, limit
      ? `Plano ${limit.membro_vip ? 'VIP' : 'gratuito'}: ${limit.allowed_slots}/${limit.max_slots} espaços liberados`
      : 'Carregando espaços da conta...', {
      fontSize: '13px',
      color: '#9fd6e8',
    }).setOrigin(0.5)
    modal.add([overlay, panel, title, subtitle])

    const allowedSlots = Number(this._deckLimits?.allowed_slots ?? 2)
    const maxSlots = Number(this._deckLimits?.max_slots ?? 8)
    for (let slot = 1; slot <= maxSlots; slot++) {
      const deck = this._savedDecks.find(item => Number(item.slot_number) === slot)
      const locked = slot > allowedSlots
      const x = width / 2 - 290 + ((slot - 1) % 2) * 300
      const y = 210 + Math.floor((slot - 1) / 2) * 72
      const bg = this.add.rectangle(x, y, 270, 54, locked ? 0x28242c : 0x071523, 0.96).setStrokeStyle(1, locked ? 0x66666f : 0x64e8ff)
      const name = this.add.text(x - 120, y - 10, deck?.name ?? `Espaço ${slot} vazio`, {
        fontSize: '13px',
        color: locked ? '#b8b8bd' : '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
      const meta = this.add.text(x - 120, y + 12, locked ? 'Bloqueado: requer VIP' : deck ? `${deck.cards?.reduce((sum, card) => sum + Number(card.qty ?? 0), 0)} cartas` : 'Livre para salvar novo baralho', {
        fontSize: '11px',
        color: '#9fd6e8',
      }).setOrigin(0, 0.5)
      modal.add([bg, name, meta])

      if (deck) {
        const load = this._addSmallButton(x + 86, y, 68, 'ABRIR', locked ? 0x66666f : 0x8dff9d, () => {
          modal.destroy(true)
          this._loadDeckFromServer(deck)
        })
        modal.add(load)
      }
    }

    const close = this._addNeonButton(width / 2, 638, 110, 'FECHAR', 0xff7777, () => modal.destroy(true))
    overlay.on('pointerdown', () => modal.destroy(true))
    modal.add(close)
  }

  _loadDeckFromServer(deck, options = {}) {
    const loaded = []
    let total = 0
    ;(deck.cards ?? []).forEach(item => {
      const card = this._findCardByUidOrId(item.uid, item.id)
      const qty = Math.min(Number(item.qty ?? 0), MAX_COPIES, MAX_DECK - total)
      if (!card || qty <= 0) return
      loaded.push({ card, qty })
      total += qty
    })

    this._deck = loaded
    this._deckName = deck.name ?? 'Novo Baralho'
    this._activeDeckId = deck.id
    this._activeDeckLocked = Boolean(deck.locked)
    this._activeHero = this._ownedHeroes.find(hero => hero.id === deck.hero?.id) ?? deck.hero ?? null
    this._selectedSlot = Number(deck.slot_number ?? this._selectedSlot)
    if (this._slotSelect) this._slotSelect.value = String(this._selectedSlot)
    this._refreshSlotSelectStyle()
    if (this._deckNameInput) this._deckNameInput.value = this._deckName
    this._refreshHeroSelector()
    this._refreshDeck()
    if (!options.silent) {
      this._toast(deck.locked ? 'Slot VIP: baralho bloqueado para uso/edição.' : 'Baralho carregado.')
    }
  }

  _refreshSlotSelectStyle() {
    if (!this._slotSelect) return
    const allowedSlots = Number(this._deckLimits?.allowed_slots ?? 2)
    const locked = Number(this._selectedSlot) > allowedSlots
    this._slotSelect.style.color = locked ? '#9a8f9f' : '#bff5ff'
    this._slotSelect.style.opacity = locked ? '0.72' : '1'
  }

  _decklistText() {
    const name = this._deckNameInput?.value?.trim() || this._deckName || 'Meu Baralho'

    const lines = [
      '# Ezone decklist',
      `# Nome: ${name}`,
      '# Formato: uid;quantidade;nome',
      '',
    ]

    this._deck.forEach(entry => {
      lines.push(`${entry.card.uid};${entry.qty};${entry.card.name}`)
    })

    return lines.join('\n') + '\n'
  }

  _exportDecklist() {
    if (!this._deck.length) {
      this._toast('Adicione cartas antes de exportar.')
      return
    }

    const name = this._deckNameInput?.value?.trim() || 'deck'

    const safeName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'deck'

    const blob = new Blob([this._decklistText()], {
      type: 'text/plain;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `${safeName}.txt`

    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(url)

    this._toast('Decklist exportada.')
  }

  async _shareCurrentBuild() {
    if (!this._deck.length) {
      this._toast('Monte um baralho antes de compartilhar.')
      return
    }

    const name = this._deckNameInput?.value?.trim() || this._deckName || 'Build EZone'
    const coverCard = this._pickSharedBuildCover()

    try {
      await shareBuild({
        name,
        cover_image: coverCard ? `${String(coverCard.id).padStart(2, '0')}.png` : null,
        decklist: this._deck.map(entry => ({
          uid: entry.card.uid,
          type: entry.card.card_type,
          id: entry.card.id,
          qty: entry.qty,
          name: entry.card.name,
          rarity: entry.card.rarity,
        })),
      })
      this._toast('Build compartilhada no perfil.')
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível compartilhar a build.')
    }
  }

  _pickSharedBuildCover() {
    return this._deck.find(entry => (
      entry.card.card_type === 'criatura' && entry.card.rarity === 'lendaria'
    ))?.card
      ?? this._deck.find(entry => entry.card.card_type === 'criatura')?.card
      ?? this._deck[0]?.card
      ?? null
  }

  _importDecklist(file) {
    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      const result = this._parseDecklist(String(reader.result ?? ''))

      this._fileInput.value = ''

      if (result.errors.length) {
        this._toast(result.errors[0])
        return
      }

      if (this._activeDeckLocked) {
        this._toast('Slot VIP bloqueado: não é possível importar.')
        return
      }

      this._deck = result.deck
      this._refreshDeck()
      this._toast(`Deck importado com ${result.total} carta(s).`)
    }

    reader.onerror = () => {
      this._fileInput.value = ''
      this._toast('Erro ao ler arquivo.')
    }

    reader.readAsText(file)
  }

  _parseDecklist(text) {
    const entries = new Map()
    const errors = []

    text.split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return

      const parts = line.split(';').map(part => part.trim())

      const rawId = parts[0]
      const uid = rawId.includes(':') ? rawId : null
      const id = Number(uid ? rawId.split(':')[1] : rawId)
      const qty = Number(parts[1])
      const card = this._findCardByUidOrId(uid, id)

      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty <= 0) {
        errors.push(`Linha ${index + 1}: formato inválido.`)
        return
      }

      if (!card) {
        errors.push(`Linha ${index + 1}: carta ${id} não encontrada.`)
        return
      }

      entries.set(card.uid, {
        card,
        qty: (entries.get(card.uid)?.qty ?? 0) + qty,
      })
    })

    const deck = [...entries.values()]
    const total = deck.reduce((sum, entry) => sum + entry.qty, 0)

    const overCopies = deck.find(entry => entry.qty > MAX_COPIES)

    if (overCopies) {
      errors.push(`${overCopies.card.name}: máximo de ${MAX_COPIES} cópias.`)
    }

    if (total > MAX_DECK) {
      errors.push(`Deck com ${total} cartas. Máximo permitido: ${MAX_DECK}.`)
    }

    if (!deck.length) {
      errors.push('Decklist vazia ou inválida.')
    }

    return { deck, total, errors }
  }

  _findCardByUidOrId(uid, id) {
    if (uid) return this._allCards.find(card => card.uid === uid)
    return this._allCards.find(card => Number(card.id) === Number(id))
  }

  _toast(message) {
    if (this._toastText) this._toastText.destroy()

    const { width, height } = this.cameras.main

    this._toastText = this.add.text(width / 2, height - 28, message, {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 18, y: 8 },
    }).setOrigin(0.5).setDepth(20)

    this.time.delayedCall(2500, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }

  _addHtmlInput(x, y, w, placeholder) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height

    const input = document.createElement('input')

    input.type = 'text'
    input.placeholder = placeholder

    const inputH = 34

    input.style.cssText = [
      'position: fixed',
      'left: ' + (canvas.left + x * scaleX) + 'px',
      'top: ' + (canvas.top + y * scaleY - inputH / 2) + 'px',
      'width: ' + (w * scaleX) + 'px',
      'height: ' + inputH + 'px',
      'background: rgba(6, 17, 31, 0.96)',
      'color: #fff',
      'border: 1px solid #64e8ff',
      'border-radius: 4px',
      'box-sizing: border-box',
      'padding: 0 10px',
      'font-size: 13px',
      'outline: none',
      'box-shadow: 0 0 12px rgba(100, 232, 255, 0.12)',
      'z-index: 20',
    ].join(';')

    document.body.appendChild(input)
    this._htmlElements.push(input)

    return input
  }

  _addHtmlSelect(x, y, w) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height
    const select = document.createElement('select')
    const selectH = 28

    select.style.cssText = [
      'position: fixed',
      'left: ' + (canvas.left + x * scaleX) + 'px',
      'top: ' + (canvas.top + y * scaleY - selectH / 2) + 'px',
      'width: ' + (w * scaleX) + 'px',
      'height: ' + selectH + 'px',
      'background: rgba(6, 17, 31, 0.98)',
      'color: #bff5ff',
      'border: 1px solid #64e8ff',
      'border-radius: 4px',
      'box-sizing: border-box',
      'padding: 0 8px',
      'font-size: 12px',
      'font-weight: 700',
      'outline: none',
      'box-shadow: 0 0 12px rgba(100, 232, 255, 0.12)',
      'z-index: 20',
    ].join(';')

    document.body.appendChild(select)
    this._htmlElements.push(select)

    return select
  }

  _addHtmlFileInput(accept) {
    const input = document.createElement('input')

    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    document.body.appendChild(input)
    this._htmlElements.push(input)

    return input
  }

  _removeHtmlElements() {
    this._htmlElements.forEach(el => el.remove())
    this._htmlElements = []
  }
}
