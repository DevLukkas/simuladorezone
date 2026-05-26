import { Scene } from 'phaser'
import { login, register } from '../api/gameApi.js'
import { saveScene } from '../utils/session.js'

/**
 * MenuScene — Login / Registro e navegação principal.
 */
export default class MenuScene extends Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create() {
    saveScene('MenuScene')
    const { width, height } = this.cameras.main

    // Fundo
    this.add.rectangle(0, 0, width, height, 0x0d1117).setOrigin(0)

    // Título
    this.add
      .text(width / 2, height * 0.18, 'Elemental Zone - TCG', {
        fontSize: '42px',
        color: '#4caf50',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height * 0.26, 'Batalha de Cartas Elementais', {
        fontSize: '18px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5)

    // Verifica se já está logado
    const token = localStorage.getItem('auth_token')
    if (token) {
      this._showMainMenu()
    } else {
      this._showLoginForm()
    }
  }

  _showLoginForm() {
    const { width, height } = this.cameras.main

    // Container agrupa todos os elementos do formulário para destruir de uma vez
    this._loginContainer = this.add.container(0, 0)

    const btnLogin = this.add
      .text(width / 2, height * 0.45, ' Acessar ', {
        fontSize: '24px',
        fontWeight: '900',
        color: '#ffffff',
        backgroundColor: 'GoldenRod',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    const versionText = this.add
      .text(width / 2, height * 0.9, 'v0.1.0 — Em desenvolvimento', {
        fontSize: '12px',
        color: '#555555',
      })
      .setOrigin(0.5)

    this._loginContainer.add([btnLogin, versionText])

    btnLogin.on('pointerover', () => btnLogin.setStyle({ color: '#4caf50' }))
    btnLogin.on('pointerout', () => btnLogin.setStyle({ color: '#ffffff' }))
    btnLogin.on('pointerdown', () => {
      // Dev mode: grava token fictício para manter sessão entre cenas
      localStorage.setItem('auth_token', 'dev_token')
      // Destrói todo o formulário antes de mostrar o menu
      this._loginContainer.destroy(true)
      this._loginContainer = null
      this._showMainMenu()
    })
  }

  _showMainMenu() {
    const { width, height } = this.cameras.main
    const btnStyle = {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#1b3a4b',
      padding: { x: 30, y: 12 },
    }

    const buttons = [
      { label: 'Partida Amistosa', scene: 'LobbyScene' },
      { label: 'Marketplace Global', scene: 'LibraryScene' },
      { label: 'Deck Builder', scene: 'DeckBuilderScene' },
      { label: 'Perfil', scene: 'ProfileScene' },
    ]

    buttons.forEach((btn, i) => {
      const b = this.add
        .text(width / 2, height * 0.42 + i * 70, btn.label, btnStyle)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })

      b.on('pointerover', () => b.setStyle({ color: '#4caf50' }))
      b.on('pointerout', () => b.setStyle({ color: '#ffffff' }))
      b.on('pointerdown', () => {
        if (this.scene.get(btn.scene)) {
          this.scene.start(btn.scene)
        } else {
          console.warn(`Cena ${btn.scene} ainda não implementada.`)
        }
      })
    })
  }
}
