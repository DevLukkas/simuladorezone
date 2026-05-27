import { Scene } from 'phaser'

function topEntry(map = {}) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0]
}

export default class StatusGameScene extends Scene {
  constructor() {
    super({ key: 'StatusGameScene' })
  }

  init(data = {}) {
    this.result = data.result ?? 'defeat'
    this.score = data.score ?? { my: 0, opp: 0 }
    this.logs = data.logs ?? []
    this.stats = data.stats ?? { damageDealt: {}, damageReceived: {} }
  }

  create() {
    const { width, height } = this.cameras.main
    const victory = this.result === 'victory'
    const [topDamageCard, topDamage] = topEntry(this.stats.damageDealt)
    const [topReceivedCard, topReceived] = topEntry(this.stats.damageReceived)

    this.add.rectangle(0, 0, width, height, victory ? 0x07140d : 0x160909).setOrigin(0)
    this.add.text(width / 2, 78, victory ? 'VITORIA' : 'DERROTA', {
      fontSize: '44px',
      color: victory ? '#d8ff66' : '#ff6666',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(width / 2, 128, `Placar: ${this.score.my} x ${this.score.opp}`, {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5)

    const panel = this.add.rectangle(width / 2, 350, 760, 330, 0x071018, 0.94)
      .setStrokeStyle(2, victory ? 0x4caf50 : 0xaa3333)
    const left = width / 2 - 330
    this.add.text(left, 230, 'DADOS DA PARTIDA', {
      fontSize: '16px',
      color: '#8fb8ff',
      fontStyle: 'bold',
    })
    this.add.text(left, 272, `Carta que causou mais dano: ${topDamageCard} (${topDamage})`, {
      fontSize: '14px',
      color: '#d7e7df',
    })
    this.add.text(left, 306, `Carta que recebeu mais dano: ${topReceivedCard} (${topReceived})`, {
      fontSize: '14px',
      color: '#d7e7df',
    })

    this.add.text(left, 354, 'ULTIMAS ACOES', {
      fontSize: '14px',
      color: '#8fb8ff',
      fontStyle: 'bold',
    })
    this.logs.slice(-7).forEach((line, i) => {
      this.add.text(left, 384 + i * 24, line, {
        fontSize: '12px',
        color: '#cccccc',
      })
    })

    const btn = this.add.text(width / 2, height - 84, 'VOLTAR AO MENU', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#17313f',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#2f6f8f' }))
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#17313f' }))
    btn.on('pointerdown', () => this.scene.start('MenuScene'))
  }
}
