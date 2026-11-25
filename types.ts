
export enum ItemType {
  KEYNOTE = 'KEYNOTE',
  VIDEO = 'VIDEO',
  MUSIC = 'MUSIC',
  PANEL = 'PANEL',
  BREAK = 'BREAK'
}

export enum ItemStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED'
}

export type TimerDirection = 'DESC' | 'ASC'; // Decrescente ou Crescente

// Novos Núcleos Definidos
export enum TeamRole {
  PROJECAO = 'PROJEÇÃO',
  ILUMINACAO = 'ILUMINAÇÃO',
  TRANSMISSAO = 'TRANSMISSÃO',
  SOM = 'MESA DE SOM',
  DANCA = 'DANÇA',
  LOUVOR = 'LOUVOR',
  MC = 'MESTRE DE CERIMÔNIAS',
  PRELETOR = 'PRELETOR',
  OUTROS = 'OUTROS'
}

export const EquipmentList = [
  'Computador da Projeção',
  'Mesa de Iluminação',
  'Computador da Transmissão',
  'Mesa de Som',
  'Louvor: TalkBack',
  'Microfone Preletor',
  'Microfone Mestre de Cerimônia'
];

export interface RundownItem {
  id: string;
  title: string;
  speaker?: string;
  isPreaching?: boolean; // Flag para identificar se é o preletor oficial
  isMC?: boolean; // NOVO: Flag para identificar se é entrada do Mestre de Cerimônia
  durationSeconds: number; // Stored in seconds
  type: ItemType;
  notes?: string; // Nota geral
  teamNotes?: Record<string, string>; // Notas específicas por núcleo
  
  // Execution Log for Report
  executedStart?: number; // Timestamp de quando começou real
  executedEnd?: number;   // Timestamp de quando terminou real
}

export interface AlertMessage {
  id: string;
  text: string;
  targetRoles: string[]; // 'ALL' ou nomes dos roles específicos
  timestamp: number;
}

// CONFERENCE MODE TYPES
export interface ConferenceSession {
  id: string;
  name: string; // ex: "Sessão 1 - Manhã"
  date?: string; // ex: "06/12/2025"
}

// The "Server" State
export interface EventState {
  id?: string; // ID do evento para backup/restore
  eventName?: string; // Nome do Evento (Opcional)
  conferenceLogo?: string; // Base64 or URL of the logo
  
  // CONFERENCE MODE STATE
  isConferenceMode: boolean;
  sessions: ConferenceSession[];
  activeSessionId: string | null;
  // Armazena os itens das sessões que não estão ativas no momento
  // Key: SessionID, Value: RundownItem[]
  storedSessionItems: Record<string, RundownItem[]>; 

  items: RundownItem[]; // ITENS DA SESSÃO ATIVA
  activeItemId: string | null;
  status: ItemStatus;
  timerDirection: TimerDirection;
  autoAdvance: boolean; // NOVO: Flag para avanço automático
  
  // Custom Dynamic Fields
  customRoles: string[];
  customEquipment: string[];

  // Messages / Alerts
  messages: AlertMessage[];

  // Personnel & Equipment
  roster: {
    gestorCulto: string;
    gerenteCulto: string; // Mobile user
    nucleos: Record<string, string>; // Alterado para aceitar chaves dinâmicas
  };
  equipmentStatus: Record<string, boolean>; // Equipment Name -> Ready (true/false)

  // Synchronization timestamps (milliseconds)
  targetEndTime: number | null; 
  pausedAtTime: number | null; // If paused, how much time was remaining
  serverOffset: number; // To simulate clock drift logic
  scheduledStartTime: number | null; // Horário PREVISTO de início
  actualStartTime: number | null; // Horário real de início do culto
  actualEndTime?: number; // Horário real de término do culto
}

export interface EventContextType extends EventState {
  setEventName: (name: string) => void;
  setConferenceLogo: (logo: string) => void;
  setScheduledStartTime: (time: number | null) => void;
  resetActualStartTime: () => void; // NOVO: Resetar horário real
  playItem: (id: string) => void;
  stopItem: () => void;
  pauseItem: () => void;
  resumeItem: () => void;
  nextItem: () => void;
  updateItems: (items: RundownItem[]) => void;
  addItem: (item: RundownItem) => void;
  editItem: (id: string, updates: Partial<RundownItem>) => void;
  deleteItem: (id: string) => void;
  acknowledgeItem: (id: string) => void;
  toggleTimerDirection: () => void;
  toggleAutoAdvance: () => void; // NOVO
  updateRoster: (roleKey: string, name: string, isNucleo?: boolean) => void;
  toggleEquipment: (equipmentName: string) => void;
  
  // New Methods for Custom Fields
  addCustomRole: (name: string) => void;
  removeCustomRole: (name: string) => void;
  addCustomEquipment: (name: string) => void;
  removeCustomEquipment: (name: string) => void;

  // Messaging
  sendMessage: (text: string, targets: string[]) => void;
  deleteMessage: (id: string) => void;
  
  // Backup Access - Agora retorna Promise
  getFullState: () => Promise<EventState>;
  restoreState: (state: EventState) => void;
  moveItem: (id: string, direction: 'up' | 'down') => void;
  generateReport: () => void;
  generatePlanningReport: () => void; // NOVO: Relatório de Planejamento
  markServiceEnd: () => void;

  // Conference Mode
  toggleConferenceMode: (enabled: boolean) => void;
  createSession: (name: string, date?: string) => void;
  switchSession: (sessionId: string) => void;
  updateSession: (id: string, name: string, date?: string) => void;
  deleteSession: (id: string) => void;
  importMultiSessionData: (sessionsData: {name: string, date?: string, items: RundownItem[]}[]) => void;
}
