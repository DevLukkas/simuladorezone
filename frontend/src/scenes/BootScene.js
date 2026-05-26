import { Scene } from 'phaser'
import { restoreScene, restoreSceneData } from '../utils/session.js'

/**
 * BootScene — carrega assets mínimos e restaura a última cena visitada.
 */
export default class BootScene extends Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // Placeholder de carregamento
    const width = this.cameras.main.width
    const height = this.cameras.main.height

    const progressBar = this.add.graphics()
    const progressBox = this.add.graphics()
    progressBox.fillStyle(0x222222, 0.8)
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50)

    this.add
      .text(width / 2, height / 2 - 60, 'Ezone Simulator', {
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    this.load.on('progress', (value) => {
      progressBar.clear()
      progressBar.fillStyle(0x4caf50, 1)
      progressBar.fillRect(width / 2 - 155, height / 2 - 20, 310 * value, 40)
    })

    this.load.on('complete', () => {
      progressBar.destroy()
      progressBox.destroy()
    })

    // Imagem de placeholder de carta (será substituída por assets reais)
    const cardGraphics = this.make.graphics({ x: 0, y: 0, add: false })
    cardGraphics.fillStyle(0x1a1a2e, 1)
    cardGraphics.fillRoundedRect(0, 0, 100, 140, 8)
    cardGraphics.lineStyle(2, 0x4caf50, 1)
    cardGraphics.strokeRoundedRect(0, 0, 100, 140, 8)
    cardGraphics.generateTexture('card_placeholder', 100, 140)
    cardGraphics.destroy()
  }

  create() {
    const scene = restoreScene()
    this.scene.start(scene, restoreSceneData() ?? undefined)
  }
}
