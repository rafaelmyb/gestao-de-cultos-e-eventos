import React from 'react';
import { HashRouter, Routes, Route, Link, useLocation, useParams, Navigate } from 'react-router-dom';
import { EventProviderWrapper } from './context/EventContext';
import LandingPage from './pages/LandingPage';
import AdminPage from './pages/AdminPage';
import ViewerPage from './pages/ViewerPage';
import MobilePage from './pages/MobilePage';
import NucleosPage from './pages/NucleosPage';
import { ExternalLink } from 'lucide-react';

// Componente inteligente de Nova Aba
const NewTabButton = () => {
  const [isInIframe, setIsInIframe] = React.useState(false);

  React.useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  const handleOpenNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <button
      id="new-tab-button"
      onClick={handleOpenNewTab}
      title="Abrir em Nova Aba (Modo Tela Cheia)"
      className="fixed top-4 right-4 z-[9999] bg-gray-950/95 border border-gray-700 hover:border-broadcast-green text-gray-400 hover:text-broadcast-green rounded-full p-2.5 flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer transition-all duration-300 group opacity-80 hover:opacity-100"
    >
      <div className="relative flex items-center justify-center">
        <ExternalLink size={18} className="transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
        {isInIframe && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-broadcast-green opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-broadcast-green"></span>
          </span>
        )}
      </div>
      <span className="max-w-0 overflow-hidden group-hover:max-w-[200px] transition-all duration-300 ease-in-out whitespace-nowrap text-[10px] tracking-wider font-mono font-bold text-gray-300 group-hover:pl-2">
        {isInIframe ? "OTIMIZAR EM NOVA ABA" : "ABRIR EM NOVA ABA"}
      </span>
    </button>
  );
};

// Componente de Navegação que entende o contexto atual (eventId)
const Navigation = () => {
  const location = useLocation();
  const params = useParams<{ eventId: string }>(); // Isso só funciona se estiver dentro de Routes? Não, precisa de hook.
  
  // Extração manual de ID da URL já que este componente está fora das rotas filhas
  // Formato HashRouter: #/admin/ID
  const pathParts = location.pathname.split('/');
  const eventId = pathParts[2]; // /admin/ID -> ID is index 2

  const hiddenRoutes = ['/view', '/mobile', '/nucleos', '/'];
  const isHidden = hiddenRoutes.some(route => location.pathname.startsWith(route) && route !== '/');
  
  if (location.pathname === '/') return null;
  if (location.pathname.includes('/view')) return null;
  if (location.pathname.includes('/mobile')) return null;
  if (location.pathname.includes('/nucleos')) return null;

  if (!eventId) return null;

  return (
    <nav className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-full px-6 py-2 flex gap-6 z-50 opacity-20 hover:opacity-100 transition-opacity">
      <Link to="/" className="text-sm font-mono text-gray-400 hover:text-white">HOME</Link>
      <Link to={`/admin/${eventId}`} className={`text-sm font-mono ${location.pathname.includes('/admin') ? 'text-broadcast-green' : 'text-gray-400'}`}>ADMIN</Link>
      <Link to={`/nucleos/${eventId}`} className={`text-sm font-mono ${location.pathname.includes('/nucleos') ? 'text-broadcast-green' : 'text-gray-400'}`}>NÚCLEOS</Link>
      <Link to={`/view/${eventId}`} target="_blank" className={`text-sm font-mono ${location.pathname.includes('/view') ? 'text-broadcast-green' : 'text-gray-400'}`}>VIEWER</Link>
      <Link to={`/mobile/${eventId}`} target="_blank" className={`text-sm font-mono ${location.pathname.includes('/mobile') ? 'text-broadcast-green' : 'text-gray-400'}`}>MOBILE</Link>
    </nav>
  );
}

const App: React.FC = () => {
  return (
    <HashRouter>
      <NewTabButton />
      <Navigation />
      <Routes>
        {/* Rota Raiz - Criar Evento */}
        <Route path="/" element={<LandingPage />} />

        {/* Rotas de Evento Específico (Protegidas pelo Provider) */}
        <Route path="/admin/:eventId" element={
          <EventProviderWrapper>
            <AdminPage />
          </EventProviderWrapper>
        } />
        
        <Route path="/nucleos/:eventId" element={
          <EventProviderWrapper>
            <NucleosPage />
          </EventProviderWrapper>
        } />
        
        <Route path="/view/:eventId" element={
          <EventProviderWrapper>
            <ViewerPage />
          </EventProviderWrapper>
        } />
        
        <Route path="/mobile/:eventId" element={
          <EventProviderWrapper>
            <MobilePage />
          </EventProviderWrapper>
        } />

        {/* Redirecionamentos para erros comuns */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;