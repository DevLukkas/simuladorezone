import { Scene } from 'phaser'
import { login, logout, me, register } from '../api/gameApi.js'
import { criaturas } from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens } from '../data/itens.js'
import { comandos } from '../data/comandos.js'
import { cenarios } from '../data/cenarios.js'
import { clearAuth, clearScene, saveScene } from '../utils/session.js'
import { avatarTextureKey, avatarUrlFor } from '../utils/avatar.js'

const CARD_BACK_KEY = 'menu_card_back'
const ACTIVE_EVENT = {
  name: 'Beta Teste: Abertura do Servidor',
  scene: 'EventScene',
}

function normalize(cards, cardType) {
  return cards.map(card => ({
    ...card,
    name: card.nome ?? card.name,
    card_type: cardType,
  }))
}

const MENU_CARDS = [
  ...normalize(criaturas, 'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens.map(card => ({ ...card, elemento: 'neutro' })), 'item'),
  ...normalize(comandos, 'comando'),
  ...normalize(cenarios, 'cenario'),
].slice(0, 28)

export default class MenuScene extends Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  preload() {
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, '/assets/img/cover.png')
    }

    MENU_CARDS.forEach(card => {
      const key = `menu_card_${card.id}`
      const file = `/assets/cards/${String(card.id).padStart(2, '0')}.png`
      if (!this.textures.exists(key)) this.load.image(key, file)
    })
  }

  create() {
    saveScene('MenuScene')
    this._loginHtmlElements = []
    this._modalHtmlElements = []
    this._loginContainer = null
    this._menuContainer = null
    this._registerModal = null
    this._toastText = null
    this._cardRainTimer = null
    this._loginEmailInput = null
    this._loginPasswordInput = null

    this.events.once('shutdown', () => this._cleanupScene())

    const { width, height } = this.cameras.main
    this._buildBackground(width, height)
    this._startCardRain(width, height)
    this._buildBrand(width, height)

    const token = localStorage.getItem('auth_token')
    this._authLog('menu_created', { hasToken: Boolean(token) })
    if (token) {
      this._loadSession()
    } else {
      this._showLoginForm()
    }
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    const steps = 44
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const r = Math.round(3 + 20 * t)
      const g = Math.round(13 + 72 * t)
      const b = Math.round(32 + 104 * t)
      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      bg.fillRect((width / steps) * i - height * 0.35, 0, width / steps + height * 0.7, height)
      bg.rotation = -0.1
    }

    const shine = this.add.rectangle(-width * 0.16, height / 2, width * 0.24, height * 1.45, 0x7eeaff, 0.12)
      .setAngle(-27)
      .setBlendMode('ADD')
    this.tweens.add({
      targets: shine,
      x: width * 1.18,
      duration: 4600,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })

    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.48)
  }

  _buildBrand(width, height) {
    this.add.text(width / 2, height * 0.135, 'EZone TCG', {
      fontSize: '50px',
      color: '#bff5ff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 7,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.19, 'SIMULATOR', {
      fontSize: '15px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _startCardRain(width, height) {
    const spawn = () => this._spawnFallingCard(width, height)
    spawn()
    this._cardRainTimer = this.time.addEvent({
      delay: this._randInt(2000, 4000),
      loop: true,
      callback: () => {
        spawn()
        this._cardRainTimer.delay = this._randInt(2000, 4000)
      },
    })
  }

  _spawnFallingCard(width, height) {
    const faceUp = Math.random() > 0.45
    const card = MENU_CARDS[this._randInt(0, MENU_CARDS.length - 1)]
    const key = faceUp && card ? `menu_card_${card.id}` : CARD_BACK_KEY
    if (!this.textures.exists(key)) return

    const x = this._randInt(80, width - 80)
    const startY = -120
    const endY = height + 140
    const cardObject = this.add.image(x, startY, key)
      .setDisplaySize(76, 106)
      .setAlpha(0.2)
      .setDepth(1)
      .setAngle(this._randInt(-22, 22))

    this.tweens.add({
      targets: cardObject,
      y: endY,
      x: x + this._randInt(-120, 120),
      angle: cardObject.angle + this._randInt(-130, 130),
      alpha: 0.34,
      duration: this._randInt(5200, 7600),
      ease: 'Sine.easeIn',
      onComplete: () => cardObject.destroy(),
    })
  }

  async _loadSession() {
    try {
      const response = await me()
      const user = this._saveAuth(response.data)
      this._authLog('session_restored', { userId: user?.id ?? null })
      this._goAfterAuth(user)
    } catch (error) {
      this._authLog('session_restore_failed', {
        status: error?.response?.status ?? null,
        message: error?.message ?? 'unknown',
      })
      clearAuth()
      this._showLoginForm()
    }
  }

  _showLoginForm() {
    this._clearLoginForm()
    const { width, height } = this.cameras.main
    this._loginContainer = this.add.container(0, 0).setDepth(10)

    const panelX = width / 2
    const panelY = height * 0.53
    const panel = this.add.rectangle(panelX, panelY, 440, 290, 0x06111f, 0.88)
      .setStrokeStyle(2, 0x64e8ff)
    const topLine = this.add.rectangle(panelX, panelY - 143, 390, 2, 0x9df7ff, 0.9)
    const title = this.add.text(panelX, panelY - 106, 'Entrar na Conta', {
      fontSize: '21px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const subtitle = this.add.text(panelX, panelY - 78, 'Acesse seu jogador para salvar decks e partidas.', {
      fontSize: '12px',
      color: '#9fd6e8',
    }).setOrigin(0.5)

    const email = this._addHtmlInput(panelX - 150, panelY - 28, 300, 38, 'E-mail', 'email', this._loginHtmlElements, 24)
    const password = this._addHtmlInput(panelX - 150, panelY + 28, 300, 38, 'Senha', 'password', this._loginHtmlElements, 24)
    this._loginEmailInput = email
    this._loginPasswordInput = password

    const btnLogin = this._addButton(panelX, panelY + 88, 'ENTRAR', '#17313f', () => {
      this._submitLogin(email.value, password.value)
    })
    const btnRegister = this.add.text(panelX, panelY + 128, 'Criar nova conta', {
      fontSize: '13px',
      color: '#8fe8ff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnRegister.on('pointerover', () => btnRegister.setStyle({ color: '#ffffff' }))
    btnRegister.on('pointerout', () => btnRegister.setStyle({ color: '#8fe8ff' }))
    btnRegister.on('pointerdown', () => this._openRegisterModal())

    const versionText = this.add.text(width / 2, height * 0.91, 'v0.1.0 - Em desenvolvimento', {
      fontSize: '12px',
      color: '#7f8f99',
    }).setOrigin(0.5)

    this._loginContainer.add([panel, topLine, title, subtitle, btnLogin, btnRegister, versionText])
  }

  async _submitLogin(email, password) {
    if (!email || !password) {
      this._toast('Informe e-mail e senha.')
      return
    }

    try {
      const response = await login(email, password)
      const user = this._saveAuth(response.data)
      this._authLog('login_api_success', {
        status: response.status,
        userId: user?.id ?? null,
        hasStoredToken: Boolean(localStorage.getItem('auth_token')),
      })
      this._clearLoginForm()
      this._goAfterAuth(user)
      this._toast('Login realizado.')
    } catch (error) {
      this._authLog('login_api_failed', {
        status: error?.response?.status ?? null,
        message: error?.message ?? 'unknown',
      })
      this._toast(this._errorMessage(error, 'Não foi possível entrar.'))
    }
  }

  _openRegisterModal() {
    if (this._registerModal) return
    this._setLoginInputsVisible(false)

    const { width, height } = this.cameras.main
    this._registerModal = this.add.container(0, 0).setDepth(50)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.72)
      .setOrigin(0)
      .setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, 500, 382, 0x06111f, 0.97)
      .setStrokeStyle(2, 0x64e8ff)
      .setInteractive()
    const topLine = this.add.rectangle(width / 2, height / 2 - 188, 430, 2, 0x9df7ff, 0.9)
    const title = this.add.text(width / 2, height / 2 - 148, 'Cadastrar Jogador', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const close = this.add.text(width / 2 + 215, height / 2 - 152, 'X', {
      fontSize: '16px',
      color: '#ff7777',
      fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    this._modalHtmlElements = []
    const name = this._addHtmlInput(width / 2 - 170, height / 2 - 86, 340, 38, 'Nome do jogador', 'text', this._modalHtmlElements, 60)
    const email = this._addHtmlInput(width / 2 - 170, height / 2 - 28, 340, 38, 'E-mail', 'email', this._modalHtmlElements, 60)
    const password = this._addHtmlInput(width / 2 - 170, height / 2 + 30, 340, 38, 'Senha (mín. 6)', 'password', this._modalHtmlElements, 60)

    const submit = this._addButton(width / 2, height / 2 + 104, 'CRIAR CONTA', '#17313f', () => {
      this._submitRegister(name.value, email.value, password.value)
    })
    const hint = this.add.text(width / 2, height / 2 + 146, 'A conta será vinculada aos seus decks salvos futuramente.', {
      fontSize: '11px',
      color: '#9fd6e8',
    }).setOrigin(0.5)

    close.on('pointerdown', () => this._closeRegisterModal())
    overlay.on('pointerdown', () => this._closeRegisterModal())
    this._registerModal.add([overlay, panel, topLine, title, close, submit, hint])
  }

  async _submitRegister(name, email, password) {
    if (!name || !email || !password) {
      this._toast('Preencha nome, e-mail e senha.')
      return
    }

    try {
      await register(name, email, password)
      this._closeRegisterModal()
      if (this._loginEmailInput) this._loginEmailInput.value = email
      if (this._loginPasswordInput) {
        this._loginPasswordInput.value = ''
        this._loginPasswordInput.focus()
      }
      this._toast('Conta criada. Agora faca login para continuar.')
    } catch (error) {
      this._toast(this._errorMessage(error, 'Não foi possível cadastrar.'))
    }
  }

  _showMainMenu(authenticatedUser = this._authUser()) {
    this._clearLoginForm()
    if (this._menuContainer) this._menuContainer.destroy(true)

    const { width, height } = this.cameras.main
    this._menuContainer = this.add.container(0, 0).setDepth(10)
    const user = authenticatedUser
    if (!user?.id) {
      this._authLog('main_menu_blocked_missing_user')
      clearAuth()
      this._showLoginForm()
      return
    }

    this._authLog('main_menu_opened', { userId: user.id })

    const isAdmin = this._isAdminUser(user)

    const panelY = height * 0.57
    const panel = this.add.rectangle(width / 2, panelY, 520, isAdmin ? 452 : 398, 0x06111f, 0.6)
      .setStrokeStyle(1, 0x1e9cc1)
    const topLine = this.add.rectangle(width / 2, panelY - (isAdmin ? 225 : 198), 470, 2, 0x9df7ff, 0.85)
    const playerHeader = this._buildPlayerHeader(width / 2, 44, user)
    this._menuContainer.add([panel, topLine, playerHeader])

    const buttons = [
      { label: 'PARTIDA AMISTOSA', scene: 'LobbyScene', accent: 0x64e8ff },
      { label: 'MARKETPLACE GLOBAL', scene: null, accent: 0xffcc66, message: 'Marketplace global será criado como loja de comércio entre jogadores.' },
      { label: 'DECK BUILDER', scene: 'DeckBuilderScene', accent: 0x8dff9d },
      { label: 'LABORATÓRIO', scene: 'LaboratoryScene', accent: 0xff77b7 },
      { label: 'PERFIL', scene: 'ProfileScene', accent: 0xb78dff },
    ]
    if (isAdmin) {
      buttons.push({ label: 'ADMINISTRADOR', scene: 'AdminPanelScene', accent: 0xff7777 })
    }

    buttons.forEach((btn, i) => {
      const b = this._addMainMenuButton(width / 2, height * 0.352 + i * 58, btn, () => {
        if (!btn.scene) {
          this._toast(btn.message ?? 'Essa área ainda não foi criada.')
        } else if (this.scene.get(btn.scene)) {
          this.scene.start(btn.scene, btn.scene === 'ProfileScene' ? { userId: null } : undefined)
        } else {
          this._toast(`Cena ${btn.scene} ainda não implementada.`)
        }
      })
      this._menuContainer.add(b)
    })

    const eventButton = this._addEventButton(width / 2 + 392, panelY - 46, ACTIVE_EVENT, () => {
      if (this.scene.get(ACTIVE_EVENT.scene)) {
        this.scene.start(ACTIVE_EVENT.scene)
        return
      }
      this._toast('Evento de abertura criado. A cena do evento será conectada no próximo passo.')
    })
    this._menuContainer.add(eventButton)

    const offersButton = this._addOffersButton(34, height / 2, () => this.scene.start('OffersScene'))
    this._menuContainer.add(offersButton)

    const logoutBtn = this.add.container(width / 2, height - 54)
    const logoutBg = this.add.rectangle(0, 0, 178, 34, 0x180c10, 0.86)
      .setStrokeStyle(1, 0x7a3333)
    const logoutLabel = this.add.text(0, 0, 'SAIR DA CONTA', {
      fontSize: '12px',
      color: '#d8caca',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    logoutBtn.add([logoutBg, logoutLabel])
    logoutBtn.setSize(178, 34).setInteractive({ useHandCursor: true })
    logoutBtn.on('pointerover', () => {
      logoutBg.setFillStyle(0x3a1218, 0.95)
      logoutLabel.setColor('#ff9999')
    })
    logoutBtn.on('pointerout', () => {
      logoutBg.setFillStyle(0x180c10, 0.86)
      logoutLabel.setColor('#d8caca')
    })
    logoutBtn.on('pointerdown', () => this._logout())
    this._menuContainer.add(logoutBtn)
  }

  _buildPlayerHeader(x, y, user) {
    const header = this.add.container(x, y)
    const w = 690
    const bg = this.add.rectangle(0, 0, w, 58, 0x06111f, 0.82)
      .setStrokeStyle(1, 0x64e8ff)
    const top = this.add.rectangle(0, -29, w - 18, 2, 0x9df7ff, 0.8)
    const bottom = this.add.rectangle(0, 29, w - 18, 1, 0x1e9cc1, 0.78)

    const avatarRing = this.add.circle(-w / 2 + 42, 0, 25, 0x071523, 1)
      .setStrokeStyle(2, 0xd8ff66)
    const avatar = this.add.image(-w / 2 + 42, 0, CARD_BACK_KEY).setDisplaySize(46, 46)
    avatar.setMask(this._createCircleMask(x - w / 2 + 42, y, 23))
    this._loadAvatarTexture(avatarUrlFor(user), key => {
      avatar.setTexture(key)
      avatar.setDisplaySize(46, 46)
    })

    const name = this.add.text(-w / 2 + 82, -12, user.name, {
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const level = this.add.text(-w / 2 + 82, 13, `Nível ${user?.level ?? 1}`, {
      fontSize: '11px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    const rank = this._headerMetric(-104, 'RANK', `#${user?.ranking_position ?? '--'}`, '#d8ff66')
    const wins = this._headerMetric(20, 'VITÓRIAS', String(user?.wins ?? 0), '#8dff9d')
    const crystals = this._headerMetric(158, 'CRISTAIS', String(user?.crystals ?? 0), '#d8ff66')
    const coins = this._headerMetric(296, 'EZ-COIN', String(user?.ez_coins ?? 0), '#64e8ff')

    header.add([bg, top, bottom, avatarRing, avatar, name, level, rank, wins, crystals, coins])
    return header
  }

  _headerMetric(x, label, value, color) {
    const group = this.add.container(x, 0)
    const labelText = this.add.text(0, -12, label, {
      fontSize: '9px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const valueText = this.add.text(0, 10, value, {
      fontSize: '14px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5)
    group.add([labelText, valueText])
    return group
  }

  _loadAvatarTexture(url, onReady) {
    const key = avatarTextureKey(url)
    if (this.textures.exists(key)) {
      onReady(key)
      return
    }

    this.load.image(key, url)
    this.load.once('complete', () => {
      if (this.textures.exists(key)) onReady(key)
    })
    this.load.once('loaderror', () => onReady(CARD_BACK_KEY))
    this.load.start()
  }

  _addMainMenuButton(x, y, config, onClick) {
    const button = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, 390, 48, 0x071523, 0.9)
      .setStrokeStyle(1, config.accent)
    const accent = this.add.rectangle(-190, 0, 4, 34, config.accent, 0.95)
    const shine = this.add.rectangle(-35, 0, 72, 48, 0xffffff, 0.035)
      .setAngle(-18)
      .setBlendMode('ADD')
    const label = this.add.text(0, 0, config.label, {
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const arrow = this.add.text(164, 0, '>', {
      fontSize: '18px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    button.add([bg, accent, shine, label, arrow])
    button.setSize(390, 48).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => {
      bg.setFillStyle(0x0b2740, 0.98)
      shine.setAlpha(0.12)
      label.setColor('#bff5ff')
      this.tweens.add({ targets: button, scaleX: 1.035, scaleY: 1.035, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerout', () => {
      bg.setFillStyle(0x071523, 0.9)
      shine.setAlpha(0.035)
      label.setColor('#ffffff')
      this.tweens.add({ targets: button, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerdown', onClick)
    return button
  }

  _addEventButton(x, y, event, onClick) {
    const button = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, 258, 88, 0x071523, 0.92)
      .setStrokeStyle(1, 0xffcc66)
    const strip = this.add.rectangle(-125, 0, 5, 58, 0xffcc66, 0.95)
    const eyebrow = this.add.text(-96, -25, 'EVENTO ATIVO', {
      fontSize: '10px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const title = this.add.text(-96, 2, event.name, {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      wordWrap: { width: 176 },
    }).setOrigin(0, 0.5)
    const arrow = this.add.text(102, 0, '>', {
      fontSize: '20px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    button.add([bg, strip, eyebrow, title, arrow])
    button.setSize(258, 88).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => {
      bg.setFillStyle(0x1f2330, 0.98)
      this.tweens.add({ targets: button, scaleX: 1.03, scaleY: 1.03, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerout', () => {
      bg.setFillStyle(0x071523, 0.92)
      this.tweens.add({ targets: button, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerdown', onClick)
    this.tweens.add({
      targets: strip,
      alpha: 0.45,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    return button
  }

  _addOffersButton(x, y, onClick) {
    const button = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, 58, 152, 0x120916, 0.94)
      .setStrokeStyle(1, 0xffcc66)
    const glow = this.add.rectangle(0, 0, 64, 158, 0xffcc66, 0.08)
    const icon = this.add.text(0, -47, '$', {
      fontSize: '26px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const label = this.add.text(0, 18, 'OFERTAS', {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAngle(-90)
    const dot = this.add.circle(17, -58, 6, 0xff5555, 1)
      .setStrokeStyle(1, 0xffffff, 0.75)

    button.add([glow, bg, icon, label, dot])
    button.setSize(58, 152).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => {
      bg.setFillStyle(0x251024, 0.98)
      icon.setColor('#ffffff')
      this.tweens.add({ targets: button, x: x + 8, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerout', () => {
      bg.setFillStyle(0x120916, 0.94)
      icon.setColor('#ffdd77')
      this.tweens.add({ targets: button, x, duration: 120, ease: 'Sine.easeOut' })
    })
    button.on('pointerdown', onClick)
    this.tweens.add({
      targets: dot,
      alpha: 0.35,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    return button
  }

  _createCircleMask(x, y, radius) {
    const shape = this.make.graphics({ add: false })
    shape.fillStyle(0xffffff, 1)
    shape.fillCircle(x, y, radius)
    return shape.createGeometryMask()
  }

  _isAdminUser(user) {
    return Boolean(user?.is_admin || user?.role === 'admin' || String(user?.name ?? '').toLowerCase() === 'xlukao')
  }

  async _logout() {
    try {
      await logout()
    } catch {
      // Se o token já expirou, limpamos a sessão local mesmo assim.
    }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    if (this._menuContainer) {
      this._menuContainer.destroy(true)
      this._menuContainer = null
    }
    this._showLoginForm()
  }

  _addButton(x, y, label, color, onClick) {
    const button = this.add.text(x, y, label, {
      fontSize: '15px',
      color: '#ffffff',
      backgroundColor: color,
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => button.setStyle({ backgroundColor: '#2f6f8f' }))
    button.on('pointerout', () => button.setStyle({ backgroundColor: color }))
    button.on('pointerdown', onClick)
    return button
  }

  _addHtmlInput(x, y, w, h, placeholder, type = 'text', bucket = this._loginHtmlElements, zIndex = 20) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height
    const input = document.createElement('input')
    input.type = type
    input.placeholder = placeholder
    input.style.cssText = [
      'position: fixed',
      'left: ' + (canvas.left + x * scaleX) + 'px',
      'top: ' + (canvas.top + y * scaleY - (h * scaleY) / 2) + 'px',
      'width: ' + (w * scaleX) + 'px',
      'height: ' + (h * scaleY) + 'px',
      'background: rgba(6, 17, 31, 0.96)',
      'color: #fff',
      'border: 1px solid #64e8ff',
      'border-radius: 4px',
      'box-sizing: border-box',
      'padding: 0 12px',
      'font-size: 13px',
      'line-height: ' + (h * scaleY) + 'px',
      'outline: none',
      'z-index: ' + zIndex,
      'box-shadow: 0 0 12px rgba(100, 232, 255, 0.12)',
    ].join(';')
    document.body.appendChild(input)
    bucket.push(input)
    return input
  }

  _setLoginInputsVisible(visible) {
    this._loginHtmlElements.forEach(input => {
      input.style.display = visible ? 'block' : 'none'
    })
  }

  _clearLoginForm() {
    if (this._loginContainer) {
      this._loginContainer.destroy(true)
      this._loginContainer = null
    }
    this._removeLoginHtmlElements()
    this._removeModalHtmlElements()
  }

  _closeRegisterModal() {
    if (this._registerModal) {
      this._registerModal.destroy(true)
      this._registerModal = null
    }
    this._removeModalHtmlElements()
    this._setLoginInputsVisible(true)
  }

  _cleanupScene() {
    if (this._cardRainTimer) {
      this._cardRainTimer.remove(false)
      this._cardRainTimer = null
    }
    this._removeLoginHtmlElements()
    this._removeModalHtmlElements()
  }

  _removeLoginHtmlElements() {
    this._loginHtmlElements?.forEach(el => el.remove())
    this._loginHtmlElements = []
    this._loginEmailInput = null
    this._loginPasswordInput = null
  }

  _removeModalHtmlElements() {
    this._modalHtmlElements?.forEach(el => el.remove())
    this._modalHtmlElements = []
  }

  _saveAuth(payload = {}) {
    // A API local responde { token, user }; algumas versões já publicadas
    // respondem { data: { token, user } }. Normalizamos os dois formatos.
    const auth = payload?.data?.token || payload?.data?.user ? payload.data : payload

    clearScene()
    localStorage.removeItem('ez_user')
    localStorage.removeItem('user')
    if (auth.token) localStorage.setItem('auth_token', auth.token)
    if (auth.user) localStorage.setItem('auth_user', JSON.stringify(auth.user))
    this._authLog('auth_saved', {
      hasToken: Boolean(auth.token),
      userId: auth.user?.id ?? null,
      responseKeys: Object.keys(payload ?? {}),
      hasNestedAuth: auth !== payload,
    })
    return auth.user ?? null
  }

  _goAfterAuth(authenticatedUser = this._authUser()) {
    const user = authenticatedUser
    if (user && !user.starter_deck_chosen_at) {
      this._authLog('opening_starter_deck', { userId: user.id })
      this.scene.start('StarterDeckScene')
      return
    }

    this._authLog('opening_main_menu', { userId: user?.id ?? null })
    this._showMainMenu(user)
  }

  _authLog(event, context = {}) {
    console.info(`[EZone Auth] ${event}`, context)
  }

  _authUser() {
    try {
      return JSON.parse(localStorage.getItem('auth_user'))
    } catch {
      return null
    }
  }

  _errorMessage(error, fallback) {
    const data = error?.response?.data
    const errors = data?.errors
    if (errors) {
      const first = Object.values(errors)[0]
      if (Array.isArray(first) && first[0]) return first[0]
    }
    return data?.message ?? fallback
  }

  _toast(message) {
    const { width, height } = this.cameras.main
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(width / 2, height - 110, message, {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(90)
    this.time.delayedCall(2600, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}
