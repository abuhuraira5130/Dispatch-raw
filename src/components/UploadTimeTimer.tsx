import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { OptimalUploadTime, formatCountdown, formatHourMinute12, getMinutesUntilOptimalTime } from '../services/uploadTimeOptimizer';

interface UploadTimeTimerProps {
  optimalTime: OptimalUploadTime;
  onRefresh: () => void;
  onSlotExpired?: () => void;
  isRefreshing?: boolean;
  theme?: 'dark' | 'light';
}

export const UploadTimeTimer: React.FC<UploadTimeTimerProps> = ({
  optimalTime,
  onRefresh,
  onSlotExpired,
  isRefreshing = false,
  theme = 'dark',
}) => {
  const [countdown, setCountdown] = useState({ hours: 0, mins: 0, display: '0m' });
  const expiredTriggerRef = useRef(false);

  // Update countdown every minute
  useEffect(() => {
    const updateCountdown = () => {
      const minutes = getMinutesUntilOptimalTime(optimalTime);
      setCountdown(formatCountdown(minutes));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [optimalTime]);

  useEffect(() => {
    expiredTriggerRef.current = false;
  }, [optimalTime.recommendedHour, optimalTime.recommendedMinute, optimalTime.generatedForDate]);

  useEffect(() => {
    const minutes = getMinutesUntilOptimalTime(optimalTime);
    if (minutes <= 0 && !expiredTriggerRef.current) {
      expiredTriggerRef.current = true;
      onSlotExpired?.();
    }
  }, [countdown.display, optimalTime, onSlotExpired]);

  const recommendedTimeStr = `${formatHourMinute12(optimalTime.recommendedHour, optimalTime.recommendedMinute)} PKT`;
  const peakTimeStr = `${formatHourMinute12(optimalTime.peakHour, 0)} PKT`;
  const uploadDayLabel = `Today (${optimalTime.recommendedWeekday})`;

  const isDarkTheme = theme === 'dark';
  const bgClass = isDarkTheme ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white/50 border-zinc-200';
  const textClass = isDarkTheme ? 'text-zinc-100' : 'text-zinc-900';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border ${bgClass} backdrop-blur-xl overflow-hidden shadow-xl`}
    >
      {/* Header */}
      <div className={`p-5 sm:p-6 border-b ${isDarkTheme ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className={`text-sm sm:text-base font-bold uppercase tracking-wider ${textClass}`}>
                OPTIMAL UPLOAD TIME
              </h3>
              <p className={`text-[11px] sm:text-xs ${isDarkTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Pakistan time, optimized for USA audience activity
              </p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`px-3 sm:px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-bold uppercase transition-all ${
              isRefreshing
                ? isDarkTheme
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
                : isDarkTheme
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">REFRESH</span>
          </button>
        </div>
      </div>

      {/* Main Timer Display */}
      <div className={`p-6 sm:p-8 border-b ${isDarkTheme ? 'border-zinc-800' : 'border-zinc-200'}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Countdown */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className={`rounded-xl p-4 sm:p-6 border-2 border-dashed ${
              isDarkTheme ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-300/40 bg-amber-50'
            }`}
          >
            <p className={`text-[11px] sm:text-xs uppercase font-bold tracking-wider mb-2 ${
              isDarkTheme ? 'text-amber-400/60' : 'text-amber-700/60'
            }`}>
              Upload In
            </p>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl sm:text-4xl font-black text-amber-500">
                {countdown.display}
              </p>
            </div>
            <p className={`text-[10px] sm:text-xs mt-2 ${isDarkTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {countdown.display === '0m'
                ? 'Upload now'
                : countdown.hours > 0
                ? `${countdown.hours}h ${countdown.mins}m remaining`
                : `${countdown.mins} minutes left`}
            </p>
          </motion.div>

          {/* Engagement Score */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className={`rounded-xl p-4 sm:p-6 ${
              isDarkTheme ? 'bg-gradient-to-br from-red-500/10 to-pink-500/10' : 'bg-gradient-to-br from-red-50 to-pink-50'
            } border ${isDarkTheme ? 'border-red-500/20' : 'border-red-200/30'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-red-500" />
              <p className={`text-[11px] sm:text-xs uppercase font-bold tracking-wider ${
                isDarkTheme ? 'text-red-400/60' : 'text-red-700/60'
              }`}>
                Engagement Score
              </p>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-red-500">
              {optimalTime.engagementScore}%
            </p>
          </motion.div>

          {/* Estimated Reach */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`rounded-xl p-4 sm:p-6 ${
              isDarkTheme ? 'bg-gradient-to-br from-emerald-500/10 to-green-500/10' : 'bg-gradient-to-br from-emerald-50 to-green-50'
            } border ${isDarkTheme ? 'border-emerald-500/20' : 'border-emerald-200/30'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <p className={`text-[11px] sm:text-xs uppercase font-bold tracking-wider ${
                isDarkTheme ? 'text-emerald-400/60' : 'text-emerald-700/60'
              }`}>
                Est. Reach
              </p>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-emerald-500">
              {(optimalTime.estimatedReach / 1000).toFixed(0)}K
            </p>
          </motion.div>
        </div>
      </div>

      {/* Upload Details Grid */}
      <div className={`grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 p-5 sm:p-6 border-b ${
        isDarkTheme ? 'border-zinc-800' : 'border-zinc-200'
      }`}>
        {/* Recommended Time */}
        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-lg p-3 sm:p-4 border ${
            isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <p className={`text-[10px] sm:text-xs uppercase font-bold tracking-wider mb-1.5 ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Recommended Time
          </p>
          <p className={`text-sm sm:text-base font-black ${textClass}`}>
            {recommendedTimeStr}
          </p>
        </motion.div>

        {/* Upload Day */}
        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-lg p-3 sm:p-4 border ${
            isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <p className={`text-[10px] sm:text-xs uppercase font-bold tracking-wider mb-1.5 ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Upload Day
          </p>
          <p className={`text-sm sm:text-base font-black ${textClass}`}>
            {uploadDayLabel}
          </p>
        </motion.div>

        {/* Peak Activity Hour */}
        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-lg p-3 sm:p-4 border ${
            isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <p className={`text-[10px] sm:text-xs uppercase font-bold tracking-wider mb-1.5 ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Peak Activity
          </p>
          <p className={`text-sm sm:text-base font-black text-amber-500`}>
            {peakTimeStr}
          </p>
        </motion.div>

        {/* Confidence Level */}
        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-lg p-3 sm:p-4 border ${
            isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <p className={`text-[10px] sm:text-xs uppercase font-bold tracking-wider mb-1.5 ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Confidence
          </p>
          <p className={`text-sm sm:text-base font-black ${
            optimalTime.confidenceLevel >= 85
              ? 'text-emerald-500'
              : optimalTime.confidenceLevel >= 75
              ? 'text-amber-500'
              : 'text-orange-500'
          }`}>
            {optimalTime.confidenceLevel}%
          </p>
        </motion.div>

        {/* Target Audience */}
        <motion.div
          whileHover={{ y: -2 }}
          className={`rounded-lg p-3 sm:p-4 border ${
            isDarkTheme ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-zinc-50'
          }`}
        >
          <p className={`text-[10px] sm:text-xs uppercase font-bold tracking-wider mb-1.5 ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Target Region
          </p>
          <p className={`text-sm sm:text-base font-black text-blue-500`}>
            USA
          </p>
        </motion.div>
      </div>

      {/* Auto-Refresh Status */}
      <div className={`px-5 sm:px-6 py-4 flex items-center justify-between ${
        isDarkTheme ? 'bg-zinc-900/30' : 'bg-gray-50'
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className={`text-xs font-medium ${
            isDarkTheme ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            Auto-refresh active (every 10 hours)
          </p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded ${isDarkTheme ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
          ON
        </span>
      </div>
    </motion.div>
  );
};
