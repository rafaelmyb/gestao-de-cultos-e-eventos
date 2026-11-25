
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEvent } from '../context/EventContext';
import TimerDisplay from '../components/TimerDisplay';
import { ItemStatus, ItemType, RundownItem, TeamRole, EquipmentList } from '../types';
import { parseRundownFromFile, generateItemDetailsAI, enrichRundownWithAI, detectFlags } from '../services/geminiService';
import { 
    Play, Pause, Square, SkipForward, Upload, AlertCircle, Plus, 
    Trash2, X, FileSpreadsheet, FileText, Pencil, ArrowDown, ArrowUp, 
    Settings, Users, CheckSquare, MonitorCheck, QrCode, Share2, Copy, PlusSquare,
    Lock, Download, Megaphone, Send, Sparkles, ChevronUp, ChevronDown, Repeat, CalendarDays, Calendar,
    ClipboardList, GripVertical, GripHorizontal, Image as ImageIcon, BookOpen, ToggleLeft, ToggleRight, Mic2,
    Wand2, Cloud, CloudOff, Clock, FileInput, RotateCcw
} from 'lucide-react';
import { useParams } from 'react-router-dom';

const AdminPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { 
    syncStatus, syncError, eventName, items, activeItemId, playItem, stopItem, pauseItem, resumeItem, nextItem,
    status, updateItems, addItem, deleteItem, editItem, moveItem, timerDirection, 
    toggleTimerDirection, autoAdvance, toggleAutoAdvance, roster, equipmentStatus, updateRoster, toggleEquipment,
    customRoles, customEquipment, addCustomRole, addCustomEquipment, removeCustomRole, removeCustomEquipment,
    messages, sendMessage, deleteMessage, actualStartTime, scheduledStartTime, setScheduledStartTime, resetActualStartTime, markServiceEnd,
    getFullState, generateReport, generatePlanningReport, conferenceLogo, setConferenceLogo,
    // Conference
    isConferenceMode, toggleConferenceMode, sessions, activeSessionId, createSession, switchSession, updateSession, deleteSession, importMultiSessionData
  } = useEvent();

  // AUTH STATE

  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  
  // Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showBulkOptionModal, setShowBulkOptionModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupDetails, setBackupDetails] = useState<{
    totalSessions: number;
    totalItems: number;
    filename: string;
    stateObj: any;
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'roster' | 'equipment' | 'conference'>('roster');

  // Resizable State
  const [sidebarWidth, setSidebarWidth] = useState(450);
  const [notesHeight, setNotesHeight] = useState(200);
  const [resizeMode, setResizeMode] = useState<'sidebar' | 'notes' | null>(null);
  
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Inputs
  const [newRoleInput, setNewRoleInput] = useState('');
  const [newEquipmentInput, setNewEquipmentInput] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDate, setNewSessionDate] = useState('');

  // Form State for Manual Entry
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemSpeaker, setNewItemSpeaker] = useState('');
  const [isPreachingItem, setIsPreachingItem] = useState(false); 
  const [isMCItem, setIsMCItem] = useState(false); 
  const [newItemDurationMin, setNewItemDurationMin] = useState('5');
  const [newItemDurationSec, setNewItemDurationSec] = useState('0');
  
  const [teamNotes, setTeamNotes] = useState<Record<string, string>>({});
  const [messageText, setMessageText] = useState('');
  const [selectedMessageTargets, setSelectedMessageTargets] = useState<string[]>([]);

  const activeItem = items.find(i => i.id === activeItemId);
  const allRoles = [...Object.values(TeamRole), ...customRoles];
  const allEquipment = [...EquipmentList, ...customEquipment];

  useEffect(() => {
    // Check auth logic if needed
  }, []);

  // Resizing Logic
  const startSidebarResize = useCallback(() => setResizeMode('sidebar'), []);
  const startNotesResize = useCallback(() => setResizeMode('notes'), []);
  const stopResizing = useCallback(() => setResizeMode(null), []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
      if (resizeMode === 'sidebar') {
          const newWidth = mouseMoveEvent.clientX;
          if (newWidth > 300 && newWidth < 800) {
              setSidebarWidth(newWidth);
          }
      } else if (resizeMode === 'notes') {
          const newHeight = window.innerHeight - mouseMoveEvent.clientY;
          if (newHeight > 100 && newHeight < 600) {
              setNotesHeight(newHeight);
          }
      }
  }, [resizeMode]);

  useEffect(() => {
      if (resizeMode) {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
      }
      return () => {
          window.removeEventListener("mousemove", resize);
          window.removeEventListener("mouseup", stopResizing);
      };
  }, [resizeMode, resize, stopResizing]);



  const handleBackupDownload = async () => {
    const state = await getFullState(); // Agora é async para pegar do DB Real
    
    // Gerar nome do arquivo GLOBAL
    let filename = `BACKUP`;
    
    if (state.eventName) {
        filename += `_${state.eventName.replace(/[^a-z0-9]/gi, '_')}`;
    } else {
        filename += `_${eventId}`;
    }

    filename += `_${new Date().toISOString().slice(0,10)}.json`;

    // Counting for confirmation alert
    let totalItems = state.items.length;
    // Check if storedSessionItems is object and iterate
    if (state.storedSessionItems && typeof state.storedSessionItems === 'object') {
        Object.values(state.storedSessionItems).forEach((list: any) => {
             if (Array.isArray(list)) totalItems += list.length;
        });
    }
    
    const totalSessions = state.sessions ? state.sessions.length : 0;

    setBackupDetails({
      totalSessions,
      totalItems,
      filename,
      stateObj: state
    });
    setShowBackupModal(true);
  };

  const triggerDownload = () => {
    if (!backupDetails) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupDetails.stateObj));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", backupDetails.filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setShowBackupModal(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      try {
        const file = e.target.files[0];
        const shouldForceSingleSession = isConferenceMode && !!activeSessionId;
        
        const result = await parseRundownFromFile(file, shouldForceSingleSession);
        
        if (result.isMultiSession && result.sessions && Array.isArray(result.sessions) && result.sessions.length > 0) {
            importMultiSessionData(result.sessions);
            alert(`Sucesso! ${result.sessions.length} sessões importadas via IA.\nVerifique a aba Conferência.`);
        } else if (result.items && Array.isArray(result.items) && result.items.length > 0) {
            updateItems(result.items);
            alert(`Sucesso! ${result.items.length} itens importados para o cronograma atual.`);
        } else {
            throw new Error("A IA processou o arquivo mas não encontrou itens válidos.");
        }
      } catch (err: any) {
        console.error(err);
        const msg = err.message || "Erro desconhecido";
        alert(`FALHA NA IMPORTAÇÃO:\n${msg}\n\nVerifique se a Chave da API está configurada no servidor.`);
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    }
  };

  // --- IA MÁGICA: BULK ENRICH UI ---
  const handleBulkEnrichClick = () => {
      if (items.length === 0) return;
      setShowBulkOptionModal(true);
  };

  // --- IA MÁGICA: EXECUTION ---
  const executeBulkEnrich = async (mode: 'overwrite' | 'fill') => {
    setShowBulkOptionModal(false);
    setIsBulkEnriching(true);
    try {
        const enrichedMap = await enrichRundownWithAI(items);
        
        const newItems = items.map(item => {
            const newNotes = enrichedMap[item.id];
            
            // AUTO DETECT FLAGS (Preletor/MC) se estiverem false
            const flags = detectFlags(item.title, item.type || '');
            const updates = { ...item };
            
            // Só aplica a flag se o item ainda não tiver (ou se for overwrite, reavalia)
            if (mode === 'overwrite' || !item.isPreaching) updates.isPreaching = flags.isPreaching;
            if (mode === 'overwrite' || !item.isMC) updates.isMC = flags.isMC;

            if (newNotes) {
                let mergedNotes = { ...(item.teamNotes || {}) };
                
                if (mode === 'overwrite') {
                    // Sobrescreve: prioriza o que veio da IA
                    mergedNotes = { ...mergedNotes, ...newNotes };
                } else {
                    // Preenche Vazios: Só adiciona se não existir
                    Object.keys(newNotes).forEach(role => {
                        if (!mergedNotes[role] || mergedNotes[role].trim() === "") {
                            mergedNotes[role] = newNotes[role];
                        }
                    });
                }
                updates.teamNotes = mergedNotes;
            }
            return updates;
        });

        updateItems(newItems);
        alert(`Sucesso! Instruções e Cargos gerados em modo: ${mode === 'overwrite' ? 'Sobrescrever' : 'Preencher Vazios'}.`);
    } catch (err: any) {
        console.error(err);
        alert(`Erro ao processar com IA: ${err.message}`);
    } finally {
        setIsBulkEnriching(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!newItemTitle) {
        alert("Digite pelo menos um Título para a IA ter contexto.");
        return;
    }
    setIsGeneratingAI(true);
    try {
        const details = await generateItemDetailsAI(newItemTitle, newItemSpeaker);
        if (details && details.teamNotes && Object.keys(details.teamNotes).length > 0) {
             setTeamNotes(prev => ({ ...prev, ...details.teamNotes }));
             setTimeout(() => alert("Notas geradas com sucesso!"), 100);
        } else {
             alert("A IA não retornou notas específicas. Tente detalhar mais o título.");
        }
    } catch (err) {
        console.error(err);
        alert("Erro ao gerar detalhes com IA.");
    } finally {
        setIsGeneratingAI(false);
    }
  };

  const handleSetScheduled = (e: React.ChangeEvent<HTMLInputElement>) => {
      const timeStr = e.target.value;
      if (!timeStr) {
          setScheduledStartTime(null);
          return;
      }
      const [h, m] = timeStr.split(':').map(Number);
      const now = new Date();
      now.setHours(h, m, 0, 0);
      setScheduledStartTime(now.getTime());
  };

  const openAddModal = () => {
    setEditingId(null);
    setNewItemTitle('');
    setNewItemSpeaker('');
    setIsPreachingItem(false);
    setIsMCItem(false);
    setNewItemDurationMin('5');
    setNewItemDurationSec('0');
    setTeamNotes({});
    setShowAddModal(true);
  };

  const openEditModal = (item: RundownItem) => {
    setEditingId(item.id);
    setNewItemTitle(item.title);
    setNewItemSpeaker(item.speaker || '');
    setIsPreachingItem(item.isPreaching || false);
    setIsMCItem(item.isMC || false);
    setNewItemDurationMin(Math.floor(item.durationSeconds / 60).toString());
    setNewItemDurationSec((item.durationSeconds % 60).toString());
    setTeamNotes(item.teamNotes || {});
    setShowAddModal(true);
  };

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    const duration = (parseInt(newItemDurationMin) * 60) + parseInt(newItemDurationSec);
    const cleanNotes: Record<string, string> = {};
    Object.entries(teamNotes).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        cleanNotes[key] = value;
      }
    });

    if (editingId) {
      editItem(editingId, {
        title: newItemTitle,
        speaker: newItemSpeaker,
        isPreaching: isPreachingItem,
        isMC: isMCItem,
        durationSeconds: duration,
        type: items.find(i => i.id === editingId)?.type || ItemType.KEYNOTE,
        teamNotes: cleanNotes
      });
    } else {
      const newItem: RundownItem = {
        id: crypto.randomUUID(),
        title: newItemTitle,
        speaker: newItemSpeaker,
        isPreaching: isPreachingItem,
        isMC: isMCItem,
        durationSeconds: duration,
        type: ItemType.KEYNOTE, 
        notes: '',
        teamNotes: cleanNotes
      };
      addItem(newItem);
    }
    setShowAddModal(false);
  };

  const handleNoteChange = (role: string, text: string) => {
    setTeamNotes(prev => ({
      ...prev,
      [role]: text
    }));
  };

  const handleAddCustomRole = () => {
    if (newRoleInput.trim()) {
      addCustomRole(newRoleInput.trim().toUpperCase());
      setNewRoleInput('');
    }
  };

  const handleAddCustomEquipment = () => {
      if (newEquipmentInput.trim()) {
          addCustomEquipment(newEquipmentInput.trim());
          setNewEquipmentInput('');
      }
  };

  const handleCreateSession = (e: React.FormEvent) => {
      e.preventDefault();
      if (newSessionName.trim()) {
          createSession(newSessionName, newSessionDate);
          setNewSessionName('');
          setNewSessionDate('');
      }
  };

  // Messaging Logic
  const toggleMessageTarget = (target: string) => {
    if (target === 'ALL') {
        if (selectedMessageTargets.includes('ALL')) {
            setSelectedMessageTargets([]);
        } else {
            setSelectedMessageTargets(['ALL']);
        }
    } else {
        let newTargets = selectedMessageTargets.filter(t => t !== 'ALL');
        if (newTargets.includes(target)) {
            newTargets = newTargets.filter(t => t !== target);
        } else {
            newTargets.push(target);
        }
        setSelectedMessageTargets(newTargets);
    }
  };

  const handleSendMessage = () => {
    if (!messageText.trim() || selectedMessageTargets.length === 0) return;
    sendMessage(messageText, selectedMessageTargets);
    setMessageText('');
  };

  const getShareUrl = () => {
      const baseUrl = window.location.href.split('#')[0];
      return `${baseUrl}#/nucleos/${eventId}`;
  };
  const shareUrl = getShareUrl();

  const handleShare = async () => {
    const shareMessage = `Acesse o Cronograma: ${eventName || 'Evento'}`;
    const nucleosUrl = getShareUrl();
    const fullShareText = `${shareMessage} - ${nucleosUrl}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Chronos Event: ${eventId}`,
          text: shareMessage,
          url: nucleosUrl
        });
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      try {
        await navigator.clipboard.writeText(fullShareText);
        alert('Link copiado!');
      } catch (err) {
        alert('Link copiado!');
      }
    }
  };

  const handleCopyLink = async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copiado!');
      } catch (err) {
        alert('Erro ao copiar.');
      }
  };

  const getRowColor = (id: string) => {
    if (id === activeItemId) return 'bg-gray-800 border-l-4 border-brand-red';
    return 'hover:bg-gray-900 border-l-4 border-transparent';
  };

  // Predicted Times Logic
  const calculateSchedule = () => {
      const times: string[] = [];
      // Se tiver Início Real, usa ele. Se não, usa Previsto. Se não, usa agora (preview)
      let currentStart = actualStartTime || scheduledStartTime || Date.now();
      let anchor = currentStart;
      
      const activeIdx = items.findIndex(i => i.id === activeItemId);
      
      items.forEach((item, idx) => {
          // If we are calculating schedule based on a prediction, we just sum up durations.
          anchor += item.durationSeconds * 1000;
          times.push(new Date(anchor).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
      });
      return times;
  };
  
  const predictedTimes = calculateSchedule();


  return (
    <div className="flex h-screen bg-broadcast-black text-white overflow-hidden relative" onMouseUp={stopResizing}>
      
      {/* --- BULK OPTION MODAL --- */}
      {showBulkOptionModal && (
          <div className="absolute inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
              <div className="bg-broadcast-panel border border-broadcast-border rounded-xl w-full max-w-md shadow-2xl flex flex-col">
                  <div className="p-6 text-center border-b border-gray-800">
                      <div className="inline-block p-3 rounded-full bg-purple-900/30 mb-4">
                          <Wand2 size={48} className="text-purple-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white uppercase tracking-wide">IA Mágica</h3>
                      <p className="text-gray-400 text-sm mt-2">
                          A Inteligência Artificial irá gerar instruções técnicas para todos os itens da lista. Como deseja aplicar?
                      </p>
                  </div>
                  <div className="p-6 flex flex-col gap-3">
                      <button 
                        onClick={() => executeBulkEnrich('fill')}
                        className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 rounded-lg transition uppercase flex flex-col items-center"
                      >
                          <span>Preencher Apenas Vazios</span>
                          <span className="text-[10px] opacity-70 font-mono normal-case">Mantém o que você já escreveu</span>
                      </button>
                      <button 
                        onClick={() => executeBulkEnrich('overwrite')}
                        className="bg-red-900/50 hover:bg-red-800 border border-red-800 text-red-200 font-bold py-3 rounded-lg transition uppercase flex flex-col items-center"
                      >
                          <span>Sobrescrever Tudo</span>
                          <span className="text-[10px] opacity-70 font-mono normal-case">Substitui todas as notas atuais</span>
                      </button>
                      <button 
                        onClick={() => setShowBulkOptionModal(false)}
                        className="mt-2 text-gray-500 hover:text-white uppercase font-bold text-xs"
                      >
                          Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- CUSTOM BACKUP MODAL --- */}
      {showBackupModal && backupDetails && (
        <div className="absolute inset-0 bg-black/85 z-[60] flex items-center justify-center p-4">
          <div className="bg-broadcast-panel border border-broadcast-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-zoom-in">
             <div className="p-6 border-b border-broadcast-border bg-gray-900 flex justify-between items-center">
                 <h3 className="text-lg font-bold font-sans flex items-center gap-2 text-white uppercase tracking-wider">
                     <Download size={20} className="text-broadcast-green" /> Backup Global Gerado
                 </h3>
                 <button onClick={() => setShowBackupModal(false)} className="text-gray-400 hover:text-white transition">
                     <X size={20}/>
                 </button>
             </div>
             <div className="p-6 flex flex-col gap-4 text-gray-300">
                 <p className="text-sm">
                     O arquivo completo de backup do evento foi gerado com sucesso. Ele contém a estrutura íntegra do seu cronograma para restauração futura.
                 </p>
                 <div className="bg-black/40 border border-broadcast-border p-4 rounded-lg font-mono text-xs flex flex-col gap-2">
                     <div className="flex justify-between border-b border-gray-800/50 pb-1.5">
                         <span className="text-gray-500">Evento:</span>
                         <span className="text-white font-bold">{eventName || 'Culto Principal'}</span>
                     </div>
                     <div className="flex justify-between border-b border-gray-800/50 pb-1.5">
                         <span className="text-gray-500">Cód. Evento:</span>
                         <span className="text-broadcast-green font-bold">{eventId}</span>
                     </div>
                     <div className="flex justify-between border-b border-gray-800/50 pb-1.5">
                         <span className="text-gray-500">Sessões:</span>
                         <span className="text-white font-bold">{backupDetails.totalSessions}</span>
                     </div>
                     <div className="flex justify-between border-b border-gray-800/50 pb-1.5">
                         <span className="text-gray-500">Itens Cronograma:</span>
                         <span className="text-white font-bold">{backupDetails.totalItems}</span>
                     </div>
                     <div className="flex flex-col gap-1 pt-1">
                         <span className="text-gray-500">Arquivo:</span>
                         <span className="text-yellow-400 font-bold overflow-hidden text-ellipsis break-all select-all font-mono">{backupDetails.filename}</span>
                     </div>
                 </div>
                 <div className="text-[11px] text-gray-500 italic bg-gray-950/40 p-3 rounded border border-gray-800/50">
                     💡 Você poderá restaurar este backup a qualquer momento na tela inicial (Landing Page) clicando em "Restaurar Backup".
                 </div>
             </div>
             <div className="p-4 border-t border-broadcast-border bg-gray-900/50 flex gap-3 justify-end">
                 <button 
                     onClick={() => setShowBackupModal(false)}
                     className="px-4 py-2 text-xs font-bold uppercase text-gray-400 hover:text-white hover:bg-gray-800 rounded transition"
                 >
                     Cancelar
                 </button>
                 <button 
                     onClick={triggerDownload}
                     className="px-5 py-2 text-xs bg-broadcast-green hover:bg-green-500 text-black font-extrabold uppercase rounded-lg transition-all shadow-[0_0_15px_rgba(0,224,85,0.2)] hover:shadow-[0_0_20px_rgba(0,224,85,0.4)] flex items-center gap-2 cursor-pointer"
                 >
                     <Download size={14} className="stroke-[3]" />
                     Baixar Backup
                 </button>
             </div>
          </div>
        </div>
      )}

      {/* --- QR CODE MODAL --- */}
      {showQRModal && (
        <div className="absolute inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setShowQRModal(false)}>
           <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-4 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-black font-bold text-xl uppercase tracking-widest text-center">Escaneie para Acessar</h3>
              <div className="bg-white p-2 border-4 border-black">
                <img 
                   src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl)}`}
                   alt="QR Code"
                   className="w-64 h-64"
                />
              </div>
              <p className="text-black font-mono font-bold text-2xl tracking-[0.2em]">{eventId}</p>
              
              <div className="text-center w-full">
                 <p className="text-gray-500 text-xs uppercase font-bold mb-1">Direciona para:</p>
                 <div className="flex items-center gap-2 bg-gray-100 p-2 rounded w-full">
                    <p className="text-black text-xs break-all font-mono flex-1 text-left">{shareUrl}</p>
                    <button onClick={handleCopyLink} className="text-gray-500 hover:text-black p-1" title="Copiar Link">
                        <Copy size={16} />
                    </button>
                 </div>
              </div>
              <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-black mt-2 font-bold uppercase text-sm">Fechar</button>
           </div>
        </div>
      )}

      {/* --- MESSAGE MODAL --- */}
      {showMessageModal && (
        <div className="absolute inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-broadcast-panel border border-broadcast-border rounded-lg w-full max-w-3xl shadow-2xl flex flex-col max-h-[80vh]">
             <div className="p-6 border-b border-broadcast-border flex justify-between items-center bg-gray-900 rounded-t-lg">
                <h3 className="text-xl font-bold font-sans flex items-center gap-2">
                   <Megaphone size={24} className="text-brand-red"/> Comunicação em Tempo Real
                </h3>
                <button onClick={() => setShowMessageModal(false)} className="text-gray-400 hover:text-white"><X size={20}/></button>
             </div>
             
             <div className="p-6 flex-1 overflow-y-auto">
                 <div className="flex gap-4 mb-6">
                    <input 
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      placeholder="Digite o aviso ou alerta..."
                      className="flex-1 bg-black border border-gray-700 p-4 rounded text-white focus:border-brand-red outline-none text-lg"
                      autoFocus
                    />
                    <button 
                      onClick={handleSendMessage}
                      className="bg-brand-red text-white font-bold px-6 rounded hover:bg-red-500 transition flex items-center gap-2 disabled:opacity-50"
                      disabled={!messageText.trim() || selectedMessageTargets.length === 0}
                    >
                       <Send size={20} /> ENVIAR
                    </button>
                 </div>

                 <div className="mb-6">
                    <h4 className="text-xs uppercase font-bold text-gray-500 mb-2">Destinatários</h4>
                    <div className="flex flex-wrap gap-2">
                       <button 
                         onClick={() => toggleMessageTarget('ALL')}
                         className={`px-3 py-1 rounded text-xs font-bold uppercase border ${selectedMessageTargets.includes('ALL') ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                       >
                         TODOS
                       </button>
                       <button 
                         onClick={() => toggleMessageTarget('VIEWER')}
                         className={`px-3 py-1 rounded text-xs font-bold uppercase border ${selectedMessageTargets.includes('VIEWER') ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                       >
                         PROJETOR (VIEWER)
                       </button>
                       {allRoles.map(role => (
                          <button 
                            key={role}
                            onClick={() => toggleMessageTarget(role)}
                            className={`px-3 py-1 rounded text-xs font-bold uppercase border ${selectedMessageTargets.includes(role) ? 'bg-yellow-600 border-yellow-600 text-black' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                          >
                            {role}
                          </button>
                       ))}
                    </div>
                 </div>

                 <div className="border-t border-gray-800 pt-6">
                    <h4 className="text-xs uppercase font-bold text-gray-500 mb-4">Mensagens Ativas</h4>
                    <div className="space-y-2">
                       {(messages || []).length === 0 && <p className="text-gray-600 text-sm italic">Nenhum aviso ativo.</p>}
                       {messages?.map(msg => (
                          <div key={msg.id} className="bg-gray-900 border border-gray-700 p-3 rounded flex justify-between items-center">
                             <div>
                                <div className="text-white font-medium">{msg.text}</div>
                                <div className="text-[10px] text-gray-500 uppercase mt-1">
                                   Para: {msg.targetRoles.join(', ')} • {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                             </div>
                             <button onClick={() => deleteMessage(msg.id)} className="text-red-500 hover:text-white p-2">
                                <Trash2 size={16} />
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIGURAÇÕES DO EVENTO --- */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-broadcast-panel border border-broadcast-border rounded-lg w-full max-w-4xl shadow-2xl flex flex-col h-[80vh]">
            <div className="p-6 border-b border-broadcast-border flex justify-between items-center bg-gray-900 rounded-t-lg">
              <h3 className="text-xl font-bold font-sans flex items-center gap-2">
                <Settings size={24} className="text-brand-red"/> 
                Setup do Evento
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
               <button onClick={() => setSettingsTab('roster')} className={`flex-1 py-4 font-mono uppercase font-bold tracking-wider flex justify-center gap-2 ${settingsTab === 'roster' ? 'bg-gray-800 text-brand-red border-b-2 border-brand-red' : 'text-gray-500 hover:bg-gray-900'}`}>
                 <Users size={18} /> Equipe
               </button>
               <button onClick={() => setSettingsTab('equipment')} className={`flex-1 py-4 font-mono uppercase font-bold tracking-wider flex justify-center gap-2 ${settingsTab === 'equipment' ? 'bg-gray-800 text-brand-red border-b-2 border-brand-red' : 'text-gray-500 hover:bg-gray-900'}`}>
                 <MonitorCheck size={18} /> Equipamentos
               </button>
               <button onClick={() => setSettingsTab('conference')} className={`flex-1 py-4 font-mono uppercase font-bold tracking-wider flex justify-center gap-2 ${settingsTab === 'conference' ? 'bg-gray-800 text-brand-red border-b-2 border-brand-red' : 'text-gray-500 hover:bg-gray-900'}`}>
                 <CalendarDays size={18} /> Conferência
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0a0a0a]">
              
              {settingsTab === 'roster' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 h-fit">
                      <h4 className="text-brand-red font-bold uppercase mb-4 border-b border-gray-700 pb-2">Liderança</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-500 uppercase mb-1 font-bold">Gestor do Culto (Admin)</label>
                          <input value={roster?.gestorCulto || ''} onChange={(e) => updateRoster('gestorCulto', e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" placeholder="Nome do Responsável"/>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 uppercase mb-1 font-bold">Gerente de Culto (Mobile)</label>
                          <input value={roster?.gerenteCulto || ''} onChange={(e) => updateRoster('gerenteCulto', e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" placeholder="Nome do Responsável"/>
                        </div>
                      </div>
                   </div>

                   <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 flex flex-col">
                      <h4 className="text-yellow-500 font-bold uppercase mb-4 border-b border-gray-700 pb-2">Núcleos (Voluntários)</h4>
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[300px] mb-4 space-y-4">
                        {allRoles.map(role => (
                          <div key={role} className="relative group">
                            <label className="block text-xs text-gray-500 uppercase mb-1 font-bold flex items-center justify-between">
                              {role}
                              {customRoles.includes(role) && (
                                <button onClick={() => removeCustomRole(role)} className="text-red-500 hover:text-white" title="Remover Núcleo"><Trash2 size={12}/></button>
                              )}
                            </label>
                            <input value={roster?.nucleos?.[role] || ''} onChange={(e) => updateRoster(role, e.target.value, true)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-yellow-600 outline-none text-sm" placeholder={`Voluntário de ${role.toLowerCase()}`}/>
                          </div>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-gray-700 flex gap-2">
                         <input value={newRoleInput} onChange={(e) => setNewRoleInput(e.target.value)} className="flex-1 bg-black border border-gray-700 p-2 rounded text-sm text-white" placeholder="Novo Núcleo (Ex: SEGURANÇA)"/>
                         <button onClick={handleAddCustomRole} className="bg-gray-800 hover:bg-white hover:text-black px-4 rounded transition"><Plus size={18} /></button>
                      </div>
                   </div>
                </div>
              )}

              {settingsTab === 'equipment' && (
                <div className="w-full max-w-3xl mx-auto">
                  <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold text-white mb-1">Checklist Técnico</h2>
                    <p className="text-gray-500 text-sm">Verifique se todos os sistemas estão operacionais antes do início.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {allEquipment.map((eq) => {
                      const isReady = equipmentStatus[eq] || false;
                      const isCustom = customEquipment.includes(eq);
                      return (
                        <div key={eq} onClick={() => toggleEquipment(eq)} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all select-none group relative ${isReady ? 'bg-green-900/20 border-green-800 hover:bg-green-900/30' : 'bg-gray-900 border-gray-700 hover:bg-gray-800 hover:border-gray-500'}`}>
                          <div className="flex items-center gap-3">
                             <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${isReady ? 'bg-broadcast-green text-broadcast-green' : 'bg-gray-600 text-gray-600'}`}></div>
                             <span className={`font-mono font-medium ${isReady ? 'text-white' : 'text-gray-400'}`}>{eq}</span>
                          </div>
                          <div className="flex items-center gap-2">
                             {isCustom && <button onClick={(e) => { e.stopPropagation(); removeCustomEquipment(eq); }} className="p-1 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={16} /></button>}
                             <div className={`p-1 rounded ${isReady ? 'bg-broadcast-green text-black' : 'bg-gray-700 text-gray-400'}`}><CheckSquare size={20} /></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                      <input value={newEquipmentInput} onChange={(e) => setNewEquipmentInput(e.target.value)} className="flex-1 bg-black border border-gray-700 p-3 rounded text-sm text-white focus:border-brand-red outline-none" placeholder="Novo Equipamento (Ex: Máquina de Fumaça)"/>
                      <button onClick={handleAddCustomEquipment} className="bg-brand-red text-white font-bold px-6 rounded hover:bg-red-500 transition flex items-center gap-2"><PlusSquare size={18} /> Adicionar</button>
                  </div>
                </div>
              )}

              {settingsTab === 'conference' && (
                <div className="w-full max-w-3xl mx-auto space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-900 rounded-xl border border-gray-800">
                        <div>
                            <h3 className="font-bold text-white uppercase tracking-wide">Modo Conferência</h3>
                            <p className="text-xs text-gray-500">Habilita múltiplas sessões (datas) para o mesmo evento.</p>
                        </div>
                        <button 
                            onClick={() => toggleConferenceMode(!isConferenceMode)}
                            className={`px-4 py-2 rounded font-bold uppercase text-xs transition ${isConferenceMode ? 'bg-brand-red text-white' : 'bg-gray-800 text-gray-400'}`}
                        >
                            {isConferenceMode ? 'ATIVADO' : 'DESATIVADO'}
                        </button>
                    </div>

                    {isConferenceMode && (
                        <div className="bg-gray-900/50 p-6 rounded-xl border border-gray-800 animate-fade-in">
                            <h4 className="text-brand-red font-bold uppercase mb-4 border-b border-gray-700 pb-2">Gerenciar Sessões</h4>
                            
                            <form onSubmit={handleCreateSession} className="flex gap-4 mb-6">
                                <input 
                                    value={newSessionName} onChange={e => setNewSessionName(e.target.value)}
                                    placeholder="Nome (ex: Sessão 1 - Manhã)"
                                    className="flex-[2] bg-black border border-gray-700 p-3 rounded text-sm text-white focus:border-brand-red outline-none"
                                />
                                <input 
                                    value={newSessionDate} onChange={e => setNewSessionDate(e.target.value)}
                                    placeholder="Data (ex: 06/12)"
                                    className="flex-1 bg-black border border-gray-700 p-3 rounded text-sm text-white focus:border-brand-red outline-none"
                                />
                                <button type="submit" disabled={!newSessionName} className="bg-gray-800 hover:bg-white hover:text-black px-4 rounded transition disabled:opacity-50">
                                    <Plus size={20}/>
                                </button>
                            </form>

                            <div className="space-y-3">
                                {sessions.map(s => (
                                    <div key={s.id} className={`flex items-center justify-between p-3 rounded border ${s.id === activeSessionId ? 'bg-gray-800 border-brand-red' : 'bg-black border-gray-800'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="bg-gray-900 p-2 rounded text-gray-400">
                                                <Calendar size={16}/>
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-white">{s.name}</div>
                                                {s.date && <div className="text-xs text-gray-500">{s.date}</div>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s.id !== activeSessionId && (
                                                <button onClick={() => switchSession(s.id)} className="text-xs uppercase font-bold text-brand-red hover:underline mr-2">
                                                    Ativar
                                                </button>
                                            )}
                                            {s.id === activeSessionId && (
                                                <span className="text-xs uppercase font-bold text-gray-500 mr-2 border border-gray-700 px-2 py-1 rounded">Ativa</span>
                                            )}
                                            <button onClick={() => deleteSession(s.id)} className="text-gray-600 hover:text-red-500 transition">
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {sessions.length === 0 && <p className="text-gray-600 text-sm italic text-center py-4">Nenhuma sessão criada.</p>}
                            </div>
                        </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL ITEM EDITOR --- */}
      {showAddModal && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-broadcast-panel border border-broadcast-border rounded-lg w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-broadcast-border flex justify-between items-center bg-gray-900 rounded-t-lg">
              <div className="flex items-center gap-4">
                  <h3 className="text-xl font-bold font-sans">{editingId ? 'Editar Item' : 'Novo Item Manual'}</h3>
                  <button 
                    onClick={handleGenerateAI}
                    disabled={isGeneratingAI}
                    className="flex items-center gap-2 px-3 py-1 bg-purple-900/50 text-purple-300 border border-purple-700 rounded text-xs font-bold uppercase hover:bg-purple-800 transition disabled:opacity-50"
                  >
                      <Sparkles size={14} />
                      {isGeneratingAI ? 'Gerando...' : (editingId ? 'Regenerar com IA' : 'Preencher com IA')}
                  </button>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <form id="itemForm" onSubmit={handleManualSave} className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-brand-red uppercase tracking-wider border-b border-gray-700 pb-2">Informações Gerais</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 uppercase mb-1">Título</label>
                      <input required value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" placeholder="Ex: Abertura" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 uppercase mb-1">Palestrante/Info</label>
                      <input value={newItemSpeaker} onChange={e => setNewItemSpeaker(e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" placeholder="Ex: João da Silva" />
                    </div>
                    
                    {/* TOGGLE PREACHING */}
                    <div className="col-span-1 bg-gray-900/50 p-3 rounded border border-gray-700 flex items-center justify-between cursor-pointer" onClick={() => setIsPreachingItem(!isPreachingItem)}>
                        <div className="flex items-center gap-2">
                             <BookOpen size={16} className={isPreachingItem ? "text-brand-red" : "text-gray-500"} />
                             <label className="text-xs uppercase font-bold cursor-pointer text-gray-300">É Pregação?</label>
                        </div>
                        {isPreachingItem ? <ToggleRight size={24} className="text-brand-red"/> : <ToggleLeft size={24} className="text-gray-600"/>}
                    </div>

                    {/* TOGGLE MC */}
                    <div className="col-span-1 bg-gray-900/50 p-3 rounded border border-gray-700 flex items-center justify-between cursor-pointer" onClick={() => setIsMCItem(!isMCItem)}>
                        <div className="flex items-center gap-2">
                             <Mic2 size={16} className={isMCItem ? "text-blue-500" : "text-gray-500"} />
                             <label className="text-xs uppercase font-bold cursor-pointer text-gray-300">É Entrada MC?</label>
                        </div>
                        {isMCItem ? <ToggleRight size={24} className="text-blue-500"/> : <ToggleLeft size={24} className="text-gray-600"/>}
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 uppercase mb-1">Minutos</label>
                      <input type="number" min="0" value={newItemDurationMin} onChange={e => setNewItemDurationMin(e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase mb-1">Segundos</label>
                      <input type="number" min="0" max="59" value={newItemDurationSec} onChange={e => setNewItemDurationSec(e.target.value)} className="w-full bg-black border border-gray-700 p-2 rounded text-white focus:border-brand-red outline-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-end border-b border-gray-700 pb-2">
                       <h4 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                            <AlertCircle size={14}/> Instruções por Núcleo
                       </h4>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allRoles.map(role => (
                        <div key={role}>
                          <label className="block text-[10px] text-gray-400 uppercase mb-1 font-bold">{role}</label>
                          <input value={teamNotes[role] || ''} onChange={e => handleNoteChange(role, e.target.value)} className="w-full bg-gray-900 border border-gray-800 p-2 rounded text-sm text-gray-200 focus:border-yellow-600 outline-none placeholder-gray-700" placeholder={`Instrução para ${role.toLowerCase()}...`} />
                        </div>
                      ))}
                   </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-broadcast-border bg-gray-900 rounded-b-lg">
               <button form="itemForm" type="submit" className="w-full bg-brand-red text-white font-bold py-3 rounded hover:bg-red-500 transition uppercase tracking-wide">
                {editingId ? 'Salvar Alterações' : 'Adicionar Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar / Rundown */}
      <div 
        ref={sidebarRef}
        className="border-r border-broadcast-border flex flex-col flex-shrink-0 relative"
        style={{ width: sidebarWidth }}
      >
        <div className="p-4 border-b border-broadcast-border bg-broadcast-panel">
          
          {/* Header Superior com Sessões */}
          <div className="flex justify-between items-start mb-2">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold font-sans tracking-wide text-brand-red uppercase">Cronograma</h2>
                {isConferenceMode && sessions.length > 0 && (
                    <div className="mt-1 mb-1">
                        <select 
                            value={activeSessionId || ''} 
                            onChange={(e) => switchSession(e.target.value)}
                            className="bg-gray-800 text-white text-xs uppercase font-bold py-1 px-2 rounded border border-gray-700 outline-none focus:border-brand-red"
                        >
                            {sessions.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} {s.date ? `(${s.date})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                {/* ALWAYS SHOW GESTOR IF FILLED OR PLACEHOLDER */}
                <span className="text-[10px] text-gray-400 font-mono uppercase truncate max-w-[200px] mt-1" title="Gestor do Culto">
                  Gestor: <span className="text-white font-bold">{roster?.gestorCulto || "N/A"}</span>
                </span>
                
                {actualStartTime ? (
                    <span className="text-[10px] text-gray-500 font-mono uppercase mt-0.5 flex items-center gap-2">
                      Início Real: <span className="text-broadcast-green">{new Date(actualStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <button onClick={resetActualStartTime} className="text-gray-600 hover:text-red-500" title="Resetar Início (Voltar para Previsto)"><RotateCcw size={10} /></button>
                    </span>
                ) : (
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500 font-mono uppercase">Previsto:</span>
                        <input 
                            type="time" 
                            className="bg-transparent text-broadcast-yellow text-xs font-bold font-mono outline-none border-b border-gray-700 hover:border-broadcast-yellow w-16"
                            value={scheduledStartTime ? new Date(scheduledStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                            onChange={handleSetScheduled}
                        />
                    </div>
                )}
             </div>
             
             {/* Action Buttons */}
             <div className="flex gap-2 items-center">
                <button onClick={() => setShowSettingsModal(true)} className="bg-gray-800 p-1.5 rounded text-gray-300 hover:text-white border border-gray-600" title="Configurações">
                    <Settings size={16} />
                </button>
                <button onClick={() => setShowMessageModal(true)} className="bg-gray-800 p-1.5 rounded text-yellow-500 hover:text-yellow-400 border border-yellow-800" title="Avisos">
                    <Megaphone size={16} />
                </button>
                <button 
                    onClick={handleBulkEnrichClick} 
                    disabled={isBulkEnriching || items.length === 0}
                    className={`bg-purple-900/50 border border-purple-700 text-purple-300 hover:bg-purple-900 p-1.5 rounded transition ${isBulkEnriching ? 'animate-pulse opacity-50' : ''}`} 
                    title="IA Mágica: Gerar notas e corrigir cargos automaticamente"
                >
                    <Wand2 size={16} />
                </button>
                <button onClick={openAddModal} className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 rounded text-xs text-white border border-gray-600 hover:bg-gray-700">
                    <Plus size={14} /> Novo
                </button>
                <label className={`flex items-center gap-1 px-2 py-1.5 bg-gray-800 rounded text-xs text-gray-300 border border-gray-600 hover:bg-gray-700 cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                    <Upload size={14} /> Importar
                    <input type="file" accept="image/*,.pdf,.xlsx,.xls" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                </label>
             </div>
          </div>
        </div>
        
        {/* Info bar */}
        <div className="bg-gray-900 px-4 py-2 text-[10px] text-gray-500 flex justify-between border-b border-gray-800">
           <div className="flex gap-4">
             <span className="flex items-center gap-1"><FileText size={10}/> PDF / Imagens</span>
             <span className="flex items-center gap-1"><FileSpreadsheet size={10}/> Excel (.xlsx)</span>
           </div>
           <div className="flex items-center gap-1 text-broadcast-green">
             <CheckSquare size={10} />
             {Object.values(equipmentStatus).filter(Boolean).length}/{allEquipment.length} Equipamentos
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-16">
          <table className="w-full text-left text-sm">
            <thead className="bg-broadcast-panel text-gray-400 sticky top-0 z-10 shadow-md">
              <tr>
                <th className="p-3">Título</th>
                <th className="p-3 w-16">Dur</th>
                <th className="p-3 w-16">Término</th>
                <th className="p-3 w-28 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr 
                  key={item.id} 
                  className={`border-b border-broadcast-border transition-all cursor-pointer group ${getRowColor(item.id)}`}
                  onClick={() => { if (status === ItemStatus.IDLE) playItem(item.id); }}
                  onDoubleClick={(e) => { e.stopPropagation(); playItem(item.id); }}
                >
                  <td className="p-3">
                    <div className="font-semibold flex items-center gap-2">
                        {item.title}
                        {item.isPreaching && <span title="Momento de Pregação"><BookOpen size={12} className="text-brand-red" /></span>}
                        {item.isMC && <span title="Entrada MC"><Mic2 size={12} className="text-blue-500" /></span>}
                    </div>
                    <div className="text-xs text-gray-500">{item.speaker}</div>
                    {item.teamNotes && Object.keys(item.teamNotes).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        <span className="text-xs bg-gray-800 text-yellow-600 px-1 rounded flex items-center gap-1"><AlertCircle size={8} /> Instruções</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-gray-300">
                    {Math.floor(item.durationSeconds / 60)}:{(item.durationSeconds % 60).toString().padStart(2, '0')}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-gray-800 text-gray-400">
                       {predictedTimes[index] || "--:--"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1 items-center">
                      <div className="flex flex-col mr-2 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={(e) => { e.stopPropagation(); moveItem(item.id, 'up'); }} disabled={index === 0} className="hover:text-broadcast-green disabled:opacity-20"><ChevronUp size={12}/></button>
                          <button onClick={(e) => { e.stopPropagation(); moveItem(item.id, 'down'); }} disabled={index === items.length - 1} className="hover:text-broadcast-green disabled:opacity-20"><ChevronDown size={12}/></button>
                      </div>
                      {activeItemId !== item.id && (
                        <button onClick={(e) => { e.stopPropagation(); playItem(item.id); }} className="text-gray-500 hover:text-broadcast-green" title="Carregar"><Play size={14} /></button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(item); }} className="text-gray-600 hover:text-white opacity-0 group-hover:opacity-100 transition" title="Editar"><Pencil size={14} /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }} className="text-gray-600 hover:text-broadcast-red opacity-0 group-hover:opacity-100 transition" title="Excluir"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && (
             <div className="p-8 text-center text-gray-600 text-sm italic">
               {isConferenceMode && !activeSessionId ? "Selecione ou crie uma sessão." : "Nenhum item no cronograma."}
             </div>
          )}
        </div>
        
        {/* DRAG HANDLE (SIDEBAR) */}
        <div 
          onMouseDown={startSidebarResize}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-40 flex justify-center items-center group hover:bg-gray-800/50 transition-colors"
        >
            <div className="h-full w-0.5 bg-broadcast-green opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>
      </div>

      {/* Main Control Area */}
      <div className="flex-1 flex flex-col min-w-[500px]">
        {/* Top Status Bar */}
        <div className="h-16 border-b border-broadcast-border flex items-center px-6 justify-between bg-broadcast-panel">
          <div className="flex items-center gap-4">
             <div className={`w-3 h-3 rounded-full ${status === ItemStatus.RUNNING ? 'bg-broadcast-red animate-pulse' : 'bg-gray-600'}`}></div>
             <span className="font-mono text-sm text-gray-400 uppercase tracking-widest">
               {status === ItemStatus.RUNNING ? 'NO AR' : 'PARADO'}
             </span>
             {eventName && (
                 <span className="bg-gray-800 text-white px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border border-gray-600">
                    {eventName}
                 </span>
             )}
          </div>
          
          <div className="flex items-center gap-4">
             <button onClick={toggleAutoAdvance} className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-mono transition border ${autoAdvance ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
               <Repeat size={14} className={autoAdvance ? 'animate-spin-slow' : ''}/> AUTO PRÓXIMO
             </button>
             <button onClick={toggleTimerDirection} className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded text-xs font-mono text-gray-300 hover:bg-gray-700 transition">
               {timerDirection === 'DESC' ? <ArrowDown size={14} /> : <ArrowUp size={14} />} {timerDirection === 'DESC' ? 'DECRESCENTE' : 'CRESCENTE'}
             </button>
             <div className="font-mono text-xl text-white">{new Date().toLocaleTimeString()}</div>
          </div>
        </div>

        {/* Big Timer Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 relative min-h-[300px]">
          <div className="absolute top-8 text-center w-full">
            <h1 className="text-3xl font-bold text-gray-200 mb-2">{activeItem?.title || "CRONOGRAMA DO CULTO"}</h1>
            <h3 className="text-xl text-broadcast-green">{activeItem?.speaker}</h3>
          </div>
          <div className="w-full max-w-4xl">
            <TimerDisplay size="large" showProgressBar={true} />
          </div>
          <div className="flex gap-4 mt-12">
            {status === ItemStatus.RUNNING ? (
               <button aria-label="Pausar contagem" title="Pausar contagem" onClick={pauseItem} className="w-24 h-24 rounded-full bg-yellow-600 hover:bg-yellow-500 flex items-center justify-center transition shadow-[0_0_20px_rgba(234,179,8,0.3)]"><Pause size={40} fill="white" /></button>
            ) : status === ItemStatus.PAUSED ? (
              <button aria-label="Retomar contagem" title="Retomar contagem" onClick={resumeItem} className="w-24 h-24 rounded-full bg-broadcast-green hover:bg-green-500 flex items-center justify-center transition shadow-[0_0_20px_rgba(0,255,0,0.3)]"><Play size={40} fill="white" className="ml-1"/></button>
            ) : (
              <button aria-label="Iniciar contagem" title="Iniciar contagem" disabled={items.length === 0} onClick={() => { const id = activeItemId || items[0]?.id; if (id) playItem(id); }} className="w-24 h-24 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition disabled:opacity-50"><Play size={40} fill="white" className="ml-1"/></button>
            )}
            <button aria-label="Parar contagem" title="Parar contagem" onClick={stopItem} className="w-24 h-24 rounded-full bg-broadcast-red hover:bg-red-500 flex items-center justify-center transition shadow-[0_0_20px_rgba(255,0,0,0.3)]"><Square size={36} fill="white" /></button>
            <button aria-label="Próximo item" title="Próximo item" onClick={nextItem} className="w-24 h-24 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-600 flex items-center justify-center transition group"><SkipForward size={36} className="group-hover:text-broadcast-green transition-colors"/></button>
          </div>
        </div>

        {/* DRAG HANDLE (NOTES) */}
        <div 
           onMouseDown={startNotesResize}
           className="h-2 bg-gray-900 border-t border-b border-gray-800 cursor-row-resize hover:bg-gray-800 transition-colors flex justify-center items-center group z-40"
        >
             <div className="w-16 h-1 rounded bg-gray-700 group-hover:bg-broadcast-green transition-colors"></div>
        </div>

        {/* Notes Area (Resizable Height) */}
        <div style={{ height: notesHeight }} className="bg-black p-6 flex-shrink-0 relative overflow-hidden">
           <div className="flex items-center gap-2 mb-2 text-yellow-500"><AlertCircle size={16} /><span className="text-xs uppercase font-bold tracking-wider">Notas Gerais</span></div>
           <div className="h-full overflow-y-auto pb-8">
               <p className="font-mono text-lg text-gray-300">{activeItem?.notes || "Sem notas gerais para este segmento."}</p>
               {activeItem?.teamNotes && Object.values(activeItem.teamNotes).some(n => n) && <div className="mt-2 text-xs text-gray-600">* Existem instruções específicas para núcleos configuradas.</div>}
           </div>
        </div>
      </div>

      {/* --- FLOATING FOOTER INFO --- */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
         <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-xl">
             <button onClick={markServiceEnd} className="p-2 hover:bg-gray-700 rounded-full transition text-gray-300 hover:text-red-500" title="Encerrar Culto (Parar Timer Oficial)"><Square size={20} /></button>
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            
            <button onClick={generatePlanningReport} className="p-2 hover:bg-gray-700 rounded-full transition text-blue-400 hover:text-white flex items-center gap-2" title="Relatório de Planejamento (Pré-Culto)">
               <FileText size={20} />
               <span className="text-xs font-bold uppercase hidden md:inline">Planejamento</span>
            </button>

            <button onClick={generateReport} className="p-2 hover:bg-gray-700 rounded-full transition text-broadcast-green hover:text-white flex items-center gap-2" title="Relatório de Culto (Pós-Culto)">
               <ClipboardList size={20} />
               <span className="text-xs font-bold uppercase hidden md:inline">Relatório</span>
            </button>
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            <button onClick={handleBackupDownload} className="p-2 hover:bg-gray-700 rounded-full transition text-gray-300 hover:text-white" title="Salvar Backup GLOBAL (Tudo)"><Download size={20} /></button>
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold leading-none">Cód. Evento</span>
              <span className="font-mono font-bold text-xl text-broadcast-green leading-none tracking-wider">{eventId}</span>
            </div>
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            <button onClick={() => setShowQRModal(true)} className="p-2 hover:bg-gray-700 rounded-full transition text-gray-300 hover:text-white" title="Mostrar QR Code"><QrCode size={20} /></button>
            <button onClick={handleShare} className="p-2 hover:bg-gray-700 rounded-full transition text-gray-300 hover:text-white" title="Compartilhar Link"><Share2 size={20} /></button>
            
            {/* CLOUD STATUS INDICATOR */}
            <div className="pl-2 border-l border-gray-700 ml-2" title={syncStatus === 'synced' ? 'Sincronizado com os outros dispositivos' : syncError || 'Sincronizando…'}>
                {syncStatus === 'synced' ? <Cloud size={16} className="text-green-500" /> : <CloudOff size={16} className="text-yellow-500" />}
            </div>
         </div>
      </div>

    </div>
  );
};

export default AdminPage;
