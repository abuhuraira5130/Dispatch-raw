import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, ChevronDown, Activity, Users } from 'lucide-react';
import { AudienceActivityData } from '../services/uploadTimeOptimizer';

interface AudienceActivityGraphProps {
  audienceData: AudienceActivityData;
  theme?: 'dark' | 'light';
  optimalHour?: number;
}

export const AudienceActivityGraph: React.FC<AudienceActivityGraphProps> = ({
  audienceData,
  theme = 'dark',
  optimalHour,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDarkTheme = theme === 'dark';

  // Find max engagement for scaling
  const maxEngagement = Math.max(...audienceData.slots.map(s => s.engagementScore));
  const minEngagement = Math.min(...audienceData.slots.map(s => s.engagementScore));

  // Group hours into morning, afternoon, evening, night
  const timeGroups = {
    morning: audienceData.slots.slice(6, 12),    // 6am-12pm
    afternoon: audienceData.slots.slice(12, 17), // 12pm-5pm
    evening: audienceData.slots.slice(17, 22),   // 5pm-10pm
    night: [...audienceData.slots.slice(22, 24), ...audienceData.slots.slice(0, 6)], // 10pm-6am
  };

  const getBarColor = (score: number, hour: number) => {
    const isOptimal = hour === optimalHour;
    if (isOptimal) return 'from-amber-500 to-orange-500';
    if (score >= maxEngagement * 0.75) return 'from-emerald-500 to-green-500';
    if (score >= maxEngagement * 0.5) return 'from-blue-500 to-cyan-500';
    return 'from-zinc-500 to-zinc-600';
  };

  const getBarLabel = (score: number) => {
    if (score >= 75) return 'Very High';
    if (score >= 50) return 'High';
    if (score >= 30) return 'Medium';
    return 'Low';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden shadow-xl ${
        isDarkTheme ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white/50 border-zinc-200'
      } backdrop-blur-xl`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-5 sm:px-6 py-5 sm:py-6 border-b flex items-center justify-between transition-colors hover:opacity-80 ${
          isDarkTheme ? 'border-zinc-800 hover:bg-zinc-900/30' : 'border-zinc-200 hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
            <BarChart3 className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-left">
            <h3 className={`text-sm sm:text-base font-bold uppercase tracking-wider ${
              isDarkTheme ? 'text-white' : 'text-zinc-900'
            }`}>
              24-Hour Audience Activity
            </h3>
            <p className={`text-[11px] sm:text-xs ${isDarkTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
              View engagement patterns by time of day
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className={`w-5 h-5 ${isDarkTheme ? 'text-zinc-400' : 'text-zinc-500'}`} />
        </motion.div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className={`p-5 sm:p-6 space-y-6 border-t ${isDarkTheme ? 'border-zinc-800' : 'border-zinc-200'}`}>
              {/* Full 24-hour Grid View */}
              <div>
                <p className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-4 ${
                  isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
                }`}>
                  All 24 Hours (EST Timezone)
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
                  {audienceData.slots.map((slot) => {
                    const isOptimal = slot.hour === optimalHour;
                    const barHeight = ((slot.engagementScore - minEngagement) / (maxEngagement - minEngagement)) * 100;

                    return (
                      <motion.div
                        key={slot.hour}
                        whileHover={{ y: -4 }}
                        className="flex flex-col items-center gap-1"
                      >
                        {/* Bar */}
                        <div className="w-full flex items-end justify-center h-16">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(barHeight, 8)}%` }}
                            transition={{ delay: slot.hour * 0.02 }}
                            className={`w-full rounded-t-md bg-gradient-to-t ${getBarColor(slot.engagementScore, slot.hour)} ${
                              isOptimal ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/50' : ''
                            }`}
                          />
                        </div>
                        {/* Hour Label */}
                        <p className={`text-[10px] font-bold ${
                          isOptimal
                            ? 'text-amber-500'
                            : isDarkTheme
                            ? 'text-zinc-400'
                            : 'text-zinc-600'
                        }`}>
                          {slot.hour.toString().padStart(2, '0')}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Time Period Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(timeGroups).map(([period, slots], idx) => {
                  const avgScore = Math.round(slots.reduce((sum, s) => sum + s.engagementScore, 0) / slots.length);
                  const periodLabels: Record<string, { label: string; icon: string }> = {
                    morning: { label: '🌅 Morning', icon: '06-12' },
                    afternoon: { label: '☀️ Afternoon', icon: '12-17' },
                    evening: { label: '🌆 Evening', icon: '17-22' },
                    night: { label: '🌙 Night', icon: '22-06' },
                  };

                  return (
                    <motion.div
                      key={period}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      className={`rounded-lg p-4 border ${
                        isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
                      }`}
                    >
                      <p className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-2 ${
                        isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
                      }`}>
                        {periodLabels[period].label}
                      </p>
                      <p className={`text-2xl sm:text-3xl font-black mb-1 ${
                        avgScore >= 75 ? 'text-emerald-500' :
                        avgScore >= 50 ? 'text-blue-500' :
                        'text-zinc-500'
                      }`}>
                        {avgScore}%
                      </p>
                      <p className={`text-[10px] ${isDarkTheme ? 'text-zinc-500' : 'text-zinc-600'}`}>
                        Average Engagement
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Key Insights */}
              <div className={`rounded-lg p-4 sm:p-5 border-l-4 border-blue-500 ${
                isDarkTheme ? 'bg-blue-500/5' : 'bg-blue-50'
              }`}>
                <p className={`text-xs sm:text-sm font-bold uppercase tracking-wide mb-2 ${
                  isDarkTheme ? 'text-blue-400' : 'text-blue-700'
                }`}>
                  📊 Audience Insights
                </p>
                <div className="space-y-2">
                  {audienceData.peakHours.length > 0 && (
                    <p className={`text-sm ${isDarkTheme ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      <span className="font-bold text-emerald-500">Peak Hours:</span> {audienceData.peakHours.map(h => `${h.toString().padStart(2, '0')}:00`).join(', ')} EST
                    </p>
                  )}
                  {audienceData.lowHours.length > 0 && (
                    <p className={`text-sm ${isDarkTheme ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      <span className="font-bold text-orange-500">Slow Hours:</span> {audienceData.lowHours.slice(0, 3).map(h => `${h.toString().padStart(2, '0')}:00`).join(', ')} EST {audienceData.lowHours.length > 3 && `+${audienceData.lowHours.length - 3} more`}
                    </p>
                  )}
                  <p className={`text-sm ${isDarkTheme ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    <span className="font-bold text-blue-500">Recommendation:</span> Avoid uploading during night hours; aim for evening peak (5pm-10pm EST)
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 justify-center text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-t from-emerald-500 to-green-500" />
                  <span className={isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'}>Very High (75+%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-t from-blue-500 to-cyan-500" />
                  <span className={isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'}>High (50-75%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-t from-zinc-500 to-zinc-600" />
                  <span className={isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'}>Low (&lt;50%)</span>
                </div>
                {optimalHour !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded ring-2 ring-amber-400 bg-gradient-to-t from-amber-500 to-orange-500" />
                    <span className="text-amber-500 font-bold">Optimal</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
