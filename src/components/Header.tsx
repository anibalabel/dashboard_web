import { LayoutDashboard, LogOut, User as UserIcon, Menu } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const Header = () => {
  const { user, logout } = useAuthStore();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 z-10 relative">
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-600">
                <UserIcon className="h-5 w-5" />
                <span className="text-sm font-medium hidden sm:block">{user.username}</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold capitalize hidden md:inline-block">
                  {user.role}
                </span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
