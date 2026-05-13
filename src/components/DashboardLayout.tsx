import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

export const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showStatusPill, setShowStatusPill] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('statusPillSeen') !== '1';
  });

  useEffect(() => {
    if (!showStatusPill) return;

    sessionStorage.setItem('statusPillSeen', '1');
    const timeoutId = window.setTimeout(() => setShowStatusPill(false), 3500);

    return () => window.clearTimeout(timeoutId);
  }, [showStatusPill]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Mobile Header with Menu Toggle */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        </div>
      </div>

      <div className="hidden md:block">
        <Header />
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-50 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          ></div>
        )}

        {/* Sidebar Container */}
        <div className={`
          absolute md:static inset-y-0 left-0 z-30 transform 
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          md:translate-x-0 transition duration-200 ease-in-out
          bg-white md:bg-transparent h-full shadow-lg md:shadow-none
        `}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        <main className="flex-1 overflow-y-auto w-full">
          <Outlet />
        </main>
      </div>

      {showStatusPill && (
        <div className="fixed bottom-6 left-6 z-40">
          <div className="rounded-2xl border border-white/10 bg-gray-950/90 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-gray-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              SISTEMA ACTIVO
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Conectado a Plusmovie, Dooplex &amp; Docines APIs v2.5
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
