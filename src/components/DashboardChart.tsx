import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DashboardData } from '../types';

interface DashboardChartProps {
  data: DashboardData;
}

export const DashboardChart = ({ data }: DashboardChartProps) => {
  const chartData = [
    {
      name: 'Dooplex',
      movies: data.dooplex.movies,
      series: data.dooplex.series,
      animes: data.dooplex.animes,
    },
  ];

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <h3 className="text-lg font-bold text-gray-900 mb-6">Distribución de Contenido</h3>
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis 
            dataKey="name" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6B7280', fontSize: 14 }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#6B7280', fontSize: 12 }}
          />
          <Tooltip 
            cursor={{ fill: '#F3F4F6' }}
            contentStyle={{ 
              backgroundColor: '#FFF', 
              borderRadius: '8px', 
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' 
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
          />
          <Bar dataKey="movies" name="Películas" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={60} />
          <Bar dataKey="series" name="Series" fill="#E11D48" radius={[4, 4, 0, 0]} maxBarSize={60} />
          <Bar dataKey="animes" name="Animes" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={60} />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
};
