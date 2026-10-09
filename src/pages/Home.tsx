import { useEffect, useState } from 'react';
import { RefreshCw, Film, Tv, Zap } from 'lucide-react';
import { DashboardChart } from '../components/DashboardChart';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { fetchDashboardStats } from '../services/api';
import { DashboardData } from '../types';

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchDashboardStats();
      if (response && response.success && response.data?.dooplex) {
        setData(response.data);
      } else {
        setError(response?.error || 'No se pudieron cargar los datos de Dooplex.');
      }
    } catch {
      setError('Error al cargar los datos del dashboard. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Dooplex</h1>
          <p className="text-sm text-gray-500">Resumen y estado de contenido activo</p>
        </div>
        <button 
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {loading && !data ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={loadData} />
      ) : data ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Películas */}
            <div className="bg-white rounded-xl border border-indigo-100 p-6 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                  Películas
                </span>
                <div className="text-3xl font-extrabold text-gray-900 pt-2">
                  {data.dooplex.movies?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-gray-400">Total en Dooplex</p>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Film className="h-7 w-7" />
              </div>
            </div>

            {/* Series */}
            <div className="bg-white rounded-xl border border-rose-100 p-6 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full">
                  Series
                </span>
                <div className="text-3xl font-extrabold text-gray-900 pt-2">
                  {data.dooplex.series?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-gray-400">Total en Dooplex</p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <Tv className="h-7 w-7" />
              </div>
            </div>

            {/* Animes */}
            <div className="bg-white rounded-xl border border-amber-100 p-6 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full">
                  Animes
                </span>
                <div className="text-3xl font-extrabold text-gray-900 pt-2">
                  {data.dooplex.animes?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-gray-400">Total en Dooplex</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Zap className="h-7 w-7" />
              </div>
            </div>
          </div>

          <DashboardChart data={data} />
        </div>
      ) : null}
    </div>
  );
}
