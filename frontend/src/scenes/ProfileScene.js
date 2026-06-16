import { Scene } from 'phaser'
import { saveScene } from '../utils/session.js'
import {
  addFriend,
  deleteSharedBuild,
  exportSharedBuild,
  getProfile,
  getPublicProfile,
  removeFriend,
  sendFriendGift,
  updateProfile,
  uploadProfileAvatar,
  voteSharedBuild,
} from '../api/gameApi.js'
import { criaturas } from '../data/criaturas.js'
import { avatarTextureKey, avatarUrlFor } from '../utils/avatar.js'

const PROFILE_BACK_KEY = 'profile_card_back'
const ACHIEVEMENT_CARDS = [5, 16, 20, 45]
const CREATURE_BY_ID = new Map(criaturas.map(card => [Number(card.id), card]))

export default class ProfileScene extends Scene {
  constructor() {
    super({ key: 'ProfileScene' })
    this._toastText = null
    this._loadingText = null
    this._profile = null
    this._avatarModal = null
    this._htmlElements = []
    this._viewUserId = null
  }

  preload() {
    if (!this.textures.exists(PROFILE_BACK_KEY)) {
      this.load.image(PROFILE_BACK_KEY, '/assets/img/cover.png')
    }

    ACHIEVEMENT_CARDS.forEach((id) => {
      const key = this._cardKey(id)
      if (!this.textures.exists(key)) {
        this.load.image(key, `/assets/cards/${String(id).padStart(2, '0')}.png`)
      }
    })
  }

  init(data = {}) {
    this._viewUserId = data.userId ?? null
  }

  create() {
    saveScene('ProfileScene', this._viewUserId ? { userId: this._viewUserId } : null)

    const { width, height } = this.cameras.main
    this._buildBackground(width, height)
    this._buildHeader(width)
    this._loadingText = this.add.text(width / 2, height / 2, 'Carregando perfil...', {
      fontSize: '16px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.events.once('shutdown', () => this._cleanupDom())
    this._loadProfile()
  }

  async _loadProfile() {
    try {
      const response = this._viewUserId
        ? await getPublicProfile(this._viewUserId)
        : await getProfile()
      this._profile = response.data
      if (!this._viewUserId && response.data.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      }
    } catch (error) {
      console.warn('Erro ao carregar perfil:', error)
      this._profile = {
        user: this._authUser(),
        friends: [],
        shared_builds: [],
        season: null,
      }
      this._toast('Não foi possível atualizar o perfil agora.')
    }

    this._loadingText?.destroy()
    this._loadingText = null

    const user = this._profile.user ?? this._authUser()
    this._buildPlayerPanel(user)
    this._buildSeasonPanel(this._profile.season)
    this._buildFriendsPanel(this._profile.friends ?? [], Boolean(this._profile.is_public_view))
    this._buildSharedBuildsPanel(this._profile.shared_builds ?? [])
  }

  _buildBackground(width, height) {
    const bg = this.add.graphics()
    for (let i = 0; i < 44; i++) {
      const t = i / 43
      const r = Math.round(3 + 18 * t)
      const g = Math.round(14 + 76 * t)
      const b = Math.round(36 + 116 * t)
      bg.fillStyle((r << 16) | (g << 8) | b, 1)
      bg.fillRect((width / 44) * i - height * 0.34, 0, width / 44 + height * 0.68, height)
      bg.rotation = -0.1
    }

    const shine = this.add.rectangle(width * 0.18, height / 2, width * 0.18, height * 1.4, 0x7eeaff, 0.09)
      .setAngle(-25)
      .setBlendMode('ADD')
    this.tweens.add({
      targets: shine,
      x: width * 1.12,
      duration: 5600,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.easeInOut',
    })

    this.add.rectangle(width / 2, height / 2, width, height, 0x010813, 0.5)
  }

  _buildHeader(width) {
    this.add.text(30, 34, '< MENU', {
      fontSize: '14px',
      color: '#bff5ff',
      fontStyle: 'bold',
    })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ color: '#ffffff' }) })
      .on('pointerout', function () { this.setStyle({ color: '#bff5ff' }) })
      .on('pointerdown', () => this._goBackFromProfile())

    this.add.text(width / 2, 38, 'PERFIL DO JOGADOR', {
      fontSize: '31px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#06111f',
      strokeThickness: 5,
    }).setOrigin(0.5)

    this.add.text(width / 2, 70, 'Temporada 1 - Ascensão Elemental', {
      fontSize: '12px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  _buildPlayerPanel(user) {
    const x = 52
    const y = 118
    const w = 320
    const h = 532
    this._panel(x, y, w, h, 'IDENTIDADE')

    const rankPosition = user?.ranking_position ? `#${user.ranking_position}` : '#--'
    const rankColor = user?.ranking_position && user.ranking_position <= 3 ? 0xffdd77 : 0x64e8ff

    const avatarFrame = this.add.circle(x + 76, y + 132, 48, 0x071523, 0.96)
      .setStrokeStyle(2, rankColor)
    const avatarGlow = this.add.circle(x + 76, y + 132, 42, rankColor, 0.08)
      .setBlendMode('ADD')
    const avatar = this.add.image(x + 76, y + 132, PROFILE_BACK_KEY)
      .setDisplaySize(96, 96)
    avatar.setMask(this._createCircleMask(x + 76, y + 132, 43))
    this._loadAvatarTexture(avatarUrlFor(user), key => {
      avatar.setTexture(key)
      avatar.setDisplaySize(96, 96)
    })

    this.add.text(x + 156, y + 82, user?.name ?? 'Jogador', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      wordWrap: { width: 138 },
    }).setOrigin(0, 0.5)

    this.add.text(x + 156, y + 118, `Rank ${rankPosition}`, {
      fontSize: '14px',
      color: '#bff5ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this.add.text(x + 156, y + 146, `${user?.ranking_points ?? 0} pts`, {
      fontSize: '13px',
      color: '#d8ff66',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    this._currencyBadge(x + 156, y + 184, 'Cristais', user?.crystals ?? 0, 0xd8ff66)
    this._currencyBadge(x + 156, y + 220, 'EZ-Coin', user?.ez_coins ?? 0, 0x64e8ff)

    this._smallButton(x + w / 2, y + 302, 190, 'ALTERAR AVATAR', 0x64e8ff, () => this._openAvatarModal())

    this._statLine(x + 24, y + 402, 'Vitórias', user?.wins ?? 0)
    this._statLine(x + 24, y + 440, 'Derrotas', user?.losses ?? 0)
    this._statLine(x + 24, y + 478, 'Decks publicados', user?.shared_builds ?? 0)
    this._statLine(x + 24, y + 516, 'Presentes enviados', user?.gifts_sent ?? 0)
  }

  _buildSeasonPanel(season) {
    const x = 406
    const y = 118
    const w = 412
    const h = 218
    this._panel(x, y, w, h, 'TEMPORADA 1')

    const achievements = season?.achievements ?? [
      { id: 5, title: 'Primeira Vitória', state: 'Bloqueada' },
      { id: 16, title: 'Colecionador', state: '0/25 cartas' },
      { id: 20, title: 'Arena Solo', state: '0/5 vitórias' },
      { id: 45, title: 'Estrategista', state: 'Em breve' },
    ]

    achievements.forEach((item, i) => {
      const ax = x + 58 + i * 94
      const art = this.add.image(ax, y + 102, this._cardKey(item.id))
        .setDisplaySize(56, 78)
        .setAlpha(0.82)
      this.add.rectangle(ax, y + 102, 64, 86, 0x000000, 0)
        .setStrokeStyle(1, i === 0 ? 0xd8ff66 : 0x1e9cc1)
      this.add.text(ax, y + 160, item.title, {
        fontSize: '9px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 76 },
      }).setOrigin(0.5)
      this.add.text(ax, y + 192, item.state, {
        fontSize: '8px',
        color: '#8fe8ff',
        align: 'center',
        wordWrap: { width: 76 },
      }).setOrigin(0.5)

      this.tweens.add({
        targets: art,
        alpha: 1,
        duration: 1100 + i * 180,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    })
  }

  _buildFriendsPanel(friends, isPublicView = false) {
    const x = 850
    const y = 118
    const w = 378
    const h = 532
    this._panel(x, y, w, h, 'AMIGOS')

    if (!isPublicView) {
      this._htmlIconButton(x + w - 44, y + 28, 34, 'fa-user-plus', 0x8dff9d, () => this._promptAddFriend(), 'Adicionar amigo')
    }

    if (!friends.length) {
      this.add.text(x + w / 2, y + 180, isPublicView ? 'Lista de amigos privada.' : 'Nenhum amigo adicionado ainda.', {
        fontSize: '13px',
        color: '#9fd6e8',
        align: 'center',
      }).setOrigin(0.5)
      return
    }

    friends.slice(0, 5).forEach((friend, i) => {
      const rowY = y + 92 + i * 84
      this.add.rectangle(x + w / 2, rowY, w - 38, 76, 0x071523, 0.72)
        .setStrokeStyle(1, friend.online ? 0x64e8ff : 0x1e9cc1)
      this.add.circle(x + 30, rowY - 20, 5, friend.online ? 0x8dff9d : 0x6e7880)
      this.add.text(x + 48, rowY - 22, friend.name, {
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      this.add.text(x + 48, rowY + 2, `Rank #${friend.ranking_position ?? '--'}  |  ${friend.ranking_points ?? 0} pts`, {
        fontSize: '11px',
        color: '#d8ff66',
      })

      this._htmlIconButton(x + w - 128, rowY - 17, 34, 'fa-user', 0x64e8ff, () => this.scene.start('ProfileScene', { userId: friend.id }), 'Ver perfil')
      this._htmlIconButton(x + w - 88, rowY - 17, 34, 'fa-comments', 0x8dff9d, () => this._toast('Chat será ativado com o social backend.'), 'Chat')
      this._htmlIconButton(
        x + w - 128,
        rowY + 19,
        34,
        'fa-gift',
        friend.can_send_gift === false ? 0x6e7880 : 0xd8ff66,
        () => friend.can_send_gift === false
          ? this._toast('Presente disponível novamente após o reset diário às 00:01.')
          : this._sendGift(friend.id),
        'Enviar presente'
      )
      this._htmlIconButton(x + w - 88, rowY + 19, 34, 'fa-trash-o', 0xff7777, () => this._removeFriend(friend.id), 'Excluir amigo')
    })
  }

  _buildSharedBuildsPanel(builds) {
    const x = 406
    const y = 368
    const w = 412
    const h = 282
    this._panel(x, y, w, h, 'BUILDS COMPARTILHADAS')

    if (!builds.length) {
      this.add.text(x + w / 2, y + 170, 'Nenhuma build compartilhada ainda.', {
        fontSize: '13px',
        color: '#9fd6e8',
        align: 'center',
      }).setOrigin(0.5)
      return
    }

    builds.slice(0, 3).forEach((build, i) => {
      const rowY = y + 88 + i * 76
      this.add.rectangle(x + w / 2, rowY, w - 36, 68, 0x071523, 0.74)
        .setStrokeStyle(1, 0x1e9cc1)
      this.add.rectangle(x + 42, rowY, 46, 58, 0x06111f, 0.9)
        .setStrokeStyle(1, 0x64e8ff)
      this._addDynamicCardCover(x + 42, rowY, this._coverId(build), 40, 56)
      this.add.text(x + 76, rowY - 14, build.name, {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
        wordWrap: { width: 170 },
      })
      this.add.text(x + 76, rowY + 12, `por ${build.author} | ${build.downloads ?? 0} downloads`, {
        fontSize: '10px',
        color: '#9fd6e8',
      })
      const downloadX = build.is_owner ? x + w - 82 : x + w - 48
      this._htmlIconButton(downloadX, rowY, 34, 'fa-download', 0x64e8ff, () => this._exportBuild(build.id), 'Baixar TXT')
      if (build.is_owner) {
        this._htmlIconButton(x + w - 42, rowY, 34, 'fa-trash-o', 0xff7777, () => this._deleteBuild(build.id), 'Apagar build')
      }
    })
  }

  _panel(x, y, w, h, title) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x06111f, 0.82)
      .setStrokeStyle(1, 0x1e9cc1)
    this.add.rectangle(x + w / 2, y + 28, w - 24, 38, 0x071523, 0.96)
      .setStrokeStyle(1, 0x64e8ff)
    this.add.rectangle(x + 18, y + 28, 4, 24, 0x64e8ff, 0.95)
    this.add.rectangle(x + w / 2, y + 50, w - 42, 1, 0x123c4a, 0.85)
    this.add.text(x + 28, y + 28, title, {
      fontSize: '13px',
      color: '#9df7ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
  }

  _addDynamicCardCover(x, y, cardId, w, h) {
    const key = this._cardKey(cardId)
    if (this.textures.exists(key)) {
      return this.add.image(x, y, key).setDisplaySize(w, h)
    }

    const placeholder = this.add.image(x, y, PROFILE_BACK_KEY)
      .setDisplaySize(w, h)
      .setAlpha(0.65)

    this.load.image(key, `/assets/cards/${String(cardId).padStart(2, '0')}.png`)
    this.load.once('complete', () => {
      if (!placeholder.active || !this.textures.exists(key)) return
      const image = this.add.image(x, y, key).setDisplaySize(w, h)
      image.setDepth(placeholder.depth)
      placeholder.destroy()
    })
    this.load.start()
    return placeholder
  }

  _currencyBadge(x, y, label, value, color) {
    this.add.rectangle(x + 56, y, 112, 28, 0x071523, 0.92)
      .setStrokeStyle(1, color)
    this.add.rectangle(x + 4, y, 4, 18, color, 0.95)
    this.add.text(x + 14, y, label, {
      fontSize: '10px',
      color: '#9fd6e8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this.add.text(x + 94, y, String(value), {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)
  }

  _statLine(x, y, label, value) {
    this.add.rectangle(x + 136, y, 272, 30, 0x071523, 0.54)
      .setStrokeStyle(1, 0x123c4a)
    this.add.rectangle(x + 5, y, 3, 18, 0x1e9cc1, 0.75)
    this.add.text(x + 18, y, label, {
      fontSize: '12px',
      color: '#9fd6e8',
    }).setOrigin(0, 0.5)
    this.add.text(x + 252, y, String(value), {
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)
  }

  _ratingStars(x, y, rating) {
    const filled = Math.round(rating / 2)
    for (let i = 0; i < 5; i++) {
      this.add.text(x + i * 15, y, i < filled ? '★' : '☆', {
        fontSize: '12px',
        color: i < filled ? '#ffdd77' : '#6e7880',
      }).setOrigin(0, 0.5)
    }
  }

  _smallButton(x, y, w, label, accent, onClick) {
    const btn = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, w, 28, 0x071523, 0.94)
      .setStrokeStyle(1, accent)
    const strip = this.add.rectangle(-w / 2 + 4, 0, 4, 18, accent, 0.95)
    const text = this.add.text(0, 0, label, {
      fontSize: '9px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    btn.add([bg, strip, text])
    btn.setSize(w, 28).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => {
      bg.setFillStyle(0x0b2740, 0.98)
      text.setColor('#bff5ff')
    })
    btn.on('pointerout', () => {
      bg.setFillStyle(0x071523, 0.94)
      text.setColor('#ffffff')
    })
    btn.on('pointerdown', onClick)
    return btn
  }

  _iconButton(x, y, size, icon, accent, onClick) {
    const btn = this.add.container(x, y)
    const bg = this.add.rectangle(0, 0, size, 28, 0x071523, 0.94)
      .setStrokeStyle(1, accent)
    const strip = this.add.rectangle(-size / 2 + 3, 0, 3, 18, accent, 0.95)
    const text = this.add.text(1, -1, icon, {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    btn.add([bg, strip, text])
    btn.setSize(size, 28).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => {
      bg.setFillStyle(0x0b2740, 0.98)
      text.setColor('#bff5ff')
      this.tweens.add({ targets: btn, scaleX: 1.06, scaleY: 1.06, duration: 100, ease: 'Sine.easeOut' })
    })
    btn.on('pointerout', () => {
      bg.setFillStyle(0x071523, 0.94)
      text.setColor('#ffffff')
      this.tweens.add({ targets: btn, scaleX: 1, scaleY: 1, duration: 100, ease: 'Sine.easeOut' })
    })
    btn.on('pointerdown', onClick)
    return btn
  }

  _htmlIconButton(x, y, size, iconClass, accent, onClick, title = '') {
    const canvas = this.sys.game.canvas.getBoundingClientRect()
    const gameSize = this.scale.gameSize
    const scaleX = canvas.width / gameSize.width
    const scaleY = canvas.height / gameSize.height
    const color = this._cssColor(accent)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = title
    btn.innerHTML = `<i class="fa ${iconClass}" aria-hidden="true"></i>`
    Object.assign(btn.style, {
      position: 'fixed',
      left: `${canvas.left + (x - size / 2) * scaleX}px`,
      top: `${canvas.top + (y - 14) * scaleY}px`,
      width: `${size * scaleX}px`,
      height: `${28 * scaleY}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(7, 21, 35, 0.94)',
      border: `1px solid ${color}`,
      borderLeft: `4px solid ${color}`,
      color: '#ffffff',
      fontSize: `${Math.max(13, 15 * scaleY)}px`,
      cursor: 'pointer',
      zIndex: '40',
      boxShadow: `0 0 10px ${color}33`,
      transition: 'transform 120ms ease, background 120ms ease, color 120ms ease',
    })
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(11, 39, 64, 0.98)'
      btn.style.color = '#bff5ff'
      btn.style.transform = 'scale(1.06)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(7, 21, 35, 0.94)'
      btn.style.color = '#ffffff'
      btn.style.transform = 'scale(1)'
    })
    btn.addEventListener('click', onClick)
    document.body.appendChild(btn)
    this._htmlElements.push(btn)
    return btn
  }

  _cssColor(value) {
    return `#${Number(value).toString(16).padStart(6, '0')}`
  }

  _createCircleMask(x, y, radius) {
    const shape = this.make.graphics({ add: false })
    shape.fillStyle(0xffffff, 1)
    shape.fillCircle(x, y, radius)
    return shape.createGeometryMask()
  }

  _miniTextButton(x, y, label, onClick) {
    const text = this.add.text(x, y, label, {
      fontSize: '9px',
      color: '#8fe8ff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    text.on('pointerover', () => text.setColor('#ffffff'))
    text.on('pointerout', () => text.setColor('#8fe8ff'))
    text.on('pointerdown', onClick)
    return text
  }

  _openAvatarModal() {
    if (this._avatarModal) return

    const { width, height } = this.cameras.main
    const hasUploadedAvatar = String(this._profile?.user?.avatar_url ?? '').startsWith('/storage/avatars/')
    this._avatarModal = this.add.container(0, 0).setDepth(80)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.68)
      .setOrigin(0)
      .setInteractive()
    const panel = this.add.rectangle(width / 2, height / 2, 460, 270, 0x06111f, 0.98)
      .setStrokeStyle(2, 0x64e8ff)
      .setInteractive()
    const stripe = this.add.rectangle(width / 2 - 206, height / 2 - 102, 4, 42, 0x64e8ff, 0.95)
    const title = this.add.text(width / 2, height / 2 - 96, 'ALTERAR AVATAR', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const hintText = hasUploadedAvatar
      ? 'Você já possui uma foto de avatar enviada.\nPara manter o perfil padronizado, apenas uma foto pode ficar ativa.'
      : 'Envie uma imagem JPG, PNG ou WEBP.\nEla será enquadrada automaticamente no formato circular.'
    const hint = this.add.text(width / 2, height / 2 - 44, hintText, {
      fontSize: '12px',
      color: '#9fd6e8',
      align: 'center',
      lineSpacing: 7,
    }).setOrigin(0.5)

    const select = this._smallButton(
      width / 2,
      height / 2 + 34,
      180,
      hasUploadedAvatar ? 'FOTO JÁ ENVIADA' : 'SELECIONAR IMAGEM',
      hasUploadedAvatar ? 0x6e7880 : 0x8dff9d,
      () => hasUploadedAvatar
        ? this._toast('Você já tem uma foto de avatar ativa.')
        : this._avatarFileInput?.click()
    )
    const clear = this._smallButton(width / 2 - 92, height / 2 + 92, 150, 'USAR PADRÃO', 0xd8ff66, () => this._clearAvatar())
    const cancel = this._smallButton(width / 2 + 92, height / 2 + 92, 150, 'CANCELAR', 0xff7777, () => this._closeAvatarModal())

    this._avatarFileInput = document.createElement('input')
    this._avatarFileInput.type = 'file'
    this._avatarFileInput.accept = 'image/png,image/jpeg,image/webp'
    this._avatarFileInput.style.display = 'none'
    this._avatarFileInput.addEventListener('change', () => this._uploadAvatar(this._avatarFileInput.files?.[0]))
    document.body.appendChild(this._avatarFileInput)
    this._htmlElements.push(this._avatarFileInput)

    overlay.on('pointerdown', () => this._closeAvatarModal())
    this._avatarModal.add([overlay, panel, stripe, title, hint, select, clear, cancel])
  }

  _closeAvatarModal() {
    if (this._avatarModal) {
      this._avatarModal.destroy(true)
      this._avatarModal = null
    }
    if (this._avatarFileInput) {
      this._avatarFileInput.remove()
      this._htmlElements = this._htmlElements.filter(el => el !== this._avatarFileInput)
      this._avatarFileInput = null
    }
  }

  async _uploadAvatar(file) {
    if (!file) return

    try {
      this._toast('Enviando avatar...')
      const response = await uploadProfileAvatar(file)
      if (response.data.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      }
      this._closeAvatarModal()
      this.scene.restart()
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível enviar o avatar.')
    }
  }

  async _clearAvatar() {
    try {
      const response = await updateProfile({ avatar_url: null })
      if (response.data.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      }
      this._closeAvatarModal()
      this.scene.restart()
    } catch {
      this._toast('Não foi possível restaurar o avatar padrão.')
    }
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
    this.load.once('loaderror', () => onReady(PROFILE_BACK_KEY))
    this.load.start()
  }

  _cleanupDom() {
    this._htmlElements?.forEach(el => el.remove())
    this._htmlElements = []
    this._avatarFileInput = null
  }

  async _promptAddFriend() {
    const query = window.prompt('Digite o nome ou e-mail do jogador:')
    if (!query?.trim()) return

    try {
      await addFriend(query.trim())
      this.scene.restart()
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível adicionar amigo.')
    }
  }

  async _removeFriend(friendId) {
    if (!friendId) return
    if (!window.confirm('Remover este amigo da lista?')) return

    try {
      await removeFriend(friendId)
      this.scene.restart()
    } catch {
      this._toast('Não foi possível remover amigo.')
    }
  }

  async _sendGift(friendId) {
    if (!friendId) return

    try {
      const response = await sendFriendGift(friendId)
      if (response.data.user) {
        localStorage.setItem('auth_user', JSON.stringify(response.data.user))
      }
      this._toast('Presente enviado.')
      this.time.delayedCall(450, () => this.scene.restart())
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível enviar presente.')
    }
  }

  async _voteBuild(buildId) {
    if (!buildId) return
    const raw = window.prompt('Nota para esta build (0-10):', '10')
    const rating = Number(raw)
    if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
      this._toast('Informe uma nota de 0 a 10.')
      return
    }

    try {
      await voteSharedBuild(buildId, rating)
      this.scene.restart()
    } catch {
      this._toast('Não foi possível votar nesta build.')
    }
  }

  async _exportBuild(buildId) {
    if (!buildId) return

    try {
      const response = await exportSharedBuild(buildId)
      const build = response.data.build
      const decklist = response.data.decklist ?? []
      const lines = [
        '# Ezone shared build',
        `# Nome: ${build?.name ?? 'Build'}`,
        '# Formato: uid;quantidade;nome',
        '',
        ...decklist.map(card => `${card.uid ?? `${card.type}:${card.id}`};${card.qty ?? card.quantity ?? 1};${card.name ?? ''}`),
      ]
      const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${String(build?.name ?? 'build').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.txt`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      this._toast('Build exportada.')
    } catch {
      this._toast('Não foi possível exportar esta build.')
    }
  }

  async _deleteBuild(buildId) {
    if (!buildId) return
    if (!window.confirm('Apagar esta build compartilhada?')) return

    try {
      await deleteSharedBuild(buildId)
      this.scene.restart()
    } catch (error) {
      this._toast(error?.response?.data?.message ?? 'Não foi possível apagar esta build.')
    }
  }

  _coverId(build) {
    const decklist = Array.isArray(build?.decklist) ? build.decklist : []
    const legendaryCreature = decklist.find(item => {
      const type = this._decklistType(item)
      const id = this._decklistId(item)
      const creature = CREATURE_BY_ID.get(id)
      const rarity = item?.rarity ?? item?.raridade ?? creature?.raridade ?? creature?.rarity
      return type === 'criatura' && rarity === 'lendaria'
    })
    if (legendaryCreature) return this._decklistId(legendaryCreature)

    const firstCreature = decklist.find(item => this._decklistType(item) === 'criatura')
    if (firstCreature) return this._decklistId(firstCreature)

    const cover = String(build?.cover_image ?? '')
    const fromCover = Number(cover.replace(/\D/g, ''))
    return Number.isFinite(fromCover) && fromCover > 0 ? fromCover : 3
  }

  _decklistType(item) {
    return item?.type ?? item?.card_type ?? String(item?.uid ?? '').split(':')[0]
  }

  _decklistId(item) {
    const id = item?.id ?? String(item?.uid ?? '').split(':')[1]
    return Number(id)
  }

  _goBackFromProfile() {
    if (this._viewUserId) {
      this.scene.start('ProfileScene', { userId: null })
      return
    }

    this.scene.start('MenuScene')
  }

  _cardKey(id) {
    return `profile_card_${String(id).padStart(2, '0')}`
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
    this._toastText = this.add.text(width / 2, height - 28, message, {
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
