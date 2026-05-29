import { Scene } from 'phaser'
import { criaturas } from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens } from '../data/itens.js'
import { comandos } from '../data/comandos.js'
import { cenarios } from '../data/cenarios.js'
import { saveScene } from '../utils/session.js'

function normalize(cards, cardType) {
  return cards.map(card => ({
    ...card,
    name: card.nome ?? card.name,
    card_type: cardType,
    element: card.elemento ?? card.element ?? 'neutro',
    rarity: card.raridade ?? card.rarity,
  }))
}

const ALL_CARDS = [
  ...normalize(criaturas, 'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(card => ({ ...card, elemento: 'neutro' })), 'item'),
  ...normalize(comandos, 'comando'),
  ...normalize(cenarios, 'cenario'),
]

const FILTERS = [
  { key: 'todos', label: 'TODAS' },
  { key: 'criatura', label: 'CRIATURAS' },
  { key: 'habilidade', label: 'HABILIDADES' },
  { key: 'item', label: 'ITENS' },
  { key: 'comando', label: 'COMANDOS' },
  { key: 'cenario', label: 'CENARIOS' },
]

export default class LibraryScene extends Scene {
  constructor() {
    super({ key: 'LibraryScene' })
  }

  preload() {
    ALL_CARDS.forEach(card => {
      const key = `library_card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) this.load.image(key, file)
    })
  }

  create() {
    saveScene('LibraryScene')
    this._filter = 'todos'
    this._cardContainer = this.add.container(0, 0)
    this._filterContainer = this.add.container(0, 0)
    const { width, height } = this.cameras.main

    this._buildBackground(width, height)
    this._buildHeader(width)
    this._buildFilters(width)
    this._renderCards()
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.45)
  }

  _buildHeader(width) {
    this.add.text(30, 36, '< MENU', {
      fontSize: '14px',
      color: '#bff5ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('MenuScene'))

    this.add.text(width / 2, 44, 'BIBLIOTECA DE CARTAS', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 5,
    }).setOrigin(0.5)

    this.add.text(width / 2, 78, 'Colecao global de cartas EZone TCG', {
      fontSize: '13px',
      color: '#8fe8ff',
    }).setOrigin(0.5)
  }

  _buildFilters(width) {
    this._filterContainer.removeAll(true)
    const startX = width / 2 - 390
    FILTERS.forEach((filter, i) => {
      const x = startX + i * 156
      const active = filter.key === this._filter
      const btn = this.add.container(x, 126)
      const bg = this.add.rectangle(0, 0, 138, 34, active ? 0x0b2740 : 0x071523, 0.94)
        .setStrokeStyle(1, active ? 0x9df7ff : 0x1e9cc1)
      const label = this.add.text(0, 0, filter.label, {
        fontSize: '11px',
        color: active ? '#ffffff' : '#9fd6e8',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      btn.add([bg, label])
      btn.setSize(138, 34).setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.98))
      btn.on('pointerout', () => bg.setFillStyle(filter.key === this._filter ? 0x0b2740 : 0x071523, 0.94))
      btn.on('pointerdown', () => {
        this._filter = filter.key
        this._buildFilters(width)
        this._renderCards()
      })
      this._filterContainer.add(btn)
    })
  }

  _renderCards() {
    const { width } = this.cameras.main
    this._cardContainer.removeAll(true)
    const cards = ALL_CARDS
      .filter(card => this._filter === 'todos' || card.card_type === this._filter)
      .slice(0, 24)

    const cols = 8
    const cardW = 82
    const cardH = 115
    const gapX = 42
    const gapY = 52
    const totalW = cols * cardW + (cols - 1) * gapX
    const startX = width / 2 - totalW / 2 + cardW / 2
    const startY = 210

    cards.forEach((card, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = startX + col * (cardW + gapX)
      const y = startY + row * (cardH + gapY)
      this._cardContainer.add(this._createCardTile(card, x, y, cardW, cardH))
    })
  }

  _createCardTile(card, x, y, w, h) {
    const tile = this.add.container(x, y)
    const frame = this.add.rectangle(0, 0, w + 14, h + 36, 0x06111f, 0.78)
      .setStrokeStyle(1, 0x1e9cc1)
    const key = `library_card_${card.id}`
    const art = this.textures.exists(key)
      ? this.add.image(0, -12, key).setDisplaySize(w, h)
      : this.add.rectangle(0, -12, w, h, 0x0b1a2d, 0.96)
    const name = this.add.text(0, h / 2 + 8, card.name, {
      fontSize: '9px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: w + 8 },
    }).setOrigin(0.5)
    tile.add([frame, art, name])
    tile.setSize(w + 14, h + 36).setInteractive({ useHandCursor: true })
    tile.on('pointerover', () => {
      frame.setStrokeStyle(2, 0x9df7ff)
      this.tweens.add({ targets: tile, scaleX: 1.06, scaleY: 1.06, duration: 120, ease: 'Sine.easeOut' })
    })
    tile.on('pointerout', () => {
      frame.setStrokeStyle(1, 0x1e9cc1)
      this.tweens.add({ targets: tile, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    return tile
  }
}
