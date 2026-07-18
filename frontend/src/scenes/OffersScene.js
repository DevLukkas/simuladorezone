import { Scene } from 'phaser'
import { getShopInventory, purchaseShopItem } from '../api/gameApi.js'
import { saveScene } from '../utils/session.js'

const REAL_MONEY_OFFERS = [
  {
    id: 'coins_100',
    title: 'Pacote 100 EZ-Coins',
    subtitle: 'Entrada rapida para ofertas da loja.',
    price: 'R$ 10,00',
    accent: 0x64e8ff,
  },
  {
    id: 'coins_300',
    title: 'Pacote 300 EZ-Coins',
    subtitle: 'Mais moedas com melhor custo.',
    price: 'R$ 25,00',
    accent: 0x8dff9d,
  },
  {
    id: 'coins_500',
    title: 'Pacote 500 EZ-Coins',
    subtitle: 'Reserva maior para laboratorio e cartas.',
    price: 'R$ 40,00',
    accent: 0xffcc66,
  },
]

const EZ_COIN_OFFERS = [
  {
    id: 'dust_1h',
    title: 'Po Acelerador',
    subtitle: 'Acelera 30 minutos de criacao no laboratorio.',
    price: 50,
    kind: 'dust',
    payload: { minutes: 30, tier: 'basic' },
    accent: 0xd8ff66,
  },
  {
    id: 'dust_3h',
    title: 'Po Acelerador Roxo',
    subtitle: 'Acelera 1 hora de criacao no laboratorio.',
    price: 100,
    kind: 'dust',
    payload: { minutes: 60, tier: 'purple' },
    accent: 0xb78dff,
  },
  {
    id: 'dust_10h',
    title: 'Po Acelerador Black',
    subtitle: 'Acelera 5 horas de criacao no laboratorio.',
    price: 200,
    kind: 'dust',
    payload: { minutes: 300, tier: 'black' },
    accent: 0x222834,
  },
  {
    id: 'packs_1',
    title: '1 Pacote de Cartas',
    subtitle: 'Receba 5 cartas avulsas.',
    price: 100,
    kind: 'card_pack',
    payload: { packs: 1, cards: 5 },
    accent: 0x64e8ff,
  },
  {
    id: 'packs_3',
    title: '3 Pacotes de Cartas',
    subtitle: 'Total de 15 cartas avulsas.',
    price: 250,
    kind: 'card_pack',
    payload: { packs: 3, cards: 15 },
    accent: 0x8dff9d,
  },
  {
    id: 'packs_10',
    title: '10 Pacotes de Cartas',
    subtitle: 'Total de 50 cartas avulsas.',
    price: 800,
    kind: 'card_pack',
    payload: { packs: 10, cards: 50 },
    accent: 0xffcc66,
  },
]

export default class OffersScene extends Scene {
  constructor() {
    super({ key: 'OffersScene' })
  }

  create() {
    saveScene('OffersScene')
    this._toastText = null
    this._coinText = null
    this._inventoryTextByItem = new Map()
    this._buying = false

    const { width, height } = this.cameras.main
    this._buildBackground(width, height)
    this._buildHeader(width)
    this._buildWallet(width)
    this._buildRealMoneySection()
    this._buildEzCoinSection()
    this._loadInventory()
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x03101f, 0x07172b, 0x100816, 0x1b1026, 1)
    bg.fillRect(0, 0, width, height)

    for (let i = 0; i < 18; i++) {
      const x = 68 + i * 74
      const color = i % 3 === 0 ? 0x64e8ff : i % 3 === 1 ? 0xffcc66 : 0xb78dff
      this.add.rectangle(x, 100 + (i % 6) * 96, 2, 54, color, 0.08).setAngle(-22)
    }

    this.add.rectangle(width / 2, 86, width, 1, 0x64e8ff, 0.28)
  }

  _buildHeader(width) {
    const back = this.add.container(74, 44)
    const bg = this.add.rectangle(0, 0, 106, 34, 0x071523, 0.94)
      .setStrokeStyle(1, 0x64e8ff)
    const label = this.add.text(0, 0, '< VOLTAR', {
      fontSize: '12px',
      color: '#bff5ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    back.add([bg, label])
    back.setSize(106, 34).setInteractive({ useHandCursor: true })
    back.on('pointerover', () => bg.setFillStyle(0x0b2740, 0.98))
    back.on('pointerout', () => bg.setFillStyle(0x071523, 0.94))
    back.on('pointerdown', () => this.scene.start('MenuScene'))

    this.add.text(width / 2, 44, 'Ofertas EZone', {
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 6,
    }).setOrigin(0.5)

    this.add.text(width / 2, 75, 'EZ-Coins, pacotes e aceleradores do laboratorio', {
      fontSize: '13px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _buildWallet(width) {
    const user = this._authUser()
    const box = this.add.container(width - 158, 44)
    const bg = this.add.rectangle(0, 0, 232, 46, 0x06111f, 0.92)
      .setStrokeStyle(1, 0xffcc66)
    const icon = this.add.text(-92, 0, '$', {
      fontSize: '21px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const label = this.add.text(-62, -9, 'SALDO', {
      fontSize: '9px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this._coinText = this.add.text(-62, 11, `${user?.ez_coins ?? 0} EZ-Coins`, {
      fontSize: '15px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    box.add([bg, icon, label, this._coinText])
  }

  _buildRealMoneySection() {
    this._sectionTitle(86, 124, 'Comprar EZ-Coins', 'Pagamentos reais entram depois. Por enquanto os botoes ficam indisponiveis.')
    REAL_MONEY_OFFERS.forEach((offer, index) => {
      this._offerCard(86 + index * 374, 174, 332, 138, offer, {
        buttonLabel: 'INDISPONIVEL',
        disabled: true,
      })
    })
  }

  _buildEzCoinSection() {
    this._sectionTitle(86, 346, 'Gastar EZ-Coins', 'Itens funcionais para validar o fluxo de loja nesta primeira tela.')
    EZ_COIN_OFFERS.forEach((offer, index) => {
      const col = index % 3
      const row = Math.floor(index / 3)
      this._offerCard(86 + col * 374, 396 + row * 138, 332, 116, offer, {
        buttonLabel: `COMPRAR - ${offer.price} EZ`,
        onBuy: () => this._buyWithEzCoins(offer),
      })
    })
  }

  _sectionTitle(x, y, title, subtitle) {
    this.add.text(x, y, title, {
      fontSize: '21px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this.add.text(x, y + 26, subtitle, {
      fontSize: '12px',
      color: '#9fd6e8',
    }).setOrigin(0, 0.5)
  }

  _offerCard(x, y, w, h, offer, options = {}) {
    const card = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, w, h, 0x071523, 0.91)
      .setOrigin(0)
      .setStrokeStyle(1, offer.accent)
    const stripe = this.add.rectangle(0, 0, 5, h, offer.accent, 0.95)
      .setOrigin(0)
    const shine = this.add.rectangle(w - 58, 24, 86, 28, 0xffffff, 0.05)
      .setAngle(-18)
      .setBlendMode('ADD')
    const title = this.add.text(22, 22, offer.title, {
      fontSize: '17px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const subtitle = this.add.text(22, 52, offer.subtitle, {
      fontSize: '12px',
      color: '#9fd6e8',
      wordWrap: { width: w - 44 },
    }).setOrigin(0, 0)
    const price = this.add.text(22, h - 28, typeof offer.price === 'number' ? `${offer.price} EZ-Coins` : offer.price, {
      fontSize: '15px',
      color: '#ffdd77',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    const owned = this.add.text(w - 30, 22, '', {
      fontSize: '11px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)
    const button = this._buyButton(w - 108, h - 29, options.buttonLabel, options)
    if (offer.id) this._inventoryTextByItem.set(offer.id, owned)

    card.add([bg, stripe, shine, title, subtitle, price, owned, button])
    return card
  }

  _buyButton(x, y, label, options = {}) {
    const disabled = Boolean(options.disabled)
    const button = this.add.container(x, y)
    const w = disabled ? 142 : 156
    const bg = this.add.rectangle(0, 0, w, 34, disabled ? 0x2b2b32 : 0x17313f, 0.96)
      .setStrokeStyle(1, disabled ? 0x66666f : 0x64e8ff)
    const text = this.add.text(0, 0, label, {
      fontSize: '11px',
      color: disabled ? '#b8b8bd' : '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    button.add([bg, text])
    button.setSize(w, 34).setInteractive({ useHandCursor: !disabled })
    if (disabled) {
      button.on('pointerdown', () => this._toast('Compra indisponivel nesta fase.'))
      return button
    }

    button.on('pointerover', () => {
      bg.setFillStyle(0x24516a, 0.98)
      text.setColor('#bff5ff')
    })
    button.on('pointerout', () => {
      bg.setFillStyle(0x17313f, 0.96)
      text.setColor('#ffffff')
    })
    button.on('pointerdown', options.onBuy)
    return button
  }

  async _buyWithEzCoins(offer) {
    if (this._buying) return
    this._buying = true
    this._toast('Registrando compra...')

    try {
      const response = await purchaseShopItem(offer.id)
      const user = response.data?.user
      if (user) {
        localStorage.setItem('auth_user', JSON.stringify(user))
        this._refreshWallet(user)
      }
      this._refreshInventory(response.data?.items ?? [])
      this._toast(`${offer.title} comprado.`)
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Nao foi possivel comprar.')
    } finally {
      this._buying = false
    }
  }

  async _loadInventory() {
    try {
      const response = await getShopInventory()
      const user = response.data?.user
      if (user) {
        localStorage.setItem('auth_user', JSON.stringify(user))
        this._refreshWallet(user)
      }
      this._refreshInventory(response.data?.items ?? [])
    } catch {
      this._toast('Nao foi possivel carregar seu inventario.')
    }
  }

  _refreshInventory(items) {
    this._inventoryTextByItem.forEach(text => text.setText(''))
    items.forEach(item => {
      const text = this._inventoryTextByItem.get(item.item_key)
      if (!text) return
      text.setText(`Possui: ${item.quantity}`)
    })
  }

  _refreshWallet(user) {
    this._coinText?.setText(`${user?.ez_coins ?? 0} EZ-Coins`)
  }

  _authUser() {
    try {
      return JSON.parse(localStorage.getItem('auth_user'))
    } catch {
      return null
    }
  }

  _toast(message) {
    const { width, height } = this.cameras.main
    if (this._toastText) this._toastText.destroy()
    this._toastText = this.add.text(width / 2, height - 40, message, {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(90)
    this.time.delayedCall(2400, () => {
      if (this._toastText) {
        this._toastText.destroy()
        this._toastText = null
      }
    })
  }
}
