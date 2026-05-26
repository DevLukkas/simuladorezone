export function applySummonToken(effect) {
  const token = effect.token
  if (!token) return null

  const attack = token.attack ?? token.ataque ?? 0
  const defense = token.defense ?? token.vida ?? 0
  const element = token.element ?? token.elemento ?? 'neutro'
  const rarity = token.rarity ?? token.raridade ?? 'comum'
  const name = token.name ?? token.nome ?? 'Ficha'

  return {
    ...token,
    id: token.id ?? `token_${name.toLowerCase().replace(/\s+/g, '_')}`,
    nome: token.nome ?? name,
    name,
    card_type: 'criatura',
    attack,
    ataque: attack,
    defense,
    vida: defense,
    element,
    elemento: element,
    rarity,
    raridade: rarity,
    color: token.color ?? 0x4b2a68,
    isToken: true,
  }
}
