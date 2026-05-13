import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PlatformCard } from '../components/PlatformCard';
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
      if (response.success) {
        setData(response.data);
      } else {
        setError('La API respondió pero indicó un error.');
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
        <h2 className="text-xl font-semibold text-gray-800">Resumen General</h2>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PlatformCard 
              title="Docines" 
              stats={data.docines} 
              colorTheme="blue"
            />
            <PlatformCard 
              title="Plusmovie" 
              stats={data.plusmovie} 
              colorTheme="purple"
            />
            <PlatformCard 
              title="Dooplex" 
              stats={data.dooplex} 
              colorTheme="emerald"
            />
          </div>

          <DashboardChart data={data} />
        </div>
      ) : null}
    </div>
  );
}
