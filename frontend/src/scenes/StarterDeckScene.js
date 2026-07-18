import { Scene } from 'phaser'
import { chooseStarterDeck, getStarterDecks } from '../api/gameApi.js'
import { saveScene } from '../utils/session.js'

const NPC_IMAGES = {
  explain: 'tutorial_npc_explain',
  elements: 'tutorial_npc_elements',
  spell: 'tutorial_npc_spell',
}

const STARTER_COVER_IDS = [3, 30, 32, 34]
const CARD_BACK_KEY = 'starter_card_back'

const ELEMENT_COLOR = {
  agua: 0x38bdf8,
  terra: 0x8dff9d,
  fogo: 0xff735c,
  vento: 0xd8ff66,
}

export default class StarterDeckScene extends Scene {
  constructor() {
    super({ key: 'StarterDeckScene' })
    this._starterDecks = []
    this._dialogIndex = 0
    this._dialogText = null
    this._npc = null
    this._choicesContainer = null
    this._toastText = null
    this._isChoosing = false
    this._selectedChoice = null
  }

  preload() {
    if (!this.textures.exists(NPC_IMAGES.explain)) {
      this.load.image(NPC_IMAGES.explain, '/assets/tutorial/tutor_explain.png')
    }
    if (!this.textures.exists(NPC_IMAGES.elements)) {
      this.load.image(NPC_IMAGES.elements, '/assets/tutorial/tutor_elements.png')
    }
    if (!this.textures.exists(NPC_IMAGES.spell)) {
      this.load.image(NPC_IMAGES.spell, '/assets/tutorial/tutor_spell.png')
    }
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, '/assets/img/cover.png')
    }
    STARTER_COVER_IDS.forEach((id) => {
      const key = this._starterCoverKey(id)
      if (!this.textures.exists(key)) {
        this.load.image(key, `/assets/cards/${String(id).padStart(2, '0')}.png`)
      }
    })
  }

  create() {
    if (!localStorage.getItem('auth_token')) {
      console.info('[EZone Auth] starter_deck_blocked_missing_token')
      this.scene.start('MenuScene')
      return
    }

    console.info('[EZone Auth] starter_deck_opened')
    saveScene('StarterDeckScene')
    const { width, height } = this.cameras.main

    this._buildBackground(width, height)
    this._buildNpc(width, height)
    this._buildDialog(width, height)
    this._loadStarterDecks()
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    const steps = 44
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const r = Math.round(3 + 18 * t)
      const g = Math.round(10 + 70 * t)
      const b = Math.round(26 + 104 * t)
      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      bg.fillRect((width / steps) * i - height * 0.38, 0, width / steps + height * 0.76, height)
      bg.rotation = -0.08
    }

    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.38)
    this.add.text(width / 2, 44, 'ESCOLHA SEU PRIMEIRO BARALHO', {
      fontSize: '30px',
      color: '#bff5ff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 5,
    }).setOrigin(0.5)
  }

  _buildNpc(width, height) {
    this._npc = this.add.image(210, height - 248, NPC_IMAGES.explain)
      .setDisplaySize(310, 360)
      .setOrigin(0.5, 1)
      .setDepth(3)
    this.add.rectangle(210, height - 68, 270, 28, 0x000000, 0.22)
      .setScale(1.25, 0.65)
      .setDepth(2)
  }

  _buildDialog(width, height) {
    const boxY = height - 132
    const panel = this.add.rectangle(width / 2, boxY, width - 110, 154, 0x06111f, 0.94)
      .setStrokeStyle(2, 0x64e8ff)
      .setDepth(10)
    const name = this.add.text(86, boxY - 58, 'Tutor EZone', {
      fontSize: '16px',
      color: '#8dff9d',
      fontStyle: 'bold',
    }).setDepth(11)
    this._dialogText = this.add.text(86, boxY - 26, '', {
      fontSize: '15px',
      color: '#ffffff',
      wordWrap: { width: width - 230 },
      lineSpacing: 8,
    }).setDepth(11)

    const next = this.add.text(width - 110, boxY + 50, 'CONTINUAR', {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true })
    next.on('pointerover', () => next.setStyle({ backgroundColor: '#2f6f8f' }))
    next.on('pointerout', () => next.setStyle({ backgroundColor: '#17313f' }))
    next.on('pointerdown', () => this._advanceDialog())

    this._dialogObjects = [panel, name, next]
    this._setDialogText()
  }

  _setDialogText() {
    const lines = [
      'Bem-vindo ao EZone TCG. Antes de entrar nas arenas, você precisa escolher uma afinidade inicial ao baralho conforme seu elemento.',
      'Esse baralho será seu primeiro encontro com as guerras de Tialnnýr. As cartas continas neles serão seus soldados e suas ordens para suas futuras batalhas.',
      'Após a escolha, você receberá 50 cristais. Cristais são a moeda padrão neste mundo, porém temos EZ-Coins que são moeda mais valorizadas para aumentar seus acervos e podem ser conseguidas em eventos, torneios e comprando em nossa loja.',
      'Escolha com calma. Essa escolha inicial só pode ser feita uma vez.',
    ]
    this._dialogText.setText(lines[this._dialogIndex] ?? lines[lines.length - 1])

    const image = this._dialogIndex === 1 ? NPC_IMAGES.elements
      : this._dialogIndex === 2 ? NPC_IMAGES.spell
      : NPC_IMAGES.explain
    this._npc.setTexture(image)
  }

  _advanceDialog() {
    if (this._dialogIndex < 3) {
      this._dialogIndex += 1
      this._setDialogText()
      return
    }

    this._showChoices()
  }

  async _loadStarterDecks() {
    try {
      const response = await getStarterDecks()
      this._starterDecks = response.data.data ?? response.data
    } catch (error) {
      console.error('Erro ao carregar starters:', error)
      this._toast('Nao foi possivel carregar os baralhos iniciais.')
    }
  }

  _showChoices() {
    if (this._choicesContainer) return
    if (!this._starterDecks.length) {
      this._toast('Carregando baralhos iniciais...')
      this._loadStarterDecks()
      return
    }

    const { width } = this.cameras.main
    this._choicesContainer = this.add.container(0, 0).setDepth(12)
    const startX = width / 2 - 330
    const y = 168
    const gap = 220

    this._starterDecks.forEach((deck, index) => {
      const choice = this._createStarterChoice(startX + index * gap, y, deck)
      this._choicesContainer.add(choice)
    })
  }

  _createStarterChoice(x, y, deck) {
    const accent = ELEMENT_COLOR[deck.element] ?? 0x64e8ff
    const container = this.add.container(x, y)
    const glow = this.add.rectangle(0, -4, 142, 202, accent, 0.16)
      .setStrokeStyle(2, accent, 0.42)
      .setVisible(false)

    const shadow = this.add.ellipse(8, 104, 132, 24, 0x000000, 0.34)
    const stack = this.add.container(0, 0)
    const cardW = 118
    const cardH = 168

    for (let i = 5; i >= 1; i--) {
      const back = this.add.image(i * 3, i * 4, CARD_BACK_KEY)
        .setDisplaySize(cardW, cardH)
        .setOrigin(0.5)
        .setAngle(-2 + i * 0.7)
        .setAlpha(0.9)
      stack.add(back)
    }

    const coverId = deck.cover?.id ?? deck.cover_id
    const coverKey = this._starterCoverKey(coverId)
    const top = this.textures.exists(coverKey)
      ? this.add.image(0, 0, coverKey).setDisplaySize(cardW, cardH).setOrigin(0.5)
      : this.add.rectangle(0, 0, cardW, cardH, 0x10253a).setStrokeStyle(2, accent)
    top.setAngle(-5)
    top.setData('face', 'front')

    const namePlate = this.add.rectangle(0, 124, 168, 44, 0x06111f, 0.92)
      .setStrokeStyle(1, accent, 0.6)
    const title = this.add.text(0, 124, deck.name, {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 150 },
    }).setOrigin(0.5)

    stack.add(top)
    container.add([glow, shadow, stack, namePlate, title])
    container.setData('stack', stack)
    container.setData('topCard', top)
    container.setData('accent', accent)
    container.setSize(170, 230).setInteractive({ useHandCursor: true })
    container.on('pointerover', () => {
      glow.setVisible(true)
      this.tweens.add({ targets: container, scale: 1.04, duration: 120, ease: 'Sine.easeOut' })
    })
    container.on('pointerout', () => {
      if (!container.getData('selected')) glow.setVisible(false)
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    container.on('pointerdown', () => this._animateStarterSelection(container, deck))
    return container
  }

  _animateStarterSelection(container, deck) {
    if (this._isChoosing) return
    this._isChoosing = true

    this._choicesContainer?.list?.forEach((choice) => {
      if (choice !== container) {
        choice.disableInteractive()
        this.tweens.add({ targets: choice, alpha: 0.35, scale: 0.94, duration: 180, ease: 'Sine.easeOut' })
      }
    })

    container.setData('selected', true)
    this._selectedChoice = container
    container.disableInteractive()
    const stack = container.getData('stack')
    const top = container.getData('topCard')

    this.tweens.add({
      targets: container,
      y: container.y - 16,
      scale: 1.12,
      duration: 160,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: stack,
          scaleX: 0.03,
          duration: 190,
          ease: 'Sine.easeIn',
          onComplete: () => {
            if (top.setTexture) top.setTexture(CARD_BACK_KEY)
            top.setData('face', 'back')
            this.tweens.add({
              targets: stack,
              scaleX: 1,
              duration: 230,
              ease: 'Back.easeOut',
              onComplete: () => {
                this._isChoosing = false
                this._chooseStarter(deck)
              },
            })
          },
        })
      },
    })
  }

  _starterCoverKey(id) {
    return `starter_cover_${String(id).padStart(2, '0')}`
  }

  async _chooseStarter(deck) {
    if (this._isChoosing) return
    this._isChoosing = true
    this._toast(`Resgatando ${deck.name}...`)

    try {
      const response = await chooseStarterDeck(deck.key)
      if (response.data.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      }
      this._toast('Baralho inicial recebido. +50 cristais.')
      this.time.delayedCall(850, () => this.scene.start('MenuScene'))
    } catch (error) {
      console.error('Erro ao escolher starter:', error)
      this._isChoosing = false
      this._selectedChoice?.setData('selected', false)
      this._selectedChoice = null
      this._choicesContainer?.list?.forEach((choice) => {
        choice.setInteractive({ useHandCursor: true })
        this.tweens.add({ targets: choice, alpha: 1, scale: 1, duration: 140, ease: 'Sine.easeOut' })
      })
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel escolher o baralho.')
    }
  }

  _toast(message) {
    if (this._toastText) this._toastText.destroy()
    const { width, height } = this.cameras.main
    this._toastText = this.add.text(width / 2, height - 238, message, {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(40)

    this.time.delayedCall(2100, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }
}
