import { useEffect } from 'react';
import { useSnackbarStore } from '../store/snackbarStore';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

export default function Snackbar() {
  const { message, type, isOpen, hideSnackbar } = useSnackbarStore();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        hideSnackbar();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hideSnackbar]);

  if (!isOpen) return null;

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-400" />,
    error: <XCircle className="h-5 w-5 text-red-400" />,
    info: <Info className="h-5 w-5 text-blue-400" />
  };

  const bgColors = {
    success: 'bg-gray-800 text-white border-transparent',
    error: 'bg-red-600 text-white border-transparent',
    info: 'bg-blue-600 text-white border-transparent'
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={clsx(
        "flex items-center gap-3 p-4 rounded-lg border shadow-xl max-w-md transition-all duration-300",
        bgColors[type]
      )}>
        {icons[type]}
        <p className="text-sm font-medium flex-1">{message}</p>
        <button onClick={hideSnackbar} className="text-white opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
