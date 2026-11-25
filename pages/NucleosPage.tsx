
import React, { useState, useEffect } from 'react';
import { useEvent } from '../context/EventContext';
import TimerDisplay from '../components/TimerDisplay';
import { ItemStatus, TeamRole } from '../types';
import { 
  AlertTriangle, Projector, Lightbulb, Radio, Mic2, 
  Music, User, Users, MoreHorizontal, ArrowLeft, PlusCircle, Megaphone,
  ArrowDownCircle
} from 'lucide-react';

const NucleosPage: React.FC = () => {
  const { items, activeItemId, status, customRoles, messages, roster, targetEndTime, conferenceLogo } = useEvent();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // Estado para forçar atualização a cada segundo
  
  const activeItem = items.find(i => i.id === activeItemId);
  
  // Find generic next item for standard display
  const activeIndex = items.findIndex(i => i.id === activeItemId);
  const genericNextItem = (activeIndex !== -1 && activeIndex < items.length - 1) ? items[activeIndex + 1] : null;
  
  // Icons map - Default Roles
  const teamIcons: Record<string, React.ReactNode> = {
    [TeamRole.PROJECAO]: <Projector size={32} />,
    [TeamRole.ILUMINACAO]: <Lightbulb size={32} />,
    [TeamRole.TRANSMISSAO]: <Radio size={32} />,
    [TeamRole.SOM]: <Mic2 size={32} />,
    [TeamRole.DANCA]: <Users size={32} />,
    [TeamRole.LOUVOR]: <Music size={32} />,
    [TeamRole.MC]: <User size={32} />,
    [TeamRole.PRELETOR]: <User size={32} />,
    [TeamRole.OUTROS]: <MoreHorizontal size={32} />,
  };

  // Helper to get icon
  const getIcon = (role: string) => {
    if (teamIcons[role]) return teamIcons[role];
    return <PlusCircle size={32} />; // Icon for custom roles
  };

  const allRoles = [...Object.values(TeamRole), ...customRoles];

  // Specific Note for the selected team (CASE INSENSITIVE CHECK)
  const getTeamNote = (notes: Record<string, string> | undefined, role: string | null) => {
      if (!notes || !role) return null;
      // 1. Exact match
      if (notes[role]) return notes[role];
      // 2. Case insensitive match
      const key = Object.keys(notes).find(k => k.toUpperCase() === role.toUpperCase());
      return key ? notes[key] : null;
  };

  const currentTeamNote = getTeamNote(activeItem?.teamNotes, selectedTeam);
  const hasAction = !!currentTeamNote;

  // Filter Active Messages for this team
  const activeAlerts = messages?.filter(msg => 
    msg.targetRoles.includes('ALL') || (selectedTeam && msg.targetRoles.includes(selectedTeam))
  );

  // Get Volunteer Name
  const volunteerName = selectedTeam ? roster?.nucleos?.[selectedTeam] : '';

  // EFEITO DE TICKER (1 SEGUNDO) - GARANTINDO ATUALIZAÇÃO EM TEMPO REAL
  useEffect(() => {
    const interval = setInterval(() => {
        setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // --- SPECIAL LOGIC FOR PRELETOR & MC ---
  // Calculates next speaker and time until entry
  const [nextSpeakerData, setNextSpeakerData] = useState<{name: string, activity: string, secondsUntil: number, label: string} | null>(null);
  
  useEffect(() => {
    let targetFlag: 'isPreaching' | 'isMC' | null = null;
    let label = "";

    // Identificar qual flag buscar baseado no time selecionado
    if (selectedTeam === TeamRole.PRELETOR || selectedTeam === 'PRELETOR') {
        targetFlag = 'isPreaching';
        label = "PRÓXIMO PRELETOR";
    } else if (selectedTeam === TeamRole.MC || selectedTeam === 'MESTRE DE CERIMÔNIAS') {
        targetFlag = 'isMC';
        label = "SUA PRÓXIMA ENTRADA";
    }

    if (targetFlag) {
        const activeIdx = items.findIndex(i => i.id === activeItemId);
        
        // Find next item marked with the flag
        const upcomingIdx = items.findIndex((item, idx) => idx > activeIdx && item[targetFlag!]);
        
        if (upcomingIdx !== -1) {
            const upcoming = items[upcomingIdx];
            let seconds = 0;

            // 1. Remaining time of current item
            if (activeItem) {
                if (status === ItemStatus.RUNNING && targetEndTime) {
                    seconds += Math.max(0, (targetEndTime - Date.now()) / 1000);
                } else if (status === ItemStatus.PAUSED && activeItem) {
                     seconds += activeItem.durationSeconds; 
                } else if (status === ItemStatus.IDLE) {
                     seconds += activeItem.durationSeconds;
                }
            }

            // 2. Sum durations of items between active and target
            for (let i = activeIdx + 1; i < upcomingIdx; i++) {
                seconds += items[i].durationSeconds;
            }

            setNextSpeakerData({
                name: upcoming.speaker || (targetFlag === 'isMC' ? 'VOCÊ' : 'PRELETOR'),
                activity: upcoming.title,
                secondsUntil: Math.floor(seconds), // Ensure integer
                label: label
            });
        } else {
            setNextSpeakerData(null);
        }
    } else {
        setNextSpeakerData(null);
    }
  }, [items, activeItemId, status, targetEndTime, selectedTeam, tick]); // Adicionado 'tick' para recalcular a cada segundo

  // Format Helper for Speaker Timer (Matches image: "9 min 42 s")
  const formatSeconds = (sec: number) => {
     const m = Math.floor(sec / 60);
     const s = Math.floor(sec % 60);
     return `${m} min ${s} s`;
  };

  // --- SELECTION SCREEN ---
  if (!selectedTeam) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center">
        {conferenceLogo && (
             <div className="mb-6 max-h-20 max-w-xs">
                 <img src={conferenceLogo} alt="Conference Logo" className="max-h-20 object-contain" />
             </div>
        )}
        <h1 className="text-3xl font-bold font-sans mb-2 text-brand-red uppercase tracking-widest text-center">
          Selecione seu Núcleo
        </h1>
        <p className="text-gray-500 mb-12 font-mono">Painel de Backstage</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {allRoles.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedTeam(role)}
              className="bg-gray-900 border border-gray-800 hover:bg-gray-800 hover:border-brand-red group p-8 rounded-xl flex flex-col items-center gap-4 transition-all"
            >
              <div className="text-gray-400 group-hover:text-brand-red transition-colors">
                {getIcon(role)}
              </div>
              <span className="font-bold font-mono text-sm md:text-base uppercase tracking-wider text-center">
                {role}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- DASHBOARD SCREEN ---
  return (
    <div className={`h-screen flex flex-col relative overflow-hidden transition-colors duration-700 ease-in-out ${hasAction ? 'bg-[#2a0a0a] text-red-50' : 'bg-black text-gray-200'}`}>
      
      {/* Background overlay for texture - Only visible on Action */}
      <div className={`absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_#ff000040,_transparent)] transition-opacity duration-700 ${hasAction ? 'opacity-100' : 'opacity-0'}`}></div>

      {/* --- ALERT OVERLAY (MESSAGES) --- Z-INDEX HIGH - TOP 0 */}
      {activeAlerts && activeAlerts.length > 0 && (
          <div className="fixed top-0 left-0 w-full z-[200] px-4 flex flex-col gap-2 items-center pointer-events-auto bg-black/50 backdrop-blur-sm pt-4 pb-4">
             {activeAlerts.map(msg => (
                <div key={msg.id} className="bg-white text-black border-4 border-red-600 px-8 py-4 rounded-xl shadow-2xl animate-pulse flex flex-col items-center gap-2 max-w-4xl w-full justify-center transform translate-y-2">
                    <div className="flex items-center gap-3">
                        <Megaphone size={32} className="text-red-600" />
                        {volunteerName && (
                            <span className="font-bold text-red-600 uppercase text-lg">{volunteerName}:</span>
                        )}
                    </div>
                    <div className="text-2xl font-black uppercase tracking-wide text-center leading-none break-words max-w-full">
                        {msg.text}
                    </div>
                </div>
             ))}
          </div>
      )}

      {/* Header */}
      <div className={`p-6 border-b flex justify-between items-center z-10 backdrop-blur-md transition-colors duration-700 shrink-0 ${hasAction ? 'border-red-900/50 bg-red-950/30' : 'border-gray-800 bg-gray-900/50'}`}>
        <div className="flex items-center gap-4">
           <button onClick={() => setSelectedTeam(null)} className="p-2 hover:bg-white/10 rounded-full transition"><ArrowLeft /></button>
           <div>
              <h2 className={`text-xl font-bold uppercase tracking-wider ${hasAction ? 'text-red-200' : 'text-gray-200'}`}>{selectedTeam}</h2>
              {volunteerName && <div className={`text-xs font-mono uppercase ${hasAction ? 'text-red-300' : 'text-gray-500'}`}>{volunteerName}</div>}
           </div>
        </div>
        <div className="flex items-center gap-3">
           <div className={`w-3 h-3 rounded-full ${status === ItemStatus.RUNNING ? 'bg-red-600 animate-pulse shadow-[0_0_10px_red]' : 'bg-gray-600'}`}></div>
           <span className="font-mono text-sm uppercase">{status === ItemStatus.RUNNING ? 'NO AR' : 'PARADO'}</span>
        </div>
      </div>

      {/* Main Content Centered with Automatic Adjustment */}
      <div className="flex-1 p-4 md:p-6 flex flex-col justify-center items-center z-10 w-full max-w-[96%] mx-auto space-y-2 md:space-y-4 pb-40 overflow-hidden">
        
        {/* AREA SUPERIOR: NOTAS E CARDS ESPECÍFICOS */}
        <div className="w-full space-y-4 flex flex-col items-center shrink-0">
            
            {/* 1A. BLUE CARD (PRELETOR / MC) - MOVED TO TOP - CLEAN STYLE */}
            {nextSpeakerData && (
                <div className="bg-blue-900/90 border-2 border-blue-500 p-4 md:p-6 rounded-2xl shadow-xl backdrop-blur-md w-full animate-fade-in relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 text-center md:text-left">
                            <div className="bg-blue-600 p-3 rounded-full text-white hidden md:block">
                                {selectedTeam === TeamRole.MC ? <Mic2 size={32} /> : <User size={32} />}
                            </div>
                            <div>
                                <div className="text-sm text-blue-300 uppercase font-bold tracking-widest mb-1">{nextSpeakerData.label}</div>
                                <div className="text-2xl md:text-3xl font-black text-white uppercase leading-none break-words max-w-full">{nextSpeakerData.name}</div>
                                <div className="text-base text-gray-300 mt-1 uppercase font-bold break-words max-w-full">{nextSpeakerData.activity}</div>
                            </div>
                        </div>
                        <div className="text-center md:text-right bg-blue-950/50 p-3 rounded-xl border border-blue-800">
                            <div className="text-[10px] text-blue-300 uppercase font-bold mb-1">ENTRA EM APROX.</div>
                            <div className="text-4xl md:text-5xl font-mono font-bold text-white tabular-nums tracking-tighter shadow-blue-glow">
                                {formatSeconds(nextSpeakerData.secondsUntil)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 1B. YELLOW INSTRUCTION CARD - CLEAN STYLE */}
            {hasAction && (
            <div className="bg-yellow-500 text-black p-4 md:p-8 rounded-2xl shadow-xl border-2 border-black animate-fade-in w-full text-center relative overflow-hidden shrink-0">
                <div className="flex items-center justify-center gap-3 mb-2 text-black/80">
                    <AlertTriangle size={24} className="animate-bounce" />
                    <span className="font-black text-sm md:text-base uppercase tracking-widest">
                        {volunteerName ? `${volunteerName}, ATENÇÃO:` : 'AÇÃO NECESSÁRIA'}
                    </span>
                </div>
                
                <p className="text-xl md:text-4xl font-black uppercase leading-tight tracking-tight break-words max-w-full">
                    {currentTeamNote}
                </p>
            </div>
            )}

            {/* 1C. STANDBY MESSAGE */}
            {!hasAction && !nextSpeakerData && (
            <div className="opacity-20 text-center py-2 shrink-0">
                <p className="text-sm font-mono uppercase tracking-[0.2em] text-gray-500">
                    {volunteerName ? `${volunteerName}, ` : ''}SEM ATIVIDADE DE ATENÇÃO PRA VOCÊ AGORA!
                </p>
            </div>
            )}
        </div>

        {/* 2. ITEM TITLE & SPEAKER - Allow shrinking */}
        <div className="text-center space-y-2 py-2 shrink flex flex-col justify-center min-h-0 w-full px-4">
            <h3 className={`text-3xl md:text-6xl font-black uppercase tracking-tight leading-none break-words max-w-full ${hasAction ? 'text-white' : 'text-gray-100'}`}>
                {activeItem?.title || "AGUARDANDO INÍCIO"}
            </h3>
            <p className={`text-lg md:text-2xl font-bold uppercase tracking-widest break-words max-w-full ${hasAction ? 'text-red-300' : 'text-brand-red'}`}>
                {activeItem?.speaker}
            </p>
        </div>

        {/* 3. TIMER (BIG) - Adjusted Scaling */}
        <div className={`transition-transform duration-500 w-full flex justify-center ${hasAction || nextSpeakerData ? 'opacity-90' : 'opacity-100'} flex-1 min-h-0 items-center`}>
            <TimerDisplay size="massive" minimal={true} />
        </div>

      </div>

      {/* --- BOTTOM SECTION: NEXT INFO (FIXED FOOTER FOR EVERYONE) --- */}
      <div className="absolute bottom-0 left-0 w-full z-20">
          
          {/* GENERIC NEXT ITEM FOR EVERYONE */}
          {genericNextItem && (
               <div className="w-full bg-gray-900 border-t border-gray-800 p-4 flex items-center justify-center gap-4 opacity-80 backdrop-blur-md">
                   <div className="flex items-center gap-2 text-gray-500 uppercase font-bold text-xs tracking-widest flex-shrink-0">
                       <ArrowDownCircle size={16} /> A SEGUIR:
                   </div>
                   <div className="text-lg text-white font-bold uppercase truncate max-w-2xl flex items-center gap-2">
                       <span className="truncate">{genericNextItem.title}</span>
                       <span className="text-gray-600">•</span> 
                       <span className="text-gray-400 truncate">{genericNextItem.speaker}</span>
                   </div>
               </div>
          )}
          
          {/* Footer Info */}
          <div className="p-2 border-t border-gray-900/50 bg-black text-center text-[10px] text-gray-600 uppercase tracking-widest">
             Cronograma em Tempo Real • {selectedTeam}
          </div>
      </div>
    </div>
  );
};

export default NucleosPage;
