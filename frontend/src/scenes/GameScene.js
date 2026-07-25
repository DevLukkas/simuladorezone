import { Scene } from "phaser";
import echo from "../config/echo.js";
import api from "../config/api.js";
import { criaturas } from "../data/criaturas.js";
import { habilidades } from "../data/habilidades.js";
import { itens } from "../data/itens.js";
import { comandos } from "../data/comandos.js";
import { cenarios } from "../data/cenarios.js";
import {
  abilityEffectNeedsTarget,
  applyTargetedAbilityEffect,
} from "../effects/abilityEffects.js";
import { matchesCreatureRule } from "../effects/creatureEffects.js";
import { applySummonToken } from "../effects/summonToken.js";
import {
  activateAbility,
  canActivateAbility,
  createCreatureInstance,
  recalculateCreatureStats,
  resolveTriggerEffects,
} from "../effects/index.js";
import { createEffectQueueRunner } from "../game/effectResolver.js";
import {
  canCreatureAttack,
  canNormalSummon,
  canUseMainAction,
  pointsForRarity,
} from "../game/gameRules.js";
import {
  aiChooseFirstCard,
  aiChooseFirstEmptySlot,
  aiChooseFirstSlot,
  aiDiscardRandom,
} from "../game/soloAi.js";
import {
  attachmentTargets,
  commandTargetSlots,
  effectNeedsCreatureTarget,
  matchesCardRule,
} from "../game/targeting.js";
import { clearScene, saveScene, restoreSceneData } from "../utils/session.js";
import { applyRevealRandomHandThenShuffleOne } from '../effects/commandEffects.js';
import { getHeroes } from "../api/gameApi.js";

const LOCAL_DECK_KEY = "ezone_deck_builder_draft";
const CARD_BACK_KEY = "card_back";
const BATTLE_BG_KEY = "battle_bg";
const MAX_HAND_SIZE = 8;
const MAX_SCORE = 3;
// Regra experimental: cada criatura enfrenta apenas a criatura na mesma coluna.
const ATAQUE_DIRETO_POR_COLUNA = true;
// Regra experimental: anexos de habilidade e item não consomem a ação do turno.
const ANEXOS_LIVRES = true;
const HERO_KEYS = ["tennor", "ispisher", "gimlou", "badur", "morgon"];

const TYPE_DEFAULT_COLOR = {
  criatura: 0x886633,
  habilidade: 0x2255aa,
  item: 0x668844,
  comando: 0x773399,
  cenario: 0x336655,
};

const ELEMENT_LABEL = {
  fogo: "Fogo",
  agua: "Agua",
  terra: "Terra",
  vento: "Vento",
  neutro: "Neutro",
  vazio: "Vazio",
  cosmico: "Cosmico",
};

function normalize(cards, card_type) {
  return cards.map((c) => ({
    ...c,
    name: c.nome,
    card_type,
    attack: c.ataque ?? null,
    defense: c.vida ?? null,
    race: c.race ?? c.raca ?? null,
    element: c.element ?? c.elemento ?? "neutro",
    rarity: c.rarity ?? c.raridade,
    color: TYPE_DEFAULT_COLOR[card_type],
  }));
}

const ALL_CARDS = [
  ...normalize(criaturas, "criatura"),
  ...normalize(habilidades, "habilidade"),
  ...normalize(
    itens.map((c) => ({ ...c, elemento: "neutro" })),
    "item",
  ),
  ...normalize(comandos, "comando"),
  ...normalize(cenarios, "cenario"),
];

/**
 * GameScene — tabuleiro JxJ espelhado com drag & drop manual.
 *
 * Layout (modo espelho):
 *  ┌─────────────────────────────────────┐
 *  │  [Mão Adversário - virada]           │
 *  │  [Campo Adversário — 5 slots]        │
 *  │  ────────────────────────────────── │
 *  │  [Campo Jogador   — 5 slots]         │
 *  │  [Mão Jogador]                       │
 *  └─────────────────────────────────────┘
 */
export default class GameScene extends Scene {
  constructor() {
    super({ key: "GameScene" });
    this._resetRuntimeState();
  }

  _resetRuntimeState() {
    this.room = null;
    this.role = "host"; // 'host' | 'guest'
    this.myDeck = [];
    this.myHand = [];
    this.myDiscard = [];
    this.oppDeck = [];
    this.oppHand = [];
    this.oppDiscard = [];
    this.oppHandCount = 5;
    this.oppDeckCount = 35;
    this.myField = Array(5).fill(null);
    this.oppField = Array(5).fill(null);
    this.selectedCard = null;
    this.dragCard = null;
    this._handContainers = [];
    this._deckActionsOpen = false;
    this._magnifierButton = null;
    this._cardInspectPanel = null;
    this._mulliganOffered = false;
    this._mulliganModal = null;
    this._mulliganTimer = null;
    this._cardActionMenu = null;
    this._pendingSummonCard = null;
    this._pendingAttachmentCard = null;
    this._pendingCommandCard = null;
    this._pendingCommandEffect = null;
    this._pendingAbilityEffect = null;
    this._pendingAbilitySourceSlot = null;
    this._pendingAbilitySource = null;
    this._pendingHandAbilityCard = null;
    this._pendingHandAbility = null;
    this._pendingSpecialSummon = null;
    this._pendingSlotChoice = null;
    this._slotChoiceCancelButton = null;
    this._effectQueue = [];
    this._isResolvingEffect = false;
    this._effectQueueRunner = null;
    this._battleAttackButtons = [];
    this._commandResponseHighlights = [];
    this._commandResponseTimer = null;
    this._pendingAttackSlot = null;
    this._mustDiscardBeforeDraw = false;
    this._turnFuseStarted = false;
    this._turnNumber = 1;
    this._delayedEffects = [];
    this._activePlayer = "my";
    this._currentPhase = "setup";
    this._turnActions = { summoned: false, attached: false, scenario: false };
    this._score = { my: 0, opp: 0 };
    this._directDamage = { my: 0, opp: 0 };
    this._myScenario = null;
    this._oppScenario = null;
    this._scenarioTurnFlags = {};
    this._gameOver = false;
    this._actionLogs = [];
    this._logCollapsed = false;
    this._matchStats = {
      damageDealt: {},
      damageReceived: {},
      playedCards: [],
    };
    this._slotsMy = null;
    this._slotsOpp = null;
    this._scoreDotsMy = null;
    this._scoreDotsOpp = null;
    this._turnFuseTimer = null;
    this._turnFuseGraphics = null;
    this._turnFuseText = null;
    this._turnBanner = null;
    this._phaseButton = null;
    this._phaseButtonGlow = null;
    this._toastText = null;
    this._directDamageTextMy = null;
    this._directDamageTextOpp = null;
    this._actionLogPanel = null;
    this._deckPileContainer = null;
    this._oppDeckPileContainer = null;
    this._discardPileContainer = null;
    this._oppDiscardPileContainer = null;
    this._oppHandContainer = null;
    this._scenarioContainer = null;
    this._discardViewer = null;
    this._replaceAttachmentMenu = null;
    this._elementChoiceMenu = null;
    this._effectChoiceModal = null;
    this._discardTriggerBuffer = [];
    this._discardTriggerBatchEvent = null;
    this._myHero = null;
    this._opponentHero = null;
    this._myHeroPanel = null;
    this._opponentHeroPanel = null;
    this._heroesReady = Promise.resolve();
    this._myName = "Jogador";
    this._opponentName = "Oponente";
  }

  init(data = {}) {
    this._cleanupRuntimeBeforeRestart();
    this._resetRuntimeState();
    const restored = restoreSceneData();
    this.room = data.room ?? restored?.room ?? null;
    this.role = data.role ?? restored?.role ?? "host";
    this._syncPlayerNames();
  }

  _cleanupRuntimeBeforeRestart() {
    this.time?.removeAllEvents();
    this.tweens?.killAll();
    if (this._turnFuseTimer) this._turnFuseTimer.remove(false);
    this._turnFuseTimer = null;
  }

  preload() {
    if (!this.textures.exists(BATTLE_BG_KEY)) {
      this.load.image(BATTLE_BG_KEY, "/assets/img/bg_gameBattle.png");
    }

    if (!this.textures.exists(CARD_BACK_KEY)) {
      this.load.image(CARD_BACK_KEY, "/assets/img/cover.png");
    }

    ALL_CARDS.forEach((card) => {
      const key = `card_${card.id}`;
      const file = `/assets/cards/${String(card.id).padStart(2, "0")}.png`;
      if (!this.textures.exists(key)) {
        this.load.image(key, file);
      }
    });

    HERO_KEYS.forEach((key) => {
      const textureKey = this._heroTextureKey(key);
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, `/assets/heroes/avatar_heroi_${key}.png`);
      }
    });
  }

  create() {
    if (!localStorage.getItem("auth_token") || (!this.room?.id && !this._isSoloMode())) {
      clearScene();
      this.scene.start("MenuScene");
      return;
    }

    saveScene("GameScene", { room: this.room, role: this.role });
    this._effectQueueRunner = createEffectQueueRunner({
      resolveJob: (job) => this._runEffectResolution(job),
      onError: (error) => {
        console.error("Erro ao resolver efeito:", error);
        this._toast("Erro ao resolver efeito.");
      },
    });

    const { width, height } = this.cameras.main;

    // — Fundo —
    this.add
      .image(width / 2, height / 2, BATTLE_BG_KEY)
      .setDisplaySize(width, height);

    // — Linha central —
    this.add
      .line(0, 0, 0, height / 2, width, height / 2, 0x334455)
      .setOrigin(0);

    this._buildMatchHeader(width);
    this._buildActionLogPanel();

    // — Slots do campo —
    this._slotsMy = this._createFieldSlots(width, height, "my");
    this._slotsOpp = this._createFieldSlots(width, height, "opp");
    this._renderHeroPanels(width, height);
    this._heroesReady = this._loadBattleHeroes();

    // — Zona da mão —
    this._handZone = this.add
      .zone(width / 2, height - 60, width - 40, 110)
      .setRectangleDropZone(width - 40, 110);

    // — Info de turno —
    this._turnText = this.add
      .text(width - 20, height / 2, "Aguardando...", {
        fontSize: "13px",
        color: "#888888",
      })
      .setOrigin(1, 0.5);

    // — Botões de turno —
    this._phaseButton = this.add
      .text(width - 20, height - 58, "FIM DE TURNO", {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#880000",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this._advancePhase());
    this._phaseButton.setVisible(false).disableInteractive();

    this.add
      .text(width - 20, height - 20, "SURRENDER", {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#3a1a1a",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 1)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", function () {
        this.setStyle({ backgroundColor: "#6a2222" });
      })
      .on("pointerout", function () {
        this.setStyle({ backgroundColor: "#3a1a1a" });
      })
      .on("pointerdown", () => this._surrender());

    // — WebSocket: escutar ações do adversário —
    this._listenChannel();

    this._renderOpponentHand();
    this._renderOpponentDeckPile();
    this._renderOpponentDiscardPile();
    this._renderScenarioZone();
    this.input.on("pointerdown", this._handleBoardPointerDown, this);
    this._dealStartingHand();
  }

  _buildMatchHeader(width) {
    const y = 18;
    const leftX = width / 2 - 180;
    const rightX = width / 2 + 180;

    this.add
      .rectangle(width / 2, 0, width, 58, 0x071018, 0.92)
      .setOrigin(0.5, 0);
    this.add.rectangle(width / 2, 58, width, 1, 0x26384a).setOrigin(0.5);

    this.add
      .text(leftX, y, this._myName, {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this._directDamageTextMy = this.add
      .text(leftX + 82, y, "Dano: 0/5", {
        fontSize: "11px",
        color: "#d8ff66",
      })
      .setOrigin(0, 0.5);
    this.add
      .text(width / 2, y, "x", {
        fontSize: "16px",
        color: "#cccccc",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.add
      .text(rightX, y, this._opponentName, {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this._directDamageTextOpp = this.add
      .text(rightX + 82, y, "Dano: 0/5", {
        fontSize: "11px",
        color: "#ff9999",
      })
      .setOrigin(0, 0.5);

    this._scoreDotsMy = this._addScoreDots(leftX, y + 22);
    this._scoreDotsOpp = this._addScoreDots(rightX, y + 22);

    this._roundText = this.add
      .text(width / 2, y + 32, "[Turno: 1]", {
        fontSize: "13px",
        color: "#8fb8ff",
      })
      .setOrigin(0.5);
    this._updateDirectDamageHeader();
  }

  _buildTurnFuse(width, height) {
    if (this._turnFuseTimer) this._turnFuseTimer.remove(false);
    if (this._turnFuseGraphics) this._turnFuseGraphics.destroy();
    if (this._turnFuseText) this._turnFuseText.destroy();

    this._turnFuseGraphics = this.add.graphics().setDepth(4);
    this._turnFuseText = this.add
      .text(width / 2, height / 2 - 24, "60", {
        fontSize: "17px",
        color: "#d8ff66",
        fontStyle: "bold",
        backgroundColor: "#071018",
        padding: { x: 9, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(5);

    const startTime = this.time.now;
    const duration = 60000;
    let expired = false;
    const drawFuse = () => {
      const elapsed = Math.min(duration, this.time.now - startTime);
      const progress = elapsed / duration;
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      const x1 = 34;
      const x2 = width - 34;
      const y = height / 2;
      const burnX = x1 + (x2 - x1) * progress;
      const red = Math.round(120 + 135 * progress);
      const green = Math.round(255 * (1 - Math.max(0, progress - 0.45) / 0.55));
      const color = (red << 16) | (green << 8) | 0x22;

      this._turnFuseGraphics.clear();
      this._turnFuseGraphics.lineStyle(6, 0x181818, 0.9);
      this._turnFuseGraphics.beginPath();
      this._turnFuseGraphics.moveTo(x1, y);
      this._turnFuseGraphics.lineTo(x2, y);
      this._turnFuseGraphics.strokePath();

      this._turnFuseGraphics.lineStyle(5, 0x555555, 0.65);
      this._turnFuseGraphics.beginPath();
      this._turnFuseGraphics.moveTo(x1, y);
      this._turnFuseGraphics.lineTo(burnX, y);
      this._turnFuseGraphics.strokePath();

      if (burnX < x2) {
        this._turnFuseGraphics.lineStyle(5, color, 1);
        this._turnFuseGraphics.beginPath();
        this._turnFuseGraphics.moveTo(burnX, y);
        this._turnFuseGraphics.lineTo(x2, y);
        this._turnFuseGraphics.strokePath();
      }

      this._turnFuseGraphics.fillStyle(
        progress > 0.78 ? 0xff2200 : 0xd8ff22,
        1,
      );
      this._turnFuseGraphics.fillCircle(burnX, y, 7);
      this._turnFuseText.setText(String(remaining));
      this._turnFuseText.setStyle({
        color: progress > 0.78 ? "#ff4422" : "#d8ff66",
      });

      if (!expired && elapsed >= duration) {
        expired = true;
        this._handleTurnFuseExpired();
      }
    };

    drawFuse();
    this._turnFuseTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: drawFuse,
    });
  }

  _startTurnFuse() {
    const { width, height } = this.cameras.main;
    this._turnFuseStarted = true;
    this._buildTurnFuse(width, height);
  }

  _stopTurnFuse() {
    if (this._turnFuseTimer) {
      this._turnFuseTimer.remove(false);
      this._turnFuseTimer = null;
    }
    this._turnFuseStarted = false;
  }

  _handleTurnFuseExpired() {
    if (this._gameOver || this._currentPhase === "setup") return;
    if (this._activePlayer !== "my") {
      if (this._isSoloMode()) {
        this._stopTurnFuse();
        this._toast("Tempo do oponente esgotado.");
        this._logAction("Tempo do oponente esgotado. Turno encerrado automaticamente.");
        this._endTurn();
        return;
      }
      this._stopTurnFuse();
      return;
    }
    this._stopTurnFuse();
    this._toast("Tempo esgotado. Turno encerrado.");
    this._logAction("Tempo esgotado. Turno encerrado automaticamente.");
    this._endTurn();
  }

  _addScoreDots(x, y) {
    const gap = 15;
    const dots = [];
    for (let i = 0; i < 3; i++) {
      const dot = this.add
        .circle(x - gap + i * gap, y, 5, 0x777777)
        .setStrokeStyle(1, 0xaaaaaa);
      dots.push(dot);
    }
    return dots;
  }

  _buildActionLogPanel() {
    this._renderActionLogPanel();
  }

  _renderActionLogPanel() {
    if (this._actionLogPanel) this._actionLogPanel.destroy(true);

    const x = this._logCollapsed ? 16 : 126;
    const y = 360;
    const w = this._logCollapsed ? 34 : 244;
    const h = 520;
    this._actionLogPanel = this.add.container(x, y).setDepth(35);

    const bg = this.add
      .rectangle(0, 0, w, h, 0x061014, 0.9)
      .setStrokeStyle(1, 0x2f6f8f);
    const toggle = this.add
      .text(-w / 2 + 18, -h / 2 + 18, "☰", {
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#17313f",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    toggle.on("pointerdown", () => {
      this._logCollapsed = !this._logCollapsed;
      this._renderActionLogPanel();
    });
    this._actionLogPanel.add([bg, toggle]);

    if (this._logCollapsed) return;

    const title = this.add
      .text(-w / 2 + 44, -h / 2 + 10, "LOG DA PARTIDA", {
        fontSize: "12px",
        color: "#8fb8ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this._actionLogPanel.add(title);

    const visible = this._actionLogs.slice(-18);
    visible.forEach((line, i) => {
      const text = this.add
        .text(-w / 2 + 12, -h / 2 + 42 + i * 25, line, {
          fontSize: "10px",
          color: "#d7e7df",
          wordWrap: { width: w - 24 },
        })
        .setOrigin(0, 0);
      this._actionLogPanel.add(text);
    });
  }

  _logAction(message) {
    this._actionLogs.push(`[T${this._turnNumber}] ${message}`);
    if (this._actionLogs.length > 80) this._actionLogs.shift();
    this._renderActionLogPanel();
  }

  // ────── Slots do Campo ──────

  _createFieldSlots(width, height, side) {
    const slotCount = 5;
    const slotW = 90;
    const slotH = 125;
    const gap = 14;
    const totalW = slotCount * slotW + (slotCount - 1) * gap;
    const startX = (width - totalW) / 2;
    const y = side === "my" ? height * 0.62 : height * 0.36;

    return Array.from({ length: slotCount }, (_, i) => {
      const x = startX + i * (slotW + gap) + slotW / 2;
      const slot = this.add.rectangle(x, y, slotW, slotH, 0x1a2a3a, 0.6);
      slot.setStrokeStyle(1, 0x334455);
      slot.setData("slotIndex", i);
      slot.setData("side", side);
      slot.setInteractive({ useHandCursor: true });
      slot.on("pointerdown", () => this._handleSlotClick(side, i));

      // DropZone
      const zone = this.add
        .zone(x, y, slotW, slotH)
        .setRectangleDropZone(slotW, slotH);
      zone.setData("slotIndex", i);
      zone.setData("side", side);
      zone.setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this._handleSlotClick(side, i));

      return {
        rect: slot,
        zone,
        card: null,
        cardObject: null,
        attachments: [],
        highlight: null,
        attachHighlight: null,
        x,
        y,
        w: slotW,
        h: slotH,
      };
    });
  }

  _handleSlotClick(side, slotIndex) {
    if (this._pendingSlotChoice) {
      this._selectGenericSlotChoice(side, slotIndex);
      return;
    }

    if (this._pendingCommandCard) {
      this._selectCommandTarget(side, slotIndex);
      return;
    }

    if (this._pendingAbilityEffect) {
      this._selectAbilityTarget(side, slotIndex);
      return;
    }

    if (this._pendingSpecialSummon) {
      this._selectSpecialSummonTarget(side, slotIndex);
      return;
    }

    if (this._pendingAttackSlot) {
      this._selectAttackTarget(side, slotIndex);
      return;
    }

    if (side === "my") this._placePendingSummon(slotIndex);
  }

  // ────── Mão inicial ──────

  _loadLocalDeckCards() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_DECK_KEY));
      if (!Array.isArray(saved?.cards)) return [];

      const cards = [];
      for (const entry of saved.cards) {
        const id = Number(entry?.id);
        const qty = Number(entry?.qty);
        const card = ALL_CARDS.find((c) => Number(c.id) === id);
        if (!card || !Number.isInteger(qty) || qty <= 0) continue;

        for (let i = 0; i < qty; i++) {
          cards.push(card);
        }
      }
      return cards;
    } catch {
      return [];
    }
  }

  _dealStartingHand() {
    const baseDeck = this._loadLocalDeckCards();
    if (baseDeck.length) {
      const localDeck = this._shuffleCards(baseDeck);
      this.myHand = localDeck.slice(0, 5);
      this.myDeck = localDeck.slice(5);
      this._setupSoloOpponentDeck(baseDeck);
      this._renderDeckPile();
      this._renderDiscardPile();
      this._renderOpponentDeckPile();
      this._renderOpponentDiscardPile();
      this._renderHand(this.myHand);
      this._setupOpponentPublicCounts(baseDeck.length);
      this._renderOpponentHand();
      this._openMulliganModal();
      return;
    }

    this._toast("Monte ou selecione um baralho antes de iniciar a partida.");
    this.time.delayedCall(1200, () => this.scene.start("DeckBuilderScene"));
  }

  _dealDemoHand() {
    const demoCards = this._shuffleCards([
      {
        id: 1,
        name: "Dragão Solar",
        attack: 9,
        defense: 7,
        mana_cost: 6,
        card_type: "creature",
      },
      {
        id: 2,
        name: "Feitiço de Gelo",
        attack: null,
        defense: null,
        mana_cost: 3,
        card_type: "spell",
      },
      {
        id: 3,
        name: "Escudo Lunar",
        attack: 2,
        defense: 10,
        mana_cost: 4,
        card_type: "creature",
      },
      {
        id: 4,
        name: "Raio Veloz",
        attack: 6,
        defense: null,
        mana_cost: 2,
        card_type: "spell",
      },
      {
        id: 5,
        name: "Golem de Pedra",
        attack: 5,
        defense: 8,
        mana_cost: 5,
        card_type: "creature",
      },
    ]);
    this.myHand = demoCards;
    this.myDeck = demoCards.slice(5);
    this._setupSoloOpponentDeck(demoCards);
    this._renderDeckPile();
    this._renderDiscardPile();
    this._renderOpponentDeckPile();
    this._renderOpponentDiscardPile();
    this._renderHand(this.myHand);
    this._setupOpponentPublicCounts(demoCards.length);
    this._renderOpponentHand();
    this._openMulliganModal();
  }

  _setupOpponentPublicCounts(deckSize) {
    if (this._isSoloMode()) return;
    this.oppHandCount = 5;
    this.oppDeckCount = Math.max(
      0,
      (Number(deckSize) || 40) - this.oppHandCount,
    );
    this.oppDiscard = [];
    this._renderOpponentDeckPile();
    this._renderOpponentDiscardPile();
  }

  _syncPlayerNames() {
    const hostName = this.room?.host?.name ?? "Jogador 1";
    const guestName = this.room?.guest?.name ?? "Jogador 2";

    if (this.role === "guest") {
      this._myName = guestName;
      this._opponentName = hostName;
      return;
    }

    this._myName = hostName;
    this._opponentName = guestName;
  }

  _getActivePlayerSideFromRoom() {
    const activeId = Number(this.room?.game_state?.active_player_id);
    if (!activeId) return "my";

    return activeId === this._getMyUserId() ? "my" : "opp";
  }

  _getCurrentPhaseFromRoom() {
    const phase = this.room?.game_state?.phase;
    return ["main", "battle", "setup"].includes(phase) ? phase : "main";
  }

  _isSoloMode() {
    return this.room?.mode === "solo" || this.room?.room_code === "LOCAL";
  }

  _heroTextureKey(key) {
    return `battle_hero_${key}`;
  }

  _localDeckHeroId() {
    try {
      const deck = JSON.parse(localStorage.getItem(LOCAL_DECK_KEY));
      const heroId = Number(deck?.hero_id);
      return Number.isInteger(heroId) && heroId > 0 ? heroId : null;
    } catch {
      return null;
    }
  }

  _roomHero(side) {
    const deck = side === "my"
      ? (this.role === "guest" ? this.room?.guest_deck : this.room?.host_deck)
      : (this.role === "guest" ? this.room?.host_deck : this.room?.guest_deck);
    return deck?.hero ?? null;
  }

  async _loadBattleHeroes() {
    try {
      const response = await getHeroes();
      const heroes = response.data?.data ?? [];
      const ownHero = this._roomHero("my")
        ?? heroes.find((hero) => Number(hero.id) === this._localDeckHeroId())
        ?? heroes.find((hero) => hero.owned)
        ?? null;
      const opponentHero = this._roomHero("opp")
        ?? heroes.find((hero) => hero.key === (ownHero?.key === "morgon" ? "badur" : "morgon"))
        ?? null;

      this._myHero = ownHero;
      this._opponentHero = opponentHero;
      if (this.sys.isActive()) this._renderHeroPanels(this.scale.width, this.scale.height);
    } catch (error) {
      console.warn("Não foi possível carregar os heróis da partida:", error);
    }
  }

  _renderHeroPanels(width, height) {
    this._myHeroPanel?.destroy(true);
    this._opponentHeroPanel?.destroy(true);

    const createPanel = (hero, side) => {
      const isMine = side === "my";
      const x = width / 2;
      const y = isMine ? height * 0.62 + 105 : height * 0.36 - 105;
      const accent = isMine ? 0x64e8ff : 0xffa36a;
      const container = this.add.container(x, y).setDepth(3);
      const bg = this.add.rectangle(0, 0, 172, 72, 0x06111f, 0.92)
        .setStrokeStyle(1, accent, 0.9);
      const portraitFrame = this.add.rectangle(-58, 0, 58, 58, 0x03070d, 0.98)
        .setStrokeStyle(1, accent, 0.9);
      const name = this.add.text(-18, -13, hero?.name ?? "Herói", {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold",
      }).setOrigin(0, 0.5);
      const role = this.add.text(-18, 11, hero?.effect_name ?? "Líder do baralho", {
        fontSize: "10px",
        color: isMine ? "#9fefff" : "#ffd0a8",
        wordWrap: { width: 94 },
      }).setOrigin(0, 0.5);
      const sideLabel = this.add.text(76, -25, isMine ? "SEU HERÓI" : "HERÓI INIMIGO", {
        fontSize: "8px",
        color: isMine ? "#64e8ff" : "#ffb27a",
      }).setOrigin(1, 0.5);
      const elements = [bg, portraitFrame, name, role, sideLabel];
      const textureKey = hero?.key ? this._heroTextureKey(hero.key) : null;
      if (textureKey && this.textures.exists(textureKey)) {
        elements.push(this.add.image(-58, 0, textureKey).setDisplaySize(52, 52));
      } else {
        elements.push(this.add.text(-58, 0, "?", { fontSize: "26px", color: "#8192a2" }).setOrigin(0.5));
      }
      container.add(elements);
      return container;
    };

    this._opponentHeroPanel = createPanel(this._opponentHero, "opp");
    this._myHeroPanel = createPanel(this._myHero, "my");
  }

  _setupSoloOpponentDeck(baseDeck) {
    if (!this._isSoloMode()) return;

    const aiDeck = this._shuffleCards(baseDeck);
    this.oppHand = aiDeck.slice(0, 5);
    this.oppDeck = aiDeck.slice(5);
    this.oppDiscard = [];
    this.oppHandCount = this.oppHand.length;
  }

  _shuffleCards(cards) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  _renderDeckPile() {
    if (this._deckPileContainer) {
      this._deckPileContainer.destroy(true);
    }

    const { width, height } = this.cameras.main;
    const cardW = 80;
    const cardH = 112;
    const count = this.myDeck.length;
    const x = width - 238;
    const y = height - 90;

    this._deckPileContainer = this.add.container(x, y);

    const base = this.add
      .rectangle(0, 0, cardW + 10, cardH + 10, 0x07100d, 0.95)
      .setStrokeStyle(1, 0x2a5a2a);
    this._deckPileContainer.add(base);

    if (count > 0 && this.textures.exists(CARD_BACK_KEY)) {
      const visibleCards = Math.min(7, count);
      for (let i = visibleCards - 1; i >= 0; i--) {
        const offset = i * 2;
        const back = this.add
          .image(-offset, -offset, CARD_BACK_KEY)
          .setDisplaySize(cardW, cardH);
        this._deckPileContainer.add(back);
      }
    } else {
      const empty = this.add
        .rectangle(0, 0, cardW, cardH, 0x111820, 0.75)
        .setStrokeStyle(1, 0x334455);
      this._deckPileContainer.add(empty);
    }

    const badge = this.add
      .circle(cardW / 2 - 2, cardH / 2 - 4, 15, 0x000000, 0.85)
      .setStrokeStyle(1, 0x4caf50);
    const countText = this.add
      .text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, cardH / 2 + 18, "BARALHO", {
        fontSize: "10px",
        color: "#7fbf7f",
      })
      .setOrigin(0.5);

    this._deckPileContainer.add([badge, countText, label]);
    this._deckPileContainer.setSize(cardW + 16, cardH + 16);
    // Menu manual do baralho desativado por enquanto. Reative estas linhas para testes manuais:
    // this._deckPileContainer.setInteractive({ useHandCursor: true })
    // this._deckPileContainer.on('pointerdown', () => this._toggleDeckActions())
  }

  _renderOpponentDeckPile() {
    if (this._oppDeckPileContainer) this._oppDeckPileContainer.destroy(true);

    const cardW = 72;
    const cardH = 101;
    const count = this._isSoloMode() ? this.oppDeck.length : this.oppDeckCount;
    const x = 238;
    const y = 118;

    this._oppDeckPileContainer = this.add.container(x, y).setDepth(3);
    const base = this.add
      .rectangle(0, 0, cardW + 10, cardH + 10, 0x07100d, 0.95)
      .setStrokeStyle(1, 0x2a5a2a);
    this._oppDeckPileContainer.add(base);

    if (count > 0 && this.textures.exists(CARD_BACK_KEY)) {
      const visibleCards = Math.min(5, count);
      for (let i = visibleCards - 1; i >= 0; i--) {
        const offset = i * 2;
        this._oppDeckPileContainer.add(
          this.add
            .image(-offset, -offset, CARD_BACK_KEY)
            .setDisplaySize(cardW, cardH),
        );
      }
    } else {
      this._oppDeckPileContainer.add(
        this.add
          .rectangle(0, 0, cardW, cardH, 0x111820, 0.75)
          .setStrokeStyle(1, 0x334455),
      );
    }

    const badge = this.add
      .circle(cardW / 2 - 2, cardH / 2 - 4, 14, 0x000000, 0.85)
      .setStrokeStyle(1, 0x4caf50);
    const countText = this.add
      .text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, cardH / 2 + 15, "DECK OP.", {
        fontSize: "10px",
        color: "#7fbf7f",
      })
      .setOrigin(0.5);
    this._oppDeckPileContainer.add([badge, countText, label]);
  }

  _renderDiscardPile() {
    if (this._discardPileContainer) {
      this._discardPileContainer.destroy(true);
    }

    const { width, height } = this.cameras.main;
    const cardW = 72;
    const cardH = 101;
    const count = this.myDiscard.length;
    const x = width - 238;
    const y = height - 228;
    const topCard = this.myDiscard[count - 1];

    this._discardPileContainer = this.add.container(x, y).setDepth(3);
    const base = this.add
      .rectangle(0, 0, cardW + 10, cardH + 10, 0x130c0c, 0.92)
      .setStrokeStyle(1, 0x6a3434);
    this._discardPileContainer.add(base);

    if (topCard) {
      const key = `card_${topCard.id}`;
      const cardImg = this.textures.exists(key)
        ? this.add.image(0, 0, key).setDisplaySize(cardW, cardH)
        : this.add.rectangle(0, 0, cardW, cardH, topCard.color ?? 0x1a1a2e);
      this._discardPileContainer.add(cardImg);
    } else {
      const empty = this.add
        .rectangle(0, 0, cardW, cardH, 0x111111, 0.72)
        .setStrokeStyle(1, 0x553333);
      this._discardPileContainer.add(empty);
    }

    const badge = this.add
      .circle(cardW / 2 - 2, cardH / 2 - 4, 13, 0x000000, 0.85)
      .setStrokeStyle(1, 0xcc6666);
    const countText = this.add
      .text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, cardH / 2 + 17, "DESCARTE", {
        fontSize: "10px",
        color: "#ff9999",
      })
      .setOrigin(0.5);

    this._discardPileContainer.add([badge, countText, label]);
    this._discardPileContainer.setSize(cardW + 12, cardH + 24);
    this._discardPileContainer.setInteractive({ useHandCursor: true });
    this._discardPileContainer.on("pointerdown", () =>
      this._openDiscardViewer("my"),
    );
  }

  _renderOpponentDiscardPile() {
    if (this._oppDiscardPileContainer)
      this._oppDiscardPileContainer.destroy(true);

    const cardW = 72;
    const cardH = 101;
    const count = this.oppDiscard.length;
    const x = 238;
    const y = 256;
    const topCard = this.oppDiscard[count - 1];

    this._oppDiscardPileContainer = this.add.container(x, y).setDepth(3);
    const base = this.add
      .rectangle(0, 0, cardW + 10, cardH + 10, 0x130c0c, 0.92)
      .setStrokeStyle(1, 0x6a3434);
    this._oppDiscardPileContainer.add(base);

    if (topCard) {
      const key = `card_${topCard.id}`;
      const art = this.textures.exists(key)
        ? this.add.image(0, 0, key).setDisplaySize(cardW, cardH)
        : this.add.rectangle(0, 0, cardW, cardH, topCard.color ?? 0x1a1a2e);
      this._oppDiscardPileContainer.add(art);
    } else {
      this._oppDiscardPileContainer.add(
        this.add
          .rectangle(0, 0, cardW, cardH, 0x111111, 0.72)
          .setStrokeStyle(1, 0x553333),
      );
    }

    const badge = this.add
      .circle(cardW / 2 - 2, cardH / 2 - 4, 13, 0x000000, 0.85)
      .setStrokeStyle(1, 0xcc6666);
    const countText = this.add
      .text(cardW / 2 - 2, cardH / 2 - 4, String(count), {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const label = this.add
      .text(0, cardH / 2 + 14, "DESC. OP.", {
        fontSize: "10px",
        color: "#ff9999",
      })
      .setOrigin(0.5);
    this._oppDiscardPileContainer.add([badge, countText, label]);
    this._oppDiscardPileContainer.setSize(cardW + 12, cardH + 24);
    this._oppDiscardPileContainer.setInteractive({ useHandCursor: true });
    this._oppDiscardPileContainer.on("pointerdown", () =>
      this._openDiscardViewer("opp"),
    );
  }

  _openDiscardViewer(owner) {
    if (this._discardViewer) this._discardViewer.destroy(true);

    const cards = owner === "my" ? this.myDiscard : this.oppDiscard;
    const { width, height } = this.cameras.main;
    const panelW = 640;
    const panelH = 520;
    this._discardViewer = this.add
      .container(width / 2, height / 2)
      .setDepth(130);

    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.55)
      .setInteractive();
    const panel = this.add
      .rectangle(0, 0, panelW, panelH, 0x071018, 0.97)
      .setStrokeStyle(2, 0x6a3434);
    const title = this.add
      .text(
        0,
        -panelH / 2 + 18,
        owner === "my" ? "SEU DESCARTE" : "DESCARTE DO OPONENTE",
        {
          fontSize: "15px",
          color: "#ffffff",
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5);
    const close = this.add
      .text(panelW / 2 - 20, -panelH / 2 + 18, "X", {
        fontSize: "14px",
        color: "#ff7777",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => {
      this._discardViewer.destroy(true);
      this._discardViewer = null;
    });
    this._discardViewer.add([overlay, panel, title, close]);

    if (!cards.length) {
      this._discardViewer.add(
        this.add
          .text(0, 0, "Descarte vazio.", {
            fontSize: "13px",
            color: "#cccccc",
          })
          .setOrigin(0.5),
      );
      return;
    }

    const visible = cards.slice().reverse().slice(0, 18);
    const cols = 6;
    const cardW = 74;
    const cardH = 104;
    const gapX = 24;
    const gapY = 30;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = -totalW / 2 + cardW / 2;
    const startY = -panelH / 2 + 88;

    visible.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const thumb = this._createCardThumbnail(
        card,
        startX + col * (cardW + gapX),
        startY + row * (cardH + gapY),
        cardW,
        cardH,
        0x884444,
      );
      this._discardViewer.add(thumb);
    });
  }

  _createCardThumbnail(card, x, y, w = 78, h = 109, borderColor = 0x4caf50) {
    const container = this.add.container(x, y);
    const key = `card_${card.id}`;
    if (this.textures.exists(key)) {
      container.add(this.add.image(0, 0, key).setDisplaySize(w, h));
    } else {
      const bg = this.add.rectangle(0, 0, w, h, card.color ?? 0x1a1a2e);
      const name = this.add
        .text(0, -h / 2 + 10, card.name ?? card.nome ?? "Carta", {
          fontSize: "8px",
          color: "#ffffff",
          wordWrap: { width: w - 8 },
          align: "center",
        })
        .setOrigin(0.5, 0);
      container.add([bg, name]);
    }

    const border = this.add
      .rectangle(0, 0, w, h, 0x000000, 0)
      .setStrokeStyle(1.5, borderColor);
    container.add(border);
    container.setSize(w, h);
    return container;
  }

  _playDiscardSmoke(owner = "my") {
    const pile =
      owner === "opp"
        ? this._oppDiscardPileContainer
        : this._discardPileContainer;
    if (!pile) return;

    const baseX = pile.x;
    const baseY = pile.y - 34;
    for (let i = 0; i < 14; i++) {
      const puff = this.add
        .circle(
          baseX + this._randInt(-24, 24),
          baseY + this._randInt(-8, 18),
          this._randInt(7, 14),
          0xd6d6d6,
          0.62,
        )
        .setDepth(90);

      this.tweens.add({
        targets: puff,
        x: puff.x + this._randInt(-22, 22),
        y: puff.y - this._randInt(34, 76),
        scale: 1.9,
        alpha: 0,
        duration: this._randInt(620, 980),
        ease: "Sine.easeOut",
        onComplete: () => puff.destroy(),
      });
    }
  }

  _randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _discardTarget(owner = "my") {
    const pile =
      owner === "opp"
        ? this._oppDiscardPileContainer
        : this._discardPileContainer;
    if (pile) return { x: pile.x, y: pile.y };

    const { width, height } = this.cameras.main;
    return owner === "opp"
      ? { x: 238, y: 256 }
      : { x: width - 238, y: height - 228 };
  }

  _refreshDiscardForOwner(owner = "my") {
    if (owner === "opp") {
      this._renderOpponentDiscardPile();
      this._playDiscardSmoke("opp");
      return;
    }

    this._renderDiscardPile();
    this._playDiscardSmoke("my");
  }

  _animateFieldObjectToDiscard(cardObject, owner = "my", options = {}) {
    if (!cardObject) {
      this._refreshDiscardForOwner(owner);
      return;
    }

    const target = this._discardTarget(owner);
    cardObject.disableInteractive?.();
    cardObject.removeAllListeners?.();
    cardObject.setDepth(options.depth ?? 96);

    this.tweens.add({
      targets: cardObject,
      x: target.x,
      y: target.y,
      scale: options.scale ?? 0.72,
      angle: options.angle ?? cardObject.angle + this._randInt(-8, 8),
      alpha: 0.94,
      delay: options.delay ?? 0,
      duration: options.duration ?? 460,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        cardObject.destroy(true);
        this._refreshDiscardForOwner(owner);
        options.onComplete?.();
      },
    });
  }

  _animateCardPreviewToDiscard(card, from, owner = "my", options = {}) {
    this._animateCardPreviewTo(card, from, this._discardTarget(owner), {
      startScale: options.startScale ?? 0.82,
      endScale: options.endScale ?? 0.72,
      depth: options.depth ?? 96,
      duration: options.duration ?? 460,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        this._refreshDiscardForOwner(owner);
        options.onComplete?.();
      },
    });
  }

  _animateFieldObjectVanish(cardObject, options = {}) {
    if (!cardObject) return;
    cardObject.disableInteractive?.();
    cardObject.removeAllListeners?.();
    cardObject.setDepth(options.depth ?? 94);
    this.tweens.add({
      targets: cardObject,
      scale: options.scale ?? 0.42,
      alpha: 0,
      duration: options.duration ?? 320,
      ease: "Sine.easeIn",
      onComplete: () => cardObject.destroy(true),
    });
  }

  _renderOpponentHand() {
    if (this._oppHandContainer) {
      this._oppHandContainer.destroy(true);
    }

    const { width } = this.cameras.main;
    const cardW = 68;
    const cardH = 95;
    const gap = 8;
    const count = this._isSoloMode() ? this.oppHand.length : this.oppHandCount;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (width - totalW) / 2;
    const y = 130;

    this._oppHandContainer = this.add.container(0, 0);
    for (let i = 0; i < count; i++) {
      const x = startX + i * (cardW + gap) + cardW / 2;
      const back = this.textures.exists(CARD_BACK_KEY)
        ? this.add.image(x, y, CARD_BACK_KEY).setDisplaySize(cardW, cardH)
        : this.add.rectangle(x, y, cardW, cardH, 0x111820);
      const border = this.add
        .rectangle(x, y, cardW, cardH, 0x000000, 0)
        .setStrokeStyle(1, 0x556070);
      this._oppHandContainer.add([back, border]);
    }
  }

  _toggleDeckActions() {
    this._deckActionsOpen = !this._deckActionsOpen;
    if (this._deckActionsOpen) {
      this._renderDeckActions();
    } else {
      this._clearDeckActions();
    }
  }

  _clearDeckActions() {
    if (this._deckActionsContainer) {
      this._deckActionsContainer.destroy(true);
      this._deckActionsContainer = null;
    }
  }

  _closeDeckActionsSmooth(onComplete = null) {
    if (!this._deckActionsContainer) {
      onComplete?.();
      return;
    }

    const menu = this._deckActionsContainer;
    this._deckActionsOpen = false;
    menu.disableInteractive?.();
    this.tweens.add({
      targets: menu,
      alpha: 0,
      x: menu.x - 10,
      duration: 140,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (this._deckActionsContainer === menu) {
          this._deckActionsContainer.destroy(true);
          this._deckActionsContainer = null;
        }
        onComplete?.();
      },
    });
  }

  _renderDeckActions() {
    this._clearDeckActions();

    const x = this._deckPileContainer.x - 122;
    const y = this._deckPileContainer.y - 92;
    const actions = [
      { label: "COMPRAR", fn: () => this._drawCard() },
      { label: "EMBARALHAR", fn: () => this._shuffleDeck() },
      { label: "DESCARTAR", fn: () => this._discardTop() },
      { label: "EXILAR", fn: () => this._exileTop() },
      { label: "VER BARALHO", fn: () => this._viewDeck() },
      { label: "REVELAR TOP", fn: () => this._revealTop() },
    ];

    this._deckActionsContainer = this.add.container(x, y).setDepth(30);
    actions.forEach((action, i) => {
      const btn = this.add
        .text(0, i * 28, action.label, {
          fontSize: "11px",
          color: "#ffffff",
          backgroundColor: "#162337",
          padding: { x: 10, y: 5 },
          fixedWidth: 104,
          align: "center",
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#22405f" }));
      btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#162337" }));
      btn.on("pointerdown", () => this._closeDeckActionsSmooth(action.fn));
      this._deckActionsContainer.add(btn);
    });
  }

  _renderHand(cards) {
    this._clearMagnifier();
    this._clearCardActionMenu();
    this._clearSummonZones();
    this._clearAttachmentTargets();
    this._clearSpecialSummonTargets();
    this._clearGenericSlotChoice();
    this._pendingSummonCard = null;
    this._pendingAttachmentCard = null;
    this._pendingHandAbilityCard = null;
    this._pendingHandAbility = null;
    this._pendingSpecialSummon = null;
    this._handContainers.forEach((card) => card.destroy(true));
    this._handContainers = [];

    const { width, height } = this.cameras.main;
    const y = height - 65;
    const positions = this._handPositions(cards.length);

    cards.forEach((cardData, i) => {
      this._handContainers.push(
        this._createCardObject(cardData, positions[i], y, true),
      );
    });
  }

  _handPositions(count) {
    const { width } = this.cameras.main;
    const cardW = 80;
    const gap = 10;
    const totalW = count * cardW + Math.max(0, count - 1) * gap;
    const startX = (width - totalW) / 2;

    return Array.from(
      { length: count },
      (_, i) => startX + i * (cardW + gap) + cardW / 2,
    );
  }

  _showMagnifier(cardObject) {
    this._clearCardActionMenu();
    this._clearMagnifier();

    const cardData = cardObject.getData("cardData");
    const bounds = cardObject.getBounds?.();
    const x = bounds?.centerX ?? cardObject.x;
    const y = bounds?.centerY ?? cardObject.y;
    this._magnifierButton = this.add
      .container(x, y)
      .setDepth(35);
    const bg = this.add
      .circle(0, 0, 18, 0x000000, 0.78)
      .setStrokeStyle(2, 0xffffff);
    const icon = this.add
      .text(0, -1, "🔍", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this._magnifierButton.add([bg, icon]);
    this._magnifierButton.setSize(36, 36);
    this._magnifierButton.setInteractive({ useHandCursor: true });
    this._magnifierButton.setData("floatingMenuControl", true);
    this._magnifierButton.on(
      "pointerdown",
      (pointer, localX, localY, event) => {
        event?.stopPropagation();
        this._openCardInspectPanel(cardData);
        this._clearMagnifier();
      },
    );
  }

  _handleCardClick(cardObject) {
    if (cardObject.getData("source") === "field" && this._pendingSlotChoice) {
      const mySlot = this._slotsMy.find((s) => s.cardObject === cardObject);
      if (mySlot) {
        this._selectGenericSlotChoice("my", this._slotsMy.indexOf(mySlot));
        return;
      }
      const oppSlot = this._slotsOpp.find((s) => s.cardObject === cardObject);
      if (oppSlot) {
        this._selectGenericSlotChoice("opp", this._slotsOpp.indexOf(oppSlot));
        return;
      }
    }

    if (cardObject.getData("source") === "field" && this._pendingAttackSlot) {
      const oppSlot = this._slotsOpp.find((s) => s.cardObject === cardObject);
      if (oppSlot) {
        this._selectAttackTarget("opp", this._slotsOpp.indexOf(oppSlot));
        return;
      }
    }

    if (
      cardObject.getData("source") === "field" &&
      this._pendingSpecialSummon
    ) {
      const slot = this._slotsMy.find((s) => s.cardObject === cardObject);
      if (slot)
        this._selectSpecialSummonTarget("my", this._slotsMy.indexOf(slot));
      return;
    }

    if (cardObject.getData("source") === "field" && this._pendingCommandCard) {
      const slot = this._slotsMy.find((s) => s.cardObject === cardObject);
      if (slot) this._selectCommandTarget("my", this._slotsMy.indexOf(slot));
      return;
    }

    if (
      cardObject.getData("source") === "field" &&
      this._attachPendingToTarget(cardObject)
    ) {
      return;
    }
    this._showCardActions(cardObject);
  }

  _clearMagnifier() {
    if (this._magnifierButton) {
      this._magnifierButton.destroy(true);
      this._magnifierButton = null;
    }
  }

  _showCardActions(cardObject) {
    this._clearCardActionMenu();
    this._clearMagnifier();
    this._clearAttachmentReplaceChoice();
    this._clearSummonZones();
    this._clearAttachmentTargets();
    this._clearSpecialSummonTargets();
    this._cancelGenericSlotChoice();
    this._clearCommandTargets();
    this._clearAbilityTargets();
    this._pendingAttachmentCard = null;
    this._pendingCommandCard = null;
    this._pendingCommandEffect = null;
    this._pendingAbilityEffect = null;
    this._pendingAbilitySourceSlot = null;
    this._pendingAbilitySource = null;
    this._pendingHandAbilityCard = null;
    this._pendingHandAbility = null;
    this._pendingSpecialSummon = null;
    this._pendingSlotChoice = null;
    this._pendingAttackSlot = null;
    this._clearAttackTargets();

    const card = cardObject.getData("cardData");
    const source = cardObject.getData("source");
    const isMyFieldCard =
      source === "field" &&
      this._slotsMy.some((slot) => slot.cardObject === cardObject);
    const actions = [
      {
        label: "LUPA",
        color: "#22405f",
        fn: () => this._openCardInspectPanel(card),
      },
    ];
    if (source === "hand") {
      if (this._mustDiscardBeforeDraw && this.myHand.length >= MAX_HAND_SIZE) {
        actions.push({
          label: "DESCARTAR",
          color: "#7a2323",
          fn: () => this._discardFromHand(cardObject),
        });
      }
      const handAbilities = this._handCreatureAbilities(cardObject);
      if (handAbilities.length) {
        actions.unshift({
          label: "ATIVAR",
          color: "#8a4a12",
          fn: () => this._activateHandCreatureAbility(cardObject),
        });
      }
      if (
        card.card_type === "criatura" &&
        this._canUseMainAction("summon") &&
        this._canNormalSummonCard(card)
      ) {
        actions.unshift({
          label: "INVOCAR",
          color: "#1b5e20",
          fn: () => this._startSummonSelection(cardObject),
        });
      } else if (card.card_type === "comando") {
        actions.unshift({
          label: "ATIVAR",
          color: "#8a4a12",
          fn: () => this._activateCommand(cardObject),
        });
      } else if (
        card.card_type === "cenario" &&
        this._canUseMainAction("scenario")
      ) {
        actions.unshift({
          label: "ATIVAR",
          color: "#1f6f5b",
          fn: () => this._activateScenario(cardObject),
        });
      } else if (
        this._isAttachmentCard(card) &&
        this._canUseMainAction("attach") &&
        this._attachmentTargets(card).length
      ) {
        actions.unshift({
          label: "ANEXAR",
          color: "#6a3d9a",
          fn: () => this._startAttachmentSelection(cardObject),
        });
      }
    } else if (source === "field" && isMyFieldCard) {
      if (this._fieldCreatureAbilities(cardObject).length) {
        actions.unshift({
          label: "ATIVAR",
          color: "#8a4a12",
          fn: () => this._activateFieldCreatureAbility(cardObject),
        });
      }
      if (this._canAttackWith(cardObject)) {
        actions.unshift({
          label: "ATACAR",
          color: "#9a2f22",
          fn: () => this._startAttack(cardObject),
        });
      }
    } else if (
      source === "attachment" &&
      this._activatableAbilities(cardObject).length
    ) {
      actions.unshift({
        label: "ATIVAR",
        color: "#8a4a12",
        fn: () => this._openAbilityElementChoice(cardObject),
      });
    }

    this._cardActionMenu = this.add
      .container(cardObject.x, cardObject.y - 72)
      .setDepth(38);
    actions.forEach((action, i) => {
      const btn = this.add
        .text((i - (actions.length - 1) / 2) * 78, 0, action.label, {
          fontSize: "11px",
          color: "#ffffff",
          backgroundColor: action.color,
          padding: { x: 10, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.setData("floatingMenuControl", true);
      btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#2f6f8f" }));
      btn.on("pointerout", () =>
        btn.setStyle({ backgroundColor: action.color }),
      );
      btn.on("pointerdown", () => {
        this._clearCardActionMenu();
        action.fn();
      });
      this._cardActionMenu.add(btn);
    });
  }

  _isMyMainPhase() {
    return (
      this._activePlayer === "my" &&
      this._currentPhase === "main" &&
      !this._gameOver
    );
  }

  _isMyBattlePhase() {
    return (
      this._activePlayer === "my" &&
      this._currentPhase === "battle" &&
      !this._gameOver
    );
  }

  _canUseMainAction(type) {
    const ruleType = ANEXOS_LIVRES && type === "attach" ? "free_attach" : type;
    const allowed = canUseMainAction(
      {
        activePlayer: this._activePlayer,
        currentPhase: this._currentPhase,
        gameOver: this._gameOver,
        turnActions: this._turnActions,
      },
      ruleType,
    );

    if (!allowed) return false;
    if (ANEXOS_LIVRES && type === "scenario") {
      return !this._turnActions.scenario;
    }
    return true;
  }

  _canAttackWith(cardObject) {
    const slot = this._slotsMy.find((s) => s.cardObject === cardObject);
    return canCreatureAttack(
      {
        activePlayer: this._activePlayer,
        currentPhase: this._currentPhase,
        gameOver: this._gameOver,
        turnNumber: this._turnNumber,
        actor: "my",
      },
      slot?.card,
    );
  }

  _startAttack(cardObject) {
    const slot = this._slotsMy.find((s) => s.cardObject === cardObject);
    if (!slot?.card || !this._canAttackWith(cardObject)) {
      this._toast("Esta criatura não pode atacar agora.");
      return;
    }

    if (ATAQUE_DIRETO_POR_COLUNA) {
      const targetSlot = this._opposingColumnSlot(slot, "my");
      this._clearBattleAttackButtons();

      if (!targetSlot?.card) {
        this._animateAttackMotion(
          slot,
          this._directAttackTargetPoint("opp"),
          () => this._resolveDirectAttack(slot),
        );
        return;
      }

      if (!this._canBeAttackTarget(targetSlot, slot)) {
        this._toast(`${targetSlot.card.name} não pode ser alvo de ataques neste turno.`);
        this._renderBattleAttackButtons();
        return;
      }

      this._animateAttackMotion(slot, targetSlot, () => {
        this._resolveCreatureAttack(slot, targetSlot);
        this._renderBattleAttackButtons();
      });
      return;
    }

    const enemyCreatures = this._slotsOpp.filter((s) => s.card);
    const validTargets = enemyCreatures.filter((s) =>
      this._canBeAttackTarget(s, slot),
    );
    if (!enemyCreatures.length) {
      this._clearBattleAttackButtons();
      this._animateAttackMotion(
        slot,
        this._directAttackTargetPoint("opp"),
        () => this._resolveDirectAttack(slot),
      );
      return;
    }
    if (!validTargets.length) {
      this._toast("Não há alvos válidos para atacar.");
      return;
    }

    this._clearBattleAttackButtons();
    this._pendingAttackSlot = slot;
    this._highlightAttackTargets(validTargets);
    this._toast("Escolha a criatura inimiga alvo.");
  }

  _canBeAttackTarget(slot, attackerSlot = null) {
    if (!slot?.card) return false;
    if ((slot.card.cannotBeAttackTargetUntilTurn ?? 0) >= this._turnNumber) {
      return false;
    }

    const attackerLife = Number(
      attackerSlot?.card?.currentStats?.defense ?? attackerSlot?.card?.defense ?? 0,
    );
    return !(slot.attachments ?? []).some((attachment) =>
      (attachment.card?.effects ?? []).some(
        (effect) =>
          effect.type === "cannot_be_attacked_by_creatures_with_min_defense" &&
          attackerLife >= Number(effect.min_defense ?? 3),
      ),
    );
  }

  _opposingColumnSlot(attackerSlot, attackerSide) {
    const attackers = attackerSide === "my" ? this._slotsMy : this._slotsOpp;
    const defenders = attackerSide === "my" ? this._slotsOpp : this._slotsMy;
    const column = attackers.indexOf(attackerSlot);
    return column >= 0 ? defenders[column] : null;
  }

  _renderBattleAttackButtons() {
    this._clearBattleAttackButtons();
    if (!this._isMyBattlePhase()) return;

    let attackCount = 0;
    this._slotsMy.forEach((slot) => {
      if (!slot.cardObject || !this._canAttackWith(slot.cardObject)) return;
      attackCount += 1;

      const btn = this.add
        .container(slot.x, slot.y - slot.h / 2 - 18)
        .setDepth(42);
      const bg = this.add
        .rectangle(0, 0, 92, 28, 0x8a2418, 0.95)
        .setStrokeStyle(1, 0xffc0a8);
      const label = this.add
        .text(0, 0, "⚔ ATACAR", {
          fontSize: "11px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      btn.add([bg, label]);
      btn.setSize(92, 28);
      btn.setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => bg.setFillStyle(0xb83222, 0.98));
      btn.on("pointerout", () => bg.setFillStyle(0x8a2418, 0.95));
      btn.on("pointerdown", () => this._startAttack(slot.cardObject));
      this._battleAttackButtons.push(btn);
    });

    this._updatePhaseButtonGlow(attackCount === 0);
  }

  _clearBattleAttackButtons() {
    this._battleAttackButtons?.forEach((button) => button.destroy(true));
    this._battleAttackButtons = [];
    this._updatePhaseButtonGlow(false);
  }

  _updatePhaseButtonGlow(shouldGlow) {
    if (!this._phaseButton) return;
    if (this._activePlayer !== "my" || !this._phaseButton.visible)
      shouldGlow = false;

    if (!shouldGlow) {
      if (this._phaseButtonGlow) {
        this.tweens.killTweensOf(this._phaseButtonGlow);
        this._phaseButtonGlow.destroy();
        this._phaseButtonGlow = null;
      }
      this.tweens.killTweensOf(this._phaseButton);
      this._phaseButton.setAlpha(1).setScale(1);
      return;
    }

    if (this._phaseButtonGlow) return;

    const bounds = this._phaseButton.getBounds();
    this._phaseButtonGlow = this.add
      .rectangle(
        bounds.centerX,
        bounds.centerY,
        bounds.width + 18,
        bounds.height + 14,
        0x000000,
        0,
      )
      .setStrokeStyle(3, 0xffdd44)
      .setDepth(this._phaseButton.depth - 1);

    this.tweens.add({
      targets: [this._phaseButtonGlow, this._phaseButton],
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0.48,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  _highlightAttackTargets(targets) {
    this._clearAttackTargets();
    targets.forEach((slot) => {
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, 0xff3333)
        .setDepth(7);
      slot.attackHighlight = highlight;
      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.38,
        duration: 340,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  _clearAttackTargets() {
    this._slotsOpp?.forEach((slot) => {
      if (!slot.attackHighlight) return;
      this.tweens.killTweensOf(slot.attackHighlight);
      slot.attackHighlight.destroy();
      slot.attackHighlight = null;
    });
  }

  _selectAttackTarget(side, slotIndex) {
    if (!this._pendingAttackSlot || side !== "opp") return;
    const targetSlot = this._slotsOpp[slotIndex];
    if (!targetSlot?.card) return;

    if (ATAQUE_DIRETO_POR_COLUNA) {
      const columnTarget = this._opposingColumnSlot(this._pendingAttackSlot, "my");
      if (targetSlot !== columnTarget) {
        this._toast("Nesta regra, a criatura só pode atacar a coluna à sua frente.");
        return;
      }
    }

    if (!this._canBeAttackTarget(targetSlot, this._pendingAttackSlot)) {
      this._toast(
        `${targetSlot.card.name} não pode ser alvo de ataques neste turno.`,
      );
      return;
    }

    const attackerSlot = this._pendingAttackSlot;
    this._pendingAttackSlot = null;
    this._clearAttackTargets();
    this._clearBattleAttackButtons();
    this._animateAttackMotion(attackerSlot, targetSlot, () => {
      this._resolveCreatureAttack(attackerSlot, targetSlot);
      this._renderBattleAttackButtons();
    });
  }

  _directAttackTargetPoint(side) {
    const { width, height } = this.cameras.main;
    if (side === "opp") return { x: width / 2, y: 150 };
    return { x: width / 2, y: height - 150 };
  }

  _animateAttackMotion(attackerSlot, targetPoint, onImpact) {
    const cardObject = attackerSlot?.cardObject;
    if (!cardObject) {
      onImpact?.();
      return;
    }

    const start = { x: cardObject.x, y: cardObject.y };
    const originalScale = cardObject.scale;
    const originalDepth = cardObject.depth;
    cardObject.disableInteractive?.();
    cardObject.setDepth(80);

    this.tweens.add({
      targets: cardObject,
      x: targetPoint.x,
      y: targetPoint.y,
      scale: originalScale * 1.08,
      duration: 240,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.cameras.main.shake(120, 0.006);
        this.tweens.add({
          targets: cardObject,
          x: start.x,
          y: start.y,
          scale: originalScale,
          duration: 300,
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (!cardObject.scene) return;
            cardObject.setDepth(originalDepth || 8);
            cardObject.setInteractive({ useHandCursor: true });
            onImpact?.();
          },
        });
      },
    });
  }

  _updateDirectDamageHeader() {
    if (this._directDamageTextMy)
      this._directDamageTextMy.setText(`Dano: ${this._directDamage.my}/5`);
    if (this._directDamageTextOpp)
      this._directDamageTextOpp.setText(`Dano: ${this._directDamage.opp}/5`);
  }

  _resolveDirectAttack(attackerSlot) {
    const attacker = attackerSlot.card;
    const damage = attacker.currentStats?.attack ?? attacker.attack ?? 0;
    attacker.hasAttackedTurn = this._turnNumber;
    this._resolveAttachedCreatureAttackTriggers(attackerSlot, "my");
    this._directDamage.opp += damage;
    this._recordDamage(attacker, null, damage);

    while (this._directDamage.opp >= 5) {
      this._directDamage.opp -= 5;
      this._addScore("my", 1);
    }
    this._updateDirectDamageHeader();

    this._toast(`${attacker.name} causou ${damage} de dano direto.`);
    this._logAction(`${attacker.name} causou ${damage} de dano direto.`);
    this._renderBattleAttackButtons();
  }

  _resolveOpponentDirectAttack(attackerSlot) {
    const attacker = attackerSlot.card;
    const damage = attacker.currentStats?.attack ?? attacker.attack ?? 0;
    attacker.hasAttackedTurn = this._turnNumber;
    this._resolveAttachedCreatureAttackTriggers(attackerSlot, "opp");
    this._directDamage.my += damage;
    this._recordDamage(attacker, null, damage);

    while (this._directDamage.my >= 5) {
      this._directDamage.my -= 5;
      this._addScore("opp", 1);
    }
    this._updateDirectDamageHeader();

    this._toast(`${attacker.name} causou ${damage} de dano direto.`);
    this._logAction(
      `${attacker.name} causou ${damage} de dano direto ao jogador.`,
    );
  }

  _resolveCreatureAttack(attackerSlot, defenderSlot) {
    this._resolveCreatureBattle(
      attackerSlot,
      this._slotsMy,
      defenderSlot,
      this._slotsOpp,
    );
  }

  _resolveOpponentCreatureAttack(attackerSlot, defenderSlot) {
    this._resolveCreatureBattle(
      attackerSlot,
      this._slotsOpp,
      defenderSlot,
      this._slotsMy,
    );
  }

  _resolveCreatureBattle(
    attackerSlot,
    attackerSlots,
    defenderSlot,
    defenderSlots,
  ) {
    const attacker = attackerSlot.card;
    const defender = defenderSlot.card;
    const defenderLifeBefore = Number(
      defender.currentStats?.defense ?? defender.defense ?? 0,
    );
    const atkDamage = this._combatDamageAfterReduction(
      defenderSlot,
      defenderSlots,
      attacker.currentStats?.attack ?? attacker.attack ?? 0,
    );
    const defDamage = this._combatDamageAfterReduction(
      attackerSlot,
      attackerSlots,
      defender.currentStats?.attack ?? defender.attack ?? 0,
    );

    attacker.hasAttackedTurn = this._turnNumber;
    const attackTriggerAttachments = [...(attackerSlot.attachments ?? [])];
    defender.damageTaken = (defender.damageTaken ?? 0) + atkDamage;
    attacker.damageTaken = (attacker.damageTaken ?? 0) + defDamage;
    this._recordDamage(attacker, defender, atkDamage);
    this._recordDamage(defender, attacker, defDamage);

    this._refreshBattleDamage(attackerSlot, attackerSlots, defenderSlot);
    this._refreshBattleDamage(defenderSlot, defenderSlots, attackerSlot);
    this._resolveAttachedCreatureAttackTriggers(
      attackerSlot,
      attackerSlots === this._slotsMy ? "my" : "opp",
      attackTriggerAttachments,
    );
    const overflowDamage = this._hasAttachedKeyword(attackerSlot, "atropelar")
      ? Math.max(0, atkDamage - defenderLifeBefore)
      : 0;
    if (overflowDamage > 0) {
      this._applyOverflowDirectDamage(attackerSlots, attacker, overflowDamage);
    }
    this._toast(`${attacker.name} atacou ${defender.name}.`);
    this._logAction(`${attacker.name} atacou ${defender.name}.`);
    if (attackerSlots === this._slotsMy) this._renderBattleAttackButtons();
  }

  _hasAttachedKeyword(slot, keyword) {
    return (slot?.attachments ?? []).some((attachment) =>
      (attachment.card?.effects ?? []).some(
        (effect) => effect.type === "grant_keyword" && effect.keyword === keyword,
      ),
    );
  }

  _applyOverflowDirectDamage(attackerSlots, attacker, damage) {
    const target = attackerSlots === this._slotsMy ? "opp" : "my";
    const scoringPlayer = target === "opp" ? "my" : "opp";
    this._directDamage[target] += damage;
    while (this._directDamage[target] >= 5) {
      this._directDamage[target] -= 5;
      this._addScore(scoringPlayer, 1);
    }
    this._updateDirectDamageHeader();
    this._toast(`${attacker.name} atropelou e causou ${damage} de dano direto.`);
    this._logAction(`${attacker.name} causou ${damage} de dano excedente por Atropelar.`);
  }

  _refreshBattleDamage(slot, ownerSlots, destroyerSlot = null) {
    if (!slot?.card) return;
    recalculateCreatureStats(
      slot.card,
      slot.attachments.map((entry) => entry.card),
      {
        yourField: ownerSlots,
      },
    );
    this._refreshFieldStatsOverlay(slot);
    if ((slot.card.currentStats?.defense ?? 1) <= 0) {
      this._destroyCreatureInBattle(
        slot,
        ownerSlots === this._slotsMy ? "my" : "opp",
        destroyerSlot,
      );
    }
  }

  _destroyCreatureInBattle(slot, owner, destroyerSlot = null, options = {}) {
    const card = slot.card;
    if (!card) return;
    const cardObject = slot.cardObject;
    const attachments = [...(slot.attachments ?? [])];
    const slotIndex =
      owner === "my"
        ? this._slotsMy.indexOf(slot)
        : this._slotsOpp.indexOf(slot);

    this._playBattleDestroyEffect(slot.x, slot.y);
    const pointsTo = owner === "my" ? "opp" : "my";
    this._addScore(pointsTo, this._pointsForRarity(card));
    this._resolveDestroyedByCreatureTriggers(card, destroyerSlot);

    const discard = owner === "my" ? this.myDiscard : this.oppDiscard;
    if (!card.isToken) {
      discard.push(card);
      this._animateFieldObjectToDiscard(cardObject, owner);
    } else {
      this._animateFieldObjectVanish(cardObject);
    }
    attachments.forEach((attachment, index) => {
      if (attachment.card) discard.push(attachment.card);
      this._notifyAttachmentSentToDiscard(attachment.card, owner, { battle: true });
      this._animateFieldObjectToDiscard(attachment.object, owner, {
        delay: 80 + index * 70,
        scale: 0.58,
      });
    });
    slot.card = null;
    slot.cardObject = null;
    slot.attachments = [];
    if (!card.isToken) {
      this._resolveCreatureSentToDiscard(card, owner);
      this._notifyCardSentToDiscard(card, owner);
      this._resolveScenarioBattleDestroyedTriggers(card, owner, destroyerSlot);
    }
    this._recalculateAllFieldCreatures();
    this._logAction(
      card.isToken
        ? `${card.name} desapareceu em batalha.`
        : `${card.name} foi destruida em batalha.`,
    );

    if (options.sync !== false && !this._isSoloMode() && slotIndex >= 0) {
      this._sendAction("field_destroyed", {
        owner,
        slot: slotIndex,
        card_id: card.id,
      });
    }
  }

  _resolveScenarioBattleDestroyedTriggers(destroyedCard, destroyedOwner, destroyerSlot = null) {
    if (!this._myScenario?.effects?.length) return;

    for (const effect of this._myScenario.effects) {
      if (effect.type !== "draw_on_first_enemy_battle_destroyed") continue;
      if (effect.targetOwner === "enemy" && destroyedOwner !== "opp") continue;
      if (effect.requiresYourCreature && !this._hasYourCreatureMatching(effect.requiresYourCreature)) {
        continue;
      }

      const flagKey = `${this._myScenario.id}:${effect.type}`;
      if (effect.oncePerTurn && this._scenarioTurnFlags[flagKey]) continue;
      this._scenarioTurnFlags[flagKey] = true;

      const count = Math.max(1, Number(effect.value) || 1);
      if (!this.myDeck.length) {
        this._toast(`${this._myScenario.name} ativou, mas seu baralho está vazio.`);
        this._logAction(`${this._myScenario.name} ativou sem carta para comprar.`);
        continue;
      }

      this._animateDrawCardsFromDeck(Math.min(count, this.myDeck.length));
      this._toast(`${this._myScenario.name}: você comprou ${count} carta.`);
      this._logAction(
        `${this._myScenario.name} ativou quando ${destroyedCard.name} foi destruida em batalha.`,
      );
    }
  }

  _hasYourCreatureMatching(rule = {}) {
    return this._slotsMy.some((slot) => {
      const card = slot.card;
      if (!card) return false;
      if (rule.name && String(card.name ?? card.nome) !== String(rule.name)) return false;
      if (rule.race && (card.race ?? card.raca) !== rule.race) return false;
      if (rule.element && (card.element ?? card.elemento) !== rule.element) return false;
      return true;
    });
  }

  _playBattleDestroyEffect(x, y) {
    const fx = this.add.container(x, y).setDepth(120);
    const stain = this.add.circle(0, 2, 28, 0x7a0000, 0.62);
    const skull = this.add
      .text(0, -8, "☠", {
        fontSize: "42px",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#2a0000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const splash = this.add.circle(0, 8, 12, 0xbb0000, 0.72);
    fx.add([stain, splash, skull]);

    const drops = [
      { x: -22, y: 2, tx: -48, ty: 28, r: 5 },
      { x: 22, y: 4, tx: 46, ty: 24, r: 4 },
      { x: -8, y: 20, tx: -16, ty: 52, r: 4 },
      { x: 14, y: 20, tx: 22, ty: 50, r: 3 },
      { x: 0, y: -16, tx: 4, ty: -40, r: 3 },
    ];

    drops.forEach((drop) => {
      const blood = this.add.circle(drop.x, drop.y, drop.r, 0xb10000, 0.9);
      fx.add(blood);
      this.tweens.add({
        targets: blood,
        x: drop.tx,
        y: drop.ty,
        alpha: 0,
        scale: 0.35,
        duration: 620,
        ease: "Quad.easeOut",
      });
    });

    this.tweens.add({
      targets: skull,
      y: -22,
      scale: 1.18,
      duration: 180,
      yoyo: true,
      ease: "Back.easeOut",
    });

    this.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.22,
      delay: 520,
      duration: 420,
      ease: "Sine.easeIn",
      onComplete: () => fx.destroy(true),
    });
  }

  _combatDamageAfterReduction(targetSlot, ownerSlots, incoming) {
    let damage = Math.max(0, Number(incoming) || 0);
    if (!targetSlot?.card || damage <= 0) return damage;

    for (const sourceSlot of ownerSlots ?? []) {
      const source = sourceSlot.card;
      if (!source) continue;

      for (const effect of source.effects ?? []) {
        if (effect.type !== "reduce_combat_damage_taken") continue;
        if (
          effect.target === "other_your_creatures" &&
          source.instanceId === targetSlot.card.instanceId
        )
          continue;
        if (!matchesCreatureRule(targetSlot.card, effect.filter ?? {}))
          continue;
        damage = Math.max(0, damage - (Number(effect.value) || 0));
      }
    }

    return damage;
  }

  _pointsForRarity(card) {
    return pointsForRarity(card);
  }

  _addScore(player, amount) {
    if (!amount || this._gameOver) return;
    this._score[player] = Math.min(MAX_SCORE, this._score[player] + amount);
    this._renderScoreDots();
    this._notifyScore(player, amount);
    this._logAction(
      `${player === "my" ? "Voce" : "Oponente"} marcou ${amount} ponto(s).`,
    );
    if (this._score[player] >= MAX_SCORE) this._finishGame(player);
  }

  _notifyScore(player, amount) {
    const { width, height } = this.cameras.main;
    const text =
      player === "my"
        ? `VOCE MARCOU ${amount} PONTO(S)`
        : `OPONENTE MARCOU ${amount} PONTO(S)`;
    const color = player === "my" ? "#d8ff66" : "#ff6666";

    const notice = this.add.container(width / 2, height / 2 - 96).setDepth(125);
    const bg = this.add
      .rectangle(0, 0, 620, 74, 0x100707, 0.9)
      .setStrokeStyle(3, player === "my" ? 0xd8ff66 : 0xff3333);
    const label = this.add
      .text(0, 0, text, {
        fontSize: "28px",
        color,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    notice.add([bg, label]);
    notice.setScale(0.76);
    this.tweens.add({
      targets: notice,
      scale: 1.06,
      duration: 140,
      yoyo: true,
      hold: 760,
      ease: "Back.easeOut",
      onComplete: () => notice.destroy(true),
    });
  }

  _renderScoreDots() {
    this._scoreDotsMy?.forEach((dot, i) => {
      dot.setFillStyle(i < this._score.my ? 0x4caf50 : 0x777777);
      dot.setStrokeStyle(
        i < this._score.my ? 2 : 1,
        i < this._score.my ? 0xd8ff66 : 0xaaaaaa,
      );
    });
    this._scoreDotsOpp?.forEach((dot, i) => {
      dot.setFillStyle(i < this._score.opp ? 0xdd4444 : 0x777777);
      dot.setStrokeStyle(
        i < this._score.opp ? 2 : 1,
        i < this._score.opp ? 0xffcccc : 0xaaaaaa,
      );
    });
    this._pulseLatestScoreDot("my");
    this._pulseLatestScoreDot("opp");
  }

  _pulseLatestScoreDot(player) {
    const score = this._score[player];
    if (!score) return;
    const dots = player === "my" ? this._scoreDotsMy : this._scoreDotsOpp;
    const dot = dots?.[score - 1];
    if (!dot) return;

    const glow = this.add
      .circle(dot.x, dot.y, 12, player === "my" ? 0xd8ff66 : 0xff5555, 0.28)
      .setDepth(dot.depth - 1);
    this.tweens.add({
      targets: [dot, glow],
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: 0,
      duration: 520,
      ease: "Cubic.easeOut",
      onComplete: () => {
        dot.setScale(1);
        dot.setAlpha(1);
        glow.destroy();
      },
    });
  }

  _finishGame(winner) {
    this._gameOver = true;
    this._finishRemoteRoom();
    this._showTurnBanner(winner === "my" ? "VITORIA!" : "DERROTA!");
    this._toast(
      winner === "my"
        ? "Você conquistou 3 pontos."
        : "O oponente conquistou 3 pontos.",
    );
    this._logAction(winner === "my" ? "Vitoria." : "Derrota.");
    this.time.delayedCall(1400, () => {
      clearScene();
      this.scene.start("StatusGameScene", {
        result: winner === "my" ? "victory" : "defeat",
        winnerName: winner === "my" ? "Jogador 1" : "Jogador 2",
        score: this._score,
        logs: this._actionLogs,
        stats: this._matchStats,
      });
    });
  }

  _recordDamage(source, target, amount) {
    const damage = Number(amount) || 0;
    if (!source || damage <= 0) return;

    const sourceName = source.name ?? source.nome ?? "Carta";
    this._matchStats.damageDealt[sourceName] =
      (this._matchStats.damageDealt[sourceName] ?? 0) + damage;

    if (target) {
      const targetName = target.name ?? target.nome ?? "Carta";
      this._matchStats.damageReceived[targetName] =
        (this._matchStats.damageReceived[targetName] ?? 0) + damage;
    }
  }

  _recordPlayedCard(card) {
    if (!card?.id) return;
    if (!Array.isArray(this._matchStats.playedCards))
      this._matchStats.playedCards = [];
    this._matchStats.playedCards.push({
      id: card.id,
      name: card.name ?? card.nome,
      card_type: card.card_type,
    });
  }

  _clearCardActionMenu() {
    if (this._cardActionMenu) {
      this._cardActionMenu.destroy(true);
      this._cardActionMenu = null;
    }
  }

  _clearAttachmentReplaceChoice() {
    if (this._replaceAttachmentMenu) {
      this._replaceAttachmentMenu.destroy(true);
      this._replaceAttachmentMenu = null;
    }
  }

  _isFloatingMenuPointerTarget(gameObject) {
    return Boolean(
      gameObject?.getData?.("floatingMenuControl") ||
      gameObject?.getData?.("cardData") ||
      gameObject === this._magnifierButton,
    );
  }

  _handleBoardPointerDown(pointer, currentlyOver = []) {
    const targets = Array.isArray(currentlyOver) ? currentlyOver : [];
    if (targets.some((target) => this._isFloatingMenuPointerTarget(target)))
      return;

    this._clearCardActionMenu();
    this._clearMagnifier();
    this._clearAttachmentReplaceChoice();
  }

  _startSummonSelection(cardObject) {
    if (!this._canUseMainAction("summon")) {
      this._toast("Você já invocou neste turno.");
      return;
    }
    const card = cardObject.getData("cardData");
    if (card?.summonRule?.normal === false) {
      this._toast(`${card.name} não pode ser invocada normalmente.`);
      return;
    }
    if (!this._slotsMy.some((slot) => !slot.card)) {
      this._toast("Não há zonas vazias para invocar.");
      return;
    }
    this._pendingSummonCard = cardObject;
    this._highlightSummonZones();
    this._toast("Escolha uma zona vazia para invocar.");
  }

  _canNormalSummonCard(card) {
    return canNormalSummon(card);
  }

  _handCreatureAbilities(cardObject) {
    const card = cardObject.getData("cardData");
    if (card?.card_type !== "criatura") return [];
    const sourceIndex = this._handContainers.indexOf(cardObject);

    return (card.activatedAbilities ?? []).filter((ability) => {
      if (ability.source !== "hand") return false;
      if (ability.action?.type === "special_summon_over_your_creature") {
        return (
          this._hasSpecialSummonCandidate(
            sourceIndex,
            ability.action.filter ?? {},
          ) && this._slotsMy.some((slot) => slot.card)
        );
      }
      return false;
    });
  }

  _hasSpecialSummonCandidate(sourceIndex, filter) {
    if (sourceIndex < 0) return false;
    return this.myHand.some(
      (card, index) =>
        index !== sourceIndex &&
        card.card_type === "criatura" &&
        this._matchesCardRule(card, filter),
    );
  }

  _activateHandCreatureAbility(cardObject) {
    const ability = this._handCreatureAbilities(cardObject)[0];
    const sourceCard = cardObject.getData("cardData");
    if (!ability) {
      this._toast("Habilidade indisponível.");
      return;
    }

    if (ability.action?.type === "special_summon_over_your_creature") {
      const targets = this._slotsMy.filter((slot) => slot.card);
      if (!targets.length) {
        this._toast("Você precisa de uma criatura em campo.");
        return;
      }
      this._pendingHandAbilityCard = cardObject;
      this._pendingHandAbility = ability;
      this._pendingSpecialSummon = {
        sourceCard,
        sourceIndex: this._handContainers.indexOf(cardObject),
        ability,
      };
      this._requestCreatureSlotChoice({
        title: "Escolha a criatura em campo para receber a invocação especial.",
        side: "my",
        slots: targets,
        color: 0xff66aa,
        onSelect: (targetSlot) =>
          this._openSpecialSummonCandidateChoiceForTarget(targetSlot),
      });
    }
  }

  _openSpecialSummonCandidateChoiceForTarget(targetSlot) {
    if (!this._pendingSpecialSummon) return;

    const sourceIndex = this._pendingSpecialSummon.sourceIndex;
    const filter = this._pendingSpecialSummon.ability.action?.filter ?? {};
    if (sourceIndex < 0) {
      this._toast("Não foi possível localizar a carta na mão.");
      this._clearSpecialSummonState();
      return;
    }

    const candidates = this.myHand
      .map((card, index) => ({ card, index }))
      .filter(
        (entry) =>
          entry.index !== sourceIndex &&
          entry.card.card_type === "criatura" &&
          this._matchesCardRule(entry.card, filter),
      );

    this._requestCardChoice({
      title: "Escolha a criatura para invocar",
      cards: candidates,
      emptyMessage: "Não há criatura Esdras válida na mão.",
      accent: 0xff66aa,
      buttonColor: "#6a2448",
      maxVisible: 8,
      labelForCard: (card) => card.name,
      onSelect: (entry) => this._completeSpecialSummon(targetSlot, entry.index),
      onEmpty: () => this._clearSpecialSummonState(),
    });
  }

  _highlightSpecialSummonTargets(targets) {
    this._clearSpecialSummonTargets();
    targets.forEach((slot) => {
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, 0xff66aa)
        .setDepth(7);
      slot.specialHighlight = highlight;
      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  _clearSpecialSummonTargets() {
    this._slotsMy?.forEach((slot) => {
      if (!slot.specialHighlight) return;
      this.tweens.killTweensOf(slot.specialHighlight);
      slot.specialHighlight.destroy();
      slot.specialHighlight = null;
    });
  }

  _selectSpecialSummonTarget(side, slotIndex) {
    if (!this._pendingSpecialSummon || side !== "my") return;
    const targetSlot = this._slotsMy[slotIndex];
    if (!targetSlot?.card) return;

    const sourceIndex = this._pendingSpecialSummon.sourceIndex;
    const filter = this._pendingSpecialSummon.ability.action?.filter ?? {};
    if (sourceIndex < 0) {
      this._toast("Não foi possível localizar a carta na mão.");
      this._clearSpecialSummonState();
      return;
    }

    const candidates = this.myHand
      .map((card, index) => ({ card, index }))
      .filter(
        (entry) =>
          entry.index !== sourceIndex &&
          entry.card.card_type === "criatura" &&
          this._matchesCardRule(entry.card, filter),
      );

    if (!candidates.length) {
      this._toast("Não há criatura Esdras válida na mão.");
      this._clearSpecialSummonState();
      return;
    }

    this._clearSpecialSummonTargets();
    this._openSpecialSummonCandidateChoice(targetSlot, candidates);
  }

  _openSpecialSummonCandidateChoice(targetSlot, candidates) {
    this._closeEffectChoiceModal();
    const { width, height } = this.cameras.main;
    const panelW = 500;
    const visible = candidates.slice(0, 8);
    const panelH = 150 + visible.length * 32;
    this._effectChoiceModal = this.add
      .container(width / 2, height / 2)
      .setDepth(132);

    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.58)
      .setInteractive();
    const panel = this.add
      .rectangle(0, 0, panelW, panelH, 0x071018, 0.97)
      .setStrokeStyle(2, 0xff66aa);
    const title = this.add
      .text(0, -panelH / 2 + 22, "Escolha a criatura para invocar", {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this._effectChoiceModal.add([overlay, panel, title]);

    visible.forEach((entry, i) => {
      const btn = this.add
        .text(0, -panelH / 2 + 60 + i * 32, entry.card.name, {
          fontSize: "12px",
          color: "#ffffff",
          backgroundColor: "#6a2448",
          padding: { x: 10, y: 7 },
          fixedWidth: panelW - 54,
          align: "center",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () =>
        this._completeSpecialSummon(targetSlot, entry.index),
      );
      this._effectChoiceModal.add(btn);
    });
  }

  _completeSpecialSummon(targetSlot, summonIndex) {
    const sourceObject = this._pendingHandAbilityCard;
    const sourceCard = this._pendingSpecialSummon?.sourceCard;
    const sourceIndex = this._pendingSpecialSummon?.sourceIndex;
    if (
      !sourceCard ||
      sourceIndex == null ||
      sourceIndex < 0 ||
      summonIndex < 0
    ) {
      this._toast("Não foi possível resolver a invocação especial.");
      this._clearSpecialSummonState();
      this._closeEffectChoiceModal();
      return;
    }

    if (!targetSlot?.card) {
      this._toast("O alvo não está mais em campo.");
      this._clearSpecialSummonState();
      this._closeEffectChoiceModal();
      return;
    }

    const summonCard = this.myHand[summonIndex];
    if (!summonCard || summonIndex === sourceIndex) {
      this._toast("Criatura inválida para invocação especial.");
      this._clearSpecialSummonState();
      this._closeEffectChoiceModal();
      return;
    }

    const removedSource = this.myHand.splice(sourceIndex, 1)[0];
    this.myDiscard.push(removedSource ?? sourceCard);
    this._notifyCardSentToDiscard(removedSource ?? sourceCard);
    sourceObject?.destroy(true);
    this._handContainers = this._handContainers.filter(
      (object) => object !== sourceObject,
    );

    const adjustedSummonIndex =
      summonIndex > sourceIndex ? summonIndex - 1 : summonIndex;
    const [selectedSummonCard] = this.myHand.splice(adjustedSummonIndex, 1);
    if (!selectedSummonCard) {
      this._toast("Não foi possível encontrar a criatura escolhida.");
      this._clearSpecialSummonState();
      this._closeEffectChoiceModal();
      return;
    }

    this._sendFieldCreatureToDiscard(targetSlot, "my", "invocação especial");
    this._summonCreatureToSlot(selectedSummonCard, targetSlot, {
      canAttackFromTurn: this._turnNumber + 1,
    });

    this._renderHand(this.myHand);
    this._renderDiscardPile();
    this._playDiscardSmoke();
    this._closeEffectChoiceModal();
    this._clearSpecialSummonState();
    this._toast(
      `${sourceCard.name} foi descartada para invocar ${selectedSummonCard.name}.`,
    );
    this._logAction(
      `${sourceCard.name} ativou invocação especial de ${selectedSummonCard.name}.`,
    );
  }

  _clearSpecialSummonState() {
    this._pendingHandAbilityCard = null;
    this._pendingHandAbility = null;
    this._pendingSpecialSummon = null;
    this._clearSpecialSummonTargets();
  }

  _highlightSummonZones() {
    this._slotsMy.forEach((slot) => {
      if (slot.card) return;
      slot.rect.setStrokeStyle(3, 0xffcc00);
      slot.rect.setFillStyle(0x2d3a18, 0.75);

      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 16, slot.h + 16, 0x000000, 0)
        .setStrokeStyle(3, 0xffdd44)
        .setDepth(6);
      slot.highlight = highlight;

      // this.tweens.add({
      //   targets: highlight,
      //   angle: 360,
      //   duration: 1400,
      //   repeat: -1,
      //   ease: 'Linear',
      // })
      this.tweens.add({
        targets: [slot.rect, highlight],
        alpha: 0.35,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  _clearSummonZones() {
    this._slotsMy?.forEach((slot) => {
      this.tweens.killTweensOf(slot.rect);
      slot.rect.setAlpha(1);
      slot.rect.setFillStyle(0x1a2a3a, 0.6);
      slot.rect.setStrokeStyle(1, 0x334455);
      if (slot.highlight) {
        this.tweens.killTweensOf(slot.highlight);
        slot.highlight.destroy();
        slot.highlight = null;
      }
    });
  }

  _isAttachmentCard(card) {
    return card.card_type === "item" || card.card_type === "habilidade";
  }

  _attachmentTargets(card) {
    return attachmentTargets(card, this._slotsMy);
  }

  _startAttachmentSelection(cardObject) {
    if (!this._canUseMainAction("attach")) {
      this._toast("Você já anexou neste turno.");
      return;
    }
    const card = cardObject.getData("cardData");
    const targets = this._attachmentTargets(card);
    if (!targets.length) {
      this._toast("Não há criaturas válidas para anexar.");
      return;
    }

    this._enqueueEffectResolution({ type: "attachment", cardObject });
  }

  async _resolveAttachmentQueued(cardObject) {
    if (!this._canUseMainAction("attach")) {
      this._toast("Você já anexou neste turno.");
      return;
    }

    const card = cardObject.getData("cardData");
    const targets = this._attachmentTargets(card);
    if (!targets.length) {
      this._toast("Não há criaturas válidas para anexar.");
      return;
    }

    const targetSlot = await this._requestCreatureSlotChoiceAsync({
      title: "Escolha uma criatura para anexar.",
      side: "my",
      slots: targets,
      color: card.card_type === "habilidade" ? 0x44aaff : 0xbb77ff,
    });
    if (!targetSlot) return;

    this._pendingAttachmentCard = cardObject;
    this._animateAttachmentToSlot(targetSlot, cardObject, card);
  }

  _highlightAttachmentTargets(targets) {
    this._clearAttachmentTargets();

    targets.forEach((slot) => {
      const color =
        this._pendingAttachmentCard?.getData("cardData")?.card_type ===
        "habilidade"
          ? 0x44aaff
          : 0xbb77ff;
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, color)
        .setDepth(7);
      slot.attachHighlight = highlight;

      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      // this.tweens.add({
      //   targets: highlight,
      //   angle: 360,
      //   duration: 1600,
      //   repeat: -1,
      //   ease: 'Linear',
      // })
    });
  }

  _clearAttachmentTargets() {
    this._slotsMy?.forEach((slot) => {
      if (!slot.attachHighlight) return;
      this.tweens.killTweensOf(slot.attachHighlight);
      slot.attachHighlight.destroy();
      slot.attachHighlight = null;
    });
  }

  _clearCommandTargets() {
    [...(this._slotsMy ?? []), ...(this._slotsOpp ?? [])].forEach((slot) => {
      if (!slot.commandHighlight) return;
      this.tweens.killTweensOf(slot.commandHighlight);
      slot.commandHighlight.destroy();
      slot.commandHighlight = null;
    });
  }

  _clearAbilityTargets() {
    [...(this._slotsMy ?? []), ...(this._slotsOpp ?? [])].forEach((slot) => {
      if (!slot.abilityHighlight) return;
      this.tweens.killTweensOf(slot.abilityHighlight);
      slot.abilityHighlight.destroy();
      slot.abilityHighlight = null;
    });
  }

  _enqueueEffectResolution(job) {
    if (this._effectQueueRunner) {
      this._effectQueueRunner.enqueue(job);
      return;
    }
    this._effectQueue.push(job);
    this._processEffectQueue();
  }

  async _processEffectQueue() {
    if (this._isResolvingEffect) return;
    this._isResolvingEffect = true;

    while (this._effectQueue.length) {
      const job = this._effectQueue.shift();
      try {
        await this._runEffectResolution(job);
      } catch (error) {
        console.error("Erro ao resolver efeito:", error);
        this._toast("Erro ao resolver efeito.");
      }
    }

    this._isResolvingEffect = false;
  }

  async _runEffectResolution(job) {
    if (job.type === "command") {
      await this._resolveCommandQueued(job.cardObject);
      return;
    }

    if (job.type === "attachment") {
      await this._resolveAttachmentQueued(job.cardObject);
      return;
    }

    if (job.type === "trigger_stack") {
      await this._resolveTriggeredEffectStack(job.jobs ?? []);
      return;
    }

    if (job.type === "attachment_element_changed") {
      await this._resolveAttachmentElementChanged(job);
      return;
    }

    if (job.type === "attachment_discard_trigger") {
      await this._resolveAttachmentDiscardTrigger(job);
    }
  }

  _activateCommand(cardObject) {
    this._enqueueEffectResolution({ type: "command", cardObject });
  }

  async _resolveCommandQueued(cardObject) {
    const card = cardObject.getData("cardData");
    const effects = card.effects ?? [];
    if (!effects.length) {
      this._toast("Este comando ainda não tem efeito configurado.");
      return;
    }

    const discardHandEffect = effects.find(
      (effect) => effect.type === "discard_hand_then_draw",
    );
    if (discardHandEffect) {
      this._resolveDiscardHandThenDrawCommand(cardObject, discardHandEffect);
      this._toast(`${card.name} resolvido.`);
      this._logAction(`${card.name} foi ativado.`);
      return;
    }

    if (!this._payEffectCosts(card, effects)) {
      this._toast("Não foi possível pagar o custo.");
      return;
    }

    let resolved = false;



    const revealShuffleEffect = effects.find(
  effect => effect.type === 'reveal_random_hand_then_shuffle_one'
)

  if (revealShuffleEffect) {
    const resolved = await applyRevealRandomHandThenShuffleOne(revealShuffleEffect, {
      scene: this,
      opponentHand: this.oppHand,
      opponentDeck: this.oppDeck,
      opponentDiscard: this.oppDiscard,
      shuffleCards: cards => this._shuffleCards(cards),
      randInt: (min, max) => this._randInt(min, max),
    })

    this._finishCommand(cardObject)
    this._toast(resolved ? `${card.name} resolvido.` : `${card.name} não encontrou alvo válido.`)
    this._logAction(`${card.name} foi ativado.`)
    return
  }



    for (const effect of effects) {
      const targetSlot = await this._chooseTargetForEffect(effect, "comando");
      if (targetSlot === false) return;
      const secondaryTargetSlot = await this._chooseSecondaryTargetForEffect(
        effect,
        "comando",
      );
      if (secondaryTargetSlot === false) return;
      resolved =
        this._applyCommandEffect(effect, targetSlot, card, secondaryTargetSlot) ||
        resolved;
    }

    this._finishCommand(cardObject);
    this._toast(
      resolved
        ? `${card.name} resolvido.`
        : `${card.name} foi para o descarte.`,
    );
    this._logAction(`${card.name} foi ativado.`);
  }

  _payEffectCosts() {
    return true;
  }

  async _chooseTargetForEffect(effect, sourceLabel = "efeito") {
    if (!this._commandNeedsTarget(effect)) return null;

    const targets = this._commandTargetSlots(effect);
    if (!targets.length) {
      this._toast(`Não há alvo válido para este ${sourceLabel}.`);
      return false;
    }

    const side = effect.target === "enemy_creature" ? "opp" : "my";
    const slot = await this._requestCreatureSlotChoiceAsync({
      title: `Escolha o alvo do ${sourceLabel}.`,
      side,
      slots: targets,
      color: 0xffcc44,
    });

    return slot ?? false;
  }

  _commandNeedsTarget(effect) {
    return effectNeedsCreatureTarget(effect);
  }

  _commandTargetSlots(effect) {
    return commandTargetSlots(effect, this._slotsMy, this._slotsOpp);
  }

  async _chooseSecondaryTargetForEffect(effect, sourceLabel = "efeito") {
    if (!effect.secondaryTarget) return null;

    const targets = this._secondaryCommandTargetSlots(effect);
    if (!targets.length) {
      this._toast(`Não há alvo secundário válido para este ${sourceLabel}.`);
      return false;
    }

    const side = effect.secondaryTarget === "enemy_creature" ? "opp" : "my";
    const slot = await this._requestCreatureSlotChoiceAsync({
      title: `Escolha quem será atacado pelo ${sourceLabel}.`,
      side,
      slots: targets,
      color: 0x66ddff,
    });

    return slot ?? false;
  }

  _secondaryCommandTargetSlots(effect) {
    return commandTargetSlots(
      { target: effect.secondaryTarget },
      this._slotsMy,
      this._slotsOpp,
    );
  }

  _highlightCommandTargets(targets) {
    this._clearCommandTargets();

    targets.forEach((slot) => {
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, 0xffcc44)
        .setDepth(7);
      slot.commandHighlight = highlight;
      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  _selectCommandTarget(side, slotIndex) {
    if (!this._pendingCommandCard || !this._pendingCommandEffect) return;

    const slot =
      side === "enemy" || side === "opp"
        ? this._slotsOpp[slotIndex]
        : this._slotsMy[slotIndex];
    if (
      !slot?.card ||
      !this._commandTargetSlots(this._pendingCommandEffect).includes(slot)
    )
      return;

    this._resolveCommand(this._pendingCommandCard, slot);
  }

  _resolveCommand(cardObject, targetSlot) {
    const card = cardObject.getData("cardData");
    const discardHandEffect = (card.effects ?? []).find(
      (effect) => effect.type === "discard_hand_then_draw",
    );
    if (discardHandEffect) {
      this._resolveDiscardHandThenDrawCommand(cardObject, discardHandEffect);
      this._pendingCommandCard = null;
      this._pendingCommandEffect = null;
      this._clearCommandTargets();
      this._toast(`${card.name} resolvido.`);
      return;
    }

    let resolved = false;

    for (const effect of card.effects ?? []) {
      resolved = this._applyCommandEffect(effect, targetSlot, card) || resolved;
    }

    this._finishCommand(cardObject);
    this._pendingCommandCard = null;
    this._pendingCommandEffect = null;
    this._clearCommandTargets();
    this._toast(
      resolved
        ? `${card.name} resolvido.`
        : `${card.name} foi para o descarte.`,
    );
    this._logAction(`${card.name} foi ativado.`);
  }

  _applyCommandEffect(effect, targetSlot, commandCard, secondaryTargetSlot = null) {
    switch (effect.type) {
      case "prevent_attack":
        if (!targetSlot?.card) return false;
        targetSlot.card.cannotAttackUntilTurn = this._turnNumber;
        return true;
      case "discard_hand_then_draw":
        this._resolveDiscardHandThenDrawCommand(null, effect, commandCard);
        return true;
      case "sacrifice_then_summon_from_deck":
        return this._sacrificeThenSummonFromDeck(targetSlot, effect.summon);
      case "temporary_modify_stat":
        return this._applyTemporaryCommandModifier(targetSlot, effect);
      case "prevent_attack_target":
        if (!targetSlot?.card) return false;
        targetSlot.card.cannotBeAttackTargetUntilTurn = this._turnNumber;
        return true;
      case "force_attack":
        if (!targetSlot?.card) return false;
        targetSlot.card.forcedAttackUntilTurn =
          this._activePlayer === "opp" ? this._turnNumber : this._turnNumber + 1;
        if (secondaryTargetSlot?.card) {
          targetSlot.card.forcedAttackTargetInstanceId =
            secondaryTargetSlot.card.instanceId;
          targetSlot.card.forcedAttackTargetName = secondaryTargetSlot.card.name;
        }
        return true;
     case 'reveal_random_hand_then_shuffle_one':
        return false
      default:
        return false;
    }
  }

  _finishCommand(cardObject) {
    const card = cardObject.getData("cardData");
    const handIndex = this.myHand.findIndex((c) => c.id === card.id);
    if (handIndex !== -1) this.myHand.splice(handIndex, 1);

    this._handContainers = this._handContainers.filter((c) => c !== cardObject);
    this._renderHand(this.myHand);
    this._animateCardToDiscard(cardObject, card);
  }

  _discardHandThenDraw(commandCard) {
    let keptCommand = false;
    const discarded = [];
    const remaining = [];

    for (const card of this.myHand) {
      if (!keptCommand && card.id === commandCard.id) {
        remaining.push(card);
        keptCommand = true;
      } else {
        discarded.push(card);
      }
    }

    this.myDiscard.push(...discarded);
    discarded.forEach((card) => this._notifyCardSentToDiscard(card));
    this.myHand = remaining;

    const drawCount = Math.min(
      discarded.length,
      this.myDeck.length,
      MAX_HAND_SIZE - this.myHand.length,
    );
    for (let i = 0; i < drawCount; i++) {
      this.myHand.push(this.myDeck.shift());
    }

    this._renderDeckPile();
  }

  _resolveDiscardHandThenDrawCommand(
    commandObject,
    effect,
    commandCard = null,
  ) {
    const command = commandCard ?? commandObject?.getData("cardData");
    if (!command) return;

    const commandIndex = this.myHand.findIndex(
      (card) => card.id === command.id,
    );
    if (commandIndex !== -1) this.myHand.splice(commandIndex, 1);

    const otherHandObjects = this._handContainers.filter(
      (object) => object !== commandObject,
    );
    const discardedCount = otherHandObjects.length;
    this.myHand = [];
    this._handContainers = [];

    const drawCount = Math.min(
      discardedCount,
      this.myDeck.length,
      MAX_HAND_SIZE,
    );
    const finishDraw = () => this._animateDrawCardsFromDeck(drawCount);
    const discardOthers = () =>
      this._animateHandObjectsToDiscard(otherHandObjects, finishDraw);

    if (commandObject) {
      this._animateCardToDiscard(commandObject, command, discardOthers);
    } else {
      this.myDiscard.push(command);
      this._notifyCardSentToDiscard(command);
      this._renderDiscardPile();
      discardOthers();
    }
  }

  _animateHandObjectsToDiscard(cardObjects, onComplete) {
    if (!cardObjects.length) {
      onComplete?.();
      return;
    }

    let completed = 0;
    cardObjects.forEach((cardObject, index) => {
      const card = cardObject.getData("cardData");
      this.time.delayedCall(index * 110, () => {
        this._animateCardToDiscard(cardObject, card, () => {
          completed += 1;
          if (completed === cardObjects.length) onComplete?.();
        });
      });
    });
  }

  _animateDrawCardsFromDeck(count, options = {}) {
    if (count <= 0) {
      this._renderHand(this.myHand);
      return;
    }

    const existingHand = this.myHand.length;
    const drawn = [];
    for (let i = 0; i < count; i++) {
      const card = this.myDeck.shift();
      if (card) drawn.push(card);
    }

    this._renderDeckPile();
    const y = this.cameras.main.height - 65;
    const targetPositions = this._handPositions(
      existingHand + drawn.length,
    ).slice(existingHand);
    const start = this._deckPileContainer
      ? { x: this._deckPileContainer.x, y: this._deckPileContainer.y }
      : { x: this.cameras.main.width - 238, y: this.cameras.main.height - 90 };

    let completed = 0;
    const previews = [];
    drawn.forEach((card, index) => {
      const preview = this._createCardObject(card, start.x, start.y, false);
      preview.setDepth(96);
      preview.setScale(0.72);
      preview.setAlpha(0.92);
      previews.push(preview);

      this.tweens.add({
        targets: preview,
        x: targetPositions[index],
        y,
        scale: 1,
        alpha: 1,
        duration: 380,
        delay: index * 120,
        ease: "Cubic.easeOut",
        onComplete: () => {
          completed += 1;
          if (completed === drawn.length) {
            drawn.forEach((cardData) => this.myHand.push(cardData));
            previews.forEach((object) => object.destroy(true));
            this._renderHand(this.myHand);
            this._logAction(`Voce comprou ${drawn.length} carta(s).`);
            this._discardRandomIfHandOverflow();
            this._syncPublicZoneState("draw_cards", { count: drawn.length });
            options.onComplete?.();
          }
        },
      });
    });
  }

  _animateExistingCardTo(cardObject, x, y, options = {}) {
    cardObject.disableInteractive();
    cardObject.setDepth(options.depth ?? 92);

    this.tweens.add({
      targets: cardObject,
      x,
      y,
      scale: options.scale ?? cardObject.scale,
      angle: options.angle ?? 0,
      duration: options.duration ?? 360,
      ease: options.ease ?? "Cubic.easeInOut",
      onComplete: () => {
        cardObject.setAlpha(1);
        options.onComplete?.();
      },
    });
  }

  _animateCardPreviewTo(card, from, to, options = {}) {
    const preview = this._createCardObject(card, from.x, from.y, false);
    preview.setDepth(options.depth ?? 92);
    preview.setScale(options.startScale ?? 0.72);
    preview.setAlpha(options.alpha ?? 0.92);

    this.tweens.add({
      targets: preview,
      x: to.x,
      y: to.y,
      scale: options.endScale ?? 1,
      alpha: 1,
      duration: options.duration ?? 360,
      ease: options.ease ?? "Cubic.easeInOut",
      onComplete: () => {
        preview.destroy(true);
        options.onComplete?.();
      },
    });
  }

  _sacrificeThenSummonFromDeck(targetSlot, summonRule) {
    if (!targetSlot?.card || !summonRule) return false;

    const sacrificedObject = targetSlot.cardObject;
    const attachments = [...(targetSlot.attachments ?? [])];
    if (!targetSlot.card.isToken) {
      this.myDiscard.push(targetSlot.card);
      this._notifyCardSentToDiscard(targetSlot.card);
      this._animateFieldObjectToDiscard(sacrificedObject, "my");
    } else {
      this._animateFieldObjectVanish(sacrificedObject);
    }
    attachments.forEach((attachment, index) => {
      if (attachment.card) this.myDiscard.push(attachment.card);
      this._animateFieldObjectToDiscard(attachment.object, "my", {
        delay: 80 + index * 70,
        scale: 0.58,
      });
    });
    targetSlot.card = null;
    targetSlot.cardObject = null;
    targetSlot.attachments = [];

    let summoned = 0;
    const max = summonRule.count ?? 1;
    for (let i = this.myDeck.length - 1; i >= 0 && summoned < max; i--) {
      const card = this.myDeck[i];
      if (!this._matchesSummonRule(card, summonRule)) continue;
      const emptySlot = this._slotsMy.find((slot) => !slot.card);
      if (!emptySlot) break;

      this.myDeck.splice(i, 1);
      this._summonCreatureToSlot(card, emptySlot, {
        canAttackFromTurn:
          summonRule.can_attack_this_turn === false
            ? this._turnNumber + 1
            : this._turnNumber,
      });
      summoned += 1;
    }

    this._renderDeckPile();
    return true;
  }

  _matchesSummonRule(card, rule) {
    if (rule.card_type && card.card_type !== rule.card_type) return false;
    if (rule.race && card.raca !== rule.race) return false;
    if (
      rule.max_attack != null &&
      Number(card.attack) > Number(rule.max_attack)
    )
      return false;
    return true;
  }

  _applyTemporaryCommandModifier(targetSlot, effect) {
    if (!targetSlot?.card) return false;

    const value = this._valueFromCommandRule(effect.value_per_card);
    const modifier = {
      expiresOnTurn: this._turnNumber,
      attack: effect.stats?.includes("attack") ? value : 0,
      defense: effect.stats?.includes("defense") ? value : 0,
    };
    targetSlot.card.tempModifiers = [
      ...(targetSlot.card.tempModifiers ?? []),
      modifier,
    ];
    this._recalculateAllFieldCreatures();
    return true;
  }

  _valueFromCommandRule(rule) {
    if (!rule) return Number(rule?.value) || 0;

    if (rule.zone === "your_discard") {
      const count = this.myDiscard.filter((card) => {
        if (
          rule.name_includes &&
          !String(card.name ?? card.nome ?? "").includes(rule.name_includes)
        )
          return false;
        return true;
      }).length;
      return count * (Number(rule.value) || 0);
    }

    return Number(rule.value) || 0;
  }

  _activateScenario(cardObject) {
    if (!this._canUseMainAction("scenario")) {
      this._toast("Você já ativou um cenário neste turno.");
      return;
    }

    const card = cardObject.getData("cardData");
    if (this._myScenario) {
      const oldScenario = this._myScenario;
      const from = this._scenarioContainer
        ? { x: this._scenarioContainer.x, y: this._scenarioContainer.y - 8 }
        : { x: 320, y: this.cameras.main.height / 2 };
      this.myDiscard.push(oldScenario);
      this._animateCardPreviewToDiscard(oldScenario, from, "my");
    }

    this._myScenario = card;
    const handIndex = this.myHand.findIndex((c) => c.id === card.id);
    if (handIndex !== -1) this.myHand.splice(handIndex, 1);
    cardObject.destroy(true);
    this._handContainers = this._handContainers.filter(
      (object) => object !== cardObject,
    );
    this._renderHand(this.myHand);
    this._renderScenarioZone();
    if (ANEXOS_LIVRES) this._turnActions.scenario = true;
    this._toast(`${card.name} ativo.`);
    this._logAction(`${card.name} entrou como cenario.`);
  }

  _renderScenarioZone() {
    if (this._scenarioContainer) this._scenarioContainer.destroy(true);

    const firstSlot = this._slotsMy?.[0];
    const fallback = { x: 320, y: this.cameras.main.height / 2 + 42 };
    const x = (firstSlot?.x ?? fallback.x) - 132;
    const y = (firstSlot?.y ?? fallback.y) - 42;
    this._scenarioContainer = this.add.container(x, y).setDepth(3);
    const base = this.add
      .rectangle(0, 0, 118, 82, 0x0c2018, 0.88)
      .setStrokeStyle(1, 0x338866);
    const label = this.add
      .text(0, 34, "CENARIO", { fontSize: "10px", color: "#88ddbb" })
      .setOrigin(0.5);
    this._scenarioContainer.add([base, label]);

    if (this._myScenario) {
      const scenarioCard = this._createCardObject(this._myScenario, 0, -8, false)
        .setScale(0.64)
        .setAngle(90)
        .setDepth(4);
      scenarioCard.setData("source", "scenario");
      scenarioCard.setInteractive({ useHandCursor: true });
      scenarioCard.on("pointerdown", (pointer, localX, localY, event) => {
        event?.stopPropagation();
        this._showMagnifier(scenarioCard);
      });
      this._scenarioContainer.add(scenarioCard);
    }
  }

  _attachPendingToTarget(cardObject) {
    if (!this._pendingAttachmentCard) return false;

    const slot = this._slotsMy.find((s) => s.cardObject === cardObject);
    if (!slot) return false;

    const attachmentObject = this._pendingAttachmentCard;
    const attachment = attachmentObject.getData("cardData");
    if (!this._attachmentTargets(attachment).includes(slot)) return false;

    this._animateAttachmentToSlot(slot, attachmentObject, attachment);
    return true;
  }

  _animateAttachmentToSlot(slot, attachmentObject, attachment) {
    const index = Math.min(slot.attachments.length, 1);
    const xOffset = index === 0 ? -12 : 12;
    this._animateExistingCardTo(
      attachmentObject,
      slot.x + xOffset,
      slot.y + 9,
      {
        scale: 0.98,
        depth: 92,
        duration: 320,
        onComplete: () =>
          this._placeAttachment(slot, attachmentObject, attachment),
      },
    );
  }

  _placeAttachment(slot, attachmentObject, attachment) {
    if (slot.attachments.length >= 2) {
      this._openAttachmentReplaceChoice(slot, attachmentObject, attachment);
      return;
    }

    const index = slot.attachments.length;
    const xOffset = index === 0 ? -12 : 12;
    attachmentObject.setPosition(slot.x + xOffset, slot.y + 9);
    attachmentObject.setScale(0.98);
    attachmentObject.setDepth(6 + index);
    attachmentObject.setData("source", "attachment");
    attachmentObject.setData("slot", slot);
    attachmentObject.setData("abilityState", { usedAbilities: {} });
    attachmentObject.removeAllListeners("pointerdown");
    attachmentObject.setInteractive({ useHandCursor: true });
    attachmentObject.on("pointerdown", () =>
      this._showCardActions(attachmentObject),
    );

    slot.attachments.push({ card: attachment, object: attachmentObject });
    this._resolveOnAttachEffects(slot, attachment);
    this._resolveAttachmentTriggeredAbilities(slot, attachment);
    this._recalculateAllFieldCreatures();
    this._handContainers = this._handContainers.filter(
      (card) => card !== attachmentObject,
    );
    const handIndex = this.myHand.findIndex(
      (card) => card.id === attachment.id,
    );
    if (handIndex !== -1) this.myHand.splice(handIndex, 1);
    this._turnActions.attached = true;

    this._pendingAttachmentCard = null;
    this._clearAttachmentTargets();
    this._toast(`${attachment.name} anexada.`);
    this._logAction(`${attachment.name} foi anexada a ${slot.card.name}.`);
  }

  _placeOpponentAttachment(slot, attachment) {
    if (!slot?.card || slot.attachments.length >= 2) return false;

    const index = slot.attachments.length;
    const xOffset = index === 0 ? -12 : 12;
    const attachmentObject = this._createCardObject(
      attachment,
      slot.x + xOffset,
      slot.y + 9,
      false,
    );
    attachmentObject.setScale(0.98);
    attachmentObject.setDepth(6 + index);
    attachmentObject.setData("source", "attachment");
    attachmentObject.setData("slot", slot);
    attachmentObject.setData("abilityState", { usedAbilities: {} });
    attachmentObject.setInteractive({ useHandCursor: true });
    attachmentObject.on("pointerdown", () =>
      this._showCardActions(attachmentObject),
    );

    slot.attachments.push({ card: attachment, object: attachmentObject });
    this._recalculateAllFieldCreatures();
    this._logAction(`Oponente anexou ${attachment.name} a ${slot.card.name}.`);
    return true;
  }

  _openAttachmentReplaceChoice(slot, attachmentObject, attachment) {
    this._clearAttachmentTargets();
    this._clearAttachmentReplaceChoice();

    this._replaceAttachmentMenu = this.add
      .container(slot.x, slot.y - 92)
      .setDepth(46);
    const bg = this.add
      .rectangle(0, 0, 260, 66, 0x071018, 0.92)
      .setStrokeStyle(1, 0xbb77ff);
    const label = this.add
      .text(0, -20, "Descartar qual anexo?", {
        fontSize: "11px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this._replaceAttachmentMenu.add([bg, label]);

    slot.attachments.forEach((entry, index) => {
      const btn = this.add
        .text((index - 0.5) * 112, 14, entry.card.name.slice(0, 14), {
          fontSize: "10px",
          color: "#ffffff",
          backgroundColor: "#6a3d9a",
          padding: { x: 8, y: 5 },
          fixedWidth: 104,
          align: "center",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.setData("floatingMenuControl", true);
      btn.on("pointerdown", () => {
        this._clearAttachmentReplaceChoice();
        this._discardAttachment(slot, index);
        this._placeAttachment(slot, attachmentObject, attachment);
      });
      this._replaceAttachmentMenu.add(btn);
    });
  }

  _discardAttachment(slot, index) {
    const [entry] = slot.attachments.splice(index, 1);
    if (!entry) return;
    this.myDiscard.push(entry.card);
    this._notifyAttachmentSentToDiscard(entry.card, "my");
    this._animateFieldObjectToDiscard(entry.object, "my", { scale: 0.58 });
    this._recalculateAllFieldCreatures();
  }

  _resolveOnAttachEffects(slot, attachment) {
    const results = resolveTriggerEffects(attachment.onAttach ?? [], {
      source: attachment,
      attachedCreature: slot.card,
      yourField: this._slotsMy,
    });

    for (const effect of attachment.onAttach ?? []) {
      if (effect.type === "change_element")
        this._openOnAttachElementChoice(slot, effect);
      if (abilityEffectNeedsTarget(effect))
        this._startOnAttachAbilityTargetSelection(slot, attachment, effect);
    }

    for (const result of results) {
      if (result.card_type === "criatura")
        this._summonTokenToFirstEmptyZone(result);
      if (result.type === "delayed_effect")
        this._scheduleDelayedEffect(slot, attachment, result);
    }
  }

  _resolveAttachmentTriggeredAbilities(slot, attachment) {
    for (const ability of attachment.triggeredAbilities ?? []) {
      if (ability.trigger !== "attached_count_reaches") continue;

      const targetName =
        ability.attachedName ?? attachment.name ?? attachment.nome;
      const count = (slot.attachments ?? []).filter(
        (entry) =>
          String(entry.card?.name ?? entry.card?.nome ?? "").toLowerCase() ===
          String(targetName).toLowerCase(),
      ).length;
      if (count !== Number(ability.count)) continue;

      if (ability.action?.type === "opponent_discard_random") {
        this._discardRandomOpponentCards(ability.action.discard ?? 1);
      }
    }
  }

  _resolveAttachedCreatureAttackTriggers(
    attackerSlot,
    owner = "my",
    attachments = null,
  ) {
    const activeAttachments = attachments ?? attackerSlot?.attachments ?? [];
    if (!attackerSlot?.card && !activeAttachments.length) return;
    if (!activeAttachments.length) return;

    for (const attachment of activeAttachments) {
      for (const ability of attachment.card?.triggeredAbilities ?? []) {
        if (ability.trigger !== "attached_creature_attacks") continue;
        this._resolveAttachedCreatureAttackAction(
          attackerSlot,
          owner,
          attachment.card,
          ability.action,
        );
      }
    }
  }

  _resolveAttachedCreatureAttackAction(
    attackerSlot,
    owner,
    attachment,
    action,
  ) {
    if (!action) return false;

    if (action.type === "temporary_modify_allied_creatures") {
      const allySlots = owner === "my" ? this._slotsMy : this._slotsOpp;
      const affected = allySlots.filter(
        (slot) => slot.card && matchesCreatureRule(slot.card, action.filter ?? {}),
      );
      for (const ally of affected) {
        ally.card.tempModifiers = [
          ...(ally.card.tempModifiers ?? []),
          {
            expiresOnTurn: this._turnNumber,
            attack: (action.stats ?? []).includes("attack") ? Number(action.value) || 0 : 0,
            defense: (action.stats ?? []).includes("defense") ? Number(action.value) || 0 : 0,
          },
        ];
      }
      this._recalculateAllFieldCreatures();
      if (affected.length) {
        this._toast(`${attachment.name}: Bestas aliadas receberam +1 ATQ neste turno.`);
        this._logAction(`${attachment.name} fortaleceu ${affected.length} Besta(s).`);
      }
      return affected.length > 0;
    }

    if (
      action.type !== "choose_enemy_creature_then_prevent_attack" &&
      action.type !== "choose_enemy_creature_prevent_attack_next_turn"
    ) return false;

    const enemySlots =
      owner === "my"
        ? this._slotsOpp.filter((slot) => slot.card)
        : this._slotsMy.filter((slot) => slot.card);

    if (!enemySlots.length) return false;

    const applyPreventAttack = (targetSlot) => {
      if (!targetSlot?.card) return;
      targetSlot.card.cannotAttackUntilTurn = this._turnNumber + 1;
      this._toast(
        `${targetSlot.card.name} não poderá atacar no próximo turno.`,
      );
      this._logAction(
        `${attachment.name} impediu ${targetSlot.card.name} de atacar no próximo turno.`,
      );
    };

    if (owner === "opp") {
      applyPreventAttack(enemySlots[0]);
      return true;
    }

    this._requestCreatureSlotChoice({
      title: `${attachment.name}: escolha uma criatura inimiga.`,
      side: "opp",
      slots: enemySlots,
      color: 0x66ddff,
      onSelect: applyPreventAttack,
    });
    return true;
  }

  _discardRandomOpponentCards(count = 1) {
    const amount = Math.max(1, Number(count) || 1);
    const discarded = aiDiscardRandom(
      {
        hand: this.oppHand,
        discard: this.oppDiscard,
      },
      amount,
      (min, max) => this._randInt(min, max),
    );

    this.oppHandCount = this.oppHand.length;
    this._renderOpponentHand();
    this._renderOpponentDiscardPile();

    if (!discarded.length) {
      this._toast("Oponente não tem cartas na mão para descartar.");
      return;
    }

    this._toast("Oponente descartou uma carta aleatória.");
    this._logAction(
      `Oponente descartou ${discarded.length} carta(s) aleatória(s).`,
    );
  }

  _requestYesNoChoice({
    title = "Ativar efeito?",
    message = "",
    confirmLabel = "SIM",
    cancelLabel = "NÃO",
    onConfirm,
    onCancel,
  } = {}) {
    this._closeEffectChoiceModal();
    const { width, height } = this.cameras.main;
    this._effectChoiceModal = this.add
      .container(width / 2, height / 2)
      .setDepth(132);

    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.58)
      .setInteractive();
    const panel = this.add
      .rectangle(0, 0, 430, 180, 0x071018, 0.97)
      .setStrokeStyle(2, 0x4caf50);
    const titleText = this.add
      .text(0, -58, title, {
        fontSize: "16px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const body = this.add
      .text(0, -22, message, {
        fontSize: "12px",
        color: "#d7e7df",
        align: "center",
        wordWrap: { width: 370 },
      })
      .setOrigin(0.5);
    const yes = this.add
      .text(-76, 48, confirmLabel, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#1b5e20",
        padding: { x: 20, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const no = this.add
      .text(76, 48, cancelLabel, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#5a2525",
        padding: { x: 20, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    yes.on("pointerdown", () => {
      this._closeEffectChoiceModal();
      onConfirm?.();
    });
    no.on("pointerdown", () => {
      this._closeEffectChoiceModal();
      onCancel?.();
    });

    this._effectChoiceModal.add([overlay, panel, titleText, body, yes, no]);
  }

  _requestYesNoChoiceAsync(options = {}) {
    return new Promise((resolve) => {
      this._requestYesNoChoice({
        ...options,
        onConfirm: () => {
          options.onConfirm?.();
          resolve(true);
        },
        onCancel: () => {
          options.onCancel?.();
          resolve(false);
        },
      });
    });
  }

  _requestTimedYesNoChoiceAsync(options = {}) {
    return new Promise((resolve) => {
      let remaining = options.seconds ?? 7;
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (this._commandResponseTimer) {
          this._commandResponseTimer.remove(false);
          this._commandResponseTimer = null;
        }
        this._closeEffectChoiceModal();
        resolve(value);
      };

      this._closeEffectChoiceModal();
      const { width, height } = this.cameras.main;
      this._effectChoiceModal = this.add
        .container(width / 2, height / 2)
        .setDepth(132);

      const overlay = this.add
        .rectangle(0, 0, width, height, 0x000000, 0.48)
        .setInteractive();
      const panel = this.add
        .rectangle(0, 0, 460, 190, 0x071018, 0.97)
        .setStrokeStyle(2, 0xffcc44);
      const title = this.add
        .text(0, -62, options.title ?? "Responder com comando?", {
          fontSize: "16px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const body = this.add
        .text(
          0,
          -22,
          options.message ??
            "Você pode ativar uma carta de comando em resposta.",
          {
            fontSize: "12px",
            color: "#d7e7df",
            align: "center",
            wordWrap: { width: 390 },
          },
        )
        .setOrigin(0.5);
      const timer = this.add
        .text(0, 20, `${remaining}s`, {
          fontSize: "15px",
          color: "#ffdd66",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const yes = this.add
        .text(-78, 58, "SIM", {
          fontSize: "13px",
          color: "#ffffff",
          backgroundColor: "#1b5e20",
          padding: { x: 22, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const no = this.add
        .text(78, 58, "NÃO", {
          fontSize: "13px",
          color: "#ffffff",
          backgroundColor: "#5a2525",
          padding: { x: 22, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      yes.on("pointerdown", () => finish(true));
      no.on("pointerdown", () => finish(false));
      this._effectChoiceModal.add([
        overlay,
        panel,
        title,
        body,
        timer,
        yes,
        no,
      ]);

      this._commandResponseTimer = this.time.addEvent({
        delay: 1000,
        repeat: remaining - 1,
        callback: () => {
          remaining -= 1;
          timer.setText(`${remaining}s`);
          if (remaining <= 0) finish(false);
        },
      });
    });
  }

  _requestCardChoice({
    title = "Escolha uma carta",
    cards = [],
    emptyMessage = "Nenhuma carta válida.",
    accent = 0x4caf50,
    buttonColor = "#16385c",
    maxVisible = 10,
    labelForCard = (card) => `${card.name ?? card.nome}`,
    onSelect,
    onEmpty,
  } = {}) {
    this._closeEffectChoiceModal();
    if (!cards.length) {
      this._toast(emptyMessage);
      onEmpty?.();
      return;
    }

    const { width, height } = this.cameras.main;
    const visible = cards.slice(0, maxVisible);
    const cardW = 78;
    const cardH = 109;
    const cols = Math.min(5, visible.length);
    const rows = Math.ceil(visible.length / cols);
    const gapX = 24;
    const gapY = 30;
    const panelW = Math.max(
      360,
      cols * cardW + Math.max(0, cols - 1) * gapX + 72,
    );
    const panelH = 110 + rows * cardH + Math.max(0, rows - 1) * gapY;
    this._effectChoiceModal = this.add
      .container(width / 2, height / 2)
      .setDepth(132);

    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.58)
      .setInteractive();
    const panel = this.add
      .rectangle(0, 0, panelW, panelH, 0x071018, 0.97)
      .setStrokeStyle(2, accent);
    const titleText = this.add
      .text(0, -panelH / 2 + 22, title, {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this._effectChoiceModal.add([overlay, panel, titleText]);

    const totalW = cols * cardW + Math.max(0, cols - 1) * gapX;
    const startX = -totalW / 2 + cardW / 2;
    const startY = -panelH / 2 + 82;

    visible.forEach((entry, i) => {
      const card = entry.card ?? entry;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const thumb = this._createCardThumbnail(
        card,
        startX + col * (cardW + gapX),
        startY + row * (cardH + gapY),
        cardW,
        cardH,
        accent,
      );
      thumb.setInteractive({ useHandCursor: true });
      thumb.on("pointerover", () => thumb.setScale(1.05));
      thumb.on("pointerout", () => thumb.setScale(1));
      thumb.on("pointerdown", () => {
        this._closeEffectChoiceModal();
        onSelect?.(entry, i);
      });
      this._effectChoiceModal.add(thumb);
    });
  }

  _requestCardChoiceAsync(options = {}) {
    return new Promise((resolve) => {
      this._requestCardChoice({
        ...options,
        onSelect: (entry, index) => {
          options.onSelect?.(entry, index);
          resolve(entry);
        },
        onEmpty: () => {
          options.onEmpty?.();
          resolve(null);
        },
      });
    });
  }

  _requestDeckCardChoice({
    filter = {},
    title = "Escolha uma carta do baralho",
    onSelect,
    ...options
  } = {}) {
    const cards = this.myDeck.filter((card) =>
      this._matchesCardRule(card, filter),
    );
    this._requestCardChoice({
      title,
      cards,
      emptyMessage: "Nenhuma carta válida encontrada no baralho.",
      onSelect,
      ...options,
    });
  }

  _requestDiscardCardChoice({
    filter = {},
    title = "Escolha uma carta do descarte",
    owner = "my",
    onSelect,
    ...options
  } = {}) {
    const discard = owner === "opp" ? this.oppDiscard : this.myDiscard;
    const cards = discard.filter((card) => this._matchesCardRule(card, filter));
    this._requestCardChoice({
      title,
      cards,
      emptyMessage: "Nenhuma carta válida encontrada no descarte.",
      onSelect,
      ...options,
    });
  }

  _requestCreatureSlotChoice({
    title = "Escolha uma criatura",
    side = "my",
    slots = null,
    color = 0x44aaff,
    onSelect,
    onCancel,
    onEmpty,
  } = {}) {
    const availableSlots =
      slots ??
      (side === "opp" ? this._slotsOpp : this._slotsMy).filter(
        (slot) => slot.card,
      );
    if (!availableSlots.length) {
      this._toast("Não há criatura válida para escolher.");
      onEmpty?.();
      return;
    }

    this._clearGenericSlotChoice();
    this._pendingSlotChoice = {
      title,
      slots: availableSlots,
      onSelect,
      onCancel,
    };

    availableSlots.forEach((slot) => {
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, color)
        .setDepth(7);
      slot.choiceHighlight = highlight;
      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    this._slotChoiceCancelButton = this._createSlotChoiceCancelButton(onCancel);
    this._toast(title);
  }

  _createSlotChoiceCancelButton(onCancel) {
    const { width, height } = this.cameras.main;
    const button = this.add.container(width / 2, height / 2 + 42).setDepth(46);
    const bg = this.add
      .rectangle(0, 0, 118, 32, 0x371318, 0.96)
      .setStrokeStyle(1, 0xff7777);
    const label = this.add
      .text(0, 0, "CANCELAR", {
        fontSize: "12px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    button.add([bg, label]);
    button.setSize(118, 32);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerover", () => bg.setFillStyle(0x5a1f28, 0.98));
    button.on("pointerout", () => bg.setFillStyle(0x371318, 0.96));
    button.on("pointerdown", (pointer, localX, localY, event) => {
      event?.stopPropagation();
      this._clearGenericSlotChoice();
      onCancel?.();
    });
    return button;
  }

  _requestCreatureSlotChoiceAsync(options = {}) {
    return new Promise((resolve) => {
      this._requestCreatureSlotChoice({
        ...options,
        onSelect: (slot, meta) => {
          options.onSelect?.(slot, meta);
          resolve(slot);
        },
        onEmpty: () => {
          options.onEmpty?.();
          resolve(null);
        },
        onCancel: () => {
          options.onCancel?.();
          resolve(null);
        },
      });
    });
  }

  _commandResponseCandidates() {
    if (this._activePlayer !== "opp") return [];
    return this._handContainers
      .map((object) => ({ object, card: object.getData("cardData") }))
      .filter(
        (entry) =>
          entry.card?.card_type === "comando" &&
          (entry.card.effects ?? []).length,
      );
  }

  _highlightCommandResponseCards(candidates) {
    this._clearCommandResponseHighlights();
    candidates.forEach(({ object }) => {
      const glow = this.add
        .rectangle(object.x, object.y, 92, 124, 0x000000, 0)
        .setStrokeStyle(3, 0xffdd44)
        .setDepth(44);
      this.tweens.add({
        targets: glow,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.25,
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this._commandResponseHighlights.push(glow);
    });
  }

  _clearCommandResponseHighlights() {
    this._commandResponseHighlights?.forEach((glow) => {
      this.tweens.killTweensOf(glow);
      glow.destroy();
    });
    this._commandResponseHighlights = [];
  }

  async _offerCommandResponseWindow(actionLabel = "ação do oponente") {
    const candidates = this._commandResponseCandidates();
    if (!candidates.length) return false;

    this._highlightCommandResponseCards(candidates);
    const wantsResponse = await this._requestTimedYesNoChoiceAsync({
      title: "Responder com comando?",
      message: `O oponente fez: ${actionLabel}. Você tem 7 segundos para responder.`,
      seconds: 7,
    });

    if (!wantsResponse) {
      this._clearCommandResponseHighlights();
      return false;
    }

    const selected =
      candidates.length === 1
        ? candidates[0]
        : await this._requestCardChoiceAsync({
            title: "Escolha o comando para responder",
            cards: candidates,
            emptyMessage: "Nenhum comando disponível.",
            accent: 0xffcc44,
            buttonColor: "#8a4a12",
            maxVisible: 7,
            labelForCard: (card) => card.name,
          });

    this._clearCommandResponseHighlights();
    if (!selected?.object) return false;

    await this._resolveCommandQueued(selected.object);
    return true;
  }

  _fieldCreatureResponseCandidates() {
    if (this._activePlayer !== "opp") return [];
    return this._slotsMy
      .filter((slot) => slot.cardObject && this._fieldCreatureAbilities(slot.cardObject).length)
      .map((slot) => ({
        slot,
        object: slot.cardObject,
        card: slot.card,
        ability: this._fieldCreatureAbilities(slot.cardObject)[0],
      }));
  }

  async _offerFieldCreatureResponseWindow(actionLabel = "ação do oponente") {
    const candidates = this._fieldCreatureResponseCandidates();
    if (!candidates.length) return false;

    const wantsResponse = await this._requestTimedYesNoChoiceAsync({
      title: "Ativar habilidade?",
      message: `O oponente ${actionLabel}. Você quer ativar uma habilidade de criatura?`,
      seconds: 7,
    });
    if (!wantsResponse) return false;

    const selected =
      candidates.length === 1
        ? candidates[0]
        : await this._requestCardChoiceAsync({
            title: "Escolha a criatura",
            cards: candidates,
            emptyMessage: "Nenhuma habilidade disponível.",
            accent: 0x66ddff,
            buttonColor: "#16405c",
            maxVisible: 5,
            labelForCard: (card) => card.name,
          });

    if (!selected?.object) return false;
    return this._activateFieldCreatureAbility(selected.object);
  }

  _selectGenericSlotChoice(side, slotIndex) {
    if (!this._pendingSlotChoice) return;
    const slot =
      side === "opp" ? this._slotsOpp[slotIndex] : this._slotsMy[slotIndex];
    if (!slot || !this._pendingSlotChoice.slots.includes(slot)) return;

    const onSelect = this._pendingSlotChoice.onSelect;
    this._clearGenericSlotChoice();
    onSelect?.(slot, { side, slotIndex });
  }

  _clearGenericSlotChoice() {
    [...(this._slotsMy ?? []), ...(this._slotsOpp ?? [])].forEach((slot) => {
      if (!slot.choiceHighlight) return;
      this.tweens.killTweensOf(slot.choiceHighlight);
      slot.choiceHighlight.destroy();
      slot.choiceHighlight = null;
    });
    if (this._slotChoiceCancelButton) {
      this._slotChoiceCancelButton.destroy(true);
      this._slotChoiceCancelButton = null;
    }
    this._pendingSlotChoice = null;
  }

  _cancelGenericSlotChoice() {
    if (!this._pendingSlotChoice) {
      this._clearGenericSlotChoice();
      return;
    }
    const onCancel = this._pendingSlotChoice.onCancel;
    this._clearGenericSlotChoice();
    onCancel?.();
  }

  _startOnAttachAbilityTargetSelection(sourceSlot, attachment, effect) {
    const side = effect.target === "enemy_creature" ? "opp" : "my";
    const targets = (side === "opp" ? this._slotsOpp : this._slotsMy).filter(
      (slot) => slot.card,
    );

    this._requestCreatureSlotChoice({
      title: "Escolha o alvo da habilidade.",
      side,
      slots: targets,
      color: 0x44aaff,
      onSelect: (targetSlot) =>
        this._resolveTargetedAbilityEffect(
          sourceSlot,
          attachment,
          effect,
          targetSlot,
        ),
    });
  }

  _resolveTargetedAbilityEffect(sourceSlot, attachment, effect, targetSlot) {
    const applied = applyTargetedAbilityEffect(effect, {
      source: attachment,
      sourceSlot,
      targetSlot,
      yourField: this._slotsMy,
      enemyField: this._slotsOpp,
    });

    this._recalculateAllFieldCreatures();
    this._toast(
      applied
        ? "Habilidade resolvida."
        : "Não foi possível resolver a habilidade.",
    );
  }

  _highlightAbilityTargets(targets) {
    this._clearAbilityTargets();

    targets.forEach((slot) => {
      const highlight = this.add
        .rectangle(slot.x, slot.y, slot.w + 18, slot.h + 18, 0x000000, 0)
        .setStrokeStyle(3, 0x44aaff)
        .setDepth(7);
      slot.abilityHighlight = highlight;
      this.tweens.add({
        targets: highlight,
        scaleX: 1.08,
        scaleY: 1.08,
        alpha: 0.35,
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }

  _selectAbilityTarget(side, slotIndex) {
    if (!this._pendingAbilityEffect) return;

    const slot =
      side === "enemy" || side === "opp"
        ? this._slotsOpp[slotIndex]
        : this._slotsMy[slotIndex];
    if (!slot?.card) return;

    const applied = applyTargetedAbilityEffect(this._pendingAbilityEffect, {
      source: this._pendingAbilitySource,
      sourceSlot: this._pendingAbilitySourceSlot,
      targetSlot: slot,
      yourField: this._slotsMy,
      enemyField: this._slotsOpp,
    });

    this._clearAbilityTargets();
    this._pendingAbilityEffect = null;
    this._pendingAbilitySourceSlot = null;
    this._pendingAbilitySource = null;
    this._recalculateAllFieldCreatures();
    this._toast(
      applied
        ? "Habilidade resolvida."
        : "Não foi possível resolver a habilidade.",
    );
  }

  _openOnAttachElementChoice(slot, effect) {
    const choices = effect.choose ?? [];
    if (!slot?.card || !choices.length) return;

    if (this._elementChoiceMenu) this._elementChoiceMenu.destroy(true);

    this._elementChoiceMenu = this.add
      .container(slot.x, slot.y - 96)
      .setDepth(45);
    choices.forEach((element, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const btn = this.add
        .text((col - 1.5) * 70, row * 28, ELEMENT_LABEL[element] ?? element, {
          fontSize: "10px",
          color: "#ffffff",
          backgroundColor: "#1a3650",
          padding: { x: 8, y: 5 },
          fixedWidth: 64,
          align: "center",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#2f6f8f" }));
      btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#1a3650" }));
      btn.on("pointerdown", () =>
        this._applyOnAttachElementChoice(slot, effect, element),
      );
      this._elementChoiceMenu.add(btn);
    });

    this._toast("Escolha o elemento da criatura.");
  }

  _applyOnAttachElementChoice(slot, effect, element) {
    if (!slot?.card || !effect.choose?.includes(element)) return;

    const previousElement = slot.card.element;
    slot.card.element = element;
    if (this._elementChoiceMenu) {
      this._elementChoiceMenu.destroy(true);
      this._elementChoiceMenu = null;
    }

    this._resolveCreatureElementChanged(slot, previousElement, element);
    this._recalculateAllFieldCreatures();
    this._toast(`Elemento alterado para ${ELEMENT_LABEL[element] ?? element}.`);
  }

  _scheduleDelayedEffect(slot, source, delayedEffect) {
    const resolveTurn =
      delayedEffect.trigger === "end_of_next_turn"
        ? this._turnNumber + 1
        : this._turnNumber;

    this._delayedEffects.push({
      ...delayedEffect,
      source,
      slot,
      resolveTurn,
    });
  }

  _summonTokenToFirstEmptyZone(tokenCard) {
    const slot = this._slotsMy.find((s) => !s.card);
    if (!slot) {
      this._toast("Sem zona vazia para criar ficha.");
      return false;
    }

    const creature = createCreatureInstance(tokenCard);
    const tokenObject = this._createCardObject(
      tokenCard,
      slot.x,
      slot.y,
      false,
    );
    tokenObject.setDepth(8);
    tokenObject.setData("source", "field");
    tokenObject.setData("slot", slot);
    tokenObject.setData("abilityState", { usedAbilities: {} });
    tokenObject.setInteractive({ useHandCursor: true });
    tokenObject.on("pointerdown", () => this._handleCardClick(tokenObject));

    this._addFieldStatsOverlay(tokenObject, creature);
    slot.card = creature;
    slot.cardObject = tokenObject;
    slot.attachments = slot.attachments ?? [];

    this._resolveCreatureEnterField(slot);
    this._recalculateAllFieldCreatures();
    this._toast(`${tokenCard.name} criada.`);
    return true;
  }

  _recalculateAllFieldCreatures() {
    this._recalculateFieldCreatures(this._slotsMy);
    this._recalculateFieldCreatures(this._slotsOpp);
  }

  _recalculateFieldCreatures(slots) {
    slots.forEach((slot) => {
      if (!slot.card) return;
      recalculateCreatureStats(
        slot.card,
        slot.attachments.map((entry) => entry.card),
        {
          yourField: slots,
        },
      );
      this._refreshFieldStatsOverlay(slot);
    });
  }

  _fieldCreatureAbilities(cardObject) {
    const card = cardObject.getData("cardData");
    const slot = cardObject.getData("slot");
    const sourceState = cardObject.getData("abilityState") ?? {
      usedAbilities: {},
    };
    if (!slot?.card) return [];

    return (card.activatedAbilities ?? []).filter((ability) => {
      if (ability.source !== "field_creature") return false;
      if (
        ability.condition?.active_player === "opponent" &&
        this._activePlayer !== "opp"
      )
        return false;
      return canActivateAbility(ability, {
        creature: slot.card,
        source: card,
        sourceState,
        turn: this._turnNumber,
      });
    });
  }

  async _activateFieldCreatureAbility(cardObject) {
    const ability = this._fieldCreatureAbilities(cardObject)[0];
    const slot = cardObject.getData("slot");
    const sourceState = cardObject.getData("abilityState") ?? {
      usedAbilities: {},
    };
    if (!ability || !slot?.card) {
      this._toast("Habilidade indisponível.");
      return false;
    }

    const resolved =
      this._payCreatureAbilityCost(slot, ability.cost) &&
      (await this._resolveCreatureAbilityAction(slot, ability.action));
    if (!resolved) {
      this._toast("Não foi possível ativar.");
      return false;
    }

    if (ability.timing === "once_per_turn") {
      sourceState.usedAbilities = sourceState.usedAbilities ?? {};
      sourceState.usedAbilities[ability.id] = this._turnNumber;
      cardObject.setData("abilityState", sourceState);
    }

    this._recalculateAllFieldCreatures();
    this._toast("Habilidade ativada.");
    this._logAction(`${slot.card?.name ?? "Criatura"} ativou uma habilidade.`);
    return true;
  }

  _payCreatureAbilityCost(slot, cost) {
    if (!cost) return true;

    if (cost.type === "destroy_attachment") {
      const index = (slot.attachments ?? []).findIndex((entry) => {
        const name = String(
          entry.card?.name ?? entry.card?.nome ?? "",
        ).toLowerCase();
        return name.includes(String(cost.name_includes ?? "").toLowerCase());
      });
      if (index === -1) return false;
      this._discardAttachment(slot, index);
      return true;
    }

    if (cost.type === "sacrifice_self") {
      this._sendFieldCreatureToDiscard(slot, "my", "efeito");
      return true;
    }

    return false;
  }

  async _resolveCreatureAbilityAction(sourceSlot, action) {
    if (!action) return true;

    if (action.type === "cannot_attack_next_turn") {
      sourceSlot.card.cannotAttackUntilTurn = this._turnNumber + 1;
      return true;
    }

    if (action.type === "summon_from_discard") {
      const slot = this._slotsMy.find((s) => !s.card);
      if (!slot) return false;
      const index = this.myDiscard.findIndex((card) =>
        this._matchesCardRule(card, action.filter ?? {}),
      );
      if (index === -1) return false;
      const [card] = this.myDiscard.splice(index, 1);
      this._summonCreatureToSlot(card, slot);
      this._renderDiscardPile();
      return true;
    }

    if (action.type === "force_enemy_attack_your_creature") {
      return this._resolveForceEnemyAttackYourCreature(action);
    }

    this._toast("Efeito preparado para a próxima camada de regras.");
    return true;
  }

  async _resolveForceEnemyAttackYourCreature(action) {
    const enemyTargets = this._slotsOpp.filter((slot) => slot.card);
    if (!enemyTargets.length) {
      this._toast("O oponente não tem criatura para escolher.");
      return false;
    }

    const yourTargets = this._slotsMy.filter(
      (slot) => slot.card && matchesCreatureRule(slot.card, action.yourFilter ?? {}),
    );
    if (!yourTargets.length) {
      this._toast("Você não tem uma criatura válida para receber o ataque.");
      return false;
    }

    const enemySlot = await this._requestCreatureSlotChoiceAsync({
      title: "Escolha a criatura inimiga que será forçada a atacar.",
      side: "opp",
      slots: enemyTargets,
      color: 0xffaa44,
    });
    if (!enemySlot?.card) return false;

    const yourSlot = await this._requestCreatureSlotChoiceAsync({
      title: "Escolha a sua criatura que será atacada.",
      side: "my",
      slots: yourTargets,
      color: 0x66ddff,
    });
    if (!yourSlot?.card) return false;

    enemySlot.card.forcedAttackUntilTurn = this._turnNumber;
    enemySlot.card.forcedAttackTargetInstanceId = yourSlot.card.instanceId;
    enemySlot.card.forcedAttackTargetName = yourSlot.card.name;
    this._toast(`${enemySlot.card.name} deve atacar ${yourSlot.card.name}.`);
    this._logAction(`${enemySlot.card.name} foi forçada a atacar ${yourSlot.card.name}.`);
    return true;
  }

  _resolveCreatureEnterField(enteredSlot) {
    if (!enteredSlot?.card) return;
    const card = enteredSlot.card;

    this._resolveHeroCreatureEnterEffect(enteredSlot, "my");

    for (const effect of card.onEnter ?? []) {
      if (effect.type === "discard_hand_card_then_search_deck") {
        if (effect.optional) {
          this._openOptionalDiscardSearchPrompt(effect);
        } else {
          this._resolveDiscardHandCardThenSearch(effect);
        }
      } else if (effect.type === "mill_then_gain_defense_per_discard_element") {
        this._resolveMillThenGainDefense(card, effect);
      } else if (effect.type === "shuffle_discard_creature_then_debuff_enemy") {
        this._resolveShuffleDiscardCreatureThenDebuff(effect);
      }
    }

    this._resolveOtherCreatureEnterTriggers(enteredSlot);
  }

  _resolveDiscardHandCardThenSearch(effect) {
    const discardIndex = this.myHand.findIndex((card) =>
      this._matchesCardRule(card, effect.discard ?? {}),
    );
    if (discardIndex === -1) return;

    const [discarded] = this.myHand.splice(discardIndex, 1);
    this.myDiscard.push(discarded);
    this._notifyCardSentToDiscard(discarded);

    const searchIndex = this.myDeck.findIndex((card) =>
      this._matchesCardRule(card, effect.search ?? {}),
    );
    if (searchIndex !== -1 && this.myHand.length < MAX_HAND_SIZE) {
      const [found] = this.myDeck.splice(searchIndex, 1);
      this.myHand.push(found);
      this._toast(`${found.name} adicionada à mão.`);
    }

    this._renderHand(this.myHand);
    this._renderDeckPile();
    this._renderDiscardPile();
    this._playDiscardSmoke();
  }

  _openOptionalDiscardSearchPrompt(effect) {
    const discardCards = this.myHand.filter((card) =>
      this._matchesCardRule(card, effect.discard ?? {}),
    );
    if (!discardCards.length) return;

    this._requestYesNoChoice({
      title: "Ativar efeito?",
      message:
        "Descartar uma carta com Tridente para buscar uma carta com Atlantis no baralho.",
      onConfirm: () => this._openDiscardCardChoice(effect, discardCards),
      onCancel: () => this._toast("Efeito não ativado."),
    });
  }

  _openDiscardCardChoice(effect, discardCards) {
    this._requestCardChoice({
      title: "Escolha o Tridente para descartar",
      cards: discardCards,
      emptyMessage: "Você não tem Tridente na mão.",
      accent: 0x4caf50,
      buttonColor: "#16385c",
      maxVisible: 6,
      labelForCard: (card) => card.name,
      onSelect: (card) => this._payAtlasDiscardAndChooseSearch(effect, card),
    });
  }

  _payAtlasDiscardAndChooseSearch(effect, discardCard) {
    const discardIndex = this.myHand.findIndex((card) => card === discardCard);
    if (discardIndex === -1) {
      this._closeEffectChoiceModal();
      return;
    }

    const [discarded] = this.myHand.splice(discardIndex, 1);
    this.myDiscard.push(discarded);
    this._notifyCardSentToDiscard(discarded);
    this._renderHand(this.myHand);
    this._renderDiscardPile();
    this._playDiscardSmoke();
    this._openDeckSearchChoice(effect);
  }

  _openDeckSearchChoice(effect) {
    this._requestDeckCardChoice({
      title: "Escolha uma carta Atlantis",
      filter: effect.search ?? {},
      emptyMessage: "Nenhuma carta com Atlantis encontrada no baralho.",
      accent: 0x4caf50,
      buttonColor: "#16385c",
      maxVisible: 10,
      labelForCard: (card) => `${card.name} (${card.card_type})`,
      onSelect: (card) => {
        const deckIndex = this.myDeck.findIndex(
          (deckCard) => deckCard === card,
        );
        if (deckIndex !== -1) {
          const [found] = this.myDeck.splice(deckIndex, 1);
          this.myHand.push(found);
          this._renderDeckPile();
          this._renderHand(this.myHand);
          this._toast(`${found.name} adicionada à mão.`);
          this._logAction(`${found.name} foi buscada do baralho.`);
        }
      },
    });
  }

  _closeEffectChoiceModal() {
    if (this._commandResponseTimer) {
      this._commandResponseTimer.remove(false);
      this._commandResponseTimer = null;
    }
    if (!this._effectChoiceModal) return;
    this._effectChoiceModal.destroy(true);
    this._effectChoiceModal = null;
  }

  _resolveMillThenGainDefense(creature, effect) {
    const count = Math.min(Number(effect.mill) || 0, this.myDeck.length);
    for (let i = 0; i < count; i++) {
      const discarded = this.myDeck.shift();
      this.myDiscard.push(discarded);
      this._notifyCardSentToDiscard(discarded);
    }

    const elements = new Set(
      this.myDiscard
        .map((card) => card.element ?? card.elemento)
        .filter(Boolean),
    );
    this._addPermanentMarker(
      creature,
      ["defense"],
      elements.size * (Number(effect.value) || 0),
    );
    this._renderDeckPile();
    this._renderDiscardPile();
    this._playDiscardSmoke();
  }

  _resolveShuffleDiscardCreatureThenDebuff(effect) {
    const discardIndex = this.myDiscard.findIndex(
      (card) =>
        card.card_type === "criatura" &&
        this._matchesCardRule(card, effect.discardFilter ?? {}),
    );
    const targetSlot = this._slotsOpp.find((slot) => slot.card);
    if (discardIndex === -1 || !targetSlot?.card) return;

    const [shuffled] = this.myDiscard.splice(discardIndex, 1);
    this.myDeck.push(shuffled);
    this.myDeck = this._shuffleCards(this.myDeck);

    const value = Number(shuffled.attack ?? shuffled.ataque) || 0;
    targetSlot.card.tempModifiers = [
      ...(targetSlot.card.tempModifiers ?? []),
      {
        expiresOnTurn: this._turnNumber,
        attack: -value,
        defense: 0,
      },
    ];
    this._renderDeckPile();
    this._renderDiscardPile();
    this._logAction(
      `${shuffled.name} voltou ao baralho e reduziu ATQ inimigo.`,
    );
  }

  _resolveOtherCreatureEnterTriggers(enteredSlot) {
    for (const sourceSlot of this._slotsMy) {
      if (!sourceSlot.card || sourceSlot === enteredSlot) continue;
      for (const ability of sourceSlot.card.triggeredAbilities ?? []) {
        if (ability.trigger !== "other_creature_enters") continue;
        if (!matchesCreatureRule(enteredSlot.card, ability.filter ?? {}))
          continue;
        this._resolveCreatureTriggerAction(
          sourceSlot,
          ability.action,
          enteredSlot.card,
        );
      }
    }
  }

  _resolveCreatureElementChanged(changedSlot, previousElement, newElement) {
    if (!changedSlot?.card || previousElement === newElement) return;

    for (const sourceSlot of this._slotsMy) {
      if (!sourceSlot.card) continue;
      for (const ability of sourceSlot.card.triggeredAbilities ?? []) {
        const ownChange = ability.trigger === "your_creature_element_changed";
        const selfChange =
          ability.trigger === "self_element_changed" &&
          sourceSlot === changedSlot;
        if (!ownChange && !selfChange) continue;
        if (!matchesCreatureRule(changedSlot.card, ability.filter ?? {}))
          continue;
        this._resolveCreatureTriggerAction(
          sourceSlot,
          ability.action,
          changedSlot.card,
        );
      }
    }

    for (const attachment of [...(changedSlot.attachments ?? [])]) {
      for (const ability of attachment.card?.triggeredAbilities ?? []) {
        if (ability.trigger !== "attached_creature_element_changed") continue;
        this._enqueueEffectResolution({
          type: "attachment_element_changed",
          slot: changedSlot,
          attachment,
          action: ability.action,
        });
      }
    }
  }

  async _resolveAttachmentElementChanged({ slot, attachment, action }) {
    if (!slot?.card || !attachment?.card || !action) return;
    if (!(slot.attachments ?? []).includes(attachment)) return;

    if (action.type === "optional_swap_allied_creature_stats_until_end_turn") {
      const targets = this._slotsMy.filter(
        (candidate) =>
          candidate.card && matchesCreatureRule(candidate.card, action.filter ?? {}),
      );
      const wantsToSwap = targets.length
        ? await this._requestYesNoChoiceAsync({
            title: attachment.card.name,
            message: "O elemento foi alterado. Deseja trocar ATQ e VIDA de uma criatura com Contos no nome até o fim do turno?",
            confirmLabel: "ESCOLHER",
            cancelLabel: "NÃO",
          })
        : false;
      if (wantsToSwap) {
        const target = await this._requestCreatureSlotChoiceAsync({
          title: "Escolha a criatura com Contos no nome.",
          side: "my",
          slots: targets,
          color: 0x72d8ff,
        });
        if (target?.card) {
          const attack = Number(target.card.currentStats?.attack ?? target.card.attack ?? 0);
          const defense = Number(target.card.currentStats?.defense ?? target.card.defense ?? 0);
          target.card.tempModifiers = [
            ...(target.card.tempModifiers ?? []),
            {
              expiresOnTurn: this._turnNumber,
              attack: defense - attack,
              defense: attack - defense,
            },
          ];
          this._recalculateAllFieldCreatures();
          this._toast(`${target.card.name} trocou ATQ e VIDA até o fim do turno.`);
          this._logAction(`${attachment.card.name} trocou os atributos de ${target.card.name}.`);
        }
      }
    }

    if (action.return_attachment_to_hand) {
      const index = slot.attachments.indexOf(attachment);
      if (index >= 0) slot.attachments.splice(index, 1);
      attachment.object?.destroy(true);
      this.myHand.push(attachment.card);
      this._renderHand(this.myHand);
      this._discardRandomIfHandOverflow();
      this._recalculateAllFieldCreatures();
      this._toast(`${attachment.card.name} retornou para sua mão.`);
      this._logAction(`${attachment.card.name} retornou para a mão após a alteração de elemento.`);
    }
  }

  _resolveCreatureSentToDiscard(card, owner) {
    if (owner !== "my") return;

    for (const sourceSlot of this._slotsMy) {
      if (!sourceSlot.card) continue;
      for (const ability of sourceSlot.card.triggeredAbilities ?? []) {
        if (ability.trigger !== "other_creature_sent_to_your_discard") continue;
        if (!matchesCreatureRule(card, ability.filter ?? {})) continue;
        this._resolveCreatureTriggerAction(sourceSlot, ability.action, card);
      }
    }
  }

  _resolveDestroyedByCreatureTriggers(card, destroyerSlot) {
    if (!destroyerSlot?.card) return;
    for (const ability of card.triggeredAbilities ?? []) {
      if (ability.trigger !== "destroyed_by_creature") continue;
      if (ability.action?.type !== "deal_damage_to_destroyer") continue;
      this._dealDamageToCreature(
        destroyerSlot,
        ability.action.damage ?? 0,
        this._slotsMy.includes(destroyerSlot) ? this._slotsMy : this._slotsOpp,
      );
    }
  }

  _resolveCreatureTriggerAction(sourceSlot, action, triggerCard) {
    if (!action) return false;

    if (action.type === "add_permanent_marker") {
      const target = action.target === "self" ? sourceSlot?.card : triggerCard;
      return this._addPermanentMarker(target, action.stats, action.value);
    }

    if (action.type === "add_marker_to_your_creature") {
      return this._queueDiscardTriggeredAbility(triggerCard, action);
    }

    if (action.type === "summon_from_deck") {
      const count = Number(action.count) || 1;
      let summoned = 0;
      for (let i = this.myDeck.length - 1; i >= 0 && summoned < count; i--) {
        if (!this._matchesCardRule(this.myDeck[i], action.filter ?? {}))
          continue;
        const slot = this._slotsMy.find((s) => !s.card);
        if (!slot) break;
        const [card] = this.myDeck.splice(i, 1);
        this._summonCreatureToSlot(card, slot);
        summoned += 1;
      }
      this._renderDeckPile();
      return summoned > 0;
    }

    if (action.type === "summon_token") {
      const token = applySummonToken({ token: action.token });
      return token ? this._summonTokenToFirstEmptyZone(token) : false;
    }

    if (action.type === "choose_enemy_creature_prevent_attack_next_turn") {
      const targets = this._slotsOpp.filter((slot) => slot.card);
      if (!targets.length) return false;

      const applyPreventAttack = (targetSlot) => {
        if (!targetSlot?.card) return;
        targetSlot.card.cannotAttackUntilTurn = this._turnNumber + 1;
        this._toast(
          `${targetSlot.card.name} não poderá atacar no próximo turno.`,
        );
        this._logAction(
          `${triggerCard.name} impediu ${targetSlot.card.name} de atacar no próximo turno.`,
        );
      };

      this._requestCreatureSlotChoice({
        title: `Escolha uma criatura inimiga para o efeito de ${triggerCard.name}.`,
        side: "opp",
        slots: targets,
        color: 0xa988ff,
        onSelect: applyPreventAttack,
        onCancel: () => this._toast("Efeito não ativado."),
      });
      return true;
    }

    this._logAction(
      "Efeito de criatura registrado para implementação de escolha/resposta.",
    );
    return false;
  }

  _sendFieldCreatureToDiscard(slot, owner, reason = "efeito") {
    if (!slot?.card) return false;
    const card = slot.card;
    const cardObject = slot.cardObject;
    const attachments = [...(slot.attachments ?? [])];
    const discard = owner === "my" ? this.myDiscard : this.oppDiscard;

    if (!card.isToken) {
      discard.push(card);
      this._animateFieldObjectToDiscard(cardObject, owner);
    } else {
      this._animateFieldObjectVanish(cardObject);
    }
    attachments.forEach((attachment, index) => {
      if (attachment.card) discard.push(attachment.card);
      this._notifyAttachmentSentToDiscard(attachment.card, owner);
      this._animateFieldObjectToDiscard(attachment.object, owner, {
        delay: 80 + index * 70,
        scale: 0.58,
      });
    });
    slot.card = null;
    slot.cardObject = null;
    slot.attachments = [];

    if (!card.isToken) {
      this._resolveCreatureSentToDiscard(card, owner);
      this._notifyCardSentToDiscard(card, owner);
    }
    this._logAction(
      card.isToken
        ? `${card.name} desapareceu por ${reason}.`
        : `${card.name} foi enviada ao descarte por ${reason}.`,
    );
    return true;
  }

  _notifyAttachmentSentToDiscard(card, owner = "my", { battle = false } = {}) {
    if (owner !== "my" || battle || this._currentPhase === "battle") return;
    for (const ability of card?.triggeredAbilities ?? []) {
      if (
        ability.trigger ===
        "attachment_sent_from_field_to_your_discard_outside_battle"
      ) {
        this._enqueueEffectResolution({
          type: "attachment_discard_trigger",
          card,
          action: ability.action,
        });
      }
    }
  }

  async _resolveAttachmentDiscardTrigger({ card, action }) {
    if (!card || action?.type !== "optional_draw_cards") return;
    const wantsToDraw = await this._requestYesNoChoiceAsync({
      title: card.name,
      message: "Esta carta foi enviada do campo ao descarte. Deseja comprar uma carta?",
      confirmLabel: "COMPRAR",
      cancelLabel: "NÃO",
    });
    if (!wantsToDraw) return;
    const count = Math.min(Number(action.count) || 1, this.myDeck.length);
    if (!count) {
      this._toast("Seu baralho não possui cartas para comprar.");
      return;
    }
    this._animateDrawCardsFromDeck(count);
    this._logAction(`${card.name} permitiu comprar ${count} carta(s).`);
  }

  _addPermanentMarker(creature, stats = [], value = 0, markerName = null) {
    if (!creature) return false;
    const amount = Number(value) || 0;
    if (!amount) return false;
    const list = Array.isArray(stats) ? stats : [stats];
    creature.permanentModifiers = [
      ...(creature.permanentModifiers ?? []),
      {
        name: markerName,
        attack: list.includes("attack") ? amount : 0,
        defense: list.includes("defense") ? amount : 0,
      },
    ];
    return true;
  }

  _resolveHeroCreatureEnterEffect(enteredSlot, owner = "my") {
    const hero = owner === "my" ? this._myHero : this._opponentHero;
    const slots = owner === "my" ? this._slotsMy : this._slotsOpp;
    const creature = enteredSlot?.card;
    if (hero?.key !== "badur" || creature?.element !== "terra") return false;
    if (creature.badurStoneSkinApplied) return false;

    creature.badurStoneSkinApplied = true;
    this._addPermanentMarker(creature, ["defense"], 1, "Pele de Pedra");
    recalculateCreatureStats(
      creature,
      enteredSlot.attachments.map((entry) => entry.card),
      { yourField: slots },
    );
    this._refreshFieldStatsOverlay(enteredSlot);
    this._showHeroActivation(hero, owner);
    this._playBadurStoneEffect(enteredSlot);

    const ownerName = owner === "my" ? "Badur" : "Badur inimigo";
    this._toast(`${ownerName}: ${creature.name} recebeu +1 de vida máxima.`);
    this._logAction(`${ownerName} concedeu Pele de Pedra a ${creature.name}.`);
    return true;
  }

  _queueDiscardTriggeredAbility(card, action) {
    if (!card || !action || !this._slotsMy?.some((slot) => slot.card)) return false;
    this._discardTriggerBuffer.push({
      card,
      action,
      optional: true,
      priority: 20,
    });

    if (!this._discardTriggerBatchEvent) {
      this._discardTriggerBatchEvent = this.time.delayedCall(0, () => {
        const jobs = this._discardTriggerBuffer.splice(0);
        this._discardTriggerBatchEvent = null;
        if (jobs.length) this._enqueueEffectResolution({ type: "trigger_stack", jobs });
      });
    }
    return true;
  }

  async _resolveTriggeredEffectStack(jobs = []) {
    const pending = [...jobs];
    while (pending.length && this.sys.isActive()) {
      const priority = Math.min(...pending.map((job) => Number(job.priority) || 100));
      const samePriority = pending.filter(
        (job) => (Number(job.priority) || 100) === priority,
      );
      let job = samePriority[0];

      if (samePriority.length > 1 && this._activePlayer === "my") {
        const selected = await this._requestCardChoiceAsync({
          title: "Escolha o próximo efeito da corrente",
          cards: samePriority.map((candidate) => ({ card: candidate.card, job: candidate })),
          emptyMessage: "Nenhum efeito disponível.",
          accent: 0x61d5ff,
          buttonColor: "#16385c",
          maxVisible: 6,
          labelForCard: (card) => card.name,
        });
        job = selected?.job ?? job;
      }

      pending.splice(pending.indexOf(job), 1);
      await this._resolveDiscardTriggeredAbility(job);
    }
  }

  async _resolveDiscardTriggeredAbility({ card, action }) {
    while (this._effectChoiceModal && this.sys.isActive()) await this._wait(120);
    if (!this.sys.isActive()) return;

    this._playDiscardTriggerGlow("my");
    await this._wait(520);
    const wantsToActivate = await this._requestYesNoChoiceAsync({
        title: "Efeito do Mímico",
        message: `O Mímico do Baú gatilhou seu efeito. Deseja ativar a Marca do Mímico?`,
        confirmLabel: "ATIVAR",
        cancelLabel: "NÃO",
    });
    if (!wantsToActivate) {
      this._toast("Efeito do Mímico não ativado.");
      return;
    }

    const target = await this._requestCreatureSlotChoiceAsync({
      title: "Escolha uma criatura aliada para receber a Marca do Mímico.",
      side: "my",
      slots: this._slotsMy.filter((slot) => slot.card),
      color: 0x61d5ff,
    });
    if (!target?.card) {
      this._toast("Nenhuma criatura foi escolhida para a Marca do Mímico.");
      return;
    }

    this._addPermanentMarker(
      target.card,
      action.stats,
      action.value,
      "Marca do Mímico",
    );
    this._recalculateAllFieldCreatures();
    this._playMimicMarkerEffect(target);
    this._toast(`${target.card.name} recebeu a Marca do Mímico: +1/+1.`);
    this._logAction(`${card.name} concedeu Marca do Mímico a ${target.card.name}.`);
    if (!this._isSoloMode()) {
      this._sendAction("mimic_marker", {
        slot: this._slotsMy.indexOf(target),
        amount: Number(action.value) || 1,
      });
    }
  }

  _notifyCardSentToDiscard(card, owner = "my") {
    if (owner !== "my") return;
    for (const ability of card?.triggeredAbilities ?? []) {
      if (ability.trigger === "sent_to_your_discard") {
        this._queueDiscardTriggeredAbility(card, ability.action);
      }
    }
  }

  _playDiscardTriggerGlow(owner = "my") {
    const pile = owner === "opp" ? this._oppDiscardPileContainer : this._discardPileContainer;
    if (!pile) return;

    const glow = this.add.rectangle(pile.x, pile.y, 102, 132, 0x000000, 0)
      .setStrokeStyle(3, 0x61d5ff, 1)
      .setDepth(98);
    const label = this.add.text(pile.x, pile.y - 82, "EFEITO NO DESCARTE", {
      fontSize: "10px",
      color: "#baf4ff",
      fontStyle: "bold",
      stroke: "#06111f",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(99);
    this.tweens.add({
      targets: glow,
      scaleX: 1.35,
      scaleY: 1.24,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => glow.destroy(),
    });
    this.tweens.add({
      targets: label,
      y: label.y - 20,
      alpha: 0,
      delay: 360,
      duration: 360,
      onComplete: () => label.destroy(),
    });
  }

  _playMimicMarkerEffect(slot) {
    const marker = this.add.text(slot.x, slot.y - 72, "+1 / +1", {
      fontSize: "17px",
      color: "#61d5ff",
      fontStyle: "bold",
      stroke: "#062235",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(32);
    this.tweens.add({
      targets: marker,
      y: marker.y - 32,
      alpha: 0,
      duration: 760,
      ease: "Cubic.easeOut",
      onComplete: () => marker.destroy(),
    });
  }

  _playBadurStoneEffect(slot) {
    const effect = this.add.circle(slot.x, slot.y, 22, 0xc9b27a, 0.18)
      .setStrokeStyle(2, 0xf0d59a, 0.95)
      .setDepth(28);
    this.tweens.add({
      targets: effect,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => effect.destroy(),
    });
  }

  _matchesCardRule(card, rule = {}) {
    return matchesCardRule(card, rule);
  }

  _processDelayedEffects(trigger) {
    const remaining = [];

    for (const delayed of this._delayedEffects) {
      const shouldResolve =
        delayed.trigger === trigger && this._turnNumber >= delayed.resolveTurn;
      if (!shouldResolve) {
        remaining.push(delayed);
        continue;
      }

      this._resolveDelayedEffect(delayed);
    }

    this._delayedEffects = remaining;
  }

  _resolveDelayedEffect(delayed) {
    if (delayed.target !== "attached_creature") return;
    const slot = delayed.slot;
    if (!slot?.card) return;

    if (delayed.effect?.type === "deal_damage") {
      this._dealDamageToCreature(slot, delayed.effect.value ?? 0);
    }
  }

  _dealDamageToCreature(slot, value, ownerSlots = this._slotsMy) {
    const damage = Number(value) || 0;
    if (!slot?.card || damage <= 0) return;

    slot.card.damageTaken = (slot.card.damageTaken ?? 0) + damage;
    recalculateCreatureStats(
      slot.card,
      slot.attachments.map((entry) => entry.card),
      {
        yourField: ownerSlots,
      },
    );
    this._refreshFieldStatsOverlay(slot);
    this._toast(`${slot.card.name} recebeu ${damage} de dano.`);
    if ((slot.card.currentStats?.defense ?? 1) <= 0) {
      this._destroyCreatureInBattle(
        slot,
        ownerSlots === this._slotsMy ? "my" : "opp",
      );
    }
  }

  _activatableAbilities(cardObject) {
    const card = cardObject.getData("cardData");
    const slot = cardObject.getData("slot");
    const sourceState = cardObject.getData("abilityState");
    if (!slot?.card) return [];

    return (card.activatedAbilities ?? []).filter((ability) =>
      canActivateAbility(ability, {
        creature: slot.card,
        source: card,
        sourceState,
        turn: this._turnNumber,
      }),
    );
  }

  _openAbilityElementChoice(cardObject) {
    const ability = this._activatableAbilities(cardObject)[0];
    if (!ability) {
      this._toast("Habilidade indisponível.");
      return;
    }

    if (ability.action?.type !== "change_element") return;

    this._clearCardActionMenu();
    if (this._elementChoiceMenu) this._elementChoiceMenu.destroy(true);

    const choices = ability.action.choose ?? [];
    this._elementChoiceMenu = this.add
      .container(cardObject.x, cardObject.y - 96)
      .setDepth(45);
    choices.forEach((element, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const btn = this.add
        .text((col - 1.5) * 70, row * 28, ELEMENT_LABEL[element] ?? element, {
          fontSize: "10px",
          color: "#ffffff",
          backgroundColor: "#1a3650",
          padding: { x: 8, y: 5 },
          fixedWidth: 64,
          align: "center",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#2f6f8f" }));
      btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#1a3650" }));
      btn.on("pointerdown", () =>
        this._activateChangeElement(cardObject, ability, element),
      );
      this._elementChoiceMenu.add(btn);
    });
  }

  _activateChangeElement(cardObject, ability, element) {
    const slot = cardObject.getData("slot");
    const card = cardObject.getData("cardData");
    const sourceState = cardObject.getData("abilityState");
    const previousElement = slot?.card?.element;

    const applied = activateAbility(ability, {
      creature: slot.card,
      source: card,
      sourceState,
      turn: this._turnNumber,
      choice: { element },
    });

    if (!applied) {
      this._toast("Não foi possível ativar.");
      return;
    }

    if (this._elementChoiceMenu) {
      this._elementChoiceMenu.destroy(true);
      this._elementChoiceMenu = null;
    }
    this._resolveCreatureElementChanged(slot, previousElement, element);
    this._recalculateAllFieldCreatures();
    this._toast(`Elemento alterado para ${ELEMENT_LABEL[element] ?? element}.`);
  }

  _placePendingSummon(slotIndex) {
    if (!this._pendingSummonCard) return;

    const slot = this._slotsMy[slotIndex];
    if (!slot || slot.card) return;

    const cardObject = this._pendingSummonCard;
    const cardData = cardObject.getData("cardData");
    this._pendingSummonCard = null;
    this._clearSummonZones();

    this._animateExistingCardTo(cardObject, slot.x, slot.y, {
      scale: 1,
      depth: 92,
      onComplete: () => {
        const creature = this._placeCreatureObjectInSlot(
          cardData,
          cardObject,
          slot,
        );
        this._recordPlayedCard(cardData);

        this._handContainers = this._handContainers.filter(
          (card) => card !== cardObject,
        );
        const handIndex = this.myHand.findIndex(
          (card) => card.id === cardData.id,
        );
        if (handIndex !== -1) this.myHand.splice(handIndex, 1);
        this._turnActions.summoned = true;

        this._resolveCreatureEnterField(slot);
        this._recalculateAllFieldCreatures();
        this._playSummonImpact(creature, slot);

        this._sendAction("play_card", {
          card_id: cardData.id,
          slot: slotIndex,
        });
        this._logAction(`${cardData.name} foi invocada.`);
      },
    });
  }

  _summonCreatureToSlot(cardData, slot, options = {}) {
    const cardObject = this._createCardObject(cardData, slot.x, slot.y, false);
    const creature = this._placeCreatureObjectInSlot(
      cardData,
      cardObject,
      slot,
      options,
    );
    this._resolveCreatureEnterField(slot);
    this._recalculateAllFieldCreatures();
    return creature;
  }

  _summonOpponentCreatureToSlot(cardData, slot, options = {}) {
    const cardObject = this._createCardObject(cardData, slot.x, slot.y, false);
    const creature = createCreatureInstance(cardData);
    const hasAptidao =
      String(cardData.efeito ?? cardData.effect ?? "")
        .toLowerCase()
        .includes("aptidão") ||
      String(cardData.efeito ?? cardData.effect ?? "")
        .toLowerCase()
        .includes("aptidao");

    creature.summonedTurn = this._turnNumber;
    creature.canAttackFromTurn =
      options.canAttackFromTurn ??
      (hasAptidao ? this._turnNumber : this._turnNumber + 1);

    cardObject.setPosition(slot.x, slot.y);
    cardObject.setDepth(8);
    cardObject.setData("source", "field");
    cardObject.setData("slot", slot);
    cardObject.setData("abilityState", { usedAbilities: {} });
    cardObject.removeAllListeners("pointerdown");
    cardObject.setInteractive({ useHandCursor: true });
    cardObject.on("pointerdown", () => this._handleCardClick(cardObject));

    this._addFieldStatsOverlay(cardObject, creature);
    slot.card = creature;
    slot.cardObject = cardObject;
    slot.attachments = slot.attachments ?? [];
    this._resolveHeroCreatureEnterEffect(slot, "opp");
    this._recalculateAllFieldCreatures();
    return creature;
  }

  _placeCreatureObjectInSlot(cardData, cardObject, slot, options = {}) {
    const creature = createCreatureInstance(cardData);
    const hasAptidao =
      String(cardData.efeito ?? cardData.effect ?? "")
        .toLowerCase()
        .includes("aptidão") ||
      String(cardData.efeito ?? cardData.effect ?? "")
        .toLowerCase()
        .includes("aptidao");

    creature.summonedTurn = this._turnNumber;
    creature.canAttackFromTurn =
      options.canAttackFromTurn ??
      (hasAptidao ? this._turnNumber : this._turnNumber + 1);

    cardObject.setPosition(slot.x, slot.y);
    cardObject.setDepth(8);
    cardObject.setData("source", "field");
    cardObject.setData("slot", slot);
    cardObject.setData("abilityState", { usedAbilities: {} });
    cardObject.removeAllListeners("pointerdown");
    cardObject.setInteractive({ useHandCursor: true });
    cardObject.on("pointerdown", () => this._handleCardClick(cardObject));
    this._addFieldStatsOverlay(cardObject, creature);
    slot.card = creature;
    slot.cardObject = cardObject;
    slot.attachments = slot.attachments ?? [];

    return creature;
  }

  _playSummonImpact(card, slot) {
    const rarity = card.raridade ?? card.rarity;
    if (!["lendario", "lendaria", "legendary"].includes(rarity)) return;

    this.cameras.main.shake(250, 0.002);
    const pulse = this.add
      .rectangle(slot.x, slot.y, slot.w + 26, slot.h + 26, 0xff44ff, 0.22)
      .setStrokeStyle(3, 0xffccff)
      .setDepth(7);

    this.tweens.add({
      targets: pulse,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  _addFieldStatsOverlay(cardObject, card) {
    if (card.card_type !== "criatura") return;

    const existing = cardObject.getData("statsOverlay");
    if (existing) existing.destroy(true);

    const stats = card.currentStats ?? {
      attack: card.attack ?? "-",
      defense: card.defense ?? "-",
    };
    const overlay = this.add.container(0, -48);
    const bg = this.add
      .rectangle(0, 0, 64, 24, 0x000000, 0.78)
      .setStrokeStyle(1, 0xffcc00);
    const atk = this.add
      .text(-17, 0, String(stats.attack ?? "-"), {
        fontSize: "14px",
        color: "#ffdd66",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const life = this.add
      .text(17, 0, String(stats.defense ?? "-"), {
        fontSize: "14px",
        color: "#88ddff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    overlay.add([bg, atk, life]);
    const markerNames = [...new Set(
      (card.permanentModifiers ?? [])
        .map((modifier) => modifier.name)
        .filter(Boolean),
    )];
    if (markerNames.length) {
      overlay.add(
        this.add
          .text(0, -19, markerNames.join(" | ").toUpperCase(), {
            fontSize: "7px",
            color: "#8fe8ff",
            fontStyle: "bold",
            stroke: "#06111f",
            strokeThickness: 2,
          })
          .setOrigin(0.5),
      );
    }
    cardObject.add(overlay);
    cardObject.setData("statsOverlay", overlay);
  }

  _refreshFieldStatsOverlay(slot) {
    if (!slot?.cardObject || !slot?.card) return;
    this._addFieldStatsOverlay(slot.cardObject, slot.card);
  }

  _openCardInspectPanel(card) {
    if (this._cardInspectPanel) {
      this._cardInspectPanel.destroy(true);
    }

    const panelX = 176;
    const panelY = 380;
    const panelW = 260;
    const panelH = 610;
    const imgKey = `card_${card.id}`;
    const hasImage = this.textures.exists(imgKey);

    this._cardInspectPanel = this.add.container(panelX, panelY).setDepth(25);

    const bg = this.add
      .rectangle(0, 0, panelW, panelH, 0x071018, 0.95)
      .setStrokeStyle(2, 0x4caf50);
    const close = this.add
      .text(panelW / 2 - 18, -panelH / 2 + 16, "X", {
        fontSize: "14px",
        color: "#ff7777",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on("pointerdown", () => {
      this._cardInspectPanel.destroy(true);
      this._cardInspectPanel = null;
    });

    const title = this.add
      .text(0, -panelH / 2 + 28, card.name, {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold",
        wordWrap: { width: panelW - 28 },
        align: "center",
      })
      .setOrigin(0.5, 0);

    let art;
    if (hasImage) {
      art = this.add
        .image(0, -panelH / 2 + 158, imgKey)
        .setDisplaySize(150, 210);
    } else {
      art = this.add
        .rectangle(0, -panelH / 2 + 158, 150, 210, card.color ?? 0x1a1a2e)
        .setStrokeStyle(1, 0x4caf50);
    }

    const infoLines = [
      `Tipo: ${card.card_type}`,
      `Elemento: ${ELEMENT_LABEL[card.element] ?? card.element ?? "-"}`,
      `Raridade: ${card.raridade ?? card.rarity ?? "-"}`,
    ];
    if (card.card_type === "criatura") {
      infoLines.push(
        `ATQ: ${card.attack ?? "-"}   VIDA: ${card.defense ?? "-"}`,
      );
    }

    const info = this.add
      .text(-panelW / 2 + 18, -panelH / 2 + 282, infoLines.join("\n"), {
        fontSize: "12px",
        color: "#cfe8cf",
        lineSpacing: 5,
      })
      .setOrigin(0, 0);

    const effectTitle = this.add
      .text(-panelW / 2 + 18, -panelH / 2 + 372, "EFEITO", {
        fontSize: "12px",
        color: "#8fb8ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);

    const effectText = this.add
      .text(
        -panelW / 2 + 18,
        -panelH / 2 + 394,
        card.efeito ?? card.effect ?? "-",
        {
          fontSize: "11px",
          color: "#dddddd",
          wordWrap: { width: panelW - 36 },
          lineSpacing: 4,
        },
      )
      .setOrigin(0, 0);

    this._cardInspectPanel.add([
      bg,
      close,
      title,
      art,
      info,
      effectTitle,
      effectText,
    ]);
  }

  _openMulliganModal() {
    if (this._mulliganOffered || this._mulliganModal) return;
    this._mulliganOffered = true;

    const { width, height } = this.cameras.main;
    const cardW = 96;
    const cardH = 134;
    const gap = 18;
    const totalW = this.myHand.length * cardW + (this.myHand.length - 1) * gap;
    const startX = (width - totalW) / 2;
    let remaining = 15;

    this._mulliganModal = this.add.container(0, 0).setDepth(80);
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.72)
      .setOrigin(0)
      .setInteractive();
    const panel = this.add
      .rectangle(width / 2, height / 2, 760, 330, 0x071018, 0.96)
      .setStrokeStyle(2, 0x4caf50);
    const title = this.add
      .text(width / 2, height / 2 - 132, "MULLIGAN", {
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(
        width / 2,
        height / 2 - 106,
        "Escolha manter sua mão inicial ou comprar 5 novas cartas.",
        {
          fontSize: "13px",
          color: "#cccccc",
        },
      )
      .setOrigin(0.5);
    const countdown = this.add
      .text(width / 2, height / 2 + 104, `Fechando em ${remaining}s`, {
        fontSize: "12px",
        color: "#8fb8ff",
      })
      .setOrigin(0.5);

    this._mulliganModal.add([overlay, panel, title, subtitle, countdown]);

    this.myHand.forEach((card, i) => {
      const x = startX + i * (cardW + gap) + cardW / 2;
      const preview = this._createCardObject(card, x, height / 2 - 16, false);
      preview.setScale(cardW / 80, cardH / 112);
      this._mulliganModal.add(preview);
    });

    const keepBtn = this.add
      .text(width / 2 - 90, height / 2 + 142, "MANTER MÃO", {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#1b5e20",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    keepBtn.on("pointerover", () =>
      keepBtn.setStyle({ backgroundColor: "#2e7d32" }),
    );
    keepBtn.on("pointerout", () =>
      keepBtn.setStyle({ backgroundColor: "#1b5e20" }),
    );
    keepBtn.on("pointerdown", () => this._closeMulliganModal());

    const mulliganBtn = this.add
      .text(width / 2 + 90, height / 2 + 142, "MULIGAR", {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#8a4a12",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    mulliganBtn.on("pointerover", () =>
      mulliganBtn.setStyle({ backgroundColor: "#b86418" }),
    );
    mulliganBtn.on("pointerout", () =>
      mulliganBtn.setStyle({ backgroundColor: "#8a4a12" }),
    );
    mulliganBtn.on("pointerdown", () => this._mulliganHand());

    this._mulliganModal.add([keepBtn, mulliganBtn]);

    this._mulliganTimer = this.time.addEvent({
      delay: 1000,
      repeat: 14,
      callback: () => {
        remaining--;
        countdown.setText(`Fechando em ${remaining}s`);
        if (remaining <= 0) this._closeMulliganModal();
      },
    });
  }

  _closeMulliganModal() {
    if (this._mulliganTimer) {
      this._mulliganTimer.remove(false);
      this._mulliganTimer = null;
    }
    if (this._mulliganModal) {
      this._mulliganModal.destroy(true);
      this._mulliganModal = null;
    }
    this._startMatchTurns();
  }

  async _startMatchTurns() {
    if (this._currentPhase !== "setup") return;

    await this._heroesReady;
    if (!this.sys.isActive() || this._currentPhase !== "setup") return;

    this._activePlayer = this._isSoloMode()
      ? Math.random() < 0.5
        ? "my"
        : "opp"
      : this._getActivePlayerSideFromRoom();
    this._turnNumber = Number(this.room?.game_state?.turn_number) || 1;
    this._beginTurn(this._activePlayer, this._getCurrentPhaseFromRoom());
  }

  _beginTurn(player, phase = "main") {
    if (this._gameOver) return;

    this._activePlayer = player;
    this._currentPhase = phase === "battle" ? "battle" : "main";
    this._turnActions = { summoned: false, attached: false, scenario: false };
    this._scenarioTurnFlags = {};
    this._clearExpiredTemporaryEffects();
    this._updateTurnUi();
    this._logAction(
      player === "my" ? "Seu turno começou." : "Turno do oponente começou.",
    );
    this._showTurnBanner(player === "my" ? "SEU TURNO!" : "TURNO INIMIGO!");
    this._startTurnFuse();
    if (this._currentPhase === "battle" && player === "my")
      this._renderBattleAttackButtons();

    if (this._turnNumber > 1) {
      if (player === "my") {
        this._animateDrawCardsFromDeck(1);
      } else {
        this._opponentDrawCard();
      }
    }

    this._applyStartOfTurnHeroEffect(player);

    if (this._isSoloMode() && player === "opp") {
      this.time.delayedCall(900, () => this._runSoloOpponentTurn());
    }
  }

  _applyStartOfTurnHeroEffect(player) {
    if (!this._isSoloMode() && player !== "my") return;

    const hero = player === "my" ? this._myHero : this._opponentHero;
    if (hero?.key !== "ispisher") return;

    const slots = player === "my" ? this._slotsMy : this._slotsOpp;
    this._showHeroActivation(hero, player);
    const candidates = slots
      .filter((slot) => slot.card)
      .map((slot) => ({
        slot,
        currentLife: Number(slot.card.currentStats?.defense ?? slot.card.defense ?? 0),
        maxLife: Number(slot.card.currentStats?.defense ?? slot.card.defense ?? 0)
          + Number(slot.card.damageTaken ?? 0),
      }))
      .filter(({ currentLife, maxLife }) => currentLife > 0 && currentLife < maxLife)
      .sort((a, b) => a.currentLife - b.currentLife);

    const target = candidates[0]?.slot;
    if (!target?.card) {
      const owner = player === "my" ? "Ispisher" : "Ispisher inimigo";
      this._toast(`${owner}: não há criatura ferida para curar.`);
      this._logAction(`${owner} ativou Maré Restauradora, mas não havia criatura ferida.`);
      console.info("[EZone Hero] Ispisher ativado sem alvo", { player, hero });
      return;
    }

    target.card.damageTaken = Math.max(0, Number(target.card.damageTaken ?? 0) - 1);
    recalculateCreatureStats(
      target.card,
      target.attachments.map((entry) => entry.card),
      { yourField: slots },
    );
    this._refreshFieldStatsOverlay(target);
    this._playHeroHealEffect(target);

    const owner = player === "my" ? "Ispisher" : "Ispisher inimigo";
    this._toast(`${owner} curou 1 de vida de ${target.card.name}.`);
    this._logAction(`${owner} curou 1 de vida de ${target.card.name}.`);
    console.info("[EZone Hero] Ispisher curou criatura", {
      player,
      hero,
      target: target.card.name,
      remainingDamage: target.card.damageTaken,
    });

    if (player === "my" && !this._isSoloMode()) {
      this._sendAction("hero_heal", {
        hero_key: "ispisher",
        slot: slots.indexOf(target),
        amount: 1,
      });
    }
  }

  _playHeroHealEffect(slot) {
    const effect = this.add.circle(slot.x, slot.y, 20, 0x72ffb2, 0.16)
      .setStrokeStyle(2, 0x72ffb2, 0.9)
      .setDepth(28);
    this.tweens.add({
      targets: effect,
      scaleX: 2.1,
      scaleY: 2.1,
      alpha: 0,
      duration: 430,
      ease: "Sine.easeOut",
      onComplete: () => effect.destroy(),
    });
  }

  _showHeroActivation(hero, player) {
    const panel = player === "my" ? this._myHeroPanel : this._opponentHeroPanel;
    const x = panel?.x ?? this.cameras.main.width / 2;
    const y = panel?.y ?? this.cameras.main.height / 2;
    const isBadur = hero?.key === "badur";
    const color = isBadur ? 0xb8aa78 : 0x72ffb2;
    const pulse = this.add.circle(x, y, 28, color, 0.18)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(110);
    const label = this.add.text(x, y - 48, `${hero.name}\n${hero.effect_name ?? "EFEITO DO HERÓI"}`.toUpperCase(), {
      fontSize: "12px",
      color: "#c6ffe2",
      fontStyle: "bold",
      align: "center",
      stroke: "#062518",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(111);

    this.tweens.add({
      targets: pulse,
      scaleX: 3.4,
      scaleY: 3.4,
      alpha: 0,
      duration: 650,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
    this.tweens.add({
      targets: label,
      y: y - 72,
      alpha: 0,
      delay: 450,
      duration: 400,
      ease: "Sine.easeIn",
      onComplete: () => label.destroy(),
    });
  }

  _advancePhase() {
    if (this._gameOver) return;
    if (this._activePlayer !== "my") return;

    if (this._currentPhase === "main") {
      this._currentPhase = "battle";
      this._updateTurnUi();
      this._showTurnBanner("FASE DE BATALHA");
      this._renderBattleAttackButtons();
      this._sendAction("phase_change", { phase: "battle" });
      return;
    }

    if (this._currentPhase === "battle") {
      this._endTurn();
    }
  }

  _endTurn() {
    if (this._gameOver) return;
    this._stopTurnFuse();
    this._clearBattleAttackButtons();
    this._resolveEndTurnAttachmentTriggers(this._activePlayer);
    this._processDelayedEffects("end_of_next_turn");
    this._clearExpiredTemporaryEffects();
    this._sendAction("end_turn", {});

    this._turnNumber += 1;
    this._beginTurn(this._activePlayer === "my" ? "opp" : "my");
  }

  _resolveEndTurnAttachmentTriggers(owner) {
    const slots = owner === "my" ? this._slotsMy : this._slotsOpp;
    for (const slot of [...slots]) {
      if (!slot.card || slot.card.hasAttackedTurn === this._turnNumber) continue;
      const shouldDestroy = (slot.attachments ?? []).some((attachment) =>
        (attachment.card?.triggeredAbilities ?? []).some(
          (ability) =>
            ability.trigger === "attached_creature_end_turn_if_not_attacked" &&
            ability.action?.type === "destroy_attached_creature",
        ),
      );
      if (!shouldDestroy) continue;
      const name = slot.card.name;
      this._sendFieldCreatureToDiscard(slot, owner, "efeito de Guardião Enlouquecido");
      this._toast(`${name} não atacou e foi destruída pelo Guardião Enlouquecido.`);
    }
  }

  _updateTurnUi() {
    const phaseLabel =
      this._currentPhase === "battle" ? "Batalha" : "Principal";
    const playerLabel =
      this._activePlayer === "my" ? "Seu turno" : "Turno inimigo";
    if (this._turnText)
      this._turnText.setText(`${playerLabel} - ${phaseLabel}`);
    if (this._roundText)
      this._roundText.setText(`[Turno: ${this._turnNumber} | ${phaseLabel}]`);
    if (this._phaseButton) {
      const canControlPhase =
        this._activePlayer === "my" &&
        !this._gameOver &&
        this._currentPhase !== "setup";
      this._phaseButton.setText(
        this._currentPhase === "main" ? "BATALHA" : "FIM DE TURNO",
      );
      this._phaseButton.setVisible(canControlPhase);
      if (canControlPhase) {
        this._phaseButton.setInteractive({ useHandCursor: true });
      } else {
        this._phaseButton.disableInteractive();
      }
    }
  }

  _showTurnBanner(text) {
    const { width, height } = this.cameras.main;
    if (this._turnBanner) this._turnBanner.destroy(true);

    this._turnBanner = this.add.container(width / 2, height / 2).setDepth(120);
    const bg = this.add
      .rectangle(0, 0, 420, 92, 0x071018, 0.9)
      .setStrokeStyle(2, this._activePlayer === "my" ? 0x4caf50 : 0xaa3333);
    const label = this.add
      .text(0, 0, text, {
        fontSize: "30px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this._turnBanner.add([bg, label]);
    this.tweens.add({
      targets: this._turnBanner,
      alpha: 0,
      scale: 1.08,
      delay: 720,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this._turnBanner?.destroy(true);
        this._turnBanner = null;
      },
    });
  }

  _opponentDrawCard() {
    if (!this.oppDeck.length) return;
    this.oppHand.push(this.oppDeck.shift());
    this._discardRandomOpponentIfHandOverflow();
    this.oppHandCount = this.oppHand.length;
    this._renderOpponentDeckPile();
    this._renderOpponentHand();
    this._logAction("Oponente comprou 1 carta.");
  }

  async _runSoloOpponentTurn() {
    if (this._gameOver || this._activePlayer !== "opp") return;
    await this._runSoloMainPhase();
    await this._wait(700);
    if (this._gameOver || this._activePlayer !== "opp") return;
    this._currentPhase = "battle";
    this._updateTurnUi();
    this._showTurnBanner("FASE DE BATALHA");
    await this._offerFieldCreatureResponseWindow("iniciou a fase de batalha");
    await this._runSoloBattlePhase();
    await this._wait(900);
    if (!this._gameOver && this._activePlayer === "opp") this._endTurn();
  }

  async _runSoloMainPhase() {
    if (this._gameOver || this._activePlayer !== "opp") return;
    if (this._soloSummonCreature()) {
      await this._wait(460);
      await this._offerCommandResponseWindow("invocou uma criatura");
    }
    let attached = this._soloAttachCard();
    while (attached) {
      await this._wait(420);
      await this._offerCommandResponseWindow("anexou uma carta");
      if (!ANEXOS_LIVRES) break;
      attached = this._soloAttachCard();
    }
    this.oppHandCount = this.oppHand.length;
    this._renderOpponentHand();
    this._renderOpponentDeckPile();
    this._renderOpponentDiscardPile();
  }

  _soloSummonCreature() {
    if (this._turnActions.summoned) return false;
    const emptySlot = aiChooseFirstEmptySlot(this._slotsOpp);
    if (!emptySlot) return false;

    const handIndex = this.oppHand.findIndex(
      (card) =>
        card.card_type === "criatura" && this._canNormalSummonCard(card),
    );
    if (handIndex === -1) return false;

    const [card] = this.oppHand.splice(handIndex, 1);
    const from = this._opponentHandAnimationStart();
    this._animateCardPreviewTo(
      card,
      from,
      { x: emptySlot.x, y: emptySlot.y },
      {
        onComplete: () => this._summonOpponentCreatureToSlot(card, emptySlot),
      },
    );
    this._turnActions.summoned = true;
    this._logAction(`Oponente invocou ${card.name}.`);
    return true;
  }

  _soloAttachCard() {
    if (!ANEXOS_LIVRES && this._turnActions.attached) return false;
    const candidates = this.oppHand
      .map((card, index) => ({ card, index }))
      .filter((entry) => this._isAttachmentCard(entry.card));

    const play = aiChooseFirstCard(
      candidates
        .map((entry) => {
          const targets = attachmentTargets(entry.card, this._slotsOpp);
          return targets.length ? { ...entry, target: targets[0] } : null;
        })
        .filter(Boolean),
    );
    if (!play) return false;

    const [attachment] = this.oppHand.splice(play.index, 1);
    const from = this._opponentHandAnimationStart();
    this._animateCardPreviewTo(
      attachment,
      from,
      { x: play.target.x, y: play.target.y + 9 },
      {
        endScale: 0.98,
        duration: 320,
        onComplete: () =>
          this._placeOpponentAttachment(play.target, attachment),
      },
    );
    this._turnActions.attached = true;
    return true;
  }

  _opponentHandAnimationStart() {
    return this._oppHandContainer
      ? { x: this.cameras.main.width / 2, y: 130 }
      : { x: this.cameras.main.width / 2, y: 130 };
  }

  async _runSoloBattlePhase() {
    const attackers = this._slotsOpp.filter((slot) =>
      canCreatureAttack(
        {
          activePlayer: this._activePlayer,
          currentPhase: "battle",
          gameOver: this._gameOver,
          turnNumber: this._turnNumber,
          actor: "opp",
        },
        slot.card,
      ),
    );

    for (const attackerSlot of attackers) {
      await this._wait(260);
      if (this._gameOver || this._activePlayer !== "opp" || !attackerSlot.card)
        continue;
      const yourCreatures = this._slotsMy.filter((slot) => slot.card);
      const forcedTarget = this._forcedAttackTargetSlot(attackerSlot);
      const columnTarget = this._opposingColumnSlot(attackerSlot, "opp");
      const target = ATAQUE_DIRETO_POR_COLUNA
        ? (columnTarget?.card && this._canBeAttackTarget(columnTarget, attackerSlot) ? columnTarget : null)
        : forcedTarget ?? aiChooseFirstSlot(
            yourCreatures.filter((slot) => this._canBeAttackTarget(slot, attackerSlot)),
          );
      if (target) {
        await new Promise((resolve) =>
          this._animateAttackMotion(attackerSlot, target, () => {
            this._resolveOpponentCreatureAttack(attackerSlot, target);
            this._clearForcedAttack(attackerSlot.card);
            resolve();
          }),
        );
        await this._offerCommandResponseWindow("atacou uma criatura");
      } else if (ATAQUE_DIRETO_POR_COLUNA ? !columnTarget?.card : !yourCreatures.length) {
        await new Promise((resolve) =>
          this._animateAttackMotion(
            attackerSlot,
            this._directAttackTargetPoint("my"),
            () => {
              this._resolveOpponentDirectAttack(attackerSlot);
              resolve();
            },
          ),
        );
        await this._offerCommandResponseWindow("atacou diretamente");
      } else {
        this._logAction(
          ATAQUE_DIRETO_POR_COLUNA
            ? `${attackerSlot.card.name} não pode atacar: a criatura à frente não é um alvo válido.`
            : `${attackerSlot.card.name} não encontrou alvo válido para atacar.`,
        );
      }
    }
  }

  _forcedAttackTargetSlot(attackerSlot) {
    const attacker = attackerSlot?.card;
    if (!attacker) return null;
    if ((attacker.forcedAttackUntilTurn ?? 0) < this._turnNumber) return null;
    const targetInstanceId = attacker.forcedAttackTargetInstanceId;
    if (!targetInstanceId) return null;
    const targetSlot = this._slotsMy.find(
      (slot) => slot.card?.instanceId === targetInstanceId,
    );
    if (!targetSlot?.card || !this._canBeAttackTarget(targetSlot, attackerSlot)) return null;
    return targetSlot;
  }

  _clearForcedAttack(card) {
    if (!card) return;
    delete card.forcedAttackUntilTurn;
    delete card.forcedAttackTargetInstanceId;
    delete card.forcedAttackTargetName;
  }

  _wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  _mulliganHand() {
    const cards = this._shuffleCards([...this.myHand, ...this.myDeck]);
    this.myHand = cards.slice(0, 5);
    this.myDeck = cards.slice(5);
    this._renderDeckPile();
    this._renderHand(this.myHand);
    this._closeMulliganModal();
    this._toast("Nova mão comprada!");
  }

  _discardFromHand(cardObject) {
    const card = cardObject.getData("cardData");
    const handIndex = this.myHand.findIndex((c) => c.id === card.id);
    if (handIndex !== -1) this.myHand.splice(handIndex, 1);

    this._mustDiscardBeforeDraw = false;
    this._handContainers = this._handContainers.filter((c) => c !== cardObject);
    this._renderHand(this.myHand);
    this._animateCardToDiscard(cardObject, card);
    this._toast(`${card.name} descartada da mão.`);
  }

  _animateCardToDiscard(cardObject, card, onComplete) {
    const target = this._discardPileContainer
      ? { x: this._discardPileContainer.x, y: this._discardPileContainer.y }
      : { x: this.cameras.main.width - 238, y: this.cameras.main.height - 228 };

    cardObject.disableInteractive();
    cardObject.setDepth(95);

    this.tweens.add({
      targets: cardObject,
      x: target.x,
      y: target.y,
      scale: 0.72,
      angle: cardObject.angle + 8,
      alpha: 0.92,
      duration: 420,
      ease: "Cubic.easeInOut",
      onComplete: () => {
        this.myDiscard.push(card);
        this._notifyCardSentToDiscard(card);
        cardObject.destroy(true);
        this._renderDiscardPile();
        this._playDiscardSmoke();
        this._syncPublicZoneState("discard_cards", {
          cards: [this._publicCardPayload(card)],
          from: "hand",
        });
        if (onComplete) onComplete();
      },
    });
  }

  _drawCard() {
    if (!this._isMyMainPhase()) {
      this._toast("Compra manual apenas no seu turno principal.");
      return;
    }
    if (!this.myDeck.length) {
      this._toast("Baralho vazio!");
      return;
    }

    this._mustDiscardBeforeDraw = false;
    this._animateDrawCardsFromDeck(1);
  }

  _discardRandomIfHandOverflow() {
    if (this.myHand.length <= MAX_HAND_SIZE) return;

    const index = this._randInt(0, this.myHand.length - 1);
    const [discarded] = this.myHand.splice(index, 1);
    this.myDiscard.push(discarded);
    this._notifyCardSentToDiscard(discarded);
    this._renderDiscardPile();
    this._playDiscardSmoke();
    this._renderHand(this.myHand);
    this._toast(
      `Mão excedeu 8 cartas. ${discarded.name} foi descartada aleatoriamente.`,
    );
    this._logAction(
      `${discarded.name} foi descartada aleatoriamente por limite de mao.`,
    );
    this._syncPublicZoneState("discard_cards", {
      cards: [this._publicCardPayload(discarded)],
      from: "hand",
    });
  }

  _discardRandomOpponentIfHandOverflow() {
    if (this.oppHand.length <= MAX_HAND_SIZE) return;

    const index = this._randInt(0, this.oppHand.length - 1);
    const [discarded] = this.oppHand.splice(index, 1);
    this.oppDiscard.push(discarded);
    this._renderOpponentDiscardPile();
    this._logAction(
      `Oponente descartou uma carta aleatoria por limite de mao.`,
    );
  }

  _shuffleDeck() {
    this._deckActionsOpen = false;
    this._clearDeckActions();
    this.myDeck = this._shuffleCards(this.myDeck);
    this._animateDeckShuffle();
  }

  _animateDeckShuffle() {
    if (!this._deckPileContainer) {
      this._renderDeckPile();
      this._toast("Baralho embaralhado!");
      return;
    }

    const pile = this._deckPileContainer;
    this.tweens.add({
      targets: pile,
      x: pile.x - 18,
      angle: -7,
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.tweens.add({
          targets: pile,
          x: pile.x + 18,
          angle: 7,
          duration: 70,
          yoyo: true,
          repeat: 2,
          ease: "Sine.easeInOut",
          onComplete: () => {
            pile.setAngle(0);
            this._renderDeckPile();
            this._toast("Baralho embaralhado!");
          },
        });
      },
    });
  }

  _discardTop() {
    const card = this.myDeck.shift();
    if (!card) {
      this._toast("Baralho vazio!");
      return;
    }
    this.myDiscard.push(card);
    this._notifyCardSentToDiscard(card);
    this._renderDeckPile();
    this._renderDiscardPile();
    this._playDiscardSmoke();
    this._syncPublicZoneState("discard_cards", {
      cards: [this._publicCardPayload(card)],
      from: "deck",
    });
    this._toast(`${card.name} descartada.`);
  }

  _exileTop() {
    const card = this.myDeck.shift();
    if (!card) {
      this._toast("Baralho vazio!");
      return;
    }
    this._renderDeckPile();
    this._toast(`${card.name} exilada.`);
  }

  _viewDeck() {
    console.table(
      this.myDeck.map((card, i) => ({
        posicao: i + 1,
        id: card.id,
        nome: card.name,
      })),
    );
    this._toast(
      `Baralho com ${this.myDeck.length} carta(s). Lista no console.`,
    );
  }

  _revealTop() {
    const card = this.myDeck[0];
    this._toast(card ? `Topo: ${card.name}` : "Baralho vazio!");
  }

  // ────── Objeto Carta ──────

  _createCardObject(cardData, x, y, draggable = false) {
    const cardW = 80;
    const cardH = 112;

    const container = this.add.container(x, y);
    const imgKey = `card_${cardData.id}`;
    const hasImage = this.textures.exists(imgKey);

    let bg;
    const elements = [];
    if (hasImage) {
      bg = this.add.image(0, 0, imgKey).setDisplaySize(cardW, cardH);
      const border = this.add.rectangle(0, 0, cardW, cardH, 0x000000, 0);
      border.setStrokeStyle(1.5, 0x4caf50);
      elements.push(bg, border);
    } else {
      bg = this.add.rectangle(0, 0, cardW, cardH, cardData.color ?? 0x1a1a2e);
      bg.setStrokeStyle(1.5, 0x4caf50);
      elements.push(bg);
    }

    // Nome
    const name = this.add
      .text(0, -42, cardData.name, {
        fontSize: "8px",
        color: "#ffffff",
        wordWrap: { width: cardW - 6 },
        align: "center",
      })
      .setOrigin(0.5, 0);

    // Tipo
    const type = this.add
      .text(0, -28, cardData.card_type, {
        fontSize: "7px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    // ATK/DEF
    const stats =
      cardData.attack !== null
        ? `ATK ${cardData.attack} / DEF ${cardData.defense}`
        : cardData.card_type.toUpperCase();
    const statsText = this.add
      .text(0, 38, stats, { fontSize: "7px", color: "#ffcc00" })
      .setOrigin(0.5);

    if (!hasImage) elements.push(name, type, statsText);
    container.add(elements);
    container.setData("cardData", cardData);
    container.setData("source", draggable ? "hand" : "preview");
    container.setSize(cardW, cardH);

    if (draggable) {
      container.setInteractive({ useHandCursor: true });
      container.on("pointerdown", () => this._handleCardClick(container));
    }

    return container;
  }

  // ────── Drag & Drop ──────

  _onDragStart(pointer, gameObject) {
    this._clearMagnifier();
    this.dragCard = gameObject;
    gameObject.setDepth(10);
  }

  _onDrag(pointer, gameObject, dragX, dragY) {
    gameObject.setPosition(dragX, dragY);
  }

  _onDragEnd(pointer, gameObject) {
    gameObject.setDepth(0);
    this.dragCard = null;
  }

  _onDrop(pointer, gameObject, dropZone) {
    const side = dropZone.getData("side");
    const slotIndex = dropZone.getData("slotIndex");
    if (side !== "my") return; // só pode jogar no próprio campo

    const slot = this._slotsMy[slotIndex];
    if (slot.card) return; // slot ocupado

    const cardData = gameObject.getData("cardData");
    gameObject.setPosition(slot.x, slot.y);
    this.input.setDraggable(gameObject, false);
    slot.card = cardData;
    this._handContainers = this._handContainers.filter(
      (card) => card !== gameObject,
    );
    const handIndex = this.myHand.findIndex((card) => card.id === cardData.id);
    if (handIndex !== -1) this.myHand.splice(handIndex, 1);

    // Enviar ação ao servidor
    this._sendAction("play_card", {
      card_id: cardData.id,
      slot: slotIndex,
    });
  }

  // ────── WebSocket ──────

  _listenChannel() {
    if (!this.room?.id) return;
    const channel = echo.channel(`game.${this.room.id}`);

    channel.listen("GameActionBroadcast", (event) => {
      if (event.user_id === this._getMyUserId()) return; // ignora ações próprias
      this._handleRemoteAction(event);
    });
  }

  _handleRemoteAction(event) {
    switch (event.action_type) {
      case "play_card":
        this._renderRemotePlayCard(event.payload);
        break;
      case "end_turn":
        this._handleRemoteEndTurn();
        break;
      case "phase_change":
        this._handleRemotePhaseChange(event.payload);
        break;
      case "field_destroyed":
        this._handleRemoteFieldDestroyed(event.payload);
        break;
      case "draw_cards":
        this._handleRemoteDrawCards(event.payload);
        break;
      case "discard_cards":
        this._handleRemoteDiscardCards(event.payload);
        break;
      case "hero_heal":
        this._handleRemoteHeroHeal(event.payload);
        break;
      case "mimic_marker":
        this._handleRemoteMimicMarker(event.payload);
        break;
      case "surrender":
        this._finishGame("my");
        break;
    }
  }

  _renderRemotePlayCard(payload = {}) {
    const card = ALL_CARDS.find(
      (c) => Number(c.id) === Number(payload.card_id),
    );
    if (!card) return;

    if (card.card_type === "criatura") {
      const slot = this._slotsOpp[payload.slot];
      if (slot && !slot.card) {
        this.oppHandCount = Math.max(0, this.oppHandCount - 1);
        this._renderOpponentHand();
        this._summonOpponentCreatureToSlot(card, slot, {
          canAttackFromTurn: this._turnNumber + 1,
        });
        this._recordPlayedCard(card);
        this._logAction(`Oponente invocou ${card.name}.`);
      }
      return;
    }
  }

  _handleRemoteEndTurn() {
    if (this._gameOver || this._activePlayer !== "opp") return;
    this._stopTurnFuse();
    this._clearBattleAttackButtons();
    this._turnNumber += 1;
    this._beginTurn("my");
    this._logAction("Oponente finalizou o turno.");
  }

  _handleRemotePhaseChange(payload = {}) {
    if (this._gameOver || this._activePlayer !== "opp") return;
    if (payload.phase !== "battle") return;

    this._currentPhase = "battle";
    this._clearBattleAttackButtons();
    this._updateTurnUi();
    this._showTurnBanner("FASE DE BATALHA INIMIGA");
    this._logAction("Oponente entrou na fase de batalha.");
  }

  _handleRemoteFieldDestroyed(payload = {}) {
    const remoteOwner = payload.owner === "my" ? "opp" : "my";
    const slots = remoteOwner === "my" ? this._slotsMy : this._slotsOpp;
    const slot = slots?.[payload.slot];
    if (!slot?.card) return;

    if (payload.card_id && Number(slot.card.id) !== Number(payload.card_id)) {
      console.warn(
        "Destruição remota ignorada: carta divergente.",
        payload,
        slot.card,
      );
      return;
    }

    this._destroyCreatureInBattle(slot, remoteOwner, null, { sync: false });
    this._renderBattleAttackButtons();
  }

  _handleRemoteHeroHeal(payload = {}) {
    if (payload.hero_key !== "ispisher") return;

    const slot = this._slotsOpp?.[Number(payload.slot)];
    if (!slot?.card) return;

    const amount = Math.max(1, Number(payload.amount) || 1);
    slot.card.damageTaken = Math.max(0, Number(slot.card.damageTaken ?? 0) - amount);
    recalculateCreatureStats(
      slot.card,
      slot.attachments.map((entry) => entry.card),
      { yourField: this._slotsOpp },
    );
    this._refreshFieldStatsOverlay(slot);
    this._playHeroHealEffect(slot);
    this._toast(`Ispisher inimigo curou ${amount} de vida de ${slot.card.name}.`);
    this._logAction(`Ispisher inimigo curou ${amount} de vida de ${slot.card.name}.`);
  }

  _handleRemoteMimicMarker(payload = {}) {
    const slot = this._slotsOpp?.[Number(payload.slot)];
    if (!slot?.card) return;

    const amount = Math.max(1, Number(payload.amount) || 1);
    this._addPermanentMarker(
      slot.card,
      ["attack", "defense"],
      amount,
      "Marca do Mímico",
    );
    this._recalculateAllFieldCreatures();
    this._playMimicMarkerEffect(slot);
    this._toast(`${slot.card.name} inimiga recebeu Marca do Mímico: +${amount}/+${amount}.`);
    this._logAction(`Oponente concedeu Marca do Mímico a ${slot.card.name}.`);
  }

  _handleRemoteDrawCards(payload = {}) {
    const count = Math.max(1, Number(payload.count) || 1);
    this._animateOpponentDrawCardsFromDeck(count, payload);
  }

  _animateOpponentDrawCardsFromDeck(count = 1, payload = {}) {
    const start = this._oppDeckPileContainer
      ? { x: this._oppDeckPileContainer.x, y: this._oppDeckPileContainer.y }
      : { x: 238, y: 118 };
    const target = this._opponentHandAnimationStart();

    this.oppDeckCount = Math.max(
      0,
      Number(payload.deck_count ?? this.oppDeckCount - count),
    );
    this.oppHandCount = Math.max(
      0,
      Number(payload.hand_count ?? this.oppHandCount + count),
    );
    this._renderOpponentDeckPile();

    let completed = 0;
    for (let i = 0; i < count; i++) {
      const preview = this.textures.exists(CARD_BACK_KEY)
        ? this.add.image(start.x, start.y, CARD_BACK_KEY).setDisplaySize(58, 82)
        : this.add.rectangle(start.x, start.y, 58, 82, 0x111820);
      preview.setDepth(96).setAlpha(0.94);
      this.tweens.add({
        targets: preview,
        x: target.x + (i - (count - 1) / 2) * 18,
        y: target.y,
        scale: 1.08,
        alpha: 1,
        delay: i * 90,
        duration: 360,
        ease: "Cubic.easeOut",
        onComplete: () => {
          preview.destroy();
          completed += 1;
          if (completed === count) {
            this._renderOpponentHand();
            this._logAction(`Oponente comprou ${count} carta(s).`);
          }
        },
      });
    }
  }

  _handleRemoteDiscardCards(payload = {}) {
    const cards = (payload.cards ?? [])
      .map((entry) =>
        ALL_CARDS.find((card) => Number(card.id) === Number(entry.id)),
      )
      .filter(Boolean);
    const count = cards.length || Math.max(1, Number(payload.count) || 1);

    this.oppHandCount = Math.max(
      0,
      Number(
        payload.hand_count ??
          this.oppHandCount - (payload.from === "hand" ? count : 0),
      ),
    );
    this.oppDeckCount = Math.max(
      0,
      Number(
        payload.deck_count ??
          this.oppDeckCount - (payload.from === "deck" ? count : 0),
      ),
    );
    this._renderOpponentHand();
    this._renderOpponentDeckPile();

    if (!cards.length) {
      this._renderOpponentDiscardPile();
      return;
    }

    cards.forEach((card, index) => {
      this.oppDiscard.push(card);
      this.time.delayedCall(index * 100, () => {
        const from =
          payload.from === "deck"
            ? this._oppDeckPileContainer
              ? {
                  x: this._oppDeckPileContainer.x,
                  y: this._oppDeckPileContainer.y,
                }
              : { x: 238, y: 118 }
            : this._opponentHandAnimationStart();
        this._animateCardPreviewToDiscard(card, from, "opp", {
          delay: index * 60,
          onComplete: () => this._renderOpponentDiscardPile(),
        });
      });
    });
  }

  async _sendAction(actionType, payload) {
    if (!this.room?.id) return;

    try {
      await api.post(`/rooms/${this.room.id}/actions`, {
        action_type: actionType,
        payload,
      });
    } catch (e) {
      console.error("Erro ao enviar ação:", e);
    }
  }

  _publicCardPayload(card) {
    return {
      id: card?.id,
      name: card?.name ?? card?.nome,
      card_type: card?.card_type,
    };
  }

  _syncPublicZoneState(actionType, payload = {}) {
    if (this._isSoloMode() || !this.room?.id) return;
    this._sendAction(actionType, {
      ...payload,
      hand_count: this.myHand.length,
      deck_count: this.myDeck.length,
      discard_count: this.myDiscard.length,
    });
  }

  _configureEchoAuth() {
    const token = localStorage.getItem("auth_token");
    const auth = echo?.connector?.pusher?.config?.auth;
    if (!auth) return;
    auth.headers = {
      ...(auth.headers ?? {}),
      Accept: "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  }

  _clearExpiredTemporaryEffects() {
    for (const slots of [this._slotsMy, this._slotsOpp]) {
      slots.forEach((slot) => {
        if (!slot.card?.tempModifiers?.length) return;
        slot.card.tempModifiers = slot.card.tempModifiers.filter(
          (modifier) => modifier.expiresOnTurn > this._turnNumber,
        );
      });
    }
    this._recalculateAllFieldCreatures();
  }

  _surrender() {
    this._stopTurnFuse();
    this._sendAction("surrender", {});
    this._finishRemoteRoom();
    clearScene();
    this.scene.start("MenuScene");
  }

  _getMyUserId() {
    try {
      return Number(JSON.parse(localStorage.getItem("auth_user"))?.id);
    } catch {
      return null;
    }
  }

  async _finishRemoteRoom() {
    if (!this.room?.id || this._isSoloMode() || this._remoteRoomFinished)
      return;
    this._remoteRoomFinished = true;
    try {
      await api.post(`/rooms/${this.room.id}/finish`);
    } catch (error) {
      console.error("Erro ao finalizar sala:", error);
    }
  }

  _toast(msg) {
    if (this._toastText) this._toastText.destroy();
    const { width, height } = this.cameras.main;
    this._toastText = this.add
      .text(width / 2, height - 150, msg, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#1b5e20",
        padding: { x: 14, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.time.delayedCall(1800, () => {
      if (this._toastText) {
        this._toastText.destroy();
        this._toastText = null;
      }
    });
  }
}
