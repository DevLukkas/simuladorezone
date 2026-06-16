export async function applyRevealRandomHandThenShuffleOne(effect, context) {
  const {
    scene,
    opponentHand,
    opponentDeck,
    opponentDiscard,
    shuffleCards,
    randInt,
  } = context

  const revealCount = Number(effect.reveal) || 2
  const chooseCount = Number(effect.choose) || 1

  if (!opponentHand.length) {
    scene._toast('Oponente não tem cartas na mão.')
    return false
  }

  const pool = [...opponentHand]
  const revealed = []

  while (revealed.length < revealCount && pool.length) {
    const index = randInt(0, pool.length - 1)
    revealed.push(pool.splice(index, 1)[0])
  }

  const chosen = await scene._requestCardChoiceAsync({
    title: 'Escolha uma carta revelada para voltar ao baralho',
    cards: revealed,
    emptyMessage: 'Nenhuma carta revelada.',
    accent: 0xffcc44,
    buttonColor: '#8a4a12',
    maxVisible: revealCount,
    labelForCard: card => card.name ?? card.nome,
  })

  if (!chosen) return false

  const handIndex = opponentHand.findIndex(card => card === chosen)
  if (handIndex === -1) return false

  const [removed] = opponentHand.splice(handIndex, chooseCount)
  opponentDeck.push(removed)

  const shuffled = shuffleCards(opponentDeck)
  opponentDeck.splice(0, opponentDeck.length, ...shuffled)

  scene.oppHandCount = opponentHand.length
  scene._renderOpponentHand()
  scene._renderOpponentDeckPile()

  scene._toast(`${removed.name ?? removed.nome} voltou ao baralho do oponente.`)
  scene._logAction(`${removed.name ?? removed.nome} foi revelada e embaralhada no baralho do oponente.`)

  return true
}