
import { createClient } from '@supabase/supabase-js';
import { EventState, ItemStatus } from "../types";

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://database.invalid';
const SUPABASE_KEY = 'server-proxy';

// Cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const response = await fetch(`/api/events${url.search}`, {
        method: init?.method || 'GET', body: init?.body,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': new Headers(init?.headers).get('Accept') || 'application/json',
          'Prefer': new Headers(init?.headers).get('Prefer') || '',
        },
      });
      if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
      return response;
    },
  },
  auth: {
    persistSession: false, 
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const generateEventId = () => {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
};

// Função de Diagnóstico
export const testConnection = async () => {
    try {
        const start = Date.now();
        // Teste de Leitura
        const { data, error: readError } = await supabase.from('events').select('id').limit(1);
        const latency = Date.now() - start;
        
        if (readError) {
            console.warn("Supabase Read Failed (Fallback Active):", readError);
            return { success: false, message: `Erro: ${readError.message}` };
        }

        return { success: true, message: `Banco de Dados Operacional! Latência: ${latency}ms.` };
    } catch (e: any) {
        console.warn("Supabase Connection Error (Fallback Active):", e);
        return { success: false, message: e.message || "Erro desconhecido de rede" };
    }
};

const DEFAULT_STATE: EventState = {
  eventName: 'Culto Principal',
  conferenceLogo: undefined,
  isConferenceMode: false,
  sessions: [],
  activeSessionId: null,
  storedSessionItems: {},
  items: [],
  activeItemId: null,
  status: ItemStatus.IDLE,
  timerDirection: 'DESC',
  autoAdvance: false, 
  targetEndTime: null,
  pausedAtTime: null,
  serverOffset: 0,
  scheduledStartTime: null,
  actualStartTime: null,
  customRoles: [],
  customEquipment: [],
  messages: [],
  roster: { gestorCulto: '', gerenteCulto: '', nucleos: {} },
  equipmentStatus: {}
};

// --- HYBRID STRATEGY: LOCAL + CLOUD ---
export const getEventRef = (eventId: string) => {
  const localKey = `chronos_event_${eventId}`;

  return {
    get: async (): Promise<EventState | null> => {
      // 1. Tenta buscar da Nuvem (Prioridade)
      try {
        const { data, error } = await supabase
          .from('events')
          .select('payload')
          .eq('id', eventId)
          .single();

        if (data && data.payload) {
          localStorage.setItem(localKey, JSON.stringify(data.payload)); // Atualiza cache
          return data.payload;
        }
      } catch (err) {
        console.warn("Usando cache local (Offline/Erro):", err);
      }

      // 2. Fallback Local
      const localData = localStorage.getItem(localKey);
      if (localData) {
        try { return JSON.parse(localData); } catch {}
      }
      return null;
    },

    set: async (updates: Partial<EventState>) => {
      // 1. Ler estado atual
      let currentState = DEFAULT_STATE;
      const localData = localStorage.getItem(localKey);
      if (localData) {
          try { currentState = JSON.parse(localData); } catch {}
      }
      
      const newState = { ...currentState, ...updates };
      
      // 2. Salvar Local (Instantâneo UI)
      localStorage.setItem(localKey, JSON.stringify(newState));

      // 3. Enviar para Nuvem (Sync)
      const relationalUpdates: any = {
          last_updated: Date.now(),
          payload: newState 
      };
      
      if (newState.eventName) relationalUpdates.event_name = newState.eventName;
      if (newState.status) relationalUpdates.status = newState.status;
      if (newState.timerDirection) relationalUpdates.timer_direction = newState.timerDirection;
      if (newState.autoAdvance !== undefined) relationalUpdates.auto_advance = newState.autoAdvance;

      try {
          const { error } = await supabase
            .from('events')
            .update(relationalUpdates)
            .eq('id', eventId);

          if (error) {
              // Ignora erro 42501 (RLS) para não travar uso local se DB estiver bloqueado
              if (error.code === '42501') {
                  console.warn("Aviso: RLS bloqueando gravação na nuvem. Usando modo local.");
              } else {
                  console.warn("Erro no Sync Supabase (Using Local Cache):", error.message);
              }
          }
      } catch (err) {
          console.warn("Erro de Rede durante Sync (Local Mode Safe):", err);
      }
    },

    // MÉTODO NOVO: Substituição Total (Para Backup)
    overwrite: async (fullState: EventState) => {
        // Garante que campos novos existam (merge com default) para evitar quebras com backups antigos
        const newState = { ...DEFAULT_STATE, ...fullState };

        // 1. Salvar Local (Substituição Total)
        localStorage.setItem(localKey, JSON.stringify(newState));

        // 2. Enviar para Nuvem (Upsert - Cria ou Substitui)
        const payload = {
            id: eventId,
            event_name: newState.eventName,
            status: newState.status,
            timer_direction: newState.timerDirection,
            auto_advance: newState.autoAdvance,
            last_updated: Date.now(),
            payload: newState
        };

        try {
            const { error } = await supabase
              .from('events')
              .upsert(payload);

            if (error) {
                if (error.code === '42501') {
                    console.warn("Aviso: RLS bloqueando gravação na nuvem. Usando modo local.");
                } else {
                    console.warn("Erro no Overwrite Supabase (Offline Backup Saved):", error.message);
                }
            } else {
                console.log("✅ Backup restaurado com sucesso na nuvem!");
            }
        } catch (err) {
            console.warn("Erro de Rede ao Restaurar (Backup Local Otimista):", err);
        }
    },

    createIfNotExists: async (initialName?: string): Promise<EventState> => {
      // Verifica existência
      try {
          const { data } = await supabase.from('events').select('payload').eq('id', eventId).single();
          if (data && data.payload) {
              localStorage.setItem(localKey, JSON.stringify(data.payload));
              return data.payload;
          }
      } catch (e) {}

      // Cria novo
      const initialState = { ...DEFAULT_STATE, id: eventId, eventName: initialName || 'Novo Evento' };
      localStorage.setItem(localKey, JSON.stringify(initialState));

      try {
          const { error } = await supabase.from('events').insert({
              id: eventId,
              event_name: initialState.eventName,
              status: 'IDLE',
              timer_direction: initialState.timerDirection,
              auto_advance: initialState.autoAdvance,
              payload: initialState,
              last_updated: Date.now()
          });
          
          if (error) {
              if (error.code === '42501') {
                  console.warn("Aviso: RLS impediu criação na nuvem. Continuando localmente.");
              } else {
                  console.warn("Status de sincronização (Usando modo Local de alta performance):", error.message);
              }
          } else {
              console.log("✅ Evento criado e sincronizado na nuvem!");
          }
      } catch (e) {
          console.warn("Status de Rede na Criação (Modo Local Otimista Ativado):", e);
      }

      return initialState;
    }
  };
};

export const subscribeToEvent = (eventId: string, onUpdate: (data: EventState) => void, onError?: (error: any) => void) => {
  const localKey = `chronos_event_${eventId}`;

  // 1. LocalStorage Listener
  const localHandler = (e: StorageEvent) => {
      if (e.key === localKey && e.newValue) {
          try {
              const data = JSON.parse(e.newValue);
              onUpdate(data);
          } catch (err) { }
      }
  };
  window.addEventListener('storage', localHandler);

  // Authenticated polling keeps database credentials on the server.
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  const poll = async () => {
    try {
      const data = await getEventRef(eventId).get();
      if (!stopped && data) onUpdate(data);
    } catch (error) {
      if (!stopped) onError?.(error);
    }
    if (!stopped) timeout = setTimeout(poll, 1500);
  };
  timeout = setTimeout(poll, 1500);
  return () => {
    stopped = true;
    clearTimeout(timeout);
    window.removeEventListener('storage', localHandler);
  };
};
