import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { io, Socket } from 'socket.io-client'
import {
  Bot,
  BookOpen,
  Circle,
  Club,
  Crown,
  Eye,
  Flame,
  Heart,
  Hourglass,
  Layers3,
  MessageCircle,
  Play,
  RefreshCw,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trophy,
  UserRound,
  UsersRound,
  Wifi,
  WifiOff,
} from 'lucide-react'
import './App.css'
import type { Card, ChatMessage, GameState, Player, PlayerColor, PlayerIcon, PlayerRole, RecentWinner, ScoreSummary } from './gameTypes'

const socketUrl = import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin
const socket: Socket = io(socketUrl)
const minimumPlayers = 3
const minimumHumansWithComputer = 2
const playerIcons: Array<{ id: PlayerIcon; label: string }> = [
  { id: 'crown', label: 'Royal' },
  { id: 'sparkles', label: 'Magic' },
  { id: 'flame', label: 'Fire' },
  { id: 'heart', label: 'Heart' },
  { id: 'shield', label: 'Guard' },
  { id: 'club', label: 'Club' },
  { id: 'star', label: 'Star' },
  { id: 'sun', label: 'Sun' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'moon', label: 'Moon' },
  { id: 'gem', label: 'Gem' },
]
const playerColors: Array<{ id: PlayerColor; label: string }> = [
  { id: 'gold', label: 'Gold' },
  { id: 'green', label: 'Green' },
  { id: 'red', label: 'Red' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
  { id: 'teal', label: 'Teal' },
  { id: 'rose', label: 'Rose' },
  { id: 'slate', label: 'Slate' },
]

const emptyState: GameState = {
  roomCode: '',
  phase: 'lobby',
  players: [],
  pile: [],
  activeHand: [],
  currentTurnId: null,
  currentPlayerName: null,
  turnStartedAt: null,
  turnSeconds: 30,
  passCount: 0,
  finishOrder: [],
  round: 0,
  recentWinners: [],
  scoreSummary: {
    lastPresident: null,
    topWinner: null,
  },
  chat: [],
  log: [],
  joinUrl: `${window.location.origin}/join`,
}

function isPileCloser(card: Card) {
  return card.rank === 2 && card.suit === 'oros'
}

function App() {
  const isPhone = window.location.pathname.startsWith('/join')
  return isPhone ? <PlayerScreen /> : <HostScreen />
}

function roomCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('room') || ''
}

function useSocketState(player = false, requestedRoomCode = '') {
  const [state, setState] = useState<GameState>(emptyState)
  const [connected, setConnected] = useState(() => socket.connected)

  useEffect(() => {
    const eventName = player ? 'playerState' : 'tableState'
    const onState = (nextState: GameState) => {
      setState(nextState)
      if (!player && nextState.roomCode) {
        window.localStorage.setItem('el-presidente-room', nextState.roomCode)
        window.history.replaceState(null, '', `/?room=${nextState.roomCode}`)
      }
    }
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on(eventName, onState)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (!player || requestedRoomCode) socket.emit('watchRoom', requestedRoomCode, () => undefined)

    return () => {
      socket.off(eventName, onState)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [player, requestedRoomCode])

  return { state, connected }
}

function useCountdown(state: GameState) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  if (!state.turnStartedAt || state.phase !== 'playing') return state.turnSeconds
  return Math.min(state.turnSeconds, Math.max(0, Math.ceil(state.turnSeconds - (now - state.turnStartedAt) / 1000)))
}

function HostScreen() {
  const [hostRoomCode] = useState(() => roomCodeFromUrl() || window.localStorage.getItem('el-presidente-room') || '')
  const { state, connected } = useSocketState(false, hostRoomCode)
  const [qr, setQr] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const seconds = useCountdown(state)
  const humanPlayers = state.players.filter((player) => !player.isComputer && !player.isSpectator && player.connected)
  const canStart = humanPlayers.length >= minimumHumansWithComputer && state.phase !== 'playing'

  useEffect(() => {
    QRCode.toDataURL(state.joinUrl, {
      margin: 1,
      width: 240,
      color: { dark: '#1c130c', light: '#f8efdf' },
    }).then(setQr)
  }, [state.joinUrl])

  const startGame = () => socket.emit('startGame', () => undefined)
  const resetLobby = () => socket.emit('resetLobby')

  return (
    <main className={`host-shell phase-${state.phase}`}>
      <section className="join-rail">
        <div className="brand-lockup">
          <div>
            <h1>El Presidente</h1>
            <p>Spanish Card Game</p>
          </div>
        </div>
        <div className="qr-panel">
          <Smartphone size={30} />
          <h2>Join the game</h2>
          <div className="room-code-card">
            <span>Room code</span>
            <strong>{state.roomCode || '...'}</strong>
          </div>
          {qr && <img src={qr} alt="QR code to join the El Presidente table" />}
          <span>Scan or enter the room code to join</span>
          <p>{state.joinUrl}</p>
        </div>
        <div className="host-actions">
          <button type="button" onClick={startGame} disabled={!canStart}>
            <Play size={18} />
            Start
          </button>
          <button type="button" className="secondary" onClick={resetLobby}>
            <RefreshCw size={18} />
            Reset
          </button>
          <button type="button" className="secondary" onClick={() => setRulesOpen(true)}>
            <BookOpen size={18} />
            Rules
          </button>
        </div>
        {state.phase !== 'playing' && (
          <p className="start-requirement">
            {humanPlayers.length >= minimumPlayers
              ? 'Ready for a full human table.'
              : humanPlayers.length >= minimumHumansWithComputer
                ? 'Start now to add a computer player.'
                : `${minimumHumansWithComputer - humanPlayers.length} more player${
                    minimumHumansWithComputer - humanPlayers.length === 1 ? '' : 's'
                  } needed to start.`}
          </p>
        )}
      </section>

      <section className={`table-stage ${state.phase === 'playing' ? 'is-playing' : 'is-lobby'}`}>
        <TurnAnnouncement
          key={state.currentTurnId || 'no-turn'}
          message={state.phase === 'playing' && state.currentPlayerName ? `${state.currentPlayerName}'s turn` : ''}
        />
        <div className="top-controls">
          <div className="table-stat">
            <UsersRound size={16} />
            <span>{state.players.length}</span>
            <small>players</small>
          </div>
          <div className="table-stat">
            <Layers3 size={16} />
            <span>{state.pile.length}</span>
            <small>pile</small>
          </div>
          <StatusPill connected={connected} />
          <div className="round-pill">Round {state.round || 'Lobby'}</div>
        </div>
        <div className="table-felt">
          <div className="felt-emblem" aria-hidden="true">
            EP
          </div>
          <div className="turn-orbit">
            {state.players.map((player, index) => (
              <PlayerSeat
                key={player.id}
                player={player}
                index={index}
                total={Math.max(state.players.length, 1)}
                active={state.currentTurnId === player.id}
              />
            ))}
          </div>
          <div className="center-table">
            <div className="next-player panel-card">
              <Crown size={34} />
              <span>{state.phase === 'playing' ? 'Next player' : 'Waiting for players'}</span>
              <strong>{state.currentPlayerName || 'Scan to join'}</strong>
              <small>
                {state.phase === 'playing'
                  ? `${state.passCount} passes this pile`
                  : `${humanPlayers.length}/${minimumHumansWithComputer} humans ready`}
              </small>
            </div>
            <div className="pile-zone">
              <div className="pile-halo" aria-hidden="true" />
              {state.pile.length ? (
                state.pile.map((card, index) => <SpanishCard key={card.id} card={card} stacked={index} />)
              ) : (
                <div className="empty-pile">Current pile</div>
              )}
            </div>
            <div className="timer-dial panel-card">
              <Hourglass size={24} />
              <strong>{seconds}</strong>
              <span>seconds</span>
            </div>
          </div>
        </div>
      </section>

      <aside className="score-rail">
        <Scoreboard
          players={state.players}
          finishOrder={state.finishOrder}
          recentWinners={state.recentWinners}
          scoreSummary={state.scoreSummary}
        />
        <div className="event-log">
          <h2>Table Log</h2>
          {state.log.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
        <ChatPanel messages={state.chat} canSend={false} />
      </aside>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}

function PlayerScreen() {
  const initialRoomCode = roomCodeFromUrl()
  const [requestedRoomCode, setRequestedRoomCode] = useState(initialRoomCode)
  const { state, connected } = useSocketState(true, requestedRoomCode)
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState(initialRoomCode)
  const [icon, setIcon] = useState<PlayerIcon>('star')
  const [color, setColor] = useState<PlayerColor>('gold')
  const [joined, setJoined] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const seconds = useCountdown(state)
  const hand = useMemo(() => state.hand || [], [state.hand])
  const isTurn = state.currentTurnId === state.selfId
  const selfPlayer = state.players.find((player) => player.id === state.selfId)
  const canChat = joined && !state.selfSpectator && Boolean(selfPlayer && !selfPlayer.finishedAt)
  const requiredPlayCount = state.pile.length || 0

  const legalCardIds = useMemo(() => {
    if (!state.pile.length) return new Set(hand.map((card) => card.id))
    return new Set(hand.filter((card) => card.strength > state.pile[0].strength).map((card) => card.id))
  }, [hand, state.pile])
  const selectedCards = useMemo(() => selected.map((id) => hand.find((card) => card.id === id)).filter((card): card is Card => Boolean(card)), [hand, selected])
  const selectedClosesPile = selectedCards.some(isPileCloser)
  const selectableCardIds = useMemo(() => {
    if (!selectedCards.length) return legalCardIds
    const selectedRank = selectedCards[0].rank
    return new Set(
      hand
        .filter((card) => {
          if (selected.includes(card.id)) return true
          if (!legalCardIds.has(card.id) || card.rank !== selectedRank) return false
          if (!requiredPlayCount || selectedClosesPile) return true
          return selected.length < requiredPlayCount
        })
        .map((card) => card.id),
    )
  }, [hand, legalCardIds, requiredPlayCount, selected, selectedCards, selectedClosesPile])
  const canPlaySelected = Boolean(
    selected.length && (!requiredPlayCount || selectedClosesPile || selected.length === requiredPlayCount),
  )

  const join = (event: React.FormEvent) => {
    event.preventDefault()
    const nextRoomCode = roomCode.trim().toUpperCase()
    if (!nextRoomCode) {
      setError('Enter the room code from the table.')
      return
    }
    setRequestedRoomCode(nextRoomCode)
    socket.emit('join', { name, icon, color, roomCode: nextRoomCode }, (reply: { ok: boolean; error?: string; roomCode?: string }) => {
      if (reply.ok) {
        setJoined(true)
        if (reply.roomCode) {
          setRoomCode(reply.roomCode)
          setRequestedRoomCode(reply.roomCode)
          window.history.replaceState(null, '', `/join?room=${reply.roomCode}`)
        }
        setError('')
      } else {
        setError(reply.error || 'Could not join.')
      }
    })
  }

  useEffect(() => {
    const onLobbyReset = () => {
      setJoined(false)
      setName('')
      setSelected([])
      setError('')
    }

    socket.on('lobbyReset', onLobbyReset)
    return () => {
      socket.off('lobbyReset', onLobbyReset)
    }
  }, [])

  const toggleCard = (card: Card) => {
    if (!isTurn || !selectableCardIds.has(card.id)) return
    setSelected((current) => (current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]))
  }

  const playSelected = () => {
    socket.emit('playCards', selected, (reply: { ok: boolean; error?: string }) => {
      if (reply.ok) {
        setSelected([])
        setError('')
      } else {
        setError(reply.error || 'That play is not legal.')
      }
    })
  }

  const passTurn = () => {
    socket.emit('passTurn', (reply: { ok: boolean; error?: string }) => {
      setError(reply.ok ? '' : reply.error || 'Could not pass.')
    })
  }

  if (!joined) {
    return (
      <main className="phone-shell join-phone">
        <div className="phone-card">
          <span className="brand-mark">EP</span>
          <h1>Join El Presidente</h1>
          <form onSubmit={join}>
            <label htmlFor="playerName">Your name</label>
            <input
              id="playerName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={20}
              autoComplete="name"
              autoFocus
            />
            <label htmlFor="roomCode">Room code</label>
            <input
              id="roomCode"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              maxLength={12}
              autoComplete="off"
              placeholder="Enter code from the table"
            />
            <IdentityPicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />
            <button type="submit">
              <Send size={18} />
              Join table
            </button>
            <button type="button" className="secondary" onClick={() => setRulesOpen(true)}>
              <BookOpen size={18} />
              Rules
            </button>
          </form>
          {error && <p className="error-text">{error}</p>}
          <StatusPill connected={connected} />
        </div>
        <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      </main>
    )
  }

  return (
    <main className={`phone-shell ${isTurn ? 'is-turn' : 'is-waiting'}`}>
      <TurnAnnouncement
        key={state.currentTurnId || 'no-turn'}
        message={state.phase === 'playing' && state.currentPlayerName ? `${state.currentPlayerName}'s turn` : ''}
      />
      <header className="phone-header">
        <div>
          <span>{state.selfSpectator ? `Watching ${state.roomCode}` : state.selfName}</span>
          <h1>{state.selfSpectator ? 'Spectating' : isTurn ? 'Your turn' : `${state.currentPlayerName || 'Table'} is up`}</h1>
        </div>
        <div className="mini-timer">{seconds}s</div>
      </header>

      <section className="phone-pile">
        <span>Pile</span>
        {state.pile.length ? (
          <div className="mini-pile">{state.pile.map((card) => <SpanishCard key={card.id} card={card} compact />)}</div>
        ) : (
          <strong>Clear</strong>
        )}
      </section>

      <section className="hand-grid" aria-label="Your cards">
        {state.selfSpectator ? (
          <div className="spectator-panel">
            <Eye size={22} />
            <strong>Watching this round</strong>
            <span>You will join the next deal in room {state.roomCode}.</span>
          </div>
        ) : (
          hand.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`hand-card ${selected.includes(card.id) ? 'selected' : ''}`}
              disabled={!isTurn || !selectableCardIds.has(card.id)}
              onClick={() => toggleCard(card)}
            >
              <SpanishCard card={card} compact index={index} />
            </button>
          ))
        )}
      </section>
      <ChatPanel messages={state.chat} canSend={canChat} />

      <footer className="phone-actions">
        <div className="selection-meter">
          <Sparkles size={16} />
          <span>{selected.length ? `${selected.length} selected` : isTurn ? 'Choose cards' : 'Waiting'}</span>
        </div>
        <button type="button" onClick={playSelected} disabled={state.selfSpectator || !isTurn || !canPlaySelected}>
          <Play size={18} />
          Play cards
        </button>
        <button type="button" className="secondary" onClick={passTurn} disabled={state.selfSpectator || !isTurn}>
          Pass
        </button>
        <button type="button" className="secondary" onClick={() => setRulesOpen(true)}>
          <BookOpen size={18} />
          Rules
        </button>
      </footer>
      {error && <p className="error-text floating">{error}</p>}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}

function ChatPanel({ messages, canSend }: { messages: ChatMessage[]; canSend: boolean }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text) return
    socket.emit('sendChat', text, (reply: { ok: boolean; error?: string }) => {
      if (reply.ok) {
        setMessage('')
        setError('')
      } else {
        setError(reply.error || 'Could not send.')
      }
    })
  }

  return (
    <section className="chat-panel">
      <h2>
        <MessageCircle size={18} />
        Room Chat
      </h2>
      <div className="chat-feed">
        {messages.length ? (
          messages.map((item) => (
            <p key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.text}</span>
            </p>
          ))
        ) : (
          <p className="empty-chat">No messages yet</p>
        )}
      </div>
      {canSend && (
        <form className="chat-form" onSubmit={sendMessage}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={180}
            placeholder="Message active players"
          />
          <button type="submit" aria-label="Send chat message" disabled={!message.trim()}>
            <Send size={16} />
          </button>
        </form>
      )}
      {error && <p className="chat-error">{error}</p>}
    </section>
  )
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className={`status-pill ${connected ? 'online' : 'offline'}`}>
      {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
      {connected ? 'Live' : 'Offline'}
    </div>
  )
}

function Scoreboard({
  players,
  finishOrder,
  recentWinners = [],
  scoreSummary,
}: {
  players: Player[]
  finishOrder: string[]
  recentWinners: RecentWinner[]
  scoreSummary: ScoreSummary
}) {
  return (
    <div className="scoreboard">
      <h2>
        <Trophy size={20} />
        Score
      </h2>
      <div className="score-summary">
        <div>
          <span>Last President</span>
          <strong>{scoreSummary.lastPresident?.name || 'None yet'}</strong>
        </div>
        <div>
          <span>Most wins</span>
          <strong>
            {scoreSummary.topWinner ? `${scoreSummary.topWinner.name} (${scoreSummary.topWinner.wins})` : 'None yet'}
          </strong>
        </div>
      </div>
      {players.map((player) => (
        <div className="score-row" key={player.id}>
          <span className="score-name">
            <PlayerAvatar player={player} compact />
            {player.name}
          </span>
          <RoleBadge role={player.role} />
          <span>{player.finishedAt ? `#${player.finishedAt}` : `${player.handCount} cards`}</span>
          <strong>{player.wins}</strong>
        </div>
      ))}
      {finishOrder.length > 0 && <p className="finish-line">Finish order: {finishOrder.join(', ')}</p>}
      {recentWinners.length > 0 && (
        <div className="recent-winners">
          <h3>Recent Winners</h3>
          {recentWinners.slice(0, 5).map((winner) => (
            <div className="winner-row" key={`${winner.round}-${winner.name}-${winner.wonAt}`}>
              <span>
                {winner.isComputer ? <Bot size={14} /> : <Trophy size={14} />}
                {winner.name}
              </span>
              <strong>R{winner.round}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnAnnouncement({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="turn-announcement" aria-live="polite">
      <Crown size={28} />
      <span>{message}</span>
    </div>
  )
}

function PlayerSeat({
  player,
  index,
  total,
  active,
}: {
  player: Player
  index: number
  total: number
  active: boolean
}) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const x = 50 + Math.cos(angle) * 42
  const y = 50 + Math.sin(angle) * 38

  return (
    <div
      className={`player-seat ${active ? 'active' : ''} ${player.finishedAt ? 'finished' : ''} role-${player.role}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <PlayerAvatar player={player} />
      <span>{player.name}</span>
      <strong>{player.finishedAt ? `Out #${player.finishedAt}` : `${player.handCount} cards`}</strong>
      <RoleBadge role={player.role} />
    </div>
  )
}

function IdentityPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
}: {
  icon: PlayerIcon
  color: PlayerColor
  onIconChange: (icon: PlayerIcon) => void
  onColorChange: (color: PlayerColor) => void
}) {
  return (
    <div className="identity-picker">
      <div className="identity-preview">
        <div className={`seat-avatar color-${color} icon-${icon}`}>
          <PlayerGlyph icon={icon} />
        </div>
        <span>Choose your table look</span>
      </div>
      <div className="picker-group" aria-label="Choose a player icon">
        {playerIcons.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`icon-choice icon-${item.id} ${icon === item.id ? 'selected' : ''}`}
            aria-label={item.label}
            aria-pressed={icon === item.id}
            onClick={() => onIconChange(item.id)}
          >
            <PlayerGlyph icon={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="picker-group color-group" aria-label="Choose a player color">
        {playerColors.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`color-choice color-${item.id} ${color === item.id ? 'selected' : ''}`}
            aria-label={item.label}
            aria-pressed={color === item.id}
            onClick={() => onColorChange(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function PlayerAvatar({ player, compact = false }: { player: Player; compact?: boolean }) {
  const icon = player.isComputer ? 'bot' : player.icon || 'star'
  return (
    <div className={`seat-avatar color-${player.color || 'gold'} icon-${icon} ${compact ? 'compact' : ''}`}>
      <PlayerGlyph icon={icon} />
    </div>
  )
}

function PlayerGlyph({ icon }: { icon: PlayerIcon }) {
  const size = 14
  if (icon === 'bot') return <Bot size={size} />
  if (icon === 'crown') return <Crown size={size} />
  if (icon === 'sparkles') return <Sparkles size={size} />
  if (icon === 'flame') return <Flame size={size} />
  if (icon === 'heart') return <Heart size={size} />
  if (icon === 'shield') return <Shield size={size} />
  if (icon === 'club') return <Club size={size} />
  if (icon === 'sun') return <Sun size={size} />
  if (icon === 'star') return <Star size={size} />
  if (icon === 'bolt') {
    return (
      <svg className="custom-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />
      </svg>
    )
  }
  if (icon === 'diamond') {
    return (
      <svg className="custom-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 9 12 21 3 9 12 3Z" />
        <path d="M7 9h10M9 9l3 12 3-12" />
      </svg>
    )
  }
  if (icon === 'moon') {
    return (
      <svg className="custom-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.5 18.5A8 8 0 0 1 12.2 3 7 7 0 1 0 21 11.8a8 8 0 0 1-3.5 6.7Z" />
      </svg>
    )
  }
  if (icon === 'gem') {
    return (
      <svg className="custom-glyph" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h12l4 6-10 11L2 10l4-6Z" />
        <path d="M2 10h20M8 4l4 17 4-17" />
      </svg>
    )
  }
  return <UserRound size={size} />
}

function RoleBadge({ role = 'neutral' }: { role?: PlayerRole }) {
  return (
    <span className={`role-badge role-${role}`} title={roleLabel(role)}>
      {role === 'president' ? <Crown size={13} /> : role === 'fool' ? <Sparkles size={13} /> : <Circle size={13} />}
      {roleLabel(role)}
    </span>
  )
}

function roleLabel(role: PlayerRole = 'neutral') {
  if (role === 'president') return 'President'
  if (role === 'fool') return 'Fool'
  return 'Neutral'
}

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2 id="rules-title">El Presidente Rules</h2>
          <button type="button" className="icon-button" aria-label="Close rules" onClick={onClose}>
            X
          </button>
        </div>
        <ol>
          <li>Each round deals the Spanish deck evenly across all seated players.</li>
          <li>The first player leads with any card when the pile is empty.</li>
          <li>Cards rank from 3 up to 12, then 1, then 2. The 2 of Coins is the absolute highest card.</li>
          <li>After a lead, play one or more cards of the same rank that are higher than the current pile rank.</li>
          <li>If the pile has two or more cards, every play must match that number of cards until the pile closes.</li>
          <li>Playing the 2 of Coins closes the pile immediately, and that player leads the next pile.</li>
          <li>You cannot pass on an empty pile. Once a card is on the pile, you may pass if you have no useful play or want to hold your cards.</li>
          <li>When every other active player passes, the pile clears and the last player who played leads again.</li>
          <li>The first player to run out of cards wins the round and becomes President.</li>
          <li>The last player remaining becomes Fool. Everyone else is Neutral.</li>
          <li>If only two humans are seated, the table adds a Computer Player as the third seat.</li>
          <li>Round wins are saved locally and stay on the scoreboard for future rounds.</li>
        </ol>
        <button type="button" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  )
}

function SpanishCard({
  card,
  compact = false,
  stacked = 0,
  index = 0,
}: {
  card: Card
  compact?: boolean
  stacked?: number
  index?: number
}) {
  const art = `/assets/cards/${card.rank}-${card.suit}.png`
  return (
    <article
      className={`spanish-card ${compact ? 'compact' : ''} ${art ? 'image-card' : ''} ${card.suitColor}`}
      style={{
        transform: stacked ? `translateX(${stacked * 24}px) rotate(${(stacked - 1) * 4}deg)` : undefined,
        animationDelay: `${Math.min(index, 12) * 35}ms`,
      }}
    >
      {art ? (
        <img src={art} alt={`${card.rankLabel} of ${card.suitName}`} />
      ) : (
        <>
          <div className="card-corner">
            <strong>{card.rankLabel}</strong>
            <SuitIcon card={card} />
          </div>
          <div className="card-art">
            <SuitIcon card={card} large />
          </div>
          <div className="card-suit">{card.suitName}</div>
        </>
      )}
    </article>
  )
}

function SuitIcon({ card, large = false }: { card: Card; large?: boolean }) {
  return <span className={`suit-icon ${card.suitSymbol} ${large ? 'large' : ''}`} aria-hidden="true" />
}

export default App
