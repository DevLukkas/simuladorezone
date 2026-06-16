import api from '../config/api.js'

// --- Auth ---
export const login = (email, password) =>
  api.post('/auth/login', { email, password })

export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password })

export const me = () => api.get('/auth/me')
export const logout = () => api.post('/auth/logout')

// --- Tutorial / baralho inicial ---
export const getStarterDecks = () => api.get('/starter-decks')
export const chooseStarterDeck = (starterKey) =>
  api.post('/starter-decks/choose', { starter_key: starterKey })

// --- Cartas ---
export const getCards = (params = {}) => api.get('/cards', { params })
export const getPlayerCards = () => api.get('/player-cards')

// --- Perfil / Social ---
export const getProfile = () => api.get('/profile')
export const getPublicProfile = (userId) => api.get(`/profile/users/${userId}`)
export const updateProfile = (data) => api.patch('/profile', data)
export const uploadProfileAvatar = (file) => {
  const formData = new FormData()
  formData.append('avatar', file)
  return api.post('/profile/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const addFriend = (query) => api.post('/profile/friends', { query })
export const removeFriend = (friendId) => api.delete(`/profile/friends/${friendId}`)
export const sendFriendGift = (friendId) => api.post(`/profile/friends/${friendId}/gift`)
export const shareBuild = (data) => api.post('/profile/shared-builds', data)
export const deleteSharedBuild = (buildId) => api.delete(`/profile/shared-builds/${buildId}`)
export const voteSharedBuild = (buildId, rating) =>
  api.post(`/profile/shared-builds/${buildId}/vote`, { rating })
export const exportSharedBuild = (buildId) =>
  api.post(`/profile/shared-builds/${buildId}/export`)

// --- Baralhos ---
export const getDecks = () => api.get('/decks')
export const getPresetDecks = () => api.get('/decks?preset=1')
export const getDeck = (id) => api.get(`/decks/${id}`)
export const createDeck = (data) => api.post('/decks', data)
export const updateDeck = (id, data) => api.put(`/decks/${id}`, data)
export const deleteDeck = (id) => api.delete(`/decks/${id}`)

// --- Salas ---
export const getRooms = () => api.get('/rooms')
export const getRoom = (id) => api.get(`/rooms/${id}`)
export const getRoomByCode = (code) => api.get(`/rooms/code/${code}`)
export const createRoom = (data = {}) =>
  api.post('/rooms', typeof data === 'object' && data !== null ? data : { deck_id: data })
export const joinRoom = (code, deckId) => api.post(`/rooms/join`, { room_code: code, deck_id: deckId })
export const readyRoom = (id) => api.post(`/rooms/${id}/ready`)
export const startRoom = (id) => api.post(`/rooms/${id}/start`)
export const finishRoom = (id) => api.post(`/rooms/${id}/finish`)
export const deleteRoom = (id) => api.delete(`/rooms/${id}`)
