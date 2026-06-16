import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import LobbyScene from './scenes/LobbyScene.js'
import LibraryScene from './scenes/LibraryScene.js'
import GameScene from './scenes/GameScene.js'
import DeckBuilderScene from './scenes/DeckBuilderScene.js'
import StatusGameScene from './scenes/StatusGameScene.js'
import StarterDeckScene from './scenes/StarterDeckScene.js'
import ProfileScene from './scenes/ProfileScene.js'
import AdminPanelScene from './scenes/AdminPanelScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#FFFFFF',
  parent: 'game-container',
  scene: [BootScene, MenuScene, StarterDeckScene, LobbyScene, LibraryScene, GameScene, DeckBuilderScene, ProfileScene, AdminPanelScene, StatusGameScene],
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
