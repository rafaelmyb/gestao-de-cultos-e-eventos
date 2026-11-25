import { EventState } from '../types';
import { ItemStatus } from '../types';
import { createEventStore } from './eventSync.js';

const makeDefaultState = (): EventState => ({
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
});


const store = createEventStore({ storage: localStorage, fetcher: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), defaults: makeDefaultState });
export const getServerNow = () => store.now();
export const getSyncStatus = (id: string) => store.status(id);
export const onSyncStatus = (callback: (id: string, status: string, error: string) => void) => store.onStatus(callback);
export const generateEventId = () => crypto.randomUUID().slice(0, 8).toUpperCase();
export const testConnection = async () => {
  try { await store.health(); return { success: true, message: 'Sincronização entre dispositivos disponível.' }; }
  catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Sem conexão com o servidor.' }; }
};
export const getEventRef = (id: string) => ({
  get: (): Promise<EventState | null> => store.get(id),
  createIfNotExists: (name?: string): Promise<EventState> => store.create(id, name),
  set: (updates: Partial<EventState>) => store.write(id, 'update', updates),
  overwrite: (state: EventState) => store.write(id, 'overwrite', { ...makeDefaultState(), ...state }),
});
export const subscribeToEvent = (id: string, onUpdate: (state: EventState) => void, onError?: (error: unknown) => void) => {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    if (stopped || running) return;
    clearTimeout(timer); running = true;
    try {
      const state = await store.get(id);
      if (!stopped && state) onUpdate(state);
      if (!stopped && store.status(id).status === 'offline') onError?.(store.status(id).error);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 1000);
    }
  };
  const resume = () => { if (!document.hidden) void poll(); };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  void poll();
  return () => {
    stopped = true; clearTimeout(timer);
    window.removeEventListener('online', resume);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
  };
};
