import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import LobbyScene from './scenes/LobbyScene.js'
import GameScene from './scenes/GameScene.js'
import DeckBuilderScene from './scenes/DeckBuilderScene.js'
import StatusGameScene from './scenes/StatusGameScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#FFFFFF',
  parent: 'game-container',
  scene: [BootScene, MenuScene, LobbyScene, GameScene, DeckBuilderScene, StatusGameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
}

new Phaser.Game(config)
