import { Scene } from 'phaser'
import { criaturas } from '../data/criaturas.js'
import { habilidades } from '../data/habilidades.js'
import { itens } from '../data/itens.js'
import { comandos } from '../data/comandos.js'
import { cenarios } from '../data/cenarios.js'
import { saveScene } from '../utils/session.js'

const ADMIN_DRAFT_KEY = 'ezone_admin_card_draft'
const CARD_BACK_KEY = 'admin_card_back'

const NAV_ITEMS = [
  { key: 'cards', label: 'CARTAS' },
  { key: 'events', label: 'EVENTOS' },
  { key: 'players', label: 'JOGADORES' },
  { key: 'tournaments', label: 'TORNEIOS' },
  { key: 'store', label: 'GESTAO LOJA' },
]

const TYPE_OPTIONS = [
  { value: 'criatura', label: 'Criatura' },
  { value: 'habilidade', label: 'Habilidade' },
  { value: 'item', label: 'Item' },
  { value: 'comando', label: 'Comando' },
  { value: 'cenario', label: 'Cenario' },
]

const ALL_CARDS = [
  ...normalize(criaturas, 'criatura'),
  ...normalize(habilidades, 'habilidade'),
  ...normalize(itens, 'item'),
  ...normalize(comandos, 'comando'),
  ...normalize(cenarios, 'cenario'),
].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

const CUSTOM_OPTION = '__custom__'
const ELEMENT_OPTIONS = uniqueValues([
  ...ALL_CARDS.map(card => card.elemento),
  'agua',
  'terra',
  'fogo',
  'vento',
  'vazio',
  'neutro',
])
const EDITION_OPTIONS = uniqueValues([
  ...ALL_CARDS.map(card => card.edicao),
  'Base',
])
const RACE_OPTIONS = uniqueValues(criaturas.map(card => card.raca))

function normalize(cards, type) {
  return cards.map(card => ({
    ...card,
    uid: `${type}:${card.id}`,
    card_type: type,
    nome: card.nome ?? card.name ?? '',
    elemento: card.elemento ?? card.element ?? (type === 'item' ? 'neutro' : ''),
    raridade: card.raridade ?? card.rarity ?? 'comum',
    efeito: card.efeito ?? '',
    edicao: card.edicao ?? 'Base',
  }))
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export default class AdminPanelScene extends Scene {
  constructor() {
    super({ key: 'AdminPanelScene' })
    this._htmlElements = []
    this._viewHtmlElements = []
    this._imageUrl = null
    this._toastText = null
    this._activeSection = 'cards'
    this._cardMode = 'list'
    this._cardScroll = 0
    this._searchText = ''
    this._selectedCard = null
  }

  preload() {
    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, '/assets/img/cover.png')
    }

    ALL_CARDS.forEach(card => {
      const key = this._cardKey(card)
      if (!this.textures.exists(key)) {
        this.load.image(key, `/assets/cards/${String(card.id).padStart(2, '0')}.png`)
      }
    })
  }

  create() {
    saveScene('AdminPanelScene')
    this.events.once('shutdown', () => this._cleanupDom())

    const { width, height } = this.cameras.main
    this._workspace = this.add.container(0, 0).setDepth(10)
    this._navContainer = this.add.container(0, 0).setDepth(12)

    this._buildBackground(width, height)
    this._buildHeader(width)
    this._buildShell()
    this._buildNav()
    this._showSection('cards')

    this.input.on('wheel', (pointer, _objects, _dx, dy) => {
      if (this._activeSection !== 'cards' || this._cardMode !== 'list') return
      if (pointer.x < 320 || pointer.x > 1228 || pointer.y < 185 || pointer.y > 640) return
      const max = Math.max(0, this._filteredCards().length - 15)
      this._cardScroll = Math.min(max, Math.max(0, this._cardScroll + (dy > 0 ? 3 : -3)))
      this._renderCardList()
    })
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    for (let i = 0; i < 44; i++) {
      const t = i / 43
      const r = Math.round(3 + 24 * t)
      const g = Math.round(13 + 70 * t)
      const b = Math.round(34 + 108 * t)
      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      bg.fillRect((width / 44) * i - height * 0.34, 0, width / 44 + height * 0.68, height)
      bg.rotation = -0.1
    }
    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.52)
  }

  _buildHeader(width) {
    this.add.text(30, 36, '< MENU', {
      fontSize: '14px',
      color: '#bff5ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ color: '#ffffff' }) })
      .on('pointerout', function () { this.setStyle({ color: '#bff5ff' }) })
      .on('pointerdown', () => this.scene.start('MenuScene'))

    this.add.text(width / 2, 40, 'PAINEL ADMINISTRADOR', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 5,
    }).setOrigin(0.5)

    this.add.text(width / 2, 74, 'Gerencie cartas, eventos, jogadores e torneios do EZone TCG', {
      fontSize: '12px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _buildShell() {
    this._panel(34, 112, 238, 550, 'MENU')
    this._panel(294, 112, 946, 550, 'AREA DE TRABALHO')
  }

  _buildNav() {
    this._navContainer.removeAll(true)
    NAV_ITEMS.forEach((item, i) => {
      const active = item.key === this._activeSection
      const y = 182 + i * 64
      const btn = this.add.container(153, y)
      const bg = this.add.rectangle(0, 0, 188, 42, active ? 0x0b2740 : 0x071523, 0.95)
        .setStrokeStyle(1, active ? 0x9df7ff : 0x1e9cc1)
      const strip = this.add.rectangle(-91, 0, 4, 28, active ? 0x9df7ff : 0x1e9cc1, 0.95)
      const label = this.add.text(0, 0, item.label, {
        fontSize: '13px',
        color: active ? '#ffffff' : '#9fd6e8',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      btn.add([bg, strip, label])
      btn.setSize(188, 42).setInteractive({ useHandCursor: true })
      btn.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.98))
      btn.on('pointerout', () => bg.setFillStyle(item.key === this._activeSection ? 0x0b2740 : 0x071523, 0.95))
      btn.on('pointerdown', () => this._showSection(item.key))
      this._navContainer.add(btn)
    })

    this._navContainer.add(this.add.text(72, 582, 'Admin tools v0.1', {
      fontSize: '10px',
      color: '#6fb8c8',
    }))
  }

  _showSection(section) {
    this._activeSection = section
    this._cardMode = section === 'cards' ? this._cardMode : 'list'
    this._clearWorkspace()
    this._buildNav()

    if (section === 'cards') {
      this._showCardList()
      return
    }

    this._showPlaceholder(section)
  }

  _showPlaceholder(section) {
    const labels = {
      events: 'EVENTOS',
      players: 'JOGADORES',
      tournaments: 'TORNEIOS',
      store: 'GESTAO LOJA',
    }
    this._workspace.add([
      this.add.text(330, 158, labels[section], {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
      }),
      this.add.text(330, 202, 'Modulo reservado para a proxima etapa do painel administrativo.', {
        fontSize: '13px',
        color: '#9fd6e8',
      }),
    ])
  }

  _showCardList() {
    this._cardMode = 'list'
    this._selectedCard = null
    this._clearWorkspace()
    this._workspace.add(this.add.text(330, 154, 'CARTAS DO SERVIDOR', {
      fontSize: '23px',
      color: '#ffffff',
      fontStyle: 'bold',
    }))
    this._workspace.add(this.add.text(330, 184, 'Clique em uma carta para editar. Use a busca para filtrar por nome, tipo, elemento ou edicao.', {
      fontSize: '11px',
      color: '#9fd6e8',
    }))

    this._searchInput = this._addInput(330, 232, 380, 'Buscar carta...')
    this._searchInput.value = this._searchText
    this._searchInput.addEventListener('input', () => {
      this._searchText = this._searchInput.value
      this._cardScroll = 0
      this._renderCardList()
    })

    this._addButton(1042, 232, 230, 'CADASTRAR NOVA CARTA', 0x8dff9d, () => this._openCardEditor(null))
    this._cardListContainer = this.add.container(0, 0)
    this._workspace.add(this._cardListContainer)
    this._renderCardList()
  }

  _renderCardList() {
    if (!this._cardListContainer) return
    this._cardListContainer.removeAll(true)

    const cards = this._filteredCards()
    const visible = cards.slice(this._cardScroll, this._cardScroll + 15)
    this._cardListContainer.add(this.add.text(330, 276, `${cards.length} cartas encontradas`, {
      fontSize: '10px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }))

    if (!visible.length) {
      this._cardListContainer.add(this.add.text(760, 430, 'Nenhuma carta encontrada.', {
        fontSize: '14px',
        color: '#9fd6e8',
      }).setOrigin(0.5))
      return
    }

    visible.forEach((card, i) => {
      const y = 332 + i * 22
      const row = this.add.container(330, y)
      const bg = this.add.rectangle(420, 0, 840, 20, 0x071523, 0.76)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x123c4a)
      const id = this.add.text(14, 0, String(card.id).padStart(2, '0'), {
        fontSize: '10px',
        color: '#d8ff66',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
      const name = this.add.text(62, 0, card.nome, {
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
      const meta = this.add.text(496, 0, `${card.card_type} | ${card.elemento || 'sem elemento'} | ${card.raridade}`, {
        fontSize: '10px',
        color: '#9fd6e8',
      }).setOrigin(0, 0.5)
      row.add([bg, id, name, meta])
      row.setSize(840, 20).setInteractive({ useHandCursor: true })
      row.on('pointerover', () => {
        bg.setFillStyle(0x0b2740, 0.98)
        bg.setStrokeStyle(1, 0x64e8ff)
        name.setColor('#bff5ff')
        this._showCardHover(card)
      })
      row.on('pointerout', () => {
        bg.setFillStyle(0x071523, 0.76)
        bg.setStrokeStyle(1, 0x123c4a)
        name.setColor('#ffffff')
        this._hideCardHover()
      })
      row.on('pointerdown', () => this._openCardEditor(card.uid))
      this._cardListContainer.add(row)
    })

    this._cardListContainer.add([
      this.add.rectangle(750, 306, 840, 24, 0x06111f, 0.96).setStrokeStyle(1, 0x1e9cc1),
      this.add.text(344, 306, 'ID', { fontSize: '10px', color: '#8fe8ff', fontStyle: 'bold' }).setOrigin(0, 0.5),
      this.add.text(392, 306, 'NOME', { fontSize: '10px', color: '#8fe8ff', fontStyle: 'bold' }).setOrigin(0, 0.5),
      this.add.text(826, 306, 'TIPO | ELEMENTO | RARIDADE', { fontSize: '10px', color: '#8fe8ff', fontStyle: 'bold' }).setOrigin(0, 0.5),
    ])

    if (cards.length > 15) {
      this._cardListContainer.add(this.add.text(1150, 646, 'Role para ver mais', {
        fontSize: '10px',
        color: '#6fb8c8',
      }).setOrigin(1, 0.5))
    }
  }

  _showCardHover(card) {
    this._hideCardHover()
    this._hoverContainer = this.add.container(930, 342).setDepth(50)
    const key = this._cardKey(card)
    const bg = this.add.rectangle(0, 0, 210, 284, 0x06111f, 0.96)
      .setStrokeStyle(1, 0x64e8ff)
    const art = this.textures.exists(key)
      ? this.add.image(0, -48, key).setDisplaySize(116, 162)
      : this.add.image(0, -48, CARD_BACK_KEY).setDisplaySize(116, 162)
    const title = this.add.text(0, 58, card.nome, {
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 176 },
    }).setOrigin(0.5)
    const meta = this.add.text(0, 102, `${card.card_type} | ${card.raridade}`, {
      fontSize: '9px',
      color: '#9fd6e8',
      align: 'center',
    }).setOrigin(0.5)
    this._hoverContainer.add([bg, art, title, meta])
    this._workspace.add(this._hoverContainer)
  }

  _hideCardHover() {
    if (this._hoverContainer) {
      this._hoverContainer.destroy(true)
      this._hoverContainer = null
    }
  }

  _openCardEditor(cardOrUid) {
    const card = typeof cardOrUid === 'string'
      ? ALL_CARDS.find(item => item.uid === cardOrUid)
      : cardOrUid
    this._cardMode = 'editor'
    this._selectedCard = card
    this._clearWorkspace()
    this._workspace.add(this.add.text(330, 154, card ? `EDITAR CARTA #${card.id}` : 'CADASTRAR NOVA CARTA', {
      fontSize: '23px',
      color: '#ffffff',
      fontStyle: 'bold',
    }))
    this._workspace.add(this.add.text(330, 184, card ? card.nome : 'Edite os campos, gere o JSON e copie para aplicar no arquivo de dados ou futuro backend.', {
      fontSize: '11px',
      color: card ? '#d8ff66' : '#9fd6e8',
      fontStyle: card ? 'bold' : '',
    }))
    this._addButton(1110, 166, 150, 'VOLTAR A LISTA', 0x64e8ff, () => this._showCardList())

    this._buildCardEditorForm()
    if (card) {
      this.time.delayedCall(0, () => this._populateCardForm(card))
    } else {
      this._clearForm(false)
    }
  }

  _buildCardEditorForm() {
    this.fields = {}
    this._fieldRows = {}

    this.fields.type = this._addSelect(330, 236, 148, TYPE_OPTIONS)
    this.fields.type.addEventListener('change', () => this._handleTypeChange())
    this.fields.id = this._addInput(496, 236, 148, 'Proximo ID', 'number')
    this.fields.name = this._addInput(330, 288, 314, 'Nome da carta')

    this.fields.element = this._addEditableSelect(330, 340, 148, ELEMENT_OPTIONS, 'Elemento')
    this.fields.rarity = this._addSelect(496, 340, 148, [
      { value: 'comum', label: 'Comum' },
      { value: 'rara', label: 'Rara' },
      { value: 'lendaria', label: 'Lendaria' },
    ])

    this.fields.race = this._addEditableSelect(330, 392, 148, RACE_OPTIONS, 'Raca')
    this.fields.edition = this._addEditableSelect(496, 392, 148, EDITION_OPTIONS, 'Edicao')

    this.fields.attack = this._addInput(330, 444, 148, 'ATQ', 'number')
    this.fields.life = this._addInput(496, 444, 148, 'Vida', 'number')
    this.fields.effectText = this._addTextarea(330, 548, 314, 150, 'Texto de efeito da carta')

    this.fields.effectsJson = this._addTextarea(674, 260, 328, 250, 'effects / triggeredAbilities / activatedAbilities em JSON')
    this.fields.codeNotes = this._addTextarea(674, 552, 328, 136, 'Codigo, ruling ou observacoes tecnicas')

    this._previewImg = this._addImagePreview(1118, 282, 150, 210)
    this._fileInput = this._addFileInput()
    this._addButton(1118, 420, 150, 'TROCAR IMAGEM', 0x64e8ff, () => this._fileInput.click())
    this._addButton(1118, 466, 150, 'GERAR JSON', 0x8dff9d, () => this._generateJson())
    this._addButton(1118, 512, 150, 'COPIAR JSON', 0xffdd77, () => this._copyOutput())
    this._addButton(1118, 558, 150, 'SALVAR RASCUNHO', 0xb78dff, () => this._saveDraft())
    this._addButton(1118, 604, 150, 'LIMPAR', 0xff7777, () => this._clearForm())

    this.fields.output = this._addTextarea(1018, 636, 200, 46, 'JSON gerado')
    this._setDefaultEffects()
    this._registerFieldGroups()
    this._handleTypeChange()
  }

  _filteredCards() {
    const q = this._searchText.trim().toLowerCase()
    if (!q) return ALL_CARDS
    return ALL_CARDS.filter(card => [
      card.nome,
      card.card_type,
      card.elemento,
      card.raridade,
      card.edicao,
      String(card.id),
    ].some(value => String(value ?? '').toLowerCase().includes(q)))
  }

  _panel(x, y, w, h, title) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x06111f, 0.82)
      .setStrokeStyle(1, 0x1e9cc1)
    this.add.rectangle(x + w / 2, y + 28, w - 24, 38, 0x071523, 0.96)
      .setStrokeStyle(1, 0x64e8ff)
    this.add.rectangle(x + 18, y + 28, 4, 24, 0x64e8ff, 0.95)
    this.add.text(x + 30, y + 28, title, {
      fontSize: '13px',
      color: '#9df7ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
  }

  _addButton(x, y, w, label, accent, onClick) {
    const btn = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, w, 32, 0x071523, 0.94)
      .setStrokeStyle(1, accent)
    const strip = this.add.rectangle(-w / 2 + 4, 0, 4, 20, accent, 0.95)
    const text = this.add.text(0, 0, label, {
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    btn.add([bg, strip, text])
    btn.setSize(w, 32).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.98))
    btn.on('pointerout', () => bg.setFillStyle(0x071523, 0.94))
    btn.on('pointerdown', onClick)
    this._workspace.add(btn)
    return btn
  }

  _addInput(x, y, w, placeholder, type = 'text') {
    const input = this._htmlBase('input', x, y, w, 34)
    input.type = type
    input.placeholder = placeholder
    return input
  }

  _addSelect(x, y, w, options) {
    const select = this._htmlBase('select', x, y, w, 34)
    options.forEach(option => {
      const item = document.createElement('option')
      item.value = option.value
      item.textContent = option.label
      select.appendChild(item)
    })
    return select
  }

  _addEditableSelect(x, y, w, values, placeholder) {
    const select = this._addSelect(x, y, w, [
      { value: '', label: placeholder },
      ...values.map(value => ({ value, label: value })),
      { value: CUSTOM_OPTION, label: 'Cadastrar nova' },
    ])
    const input = this._addInput(x, y, w, placeholder)
    input.style.display = 'none'
    select.addEventListener('change', () => {
      const custom = select.value === CUSTOM_OPTION
      select.style.display = custom ? 'none' : 'block'
      input.style.display = custom ? 'block' : 'none'
      if (custom) {
        input.value = ''
        input.focus()
      }
    })

    return {
      select,
      input,
      get value() {
        return select.value === CUSTOM_OPTION ? input.value : select.value
      },
      set value(nextValue) {
        const value = String(nextValue ?? '')
        if (!value) {
          select.value = ''
          input.value = ''
          select.style.display = 'block'
          input.style.display = 'none'
          return
        }

        const exists = [...select.options].some(option => option.value === value)
        select.value = exists ? value : CUSTOM_OPTION
        input.value = exists ? '' : value
        select.style.display = exists ? 'block' : 'none'
        input.style.display = exists ? 'none' : 'block'
      },
    }
  }

  _addTextarea(x, y, w, h, placeholder) {
    const textarea = this._htmlBase('textarea', x, y, w, h)
    textarea.placeholder = placeholder
    textarea.style.resize = 'none'
    textarea.style.lineHeight = '18px'
    textarea.style.paddingTop = '9px'
    return textarea
  }

  _htmlBase(tag, x, y, w, h) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height
    const el = document.createElement(tag)
    Object.assign(el.style, {
      position: 'fixed',
      left: `${canvas.left + x * scaleX}px`,
      top: `${canvas.top + (y - h / 2) * scaleY}px`,
      width: `${w * scaleX}px`,
      height: `${h * scaleY}px`,
      background: 'rgba(6, 17, 31, 0.96)',
      color: '#ffffff',
      border: '1px solid #1e9cc1',
      borderRadius: '4px',
      boxSizing: 'border-box',
      padding: '0 10px',
      fontSize: '12px',
      outline: 'none',
      zIndex: '30',
      boxShadow: '0 0 12px rgba(100, 232, 255, 0.10)',
      fontFamily: 'monospace',
    })
    document.body.appendChild(el)
    this._htmlElements.push(el)
    this._viewHtmlElements.push(el)
    return el
  }

  _addImagePreview(x, y, w, h) {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const scaleX = canvas.width / this.scale.gameSize.width
    const scaleY = canvas.height / this.scale.gameSize.height
    const img = document.createElement('img')
    img.src = '/assets/img/cover.png'
    Object.assign(img.style, {
      position: 'fixed',
      left: `${canvas.left + (x - w / 2) * scaleX}px`,
      top: `${canvas.top + (y - h / 2) * scaleY}px`,
      width: `${w * scaleX}px`,
      height: `${h * scaleY}px`,
      objectFit: 'cover',
      border: '1px solid #64e8ff',
      background: '#06111f',
      zIndex: '30',
      boxShadow: '0 0 18px rgba(100, 232, 255, 0.18)',
    })
    document.body.appendChild(img)
    this._htmlElements.push(img)
    this._viewHtmlElements.push(img)
    return img
  }

  _addFileInput() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.style.display = 'none'
    input.addEventListener('change', () => this._previewUploadedImage(input.files?.[0]))
    document.body.appendChild(input)
    this._htmlElements.push(input)
    this._viewHtmlElements.push(input)
    return input
  }

  _loadExistingCard(uid) {
    this._populateCardForm(ALL_CARDS.find(item => item.uid === uid))
  }

  _populateCardForm(card) {
    if (!card || !this.fields) return

    this.fields.type.value = card.card_type
    this.fields.id.value = card.id ?? ''
    this.fields.name.value = card.nome ?? ''
    this.fields.element.value = card.elemento ?? ''
    this.fields.rarity.value = this._rarityValue(card.raridade)
    this.fields.race.value = card.raca ?? ''
    this.fields.attack.value = card.ataque ?? ''
    this.fields.life.value = card.vida ?? ''
    this.fields.edition.value = card.edicao ?? ''
    this.fields.effectText.value = card.efeito ?? ''
    this.fields.effectsJson.value = JSON.stringify({
      effects: card.effects ?? [],
      triggeredAbilities: card.triggeredAbilities ?? [],
      activatedAbilities: card.activatedAbilities ?? [],
    }, null, 2)
    this.fields.codeNotes.value = ''
    this._setPreview(`/assets/cards/${String(card.id).padStart(2, '0')}.png`)
    this._handleTypeChange(false)
    this._generateJson(false)
    this._toast(`Editando: ${card.nome}`)
  }

  _previewUploadedImage(file) {
    if (!file) return
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl)
    this._imageUrl = URL.createObjectURL(file)
    this._setPreview(this._imageUrl)
    this._toast('Imagem carregada para preview.')
  }

  _setPreview(src) {
    if (this._previewImg) this._previewImg.src = src
  }

  _setDefaultEffects() {
    this.fields.effectsJson.value = JSON.stringify({
      effects: [],
      triggeredAbilities: [],
      activatedAbilities: [],
    }, null, 2)
  }

  _generateJson(showToast = true) {
    let effectBlocks = {}
    try {
      effectBlocks = this.fields.effectsJson.value.trim()
        ? JSON.parse(this.fields.effectsJson.value)
        : {}
    } catch {
      this._toast('JSON de efeitos invalido.')
      return null
    }

    const card = {
      id: this._numberOrText(this.fields.id.value),
      nome: this.fields.name.value.trim(),
      tipo: this.fields.type.value === 'criatura' ? undefined : this._typeLabel(this.fields.type.value),
      raca: this.fields.type.value === 'criatura' ? this.fields.race.value.trim() : undefined,
      ataque: this.fields.type.value === 'criatura' ? this._numberOrText(this.fields.attack.value) : undefined,
      vida: this.fields.type.value === 'criatura' ? this._numberOrText(this.fields.life.value) : undefined,
      efeito: this.fields.effectText.value.trim(),
      elemento: this._cardUsesElement(this.fields.type.value) ? this.fields.element.value.trim() : undefined,
      raridade: this.fields.rarity.value,
      img: this.fields.id.value ? `${String(this.fields.id.value).padStart(2, '0')}.png` : '',
      edicao: this.fields.edition.value.trim() || 'Base',
      ...effectBlocks,
    }

    Object.keys(card).forEach(key => {
      if (card[key] === undefined || card[key] === '') delete card[key]
    })

    this.fields.output.value = JSON.stringify(card, null, 2)
    if (showToast) this._toast('JSON da carta gerado.')
    return card
  }

  _saveDraft() {
    const card = this._generateJson(false)
    if (!card) return

    localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify({
      card,
      form: this._readForm(),
    }))
    this._toast('Rascunho salvo neste navegador.')
  }

  _loadDraft(showToast = true) {
    try {
      const draft = JSON.parse(localStorage.getItem(ADMIN_DRAFT_KEY))
      if (!draft?.form || !this.fields) return
      this._writeForm(draft.form)
      this.fields.output.value = JSON.stringify(draft.card ?? {}, null, 2)
      if (showToast) this._toast('Rascunho carregado.')
    } catch {
      // Rascunho corrompido nao deve travar o painel.
    }
  }

  async _copyOutput() {
    const text = this.fields.output.value || this._generateJson(false)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      this._toast('JSON copiado.')
    } catch {
      this.fields.output.select()
      document.execCommand('copy')
      this._toast('JSON copiado.')
    }
  }

  _clearForm(clearOutput = true) {
    this.fields.type.value = 'criatura'
    this.fields.id.value = this._nextIdForType('criatura')
    this.fields.name.value = ''
    this.fields.element.value = ''
    this.fields.rarity.value = 'comum'
    this.fields.race.value = ''
    this.fields.attack.value = ''
    this.fields.life.value = ''
    this.fields.edition.value = ''
    this.fields.effectText.value = ''
    this.fields.codeNotes.value = ''
    if (clearOutput) this.fields.output.value = ''
    this._setDefaultEffects()
    this._setPreview('/assets/img/cover.png')
    this._handleTypeChange(false)
  }

  _readForm() {
    return Object.fromEntries(Object.entries(this.fields).map(([key, field]) => [key, field.value]))
  }

  _writeForm(form) {
    Object.entries(form).forEach(([key, value]) => {
      if (this.fields[key]) this.fields[key].value = value ?? ''
    })
  }

  _registerFieldGroups() {
    this._fieldRows = {
      element: [this.fields.element],
      race: [this.fields.race],
      stats: [this.fields.attack, this.fields.life],
    }
  }

  _handleTypeChange(updateId = true) {
    const type = this.fields.type.value
    if (updateId && !this._selectedCard) {
      this.fields.id.value = this._nextIdForType(type)
    }

    this._setGroupVisible('element', this._cardUsesElement(type))
    this._setGroupVisible('race', type === 'criatura')
    this._setGroupVisible('stats', type === 'criatura')
  }

  _setGroupVisible(group, visible) {
    this._fieldRows[group]?.forEach(field => this._setFieldVisible(field, visible))
  }

  _setFieldVisible(field, visible) {
    const display = visible ? 'block' : 'none'
    if (this._isEditableSelect(field)) {
      field.select.style.display = visible && field.select.value !== CUSTOM_OPTION ? 'block' : 'none'
      field.input.style.display = visible && field.select.value === CUSTOM_OPTION ? 'block' : 'none'
      return
    }

    if (field?.style) field.style.display = display
  }

  _isEditableSelect(field) {
    return Boolean(
      field &&
      field.select instanceof HTMLElement &&
      field.input instanceof HTMLElement
    )
  }

  _cardUsesElement(type) {
    return type === 'criatura' || type === 'habilidade' || type === 'item'
  }

  _nextIdForType(type) {
    const max = ALL_CARDS
      .filter(card => card.card_type === type)
      .reduce((highest, card) => Math.max(highest, Number(card.id) || 0), 0)
    return max + 1
  }

  _rarityValue(value) {
    const rarity = String(value ?? 'comum').toLowerCase()
    if (rarity === 'lendario') return 'lendaria'
    return ['comum', 'rara', 'lendaria'].includes(rarity) ? rarity : 'comum'
  }

  _typeLabel(type) {
    return TYPE_OPTIONS.find(option => option.value === type)?.label ?? type
  }

  _numberOrText(value) {
    const number = Number(value)
    return Number.isFinite(number) && value !== '' ? number : value
  }

  _clearWorkspace() {
    this._hideCardHover()
    this._workspace.removeAll(true)
    this._viewHtmlElements.forEach(el => el.remove())
    this._htmlElements = this._htmlElements.filter(el => !this._viewHtmlElements.includes(el))
    this._viewHtmlElements = []
    this.fields = null
    this._previewImg = null
    this._fileInput = null
  }

  _cleanupDom() {
    this._htmlElements.forEach(el => el.remove())
    this._htmlElements = []
    this._viewHtmlElements = []
    if (this._imageUrl) URL.revokeObjectURL(this._imageUrl)
    this._imageUrl = null
  }

  _cardKey(card) {
    return `admin_card_${card.card_type}_${card.id}`
  }

  _toast(message) {
    const { width, height } = this.cameras.main
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(width / 2, height - 26, message, {
      fontSize: '13px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(90)
    this.time.delayedCall(2400, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }
}
