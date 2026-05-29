import api from '../config/api.js'

// --- Auth ---
export const login = (email, password) =>
  api.post('/auth/login', { email, password })

export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password })

export const me = () => api.get('/auth/me')
export const logout = () => api.post('/auth/logout')

// --- Cartas ---
export const getCards = (params = {}) => api.get('/cards', { params })

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
export const createRoom = (deckId) => api.post('/rooms', { deck_id: deckId })
export const joinRoom = (code, deckId) => api.post(`/rooms/join`, { room_code: code, deck_id: deckId })
export const startRoom = (id) => api.post(`/rooms/${id}/start`)
