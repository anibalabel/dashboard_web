import { Loader2 } from 'lucide-react';

export const LoadingSpinner = () => {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
      <p className="mt-4 text-gray-500 font-medium">Cargando estadísticas...</p>
    </div>
  );
};
