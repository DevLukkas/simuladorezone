import { Scene } from 'phaser'
import { getRooms, createRoom, joinRoom } from '../api/gameApi.js'
import echo from '../config/echo.js'
import { saveScene } from '../utils/session.js'

const LOCAL_DECK_KEY = 'ezone_deck_builder_draft'

/**
 * LobbyScene — listagem de salas em formato de tabela.
 */
export default class LobbyScene extends Scene {
  constructor() {
    super({ key: 'LobbyScene' })
    this.rooms = []
    this._htmlElements = []
  }

  create() {
    saveScene('LobbyScene')
    const { width, height } = this.cameras.main

    // Fundo
    this.add.rectangle(0, 0, width, height, 0x0d1117).setOrigin(0)

    // Título
    this.add
      .text(width / 2, 40, 'SALAS DE JOGO', {
        fontSize: '28px',
        color: '#4caf50',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    // Botão Voltar
    this.add
      .text(30, 40, '← MENU', { fontSize: '15px', color: '#aaaaaa' })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ color: '#ffffff' }) })
      .on('pointerout',  function () { this.setStyle({ color: '#aaaaaa' }) })
      .on('pointerdown', () => this.scene.start('MenuScene'))

    // ── Barra de ações ──────────────────────────────────────────
    const barY = 90

    // Botão CRIAR SALA
    this.add
      .text(80, barY, '[ + CRIAR SALA ]', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#1b5e20',
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ backgroundColor: '#2e7d32' }) })
      .on('pointerout',  function () { this.setStyle({ backgroundColor: '#1b5e20' }) })
      .on('pointerdown', () => this._openCreateModal())

    // Separador vertical
    this.add.line(0, 0, width / 2, barY - 18, width / 2, barY + 18, 0x334455).setOrigin(0)

    // Input código da sala
    this._codeInput = this._addHtmlInput(width / 2 + 20, barY, 200, 'Código ex: EZ-AB12')

    // Botão Buscar
    this.add
      .text(width / 2 + 240, barY, 'BUSCAR', {
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#0d47a1',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function () { this.setStyle({ backgroundColor: '#1565c0' }) })
      .on('pointerout',  function () { this.setStyle({ backgroundColor: '#0d47a1' }) })
      .on('pointerdown', () => this._searchByCode())

    // ── Cabeçalho da tabela ─────────────────────────────────────
    const tableTop = 140
    const cols = { id: 80, owner: 280, status: 560, action: 820 }
    const headerStyle = { fontSize: '14px', color: '#4caf50', fontStyle: 'bold' }

    this.add.rectangle(width / 2, tableTop, width - 60, 34, 0x1a2a1a).setOrigin(0.5)
    this.add.text(cols.id,     tableTop, 'ID DA SALA',   headerStyle).setOrigin(0, 0.5)
    this.add.text(cols.owner,  tableTop, 'DONO DA SALA', headerStyle).setOrigin(0, 0.5)
    this.add.text(cols.status, tableTop, 'STATUS',       headerStyle).setOrigin(0, 0.5)
    this.add.text(cols.action, tableTop, 'AÇÃO',         headerStyle).setOrigin(0, 0.5)
    this.add.line(0, tableTop + 17, 30, 0, width - 30, 0, 0x2a4a2a).setOrigin(0)

    this._tableTop = tableTop
    this._cols = cols
    this._rowContainer = this.add.container(0, 0)

    this._footerText = this.add
      .text(width / 2, height - 24, '', { fontSize: '13px', color: '#555555' })
      .setOrigin(0.5)

    this._loadRooms()

    echo.channel('rooms').listen('RoomCreated', () => this._loadRooms())
    echo.channel('rooms').listen('RoomUpdated', () => this._loadRooms())

    this.events.on('shutdown', () => this._removeHtmlElements())
  }

  // ── Carregar salas ──────────────────────────────────────────────

  async _loadRooms() {
    try {
      const res = await getRooms()
      this.rooms = res.data.data ?? res.data
    } catch {
      this.rooms = []
    }
    this._renderTable()
  }

  // ── Renderizar tabela ───────────────────────────────────────────

  _renderTable() {
    const { width } = this.cameras.main
    this._rowContainer.removeAll(true)

    const rowH   = 48
    const startY = this._tableTop + 42
    const cols   = this._cols

    if (!this.rooms.length) {
      this._rowContainer.add(
        this.add
          .text(width / 2, startY + 20, 'Nenhuma sala disponível no momento.', {
            fontSize: '15px',
            color: '#555555',
          })
          .setOrigin(0.5)
      )
      this._footerText.setText('')
      return
    }

    this.rooms.slice(0, 10).forEach((room, i) => {
      const y    = startY + i * rowH
      const even = i % 2 === 0

      const bg = this.add
        .rectangle(width / 2, y, width - 60, rowH - 4, even ? 0x111820 : 0x0d1117)
        .setOrigin(0.5)

      const idText = this.add
        .text(cols.id, y, room.room_code ?? '—', { fontSize: '15px', color: '#f0d060' })
        .setOrigin(0, 0.5)

      const ownerText = this.add
        .text(cols.owner, y, room.host?.name ?? 'Desconhecido', { fontSize: '15px', color: '#cccccc' })
        .setOrigin(0, 0.5)

      const statusColor = room.status === 'waiting'     ? '#4caf50'
        : room.status === 'in_progress'                 ? '#ff9800'
        : '#888888'
      const statusLabel = room.status === 'waiting'     ? 'Aguardando...'
        : room.status === 'in_progress'                 ? 'Em andamento'
        : 'Finalizada'

      const statusText = this.add
        .text(cols.status, y, statusLabel, { fontSize: '15px', color: statusColor })
        .setOrigin(0, 0.5)

      const elements = [bg, idText, ownerText, statusText]

      if (room.status === 'waiting') {
        const btnDesafiar = this.add
          .text(cols.action, y, 'Desafiar', {
            fontSize: '13px', color: '#ffffff',
            backgroundColor: '#0d47a1', padding: { x: 10, y: 5 },
          })
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function () { this.setStyle({ backgroundColor: '#1565c0' }) })
          .on('pointerout',  function () { this.setStyle({ backgroundColor: '#0d47a1' }) })
          .on('pointerdown', () => this._joinRoom(room.room_code))

        const btnAssistir = this.add
          .text(cols.action + 100, y, 'Assistir', {
            fontSize: '13px', color: '#ffffff',
            backgroundColor: '#4a4a00', padding: { x: 10, y: 5 },
          })
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function () { this.setStyle({ backgroundColor: '#6a6a00' }) })
          .on('pointerout',  function () { this.setStyle({ backgroundColor: '#4a4a00' }) })
          .on('pointerdown', () => console.log('Modo assistir — em breve'))

        elements.push(btnDesafiar, btnAssistir)

      } else if (room.status === 'in_progress') {
        const btnAssistir = this.add
          .text(cols.action, y, 'Assistir', {
            fontSize: '13px', color: '#ffffff',
            backgroundColor: '#4a4a00', padding: { x: 10, y: 5 },
          })
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => console.log('Modo assistir — em breve'))

        elements.push(btnAssistir)
      }

      this._rowContainer.add(elements)
    })

    const total = this.rooms.length
    this._footerText.setText(
      total + ' sala' + (total !== 1 ? 's' : '') + ' encontrada' + (total !== 1 ? 's' : '')
    )
  }

  // ── Modal de criar sala ───────────────────────────────────────

  _openCreateModal() {
    if (this._modal) return

    const { width, height } = this.cameras.main
    const mw = 580, mh = 400
    const mx = width / 2, my = height / 2

    // Gera ID DA SALA aleatório (formato EZ-AB12)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const code  = 'EZ-' + Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('')

    this._modalState = { mode: 'pvp', hostReady: false, roomCode: code, deck: this._savedDeckName(), mx, my, mw, mh }
    this._modal = this.add.container(0, 0).setDepth(10)

    // Overlay escuro (clique fora fecha)
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.78).setOrigin(0).setInteractive()
    overlay.on('pointerdown', () => this._closeModal())

    // Painel — interativo para bloquear cliques de passar ao overlay
    const panel  = this.add.rectangle(mx, my, mw, mh, 0x0d1a10).setOrigin(0.5).setInteractive()
    const border = this.add.rectangle(mx, my, mw, mh).setStrokeStyle(2, 0x2a5a2a).setOrigin(0.5).setFillStyle()
    const title  = this.add.text(mx, my - mh / 2 + 30, 'CONFIGURAR SALA', {
      fontSize: '20px', color: '#4caf50', fontStyle: 'bold',
    }).setOrigin(0.5)
    const divTop = this.add.rectangle(mx, my - mh / 2 + 52, mw - 40, 1, 0x2a4a2a).setOrigin(0.5)

    // Botão fechar
    const btnClose = this.add.text(mx + mw / 2 - 20, my - mh / 2 + 18, '✕', {
      fontSize: '16px', color: '#aa4444',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnClose.on('pointerover', () => btnClose.setStyle({ color: '#ff6666' }))
    btnClose.on('pointerout',  () => btnClose.setStyle({ color: '#aa4444' }))
    btnClose.on('pointerdown', () => this._closeModal())

    this._modal.add([overlay, panel, border, title, divTop, btnClose])

    this._modalBody = this.add.container(0, 0)
    this._modal.add(this._modalBody)
    this._buildModalBody()
  }

  _buildModalBody() {
    this._modalBody.removeAll(true)
    if (this._modalInput) { this._modalInput.remove(); this._modalInput = null }

    const { mode, hostReady, roomCode, deck, mx, my, mw, mh } = this._modalState
    const lx  = mx - mw / 2 + 36

    // ─ ID DA SALA ───────
    const idY = my - mh / 2 + 80
    this._modalBody.add([
      this.add.text(lx, idY, 'ID DA SALA:', { fontSize: '13px', color: '#888888' }).setOrigin(0, 0.5),
      this.add.text(lx + 115, idY, roomCode,  { fontSize: '18px', color: '#f0d060', fontStyle: 'bold' }).setOrigin(0, 0.5),
    ])

    // ─ MODO ───────
    const modoY = idY + 52
    const pvpActive  = mode === 'pvp'
    const btnPVP = this.add.text(lx + 80, modoY, ' PVP ', {
      fontSize: '14px',
      color: pvpActive ? '#4caf50' : '#666666',
      backgroundColor: pvpActive ? '#1b5e20' : '#1a1a2a',
      padding: { x: 14, y: 6 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    btnPVP.on('pointerdown', () => { this._modalState.mode = 'pvp';  this._buildModalBody() })

    const btnSOLO = this.add.text(lx + 162, modoY, ' SOLO ', {
      fontSize: '14px',
      color: !pvpActive ? '#4caf50' : '#666666',
      backgroundColor: !pvpActive ? '#1b5e20' : '#1a1a2a',
      padding: { x: 14, y: 6 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    btnSOLO.on('pointerdown', () => { this._modalState.mode = 'solo'; this._buildModalBody() })

    this._modalBody.add([
      this.add.text(lx, modoY, 'MODO:', { fontSize: '13px', color: '#888888' }).setOrigin(0, 0.5),
      btnPVP, btnSOLO,
    ])

    // ─ HOST ───────
    const hostY = modoY + 62
    let hostName = 'Você'
    try { hostName = JSON.parse(localStorage.getItem('ez_user'))?.name ?? 'Você' } catch {}
    this._modalBody.add([
      this.add.circle(lx + 8, hostY, 7, hostReady ? 0x4caf50 : 0xcc3333),
      this.add.text(lx + 24, hostY, 'Jogador Host:', { fontSize: '12px', color: '#888888' }).setOrigin(0, 0.5),
      this.add.text(lx + 130, hostY, hostName, { fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5),
    ])

    // ─ OPONENTE ───────
    const oppY = hostY + 54
    if (mode === 'solo') {
      this._modalBody.add([
        this.add.circle(lx + 8, oppY, 7, 0x4caf50),
        this.add.text(lx + 24,  oppY, 'Oponente:', { fontSize: '12px', color: '#888888' }).setOrigin(0, 0.5),
        this.add.text(lx + 108, oppY, 'SOLO — TEST DECK', { fontSize: '15px', color: '#aaffaa' }).setOrigin(0, 0.5),
      ])
    } else {
      this._modalBody.add([
        this.add.circle(lx + 8, oppY, 7, 0xcc3333),
        this.add.text(lx + 24, oppY, 'Oponente:', { fontSize: '12px', color: '#888888' }).setOrigin(0, 0.5),
      ])
      this._modalInput = this._addHtmlInput(lx + 108, oppY, 238, 'Aguardando oponente...')
      this._modalInput.readOnly = true
      this._modalInput.style.cursor  = 'default'
      this._modalInput.style.color   = '#666666'
    }

    // divisor
    const divY = oppY + 40
    this._modalBody.add(
      this.add.rectangle(mx, divY, mw - 40, 1, 0x2a4a2a).setOrigin(0.5)
    )

    // ─ SELETOR DE DECK + PRONTO ───────
    const btnY = divY + 38

    const btnDeck = this.add.text(mx - 95, btnY, '⊞ ' + deck, {
      fontSize: '14px', color: '#ffffff', backgroundColor: '#1a2a3a',
      padding: { x: 16, y: 9 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnDeck.on('pointerover', () => btnDeck.setStyle({ backgroundColor: '#1e3a5a' }))
    btnDeck.on('pointerout',  () => btnDeck.setStyle({ backgroundColor: '#1a2a3a' }))
    btnDeck.on('pointerdown', () => console.log('Seletor de deck — em breve'))

    const btnPronto = this.add.text(mx + 110, btnY, hostReady ? '✔ PRONTO' : 'PRONTO', {
      fontSize: '15px', color: '#ffffff',
      backgroundColor: hostReady ? '#1b5e20' : '#0d47a1',
      padding: { x: 20, y: 9 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btnPronto.on('pointerover', () => btnPronto.setStyle({ backgroundColor: hostReady ? '#2e7d32' : '#1565c0' }))
    btnPronto.on('pointerout',  () => btnPronto.setStyle({ backgroundColor: hostReady ? '#1b5e20' : '#0d47a1' }))
    btnPronto.on('pointerdown', () => {
      this._modalState.hostReady = true
      if (this._modalState.mode === 'solo') {
        const mode = this._modalState.mode
        this._closeModal()
        this._startGame(mode)
      } else {
        this._buildModalBody()
      }
    })

    this._modalBody.add([btnDeck, btnPronto])
  }

  _closeModal() {
    if (this._modalInput) { this._modalInput.remove(); this._modalInput = null }
    if (this._modal)      { this._modal.destroy(true);  this._modal = null }
    this._modalState = null
  }

  _startGame(mode = this._modalState?.mode ?? 'pvp') {
    if (mode === 'solo') {
      this.scene.start('GameScene', { room: { room_code: 'LOCAL', mode }, role: 'host' })
      return
    }

    createRoom({ mode })
      .then(res => {
        const room = res.data.data ?? res.data
        this.scene.start('GameScene', { room, role: 'host' })
      })
      .catch(() => {
        this.scene.start('GameScene', { room: { room_code: 'LOCAL' }, role: 'host' })
      })
  }

  _savedDeckName() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_DECK_KEY))
      const name = saved?.name?.trim()
      const total = Array.isArray(saved?.cards)
        ? saved.cards.reduce((sum, card) => sum + (Number(card?.qty) || 0), 0)
        : 0

      if (name && total > 0) return name
    } catch {}
    return 'DECK PADRÃO'
  }

  // ── Ações ──────────────────────────────────────────────────
  _searchByCode() {
    const code = this._codeInput?.value?.trim().toUpperCase()
    if (!code) {
      this._loadRooms()
      return
    }
    const all = this.rooms
    const filtered = all.filter(r => (r.room_code ?? '').toUpperCase().includes(code))
    this.rooms = filtered
    this._renderTable()
    this.rooms = all
  }

  async _joinRoom(code) {
    try {
      const res = await joinRoom(code, null)
      const room = res.data.data ?? res.data
      this.scene.start('GameScene', { room, role: 'guest' })
    } catch (e) {
      console.error('Erro ao entrar na sala:', e)
    }
  }

  // ── Input HTML ──────────────────────────────────────────────────

  _addHtmlInput(x, y, w, placeholder) {
    const canvas  = this.sys.game.canvas.getBoundingClientRect()
    // scaleX/scaleY: quantos pixels reais correspondem a 1 pixel do jogo
    const scaleX  = canvas.width  / this.scale.gameSize.width
    const scaleY  = canvas.height / this.scale.gameSize.height

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    const inputH = 34
    input.style.cssText = [
      'position: fixed',
      'left: '   + (canvas.left + x * scaleX) + 'px',
      'top: '    + (canvas.top  + y * scaleY - inputH / 2) + 'px',
      'width: '  + (w * scaleX) + 'px',
      'height: ' + inputH + 'px',
      'background: #1e1e2e',
      'color: #fff',
      'border: 1px solid #334455',
      'border-radius: 4px',
      'padding: 0 10px',
      'font-size: 13px',
      'outline: none',
    ].join(';')

    document.body.appendChild(input)
    this._htmlElements.push(input)
    return input
  }

  _removeHtmlElements() {
    this._htmlElements.forEach(function (el) { el.remove() })
    this._htmlElements = []
  }
}
