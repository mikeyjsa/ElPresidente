import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT || 3001)
const DIST_DIR = path.join(process.cwd(), 'dist')
const TURN_SECONDS = 30
const MIN_PLAYERS = 3
const MIN_HUMANS_WITH_COMPUTER = 2
const COMPUTER_PLAYER_ID = 'computer-player'
const COMPUTER_PLAYER_NAME = 'Computer Player'
const COMPUTER_TURN_DELAY = 1200
const SCORE_FILE = path.join(process.cwd(), 'data', 'scores.json')
const RECENT_WINNER_LIMIT = 12
const CHAT_LIMIT = 40
const ROOM_CODE_LENGTH = 5
const DEFAULT_MUSIC = {
  title: 'Reggaeton Espanol',
  embedUrl: 'https://www.youtube.com/embed/kJQP7kiw5Fk?autoplay=1&list=RDkJQP7kiw5Fk',
  source: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
}
const PLAYER_ICONS = ['crown', 'sparkles', 'flame', 'heart', 'shield', 'club', 'star', 'sun', 'bolt', 'diamond', 'moon', 'gem']
const PLAYER_COLORS = ['gold', 'green', 'red', 'blue', 'purple', 'teal', 'rose', 'slate']
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

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
  { value: 8, label: '8', strength: 6 },
  { value: 9, label: '9', strength: 7 },
  { value: 10, label: '10', strength: 8 },
  { value: 11, label: '11', strength: 9 },
  { value: 12, label: '12', strength: 10 },
  { value: 1, label: '1', strength: 11 },
  { value: 2, label: '2', strength: 12 },
]

function loadScores() {
  try {
    const saved = JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8'))
    if (saved.rooms) return saved
    return {
      rooms: {
        TABLE: {
          winners: saved.winners || {},
          recentWinners: saved.recentWinners || [],
          round: Number(saved.round) || 0,
        },
      },
    }
  } catch {
    return { rooms: {} }
  }
}

const savedScores = loadScores()

const rooms = new Map()
let state = getRoom('TABLE')

function normalizeRoomCode(rawCode = '') {
  return String(rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

function randomRoomCode() {
  let code = ''
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
  }
  return code
}

function roomScore(code) {
  return savedScores.rooms?.[code] || { winners: {}, recentWinners: [], round: 0 }
}

function createRoomState(code) {
  const score = roomScore(code)
  return {
    code,
    phase: 'lobby',
    players: [],
    pile: [],
    pileOwnerId: null,
    currentTurnId: null,
    turnStartedAt: null,
    passCount: 0,
    finishOrder: [],
    round: Number(score.round) || 0,
    winners: score.winners || {},
    recentWinners: score.recentWinners || [],
    skipNotice: null,
    pileNotice: null,
    endRoundVotes: [],
    readyNextRoundIds: [],
    music: {
      ...DEFAULT_MUSIC,
      updatedAt: Date.now(),
    },
    chat: [],
    log: [`Room ${code} is ready. Scan or enter the room code to join.`],
    computerTurnTimer: null,
  }
}

function getRoom(rawCode) {
  let code = normalizeRoomCode(rawCode)
  if (!code) {
    do {
      code = randomRoomCode()
    } while (rooms.has(code) || savedScores.rooms?.[code])
  }
  if (!rooms.has(code)) rooms.set(code, createRoomState(code))
  return rooms.get(code)
}

function saveScores() {
  fs.mkdirSync(path.dirname(SCORE_FILE), { recursive: true })
  for (const room of rooms.values()) {
    savedScores.rooms[room.code] = {
      round: room.round,
      winners: room.winners,
      recentWinners: room.recentWinners,
    }
  }
  fs.writeFileSync(
    SCORE_FILE,
    JSON.stringify(savedScores, null, 2),
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

function publicBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  return `http://${lanAddress()}:5173`
}

function serveStatic(req, res) {
  if (req.url?.startsWith('/socket.io/')) return
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('El Presidente realtime server is running. Build the client with npm run build for production hosting.')
    return
  }

  const url = new URL(req.url || '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const requestedPath = path.join(DIST_DIR, normalizedPath === '/' ? 'index.html' : normalizedPath)
  const indexPath = path.join(DIST_DIR, 'index.html')
  const filePath = requestedPath.startsWith(DIST_DIR) && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : indexPath
  const ext = path.extname(filePath)

  res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

function createDeck() {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${rank.value}-${suit.id}`,
      rank: rank.value,
      rankLabel: rank.label,
      strength: rank.value === 2 && suit.id === 'oros' ? rank.strength + 1 : rank.strength,
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
    isSpectator: Boolean(player.isSpectator),
  }
}

function scoreSummary() {
  const [topName, topWins = 0] =
    Object.entries(state.winners).sort(([, winsA], [, winsB]) => Number(winsB) - Number(winsA))[0] || []
  const lastPresident = state.recentWinners[0] || null
  return {
    lastPresident,
    topWinner: topName ? { name: topName, wins: topWins } : null,
  }
}

function tableState() {
  const currentPlayer = state.players.find((p) => p.id === state.currentTurnId)
  const endRoundVoters = state.players.filter(
    (player) => !player.isComputer && !player.isSpectator && player.connected && !player.finishedAt,
  )
  const activeEndRoundVotes = state.endRoundVotes.filter((playerId) => endRoundVoters.some((player) => player.id === playerId))
  return {
    roomCode: state.code,
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
    scoreSummary: scoreSummary(),
    skipNotice: state.skipNotice,
    pileNotice: state.pileNotice,
    endRoundVotes: activeEndRoundVotes.length,
    endRoundVoteTarget: Math.max(1, Math.floor(endRoundVoters.length / 2) + 1),
    readyNextRoundCount: state.readyNextRoundIds.filter((playerId) => humanPlayers().some((player) => player.id === playerId)).length,
    readyNextRoundTarget: humanPlayers().length,
    music: state.music,
    chat: state.chat.slice(-CHAT_LIMIT),
    log: state.log.slice(-8).reverse(),
    joinUrl: `${publicBaseUrl()}/join?room=${state.code}`,
  }
}

function playerState(player) {
  return {
    ...tableState(),
    selfId: player?.id || null,
    selfName: player?.name || '',
    selfSpectator: Boolean(player?.isSpectator),
    selfVotedEndRound: Boolean(player && state.endRoundVotes.includes(player.id)),
    selfReadyNextRound: Boolean(player && state.readyNextRoundIds.includes(player.id)),
    hand: player && !player.isSpectator ? sortHand(player.hand) : [],
  }
}

function activePlayers() {
  return state.players.filter((player) => !player.finishedAt && !player.isSpectator)
}

function humanPlayers() {
  return state.players.filter((player) => !player.isComputer && !player.isSpectator && player.connected)
}

function endRoundVotingPlayers() {
  return state.players.filter((player) => !player.isComputer && !player.isSpectator && player.connected && !player.finishedAt)
}

function playerIdentity(rawIdentity = {}) {
  const identity = rawIdentity && typeof rawIdentity === 'object' ? rawIdentity : {}
  return {
    icon: PLAYER_ICONS.includes(identity.icon) ? identity.icon : 'star',
    color: PLAYER_COLORS.includes(identity.color) ? identity.color : 'gold',
  }
}

function youtubeEmbedFromInput(rawInput) {
  const source = String(rawInput || '').trim()
  if (!source) return null
  const directId = source.match(/^[a-zA-Z0-9_-]{11}$/)?.[0]
  if (directId) {
    return {
      embedUrl: `https://www.youtube.com/embed/${directId}?autoplay=1&list=RD${directId}`,
      source: `https://www.youtube.com/watch?v=${directId}`,
    }
  }

  try {
    const url = new URL(source)
    if (!/(^|\.)youtu\.be$|(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/.test(url.hostname)) return null
    const playlistId = url.searchParams.get('list')
    if (playlistId && /^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      return {
        embedUrl: `https://www.youtube.com/embed/videoseries?autoplay=1&list=${playlistId}`,
        source,
      }
    }
    let videoId = ''
    if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.split('/').filter(Boolean)[0] || ''
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] || ''
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] || ''
    } else {
      videoId = url.searchParams.get('v') || ''
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null
    return {
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&list=RD${videoId}`,
      source,
    }
  } catch {
    return null
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
    isSpectator: false,
    isComputer: true,
  })
  state.log.push(`${COMPUTER_PLAYER_NAME} joined as the third seat.`)
}

function nextTurn(afterId = state.currentTurnId, skipNext = false) {
  const active = activePlayers()
  if (active.length <= 1) {
    endRound()
    return
  }
  const fullIndex = state.players.findIndex((player) => player.id === afterId)
  let skippedPlayer = null
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const next = state.players[(fullIndex + offset + state.players.length) % state.players.length]
    if (next && !next.finishedAt && !next.isSpectator) {
      if (skipNext && !skippedPlayer) {
        skippedPlayer = next
        state.skipNotice = {
          playerId: next.id,
          playerName: next.name,
          skippedAt: Date.now(),
        }
        state.log.push(`${next.name} was skipped by a matching rank.`)
        continue
      }
      state.currentTurnId = next.id
      state.turnStartedAt = Date.now()
      return
    }
  }
}

function clearPile(reason) {
  if (state.pile.length) state.log.push(reason)
  state.pile = []
  state.pileOwnerId = null
  state.passCount = 0
}

function announcePileLead(player, reason = 'Pile cleared') {
  if (!player || state.phase !== 'playing') return
  const message = `${reason}. ${player.name} starts.`
  state.pileNotice = {
    message,
    playerId: player.id,
    playerName: player.name,
    announcedAt: Date.now(),
  }
  state.log.push(message)
}

function legalCardsFor(player) {
  if (!state.pile.length) return sortHand(player.hand)
  const topStrength = state.pile[0].strength
  return sortHand(player.hand).filter((card) => card.strength >= topStrength)
}

function legalCardGroupsFor(player) {
  const requiredCount = state.pile.length || 1
  const legalCards = legalCardsFor(player)
  const groups = new Map()
  for (const card of legalCards) {
    groups.set(card.rank, [...(groups.get(card.rank) || []), card])
  }
  const closer = sortHand(player.hand).find(isPileCloser)
  if (closer && state.pile.length) return [[closer]]
  return [...groups.values()].filter((cards) => !state.pile.length || cards.length >= requiredCount).map((cards) => cards.slice(0, requiredCount))
}

function isPileCloser(card) {
  return card.rank === 2 && card.suit === 'oros'
}

function playCards(player, cards) {
  const previousPile = state.pile
  const cardIds = new Set(cards.map((card) => card.id))
  const closesPile = cards.some(isPileCloser)
  const skipNext = Boolean(previousPile.length && !closesPile && cards[0].rank === previousPile[0].rank)
  player.hand = player.hand.filter((item) => !cardIds.has(item.id))
  state.pile = cards
  state.pileOwnerId = player.id
  state.passCount = 0
  state.pileNotice = null
  state.log.push(`${player.name} played ${cards.map((card) => `${card.rankLabel} of ${card.suitName}`).join(', ')}.`)
  if (closesPile) {
    clearPile(`${player.name} closed the pile with the 2 of Coins and leads again.`)
    if (player.hand.length) announcePileLead(player, 'Pile cleared')
  }
  if (!player.hand.length) {
    player.finishedAt = state.finishOrder.length + 1
    state.finishOrder.push(player.name)
    state.log.push(`${player.name} went out in position ${player.finishedAt}.`)
    clearPile('Pile cleared after a player went out.')
  }
  return { closesPile, skipNext, wentOut: Boolean(player.finishedAt) }
}

function passPlayer(player, reason = 'passed') {
  state.passCount += 1
  state.log.push(`${player.name} ${reason}.`)
  if (state.passCount >= Math.max(1, activePlayers().length - 1)) {
    const pileOwnerId = state.pileOwnerId
    clearPile('Everyone else passed. The pile is cleared.')
    const pileOwner = state.players.find((item) => item.id === pileOwnerId && !item.finishedAt)
    if (pileOwner) {
      state.currentTurnId = pileOwner.id
      state.turnStartedAt = Date.now()
      announcePileLead(pileOwner, 'Pile cleared')
      return { closed: true }
    }
  }
  return { closed: false }
}

function endRound(reason = '') {
  if (state.phase !== 'playing') return
  if (reason) state.log.push(reason)
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
  state.pileNotice = null
  state.endRoundVotes = []
  state.readyNextRoundIds = []
  state.players.forEach((player) => {
    if (player.isSpectator && player.connected) player.isSpectator = false
  })
  state.log.push(`${winner || 'Nobody'} is El Presidente.`)
}

function dealRound() {
  state.players = state.players.filter((player) => player.isComputer || player.connected)
  state.players.forEach((player) => {
    player.isSpectator = false
  })
  reconcileComputerPlayer()
  ensureComputerPlayer()
  const deck = shuffle(createDeck())
  state.round += 1
  state.phase = 'playing'
  state.pile = []
  state.pileOwnerId = null
  state.skipNotice = null
  state.pileNotice = null
  state.endRoundVotes = []
  state.readyNextRoundIds = []
  state.passCount = 0
  state.finishOrder = []
  state.players = shuffle(state.players)
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
  state.log.push(`Play order: ${state.players.map((player) => player.name).join(', ')}.`)
}

function emitAll() {
  io.to(state.code).emit('tableState', tableState())
  state.players.filter((player) => !player.isComputer).forEach((player) => {
    io.to(player.id).emit('playerState', playerState(player))
  })
  scheduleComputerTurn()
}

function scheduleComputerTurn() {
  if (state.computerTurnTimer) {
    clearTimeout(state.computerTurnTimer)
    state.computerTurnTimer = null
  }
  if (state.phase !== 'playing') return
  const player = state.players.find((item) => item.id === state.currentTurnId)
  if (!player?.isComputer || player.finishedAt) return

  const roomCode = state.code
  state.computerTurnTimer = setTimeout(() => {
    state = getRoom(roomCode)
    state.computerTurnTimer = null
    takeComputerTurn(player.id)
  }, COMPUTER_TURN_DELAY)
}

function takeComputerTurn(playerId) {
  const player = state.players.find((item) => item.id === playerId)
  if (!player || !player.isComputer || state.phase !== 'playing' || state.currentTurnId !== player.id || player.finishedAt) {
    return
  }

  const [cards] = legalCardGroupsFor(player)
  let skipNextPlay = false
  if (cards) {
    const result = playCards(player, cards)
    skipNextPlay = result.skipNext
    if (result.closesPile && !player.finishedAt) {
      state.currentTurnId = player.id
      state.turnStartedAt = Date.now()
      emitAll()
      return
    }
  } else {
    const { closed } = passPlayer(player)
    if (closed) {
      emitAll()
      return
    }
  }
  const resultWentOut = cards ? Boolean(player.finishedAt) : false
  nextTurn(player.id, skipNextPlay)
  if (resultWentOut && state.phase === 'playing') {
    announcePileLead(state.players.find((item) => item.id === state.currentTurnId), 'Pile cleared')
  }
  emitAll()
}

const httpServer = createServer(serveStatic)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

function attachSocketToRoom(socket, rawCode) {
  const room = getRoom(rawCode)
  if (socket.data.roomCode && socket.data.roomCode !== room.code) socket.leave(socket.data.roomCode)
  socket.join(room.code)
  socket.data.roomCode = room.code
  state = room
  return room
}

function setRoomFromSocket(socket) {
  state = getRoom(socket.data.roomCode || 'TABLE')
  return state
}

io.on('connection', (socket) => {
  attachSocketToRoom(socket, socket.handshake.query?.room || 'TABLE')
  socket.emit('tableState', tableState())

  socket.on('watchRoom', (roomCode, reply) => {
    attachSocketToRoom(socket, roomCode)
    reply?.({ ok: true, roomCode: state.code })
    socket.emit('tableState', tableState())
  })

  socket.on('join', (payload, reply) => {
    attachSocketToRoom(socket, typeof payload === 'object' && payload ? payload.roomCode : socket.data.roomCode)
    const name = String(typeof payload === 'object' && payload ? payload.name : payload || '').trim().slice(0, 20)
    const identity = playerIdentity(payload)
    if (!name) {
      reply?.({ ok: false, error: 'Enter a name.' })
      return
    }
    const existing = state.players.find((player) => !player.isComputer && player.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      existing.id = socket.id
      existing.connected = true
      existing.icon = identity.icon
      existing.color = identity.color
      existing.hand = existing.hand || []
      reply?.({ ok: true, id: socket.id, roomCode: state.code, spectator: Boolean(existing.isSpectator) })
    } else {
      const joinsAsSpectator = state.phase === 'playing'
      state.players.push({
        id: socket.id,
        name,
        icon: identity.icon,
        color: identity.color,
        role: 'neutral',
        hand: [],
        connected: true,
        finishedAt: null,
        isSpectator: joinsAsSpectator,
        isComputer: false,
      })
      state.log.push(joinsAsSpectator ? `${name} joined room ${state.code} as a spectator.` : `${name} joined room ${state.code}.`)
      reply?.({ ok: true, id: socket.id, roomCode: state.code, spectator: joinsAsSpectator })
    }
    reconcileComputerPlayer()
    emitAll()
  })

  socket.on('startGame', (reply) => {
    setRoomFromSocket(socket)
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
    setRoomFromSocket(socket)
    if (state.computerTurnTimer) {
      clearTimeout(state.computerTurnTimer)
      state.computerTurnTimer = null
    }
    state.phase = 'lobby'
    state.players = []
    state.pile = []
    state.pileOwnerId = null
    state.skipNotice = null
    state.pileNotice = null
    state.endRoundVotes = []
    state.readyNextRoundIds = []
    state.currentTurnId = null
    state.turnStartedAt = null
    state.passCount = 0
    state.finishOrder = []
    state.chat = []
    state.log = [`Room ${state.code} reset. Scan or enter the room code to join again.`]
    io.to(state.code).emit('lobbyReset', { roomCode: state.code })
    emitAll()
  })

  socket.on('playCards', (cardIds, reply) => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || player.isSpectator || state.phase !== 'playing' || state.currentTurnId !== player.id || player.finishedAt) {
      reply?.({ ok: false, error: 'It is not your turn.' })
      return
    }
    const ids = Array.isArray(cardIds) ? cardIds : []
    const uniqueIds = new Set(ids)
    if (uniqueIds.size !== ids.length) {
      reply?.({ ok: false, error: 'Choose each card only once.' })
      return
    }
    const selected = ids.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean)
    if (!selected.length || selected.length !== ids.length) {
      reply?.({ ok: false, error: 'Choose cards from your hand.' })
      return
    }
    if (selected.some((card) => card.rank !== selected[0].rank)) {
      reply?.({ ok: false, error: 'Play cards of the same rank together.' })
      return
    }
    const closesPile = selected.some(isPileCloser)
    if (state.pile.length && !closesPile && selected.length !== state.pile.length) {
      reply?.({ ok: false, error: `Play ${state.pile.length} card${state.pile.length === 1 ? '' : 's'} to match the pile.` })
      return
    }
    if (state.pile.length && !closesPile && selected[0].strength < state.pile[0].strength) {
      reply?.({ ok: false, error: 'Play cards that match or beat the pile.' })
      return
    }
    const result = playCards(player, selected)
    reply?.({ ok: true })
    if (result.closesPile && !player.finishedAt) {
      state.currentTurnId = player.id
      state.turnStartedAt = Date.now()
    } else {
      nextTurn(player.id, result.skipNext)
      if (result.wentOut && state.phase === 'playing') {
        announcePileLead(state.players.find((item) => item.id === state.currentTurnId), 'Pile cleared')
      }
    }
    emitAll()
  })

  socket.on('voteEndRound', (reply) => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || player.isSpectator || player.finishedAt || state.phase !== 'playing') {
      reply?.({ ok: false, error: 'Only active players can vote.' })
      return
    }
    if (!state.endRoundVotes.includes(player.id)) state.endRoundVotes.push(player.id)
    const voters = endRoundVotingPlayers()
    const target = Math.max(1, Math.floor(voters.length / 2) + 1)
    state.endRoundVotes = state.endRoundVotes.filter((playerId) => voters.some((voter) => voter.id === playerId))
    state.log.push(`${player.name} voted to end the round (${state.endRoundVotes.length}/${target}).`)
    if (state.endRoundVotes.length >= target) endRound('Round ended early by vote.')
    reply?.({ ok: true })
    emitAll()
  })

  socket.on('readyNextRound', (reply) => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || player.isSpectator || state.phase !== 'finished') {
      reply?.({ ok: false, error: 'Wait for the round to finish.' })
      return
    }
    if (!state.readyNextRoundIds.includes(player.id)) state.readyNextRoundIds.push(player.id)
    const readyPlayers = humanPlayers()
    state.readyNextRoundIds = state.readyNextRoundIds.filter((playerId) => readyPlayers.some((readyPlayer) => readyPlayer.id === playerId))
    state.log.push(`${player.name} is ready for the next round (${state.readyNextRoundIds.length}/${readyPlayers.length}).`)
    if (readyPlayers.length >= MIN_HUMANS_WITH_COMPUTER && state.readyNextRoundIds.length >= readyPlayers.length) {
      dealRound()
    }
    reply?.({ ok: true })
    emitAll()
  })

  socket.on('passTurn', (reply) => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || player.isSpectator || state.phase !== 'playing' || state.currentTurnId !== player.id) {
      reply?.({ ok: false, error: 'It is not your turn.' })
      return
    }
    if (!state.pile.length) {
      reply?.({ ok: false, error: 'Lead with a card before passing.' })
      return
    }
    const { closed } = passPlayer(player)
    reply?.({ ok: true })
    if (!closed) nextTurn(player.id)
    emitAll()
  })

  socket.on('sendChat', (message, reply) => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id && !item.isComputer)
    if (!player || player.isSpectator || player.finishedAt) {
      reply?.({ ok: false, error: 'Only active players can chat.' })
      return
    }
    const text = String(message || '').trim().slice(0, 180)
    if (!text) {
      reply?.({ ok: false, error: 'Enter a message.' })
      return
    }
    state.chat.push({
      id: `${Date.now()}-${socket.id}`,
      playerId: player.id,
      name: player.name,
      text,
      sentAt: new Date().toISOString(),
    })
    state.chat = state.chat.slice(-CHAT_LIMIT)
    reply?.({ ok: true })
    emitAll()
  })

  socket.on('updateMusic', (payload, reply) => {
    setRoomFromSocket(socket)
    const parsed = youtubeEmbedFromInput(typeof payload === 'object' && payload ? payload.source : payload)
    if (!parsed) {
      reply?.({ ok: false, error: 'Paste a valid YouTube video or playlist link.' })
      return
    }
    const title = String(typeof payload === 'object' && payload ? payload.title || '' : '').trim().slice(0, 60)
    state.music = {
      title: title || 'YouTube Music',
      embedUrl: parsed.embedUrl,
      source: parsed.source,
      updatedAt: Date.now(),
    }
    state.log.push(`Host changed the room music to ${state.music.title}.`)
    reply?.({ ok: true })
    emitAll()
  })

  socket.on('disconnect', () => {
    setRoomFromSocket(socket)
    const player = state.players.find((item) => item.id === socket.id)
    if (player) {
      player.connected = false
      state.endRoundVotes = state.endRoundVotes.filter((playerId) => playerId !== player.id)
      state.readyNextRoundIds = state.readyNextRoundIds.filter((playerId) => playerId !== player.id)
      state.log.push(`${player.name} disconnected.`)
      emitAll()
    }
  })
})

setInterval(() => {
  for (const room of rooms.values()) {
    state = room
    if (state.phase !== 'playing' || !state.currentTurnId || !state.turnStartedAt) continue
    if (Date.now() - state.turnStartedAt > TURN_SECONDS * 1000) {
      const player = state.players.find((item) => item.id === state.currentTurnId)
      if (player) {
        const { closed } = passPlayer(player, 'timed out and passed')
        if (!closed) nextTurn(player.id)
        emitAll()
      }
    }
  }
}, 1000)

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`El Presidente realtime server on http://${lanAddress()}:${PORT}`)
})
