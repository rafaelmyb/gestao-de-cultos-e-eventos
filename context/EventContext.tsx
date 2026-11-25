
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { EventContextType, EventState, ItemStatus, RundownItem, ConferenceSession } from '../types';
import { getEventRef, subscribeToEvent } from '../services/database';

const EventContext = createContext<EventContextType | undefined>(undefined);

// Wrapper Component that reads the ID from URL and initializes provider
export const EventProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { eventId } = useParams<{ eventId: string }>();
  
  if (!eventId) {
    return <>{children}</>;
  }

  return <EventProvider eventId={eventId}>{children}</EventProvider>;
};

const EventProvider: React.FC<{ children: ReactNode; eventId: string }> = ({ children, eventId }) => {
  const [state, setState] = useState<EventState>({
    eventName: '',
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

  const [isLoading, setIsLoading] = useState(true);
  const autoAdvanceRef = useRef<number | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
        setIsLoading(true);
        try {
            // Tenta carregar. Se falhar na nuvem, o database.ts já tem fallback local
            const initialData = await getEventRef(eventId).createIfNotExists();
            if (initialData) {
                setState(prev => ({...prev, ...initialData}));
            }
        } catch (e) {
            console.warn("Status na inicialização (Carregado com cache local de segurança):", e);
        } finally {
            // Garante que a tela de loading saia, mesmo se der erro no Supabase
            setIsLoading(false);
        }
        
        unsubscribe = subscribeToEvent(
            eventId, 
            (newData) => {
                setState(prev => ({...prev, ...newData}));
            },
            (err) => {
                console.warn("Realtime Sync Warning:", err);
                // Não trava o app, apenas avisa
            }
        );
    };

    init();
    
    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [eventId]);

  const pushUpdate = useCallback((updates: Partial<EventState>) => {
    // Atualiza estado local otimista (React)
    setState(prev => {
        const nextState = { ...prev, ...updates };
        // Deep merges manuais para objetos aninhados
        if (updates.roster && prev.roster) {
            nextState.roster = {
                ...prev.roster,
                ...updates.roster,
                nucleos: { ...prev.roster.nucleos, ...updates.roster.nucleos }
            }
        }
        if (updates.equipmentStatus && prev.equipmentStatus) {
            nextState.equipmentStatus = { ...prev.equipmentStatus, ...updates.equipmentStatus };
        }
        if (updates.storedSessionItems && prev.storedSessionItems) {
            nextState.storedSessionItems = { ...prev.storedSessionItems, ...updates.storedSessionItems };
        }
        return nextState;
    });

    // Envia para Persistência (Local -> Nuvem)
    getEventRef(eventId).set(updates);
  }, [eventId]);


  // --- Actions ---

  const setEventName = (name: string) => {
    pushUpdate({ eventName: name });
  };

  const setConferenceLogo = (logo: string) => {
      pushUpdate({ conferenceLogo: logo });
  };

  const setScheduledStartTime = (time: number | null) => {
      pushUpdate({ scheduledStartTime: time });
  };

  const resetActualStartTime = () => {
      pushUpdate({ actualStartTime: null });
  };

  const playItem = (id: string) => {
    const itemIndex = state.items.findIndex(i => i.id === id);
    if (itemIndex === -1) return;
    const item = state.items[itemIndex];

    const now = Date.now();
    
    // Log Start Time Logic
    const newItems = [...state.items];
    if (!newItems[itemIndex].executedStart) {
        newItems[itemIndex] = { ...newItems[itemIndex], executedStart: now };
    }

    const updates: Partial<EventState> = {
      activeItemId: id,
      status: ItemStatus.RUNNING,
      targetEndTime: now + (item.durationSeconds * 1000),
      pausedAtTime: null,
      items: newItems
    };

    if (!state.actualStartTime) {
        updates.actualStartTime = now;
    }

    pushUpdate(updates);
  };

  const pauseItem = () => {
    if (state.status !== ItemStatus.RUNNING || !state.targetEndTime) return;
    const now = Date.now();
    const remaining = state.targetEndTime - now;
    pushUpdate({
      status: ItemStatus.PAUSED,
      pausedAtTime: remaining,
      targetEndTime: null
    });
  };

  const resumeItem = () => {
    if (state.status !== ItemStatus.PAUSED || state.pausedAtTime === null) return;
    const now = Date.now();
    pushUpdate({
      status: ItemStatus.RUNNING,
      targetEndTime: now + state.pausedAtTime,
      pausedAtTime: null
    });
  };

  const stopItem = () => {
    // Record End Time for active item
    let newItems = state.items;
    if (state.activeItemId) {
        newItems = state.items.map(i => i.id === state.activeItemId ? { ...i, executedEnd: Date.now() } : i);
    }

    pushUpdate({
      status: ItemStatus.IDLE,
      targetEndTime: null,
      pausedAtTime: null,
      items: newItems
    });
  };

  const nextItem = () => {
    const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
    const now = Date.now();
    
    // 1. Close current item log
    let newItems = [...state.items];
    if (currentIndex !== -1) {
        newItems[currentIndex] = { ...newItems[currentIndex], executedEnd: now };
    }

    if (currentIndex !== -1 && currentIndex < state.items.length - 1) {
      const nextId = state.items[currentIndex + 1].id;
      const nextItemObj = state.items[currentIndex + 1];

      // 2. Start next item log if running
      if (state.status === ItemStatus.RUNNING || state.status === ItemStatus.PAUSED) {
          newItems[currentIndex + 1] = { ...newItems[currentIndex + 1], executedStart: now };

          pushUpdate({
            activeItemId: nextId,
            status: ItemStatus.RUNNING,
            targetEndTime: now + (nextItemObj.durationSeconds * 1000),
            pausedAtTime: null,
            items: newItems
          });
      } else {
        // Just move cursor without starting timer (Preview Mode basically)
        pushUpdate({
            activeItemId: nextId,
            status: ItemStatus.IDLE,
            targetEndTime: null,
            pausedAtTime: null,
            items: newItems
        });
      }
    } else if (state.items.length > 0 && !state.activeItemId) {
      // First start from idle (should usually be playItem but handled here just in case)
      pushUpdate({ activeItemId: state.items[0].id });
    } else if (currentIndex === state.items.length - 1 && state.status === ItemStatus.RUNNING) {
        stopItem();
    }
  };

  const updateItems = (newItems: RundownItem[]) => {
    pushUpdate({ items: newItems });
  };

  const addItem = (item: RundownItem) => {
    pushUpdate({ items: [...state.items, item] });
  };

  const editItem = (id: string, updates: Partial<RundownItem>) => {
    const newItems = state.items.map(item => item.id === id ? { ...item, ...updates } : item);
    pushUpdate({ items: newItems });
  };

  const deleteItem = (id: string) => {
    const newItems = state.items.filter(i => i.id !== id);
    let extraUpdates: Partial<EventState> = {};
    if (state.activeItemId === id) {
      extraUpdates = {
        status: ItemStatus.IDLE,
        activeItemId: null,
        targetEndTime: null,
        pausedAtTime: null
      };
    }
    pushUpdate({ items: newItems, ...extraUpdates });
  };

  const moveItem = (id: string, direction: 'up' | 'down') => {
      const index = state.items.findIndex(i => i.id === id);
      if (index === -1) return;
      const newItems = [...state.items];
      if (direction === 'up' && index > 0) {
          [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
      } else if (direction === 'down' && index < newItems.length - 1) {
          [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
      } else {
          return;
      }
      pushUpdate({ items: newItems });
  };

  const acknowledgeItem = (id: string) => {
    console.log(`Item acknowledged: ${id}`);
  };

  const toggleTimerDirection = () => {
    pushUpdate({ timerDirection: state.timerDirection === 'DESC' ? 'ASC' : 'DESC' });
  };

  const toggleAutoAdvance = () => {
    pushUpdate({ autoAdvance: !state.autoAdvance });
  };

  const updateRoster = (roleKey: string, name: string, isNucleo: boolean = false) => {
    const currentRoster = state.roster || { gestorCulto: '', gerenteCulto: '', nucleos: {} };
    let updates;
    if (isNucleo) {
        updates = {
            roster: {
                ...currentRoster,
                nucleos: { ...currentRoster.nucleos, [roleKey]: name }
            }
        };
    } else {
        updates = {
            roster: { ...currentRoster, [roleKey]: name }
        };
    }
    pushUpdate(updates);
  };

  const toggleEquipment = (equipmentName: string) => {
    const currentStatus = state.equipmentStatus || {};
    const newStatus = !currentStatus[equipmentName];
    pushUpdate({
        equipmentStatus: { ...currentStatus, [equipmentName]: newStatus }
    });
  };

  const addCustomRole = (name: string) => {
    if (state.customRoles.includes(name)) return;
    pushUpdate({ customRoles: [...state.customRoles, name] });
  };

  const removeCustomRole = (name: string) => {
    pushUpdate({ customRoles: state.customRoles.filter(r => r !== name) });
  };

  const addCustomEquipment = (name: string) => {
     if (state.customEquipment.includes(name)) return;
     pushUpdate({ customEquipment: [...state.customEquipment, name] });
  };

  const removeCustomEquipment = (name: string) => {
      pushUpdate({ customEquipment: state.customEquipment.filter(e => e !== name) });
  };

  // Messaging
  const sendMessage = (text: string, targets: string[]) => {
    const newMessage = {
      id: crypto.randomUUID(),
      text,
      targetRoles: targets,
      timestamp: Date.now()
    };
    pushUpdate({ messages: [...(state.messages || []), newMessage] });
  };

  const deleteMessage = (id: string) => {
    pushUpdate({ messages: (state.messages || []).filter(m => m.id !== id) });
  };

  // --- CONFERENCE MODE LOGIC ---

  const toggleConferenceMode = (enabled: boolean) => {
     pushUpdate({ isConferenceMode: enabled });
  };

  const createSession = (name: string, date?: string) => {
     const newSession: ConferenceSession = {
         id: crypto.randomUUID(),
         name,
         date
     };
     
     const updates: Partial<EventState> = {
         sessions: [...state.sessions, newSession],
         storedSessionItems: { ...state.storedSessionItems, [newSession.id]: [] }
     };

     if (!state.activeSessionId) {
         updates.activeSessionId = newSession.id;
     }

     pushUpdate(updates);
  };

  const switchSession = (sessionId: string) => {
      if (sessionId === state.activeSessionId) return;

      const currentSessionId = state.activeSessionId;
      const currentItems = state.items;
      
      const newStoredItems = { ...state.storedSessionItems };
      if (currentSessionId) {
          newStoredItems[currentSessionId] = currentItems;
      }

      const nextItems = newStoredItems[sessionId] || [];

      pushUpdate({
          activeSessionId: sessionId,
          storedSessionItems: newStoredItems,
          items: nextItems,
          status: ItemStatus.IDLE,
          activeItemId: null,
          targetEndTime: null,
          pausedAtTime: null,
          actualStartTime: null,
          scheduledStartTime: null // Resetar previsto ao trocar sessão
      });
  };

  const updateSession = (id: string, name: string, date?: string) => {
      const newSessions = state.sessions.map(s => s.id === id ? { ...s, name, date } : s);
      pushUpdate({ sessions: newSessions });
  };

  const deleteSession = (id: string) => {
      const newSessions = state.sessions.filter(s => s.id !== id);
      const newStoredItems = { ...state.storedSessionItems };
      delete newStoredItems[id];
      
      let nextActiveId = state.activeSessionId;
      let nextItems = state.items;

      if (state.activeSessionId === id) {
          if (newSessions.length > 0) {
              nextActiveId = newSessions[0].id;
              nextItems = newStoredItems[nextActiveId] || [];
          } else {
              nextActiveId = null;
              nextItems = [];
          }
      }

      pushUpdate({
          sessions: newSessions,
          storedSessionItems: newStoredItems,
          activeSessionId: nextActiveId,
          items: nextItems,
          status: ItemStatus.IDLE,
          activeItemId: null
      });
  };

  const importMultiSessionData = (sessionsData: {name: string, date?: string, items: RundownItem[]}[]) => {
      const newSessions: ConferenceSession[] = [];
      const newStoredItems: Record<string, RundownItem[]> = { ...state.storedSessionItems };
      
      let firstSessionId: string | null = null;

      sessionsData.forEach((sData, idx) => {
          const sId = crypto.randomUUID();
          if (idx === 0) firstSessionId = sId;

          newSessions.push({
              id: sId,
              name: sData.name,
              date: sData.date
          });
          newStoredItems[sId] = sData.items;
      });

      const allSessions = [...state.sessions, ...newSessions];
      
      let updates: Partial<EventState> = {
          isConferenceMode: true,
          sessions: allSessions,
          storedSessionItems: newStoredItems
      };

      if (!state.activeSessionId && firstSessionId) {
          updates.activeSessionId = firstSessionId;
          updates.items = newStoredItems[firstSessionId];
      }

      pushUpdate(updates);
  };

  const getFullState = async () => {
    // Retorna o estado atual da memória, que é 100% atualizado, instantâneo e offline-safe
    return { ...state, id: eventId }; 
  };
  
  const restoreState = (newState: EventState) => {
     // Substituição direta do estado local para refletir na UI imediatamente
     setState(newState);
     // Substituição direta do banco (Overwrite)
     getEventRef(eventId).overwrite(newState);
  };

  const markServiceEnd = () => {
     const now = Date.now();
     pushUpdate({ actualEndTime: now });
  };

  const generateReport = () => {
    // ... code truncated for brevity, same as before
    const { eventName, roster, items, actualStartTime, actualEndTime, sessions, isConferenceMode, activeSessionId, conferenceLogo } = state;
    
    let sessionTitle = "";
    if (isConferenceMode && activeSessionId) {
        const sess = sessions.find(s => s.id === activeSessionId);
        if (sess) sessionTitle = `${sess.name} ${sess.date ? `(${sess.date})` : ''}`;
    }

    const totalItems = items.length;
    const executedItems = items.filter(i => i.executedStart).length;
    
    let serviceDurationStr = "--";
    if (actualStartTime && actualEndTime) {
        const diff = Math.floor((actualEndTime - actualStartTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        serviceDurationStr = `${h}h ${m}m`;
    }
    
    const fmtTime = (ts?: number) => ts ? new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';
    const fmtDur = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}m${s > 0 ? ` ${s}s` : ''}`;
    };

    let runningSchedule = actualStartTime || Date.now();
    
    const reportHTML = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório - ${eventName}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
        <style>
           body { font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; font-size: 12px; }
           .mono { font-family: 'Roboto Mono', monospace; }
           @page { margin: 10mm; size: A4; }
        </style>
      </head>
      <body class="bg-white text-black p-4">
        
        <!-- HEADER -->
        <div class="border-b-4 border-black pb-4 mb-6 flex justify-between items-end">
            <div>
                ${conferenceLogo ? 
                    `<img src="/logo.png" alt="Logo" class="h-16 object-contain mb-2" />` : 
                    `<h1 class="text-3xl font-black uppercase tracking-tight text-[#DC2626]">Igreja Santa Geração</h1>`
                }
                <h2 class="text-xl font-bold uppercase text-gray-800 tracking-widest mt-1">Relatório Oficial de Culto</h2>
            </div>
            <div class="text-right">
                <div class="text-xs font-bold text-gray-500 uppercase">Evento</div>
                <div class="text-lg font-bold uppercase">${eventName || "Sem Nome"}</div>
                ${sessionTitle ? `<div class="text-sm font-medium text-gray-600">${sessionTitle}</div>` : ''}
            </div>
        </div>

        <!-- STATS GRID -->
        <div class="grid grid-cols-5 gap-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gestor</div>
                <div class="font-bold text-sm">${roster?.gestorCulto || "N/A"}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Início Real</div>
                <div class="font-bold text-sm mono text-green-700">${fmtTime(actualStartTime || undefined)}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Término Real</div>
                <div class="font-bold text-sm mono text-red-700">${fmtTime(actualEndTime || undefined)}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Duração Total</div>
                <div class="font-bold text-sm mono">${serviceDurationStr}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Itens</div>
                <div class="font-bold text-sm">${executedItems} / ${totalItems}</div>
            </div>
        </div>

        <!-- TABLE -->
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="border-b-2 border-black text-[10px] uppercase tracking-wider text-gray-600">
                    <th class="pb-2 w-16">Previsto</th>
                    <th class="pb-2 w-16">Real</th>
                    <th class="pb-2">Atividade / Palestrante</th>
                    <th class="pb-2 w-20 text-right">Dur. Plan</th>
                    <th class="pb-2 w-20 text-right">Dur. Real</th>
                    <th class="pb-2 w-24 text-right">Desvio</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, idx) => {
                    const scheduledTime = runningSchedule;
                    runningSchedule += item.durationSeconds * 1000;
                    
                    let realDurationStr = "-";
                    let delayBadge = "";
                    let startReal = "-";

                    if (item.executedStart) {
                        startReal = fmtTime(item.executedStart);
                        if (item.executedEnd) {
                            const diffSec = Math.floor((item.executedEnd - item.executedStart) / 1000);
                            realDurationStr = fmtDur(diffSec);
                            
                            const delta = diffSec - item.durationSeconds;
                            if (delta > 60) {
                                delayBadge = `<span class="bg-red-100 text-red-700 px-1 rounded text-[10px] font-bold">+${Math.floor(delta/60)}m</span>`;
                            } else if (delta < -60) {
                                delayBadge = `<span class="bg-blue-100 text-blue-700 px-1 rounded text-[10px] font-bold">-${Math.floor(Math.abs(delta)/60)}m</span>`;
                            } else {
                                delayBadge = `<span class="text-green-600 font-bold text-[10px]">OK</span>`;
                            }
                        } else {
                            realDurationStr = "Em andamento";
                        }
                    }

                    return `
                    <tr class="border-b border-gray-100 hover:bg-gray-50 text-xs">
                        <td class="py-2 mono text-gray-500">${actualStartTime ? fmtTime(scheduledTime) : '--:--'}</td>
                        <td class="py-2 mono font-bold">${startReal}</td>
                        <td class="py-2">
                            <div class="font-bold uppercase">${item.title}</div>
                            ${item.speaker ? `<div class="text-gray-500 text-[10px]">${item.speaker}</div>` : ''}
                        </td>
                        <td class="py-2 text-right mono text-gray-500">${fmtDur(item.durationSeconds)}</td>
                        <td class="py-2 text-right mono font-bold">${realDurationStr}</td>
                        <td class="py-2 text-right">${delayBadge}</td>
                    </tr>
                    ${item.notes ? `
                    <tr>
                        <td colspan="6" class="pb-2 pt-0 pl-32 text-[10px] text-gray-400 italic">
                           Obs: ${item.notes}
                        </td>
                    </tr>
                    ` : ''}
                    `;
                }).join('')}
            </tbody>
        </table>

        <!-- FOOTER -->
        <div class="mt-8 border-t border-gray-200 pt-4 flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest">
            <div>Gerado em ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}</div>
            <div>Copyright © Igreja Santa Geração - Geração Holy</div>
        </div>

        <script>
            // Auto Print logic
            window.onload = () => {
                setTimeout(() => {
                    window.print();
                }, 800);
            }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(reportHTML);
        printWindow.document.close();
    }
  };

  const generatePlanningReport = () => {
    // ... code truncated for brevity, same as before
    const { eventName, roster, items, scheduledStartTime, sessions, isConferenceMode, activeSessionId, conferenceLogo } = state;
    
    let sessionTitle = "";
    if (isConferenceMode && activeSessionId) {
        const sess = sessions.find(s => s.id === activeSessionId);
        if (sess) sessionTitle = `${sess.name} ${sess.date ? `(${sess.date})` : ''}`;
    }

    // Calcula tempo previsto corrido
    let runningSchedule = scheduledStartTime || Date.now();
    const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const fmtDur = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}m${s > 0 ? ` ${s}s` : ''}`;
    };

    const reportHTML = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Planejamento - ${eventName}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
        <style>
           body { font-family: 'Inter', sans-serif; -webkit-print-color-adjust: exact; font-size: 11px; }
           .mono { font-family: 'Roboto Mono', monospace; }
           @page { margin: 10mm; size: A4 landscape; }
        </style>
      </head>
      <body class="bg-white text-black p-4">
        
        <!-- HEADER -->
        <div class="border-b-4 border-black pb-4 mb-6 flex justify-between items-end">
            <div>
                ${conferenceLogo ? 
                    `<img src="/logo.png" alt="Logo" class="h-16 object-contain mb-2" />` : 
                    `<h1 class="text-3xl font-black uppercase tracking-tight text-[#DC2626]">Igreja Santa Geração</h1>`
                }
                <h2 class="text-xl font-bold uppercase text-gray-800 tracking-widest mt-1">Planejamento e Roteiro Técnico</h2>
            </div>
            <div class="text-right">
                <div class="text-xs font-bold text-gray-500 uppercase">Evento</div>
                <div class="text-lg font-bold uppercase">${eventName || "Sem Nome"}</div>
                ${sessionTitle ? `<div class="text-sm font-medium text-gray-600">${sessionTitle}</div>` : ''}
            </div>
        </div>

        <!-- INFO GRID -->
        <div class="grid grid-cols-4 gap-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Gestor</div>
                <div class="font-bold text-sm">${roster?.gestorCulto || "N/A"}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Início Previsto</div>
                <div class="font-bold text-sm mono text-blue-700">${scheduledStartTime ? fmtTime(scheduledStartTime) : 'A Definir'}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Itens</div>
                <div class="font-bold text-sm mono">${items.length}</div>
            </div>
            <div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Data Impressão</div>
                <div class="font-bold text-sm mono">${new Date().toLocaleDateString()}</div>
            </div>
        </div>

        <!-- TABLE -->
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="border-b-2 border-black text-[10px] uppercase tracking-wider text-gray-600 bg-gray-100">
                    <th class="p-2 w-16">Horário</th>
                    <th class="p-2 w-16 text-right">Dur.</th>
                    <th class="p-2 w-1/4">Atividade</th>
                    <th class="p-2">Instruções Técnicas (Núcleos)</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, idx) => {
                    const scheduledTime = runningSchedule;
                    runningSchedule += item.durationSeconds * 1000;
                    
                    // Format team notes nicely
                    let notesHtml = "";
                    if (item.teamNotes) {
                        notesHtml = Object.entries(item.teamNotes)
                            .filter(([_, val]) => val)
                            .map(([role, val]) => `<div class="mb-1"><span class="font-bold text-[9px] uppercase bg-gray-200 px-1 rounded mr-1">${role}:</span> ${val}</div>`)
                            .join('');
                    }
                    if (item.notes) {
                        notesHtml += `<div class="mt-1 text-gray-500 italic border-t border-gray-100 pt-1">Geral: ${item.notes}</div>`;
                    }

                    return `
                    <tr class="border-b border-gray-200 hover:bg-gray-50 text-xs">
                        <td class="p-2 mono font-bold text-gray-700 align-top">${fmtTime(scheduledTime)}</td>
                        <td class="p-2 mono text-gray-500 text-right align-top">${fmtDur(item.durationSeconds)}</td>
                        <td class="p-2 align-top">
                            <div class="font-black uppercase text-sm">${item.title}</div>
                            ${item.speaker ? `<div class="text-blue-700 font-bold text-[10px] uppercase mt-1">${item.speaker}</div>` : ''}
                        </td>
                        <td class="p-2 align-top bg-gray-50/50">
                            ${notesHtml || '<span class="text-gray-300">-</span>'}
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>

        <!-- FOOTER -->
        <div class="mt-8 border-t border-gray-200 pt-4 flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest">
            <div>Equipe de Produção</div>
            <div>Copyright © Igreja Santa Geração - Geração Holy</div>
        </div>

        <script>
            window.onload = () => { setTimeout(() => { window.print(); }, 800); }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(reportHTML);
        printWindow.document.close();
    }
  };

  const nextItemRef = useRef(nextItem);
  useEffect(() => {
    nextItemRef.current = nextItem;
  });

  useEffect(() => {
    if (state.autoAdvance && state.status === ItemStatus.RUNNING && state.targetEndTime) {
        if (autoAdvanceRef.current !== null) window.clearInterval(autoAdvanceRef.current);
        
        autoAdvanceRef.current = window.setInterval(() => {
            const now = Date.now();
            if (now >= state.targetEndTime! + 200) {
                 nextItemRef.current();
            }
        }, 500);
    } else {
        if (autoAdvanceRef.current !== null) {
            window.clearInterval(autoAdvanceRef.current);
            autoAdvanceRef.current = null;
        }
    }
    return () => {
        if (autoAdvanceRef.current !== null) window.clearInterval(autoAdvanceRef.current);
    };
  }, [state.autoAdvance, state.status, state.targetEndTime]); 

  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-black text-white font-mono">CARREGANDO...</div>;
  }

  return (
    <EventContext.Provider value={{
      ...state,
      setEventName,
      setConferenceLogo,
      setScheduledStartTime,
      resetActualStartTime,
      playItem,
      pauseItem,
      resumeItem,
      stopItem,
      nextItem,
      updateItems,
      addItem,
      editItem,
      deleteItem,
      moveItem,
      acknowledgeItem,
      toggleTimerDirection,
      toggleAutoAdvance,
      updateRoster,
      toggleEquipment,
      addCustomRole,
      removeCustomRole,
      addCustomEquipment,
      removeCustomEquipment,
      sendMessage,
      deleteMessage,
      getFullState,
      restoreState,
      generateReport,
      generatePlanningReport,
      markServiceEnd,
      toggleConferenceMode,
      createSession,
      switchSession,
      updateSession,
      deleteSession,
      importMultiSessionData
    }}>
      {children}
    </EventContext.Provider>
  );
};

export const useEvent = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error("useEvent must be used within an EventProvider associated with a specific Event ID");
  }
  return context;
};
