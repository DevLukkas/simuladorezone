/**
 * session.js — persiste estado de navegação no localStorage.
 *
 * Cenas permitidas para restauração.
 */
const RESTORABLE = ['MenuScene', 'StarterDeckScene', 'LobbyScene', 'LibraryScene', 'DeckBuilderScene', 'ProfileScene', 'OffersScene', 'LaboratoryScene']
const KEY_SCENE  = 'ez_current_scene'
const KEY_AUTH   = 'auth_token'
const KEY_SCENE_DATA = 'ez_current_scene_data'

export function saveScene(sceneKey, data = null) {
  if (RESTORABLE.includes(sceneKey)) {
    localStorage.setItem(KEY_SCENE, sceneKey)
    if (data) {
      localStorage.setItem(KEY_SCENE_DATA, JSON.stringify(data))
    } else {
      localStorage.removeItem(KEY_SCENE_DATA)
    }
  }
}

export function restoreScene() {
  if (!isLoggedIn()) return 'MenuScene'
  return localStorage.getItem(KEY_SCENE) || 'MenuScene'
}

export function restoreSceneData() {
  try {
    return JSON.parse(localStorage.getItem(KEY_SCENE_DATA))
  } catch {
    return null
  }
}

export function clearScene() {
  localStorage.removeItem(KEY_SCENE)
  localStorage.removeItem(KEY_SCENE_DATA)
}

export function isLoggedIn() {
  return !!localStorage.getItem(KEY_AUTH)
}

export function saveAuth(token, user) {
  localStorage.setItem(KEY_AUTH, token)
  localStorage.setItem('auth_user', JSON.stringify(user))
  localStorage.removeItem('ez_user')
  localStorage.removeItem('user')
}

export function clearAuth() {
  localStorage.removeItem(KEY_AUTH)
  localStorage.removeItem('ez_user')
  localStorage.removeItem('auth_user')
  localStorage.removeItem('user')
  clearScene()
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('auth_user'))
  } catch {
    return null
  }
}
