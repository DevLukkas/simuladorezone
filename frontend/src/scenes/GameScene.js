import { Scene } from 'phaser'
import echo from '../config/echo.js'
import api from '../config/api.js'
import { criaturas }   from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens }       from '../data/itens.js'
import { comandos }    from '../data/comandos.js'
import { cenarios }    from '../data/cenarios.js'
import {
  activateAbility,
  canActivateAbility,
  createCreatureInstance,
  recalculateCreatureStats,
  resolveTriggerEffects,
} from '../effects/index.js'
import { clearScene, saveScene, restoreSceneData } from '../utils/session.js'

const LOCAL_DECK_KEY = 'ezone_deck_builder_draft'
const CARD_BACK_KEY = 'card_back'
const BATTLE_BG_KEY = 'battle_bg'
const MAX_HAND_SIZE = 8

const TYPE_DEFAULT_COLOR = {
  criatura:   0x886633,
  habilidade: 0x2255aa,
  item:       0x668844,
  comando:    0x773399,
  cenario:    0x336655,
}

const ELEMENT_LABEL = {
  fogo: 'Fogo',
  agua: 'Agua',
  terra: 'Terra',
  vento: 'Vento',
  neutro: 'Neutro',
  vazio: 'Vazio',
  cosmico: 'Cosmico',
}

function normalize(cards, card_type) {
  return cards.map(c => ({
    ...c,
    name:      c.nome,
    card_type,
    attack:    c.ataque ?? null,
    defense:   c.vida   ?? null,
    color:     TYPE_DEFAULT_COLOR[card_type],
  }))
}

const ALL_CARDS = [
  ...normalize(criaturas,   'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(c => ({ ...c, elemento: 'neutro' })), 'item'),
  ...normalize(comandos,    'comando'),
  ...normalize(cenarios,    'cenario'),
]

/**
 * GameScene — tabuleiro JxJ espelhado com drag & drop manual.
 *
 * Layout (modo espelho):
 *  ┌─────────────────────────────────────┐
 *  │  [Mão Adversário - virada]           │
 *  │  [Campo Adversário — 5 slots]        │
 *  │  ────────────────────────────────── │
 *  │  [Campo Jogador   — 5 slots]         │
 *  │  [Mão Jogador]                       │
 *  └─────────────────────────────────────┘
 */
export default class GameScene extends Scene {
  constructor() {
    super({ key: 'GameScene' })
    this.room = null
    this.role = 'host' // 'host' | 'guest'
    this.myDeck = []
    this.myHand = []
    this.myDiscard = []
    this.oppHandCount = 5
    this.myField = Array(5).fill(null)
    this.oppField = Array(5).fill(null)
    this.selectedCard = null
    this.dragCard = null
    this._handContainers = []
    this._deckActionsOpen = false
    this._magnifierButton = null
    this._cardInspectPanel = null
    this._mulliganOffered = false
    this._mulliganModal = null
    this._mulliganTimer = null
    this._cardActionMenu = null
    this._pendingSummonCard = null
    this._pendingAttachmentCard = null
    this._mustDiscardBeforeDraw = false
    this._turnFuseStarted = false
    this._turnNumber = 1
  }

  init(data = {}) {
    const restored = restoreSceneData()
    this.room = data.room ?? restored?.room ?? { room_code: 'LOCAL', mode: 'solo' }
    this.role = data.role ?? restored?.role ?? 'host'
  }

  preload() {
    if (!this.textures.exists(BATTLE_BG_KEY)) {
      this.load.image(BATTLE_BG_KEY, '/assets/img/bg_gameBattle.png')
    }

    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, '/assets/img/cover.png')
    }

    ALL_CARDS.forEach(card => {
      const key  = `card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) {
        this.load.image(key, file)
      }
    })
  }

  create() {
    saveScene('GameScene', { room: this.room, role: this.role })

    const { width, height } = this.cameras.main

    // — Fundo —
    this.add.image(width / 2, height / 2, BATTLE_BG_KEY).setDisplaySize(width, height)

    // — Linha central —
    this.add.line(0, 0, 0, height / 2, width, height / 2, 0x334455).setOrigin(0)

    this._buildMatchHeader(width)

    // — Slots do campo —
    this._slotsMy = this._createFieldSlots(width, height, 'my')
    this._slotsOpp = this._createFieldSlots(width, height, 'opp')

    // — Zona da mão —
    this._handZone = this.add
      .zone(width / 2, height - 60, width - 40, 110)
      .setRectangleDropZone(width - 40, 110)

    // — Info de turno —
    this._turnText = this.add
      .text(width - 20, height / 2, 'Aguardando...', {
        fontSize: '13px',
        color: '#888888',
      })
      .setOrigin(1, 0.5)

    // — Botões de turno —
    this.add
      .text(width - 20, height - 58, 'FIM DE TURNO', {
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#880000',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._sendAction('end_turn', {}))

    this.add
      .text(width - 20, height - 20, 'SURRENDER', {
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#3a1a1a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ backgroundColor: '#6a2222' }) })
      .on('pointerout',  function () { this.setStyle({ backgroundColor: '#3a1a1a' }) })
      .on('pointerdown', () => this._surrender())

    // — WebSocket: escutar ações do adversário —
    this._listenChannel()

    this._renderOpponentHand()
    this._dealStartingHand()
  }

  _buildMatchHeader(width) {
    const y = 18
    const leftX = width / 2 - 180
    const rightX = width / 2 + 180

    this.add.rectangle(width / 2, 0, width, 58, 0x071018, 0.92).setOrigin(0.5, 0)
    this.add.rectangle(width / 2, 58, width, 1, 0x26384a).setOrigin(0.5)

    this.add.text(leftX, y, 'JOGADOR 1', {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.add.text(width / 2, y, 'x', {
      fontSize: '16px', color: '#cccccc', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.add.text(rightX, y, 'JOGADOR 2', {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)

    this._addScoreDots(leftX, y + 22)
    this._addScoreDots(rightX, y + 22)

    this.add.text(width / 2, y + 32, '[Turno: 1]', {
      fontSize: '13px', color: '#8fb8ff',
    }).setOrigin(0.5)
  }

  _buildTurnFuse(width, height) {
    if (this._turnFuseTimer) this._turnFuseTimer.remove(false)
    if (this._turnFuseGraphics) this._turnFuseGraphics.destroy()
    if (this._turnFuseText) this._turnFuseText.destroy()

    this._turnFuseGraphics = this.add.graphics().setDepth(4)
    this._turnFuseText = this.add.text(width / 2, height / 2 - 24, '45', {
      fontSize: '17px',
      color: '#d8ff66',
      fontStyle: 'bold',
      backgroundColor: '#071018',
      padding: { x: 9, y: 4 },
    }).setOrigin(0.5).setDepth(5)

    const startTime = this.time.now
    const duration = 45000
    const drawFuse = () => {
      const elapsed = Math.min(duration, this.time.now - startTime)
      const progress = elapsed / duration
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000))
      const x1 = 34
      const x2 = width - 34
      const y = height / 2
      const burnX = x1 + (x2 - x1) * progress
      const red = Math.round(120 + 135 * progress)
      const green = Math.round(255 * (1 - Math.max(0, progress - 0.45) / 0.55))
      const color = (red << 16) | (green << 8) | 0x22

      this._turnFuseGraphics.clear()
      this._turnFuseGraphics.lineStyle(6, 0x181818, 0.9)
      this._turnFuseGraphics.beginPath()
      this._turnFuseGraphics.moveTo(x1, y)
      this._turnFuseGraphics.lineTo(x2, y)
      this._turnFuseGraphics.strokePath()

      this._turnFuseGraphics.lineStyle(5, 0x555555, 0.65)
      this._turnFuseGraphics.beginPath()
      this._turnFuseGraphics.moveTo(x1, y)
      this._turnFuseGraphics.lineTo(burnX, y)
      this._turnFuseGraphics.strokePath()

      if (burnX < x2) {
        this._turnFuseGraphics.lineStyle(5, color, 1)
        this._turnFuseGraphics.beginPath()
        this._turnFuseGraphics.moveTo(burnX, y)
        this._turnFuseGraphics.lineTo(x2, y)
        this._turnFuseGraphics.strokePath()
      }

      this._turnFuseGraphics.fillStyle(progress > 0.78 ? 0xff2200 : 0xd8ff22, 1)
      this._turnFuseGraphics.fillCircle(burnX, y, 7)
      this._turnFuseText.setText(String(remaining))
      this._turnFuseText.setStyle({ color: progress > 0.78 ? '#ff4422' : '#d8ff66' })
    }

    drawFuse()
    this._turnFuseTimer = this.time.addEvent({
      delay: 100,
      repeat: 450,
      callback: drawFuse,
    })
  }

  _startTurnFuse() {
    if (this._turnFuseStarted) return

    const { width, height } = this.cameras.main
    this._turnFuseStarted = true
    this._buildTurnFuse(width, height)
  }

  _addScoreDots(x, y) {
    const gap = 15
    for (let i = 0; i < 3; i++) {
      this.add.circle(x - gap + i * gap, y, 5, 0x777777)
        .setStrokeStyle(1, 0xaaaaaa)
    }
  }

  // ────── Slots do Campo ──────

  _createFieldSlots(width, height, side) {
    const slotCount = 5
    const slotW = 90
    const slotH = 125
    const gap = 14
    const totalW = slotCount * slotW + (slotCount - 1) * gap
    const startX = (width - totalW) / 2
    const y = side === 'my' ? height * 0.62 : height * 0.36

    return Array.from({ length: slotCount }, (_, i) => {
      const x = startX + i * (slotW + gap) + slotW / 2
      const slot = this.add.rectangle(x, y, slotW, slotH, 0x1a2a3a, 0.6)
      slot.setStrokeStyle(1, 0x334455)
      slot.setData('slotIndex', i)
      slot.setData('side', side)
      if (side === 'my') {
        slot.setInteractive({ useHandCursor: true })
        slot.on('pointerdown', () => this._placePendingSummon(i))
      }

      // DropZone
      const zone = this.add.zone(x, y, slotW, slotH).setRectangleDropZone(slotW, slotH)
      zone.setData('slotIndex', i)
      zone.setData('side', side)
      if (side === 'my') {
        zone.setInteractive({ useHandCursor: true })
        zone.on('pointerdown', () => this._placePendingSummon(i))
      }

      return {
        rect: slot,
        zone,
        card: null,
        cardObject: null,
        attachments: [],
        highlight: null,
        attachHighlight: null,
        x,
        y,
        w: slotW,
        h: slotH,
      }
    })
  }

  // ────── Mão inicial ──────

  _loadLocalDeckCards() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_DECK_KEY))
      if (!Array.isArray(saved?.cards)) return []

      const cards = []
      for (const entry of saved.cards) {
        const id = Number(entry?.id)
        const qty = Number(entry?.qty)
        const card = ALL_CARDS.find(c => Number(c.id) === id)
        if (!card || !Number.isInteger(qty) || qty <= 0) continue

        for (let i = 0; i < qty; i++) {
          cards.push(card)
        }
      }
      return cards
    } catch {
      return []
    }
  }

  _dealStartingHand() {
    const localDeck = this._shuffleCards(this._loadLocalDeckCards())
    if (localDeck.length) {
      this.myHand = localDeck.slice(0, 5)
      this.myDeck = localDeck.slice(5)
      this._renderDeckPile()
      this._renderDiscardPile()
      this._renderHand(this.myHand)
      this._openMulliganModal()
      return
    }

    this._dealDemoHand()
  }

  _dealDemoHand() {
    const demoCards = this._shuffleCards([
      { id: 1, name: 'Dragão Solar', attack: 9, defense: 7, mana_cost: 6, card_type: 'creature' },
      { id: 2, name: 'Feitiço de Gelo', attack: null, defense: null, mana_cost: 3, card_type: 'spell' },
      { id: 3, name: 'Escudo Lunar', attack: 2, defense: 10, mana_cost: 4, card_type: 'creature' },
      { id: 4, name: 'Raio Veloz', attack: 6, defense: null, mana_cost: 2, card_type: 'spell' },
      { id: 5, name: 'Golem de Pedra', attack: 5, defense: 8, mana_cost: 5, card_type: 'creature' },
    ])
    this.myHand = demoCards
    this.myDeck = demoCards.slice(5)
    this._renderDeckPile()
    this._renderDiscardPile()
    this._renderHand(this.myHand)
    this._openMulliganModal()
  }

  _shuffleCards(cards) {
    const shuffled = [...cards]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  _renderDeckPile() {
    if (this._deckPileContainer) {
      this._deckPileContainer.destroy(true)
    }

    const { width, height } = this.cameras.main
    const cardW = 80
    const cardH = 112
    const count = this.myDeck.length
    const x = width - 238
    const y = height - 90

    this._deckPileContainer = this.add.container(x, y)

    const base = this.add.rectangle(0, 0, cardW + 10, cardH + 10, 0x07100d, 0.95)
      .setStrokeStyle(1, 0x2a5a2a)
    this._deckPileContainer.add(base)

    if (count > 0 && this.textures.exists(CARD_BACK_KEY)) {
      const visibleCards = Math.min(7, count)
      for (let i = visibleCards - 1; i >= 0; i--) {
        const offset = i * 2
        const back = this.add.image(-offset, -offset, CARD_BACK_KEY).setDisplaySize(cardW, cardH)
        this._deckPileContainer.add(back)
      }
    } else {
      const empty = this.add.rectangle(0, 0, cardW, cardH, 0x111820, 0.75)
        .setStrokeStyle(1, 0x334455)
      this._deckPileContainer.add(empty)
    }

    const badge = this.add.circle(cardW / 2 - 2, cardH / 2 - 4, 15, 0x000000, 0.85)
      .setStrokeStyle(1, 0x4caf50)
    const countText = this.add.text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const label = this.add.text(0, cardH / 2 + 18, 'BARALHO', {
      fontSize: '10px', color: '#7fbf7f',
    }).setOrigin(0.5)

    this._deckPileContainer.add([badge, countText, label])
    this._deckPileContainer.setSize(cardW + 16, cardH + 16)
    this._deckPileContainer.setInteractive({ useHandCursor: true })
    this._deckPileContainer.on('pointerdown', () => this._toggleDeckActions())
  }

  _renderDiscardPile() {
    if (this._discardPileContainer) {
      this._discardPileContainer.destroy(true)
    }

    const { width, height } = this.cameras.main
    const cardW = 72
    const cardH = 101
    const count = this.myDiscard.length
    const x = width - 238
    const y = height - 228
    const topCard = this.myDiscard[count - 1]

    this._discardPileContainer = this.add.container(x, y).setDepth(3)
    const base = this.add.rectangle(0, 0, cardW + 10, cardH + 10, 0x130c0c, 0.92)
      .setStrokeStyle(1, 0x6a3434)
    this._discardPileContainer.add(base)

    if (topCard) {
      const key = `card_${topCard.id}`
      const cardImg = this.textures.exists(key)
        ? this.add.image(0, 0, key).setDisplaySize(cardW, cardH)
        : this.add.rectangle(0, 0, cardW, cardH, topCard.color ?? 0x1a1a2e)
      this._discardPileContainer.add(cardImg)
    } else {
      const empty = this.add.rectangle(0, 0, cardW, cardH, 0x111111, 0.72)
        .setStrokeStyle(1, 0x553333)
      this._discardPileContainer.add(empty)
    }

    const badge = this.add.circle(cardW / 2 - 2, cardH / 2 - 4, 13, 0x000000, 0.85)
      .setStrokeStyle(1, 0xcc6666)
    const countText = this.add.text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const label = this.add.text(0, cardH / 2 + 17, 'DESCARTE', {
      fontSize: '10px', color: '#ff9999',
    }).setOrigin(0.5)

    this._discardPileContainer.add([badge, countText, label])
  }

  _playDiscardSmoke() {
    if (!this._discardPileContainer) return

    const baseX = this._discardPileContainer.x
    const baseY = this._discardPileContainer.y - 34
    for (let i = 0; i < 14; i++) {
      const puff = this.add.circle(
        baseX + this._randInt(-24, 24),
        baseY + this._randInt(-8, 18),
        this._randInt(7, 14),
        0xd6d6d6,
        0.62
      ).setDepth(90)

      this.tweens.add({
        targets: puff,
        x: puff.x + this._randInt(-22, 22),
        y: puff.y - this._randInt(34, 76),
        scale: 1.9,
        alpha: 0,
        duration: this._randInt(620, 980),
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy(),
      })
    }
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  _renderOpponentHand() {
    if (this._oppHandContainer) {
      this._oppHandContainer.destroy(true)
    }

    const { width } = this.cameras.main
    const cardW = 68
    const cardH = 95
    const gap = 8
    const count = this.oppHandCount
    const totalW = count * cardW + (count - 1) * gap
    const startX = (width - totalW) / 2
    const y = 130

    this._oppHandContainer = this.add.container(0, 0)
    for (let i = 0; i < count; i++) {
      const x = startX + i * (cardW + gap) + cardW / 2
      const back = this.textures.exists(CARD_BACK_KEY)
        ? this.add.image(x, y, CARD_BACK_KEY).setDisplaySize(cardW, cardH)
        : this.add.rectangle(x, y, cardW, cardH, 0x111820)
      const border = this.add.rectangle(x, y, cardW, cardH, 0x000000, 0)
        .setStrokeStyle(1, 0x556070)
      this._oppHandContainer.add([back, border])
    }
  }

  _toggleDeckActions() {
    this._deckActionsOpen = !this._deckActionsOpen
    if (this._deckActionsOpen) {
      this._renderDeckActions()
    } else {
      this._clearDeckActions()
    }
  }

  _clearDeckActions() {
    if (this._deckActionsContainer) {
      this._deckActionsContainer.destroy(true)
      this._deckActionsContainer = null
    }
  }

  _closeDeckActionsSmooth(onComplete = null) {
    if (!this._deckActionsContainer) {
      onComplete?.()
      return
    }

    const menu = this._deckActionsContainer
    this._deckActionsOpen = false
    menu.disableInteractive?.()
    this.tweens.add({
      targets: menu,
      alpha: 0,
      x: menu.x - 10,
      duration: 140,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (this._deckActionsContainer === menu) {
          this._deckActionsContainer.destroy(true)
          this._deckActionsContainer = null
        }
        onComplete?.()
      },
    })
  }

  _renderDeckActions() {
    this._clearDeckActions()

    const x = this._deckPileContainer.x - 122
    const y = this._deckPileContainer.y - 92
    const actions = [
      { label: 'COMPRAR', fn: () => this._drawCard() },
      { label: 'EMBARALHAR', fn: () => this._shuffleDeck() },
      { label: 'DESCARTAR', fn: () => this._discardTop() },
      { label: 'EXILAR', fn: () => this._exileTop() },
      { label: 'VER BARALHO', fn: () => this._viewDeck() },
      { label: 'REVELAR TOP', fn: () => this._revealTop() },
    ]

    this._deckActionsContainer = this.add.container(x, y).setDepth(30)
    actions.forEach((action, i) => {
      const btn = this.add.text(0, i * 28, action.label, {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#162337',
        padding: { x: 10, y: 5 },
        fixedWidth: 104,
        align: 'center',
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#22405f' }))
      btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#162337' }))
      btn.on('pointerdown', () => this._closeDeckActionsSmooth(action.fn))
      this._deckActionsContainer.add(btn)
    })
  }

  _renderHand(cards) {
    this._clearMagnifier()
    this._clearCardActionMenu()
    this._clearSummonZones()
    this._clearAttachmentTargets()
    this._pendingSummonCard = null
    this._pendingAttachmentCard = null
    this._handContainers.forEach(card => card.destroy(true))
    this._handContainers = []

    const { width, height } = this.cameras.main
    const cardW = 80
    const cardH = 112
    const gap = 10
    const totalW = cards.length * cardW + (cards.length - 1) * gap
    const startX = (width - totalW) / 2

    cards.forEach((cardData, i) => {
      const x = startX + i * (cardW + gap) + cardW / 2
      const y = height - 65
      this._handContainers.push(this._createCardObject(cardData, x, y, true))
    })
  }

  _showMagnifier(cardObject) {
    this._clearCardActionMenu()
    this._clearMagnifier()

    const cardData = cardObject.getData('cardData')
    this._magnifierButton = this.add.container(cardObject.x, cardObject.y).setDepth(35)
    const bg = this.add.circle(0, 0, 18, 0x000000, 0.78)
      .setStrokeStyle(2, 0xffffff)
    const icon = this.add.text(0, -1, '🔍', {
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5)
    this._magnifierButton.add([bg, icon])
    this._magnifierButton.setSize(36, 36)
    this._magnifierButton.setInteractive({ useHandCursor: true })
    this._magnifierButton.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation()
      this._openCardInspectPanel(cardData)
      this._clearMagnifier()
    })
  }

  _handleCardClick(cardObject) {
    if (cardObject.getData('source') === 'field' && this._attachPendingToTarget(cardObject)) {
      return
    }
    this._showCardActions(cardObject)
  }

  _clearMagnifier() {
    if (this._magnifierButton) {
      this._magnifierButton.destroy(true)
      this._magnifierButton = null
    }
  }

  _showCardActions(cardObject) {
    this._clearCardActionMenu()
    this._clearMagnifier()
    this._clearSummonZones()
    this._clearAttachmentTargets()
    this._pendingAttachmentCard = null

    const card = cardObject.getData('cardData')
    const source = cardObject.getData('source')
    const actions = [
      { label: 'LUPA', color: '#22405f', fn: () => this._openCardInspectPanel(card) },
    ]
    if (source === 'hand') {
      if (this._mustDiscardBeforeDraw && this.myHand.length >= MAX_HAND_SIZE) {
        actions.push({ label: 'DESCARTAR', color: '#7a2323', fn: () => this._discardFromHand(cardObject) })
      }
      if (card.card_type === 'criatura') {
        actions.unshift({ label: 'INVOCAR', color: '#1b5e20', fn: () => this._startSummonSelection(cardObject) })
      } else if (this._isAttachmentCard(card) && this._attachmentTargets(card).length) {
        actions.unshift({ label: 'ANEXAR', color: '#6a3d9a', fn: () => this._startAttachmentSelection(cardObject) })
      }
    } else if (source === 'attachment' && this._activatableAbilities(cardObject).length) {
      actions.unshift({ label: 'ATIVAR', color: '#8a4a12', fn: () => this._openAbilityElementChoice(cardObject) })
    }

    this._cardActionMenu = this.add.container(cardObject.x, cardObject.y - 72).setDepth(38)
    actions.forEach((action, i) => {
      const btn = this.add.text((i - (actions.length - 1) / 2) * 78, 0, action.label, {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: action.color,
        padding: { x: 10, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2f6f8f' }))
      btn.on('pointerout',  () => btn.setStyle({ backgroundColor: action.color }))
      btn.on('pointerdown', () => {
        this._clearCardActionMenu()
        action.fn()
      })
      this._cardActionMenu.add(btn)
    })
  }

  _clearCardActionMenu() {
    if (this._cardActionMenu) {
      this._cardActionMenu.destroy(true)
      this._cardActionMenu = null
    }
  }

  _startSummonSelection(cardObject) {
    if (!this._slotsMy.some(slot => !slot.card)) {
      this._toast('Não há zonas vazias para invocar.')
      return
    }
    this._pendingSummonCard = cardObject
    this._highlightSummonZones()
    this._toast('Escolha uma zona vazia para invocar.')
  }

  _highlightSummonZones() {
    this._slotsMy.forEach(slot => {
      if (slot.card) return
      slot.rect.setStrokeStyle(3, 0xffcc00)
      slot.rect.setFillStyle(0x2d3a18, 0.75)

      const highlight = this.add.rectangle(slot.x, slot.y, slot.w + 16, slot.h + 16, 0x000000, 0)
        .setStrokeStyle(3, 0xffdd44)
        .setDepth(6)
      slot.highlight = highlight

      // this.tweens.add({
      //   targets: highlight,
      //   angle: 360,
      //   duration: 1400,
      //   repeat: -1,
      //   ease: 'Linear',
      // })
      this.tweens.add({
        targets: [slot.rect, highlight],
        alpha: 0.35,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    })
  }

  _clearSummonZones() {
    this._slotsMy?.forEach(slot => {
      this.tweens.killTweensOf(slot.rect)
      slot.rect.setAlpha(1)
      slot.rect.setFillStyle(0x1a2a3a, 0.6)
      slot.rect.setStrokeStyle(1, 0x334455)
      if (slot.highlight) {
        this.tweens.killTweensOf(slot.highlight)
        slot.highlight.destroy()
        slot.highlight = null
      }
    })
  }

  _isAttachmentCard(card) {
    return card.card_type === 'item' || card.card_type === 'habilidade'
  }

  _attachmentTargets(card) {
    if (!this._isAttachmentCard(card)) return []

    return this._slotsMy.filter(slot => {
      if (!slot.card || slot.card.card_type !== 'criatura') return false
      if (slot.attachments.length >= 2) return false
      if (card.card_type === 'item') return true
      return slot.card.element && card.element && slot.card.element === card.element
    })
  }

  _startAttachmentSelection(cardObject) {
    const card = cardObject.getData('cardData')
    const targets = this._attachmentTargets(card)
    if (!targets.length) {
      this._toast('Não há criaturas válidas para anexar.')
      return
    }

    this._pendingAttachmentCard = cardObject
    this._highlightAttachmentTargets(targets)
    this._toast('Escolha uma criatura para anexar.')
  }

  _highlightAttachmentTargets(targets) {
    this._clearAttachmentTargets()

    targets.forEach(slot => {
      const color = this._pendingAttachmentCard?.getData('cardData')?.card_type === 'habilidade'
        ? 0x44aaff
        : 0xbb77ff
      const highlight = this.add.rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, color)
        .setDepth(7)
      slot.attachHighlight = highlight

      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      // this.tweens.add({
      //   targets: highlight,
      //   angle: 360,
      //   duration: 1600,
      //   repeat: -1,
      //   ease: 'Linear',
      // })
    })
  }

  _clearAttachmentTargets() {
    this._slotsMy?.forEach(slot => {
      if (!slot.attachHighlight) return
      this.tweens.killTweensOf(slot.attachHighlight)
      slot.attachHighlight.destroy()
      slot.attachHighlight = null
    })
  }

  _attachPendingToTarget(cardObject) {
    if (!this._pendingAttachmentCard) return false

    const slot = this._slotsMy.find(s => s.cardObject === cardObject)
    if (!slot) return false

    const attachmentObject = this._pendingAttachmentCard
    const attachment = attachmentObject.getData('cardData')
    if (!this._attachmentTargets(attachment).includes(slot)) return false

    this._placeAttachment(slot, attachmentObject, attachment)
    return true
  }

  _placeAttachment(slot, attachmentObject, attachment) {
    if (slot.attachments.length >= 2) {
      this._toast('Esta criatura já tem 2 anexos.')
      this._pendingAttachmentCard = null
      this._clearAttachmentTargets()
      return
    }

    const index = slot.attachments.length
    const xOffset = index === 0 ? -12 : 12
    attachmentObject.setPosition(slot.x + xOffset, slot.y + 9)
    attachmentObject.setScale(0.98)
    attachmentObject.setDepth(6 + index)
    attachmentObject.setData('source', 'attachment')
    attachmentObject.setData('slot', slot)
    attachmentObject.setData('abilityState', { usedAbilities: {} })
    attachmentObject.removeAllListeners('pointerdown')
    attachmentObject.setInteractive({ useHandCursor: true })
    attachmentObject.on('pointerdown', () => this._showCardActions(attachmentObject))

    slot.attachments.push({ card: attachment, object: attachmentObject })
    this._resolveOnAttachEffects(slot, attachment)
    this._recalculateAllFieldCreatures()
    this._handContainers = this._handContainers.filter(card => card !== attachmentObject)
    const handIndex = this.myHand.findIndex(card => card.id === attachment.id)
    if (handIndex !== -1) this.myHand.splice(handIndex, 1)

    this._pendingAttachmentCard = null
    this._clearAttachmentTargets()
    this._toast(`${attachment.name} anexada.`)
  }

  _resolveOnAttachEffects(slot, attachment) {
    const results = resolveTriggerEffects(attachment.onAttach ?? [], {
      source: attachment,
      attachedCreature: slot.card,
      yourField: this._slotsMy,
    })

    for (const result of results) {
      if (result.card_type === 'criatura') this._summonTokenToFirstEmptyZone(result)
    }
  }

  _summonTokenToFirstEmptyZone(tokenCard) {
    const slot = this._slotsMy.find(s => !s.card)
    if (!slot) {
      this._toast('Sem zona vazia para criar ficha.')
      return false
    }

    const creature = createCreatureInstance(tokenCard)
    const tokenObject = this._createCardObject(tokenCard, slot.x, slot.y, false)
    tokenObject.setDepth(8)
    tokenObject.setData('source', 'field')
    tokenObject.setInteractive({ useHandCursor: true })
    tokenObject.on('pointerdown', () => this._handleCardClick(tokenObject))

    this._addFieldStatsOverlay(tokenObject, creature)
    slot.card = creature
    slot.cardObject = tokenObject
    slot.attachments = slot.attachments ?? []

    this._toast(`${tokenCard.name} criada.`)
    return true
  }

  _recalculateAllFieldCreatures() {
    this._slotsMy.forEach(slot => {
      if (!slot.card) return
      recalculateCreatureStats(slot.card, slot.attachments.map(entry => entry.card), {
        yourField: this._slotsMy,
      })
      this._refreshFieldStatsOverlay(slot)
    })
  }

  _activatableAbilities(cardObject) {
    const card = cardObject.getData('cardData')
    const slot = cardObject.getData('slot')
    const sourceState = cardObject.getData('abilityState')
    if (!slot?.card) return []

    return (card.activatedAbilities ?? []).filter(ability => canActivateAbility(ability, {
      creature: slot.card,
      source: card,
      sourceState,
      turn: this._turnNumber,
    }))
  }

  _openAbilityElementChoice(cardObject) {
    const ability = this._activatableAbilities(cardObject)[0]
    if (!ability) {
      this._toast('Habilidade indisponível.')
      return
    }

    if (ability.action?.type !== 'change_element') return

    this._clearCardActionMenu()
    if (this._elementChoiceMenu) this._elementChoiceMenu.destroy(true)

    const choices = ability.action.choose ?? []
    this._elementChoiceMenu = this.add.container(cardObject.x, cardObject.y - 96).setDepth(45)
    choices.forEach((element, i) => {
      const col = i % 4
      const row = Math.floor(i / 4)
      const btn = this.add.text((col - 1.5) * 70, row * 28, ELEMENT_LABEL[element] ?? element, {
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#1a3650',
        padding: { x: 8, y: 5 },
        fixedWidth: 64,
        align: 'center',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2f6f8f' }))
      btn.on('pointerout',  () => btn.setStyle({ backgroundColor: '#1a3650' }))
      btn.on('pointerdown', () => this._activateChangeElement(cardObject, ability, element))
      this._elementChoiceMenu.add(btn)
    })
  }

  _activateChangeElement(cardObject, ability, element) {
    const slot = cardObject.getData('slot')
    const card = cardObject.getData('cardData')
    const sourceState = cardObject.getData('abilityState')

    const applied = activateAbility(ability, {
      creature: slot.card,
      source: card,
      sourceState,
      turn: this._turnNumber,
      choice: { element },
    })

    if (!applied) {
      this._toast('Não foi possível ativar.')
      return
    }

    if (this._elementChoiceMenu) {
      this._elementChoiceMenu.destroy(true)
      this._elementChoiceMenu = null
    }
    this._toast(`Elemento alterado para ${ELEMENT_LABEL[element] ?? element}.`)
  }

  _placePendingSummon(slotIndex) {
    if (!this._pendingSummonCard) return

    const slot = this._slotsMy[slotIndex]
    if (!slot || slot.card) return

    const cardObject = this._pendingSummonCard
    const cardData = cardObject.getData('cardData')
    const creature = createCreatureInstance(cardData)
    cardObject.setPosition(slot.x, slot.y)
    cardObject.setDepth(8)
    cardObject.setData('source', 'field')
    cardObject.removeAllListeners('pointerdown')
    cardObject.setInteractive({ useHandCursor: true })
    cardObject.on('pointerdown', () => this._handleCardClick(cardObject))
    this._addFieldStatsOverlay(cardObject, creature)
    slot.card = creature
    slot.cardObject = cardObject

    this._handContainers = this._handContainers.filter(card => card !== cardObject)
    const handIndex = this.myHand.findIndex(card => card.id === cardData.id)
    if (handIndex !== -1) this.myHand.splice(handIndex, 1)

    this._pendingSummonCard = null
    this._clearSummonZones()
    this._playSummonImpact(creature, slot)

    this._sendAction('play_card', {
      card_id: cardData.id,
      slot: slotIndex,
    })
  }

  _playSummonImpact(card, slot) {
    const rarity = card.raridade ?? card.rarity
    if (!['lendario', 'lendaria', 'legendary'].includes(rarity)) return

    this.cameras.main.shake(250, 0.002)
    const pulse = this.add.rectangle(slot.x, slot.y, slot.w + 26, slot.h + 26, 0xff44ff, 0.22)
      .setStrokeStyle(3, 0xffccff)
      .setDepth(7)

    this.tweens.add({
      targets: pulse,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => pulse.destroy(),
    })
  }

  _addFieldStatsOverlay(cardObject, card) {
    if (card.card_type !== 'criatura') return

    const existing = cardObject.getData('statsOverlay')
    if (existing) existing.destroy(true)

    const stats = card.currentStats ?? {
      attack: card.attack ?? '-',
      defense: card.defense ?? '-',
    }
    const overlay = this.add.container(0, -48)
    const bg = this.add.rectangle(0, 0, 64, 24, 0x000000, 0.78)
      .setStrokeStyle(1, 0xffcc00)
    const atk = this.add.text(-17, 0, String(stats.attack ?? '-'), {
      fontSize: '14px',
      color: '#ffdd66',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const life = this.add.text(17, 0, String(stats.defense ?? '-'), {
      fontSize: '14px',
      color: '#88ddff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    overlay.add([bg, atk, life])
    cardObject.add(overlay)
    cardObject.setData('statsOverlay', overlay)
  }

  _refreshFieldStatsOverlay(slot) {
    if (!slot?.cardObject || !slot?.card) return
    this._addFieldStatsOverlay(slot.cardObject, slot.card)
  }

  _openCardInspectPanel(card) {
    if (this._cardInspectPanel) {
      this._cardInspectPanel.destroy(true)
    }

    const panelX = 142
    const panelY = 380
    const panelW = 260
    const panelH = 610
    const imgKey = `card_${card.id}`
    const hasImage = this.textures.exists(imgKey)

    this._cardInspectPanel = this.add.container(panelX, panelY).setDepth(25)

    const bg = this.add.rectangle(0, 0, panelW, panelH, 0x071018, 0.95)
      .setStrokeStyle(2, 0x4caf50)
    const close = this.add.text(panelW / 2 - 18, -panelH / 2 + 16, 'X', {
      fontSize: '14px',
      color: '#ff7777',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    close.on('pointerdown', () => {
      this._cardInspectPanel.destroy(true)
      this._cardInspectPanel = null
    })

    const title = this.add.text(0, -panelH / 2 + 28, card.name, {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      wordWrap: { width: panelW - 28 },
      align: 'center',
    }).setOrigin(0.5, 0)

    let art
    if (hasImage) {
      art = this.add.image(0, -panelH / 2 + 158, imgKey).setDisplaySize(150, 210)
    } else {
      art = this.add.rectangle(0, -panelH / 2 + 158, 150, 210, card.color ?? 0x1a1a2e)
        .setStrokeStyle(1, 0x4caf50)
    }

    const infoLines = [
      `Tipo: ${card.card_type}`,
      `Elemento: ${ELEMENT_LABEL[card.element] ?? card.element ?? '-'}`,
      `Raridade: ${card.raridade ?? card.rarity ?? '-'}`,
    ]
    if (card.card_type === 'criatura') {
      infoLines.push(`ATQ: ${card.attack ?? '-'}   VIDA: ${card.defense ?? '-'}`)
    }

    const info = this.add.text(-panelW / 2 + 18, -panelH / 2 + 282, infoLines.join('\n'), {
      fontSize: '12px',
      color: '#cfe8cf',
      lineSpacing: 5,
    }).setOrigin(0, 0)

    const effectTitle = this.add.text(-panelW / 2 + 18, -panelH / 2 + 372, 'EFEITO', {
      fontSize: '12px',
      color: '#8fb8ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0)

    const effectText = this.add.text(-panelW / 2 + 18, -panelH / 2 + 394, card.efeito ?? card.effect ?? '-', {
      fontSize: '11px',
      color: '#dddddd',
      wordWrap: { width: panelW - 36 },
      lineSpacing: 4,
    }).setOrigin(0, 0)

    this._cardInspectPanel.add([bg, close, title, art, info, effectTitle, effectText])
  }

  _openMulliganModal() {
    if (this._mulliganOffered || this._mulliganModal) return
    this._mulliganOffered = true

    const { width, height } = this.cameras.main
    const cardW = 96
    const cardH = 134
    const gap = 18
    const totalW = this.myHand.length * cardW + (this.myHand.length - 1) * gap
    const startX = (width - totalW) / 2
    let remaining = 15

    this._mulliganModal = this.add.container(0, 0).setDepth(80)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.72)
      .setOrigin(0)
      .setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, 760, 330, 0x071018, 0.96)
      .setStrokeStyle(2, 0x4caf50)
    const title = this.add.text(width / 2, height / 2 - 132, 'MULLIGAN', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const subtitle = this.add.text(width / 2, height / 2 - 106, 'Escolha manter sua mão inicial ou comprar 5 novas cartas.', {
      fontSize: '13px',
      color: '#cccccc',
    }).setOrigin(0.5)
    const countdown = this.add.text(width / 2, height / 2 + 104, `Fechando em ${remaining}s`, {
      fontSize: '12px',
      color: '#8fb8ff',
    }).setOrigin(0.5)

    this._mulliganModal.add([overlay, panel, title, subtitle, countdown])

    this.myHand.forEach((card, i) => {
      const x = startX + i * (cardW + gap) + cardW / 2
      const preview = this._createCardObject(card, x, height / 2 - 16, false)
      preview.setScale(cardW / 80, cardH / 112)
      this._mulliganModal.add(preview)
    })

    const keepBtn = this.add.text(width / 2 - 90, height / 2 + 142, 'MANTER MÃO', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#1b5e20',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    keepBtn.on('pointerover', () => keepBtn.setStyle({ backgroundColor: '#2e7d32' }))
    keepBtn.on('pointerout',  () => keepBtn.setStyle({ backgroundColor: '#1b5e20' }))
    keepBtn.on('pointerdown', () => this._closeMulliganModal())

    const mulliganBtn = this.add.text(width / 2 + 90, height / 2 + 142, 'MULIGAR', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#8a4a12',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    mulliganBtn.on('pointerover', () => mulliganBtn.setStyle({ backgroundColor: '#b86418' }))
    mulliganBtn.on('pointerout',  () => mulliganBtn.setStyle({ backgroundColor: '#8a4a12' }))
    mulliganBtn.on('pointerdown', () => this._mulliganHand())

    this._mulliganModal.add([keepBtn, mulliganBtn])

    this._mulliganTimer = this.time.addEvent({
      delay: 1000,
      repeat: 14,
      callback: () => {
        remaining--
        countdown.setText(`Fechando em ${remaining}s`)
        if (remaining <= 0) this._closeMulliganModal()
      },
    })
  }

  _closeMulliganModal() {
    if (this._mulliganTimer) {
      this._mulliganTimer.remove(false)
      this._mulliganTimer = null
    }
    if (this._mulliganModal) {
      this._mulliganModal.destroy(true)
      this._mulliganModal = null
    }
    this._startTurnFuse()
  }

  _mulliganHand() {
    const cards = this._shuffleCards([...this.myHand, ...this.myDeck])
    this.myHand = cards.slice(0, 5)
    this.myDeck = cards.slice(5)
    this._renderDeckPile()
    this._renderHand(this.myHand)
    this._closeMulliganModal()
    this._toast('Nova mão comprada!')
  }

  _discardFromHand(cardObject) {
    const card = cardObject.getData('cardData')
    const handIndex = this.myHand.findIndex(c => c.id === card.id)
    if (handIndex !== -1) this.myHand.splice(handIndex, 1)

    this.myDiscard.push(card)
    this._mustDiscardBeforeDraw = false
    cardObject.destroy(true)
    this._handContainers = this._handContainers.filter(c => c !== cardObject)
    this._renderDiscardPile()
    this._playDiscardSmoke()
    this._renderHand(this.myHand)
    this._toast(`${card.name} descartada da mão.`)
  }

  _drawCard() {
    if (this.myHand.length >= MAX_HAND_SIZE) {
      this._mustDiscardBeforeDraw = true
      this._toast('Mão está cheia. É necessário descartar uma carta.')
      return
    }
    if (!this.myDeck.length) {
      this._toast('Baralho vazio!')
      return
    }

    const card = this.myDeck.shift()
    this.myHand.push(card)
    this._mustDiscardBeforeDraw = false
    this._renderDeckPile()
    this._renderHand(this.myHand)
  }

  _shuffleDeck() {
    this._deckActionsOpen = false
    this._clearDeckActions()
    this.myDeck = this._shuffleCards(this.myDeck)
    this._animateDeckShuffle()
  }

  _animateDeckShuffle() {
    if (!this._deckPileContainer) {
      this._renderDeckPile()
      this._toast('Baralho embaralhado!')
      return
    }

    const pile = this._deckPileContainer
    this.tweens.add({
      targets: pile,
      x: pile.x - 18,
      angle: -7,
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tweens.add({
          targets: pile,
          x: pile.x + 18,
          angle: 7,
          duration: 70,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            pile.setAngle(0)
            this._renderDeckPile()
            this._toast('Baralho embaralhado!')
          },
        })
      },
    })
  }

  _discardTop() {
    const card = this.myDeck.shift()
    if (!card) {
      this._toast('Baralho vazio!')
      return
    }
    this.myDiscard.push(card)
    this._renderDeckPile()
    this._renderDiscardPile()
    this._playDiscardSmoke()
    this._toast(`${card.name} descartada.`)
  }

  _exileTop() {
    const card = this.myDeck.shift()
    if (!card) {
      this._toast('Baralho vazio!')
      return
    }
    this._renderDeckPile()
    this._toast(`${card.name} exilada.`)
  }

  _viewDeck() {
    console.table(this.myDeck.map((card, i) => ({
      posicao: i + 1,
      id: card.id,
      nome: card.name,
    })))
    this._toast(`Baralho com ${this.myDeck.length} carta(s). Lista no console.`)
  }

  _revealTop() {
    const card = this.myDeck[0]
    this._toast(card ? `Topo: ${card.name}` : 'Baralho vazio!')
  }

  // ────── Objeto Carta ──────

  _createCardObject(cardData, x, y, draggable = false) {
    const cardW = 80
    const cardH = 112

    const container = this.add.container(x, y)
    const imgKey = `card_${cardData.id}`
    const hasImage = this.textures.exists(imgKey)

    let bg
    const elements = []
    if (hasImage) {
      bg = this.add.image(0, 0, imgKey).setDisplaySize(cardW, cardH)
      const border = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0)
      border.setStrokeStyle(1.5, 0x4caf50)
      elements.push(bg, border)
    } else {
      bg = this.add.rectangle(0, 0, cardW, cardH, cardData.color ?? 0x1a1a2e)
      bg.setStrokeStyle(1.5, 0x4caf50)
      elements.push(bg)
    }

    // Nome
    const name = this.add
      .text(0, -42, cardData.name, {
        fontSize: '8px',
        color: '#ffffff',
        wordWrap: { width: cardW - 6 },
        align: 'center',
      })
      .setOrigin(0.5, 0)

    // Tipo
    const type = this.add
      .text(0, -28, cardData.card_type, {
        fontSize: '7px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5)

    // ATK/DEF
    const stats =
      cardData.attack !== null
        ? `ATK ${cardData.attack} / DEF ${cardData.defense}`
        : cardData.card_type.toUpperCase()
    const statsText = this.add
      .text(0, 38, stats, { fontSize: '7px', color: '#ffcc00' })
      .setOrigin(0.5)

    if (!hasImage) elements.push(name, type, statsText)
    container.add(elements)
    container.setData('cardData', cardData)
    container.setData('source', draggable ? 'hand' : 'preview')
    container.setSize(cardW, cardH)

    if (draggable) {
      container.setInteractive({ useHandCursor: true })
      container.on('pointerdown', () => this._handleCardClick(container))
    }

    return container
  }

  // ────── Drag & Drop ──────

  _onDragStart(pointer, gameObject) {
    this._clearMagnifier()
    this.dragCard = gameObject
    gameObject.setDepth(10)
  }

  _onDrag(pointer, gameObject, dragX, dragY) {
    gameObject.setPosition(dragX, dragY)
  }

  _onDragEnd(pointer, gameObject) {
    gameObject.setDepth(0)
    this.dragCard = null
  }

  _onDrop(pointer, gameObject, dropZone) {
    const side = dropZone.getData('side')
    const slotIndex = dropZone.getData('slotIndex')
    if (side !== 'my') return // só pode jogar no próprio campo

    const slot = this._slotsMy[slotIndex]
    if (slot.card) return // slot ocupado

    const cardData = gameObject.getData('cardData')
    gameObject.setPosition(slot.x, slot.y)
    this.input.setDraggable(gameObject, false)
    slot.card = cardData
    this._handContainers = this._handContainers.filter(card => card !== gameObject)
    const handIndex = this.myHand.findIndex(card => card.id === cardData.id)
    if (handIndex !== -1) this.myHand.splice(handIndex, 1)

    // Enviar ação ao servidor
    this._sendAction('play_card', {
      card_id: cardData.id,
      slot: slotIndex,
    })
  }

  // ────── WebSocket ──────

  _listenChannel() {
    if (!this.room?.id) return
    const channel = echo.private(`game.${this.room.id}`)

    channel.listen('GameActionBroadcast', (event) => {
      if (event.user_id === this._getMyUserId()) return // ignora ações próprias
      this._handleRemoteAction(event)
    })
  }

  _handleRemoteAction(event) {
    switch (event.action_type) {
      case 'play_card':
        // Renderizar carta do adversário no campo dele
        const slot = this._slotsOpp[event.payload.slot]
        if (slot && !slot.card) {
          slot.card = event.payload
          // TODO: renderizar sprite
        }
        break
      case 'end_turn':
        this._turnText.setText('Seu turno!')
        break
    }
  }

  async _sendAction(actionType, payload) {
    if (!this.room?.id) return

    try {
      await api.post(`/rooms/${this.room.id}/actions`, {
        action_type: actionType,
        payload,
      })
    } catch (e) {
      console.error('Erro ao enviar ação:', e)
    }
  }

  _surrender() {
    if (this._turnFuseTimer) {
      this._turnFuseTimer.remove(false)
      this._turnFuseTimer = null
    }
    clearScene()
    saveScene('MenuScene')
    this.scene.start('MenuScene')
  }

  _getMyUserId() {
    try {
      return JSON.parse(localStorage.getItem('user'))?.id
    } catch {
      return null
    }
  }

  _toast(msg) {
    if (this._toastText) this._toastText.destroy()
    const { width, height } = this.cameras.main
    this._toastText = this.add.text(width / 2, height - 150, msg, {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#1b5e20',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setDepth(40)
    this.time.delayedCall(1800, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }
}
