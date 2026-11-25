
import React, { useState } from 'react';
import { useEvent } from '../context/EventContext';
import TimerDisplay from '../components/TimerDisplay';
import { ItemStatus } from '../types';
import { Maximize2, Megaphone } from 'lucide-react';

const ViewerPage: React.FC = () => {
  const { items, activeItemId, status, messages, conferenceLogo } = useEvent();
  const [hasStarted, setHasStarted] = useState(false);
  
  // Find next item logic
  const currentIndex = items.findIndex(i => i.id === activeItemId);
  const nextItem = (currentIndex !== -1 && currentIndex < items.length - 1) 
    ? items[currentIndex + 1] 
    : null;

  // Filter messages for Viewer
  const activeAlerts = messages?.filter(msg => msg.targetRoles.includes('ALL') || msg.targetRoles.includes('VIEWER'));

  const handleStartFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => {
            console.log("Error attempting to enable fullscreen:", err);
        });
    }
    setHasStarted(true);
  };

  if (!hasStarted) {
    return (
        <div className="fixed inset-0 w-full h-full bg-black flex flex-col items-center justify-center cursor-pointer overflow-hidden" onClick={handleStartFullScreen}>
            <Maximize2 size={64} className="text-gray-500 mb-4 animate-bounce" />
            <h1 className="text-white text-2xl font-mono uppercase tracking-widest">Toque para Iniciar Tela Cheia</h1>
            <p className="text-gray-600 mt-2 text-sm">Modo Projetor</p>
        </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-black flex flex-col items-center justify-center cursor-none relative overflow-hidden">
      
      {/* CONFERENCE LOGO OVERLAY */}
      {conferenceLogo && (
          <div className="absolute top-8 left-0 w-full flex justify-center opacity-90 z-10 pointer-events-none">
              <img src={conferenceLogo} alt="Logo" className="h-24 md:h-32 object-contain shadow-lg" />
          </div>
      )}

      {/* Messages Overlay */}
      {activeAlerts && activeAlerts.length > 0 && (
          <div className="absolute top-40 left-0 w-full z-50 flex flex-col items-center gap-4 px-20">
             {activeAlerts.map(msg => (
                <div key={msg.id} className="bg-red-600 text-white px-12 py-6 rounded-2xl shadow-2xl animate-pulse flex flex-col items-center border-4 border-white">
                    <Megaphone size={48} className="mb-2" />
                    <div className="text-5xl font-black uppercase text-center leading-none">
                        {msg.text}
                    </div>
                </div>
             ))}
          </div>
      )}

      {/* The main event: The Timer - Exclusive Viewer Size */}
      <div className="w-full flex justify-center items-center px-4">
        <TimerDisplay size="viewer" />
      </div>

      {/* Minimal Context Info */}
      <div className="absolute bottom-12 text-center w-full opacity-80 px-8">
        {status === ItemStatus.IDLE ? (
           <h1 className="text-4xl text-white font-sans font-bold tracking-widest uppercase">
             Aguardando Início
           </h1>
        ) : (
          <div className="flex flex-col gap-4">
             {nextItem && (
               <div className="flex items-center justify-center gap-3">
                 <span className="bg-gray-800 text-gray-300 px-3 py-1 text-xl font-mono uppercase rounded">A Seguir</span>
                 <span className="text-2xl text-white font-sans font-semibold tracking-wide">
                   {nextItem.title} {nextItem.speaker && `— ${nextItem.speaker}`}
                 </span>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewerPage;
