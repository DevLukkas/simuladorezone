import { Scene } from 'phaser'
import { criaturas } from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens } from '../data/itens.js'
import { comandos } from '../data/comandos.js'
import { cenarios } from '../data/cenarios.js'

function normalize(cards, cardType) {
  return cards.map(card => ({
    ...card,
    name: card.nome ?? card.name,
    attack: card.ataque ?? card.attack ?? null,
    defense: card.vida ?? card.defense ?? null,
    card_type: cardType,
  }))
}

const ALL_CARDS = [
  ...normalize(criaturas, 'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(card => ({ ...card, elemento: 'neutro' })), 'item'),
  ...normalize(comandos, 'comando'),
  ...normalize(cenarios, 'cenario'),
]
const CARD_BACK_KEY = 'status_card_back'
const LOCAL_DECK_KEY = 'ezone_deck_builder_draft'

function topEntry(map = {}) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0]
}

export default class StatusGameScene extends Scene {
  constructor() {
    super({ key: 'StatusGameScene' })
  }

  init(data = {}) {
    this.result = data.result ?? 'defeat'
    this.winnerName = data.winnerName ?? (this.result === 'victory' ? 'Jogador 1' : 'Jogador 2')
    this.score = data.score ?? { my: 0, opp: 0 }
    this.logs = data.logs ?? []
    this.stats = data.stats ?? { damageDealt: {}, damageReceived: {} }
    this._logsOpen = false
    this._logsPanel = null
  }

  preload() {
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, '/assets/img/cover.png')
    }

    ALL_CARDS.forEach(card => {
      const key = `card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) this.load.image(key, file)
    })
  }

  create() {
    const { width, height } = this.cameras.main
    const victory = this.result === 'victory'
    const { card: mvpCard, label: topDamageCard, value: topDamage } = this._resolveMvpCard()

    this._buildAnimatedBackground(width, height, victory)
    this._buildTitle(width, victory)
    this._buildScoreboard(width, victory)
    this._buildMvpCard(width, height, mvpCard, topDamageCard, topDamage, victory)
    this._buildLogsCollapse(width, height, victory)
    this._buildDoneButton(width, height)
  }

  _resolveMvpCard() {
    const [topDamageCard, topDamage] = topEntry(this.stats.damageDealt)
    const damageCard = ALL_CARDS.find(card => card.name === topDamageCard)
    if (damageCard && topDamage > 0) {
      return { card: damageCard, label: damageCard.name, value: topDamage }
    }

    const playedCreature = [...(this.stats.playedCards ?? [])]
      .reverse()
      .map(entry => ALL_CARDS.find(card => Number(card.id) === Number(entry.id)))
      .find(card => card?.card_type === 'criatura')
    if (playedCreature) {
      return { card: playedCreature, label: playedCreature.name, value: 'jogada' }
    }

    const deckCreature = this._randomCreatureFromSavedDeck()
    if (deckCreature) {
      return { card: deckCreature, label: deckCreature.name, value: 'deck' }
    }

    const allCreatures = ALL_CARDS.filter(card => card.card_type === 'criatura')
    const randomCreature = allCreatures[Math.floor(Math.random() * allCreatures.length)] ?? ALL_CARDS[0]
    return { card: randomCreature, label: randomCreature?.name ?? 'Carta', value: 'fallback' }
  }

  _randomCreatureFromSavedDeck() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_DECK_KEY))
      const entries = Array.isArray(saved?.cards) ? saved.cards : []
      const creatures = entries
        .map(entry => ALL_CARDS.find(card => Number(card.id) === Number(entry.id)))
        .filter(card => card?.card_type === 'criatura')
      if (!creatures.length) return null
      return creatures[Math.floor(Math.random() * creatures.length)]
    } catch {
      return null
    }
  }

  _buildAnimatedBackground(width, height, victory) {
    const bg = this.add.graphics()
    const steps = 42
    const leftColor = victory ? { r: 4, g: 16, b: 48 } : { r: 36, g: 7, b: 14 }
    const rightColor = victory ? { r: 54, g: 178, b: 242 } : { r: 110, g: 24, b: 36 }

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const r = Math.round(leftColor.r + (rightColor.r - leftColor.r) * t)
      const g = Math.round(leftColor.g + (rightColor.g - leftColor.g) * t)
      const b = Math.round(leftColor.b + (rightColor.b - leftColor.b) * t)
      const color = (r << 16) | (g << 8) | b
      bg.fillStyle(color, 1)
      bg.fillRect((width / steps) * i - height * 0.45, 0, width / steps + height * 0.9, height)
      bg.rotation = -0.12
    }

    const shine = this.add.rectangle(-width * 0.2, height / 2, width * 0.28, height * 1.55, 0x8fe9ff, 0.16)
      .setAngle(-28)
      .setBlendMode('ADD')
    this.tweens.add({
      targets: shine,
      x: width * 1.2,
      duration: 3900,
      repeat: -1,
      ease: 'Sine.easeInOut',
      yoyo: true,
    })

    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.32)
  }

  _buildTitle(width, victory) {
    this.add.text(width / 2, 58, victory ? 'VITORIA' : 'DERROTA', {
      fontSize: '54px',
      color: victory ? '#bff5ff' : '#ffb0b0',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 7,
    }).setOrigin(0.5)

    this.add.text(width / 2, 108, `${this.winnerName} venceu a partida`, {
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _buildScoreboard(width, victory) {
    const panel = this.add.container(width / 2, 178)
    const frame = this.add.rectangle(0, 0, 500, 96, 0x06111f, 0.78)
      .setStrokeStyle(2, victory ? 0x64e8ff : 0xff6868)
    const left = this.add.text(-145, 6, String(this.score.my), {
      fontSize: '58px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#12283d',
      strokeThickness: 5,
    }).setOrigin(0.5)
    const right = this.add.text(145, 6, String(this.score.opp), {
      fontSize: '58px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#12283d',
      strokeThickness: 5,
    }).setOrigin(0.5)
    const versus = this.add.text(0, 5, 'VS', {
      fontSize: '22px',
      color: '#86efff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const p1 = this.add.text(-145, -34, 'JOGADOR 1', { fontSize: '12px', color: '#9eefff' }).setOrigin(0.5)
    const p2 = this.add.text(145, -34, 'JOGADOR 2', { fontSize: '12px', color: '#9eefff' }).setOrigin(0.5)
    panel.add([frame, p1, p2, left, right, versus])
  }

  _buildMvpCard(width, height, card, cardName, damage, victory) {
    const x = width / 2
    const y = height / 2 + 18
    const glow = this.add.circle(x, y, 142, victory ? 0x68eaff : 0xff5555, 0.18).setBlendMode('ADD')
    this.tweens.add({
      targets: glow,
      scale: 1.14,
      alpha: 0.34,
      duration: 980,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const cardShell = this.add.container(x, y).setAngle(-7).setScale(1.18, 1.08)
    const key = card ? `card_${card.id}` : null
    const art = key && this.textures.exists(key)
      ? this.add.image(0, 0, key).setDisplaySize(160, 224)
      : this.add.rectangle(0, 0, 160, 224, 0x0b1a2d, 0.96)
    const back = this.textures.exists(CARD_BACK_KEY)
      ? this.add.image(0, 0, CARD_BACK_KEY).setDisplaySize(160, 224)
      : this.add.rectangle(0, 0, 160, 224, 0x071018, 0.96)
    back.setVisible(false)

    const shineMask = this._createMvpCardMask(x, y, -7, 1.18, 1.08, 160, 224)
    const shineSoft = this.add.rectangle(-62, 0, 42, 208, 0xbff5ff, 0.05).setAngle(18).setBlendMode('ADD')
    const shineMid = this.add.rectangle(-62, 0, 24, 208, 0xffffff, 0.08).setAngle(18).setBlendMode('ADD')
    const shineCore = this.add.rectangle(-62, 0, 10, 208, 0xffffff, 0.12).setAngle(18).setBlendMode('ADD')
    const shineParts = [shineSoft, shineMid, shineCore]
    shineParts.forEach(part => part.setMask(shineMask))

    cardShell.add([art, back, shineSoft, shineMid, shineCore])
    cardShell.setSize(170, 234)
    cardShell.setInteractive({ useHandCursor: true })
    cardShell.setData('frontFace', art)
    cardShell.setData('backFace', back)
    cardShell.setData('frontVisible', true)
    cardShell.setData('baseScaleX', cardShell.scaleX)
    cardShell.on('pointerdown', () => this._flipMvpCard(cardShell))

    this.tweens.add({
      targets: shineParts,
      x: 62,
      alpha: '+=0.12',
      duration: 1500,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })

    this.add.text(x, y + 154, 'MVP DE DANO', {
      fontSize: '13px',
      color: '#9eefff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const suffix = typeof damage === 'number' ? `${damage}` : String(damage).toUpperCase()
    this.add.text(x, y + 178, `${cardName} (${suffix})`, {
      fontSize: '13px',
      color: '#ffffff',
      wordWrap: { width: 260 },
      align: 'center',
    }).setOrigin(0.5)
  }

  _createMvpCardMask(x, y, angleDeg, scaleX, scaleY, width, height) {
    const angle = angleDeg * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const hw = (width * scaleX) / 2
    const hh = (height * scaleY) / 2
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map(point => ({
      x: x + point.x * cos - point.y * sin,
      y: y + point.x * sin + point.y * cos,
    }))

    const maskShape = this.make.graphics({ add: false })
    maskShape.fillStyle(0xffffff, 1)
    maskShape.beginPath()
    maskShape.moveTo(corners[0].x, corners[0].y)
    corners.slice(1).forEach(point => maskShape.lineTo(point.x, point.y))
    maskShape.closePath()
    maskShape.fillPath()
    return maskShape.createGeometryMask()
  }

  _flipMvpCard(cardShell) {
    if (cardShell.getData('spinning')) return
    cardShell.setData('spinning', true)

    const rotations = 3 + Math.floor(Math.random() * 3)
    const halfTurns = rotations * 2
    const baseScaleX = cardShell.getData('baseScaleX') ?? 1.18
    const front = cardShell.getData('frontFace')
    const back = cardShell.getData('backFace')

    const swapFace = () => {
      const nextFront = !cardShell.getData('frontVisible')
      cardShell.setData('frontVisible', nextFront)
      front?.setVisible(nextFront)
      back?.setVisible(!nextFront)
    }

    const runHalfTurn = index => {
      const slowDown = index * 18
      this.tweens.add({
        targets: cardShell,
        scaleX: 0.03,
        duration: 86 + slowDown,
        ease: 'Quad.easeIn',
        onComplete: () => {
          swapFace()
          this.tweens.add({
            targets: cardShell,
            scaleX: baseScaleX,
            duration: 110 + slowDown,
            ease: 'Quad.easeOut',
            onComplete: () => {
              if (index + 1 < halfTurns) {
                runHalfTurn(index + 1)
                return
              }
              front?.setVisible(true)
              back?.setVisible(false)
              cardShell.setData('frontVisible', true)
              cardShell.setData('spinning', false)
            },
          })
        },
      })
    }

    runHalfTurn(0)
  }

  _buildLogsCollapse(width, height, victory) {
    const y = height - 116
    const button = this.add.container(width / 2, y)
    const bg = this.add.rectangle(0, 0, 620, 34, 0x071523, 0.92)
      .setStrokeStyle(1, victory ? 0x64e8ff : 0xff7777)
    const label = this.add.text(0, 0, 'ULTIMAS ACOES DA PARTIDA', {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    button.add([bg, label])
    button.setSize(620, 34)
    button.setInteractive({ useHandCursor: true })
    button.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.96))
    button.on('pointerout', () => bg.setFillStyle(0x071523, 0.92))
    button.on('pointerdown', () => this._toggleLogsPanel(width, y - 86, victory))
  }

  _toggleLogsPanel(width, y, victory) {
    if (this._logsOpen) {
      this._logsOpen = false
      if (!this._logsPanel) return
      const panel = this._logsPanel
      this.tweens.add({
        targets: panel,
        scaleY: 0.02,
        alpha: 0,
        duration: 220,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          panel.destroy(true)
          if (this._logsPanel === panel) this._logsPanel = null
        },
      })
      return
    }

    this._logsOpen = true
    this._logsPanel = this.add.container(width / 2, y).setAlpha(0).setScale(1, 0.02)
    const bg = this.add.rectangle(0, 0, 620, 150, 0x04101c, 0.96)
      .setStrokeStyle(2, victory ? 0x64e8ff : 0xff7777)
    const topLine = this.add.rectangle(0, -72, 580, 2, victory ? 0x9df7ff : 0xff7777, 0.9)
    this._logsPanel.add([bg, topLine])

    this.logs.slice(-5).forEach((line, i) => {
      this._logsPanel.add(this.add.text(-286, -50 + i * 22, line, {
        fontSize: '12px',
        color: '#cdefff',
      }))
    })

    this.tweens.add({
      targets: this._logsPanel,
      scaleY: 1,
      alpha: 1,
      duration: 280,
      ease: 'Back.easeOut',
    })
  }

  _buildDoneButton(width, height) {
    const btn = this.add.text(width / 2, height - 58, 'CONCLUIR', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 24, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2f6f8f' }))
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#17313f' }))
    btn.on('pointerdown', () => this.scene.start('MenuScene'))
  }
}
