import { Scene } from 'phaser'
import { accelerateCraft, buyBooster, claimCraft, dissolveCard, getLaboratory, startCraft } from '../api/gameApi.js'
import { saveScene } from '../utils/session.js'

const ELEMENTS = ['agua', 'terra', 'fogo', 'vento', 'vazio', 'cosmico']
const TYPE_CHOICES = [
  { label: 'Comando', recipeKey: 'command_any' },
  { label: 'Habilidade', recipeKey: 'ability_any', elementRecipeKey: 'ability_element' },
  { label: 'Cenario', recipeKey: 'scenario_any' },
  { label: 'Criatura', recipeKey: 'creature_any', elementRecipeKey: 'creature_element' },
  { label: 'Item', recipeKey: 'item_any' },
]

export default class LaboratoryScene extends Scene {
  constructor() {
    super({ key: 'LaboratoryScene' })
  }

  preload() {
    if (!this.textures.exists('black_merchant')) this.load.image('black_merchant', '/assets/img/black-merchant.png')
    if (!this.textures.exists('card_back_lab')) this.load.image('card_back_lab', '/assets/img/cover.png')
  }

  create() {
    saveScene('LaboratoryScene')
    this._state = null
    this._toastText = null
    this._content = this.add.container(0, 0)
    this._timerEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this._refreshCountdown() })
    this.events.once('shutdown', () => this._timerEvent?.remove(false))
    this._buildShell()
    this._load()
  }

  async _load() {
    try {
      const response = await getLaboratory()
      this._state = response.data
      if (response.data?.user) localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      this._render()
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel carregar o laboratorio.')
    }
  }

  _buildShell() {
    const { width, height } = this.cameras.main
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x070b12, 0x10192b, 0x170e14, 0x2c1b11, 1)
    bg.fillRect(0, 0, width, height)

    this.add.text(width / 2, 42, 'Laboratorio de Cartas', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#050812',
      strokeThickness: 6,
    }).setOrigin(0.5)

    this._button(74, 44, 112, '< VOLTAR', 0x17313f, () => this.scene.start('MenuScene'))
    this.add.rectangle(width / 2, 84, width, 1, 0xffcc66, 0.3)

    this.add.image(width - 46, height - 318, 'black_merchant')
      .setDisplaySize(430, 646)
      .setOrigin(0.5)
      .setAlpha(0.96)

    this._speech(width - 430, 262)
  }

  _speech(x, y) {
    const box = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, 356, 96, 0x120916, 0.94)
      .setStrokeStyle(1, 0xffcc66)
    const text = this.add.text(-158, -28, 'Ola viajante, deseja comprar cartas para melhorar o seu baralho?', {
      fontSize: '13px',
      color: '#ffffff',
      wordWrap: { width: 260 },
    }).setOrigin(0, 0)
    const btn = this._button(112, 22, 104, 'VER ITENS', 0x4a3314, () => this._openMerchantShop())
    box.add([bg, text, btn])
  }

  _render() {
    this._content.destroy(true)
    this._content = this.add.container(0, 0)
    this._countdownText = null
    this._renderResourceBar()
    this._renderAltar()
  }

  _renderResourceBar() {
    const user = this._state?.user ?? {}
    const bar = this.add.container(0, 0)
    const bg = this.add.rectangle(0, 86, 1280, 46, 0x06111f, 0.76).setOrigin(0)
    const essence = this.add.text(54, 109, `Essencias: ${this._state?.essences ?? 0}`, {
      fontSize: '15px',
      color: '#d8ff66',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const crystals = this.add.text(232, 109, `Cristais: ${user.crystals ?? 0}`, {
      fontSize: '14px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const coins = this.add.text(372, 109, `EZ-Coins: ${user.ez_coins ?? 0}`, {
      fontSize: '14px',
      color: '#64e8ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const dissolve = this._button(1090, 109, 142, 'DISSOLVER', 0x3a2216, () => this._openDissolveModal(), 12)
    bar.add([bg, essence, crystals, coins, dissolve])
    this._content.add(bar)
  }

  _renderAltar() {
    const active = this._activeProject()
    const ready = active && this._projectRemaining(active) <= 0
    const altar = this.add.container(0, 0)
    const panel = this.add.rectangle(54, 154, 660, 498, 0x06111f, 0.72)
      .setOrigin(0)
      .setStrokeStyle(1, 0x8f6a2e)
    const title = this.add.text(84, 188, 'Altar da criacao', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const subtitle = this.add.text(84, 218, 'Escolha uma receita, aguarde o ritual e recolha a carta quando ela despertar.', {
      fontSize: '13px',
      color: '#9fd6e8',
    }).setOrigin(0, 0.5)
    altar.add([panel, title, subtitle])

    if (ready) {
      this._renderReadyCard(altar, active)
    } else {
      this._renderBackCard(altar, active)
    }

    if (!active) {
      const create = this._button(384, 578, 160, 'CRIAR CARTA', 0x17313f, () => this._openCraftWizard())
      altar.add(create)
    } else if (!ready) {
      const hint = this.add.text(384, 578, 'Carta em criacao', {
        fontSize: '14px',
        color: '#ffdd77',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      altar.add(hint)
      this._renderAccelerators(altar, active)
    }

    this._content.add(altar)
  }

  _renderBackCard(altar, project) {
    const card = this.add.image(384, 392, 'card_back_lab')
      .setDisplaySize(190, 266)
      .setAlpha(project ? 0.72 : 0.36)
    const veil = this.add.rectangle(384, 392, 208, 284, 0x000000, project ? 0.14 : 0.32)
      .setStrokeStyle(1, 0xffcc66, 0.38)
    altar.add([card, veil])

    if (project) {
      const timer = this.add.text(384, 392, this._projectTimeLabel(project), {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      }).setOrigin(0.5)
      timer.setData('projectId', project.id)
      timer.setData('completesAt', project.completes_at)
      this._countdownText = timer
      const recipe = this.add.text(384, 532, project.recipe?.name ?? 'Carta', {
        fontSize: '13px',
        color: '#9fd6e8',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      altar.add([timer, recipe])
    } else {
      const empty = this.add.text(384, 392, 'Aguardando ritual', {
        fontSize: '16px',
        color: '#9fd6e8',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      altar.add(empty)
    }
  }

  _renderReadyCard(altar, project) {
    const card = project.payload?.card
    const key = card ? `lab_card_${card.id}` : 'card_back_lab'
    const show = () => {
      const image = this.add.image(384, 392, this.textures.exists(key) ? key : 'card_back_lab')
        .setDisplaySize(190, 266)
        .setInteractive({ useHandCursor: true })
      const glow = this.add.rectangle(384, 392, 216, 292, 0xffcc66, 0.08)
        .setStrokeStyle(3, 0xffdd77, 0.95)
      const label = this.add.text(384, 548, 'Clique na carta para recolher', {
        fontSize: '14px',
        color: '#ffdd77',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      image.on('pointerdown', () => this._claim(project.id))
      this.tweens.add({ targets: glow, alpha: 0.28, duration: 780, yoyo: true, repeat: -1 })
      altar.add([glow, image, label])
    }

    if (card && !this.textures.exists(key)) {
      this.load.image(key, `/assets/cards/${String(card.id).padStart(2, '0')}.png`)
      this.load.once('complete', show)
      this.load.start()
      return
    }
    show()
  }

  _renderAccelerators(altar, project) {
    const items = this._state?.accelerators ?? []
    if (!items.length) return
    const label = this.add.text(82, 616, 'Acelerar:', {
      fontSize: '12px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    altar.add(label)
    items.slice(0, 3).forEach((item, index) => {
      const minutes = item.payload?.minutes ?? 0
      altar.add(this._button(186 + index * 132, 616, 118, `${minutes} MIN (${item.quantity})`, 0x4a3314, () => this._accelerate(project.id, item.item_key), 10))
    })
  }

  _openCraftWizard() {
    const modal = this._modal('Criar carta', 620, 430)
    const state = { type: null, wantsElement: false, element: null }
    const render = () => {
      modal.body.destroy(true)
      modal.body = this.add.container(0, 0).setDepth(91)
      modal.root.add(modal.body)

      if (!state.type) {
        this._modalText(modal, 352, 224, 'Escolher tipo?', 19, '#ffffff', true)
        TYPE_CHOICES.forEach((choice, index) => {
          modal.body.add(this._button(340 + (index % 2) * 230, 282 + Math.floor(index / 2) * 54, 184, choice.label.toUpperCase(), 0x17313f, () => {
            state.type = choice
            render()
          }))
        })
        return
      }

      if (state.type.elementRecipeKey && state.wantsElement === false && state.element === null) {
        this._modalText(modal, 352, 224, `${state.type.label} pode conter elemento. Deseja escolher?`, 17, '#ffffff', true)
        modal.body.add(this._button(438, 300, 150, 'SIM', 0x17313f, () => {
          state.wantsElement = true
          render()
        }))
        modal.body.add(this._button(632, 300, 150, 'NAO', 0x3a2216, () => {
          state.wantsElement = false
          state.element = ''
          render()
        }))
        return
      }

      if (state.type.elementRecipeKey && state.wantsElement && !state.element) {
        this._modalText(modal, 352, 224, 'Escolha o elemento', 18, '#ffffff', true)
        ELEMENTS.forEach((element, index) => {
          modal.body.add(this._button(330 + (index % 3) * 160, 286 + Math.floor(index / 3) * 58, 132, element.toUpperCase(), 0x17313f, () => {
            state.element = element
            render()
          }))
        })
        return
      }

      const recipeKey = state.element ? state.type.elementRecipeKey : state.type.recipeKey
      const recipe = this._recipe(recipeKey)
      this._modalText(modal, 352, 220, 'Confirmar criacao', 19, '#ffffff', true)
      this._modalText(modal, 384, 272, `Tipo: ${state.type.label}`, 14, '#9fd6e8')
      this._modalText(modal, 384, 304, `Elemento: ${state.element || 'sem escolha especifica'}`, 14, '#9fd6e8')
      this._modalText(modal, 384, 336, `Custo: ${recipe?.essence_cost ?? 0} essencias`, 16, '#ffdd77', true)
      modal.body.add(this._button(500, 394, 150, 'CONFIRMAR', 0x17313f, async () => {
        modal.root.destroy(true)
        await this._craft(recipeKey, state.element || null)
      }))
    }
    render()
  }

  _openDissolveModal() {
    const modal = this._modal('Dissolver cartas excedentes', 760, 500)
    const cards = this._state?.dissolvable_cards ?? []
    if (!cards.length) {
      this._modalText(modal, 340, 304, 'Nenhuma carta acima de 3 copias.', 15, '#9fd6e8')
      return
    }
    cards.slice(0, 7).forEach((card, index) => {
      const y = 218 + index * 44
      this._modalText(modal, 300, y, card.name, 12, '#ffffff', true)
      this._modalText(modal, 300, y + 18, `${card.quantity} copias | dissolve ${card.dissolvable} | +${card.essence_value}`, 11, '#9fd6e8')
      modal.body.add(this._button(810, y + 8, 104, 'DISSOLVER', 0x3a2216, async () => {
        modal.root.destroy(true)
        await this._dissolve(card.uid)
      }, 10))
    })
  }

  _openMerchantShop() {
    const modal = this._modal('Black Mercador - Boosters', 850, 470)
    ;(this._state?.boosters ?? []).forEach((booster, index) => {
      const x = 260 + (index % 3) * 250
      const y = 226 + Math.floor(index / 3) * 154
      const bg = this.add.rectangle(x, y, 210, 112, booster.available ? 0x10253a : 0x24242b, 0.96).setStrokeStyle(1, booster.available ? 0x64e8ff : 0x66666f)
      const pack = this.add.rectangle(x - 70, y, 48, 76, booster.available ? 0xffcc66 : 0x777777, 0.9).setStrokeStyle(2, 0xffffff, 0.35)
      const name = this.add.text(x - 34, y - 34, booster.name, { fontSize: '13px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 122 } }).setOrigin(0, 0)
      const price = this.add.text(x - 34, y + 14, booster.available ? '250 cristais' : 'Em breve', { fontSize: '12px', color: '#ffdd77' }).setOrigin(0, 0)
      const btn = this._button(x + 46, y + 40, 84, 'COMPRAR', booster.available ? 0x17313f : 0x333333, () => booster.available && this._buyBooster(booster.key, modal.root), 10)
      modal.body.add([bg, pack, name, price, btn])
    })
  }

  async _craft(recipeKey, element) {
    try {
      const response = await startCraft(recipeKey, element)
      this._state.user = response.data.user
      this._state.projects = response.data.projects
      this._state.essences = response.data.user.card_essences
      this._render()
      this._toast('Criacao iniciada.')
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel criar.')
    }
  }

  async _dissolve(uid) {
    try {
      const response = await dissolveCard(uid, 1)
      this._state.user = response.data.user
      this._state.essences = response.data.user.card_essences
      this._state.dissolvable_cards = response.data.dissolvable_cards
      this._render()
      this._toast(`+${response.data.essence_gained} essencias.`)
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel dissolver.')
    }
  }

  async _accelerate(projectId, itemKey) {
    try {
      const response = await accelerateCraft(projectId, itemKey)
      this._state.projects = response.data.projects
      this._state.accelerators = response.data.accelerators
      this._render()
      this._toast('Tempo acelerado.')
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel acelerar.')
    }
  }

  async _claim(projectId) {
    try {
      const response = await claimCraft(projectId)
      this._state.projects = response.data.projects
      this._render()
      this._toast('Carta recolhida com sucesso!')
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel resgatar.')
    }
  }

  async _buyBooster(editionKey, modalRoot) {
    try {
      const response = await buyBooster(editionKey)
      this._state.user = response.data.user
      modalRoot.destroy(true)
      this._render()
      this._toast(`Booster aberto: ${response.data.cards.map(card => card.name).join(', ')}`)
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel comprar booster.')
    }
  }

  _modal(title, w, h) {
    const { width, height } = this.cameras.main
    const root = this.add.container(0, 0).setDepth(90)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.72).setOrigin(0).setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, w, h, 0x071523, 0.98).setStrokeStyle(2, 0xffcc66)
    const titleText = this.add.text(width / 2, height / 2 - h / 2 + 42, title, { fontSize: '23px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5)
    const close = this._button(width / 2, height / 2 + h / 2 - 36, 110, 'FECHAR', 0x3a1218, () => root.destroy(true))
    const body = this.add.container(0, 0)
    overlay.on('pointerdown', () => root.destroy(true))
    root.add([overlay, panel, titleText, body, close])
    return { root, body }
  }

  _modalText(modal, x, y, text, size = 13, color = '#ffffff', bold = false) {
    const obj = this.add.text(x, y, text, {
      fontSize: `${size}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
      wordWrap: { width: 520 },
    }).setOrigin(0, 0.5)
    modal.body.add(obj)
    return obj
  }

  _recipe(key) {
    return (this._state?.recipes ?? []).find(recipe => recipe.recipe_key === key)
  }

  _activeProject() {
    return (this._state?.projects ?? []).find(project => project.status === 'crafting')
  }

  _projectRemaining(project) {
    return Math.max(0, new Date(project.completes_at).getTime() - Date.now())
  }

  _projectTimeLabel(project) {
    const remaining = this._projectRemaining(project)
    return remaining <= 0 ? 'PRONTA' : this._duration(remaining)
  }

  _refreshCountdown() {
    const project = this._activeProject()
    if (!project || !this._countdownText?.active) return
    const remaining = this._projectRemaining(project)
    if (remaining <= 0) {
      this._render()
      return
    }
    this._countdownText.setText(this._duration(remaining))
  }

  _button(x, y, w, label, color, onClick, fontSize = 12) {
    const button = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, w, 32, color, 0.96).setStrokeStyle(1, 0x64e8ff, 0.6)
    const text = this.add.text(0, 0, label, { fontSize: `${fontSize}px`, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5)
    button.add([bg, text])
    button.setSize(w, 32).setInteractive({ useHandCursor: true })
    button.on('pointerover', () => bg.setAlpha(1))
    button.on('pointerout', () => bg.setAlpha(0.96))
    button.on('pointerdown', onClick)
    return button
  }

  _duration(ms) {
    const seconds = Math.ceil(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 60) return `${minutes}min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}min`
  }

  _toast(message) {
    const { width, height } = this.cameras.main
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(width / 2, height - 34, message, {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 14, y: 8 },
      wordWrap: { width: 900 },
    }).setOrigin(0.5).setDepth(120)
    this.time.delayedCall(2800, () => {
      this._toastText?.destroy()
      this._toastText = null
    })
  }
}
