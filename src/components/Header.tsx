import { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, LogOut, User as UserIcon, Menu, Settings, ListFilter, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const Header = () => {
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 z-20 relative">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="md:hidden p-2 text-gray-500 hover:text-gray-700 focus:outline-none">
              <Menu className="h-6 w-6" />
            </button>
            <LayoutDashboard className="h-8 w-8 text-blue-600 hidden sm:block" />
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          </div>
          
          {user && (
            <div className="relative" ref={dropdownRef}>
              {/* Botón de Perfil con Avatar */}
              <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                aria-expanded={isOpen}
                aria-haspopup="true"
              >
                <div className="text-right hidden sm:block">
                  <span className="text-sm font-medium text-gray-700 block leading-tight">
                    {user.username}
                  </span>
                  {user.role && (
                    <span className="text-xs text-gray-400 capitalize">
                      {user.role}
                    </span>
                  )}
                </div>

                {/* Avatar circular con ilustración */}
                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center ring-2 ring-gray-100 shadow-sm flex-shrink-0">
                  <svg
                    className="w-full h-full text-slate-600"
                    viewBox="0 0 128 128"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="64" cy="64" r="64" fill="#E2E8F0" />
                    {/* Cabeza / Rostro */}
                    <circle cx="64" cy="52" r="22" fill="#FCA5A5" />
                    {/* Cabello */}
                    <path
                      d="M42 46C42 33.85 51.85 24 64 24C76.15 24 86 33.85 86 46C86 49.5 84.5 53 82 55C80 47 75 42 64 42C53 42 48 47 46 55C43.5 53 42 49.5 42 46Z"
                      fill="#1E293B"
                    />
                    {/* Cuerpo / Ropa */}
                    <path
                      d="M28 108C28 88.12 44.12 72 64 72C83.88 72 100 88.12 100 108C100 115 94 128 64 128C34 128 28 115 28 108Z"
                      fill="#3B4972"
                    />
                  </svg>
                </div>

                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-200 hidden sm:block ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Menú Desplegable (Dropdown) */}
              {isOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Encabezado en móvil */}
                  <div className="px-4 py-2 border-b border-gray-100 sm:hidden">
                    <p className="text-sm font-semibold text-gray-800">{user.username}</p>
                    <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                  </div>

                  {/* Opciones del menú */}
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
                    >
                      <UserIcon className="h-4 w-4 text-gray-400" />
                      <span>Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
                    >
                      <Settings className="h-4 w-4 text-gray-400" />
                      <span>Settings</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-left"
                    >
                      <ListFilter className="h-4 w-4 text-gray-400" />
                      <span>Activity Log</span>
                    </button>
                  </div>

                  {/* Separador */}
                  <div className="border-t border-gray-100 my-1" />

                  {/* Logout */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left font-medium"
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
