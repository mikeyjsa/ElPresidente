import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT || 3001)
const TURN_SECONDS = 30
const MIN_PLAYERS = 3
const MIN_HUMANS_WITH_COMPUTER = 2
const COMPUTER_PLAYER_ID = 'computer-player'
const COMPUTER_PLAYER_NAME = 'Computer Player'
const COMPUTER_TURN_DELAY = 1200
const SCORE_FILE = path.join(process.cwd(), 'data', 'scores.json')
const RECENT_WINNER_LIMIT = 12
const PLAYER_ICONS = ['crown', 'sparkles', 'flame', 'heart', 'shield', 'club', 'star', 'sun']
const PLAYER_COLORS = ['gold', 'green', 'red', 'blue', 'purple', 'teal', 'rose', 'slate']
let computerTurnTimer = null

const suits = [
  { id: 'oros', name: 'Coins', symbol: 'coin', color: 'gold' },
  { id: 'copas', name: 'Cups', symbol: 'cup', color: 'red' },
  { id: 'espadas', name: 'Swords', symbol: 'sword', color: 'steel' },
  { id: 'bastos', name: 'Clubs', symbol: 'club', color: 'green' },
]

const ranks = [
  { value: 3, label: '3', strength: 1 },
  { value: 4, label: '4', strength: 2 },
  { value: 5, label: '5', strength: 3 },
  { value: 6, label: '6', strength: 4 },
  { value: 7, label: '7', strength: 5 },
  { value: 10, label: 'Sota', strength: 6 },
  { value: 11, label: 'Caballo', strength: 7 },
  { value: 12, label: 'Rey', strength: 8 },
  { value: 1, label: 'As', strength: 9 },
  { value: 2, label: '2', strength: 10 },
]

function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8'))
  } catch {
    return { winners: {}, recentWinners: [], round: 0 }
  }
}

const savedScores = loadScores()

const state = {
  phase: 'lobby',
  players: [],
  pile: [],
  currentTurnId: null,
  turnStartedAt: null,
  passCount: 0,
  finishOrder: [],
  round: Number(savedScores.round) || 0,
  winners: savedScores.winners || {},
  recentWinners: savedScores.recentWinners || [],
  log: ['Scan the QR code to join the table.'],
}

function saveScores() {
  fs.mkdirSync(path.dirname(SCORE_FILE), { recursive: true })
  fs.writeFileSync(
    SCORE_FILE,
    JSON.stringify(
      {
        round: state.round,
        winners: state.winners,
        recentWinners: state.recentWinners,
      },
      null,
      2,
    ),
  )
}

function lanAddress() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const details of iface || []) {
      if (details.family === 'IPv4' && !details.internal) return details.address
    }
  }
  return 'localhost'
}

function createDeck() {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${rank.value}-${suit.id}`,
      rank: rank.value,
      rankLabel: rank.label,
      strength: rank.strength,
      suit: suit.id,
      suitName: suit.name,
      suitSymbol: suit.symbol,
      suitColor: suit.color,
    })),
  )
}

function shuffle(cards) {
  const deck = [...cards]
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function sortHand(hand) {
  return [...hand].sort((a, b) => a.strength - b.strength || a.suit.localeCompare(b.suit))
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    icon: player.icon || 'star',
    color: player.color || 'gold',
    role: player.role || 'neutral',
    handCount: player.hand.length,
    connected: player.connected,
    finishedAt: player.finishedAt,
    wins: state.winners[player.name] || 0,
    isComputer: Boolean(player.isComputer),
  }
}

function tableState() {
  const currentPlayer = state.players.find((p) => p.id === state.currentTurnId)
  return {
    phase: state.phase,
    players: state.players.map(publicPlayer),
    pile: state.pile,
    currentTurnId: state.currentTurnId,
    currentPlayerName: currentPlayer?.name || null,
    activeHand: currentPlayer ? sortHand(currentPlayer.hand) : [],
    turnStartedAt: state.turnStartedAt,
    turnSeconds: TURN_SECONDS,
    passCount: state.passCount,
    finishOrder: state.finishOrder,
    round: state.round,
    recentWinners: state.recentWinners,
    log: state.log.slice(-8).reverse(),
    joinUrl: `http://${lanAddress()}:5173/join`,
  }
}

function playerState(player) {
  return {
    ...tableState(),
    selfId: player?.id || null,
    selfName: player?.name || '',
    hand: player ? sortHand(player.hand) : [],
  }
}

function activePlayers() {
  return state.players.filter((player) => !player.finishedAt)
}

function humanPlayers() {
  return state.players.filter((player) => !player.isComputer)
}

function playerIdentity(rawIdentity = {}) {
  const identity = rawIdentity && typeof rawIdentity === 'object' ? rawIdentity : {}
  return {
    icon: PLAYER_ICONS.includes(identity.icon) ? identity.icon : 'star',
    color: PLAYER_COLORS.includes(identity.color) ? identity.color : 'gold',
  }
}

function removeComputerPlayer() {
  state.players = state.players.filter((player) => !player.isComputer)
}

function reconcileComputerPlayer() {
  if (state.phase === 'playing') return
  if (humanPlayers().length >= MIN_PLAYERS && state.players.some((player) => player.isComputer)) {
    removeComputerPlayer()
    state.log.push(`${COMPUTER_PLAYER_NAME} left the table for a full human game.`)
  }
}

function ensureComputerPlayer() {
  if (humanPlayers().length !== MIN_HUMANS_WITH_COMPUTER) return
  if (state.players.some((player) => player.isComputer)) return

  state.players.push({
    id: COMPUTER_PLAYER_ID,
    name: COMPUTER_PLAYER_NAME,
    icon: 'bot',
    color: 'teal',
    role: 'neutral',
    hand: [],
    connected: true,
    finishedAt: null,
    isComputer: true,
  })
  state.log.push(`${COMPUTER_PLAYER_NAME} joined as the third seat.`)
}

function nextTurn(afterId = state.currentTurnId) {
  const active = activePlayers()
  if (active.length <= 1) {
    endRound()
    return
  }
  const fullIndex = state.players.findIndex((player) => player.id === afterId)
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const next = state.players[(fullIndex + offset + state.players.length) % state.players.length]
    if (next && !next.finishedAt) {
      state.currentTurnId = next.id
      state.turnStartedAt = Date.now()
      return
    }
  }
}

function clearPile(reason) {
  if (state.pile.length) state.log.push(reason)
  state.pile = []
  state.passCount = 0
}

function legalCardsFor(player) {
  if (!state.pile.length) return sortHand(player.hand)
  const topStrength = state.pile[0].strength
  return sortHand(player.hand).filter((card) => Math.abs(card.strength - topStrength) === 1)
}

function playCard(player, card) {
  player.hand = player.hand.filter((item) => item.id !== card.id)
  state.pile = [card]
  state.passCount = 0
  state.log.push(`${player.name} played ${card.rankLabel} of ${card.suitName}.`)
  if (!player.hand.length) {
    player.finishedAt = state.finishOrder.length + 1
    state.finishOrder.push(player.name)
    state.log.push(`${player.name} went out in position ${player.finishedAt}.`)
    clearPile('Pile cleared after a player went out.')
  }
}

function passPlayer(player, reason = 'passed') {
  state.passCount += 1
  state.log.push(`${player.name} ${reason}.`)
  if (state.passCount >= Math.max(1, activePlayers().length - 1)) {
    clearPile('Everyone else passed. The pile is cleared.')
  }
}

function endRound() {
  if (state.phase !== 'playing') return
  const remaining = activePlayers()
  for (const player of remaining) {
    if (!state.finishOrder.includes(player.name)) state.finishOrder.push(player.name)
    player.finishedAt = state.finishOrder.length
  }
  const winner = state.finishOrder[0]
  const fool = state.finishOrder[state.finishOrder.length - 1]
  state.players.forEach((player) => {
    if (player.name === winner) player.role = 'president'
    else if (player.name === fool) player.role = 'fool'
    else player.role = 'neutral'
  })
  if (winner) {
    state.winners[winner] = (state.winners[winner] || 0) + 1
    state.recentWinners = [
      {
        name: winner,
        round: state.round,
        wonAt: new Date().toISOString(),
        isComputer: Boolean(state.players.find((player) => player.name === winner)?.isComputer),
      },
      ...state.recentWinners,
    ].slice(0, RECENT_WINNER_LIMIT)
    saveScores()
  }
  state.phase = 'finished'
  state.currentTurnId = null
  state.turnStartedAt = null
  state.log.push(`${winner || 'Nobody'} is El Presidente.`)
}

function dealRound() {
  reconcileComputerPlayer()
  ensureComputerPlayer()
  const deck = shuffle(createDeck())
  state.round += 1
  state.phase = 'playing'
  state.pile = []
  state.passCount = 0
  state.finishOrder = []
  state.players.forEach((player) => {
    player.hand = []
    player.finishedAt = null
  })
  deck.forEach((card, index) => {
    state.players[index % state.players.length].hand.push(card)
  })
  state.players.forEach((player) => {
    player.hand = sortHand(player.hand)
  })
  state.currentTurnId = state.players[0]?.id || null
  state.turnStartedAt = Date.now()
  state.log.push(`Round ${state.round} started. ${state.players[0]?.name || 'First player'} leads.`)
}

function emitAll() {
  io.emit('tableState', tableState())
  state.players.filter((player) => !player.isComputer).forEach((player) => {
    io.to(player.id).emit('playerState', playerState(player))
  })
  scheduleComputerTurn()
}

function scheduleComputerTurn() {
  if (computerTurnTimer) {
    clearTimeout(computerTurnTimer)
    computerTurnTimer = null
  }
  if (state.phase !== 'playing') return
  const player = state.players.find((item) => item.id === state.currentTurnId)
  if (!player?.isComputer || player.finishedAt) return

  computerTurnTimer = setTimeout(() => {
    computerTurnTimer = null
    takeComputerTurn(player.id)
  }, COMPUTER_TURN_DELAY)
}

function takeComputerTurn(playerId) {
  const player = state.players.find((item) => item.id === playerId)
  if (!player || !player.isComputer || state.phase !== 'playing' || state.currentTurnId !== player.id || player.finishedAt) {
    return
  }

  const [card] = legalCardsFor(player)
  if (card) {
    playCard(player, card)
  } else {
    passPlayer(player)
  }
  nextTurn(player.id)
  emitAll()
}

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

io.on('connection', (socket) => {
  socket.emit('tableState', tableState())

  socket.on('join', (payload, reply) => {
    const name = String(typeof payload === 'object' && payload ? payload.name : payload || '').trim().slice(0, 20)
    const identity = playerIdentity(payload)
    if (!name) {
      reply?.({ ok: false, error: 'Enter a name.' })
      return
    }
    if (state.phase === 'playing') {
      reply?.({ ok: false, error: 'A round is already in progress.' })
      return
    }
    const existing = state.players.find((player) => !player.isComputer && player.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      existing.id = socket.id
      existing.connected = true
      existing.icon = identity.icon
      existing.color = identity.color
      existing.hand = existing.hand || []
      reply?.({ ok: true, id: socket.id })
    } else {
      state.players.push({
        id: socket.id,
        name,
        icon: identity.icon,
        color: identity.color,
        role: 'neutral',
        hand: [],
        connected: true,
        finishedAt: null,
        isComputer: false,
      })
      state.log.push(`${name} joined the table.`)
      reply?.({ ok: true, id: socket.id })
    }
    reconcileComputerPlayer()
    emitAll()
  })

  socket.on('startGame', (reply) => {
    if (state.phase === 'playing') {
      reply?.({ ok: false, error: 'A round is already in progress.' })
      return
    }
    if (humanPlayers().length < MIN_HUMANS_WITH_COMPUTER) {
      reply?.({ ok: false, error: 'At least two players need to join.' })
      return
    }
    dealRound()
    reply?.({ ok: true })
    emitAll()
  })

  socket.on('resetLobby', () => {
    state.phase = 'lobby'
    removeComputerPlayer()
    state.players.forEach((player) => {
      player.hand = []
      player.finishedAt = null
    })
    state.pile = []
    state.currentTurnId = null
    state.turnStartedAt = null
    state.passCount = 0
    state.finishOrder = []
    state.log.push('Table reset to the lobby.')
    emitAll()
  })

  socket.on('playCards', (cardIds, reply) => {
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || state.phase !== 'playing' || state.currentTurnId !== player.id || player.finishedAt) {
      reply?.({ ok: false, error: 'It is not your turn.' })
      return
    }
    const ids = Array.isArray(cardIds) ? cardIds : []
    const selected = ids.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean)
    if (!selected.length || selected.length !== ids.length) {
      reply?.({ ok: false, error: 'Choose cards from your hand.' })
      return
    }
    const card = selected[0]
    if (selected.length !== 1) {
      reply?.({ ok: false, error: 'Play one card at a time.' })
      return
    }
    if (!legalCardsFor(player).some((legalCard) => legalCard.id === card.id)) {
      reply?.({ ok: false, error: 'Play a card one rank higher or lower than the pile.' })
      return
    }
    playCard(player, card)
    reply?.({ ok: true })
    nextTurn(player.id)
    emitAll()
  })

  socket.on('passTurn', (reply) => {
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || state.phase !== 'playing' || state.currentTurnId !== player.id) {
      reply?.({ ok: false, error: 'It is not your turn.' })
      return
    }
    if (!state.pile.length) {
      reply?.({ ok: false, error: 'Lead with a card before passing.' })
      return
    }
    passPlayer(player)
    reply?.({ ok: true })
    nextTurn(player.id)
    emitAll()
  })

  socket.on('disconnect', () => {
    const player = state.players.find((item) => item.id === socket.id)
    if (player) {
      player.connected = false
      state.log.push(`${player.name} disconnected.`)
      emitAll()
    }
  })
})

setInterval(() => {
  if (state.phase !== 'playing' || !state.currentTurnId || !state.turnStartedAt) return
  if (Date.now() - state.turnStartedAt > TURN_SECONDS * 1000) {
    const player = state.players.find((item) => item.id === state.currentTurnId)
    if (player) {
      passPlayer(player, 'timed out and passed')
      nextTurn(player.id)
      emitAll()
    }
  }
}, 1000)

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`El Presidente realtime server on http://${lanAddress()}:${PORT}`)
})
