import { Scene } from 'phaser'
import { chooseInitialHero, getHeroes } from '../api/gameApi.js'
import { saveScene } from '../utils/session.js'

const HERO_COLORS = {
  tennor: 0x65d9ff,
  ispisher: 0x47c8ff,
  gimlou: 0xff8b4d,
  badur: 0x91d76d,
  morgon: 0xb485ff,
}

export default class HeroSelectionScene extends Scene {
  constructor() {
    super({ key: 'HeroSelectionScene' })
    this._heroes = []
    this._selectedHero = null
    this._heroCards = []
    this._detailContainer = null
    this._toastText = null
    this._isChoosing = false
  }

  preload() {
    // Adicione as chaves aqui quando as artes finais forem incluídas em public/assets/heroes.
    ;['tennor'].forEach((key) => {
      const textureKey = this._heroTextureKey(key)
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, `/assets/heroes/avatar_heroi_${key}.png`)
      }
    })
  }

  create() {
    if (!localStorage.getItem('auth_token')) {
      this.scene.start('MenuScene')
      return
    }

    saveScene('HeroSelectionScene')
    const { width, height } = this.cameras.main
    this._buildBackground(width, height)
    this._buildHeader(width)
    this._loadHeroes()
  }

  _buildBackground(width, height) {
    const graphics = this.add.graphics()
    graphics.fillStyle(0x020917, 1)
    graphics.fillRect(0, 0, width, height)
    graphics.fillStyle(0x0a2441, 0.7)
    graphics.fillTriangle(0, 0, width * 0.68, 0, 0, height)
    graphics.fillStyle(0x1b1240, 0.42)
    graphics.fillTriangle(width, 0, width, height, width * 0.38, height)
    this.add.rectangle(width / 2, height / 2, width, height, 0x01040b, 0.22)
  }

  _buildHeader(width) {
    this.add.text(width / 2, 50, 'ESCOLHA SEU HEROI', {
      fontSize: '31px',
      color: '#d7f8ff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 6,
    }).setOrigin(0.5)
    this.add.text(width / 2, 84, 'Todo baralho precisa de uma lenda para liderar o campo.', {
      fontSize: '14px',
      color: '#9fd6e8',
    }).setOrigin(0.5)
    this.add.rectangle(width / 2, 108, width - 130, 1, 0x2d9fbe, 0.75)
  }

  async _loadHeroes() {
    try {
      const response = await getHeroes()
      this._heroes = response.data.data ?? response.data
      this._renderHeroes()
    } catch (error) {
      console.error('Erro ao carregar herois:', error)
      this._toast('Nao foi possivel carregar os herois.')
    }
  }

  _renderHeroes() {
    if (!this._heroes.length) {
      this._toast('Nenhum heroi esta disponivel no momento.')
      return
    }

    const startX = 145
    const gap = 248
    this._heroCards = this._heroes.slice(0, 5).map((hero, index) => {
      const card = this._createHeroCard(startX + index * gap, 264, hero)
      return { hero, card }
    })
  }

  _createHeroCard(x, y, hero) {
    const accent = HERO_COLORS[hero.key] ?? 0x64e8ff
    const container = this.add.container(x, y)
    const frame = this.add.rectangle(0, 0, 204, 284, 0x06111f, 0.96)
      .setStrokeStyle(2, accent, 0.8)
    const inner = this.add.rectangle(0, -29, 182, 182, 0x071523, 0.96)
      .setStrokeStyle(1, accent, 0.45)
    const portraitFrame = this.add.rectangle(0, -31, 166, 166, 0x020a14, 0.96)
      .setStrokeStyle(1, accent, 0.7)
    const glow = this.add.rectangle(0, 0, 210, 290, accent, 0.16).setVisible(false)
    const namePlate = this.add.rectangle(0, 100, 182, 42, 0x020a14, 0.94)
      .setStrokeStyle(1, accent, 0.55)
    const name = this.add.text(0, 96, hero.name.toUpperCase(), {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const race = this.add.text(0, 119, hero.race, {
      fontSize: '11px', color: '#9fd6e8', fontStyle: 'bold',
    }).setOrigin(0.5)
    const hint = this.add.text(0, 143, 'VER DETALHES', {
      fontSize: '9px', color: '#b7eefd', fontStyle: 'bold',
    }).setOrigin(0.5)
    const art = this._createHeroArt(hero, accent)

    container.add([glow, frame, inner, portraitFrame, art, namePlate, name, race, hint])
    container.setSize(204, 284).setInteractive({ useHandCursor: true })
    container.on('pointerover', () => {
      glow.setVisible(true)
      this.tweens.add({ targets: container, scale: 1.035, duration: 120, ease: 'Sine.easeOut' })
    })
    container.on('pointerout', () => {
      if (this._selectedHero?.id !== hero.id) glow.setVisible(false)
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Sine.easeOut' })
    })
    container.on('pointerdown', () => this._selectHero(hero))
    container.setData('glow', glow)
    return container
  }

  _createHeroArt(hero, accent) {
    const key = this._heroTextureKey(hero.key)
    if (this.textures.exists(key)) {
      return this.add.image(0, -31, key).setDisplaySize(156, 156).setOrigin(0.5)
    }

    const art = this.add.container(0, -31)
    const halo = this.add.circle(0, -8, 59, accent, 0.16).setStrokeStyle(1, accent, 0.8)
    const body = this.add.ellipse(0, 34, 78, 112, accent, 0.42)
    const head = this.add.circle(0, -27, 29, accent, 0.82)
    const initial = this.add.text(0, -25, hero.name.slice(0, 1), {
      fontSize: '32px', color: '#071523', fontStyle: 'bold',
    }).setOrigin(0.5)
    art.add([halo, body, head, initial])
    return art
  }

  _selectHero(hero) {
    if (this._isChoosing) return
    this._selectedHero = hero
    this._heroCards.forEach(({ hero: candidate, card }) => {
      const selected = candidate.id === hero.id
      card.getData('glow').setVisible(selected)
      this.tweens.add({
        targets: card,
        alpha: selected ? 1 : 0.42,
        scale: selected ? 1.05 : 0.94,
        duration: 160,
        ease: 'Sine.easeOut',
      })
    })
    this._showHeroDetails(hero)
  }

  _showHeroDetails(hero) {
    if (this._detailContainer) this._detailContainer.destroy(true)
    const { width, height } = this.cameras.main
    const accent = HERO_COLORS[hero.key] ?? 0x64e8ff
    const panel = this.add.container(width / 2, height - 116).setDepth(20)
    const background = this.add.rectangle(0, 0, width - 120, 210, 0x020914, 0.68)
      .setStrokeStyle(1, accent, 0.45)
    const nameCard = this.add.rectangle(-395, -69, 300, 68, 0x071523, 0.97)
      .setStrokeStyle(1, accent, 0.85)
    const nameStrip = this.add.rectangle(-540, -69, 4, 44, accent, 1)
    const nameLabel = this.add.text(-520, -87, 'HEROI', {
      fontSize: '11px', color: '#9fd6e8', fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const title = this.add.text(-520, -58, `${hero.name} - ${hero.race}`, {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    const effectCard = this.add.rectangle(120, -69, 700, 68, 0x071523, 0.97)
      .setStrokeStyle(1, accent, 0.85)
    const effectStrip = this.add.rectangle(-225, -69, 4, 44, accent, 1)
    const effectTitle = this.add.text(-205, -87, hero.effect_name.toUpperCase(), {
      fontSize: '11px', color: this._cssColor(accent), fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const effect = this.add.text(-205, -57, hero.effect_description, {
      fontSize: '13px', color: '#d5edf5', wordWrap: { width: 655 }, lineSpacing: 2,
    }).setOrigin(0, 0.5)

    const storyCard = this.add.rectangle(-130, 39, 830, 110, 0x071523, 0.97)
      .setStrokeStyle(1, accent, 0.85)
    const storyStrip = this.add.rectangle(-535, 39, 4, 82, accent, 1)
    const storyLabel = this.add.text(-515, 6, 'HISTORIA', {
      fontSize: '11px', color: '#9fd6e8', fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const story = this.add.text(-515, 26, hero.story, {
      fontSize: '13px', color: '#c5dce7', wordWrap: { width: 760 }, lineSpacing: 4,
    }).setOrigin(0, 0)

    const button = this.add.container(407, 39)
    const buttonShadow = this.add.container(0, 6)
    const shadowCenter = this.add.rectangle(0, 0, 172, 44, 0x02070d, 0.92)
    const shadowLeft = this.add.circle(-86, 0, 22, 0x02070d, 0.92)
    const shadowRight = this.add.circle(86, 0, 22, 0x02070d, 0.92)
    buttonShadow.add([shadowCenter, shadowLeft, shadowRight])
    const buttonFace = this.add.container(0, 0)
    const faceCenter = this.add.rectangle(0, 0, 172, 44, accent, 0.9).setStrokeStyle(2, accent)
    const faceLeft = this.add.circle(-86, 0, 22, accent, 0.9).setStrokeStyle(2, accent)
    const faceRight = this.add.circle(86, 0, 22, accent, 0.9).setStrokeStyle(2, accent)
    const highlight = this.add.rectangle(0, -11, 145, 2, 0xffffff, 0.48)
    buttonFace.add([faceCenter, faceLeft, faceRight, highlight])
    const buttonLabel = this.add.text(0, 0, `ESCOLHER ${hero.name.toUpperCase()}`, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    button.add([buttonShadow, buttonFace, buttonLabel]).setSize(216, 52).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => {
      buttonFace.setScale(1.04)
      buttonLabel.setColor('#071523')
    })
    button.on('pointerout', () => {
      buttonFace.setScale(1)
      buttonLabel.setColor('#ffffff')
    })
    button.on('pointerdown', () => {
      this.tweens.add({ targets: buttonFace, y: 5, duration: 70, yoyo: true, ease: 'Sine.easeInOut' })
      this._chooseHero(hero)
    })

    panel.add([
      background,
      nameCard, nameStrip, nameLabel, title,
      effectCard, effectStrip, effectTitle, effect,
      storyCard, storyStrip, storyLabel, story,
      button,
    ])
    panel.setScale(1, 0.04)
    this.tweens.add({ targets: panel, scaleY: 1, duration: 180, ease: 'Back.easeOut' })
    this._detailContainer = panel
  }

  async _chooseHero(hero) {
    if (this._isChoosing) return
    this._isChoosing = true
    this._toast(`Vinculando ${hero.name} ao seu baralho...`)
    try {
      const response = await chooseInitialHero(hero.key)
      if (response.data.user) localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      this._toast(`${hero.name} agora lidera o seu primeiro baralho.`)
      this.time.delayedCall(850, () => this.scene.start('MenuScene'))
    } catch (error) {
      this._isChoosing = false
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel escolher este heroi.')
    }
  }

  _heroTextureKey(key) {
    return `hero_avatar_${key}`
  }

  _cssColor(value) {
    return `#${value.toString(16).padStart(6, '0')}`
  }

  _toast(message) {
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(this.cameras.main.width / 2, 126, message, {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#17313f', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(40)
    this.time.delayedCall(2400, () => {
      this._toastText?.destroy()
      this._toastText = null
    })
  }
}
