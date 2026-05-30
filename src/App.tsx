import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { io, Socket } from 'socket.io-client'
import {
  Bot,
  BookOpen,
  Circle,
  Club,
  Crown,
  Flame,
  Heart,
  Hourglass,
  Layers3,
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
import type { Card, GameState, Player, PlayerColor, PlayerIcon, PlayerRole, RecentWinner } from './gameTypes'

const socketUrl = import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001` : window.location.origin
const socket: Socket = io(socketUrl)
const minimumPlayers = 3
const minimumHumansWithComputer = 2
const playerIcons: Array<{ id: PlayerIcon; label: string }> = [
  { id: 'crown', label: 'Crown' },
  { id: 'sparkles', label: 'Spark' },
  { id: 'flame', label: 'Flame' },
  { id: 'heart', label: 'Heart' },
  { id: 'shield', label: 'Shield' },
  { id: 'club', label: 'Club' },
  { id: 'star', label: 'Star' },
  { id: 'sun', label: 'Sun' },
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
  log: [],
  joinUrl: `${window.location.origin}/join`,
}

function App() {
  const isPhone = window.location.pathname.startsWith('/join')
  return isPhone ? <PlayerScreen /> : <HostScreen />
}

function useSocketState(player = false) {
  const [state, setState] = useState<GameState>(emptyState)
  const [connected, setConnected] = useState(() => socket.connected)

  useEffect(() => {
    const eventName = player ? 'playerState' : 'tableState'
    const onState = (nextState: GameState) => setState(nextState)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on(eventName, onState)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)

    return () => {
      socket.off(eventName, onState)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [player])

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
  const { state, connected } = useSocketState()
  const [qr, setQr] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const seconds = useCountdown(state)
  const humanPlayers = state.players.filter((player) => !player.isComputer)
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
          {qr && <img src={qr} alt="QR code to join the El Presidente table" />}
          <span>Scan with your phone camera to join</span>
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
        <Scoreboard players={state.players} finishOrder={state.finishOrder} recentWinners={state.recentWinners} />
        <div className="event-log">
          <h2>Table Log</h2>
          {state.log.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </aside>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}

function PlayerScreen() {
  const { state, connected } = useSocketState(true)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<PlayerIcon>('star')
  const [color, setColor] = useState<PlayerColor>('gold')
  const [joined, setJoined] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const seconds = useCountdown(state)
  const hand = useMemo(() => state.hand || [], [state.hand])
  const isTurn = state.currentTurnId === state.selfId

  const legalCardIds = useMemo(() => {
    if (!state.pile.length) return new Set(hand.map((card) => card.id))
    return new Set(
      hand
        .filter((card) => Math.abs(card.strength - state.pile[0].strength) === 1)
        .map((card) => card.id),
    )
  }, [hand, state.pile])

  const join = (event: React.FormEvent) => {
    event.preventDefault()
    socket.emit('join', { name, icon, color }, (reply: { ok: boolean; error?: string }) => {
      if (reply.ok) {
        setJoined(true)
        setError('')
      } else {
        setError(reply.error || 'Could not join.')
      }
    })
  }

  const toggleCard = (card: Card) => {
    if (!isTurn || !legalCardIds.has(card.id)) return
    setSelected((current) => (current.includes(card.id) ? [] : [card.id]))
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
      <header className="phone-header">
        <div>
          <span>{state.selfName}</span>
          <h1>{isTurn ? 'Your turn' : `${state.currentPlayerName || 'Table'} is up`}</h1>
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
        {hand.map((card, index) => (
          <button
            key={card.id}
            type="button"
            className={`hand-card ${selected.includes(card.id) ? 'selected' : ''}`}
            disabled={!isTurn || !legalCardIds.has(card.id)}
            onClick={() => toggleCard(card)}
          >
            <SpanishCard card={card} compact index={index} />
          </button>
        ))}
      </section>

      <footer className="phone-actions">
        <div className="selection-meter">
          <Sparkles size={16} />
          <span>{selected.length ? `${selected.length} selected` : isTurn ? 'Choose a card' : 'Waiting'}</span>
        </div>
        <button type="button" onClick={playSelected} disabled={!isTurn || !selected.length}>
          <Play size={18} />
          Play card
        </button>
        <button type="button" className="secondary" onClick={passTurn} disabled={!isTurn}>
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
}: {
  players: Player[]
  finishOrder: string[]
  recentWinners: RecentWinner[]
}) {
  return (
    <div className="scoreboard">
      <h2>
        <Trophy size={20} />
        Score
      </h2>
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
        <div className={`seat-avatar color-${color}`}>
          <PlayerGlyph icon={icon} />
        </div>
        <span>Choose your table look</span>
      </div>
      <div className="picker-group" aria-label="Choose a player icon">
        {playerIcons.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`icon-choice ${icon === item.id ? 'selected' : ''}`}
            aria-label={item.label}
            aria-pressed={icon === item.id}
            onClick={() => onIconChange(item.id)}
          >
            <PlayerGlyph icon={item.id} />
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
  return (
    <div className={`seat-avatar color-${player.color || 'gold'} ${compact ? 'compact' : ''}`}>
      <PlayerGlyph icon={player.isComputer ? 'bot' : player.icon || 'star'} />
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
          <li>After a lead, play exactly one card that is one rank higher or one rank lower than the current pile card.</li>
          <li>You cannot pass on an empty pile. Once a card is on the pile, you may pass if you have no useful play or want to hold your cards.</li>
          <li>When every other active player passes, the pile clears and the next player leads any card.</li>
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
