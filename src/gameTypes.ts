export type SuitSymbol = 'coin' | 'cup' | 'sword' | 'club'
export type SuitColor = 'gold' | 'red' | 'steel' | 'green'
export type PlayerIcon =
  | 'crown'
  | 'sparkles'
  | 'flame'
  | 'heart'
  | 'shield'
  | 'club'
  | 'star'
  | 'sun'
  | 'bolt'
  | 'diamond'
  | 'moon'
  | 'gem'
  | 'bot'
export type PlayerColor = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'teal' | 'rose' | 'slate'
export type PlayerRole = 'president' | 'fool' | 'neutral'

export type Card = {
  id: string
  rank: number
  rankLabel: string
  strength: number
  suit: string
  suitName: string
  suitSymbol: SuitSymbol
  suitColor: SuitColor
}

export type Player = {
  id: string
  name: string
  icon: PlayerIcon
  color: PlayerColor
  role: PlayerRole
  handCount: number
  connected: boolean
  finishedAt: number | null
  wins: number
  isComputer?: boolean
  isSpectator?: boolean
}

export type ChatMessage = {
  id: string
  playerId: string
  name: string
  text: string
  sentAt: string
}

export type RecentWinner = {
  name: string
  round: number
  wonAt: string
  isComputer?: boolean
}

export type ScoreSummary = {
  lastPresident: RecentWinner | null
  topWinner: {
    name: string
    wins: number
  } | null
}

export type GameState = {
  roomCode: string
  phase: 'lobby' | 'playing' | 'finished'
  players: Player[]
  pile: Card[]
  activeHand: Card[]
  currentTurnId: string | null
  currentPlayerName: string | null
  turnStartedAt: number | null
  turnSeconds: number
  passCount: number
  finishOrder: string[]
  round: number
  recentWinners: RecentWinner[]
  scoreSummary: ScoreSummary
  chat: ChatMessage[]
  log: string[]
  joinUrl: string
  selfId?: string | null
  selfName?: string
  selfSpectator?: boolean
  hand?: Card[]
}
