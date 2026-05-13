import { Film, Tv, Zap, LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface PlatformCardProps {
  title: string;
  stats: {
    movies?: number;
    series?: number;
    animes?: number;
  };
  colorTheme?: 'blue' | 'purple' | 'emerald';
}

const iconMap: Record<string, LucideIcon> = {
  movies: Film,
  series: Tv,
  animes: Zap,
};

const labelMap: Record<string, string> = {
  movies: 'Películas',
  series: 'Series',
  animes: 'Animes',
};

export const PlatformCard = ({ title, stats, colorTheme = 'blue' }: PlatformCardProps) => {
  const themeClasses = {
    blue: 'border-blue-200 bg-blue-50/50',
    purple: 'border-purple-200 bg-purple-50/50',
    emerald: 'border-emerald-200 bg-emerald-50/50',
  };

  const headerThemeClasses = {
    blue: 'text-blue-700 bg-blue-100',
    purple: 'text-purple-700 bg-purple-100',
    emerald: 'text-emerald-700 bg-emerald-100',
  };

  return (
    <div className={cn("rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md", themeClasses[colorTheme])}>
      <div className={cn("px-6 py-4 border-b border-opacity-50", 
        colorTheme === 'blue' ? 'border-blue-200' : 
        colorTheme === 'purple' ? 'border-purple-200' : 'border-emerald-200')}>
        <h3 className={cn("text-lg font-bold inline-block px-3 py-1 rounded-full text-sm", headerThemeClasses[colorTheme])}>
          {title}
        </h3>
      </div>
      
      <div className="p-6 grid gap-4">
        {Object.entries(stats).map(([key, value]) => {
          if (value === undefined) return null;
          
          const Icon = iconMap[key] || Film;
          const label = labelMap[key] || key;
          
          return (
            <div key={key} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-md", 
                  key === 'movies' ? 'bg-indigo-100 text-indigo-600' : 
                  key === 'series' ? 'bg-rose-100 text-rose-600' : 
                  'bg-amber-100 text-amber-600')}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-gray-600">{label}</span>
              </div>
              <span className="text-xl font-bold text-gray-900">{value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
