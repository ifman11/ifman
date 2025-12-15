import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Scene, SceneStatus } from '../types';

interface StatsDashboardProps {
  scenes: Scene[];
}

const COLORS = {
  [SceneStatus.IDLE]: '#374151',
  [SceneStatus.PENDING]: '#6B7280',
  [SceneStatus.GENERATING]: '#3B82F6',
  [SceneStatus.SUCCESS]: '#10B981',
  [SceneStatus.ERROR]: '#EF4444',
  [SceneStatus.RETRYING]: '#F59E0B',
};

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ scenes }) => {
  const stats = {
    total: scenes.length,
    success: scenes.filter(s => s.status === SceneStatus.SUCCESS).length,
    error: scenes.filter(s => s.status === SceneStatus.ERROR).length,
    pending: scenes.filter(s => [SceneStatus.IDLE, SceneStatus.PENDING, SceneStatus.GENERATING, SceneStatus.RETRYING].includes(s.status)).length,
  };

  const data = [
    { name: '성공', value: stats.success, color: COLORS[SceneStatus.SUCCESS] },
    { name: '오류', value: stats.error, color: COLORS[SceneStatus.ERROR] },
    { name: '대기', value: stats.pending, color: COLORS[SceneStatus.PENDING] },
  ].filter(d => d.value > 0);

  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg border border-gray-700 h-full flex flex-col">
      <h3 className="text-lg font-bold text-gray-200 mb-4">생성 현황</h3>
      
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-gray-700/50 p-2 rounded">
          <div className="text-xs text-gray-400">전체</div>
          <div className="text-xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-green-900/30 p-2 rounded border border-green-800">
          <div className="text-xs text-green-400">성공</div>
          <div className="text-xl font-bold text-green-400">{stats.success}</div>
        </div>
        <div className="bg-red-900/30 p-2 rounded border border-red-800">
          <div className="text-xs text-red-400">실패</div>
          <div className="text-xl font-bold text-red-400">{stats.error}</div>
        </div>
      </div>

      {/* Added w-full and min-w-0 to fix Recharts responsive container width issue */}
      <div className="flex-1 w-full min-w-0 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={60}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
              itemStyle={{ color: '#f3f4f6' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};