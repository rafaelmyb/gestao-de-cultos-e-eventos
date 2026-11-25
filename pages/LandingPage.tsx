
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateEventId, getEventRef, testConnection } from '../services/database';
import { Mic2, PlusCircle, ArrowRight, Lock, UploadCloud, Save, Users, Settings, ScanLine, X, ToggleLeft, ToggleRight, Hash, Database } from 'lucide-react';

// Declarando html5-qrcode globalmente (carregado via script tag no index.html)
declare const Html5QrcodeScanner: any;

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  
  // View Modes: 'HOME' | 'ORGANIZER' | 'VOLUNTEER'
  const [viewMode, setViewMode] = useState<'HOME' | 'ORGANIZER' | 'VOLUNTEER'>('HOME');

  const [inputEventId, setInputEventId] = useState('');
  
  // Create Form State
  const [newEventName, setNewEventName] = useState('');
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Custom ID State
  const [useCustomId, setUseCustomId] = useState(false);
  const [customEventId, setCustomEventId] = useState('');

  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showScanner && !scannerRef.current) {
        // Initialize Scanner
        setTimeout(() => {
            const onScanSuccess = (decodedText: string, decodedResult: any) => {
                // Handle scanned text
                console.log(`Code matched = ${decodedText}`, decodedResult);
                
                // Limpar scanner
                if (scannerRef.current) {
                    scannerRef.current.clear().catch((error: any) => console.error("Failed to clear html5-qrcode scanner. ", error));
                    scannerRef.current = null;
                }
                setShowScanner(false);

                // Check if it's a URL or just ID
                let eventIdToUse = decodedText;
                if (decodedText.includes('/nucleos/')) {
                    const parts = decodedText.split('/nucleos/');
                    if (parts.length > 1) {
                        eventIdToUse = parts[1].split('/')[0]; // Handle trailing slashes or params
                    }
                } else if (decodedText.includes('/admin/')) {
                    const parts = decodedText.split('/admin/');
                     if (parts.length > 1) {
                        eventIdToUse = parts[1].split('/')[0];
                    }
                }

                // Clean ID
                eventIdToUse = eventIdToUse.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
                
                if (eventIdToUse) {
                    navigate(`/nucleos/${eventIdToUse}`);
                } else {
                    alert("Código QR inválido ou não reconhecido.");
                }
            };

            const onScanFailure = (error: any) => {
                // handle scan failure
            };

            try {
                const html5QrcodeScanner = new Html5QrcodeScanner(
                    "reader",
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    /* verbose= */ false);
                html5QrcodeScanner.render(onScanSuccess, onScanFailure);
                scannerRef.current = html5QrcodeScanner;
            } catch (e) {
                console.error("Error starting scanner", e);
                alert("Erro ao iniciar câmera. Verifique permissões.");
                setShowScanner(false);
            }
        }, 100);
    }

    return () => {
        if (scannerRef.current) {
             scannerRef.current.clear().catch((e:any) => console.log(e));
             scannerRef.current = null;
        }
    };
  }, [showScanner, navigate]);

  const closeScanner = () => {
      if (scannerRef.current) {
          scannerRef.current.clear().catch((e:any) => console.log(e));
          scannerRef.current = null;
      }
      setShowScanner(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalId = generateEventId();

    if (useCustomId && customEventId.trim()) {
        const sanitized = customEventId.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
        if (sanitized.length < 3) {
            setError('O código personalizado deve ter pelo menos 3 caracteres.');
            return;
        }
        finalId = sanitized;
    }

    // Pre-initialize event in DB with name (Async)
    await getEventRef(finalId).createIfNotExists(newEventName || 'Culto Especial');
    
    navigate(`/admin/${finalId}`);
  };

  const handleJoinAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputEventId.trim().length > 0) {
      navigate(`/admin/${inputEventId.toUpperCase()}`);
    }
  };

  const handleJoinVolunteer = (e: React.FormEvent) => {
      e.preventDefault();
      if (inputEventId.trim().length > 0) {
        navigate(`/nucleos/${inputEventId.toUpperCase()}`);
      }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = event.target?.result as string;
          const backupData = JSON.parse(json);
          

          const finalId = backupData.id || generateEventId();
          const dbRef = getEventRef(finalId);
          // Substituir createIfNotExists + set por overwrite
          await dbRef.overwrite(backupData); 

          navigate(`/admin/${finalId}`);
        } catch (err) {
          console.error(err);
          alert("Erro ao ler arquivo de backup.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleTestConnection = async () => {
      const result = await testConnection();
      if (result.success) {
          alert(`✅ Conexão com Supabase: SUCESSO!\n${result.message}`);
      } else {
          alert(`❌ Falha na conexão:\n${result.message}`);
      }
  };

  // --- HOME VIEW ---
  if (viewMode === 'HOME') {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 to-black overflow-hidden">
            
            {/* CABEÇALHO EM TEXTO - ZOOM IN EFFECT */}
            <div className="text-center mb-16 animate-zoom-in opacity-0">
                <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-brand-red mb-2 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">
                    IGREJA SANTA GERAÇÃO
                </h1>
                <p className="text-gray-500 font-mono text-sm md:text-base tracking-[0.2em] uppercase">
                    Gestão de Cultos e Eventos
                </p>
            </div>

            {/* BUTTONS - SLIDE UP EFFECT */}
            <div 
              className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl animate-slide-up opacity-0"
              style={{ animationDelay: '0.3s' }}
            >
                {/* Card Organizador */}
                <button 
                    onClick={() => setViewMode('ORGANIZER')}
                    className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-brand-red p-10 rounded-2xl flex flex-col items-center gap-6 group transition-all transform hover:-translate-y-2 shadow-2xl"
                >
                    <div className="bg-gray-800 p-6 rounded-full group-hover:bg-brand-red group-hover:text-white transition-colors">
                        <Settings size={48} />
                    </div>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold uppercase tracking-widest mb-2">Sou Organizador</h2>
                        <p className="text-gray-500 font-mono text-sm">Criar eventos, gerenciar cronograma e backup.</p>
                    </div>
                </button>

                {/* Card Voluntário */}
                <button 
                    onClick={() => setViewMode('VOLUNTEER')}
                    className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-yellow-500 p-10 rounded-2xl flex flex-col items-center gap-6 group transition-all transform hover:-translate-y-2 shadow-2xl"
                >
                    <div className="bg-gray-800 p-6 rounded-full group-hover:bg-yellow-500 group-hover:text-black transition-colors">
                        <Users size={48} />
                    </div>
                    <div className="text-center">
                        <h2 className="text-2xl font-bold uppercase tracking-widest mb-2">Sou Voluntário</h2>
                        <p className="text-gray-500 font-mono text-sm">Acesso a escala, núcleos e instruções.</p>
                    </div>
                </button>
            </div>

            <div className="mt-16 text-gray-700 text-xs font-mono uppercase tracking-widest animate-fade-in" style={{ animationDelay: '0.8s' }}>
                Copyright Igreja Santa Geração - Geração Holy
            </div>
        </div>
      );
  }

  // --- ORGANIZER VIEW ---
  if (viewMode === 'ORGANIZER') {
    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative animate-fade-in">
           <button onClick={() => setViewMode('HOME')} className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-white uppercase font-bold text-xs tracking-widest">
                <ArrowRight className="rotate-180" size={16} /> Voltar
           </button>

           <div className="w-full max-w-md space-y-6">
                <div className="text-center mb-8">
                    <Settings size={48} className="mx-auto text-brand-red mb-4" />
                    <h2 className="text-3xl font-bold uppercase">Área do Organizador</h2>
                </div>

                {!showCreateForm ? (
                    <div className="space-y-4">
                        <button 
                        onClick={() => setShowCreateForm(true)}
                        className="w-full bg-brand-red hover:bg-red-500 text-white p-6 rounded-2xl flex items-center justify-between group transition-all shadow-lg"
                        >
                            <div className="text-left">
                                <h2 className="text-xl font-bold uppercase tracking-wide">Criar Novo Evento</h2>
                                <p className="text-red-200 font-mono text-xs opacity-80">Painel Administrativo</p>
                            </div>
                            <PlusCircle size={24} />
                        </button>
                        
                        <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-gray-300 p-4 rounded-xl flex items-center justify-center gap-2 border border-gray-700 transition"
                        >
                        <UploadCloud size={20} />
                        <span>Restaurar Backup</span>
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleRestoreBackup} accept=".json" className="hidden" />

                        {/* TESTE DE CONEXÃO SUPABASE */}
                        <button 
                            onClick={handleTestConnection}
                            className="w-full text-xs font-bold uppercase text-gray-600 hover:text-green-500 border border-gray-800 hover:border-green-900 p-3 rounded-lg flex items-center justify-center gap-2 transition"
                        >
                            <Database size={14} />
                            Testar Conexão Cloud
                        </button>

                        {/* Login Existing Admin */}
                        <div className="pt-4 border-t border-gray-800 mt-4">
                             <p className="text-gray-500 text-xs text-center mb-2 uppercase font-bold">Já tem um evento?</p>
                             <form onSubmit={handleJoinAdmin} className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={inputEventId}
                                    onChange={(e) => setInputEventId(e.target.value.toUpperCase())}
                                    placeholder="CÓDIGO ADMIN"
                                    className="flex-1 bg-gray-900 border border-gray-700 text-white p-3 rounded-lg font-mono text-center uppercase tracking-widest focus:border-brand-red outline-none"
                                />
                                <button type="submit" className="bg-gray-800 hover:bg-white hover:text-black px-4 rounded-lg">
                                    <ArrowRight />
                                </button>
                             </form>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleCreateSubmit} className="bg-gray-900 p-6 rounded-2xl border border-gray-700 animate-fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Novo Evento</h2>
                            <button type="button" onClick={() => setShowCreateForm(false)} className="text-gray-500 hover:text-white text-sm"><X size={16}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 uppercase mb-1 font-bold">Nome</label>
                                <input required value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="Ex: Culto Domingo" className="w-full bg-black border border-gray-700 p-3 rounded text-white focus:border-brand-red outline-none" />
                            </div>
                            
                            {/* Custom ID Toggle */}
                            <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
                                <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setUseCustomId(!useCustomId)}>
                                    <span className="text-xs text-gray-300 uppercase font-bold flex items-center gap-2">
                                        <Hash size={12} className="text-brand-red"/> Definir Código Personalizado?
                                    </span>
                                    {useCustomId ? <ToggleRight size={24} className="text-brand-red"/> : <ToggleLeft size={24} className="text-gray-500"/>}
                                </div>
                                
                                {useCustomId && (
                                    <div className="animate-fade-in">
                                        <input 
                                            value={customEventId} 
                                            onChange={e => setCustomEventId(e.target.value.toUpperCase().replace(/\s/g, '-'))} 
                                            placeholder="EX: CULTO-JOVEM" 
                                            className="w-full bg-black border border-gray-600 p-3 rounded text-white focus:border-brand-red outline-none text-center font-mono uppercase tracking-wider" 
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1 text-center">Será usado como link de acesso.</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 uppercase mb-1 font-bold flex items-center gap-1"><Lock size={12}/> Senha</label>
                                <p className="text-sm text-green-400">Sessão autenticada</p>
                            </div>
                            {error && <p className="text-red-500 text-sm font-mono">{error}</p>}
                            <button type="submit" className="w-full bg-brand-red text-white font-bold py-3 rounded hover:bg-red-500 transition">INICIAR</button>
                        </div>
                    </form>
                )}
           </div>
        </div>
    );
  }

  // --- VOLUNTEER VIEW ---
  if (viewMode === 'VOLUNTEER') {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative animate-fade-in">
           <button onClick={() => setViewMode('HOME')} className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-white uppercase font-bold text-xs tracking-widest">
                <ArrowRight className="rotate-180" size={16} /> Voltar
           </button>

           <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <Users size={48} className="mx-auto text-yellow-500 mb-4" />
                    <h2 className="text-3xl font-bold uppercase">Área do Voluntário</h2>
                    <p className="text-gray-500 mt-2 font-mono text-sm">Acesse as instruções do seu núcleo.</p>
                </div>

                {showScanner ? (
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 flex flex-col items-center">
                        <div id="reader" className="w-full bg-black rounded overflow-hidden"></div>
                        <p className="text-xs text-gray-500 mt-2 uppercase font-bold text-center">Aponte para o QR Code do Admin</p>
                        <button onClick={closeScanner} className="mt-4 text-red-500 hover:text-red-400 uppercase text-xs font-bold border border-red-900 px-4 py-2 rounded">Cancelar Leitura</button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                             <label className="text-gray-400 text-xs font-mono uppercase font-bold mb-2 block">Código do Evento</label>
                             <form onSubmit={handleJoinVolunteer} className="flex flex-col gap-4">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={inputEventId}
                                        onChange={(e) => setInputEventId(e.target.value.toUpperCase())}
                                        placeholder="EX: A1B2C"
                                        className="flex-1 bg-black border border-gray-700 text-white p-4 rounded-lg font-mono text-xl text-center uppercase tracking-widest focus:border-yellow-500 outline-none"
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={!inputEventId}
                                    className="w-full bg-white hover:bg-gray-200 text-black font-bold py-4 rounded-lg transition uppercase tracking-wider disabled:opacity-50"
                                >
                                    Entrar
                                </button>
                             </form>
                        </div>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-800"></div>
                            <span className="flex-shrink mx-4 text-gray-600 font-mono text-xs uppercase">OU</span>
                            <div className="flex-grow border-t border-gray-800"></div>
                        </div>

                        <button 
                          onClick={() => setShowScanner(true)}
                          className="w-full bg-gray-900 hover:bg-gray-800 text-yellow-500 border border-gray-700 hover:border-yellow-500 p-4 rounded-xl flex items-center justify-center gap-3 transition-all"
                        >
                            <ScanLine size={24} />
                            <span className="font-bold uppercase tracking-wide">Ler QR Code</span>
                        </button>
                    </div>
                )}
           </div>
        </div>
      );
  }

  return null;
};

export default LandingPage;
