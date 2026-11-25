
import React, { useState } from 'react';
import { useEvent } from '../context/EventContext';
import TimerDisplay from '../components/TimerDisplay';
import { CheckCircle, Play, Pause, SkipForward, Maximize, Lock, Megaphone } from 'lucide-react';
import { ItemStatus } from '../types';

const MobilePage: React.FC = () => {
  const { items, activeItemId, status, playItem, pauseItem, resumeItem, nextItem, eventName, messages, roster } = useEvent();
  const [hasStarted, setHasStarted] = useState(false);
  const activeItem = items.find(i => i.id === activeItemId);

  // Auth State

  // Alerts for Mobile (Admin usually sends to ALL or roles, let's show ALL alerts here)
  const activeAlerts = messages?.filter(msg => msg.targetRoles.includes('ALL'));

  // Manager Name
  const managerName = roster?.gerenteCulto;


  const handleStartFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.log("Error attempting to enable fullscreen:", err);
        });
    }
    setHasStarted(true);
  };

  const handleTogglePlay = () => {
    if (status === ItemStatus.RUNNING) {
      pauseItem();
    } else if (status === ItemStatus.PAUSED) {
      resumeItem();
    } else if (activeItemId) {
      playItem(activeItemId);
    }
  };

  // --- LOGIN SCREEN ---

  // --- FULLSCREEN PROMPT ---
  if (!hasStarted) {
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center cursor-pointer" onClick={handleStartFullScreen}>
            <div className="bg-gray-900 p-8 rounded-full mb-6 animate-pulse">
                <Maximize size={48} className="text-brand-red" />
            </div>
            <h1 className="text-white text-2xl font-bold uppercase tracking-widest mb-2">Modo Controle</h1>
            {eventName && <p className="text-brand-red font-mono mb-2">{eventName}</p>}
            <p className="text-gray-500">Toque para entrar em tela cheia e iniciar o painel APS (Auto Presentation Switcher).</p>
        </div>
    );
  }

  // --- MAIN MOBILE INTERFACE ---
  return (
    <div className="min-h-screen bg-black text-white p-4 pb-24 flex flex-col relative overflow-hidden">
      
      {/* Alert Overlay */}
      {activeAlerts && activeAlerts.length > 0 && (
          <div className="fixed top-0 left-0 w-full z-50 p-2 flex flex-col gap-2 pointer-events-none">
             {activeAlerts.map(msg => (
                <div key={msg.id} className="bg-white text-black border-l-8 border-red-600 px-4 py-3 rounded shadow-xl animate-pulse flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-red-600 font-bold uppercase text-xs">
                        <Megaphone size={16} />
                        {managerName ? `${managerName}:` : 'ALERTA:'}
                    </div>
                    <div className="font-bold uppercase text-sm leading-tight pl-6">
                        {msg.text}
                    </div>
                </div>
             ))}
          </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4 mt-2">
        <div>
           <h1 className="text-xl font-bold font-mono text-brand-red">CHRONOS<span className="text-white">APS</span></h1>
           {eventName && <span className="text-[10px] text-gray-400 uppercase tracking-widest">{eventName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase text-gray-400">{status === 'RUNNING' ? 'NO AR' : 'PARADO'}</span>
          <div className={`w-3 h-3 rounded-full ${status === 'RUNNING' ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`}></div>
        </div>
      </div>

      {/* Active Item Card */}
      <div className="bg-broadcast-panel border border-gray-800 rounded-2xl p-6 mb-6 flex flex-col items-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-red to-blue-600"></div>
        
        <span className="text-xs text-gray-500 uppercase tracking-widest mb-2">Segmento Atual</span>
        <h2 className="text-2xl font-bold text-center mb-1 leading-tight">{activeItem?.title || "Aguardando..."}</h2>
        <p className="text-broadcast-yellow text-lg font-medium mb-6">{activeItem?.speaker}</p>
        
        <div className="bg-black rounded-xl px-6 py-4 w-full flex justify-center border border-gray-800 mb-6">
          <TimerDisplay size="large" />
        </div>

        {/* Action Buttons (APS CONTROL) */}
        <div className="grid grid-cols-2 gap-3 w-full">
           <button 
            onClick={handleTogglePlay}
            disabled={!activeItemId}
            className={`py-6 rounded-xl font-bold text-lg flex flex-col items-center justify-center gap-1 transition-colors border border-gray-700 shadow-lg active:scale-95 transform transition-transform
              ${status === ItemStatus.RUNNING 
                ? 'bg-yellow-900/30 text-yellow-500 active:bg-yellow-800 border-yellow-800' 
                : 'bg-green-900/30 text-green-500 active:bg-green-800 border-green-800'}`}
          >
            {status === ItemStatus.RUNNING ? <Pause size={32}/> : <Play size={32}/>}
            <span className="text-sm uppercase tracking-wider">{status === ItemStatus.RUNNING ? 'Pausar' : 'Iniciar'}</span>
          </button>

          <button 
            onClick={() => nextItem()}
            className="bg-gray-800 active:bg-gray-700 text-white py-6 rounded-xl font-bold text-lg flex flex-col items-center justify-center gap-1 transition-colors border border-gray-700 shadow-lg active:scale-95 transform transition-transform"
          >
            <SkipForward size={32} />
            <span className="text-sm uppercase tracking-wider">Próximo</span>
          </button>
        </div>
      </div>

      {/* Up Next List */}
      <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-4 pl-1">A Seguir</h3>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const isActive = item.id === activeItemId;
          // Simple logic to show context
          if (idx < (items.findIndex(i => i.id === activeItemId) || 0)) return null; 
          if (isActive) return null; // Already shown above

          return (
            <div key={item.id} className="bg-gray-900 p-4 rounded-lg border border-gray-800 flex justify-between items-center opacity-80">
               <div>
                 <div className="font-semibold">{item.title}</div>
                 <div className="text-sm text-gray-500">{item.speaker}</div>
               </div>
               <div className="font-mono text-gray-400 text-sm bg-black px-2 py-1 rounded">
                 {Math.floor(item.durationSeconds / 60)}:{(item.durationSeconds % 60).toString().padStart(2, '0')}
               </div>
            </div>
          )
        })}
        {items.findIndex(i => i.id === activeItemId) === items.length - 1 && (
           <div className="text-center text-gray-600 italic py-4">Fim do Cronograma</div>
        )}
      </div>
    </div>
  );
};

export default MobilePage;