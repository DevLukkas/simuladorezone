import Phaser from 'phaser'
import './style.css'
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
import OffersScene from './scenes/OffersScene.js'
import LaboratoryScene from './scenes/LaboratoryScene.js'

const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const PLAY_URL = import.meta.env.VITE_PLAY_URL || (isLocalHost ? '/play' : 'https://play.vbxsistemas.com.br')

function shouldStartGame() {
  const host = window.location.hostname
  const path = window.location.pathname
  return host.startsWith('play.') || (isLocalHost && path.startsWith('/play'))
}

function startGame() {
  document.body.classList.add('game-shell')
  document.querySelector('#app')?.remove()

  const container = document.createElement('div')
  container.id = 'game-container'
  document.body.appendChild(container)

  const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: '#FFFFFF',
    parent: 'game-container',
    scene: [BootScene, MenuScene, StarterDeckScene, LobbyScene, LibraryScene, GameScene, DeckBuilderScene, ProfileScene, OffersScene, LaboratoryScene, AdminPanelScene, StatusGameScene],
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
}

function renderLanding() {
  document.body.classList.add('landing-shell')
  document.querySelector('#game-container')?.remove()

  document.body.innerHTML = `
    <main id="app" class="site">
      <nav class="topbar" aria-label="Navegação principal">
        <a class="brand" href="/">
          <span class="brand-mark">EZ</span>
          <span>Ezone TCG</span>
        </a>
        <div class="nav-actions">
          <a href="#jogo">Jogo</a>
          <a href="#beta">Beta</a>
          <a href="#apoio">Apoiar</a>
          <a class="nav-play" href="${PLAY_URL}">Jogar</a>
        </div>
      </nav>

      <section class="hero-section" id="jogo">
        <img class="hero-bg" src="/assets/img/bg_gameBattle.png" alt="Campo de batalha do Ezone TCG" />
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <p class="eyebrow">TCG digital brasileiro em beta</p>
          <h1>Ezone TCG</h1>
          <p class="hero-copy">
            Monte baralhos, invoque criaturas, use comandos táticos e dispute partidas online em um card game feito para evoluir com a comunidade.
          </p>
          <div class="hero-actions">
            <a class="primary-button" href="${PLAY_URL}">Entrar no beta</a>
            <a class="secondary-button" href="#apoio">Apoiar desenvolvimento</a>
          </div>
        </div>
        <div class="card-fan" aria-hidden="true">
          <img src="/assets/cards/31.png" alt="" />
          <img src="/assets/cards/45.png" alt="" />
          <img src="/assets/cards/34.png" alt="" />
        </div>
      </section>

      <section class="resource-band" aria-label="Status do beta">
        <div><strong>Modo beta</strong><span>Partidas, coleção, loja inicial e laboratório em evolução.</span></div>
        <div><strong>Feedback aberto</strong><span>Jogadores ajudam a ajustar cartas, ritmo e economia.</span></div>
        <div><strong>Projeto independente</strong><span>Apoios ajudam com servidor, arte, balanceamento e testes.</span></div>
      </section>

      <section class="content-band two-col">
        <div>
          <p class="section-kicker">O jogo</p>
          <h2>Estratégia de mesa com ritmo digital.</h2>
        </div>
        <div class="feature-list">
          <article>
            <img src="/assets/cards/32.png" alt="Carta Feiticeiro Tribal Badur" />
            <div>
              <h3>Baralhos com identidade</h3>
              <p>Construa listas com criaturas, comandos, habilidades, itens e cenários.</p>
            </div>
          </article>
          <article>
            <img src="/assets/cards/23.png" alt="Carta Marionete de Guerra" />
            <div>
              <h3>Combate tático</h3>
              <p>Forçe ataques, proteja alvos, controle o campo e vença por pontos.</p>
            </div>
          </article>
          <article>
            <img src="/assets/cards/35.png" alt="Carta Ceifador do Castelo Amaldiçoado" />
            <div>
              <h3>Progressão persistente</h3>
              <p>Coleção, baralhos e recursos acompanham a conta em qualquer navegador.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="showcase" id="beta">
        <div class="showcase-copy">
          <p class="section-kicker">Beta fechado</p>
          <h2>Precisamos de jogadores testando partidas reais.</h2>
          <p>
            Nesta fase o foco é encontrar bugs, medir balanceamento, lapidar a experiência de montar baralho e validar o ciclo de recompensas.
          </p>
        </div>
        <div class="beta-panel">
          <span>Disponível no navegador</span>
          <strong>play.vbxsistemas.com.br</strong>
          <a href="${PLAY_URL}">Abrir jogo</a>
        </div>
      </section>

      <section class="support-band" id="apoio">
        <div>
          <p class="section-kicker">Apoie</p>
          <h2>Ajude o Ezone TCG a pagar servidor, testes e produção.</h2>
          <p>
            A página já deixa espaço para Pix, planos de fundador, cosméticos e recompensas de apoiador quando conectarmos os pagamentos.
          </p>
        </div>
        <div class="support-actions">
          <a class="primary-button" href="mailto:contato@vbxsistemas.com.br?subject=Apoiar%20Ezone%20TCG">Quero apoiar</a>
          <a class="secondary-button" href="${PLAY_URL}">Testar beta</a>
        </div>
      </section>

      <footer class="footer">
        <span>Ezone TCG</span>
        <span>Beta independente por Taverneiros Game Studio - Desenvolvido por Lucas Silva</span>
      </footer>
    </main>
  `
}

if (shouldStartGame()) {
  startGame()
} else if (window.location.pathname.startsWith('/play')) {
  window.location.replace(PLAY_URL)
} else {
  renderLanding()
}
