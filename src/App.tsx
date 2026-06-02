import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { io, Socket } from 'socket.io-client'
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Circle,
  Club,
  Crown,
  Eye,
  Flag,
  Flame,
  Heart,
  Hourglass,
  Layers3,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music,
  Pause,
  Play,
  RefreshCw,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Trophy,
  UserX,
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
const cardRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]
const cardSuits = ['oros', 'copas', 'espadas', 'bastos']
const cardAssetPaths = cardRanks.flatMap((rank) => cardSuits.map((suit) => `/assets/cards/${rank}-${suit}.png`))
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
  paused: false,
  pausedAt: null,
  passCount: 0,
  finishOrder: [],
  round: 0,
  recentWinners: [],
  scoreSummary: {
    lastPresident: null,
    topWinner: null,
  },
  skipNotice: null,
  pileNotice: null,
  alertNotice: null,
  exchange: null,
  endRoundVotes: 0,
  endRoundVoteTarget: 0,
  readyNextRoundCount: 0,
  readyNextRoundTarget: 0,
  playerActivities: [],
  pendingRejoins: [],
  music: {
    title: 'Reggaeton Espanol',
    embedUrl: 'https://www.youtube.com/embed/kJQP7kiw5Fk?autoplay=1&list=RDkJQP7kiw5Fk',
    source: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
    updatedAt: 0,
  },
  chat: [],
  log: [],
  joinUrl: `${window.location.origin}/join`,
}

function isPileCloser(card: Card) {
  return card.rank === 2 && card.suit === 'oros'
}

function App() {
  const cardAssetsReady = useCardAssetsReady()
  const isPhone = window.location.pathname.startsWith('/join')
  if (!cardAssetsReady) return <CardPreloadScreen />
  return isPhone ? <PlayerScreen /> : <HostScreen />
}

function useCardAssetsReady() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const preloadLinks = cardAssetPaths.map((src) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = src
      document.head.appendChild(link)
      return link
    })
    Promise.all(
      cardAssetPaths.map(
        (src) =>
          new Promise<void>((resolve) => {
            const image = new Image()
            image.decoding = 'async'
            image.onload = () => {
              if (image.decode) image.decode().then(() => resolve()).catch(() => resolve())
              else resolve()
            }
            image.onerror = () => resolve()
            image.src = src
          }),
      ),
    ).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
      preloadLinks.forEach((link) => link.remove())
    }
  }, [])

  return ready
}

function CardPreloadScreen() {
  return (
    <main className="asset-preload-screen">
      <span className="brand-mark">EP</span>
      <h1>Loading cards</h1>
      <p>Preparing the table before the timer starts.</p>
    </main>
  )
}

function roomCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('room') || ''
}

function useSocketState(player = false, requestedRoomCode = '') {
  const [state, setState] = useState<GameState>(emptyState)
  const [connected, setConnected] = useState(() => socket.connected)

  useEffect(() => {
    const expectedRoomCode = requestedRoomCode.trim().toUpperCase()
    const eventName = player ? 'playerState' : 'tableState'
    const onState = (nextState: GameState) => {
      if (!player && expectedRoomCode && nextState.roomCode !== expectedRoomCode) return
      setState(nextState)
      if (!player && nextState.roomCode) {
        window.localStorage.setItem('el-presidente-room', nextState.roomCode)
        window.history.replaceState(null, '', `/?room=${nextState.roomCode}`)
      }
    }
    const onPauseState = (pauseState: Pick<GameState, 'paused' | 'pausedAt' | 'turnStartedAt'>) => {
      setState((current) => ({
        ...current,
        paused: pauseState.paused,
        pausedAt: pauseState.pausedAt,
        turnStartedAt: pauseState.turnStartedAt,
      }))
    }
    const onConnect = () => {
      setConnected(true)
      if (!player || expectedRoomCode) socket.emit('watchRoom', expectedRoomCode, () => undefined)
    }
    const onDisconnect = () => setConnected(false)

    socket.on(eventName, onState)
    socket.on('pauseState', onPauseState)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (!player || expectedRoomCode) socket.emit('watchRoom', expectedRoomCode, () => undefined)

    return () => {
      socket.off(eventName, onState)
      socket.off('pauseState', onPauseState)
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
  const effectiveNow = state.paused ? state.pausedAt || now : now
  return Math.min(state.turnSeconds, Math.max(0, Math.ceil(state.turnSeconds - (effectiveNow - state.turnStartedAt) / 1000)))
}

function HostScreen() {
  const [hostRoomCode] = useState(() => roomCodeFromUrl() || window.localStorage.getItem('el-presidente-room') || '')
  const { state, connected } = useSocketState(false, hostRoomCode)
  const [qr, setQr] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const seconds = useCountdown(state)
  const humanPlayers = state.players.filter((player) => !player.isComputer && !player.isSpectator && player.connected)
  const canStart = humanPlayers.length >= minimumHumansWithComputer && state.phase !== 'playing' && state.phase !== 'exchange'

  useEffect(() => {
    QRCode.toDataURL(state.joinUrl, {
      margin: 1,
      width: 240,
      color: { dark: '#1c130c', light: '#f8efdf' },
    }).then(setQr)
  }, [state.joinUrl])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const startGame = () => socket.emit('startGame', () => undefined)
  const resetLobby = () => socket.emit('resetLobby')
  const togglePause = () => socket.emit('setPaused', !state.paused, () => undefined)
  const kickPlayer = (playerId: string) => socket.emit('kickPlayer', playerId, () => undefined)
  const approveRejoin = (requestId: string) => socket.emit('approveRejoin', requestId, () => undefined)
  const declineRejoin = (requestId: string) => socket.emit('declineRejoin', requestId, () => undefined)
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

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
        {state.pendingRejoins.length > 0 && <PendingRejoinPanel requests={state.pendingRejoins} onApprove={approveRejoin} onDecline={declineRejoin} />}
        <HostMusicPanel music={state.music} />
        <div className="host-actions">
          <button type="button" onClick={startGame} disabled={!canStart}>
            <Play size={18} />
            Start
          </button>
          <button type="button" className="secondary" onClick={resetLobby}>
            <RefreshCw size={18} />
            Reset
          </button>
          <button type="button" className="secondary" onClick={togglePause} disabled={state.phase === 'lobby' || state.phase === 'finished'}>
            {state.paused ? <Play size={18} /> : <Pause size={18} />}
            {state.paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="secondary" onClick={() => setRulesOpen(true)}>
            <BookOpen size={18} />
            Rules
          </button>
          <button type="button" className="secondary" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
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
        {state.paused && <PauseOverlay onResume={togglePause} />}
        <SkipNotice notice={state.skipNotice} selfId={state.selfId} />
        <PileNotice notice={state.pileNotice} selfId={state.selfId} />
        <AlertNotice notice={state.alertNotice} selfId={state.selfId} />
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
          {state.phase === 'playing' && (
            <div className="round-pill">
              Vote {state.endRoundVotes}/{state.endRoundVoteTarget}
            </div>
          )}
          {state.phase === 'finished' && (
            <div className="round-pill">
              Ready {state.readyNextRoundCount}/{state.readyNextRoundTarget}
            </div>
          )}
          {state.phase === 'exchange' && <div className="round-pill">Card exchange</div>}
          <div className="round-pill">Round {state.round || 'Lobby'}</div>
        </div>
        <div className="table-felt">
          <div className="felt-emblem" aria-hidden="true">
            EP
          </div>
          {state.phase === 'finished' && <HostRoundResults players={state.players} readyCount={state.readyNextRoundCount} readyTarget={state.readyNextRoundTarget} />}
          {state.phase === 'exchange' && state.exchange && <HostExchangePanel exchange={state.exchange} />}
          <div className="turn-orbit">
            {state.players.map((player, index) => (
              <PlayerSeat
                key={player.id}
                player={player}
                index={index}
                total={Math.max(state.players.length, 1)}
                active={state.currentTurnId === player.id}
                activity={state.playerActivities.find((activity) => activity.playerId === player.id)}
                onKick={!player.isComputer ? () => kickPlayer(player.id) : undefined}
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
            <div className={`pile-zone ${state.pileNotice ? 'is-clearing' : ''}`}>
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
  const [joinPending, setJoinPending] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const seconds = useCountdown(state)
  const hand = useMemo(() => state.hand || [], [state.hand])
  const isTurn = state.currentTurnId === state.selfId
  const selfPlayer = state.players.find((player) => player.id === state.selfId)
  const activeJoined = joined || Boolean(joinPending && state.selfId && state.selfName)
  const displayError = activeJoined && joinPending ? '' : error
  const canChat = activeJoined && !state.selfSpectator && Boolean(selfPlayer && !selfPlayer.finishedAt)
  const canVoteEndRound = activeJoined && !state.paused && state.phase === 'playing' && !state.selfSpectator && Boolean(selfPlayer && !selfPlayer.finishedAt) && !state.selfVotedEndRound
  const canReadyNextRound = activeJoined && !state.paused && state.phase === 'finished' && !state.selfSpectator && !state.selfReadyNextRound
  const exchangeRole = state.exchange?.presidentId === state.selfId ? 'president' : state.exchange?.foolId === state.selfId ? 'fool' : null
  const phoneStatusTitle = state.selfSpectator
    ? 'Spectating'
    : isTurn
      ? 'Your turn'
      : state.currentPlayerName
        ? `${state.currentPlayerName} is up`
        : state.phase === 'exchange'
          ? 'Card exchange'
          : state.phase === 'finished'
            ? 'Round finished'
            : state.phase === 'lobby'
              ? 'Waiting for players'
              : 'Waiting for turn'
  const exchangeCard = useMemo(() => {
    if (!exchangeRole) return null
    return exchangeRole === 'president' ? weakestHandCard(hand) : strongestHandCard(hand)
  }, [exchangeRole, hand])
  const requiredPlayCount = state.pile.length || 0

  const legalCardIds = useMemo(() => {
    if (!state.pile.length) return new Set(hand.map((card) => card.id))
    return new Set(hand.filter((card) => card.strength >= state.pile[0].strength).map((card) => card.id))
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
    setJoinPending(false)
    socket.emit('join', { name, icon, color, roomCode: nextRoomCode }, (reply: { ok: boolean; pending?: boolean; error?: string; roomCode?: string }) => {
      if (reply.ok) {
        setJoined(true)
        setJoinPending(false)
        if (reply.roomCode) {
          setRoomCode(reply.roomCode)
          setRequestedRoomCode(reply.roomCode)
          window.history.replaceState(null, '', `/join?room=${reply.roomCode}`)
        }
        setError('')
      } else if (reply.pending) {
        setJoinPending(true)
        if (reply.roomCode) {
          setRoomCode(reply.roomCode)
          setRequestedRoomCode(reply.roomCode)
          window.history.replaceState(null, '', `/join?room=${reply.roomCode}`)
        }
        setError(reply.error || 'Waiting for host approval.')
      } else {
        setJoinPending(false)
        setError(reply.error || 'Could not join.')
      }
    })
  }

  useEffect(() => {
    const onLobbyReset = () => {
      setJoined(false)
      setJoinPending(false)
      setName('')
      setSelected([])
      setError('')
    }
    const onRejoinApproved = (payload: { roomCode?: string }) => {
      setJoined(true)
      setJoinPending(false)
      setSelected([])
      setError('')
      if (payload.roomCode) {
        setRoomCode(payload.roomCode)
        setRequestedRoomCode(payload.roomCode)
        window.history.replaceState(null, '', `/join?room=${payload.roomCode}`)
      }
    }
    const onRejoinDeclined = () => {
      setJoined(false)
      setJoinPending(false)
      setError('Host declined the rejoin request.')
    }

    socket.on('lobbyReset', onLobbyReset)
    socket.on('rejoinApproved', onRejoinApproved)
    socket.on('rejoinDeclined', onRejoinDeclined)
    return () => {
      socket.off('lobbyReset', onLobbyReset)
      socket.off('rejoinApproved', onRejoinApproved)
      socket.off('rejoinDeclined', onRejoinDeclined)
    }
  }, [])

  const toggleCard = (card: Card) => {
    if (!isTurn || !selectableCardIds.has(card.id)) return
    socket.emit('playerActivity', 'selecting')
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

  const voteEndRound = () => {
    socket.emit('voteEndRound', (reply: { ok: boolean; error?: string }) => {
      setError(reply.ok ? '' : reply.error || 'Could not vote.')
    })
  }

  const readyNextRound = () => {
    socket.emit('readyNextRound', (reply: { ok: boolean; error?: string }) => {
      setError(reply.ok ? '' : reply.error || 'Could not ready up.')
    })
  }

  const exchangeSelectedCard = (card: Card) => {
    socket.emit('playerActivity', 'exchanging')
    socket.emit('exchangeCard', card.id, (reply: { ok: boolean; error?: string }) => {
      setError(reply.ok ? '' : reply.error || 'Could not exchange that card.')
    })
  }

  useEffect(() => {
    if (isTurn && state.phase === 'playing' && !state.paused) socket.emit('playerActivity', 'thinking')
  }, [isTurn, state.phase, state.paused, state.currentTurnId])

  if (!activeJoined) {
    return (
      <main className="phone-shell join-phone">
        <div className="phone-card">
          <span className="brand-mark">EP</span>
          {joinPending ? (
            <section className="rejoin-waiting" aria-live="polite">
              <Hourglass size={38} />
              <h1>Waiting for host</h1>
              <p>{name || 'Your seat'} is asking to rejoin room {roomCode || requestedRoomCode}.</p>
              <button type="button" className="secondary" onClick={() => setJoinPending(false)}>
                Change details
              </button>
            </section>
          ) : (
            <>
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
            </>
          )}
          {displayError && <p className="error-text">{displayError}</p>}
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
      <SkipNotice notice={state.skipNotice} selfId={state.selfId} />
      <PileNotice notice={state.pileNotice} selfId={state.selfId} />
      <AlertNotice notice={state.alertNotice} selfId={state.selfId} />
      {state.paused && <PauseOverlay />}
      <header className="phone-header">
        <div>
          <span>{state.selfSpectator ? `Watching ${state.roomCode}` : state.selfName}</span>
          <h1>{phoneStatusTitle}</h1>
        </div>
        <div className="mini-timer">{seconds}s</div>
      </header>

      {state.phase === 'finished' && selfPlayer ? (
        <PlayerRoundResult
          player={selfPlayer}
          ready={Boolean(state.selfReadyNextRound)}
          readyCount={state.readyNextRoundCount}
          readyTarget={state.readyNextRoundTarget}
        />
      ) : state.phase === 'exchange' ? (
        <PlayerExchangePanel
          exchange={state.exchange}
          exchangeRole={exchangeRole}
          hand={hand}
          requiredCardId={exchangeCard?.id || null}
          onSelect={exchangeSelectedCard}
        />
      ) : (
        <>
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
                  disabled={state.paused || !isTurn || !selectableCardIds.has(card.id)}
                  onClick={() => toggleCard(card)}
                >
                  <SpanishCard card={card} compact index={index} />
                </button>
              ))
            )}
          </section>
        </>
      )}
      <PlayerMusicPanel music={state.music} />
      <ChatPanel messages={state.chat} canSend={canChat} onTyping={() => socket.emit('playerActivity', 'typing')} />

      <footer className={`phone-actions ${state.phase === 'finished' || state.phase === 'exchange' ? 'is-finished' : ''}`}>
        <div className="selection-meter">
          <Sparkles size={16} />
          <span>
            {state.phase === 'exchange'
              ? exchangeRole
                ? 'Choose exchange card'
                : 'Exchange in progress'
              : state.phase === 'finished'
              ? `${state.readyNextRoundCount}/${state.readyNextRoundTarget} ready`
              : selected.length
                ? `${selected.length} selected`
                : isTurn
                  ? 'Choose cards'
                  : 'Waiting'}
          </span>
        </div>
        {state.phase === 'finished' ? (
          <button type="button" onClick={readyNextRound} disabled={!canReadyNextRound}>
            <CheckCircle2 size={18} />
            {state.selfReadyNextRound ? 'Ready' : 'Ready up'}
          </button>
        ) : state.phase === 'exchange' ? (
          <button type="button" disabled>
            <Layers3 size={18} />
            Exchange
          </button>
        ) : (
          <>
            <button type="button" onClick={playSelected} disabled={state.paused || state.selfSpectator || !isTurn || !canPlaySelected}>
              <Play size={18} />
              Play cards
            </button>
            <button type="button" className="secondary" onClick={passTurn} disabled={state.paused || state.selfSpectator || !isTurn}>
              Pass
            </button>
            <button type="button" className="secondary vote-action" onClick={voteEndRound} disabled={!canVoteEndRound}>
              <Flag size={18} />
              {state.selfVotedEndRound ? 'Voted' : `${state.endRoundVotes}/${state.endRoundVoteTarget}`}
            </button>
          </>
        )}
        <button type="button" className="secondary" onClick={() => setRulesOpen(true)}>
          <BookOpen size={18} />
          Rules
        </button>
      </footer>
      {displayError && <p className="error-text floating">{displayError}</p>}
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  )
}

function SkipNotice({
  notice,
  selfId,
}: {
  notice: GameState['skipNotice']
  selfId?: string | null
}) {
  const [hiddenNoticeKey, setHiddenNoticeKey] = useState('')
  const noticeKey = notice ? `${notice.playerId}-${notice.skippedAt}` : ''

  useEffect(() => {
    if (!noticeKey) return
    const timeout = window.setTimeout(() => setHiddenNoticeKey(noticeKey), 3000)
    return () => window.clearTimeout(timeout)
  }, [noticeKey])

  if (!notice || hiddenNoticeKey === noticeKey) return null
  const isSelf = notice.playerId === selfId
  return (
    <div className={`game-notice skip-notice ${isSelf ? 'is-self' : ''}`} role="status" aria-live="polite">
      <Sparkles size={28} />
      <span>{isSelf ? 'You were skipped' : `${notice.playerName} was skipped`}</span>
    </div>
  )
}

function PileNotice({
  notice,
  selfId,
}: {
  notice: GameState['pileNotice']
  selfId?: string | null
}) {
  const [hiddenNoticeKey, setHiddenNoticeKey] = useState('')
  const noticeKey = notice ? `${notice.playerId || 'pile'}-${notice.announcedAt}` : ''

  useEffect(() => {
    if (!noticeKey) return
    const timeout = window.setTimeout(() => setHiddenNoticeKey(noticeKey), 3500)
    return () => window.clearTimeout(timeout)
  }, [noticeKey])

  if (!notice || hiddenNoticeKey === noticeKey) return null
  const isSelf = notice.playerId === selfId
  const message = isSelf ? 'Pile cleared. You start.' : notice.message
  return (
    <div className={`game-notice pile-notice ${isSelf ? 'is-self' : ''}`} role="status" aria-live="polite">
      <Layers3 size={30} />
      <span>{message}</span>
    </div>
  )
}

function AlertNotice({
  notice,
  selfId,
}: {
  notice: GameState['alertNotice']
  selfId?: string | null
}) {
  const [hiddenNoticeKey, setHiddenNoticeKey] = useState('')
  const noticeKey = notice ? `${notice.kind}-${notice.playerId || 'table'}-${notice.announcedAt}` : ''

  useEffect(() => {
    if (!noticeKey) return
    const timeout = window.setTimeout(() => setHiddenNoticeKey(noticeKey), 3000)
    return () => window.clearTimeout(timeout)
  }, [noticeKey])

  if (!notice || hiddenNoticeKey === noticeKey) return null
  const isSelf = notice.playerId === selfId
  const message = isSelf && notice.kind === 'one-card' ? 'You have 1 card left!' : notice.message
  return (
    <div className={`game-notice alert-notice alert-${notice.kind} ${isSelf ? 'is-self' : ''}`} role="status" aria-live="polite">
      {notice.kind === 'one-card' ? <Sparkles size={28} /> : <Flag size={28} />}
      <span>{message}</span>
    </div>
  )
}

function PauseOverlay({ onResume }: { onResume?: () => void }) {
  return (
    <div className={`game-notice pause-overlay ${onResume ? 'is-host' : ''}`} role="status" aria-live="polite">
      <Pause size={34} />
      <span>Paused</span>
      {onResume && (
        <button type="button" onClick={onResume}>
          <Play size={22} />
          Resume
        </button>
      )}
    </div>
  )
}

function YouTubeFrame({ music }: { music: GameState['music'] }) {
  const embedUrl = continuousYouTubeUrl(music.embedUrl)
  return (
    <iframe
      className="youtube-frame"
      src={embedUrl}
      title={`YouTube music: ${music.title}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}

function continuousYouTubeUrl(embedUrl: string) {
  try {
    const url = new URL(embedUrl)
    url.searchParams.set('autoplay', '1')
    if (url.pathname.includes('/embed/videoseries')) return url.toString()
    const videoId = url.pathname.split('/').filter(Boolean).at(-1)
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) && !url.searchParams.has('list')) {
      url.searchParams.set('list', `RD${videoId}`)
    }
    return url.toString()
  } catch {
    return embedUrl
  }
}

function sortCardsForExchange(cards: Card[]) {
  return [...cards].sort((a, b) => a.strength - b.strength || a.suit.localeCompare(b.suit))
}

function weakestHandCard(cards: Card[]) {
  return sortCardsForExchange(cards)[0] || null
}

function strongestHandCard(cards: Card[]) {
  return sortCardsForExchange(cards).reverse()[0] || null
}

function PendingRejoinPanel({
  requests,
  onApprove,
  onDecline,
}: {
  requests: GameState['pendingRejoins']
  onApprove: (requestId: string) => void
  onDecline: (requestId: string) => void
}) {
  return (
    <section className="rejoin-panel" aria-live="polite">
      <div className="rejoin-heading">
        <UserRound size={18} />
        <span>Rejoin requests</span>
      </div>
      {requests.map((request) => (
        <div className="rejoin-request" key={request.id}>
          <strong>{request.playerName}</strong>
          <small>Wants back into this room</small>
          <div className="rejoin-actions">
            <button type="button" onClick={() => onApprove(request.id)} aria-label={`Approve ${request.playerName}`}>
              <CheckCircle2 size={16} />
            </button>
            <button type="button" className="secondary danger" onClick={() => onDecline(request.id)} aria-label={`Decline ${request.playerName}`}>
              <UserX size={16} />
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

function HostMusicPanel({ music }: { music: GameState['music'] }) {
  const [title, setTitle] = useState(music.title)
  const [source, setSource] = useState(music.source)
  const [error, setError] = useState('')

  const updateMusic = (event: React.FormEvent) => {
    event.preventDefault()
    socket.emit('updateMusic', { title, source }, (reply: { ok: boolean; error?: string }) => {
      setError(reply.ok ? '' : reply.error || 'Could not update music.')
    })
  }

  return (
    <section className="music-panel host-music">
      <h2>
        <Music size={18} />
        YouTube Music
      </h2>
      <YouTubeFrame music={music} />
      <form className="music-form" onSubmit={updateMusic}>
        <label htmlFor="musicTitle">Track name</label>
        <input id="musicTitle" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} />
        <label htmlFor="musicSource">YouTube link</label>
        <input
          id="musicSource"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Video, playlist, or YouTube ID"
        />
        <button type="submit">
          <Music size={16} />
          Change Music
        </button>
      </form>
      {error && <p className="music-error">{error}</p>}
    </section>
  )
}

function PlayerMusicPanel({ music }: { music: GameState['music'] }) {
  const [listeningTo, setListeningTo] = useState(0)
  const listening = listeningTo === music.updatedAt

  return (
    <section className="music-panel player-music">
      <div className="music-heading">
        <h2>
          <Music size={18} />
          Room Music
        </h2>
        <span>{music.title}</span>
      </div>
      {listening ? (
        <YouTubeFrame music={music} />
      ) : (
        <button type="button" onClick={() => setListeningTo(music.updatedAt)}>
          <Music size={16} />
          Listen
        </button>
      )}
    </section>
  )
}

function ChatPanel({ messages, canSend, onTyping }: { messages: ChatMessage[]; canSend: boolean; onTyping?: () => void }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    feed.scrollTop = feed.scrollHeight
  }, [messages])

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
      <div className="chat-feed" ref={feedRef} aria-live="polite">
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
            onChange={(event) => {
              setMessage(event.target.value)
              if (event.target.value.trim()) onTyping?.()
            }}
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

function HostRoundResults({
  players,
  readyCount,
  readyTarget,
}: {
  players: Player[]
  readyCount: number
  readyTarget: number
}) {
  const president = players.find((player) => player.role === 'president')
  const fool = players.find((player) => player.role === 'fool')
  const neutrals = players.filter((player) => player.role === 'neutral')

  return (
    <section className="host-round-results" aria-live="polite">
      <div className="results-heading">
        <Trophy size={30} />
        <span>Round Results</span>
      </div>
      <div className="result-spotlight">
        <ResultRoleCard title="President" player={president} role="president" />
        <ResultRoleCard title="Neutral" playerNames={neutrals.map((player) => player.name)} role="neutral" />
        <ResultRoleCard title="Fool" player={fool} role="fool" />
      </div>
      <div className="ready-meter">
        <CheckCircle2 size={18} />
        <span>
          {readyCount}/{readyTarget} ready for next round
        </span>
      </div>
    </section>
  )
}

function HostExchangePanel({ exchange }: { exchange: NonNullable<GameState['exchange']> }) {
  return (
    <section className="host-exchange-panel" aria-live="polite">
      <div className="results-heading">
        <Layers3 size={30} />
        <span>Card Exchange</span>
      </div>
      <div className="exchange-matchup">
        <div>
          <Crown size={28} />
          <span>President</span>
          <strong>{exchange.presidentName}</strong>
          <small>{exchange.presidentReady ? 'Card selected' : 'Give weakest card'}</small>
        </div>
        <div>
          <Sparkles size={28} />
          <span>Fool</span>
          <strong>{exchange.foolName}</strong>
          <small>{exchange.foolReady ? 'Card selected' : 'Give strongest card'}</small>
        </div>
      </div>
    </section>
  )
}

function ResultRoleCard({
  title,
  player,
  playerNames,
  role,
}: {
  title: string
  player?: Player
  playerNames?: string[]
  role: PlayerRole
}) {
  const names = player ? [player.name] : playerNames || []
  return (
    <div className={`result-role-card role-${role}`}>
      <RoleIcon role={role} size={32} />
      <span>{title}</span>
      <strong>{names.length ? names.join(', ') : 'None'}</strong>
    </div>
  )
}

function PlayerRoundResult({
  player,
  ready,
  readyCount,
  readyTarget,
}: {
  player: Player
  ready: boolean
  readyCount: number
  readyTarget: number
}) {
  return (
    <section className={`player-round-result role-${player.role}`} aria-live="polite">
      <RoleIcon role={player.role} size={42} />
      <span>Round result</span>
      <h2>{roleLabel(player.role)}</h2>
      <p>{resultMessage(player.role)}</p>
      <div className="ready-meter">
        <CheckCircle2 size={18} />
        <strong>{ready ? 'You are ready' : `${readyCount}/${readyTarget} players ready`}</strong>
      </div>
    </section>
  )
}

function PlayerExchangePanel({
  exchange,
  exchangeRole,
  hand,
  requiredCardId,
  onSelect,
}: {
  exchange: GameState['exchange']
  exchangeRole: PlayerRole | null
  hand: Card[]
  requiredCardId: string | null
  onSelect: (card: Card) => void
}) {
  if (!exchange || !exchangeRole) {
    return (
      <section className="player-exchange-panel">
        <Layers3 size={34} />
        <h2>Card exchange</h2>
        <p>President and Fool are choosing cards before the Fool starts.</p>
      </section>
    )
  }

  const isPresident = exchangeRole === 'president'
  const alreadyReady = isPresident ? exchange.presidentReady : exchange.foolReady
  return (
    <section className="player-exchange-panel">
      <RoleIcon role={exchangeRole} size={38} />
      <span>{isPresident ? 'President exchange' : 'Fool exchange'}</span>
      <h2>{isPresident ? 'Give weakest card' : 'Give strongest card'}</h2>
      <p>{alreadyReady ? 'Card selected. Waiting for the other player.' : 'Tap the highlighted card to exchange it.'}</p>
      <div className="exchange-hand-grid">
        {hand.map((card, index) => (
          <button
            key={card.id}
            type="button"
            className={`hand-card ${card.id === requiredCardId ? 'selected' : ''}`}
            disabled={alreadyReady || card.id !== requiredCardId}
            onClick={() => onSelect(card)}
          >
            <SpanishCard card={card} compact index={index} />
          </button>
        ))}
      </div>
    </section>
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
  activity,
  onKick,
}: {
  player: Player
  index: number
  total: number
  active: boolean
  activity?: GameState['playerActivities'][number]
  onKick?: () => void
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
      {activity && <div className={`activity-bubble activity-${activity.type}`}>{activity.text}</div>}
      {onKick && (
        <button type="button" className="seat-kick" onClick={onKick} aria-label={`Kick ${player.name}`}>
          <UserX size={14} />
        </button>
      )}
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
      <RoleIcon role={role} size={13} />
      {roleLabel(role)}
    </span>
  )
}

function RoleIcon({ role = 'neutral', size = 16 }: { role?: PlayerRole; size?: number }) {
  if (role === 'president') return <Crown size={size} />
  if (role === 'fool') return <Sparkles size={size} />
  return <Circle size={size} />
}

function roleLabel(role: PlayerRole = 'neutral') {
  if (role === 'president') return 'President'
  if (role === 'fool') return 'Fool'
  return 'Neutral'
}

function resultMessage(role: PlayerRole = 'neutral') {
  if (role === 'president') return 'You finished first. Lead the room with style.'
  if (role === 'fool') return 'You finished last this round. Shake it off and get ready.'
  return 'You landed in the middle. Solid table survival.'
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
          <li>A brand new game starts with the player holding the 3 of Coins.</li>
          <li>Cards rank from 3 up to 12, then 1, then 2. The 2 of Coins is the absolute highest card.</li>
          <li>After a lead, play one or more cards of the same rank that match or beat the current pile rank.</li>
          <li>Playing the same rank as the current pile skips the next active player.</li>
          <li>If the pile has two or more cards, every play must match that number of cards until the pile closes.</li>
          <li>Playing the 2 of Coins closes the pile immediately, and that player leads the next pile.</li>
          <li>You cannot pass on an empty pile. Once a card is on the pile, you may pass if you have no useful play or want to hold your cards.</li>
          <li>When every other active player passes, the pile clears and the last player who played leads again.</li>
          <li>The first player to run out of cards wins the round and becomes President.</li>
          <li>The last player remaining becomes Fool. Everyone else is Neutral.</li>
          <li>Before the next round, the President gives their weakest card to the Fool, and the Fool gives their strongest card to the President.</li>
          <li>After that exchange, the Fool starts the next round.</li>
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
        transform: stacked ? `translateX(${stacked * 34}px) rotate(${(stacked - 1) * 4}deg)` : undefined,
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
