// Upload Time Optimization Service
// Deterministic daily lock + PKT display + 10-hour refresh window

const TARGET_AUDIENCE_TIMEZONE = 'America/New_York';
const DISPLAY_TIMEZONE = 'Asia/Karachi';
const AUTO_REFRESH_MS = 10 * 60 * 60 * 1000;
const HISTORY_KEY = 'upload_time_optimizer_history';

export interface AudienceActivitySlot {
  hour: number;
  engagementScore: number;
  estimatedViewers: number;
  timestamp: string;
}

export interface OptimalUploadTime {
  recommendedHour: number;
  recommendedMinute: number;
  recommendedWeekday: string;
  engagementScore: number;
  confidenceLevel: number;
  estimatedReach: number;
  peakHour: number;
  lastUpdated: Date;
  nextAutoRefresh: Date;
  generatedForDate: string;
  timezone: 'Asia/Karachi';
  targetAudience: 'USA';
}

export interface AudienceActivityData {
  day: string;
  slots: AudienceActivitySlot[];
  peakHours: number[];
  lowHours: number[];
}

interface HistorySample {
  videoId: string;
  createdAt: string;
  scores: number[];
}

const BASE_AUDIENCE_PATTERNS: Record<number, number> = {
  0: 15,
  1: 10,
  2: 8,
  3: 5,
  4: 8,
  5: 12,
  6: 25,
  7: 35,
  8: 42,
  9: 48,
  10: 55,
  11: 60,
  12: 65,
  13: 62,
  14: 58,
  15: 62,
  16: 68,
  17: 72,
  18: 78,
  19: 82,
  20: 85,
  21: 83,
  22: 75,
  23: 45,
};

function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

function getTimePartsInZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getTimePartsInZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function getOffsetDeltaHours(date: Date): number {
  const targetOffset = getTimezoneOffsetMinutes(date, TARGET_AUDIENCE_TIMEZONE);
  const displayOffset = getTimezoneOffsetMinutes(date, DISPLAY_TIMEZONE);
  return Math.round((displayOffset - targetOffset) / 60);
}

function getPakistanNowParts(now: Date): { hour: number; minute: number } {
  const parts = getTimePartsInZone(now, DISPLAY_TIMEZONE);
  return { hour: parts.hour, minute: parts.minute };
}

export function getPakistanDayKey(now: Date = new Date()): string {
  const parts = getTimePartsInZone(now, DISPLAY_TIMEZONE);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getPakistanWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: DISPLAY_TIMEZONE,
    weekday: 'long',
  }).format(now);
}

export function formatHourMinute12(hour: number, minute: number): string {
  const normalizedHour = normalizeHour(hour);
  const meridiem = normalizedHour >= 12 ? 'PM' : 'AM';
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export function formatHourCompact12(hour: number): string {
  const normalizedHour = normalizeHour(hour);
  const meridiem = normalizedHour >= 12 ? 'P' : 'A';
  const displayHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  return `${displayHour}${meridiem}`;
}

function getAudienceHistory(): HistorySample[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Array.isArray(item?.scores) && typeof item?.videoId === 'string');
  } catch {
    return [];
  }
}

function saveAudienceHistory(history: HistorySample[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-80)));
}

function buildPakistanHourlyScores(now: Date): number[] {
  const pkScores = new Array<number>(24).fill(0);
  const offsetDeltaHours = getOffsetDeltaHours(now);

  for (let usHour = 0; usHour < 24; usHour += 1) {
    const pkHour = normalizeHour(usHour + offsetDeltaHours);
    pkScores[pkHour] = BASE_AUDIENCE_PATTERNS[usHour] ?? 30;
  }

  return pkScores;
}

function buildBlendedScores(videoId: string, now: Date): number[] {
  const baseScores = buildPakistanHourlyScores(now);
  const history = getAudienceHistory().filter((sample) => sample.videoId === videoId).slice(-16);

  if (history.length === 0) {
    return baseScores;
  }

  const historicalAverage = new Array<number>(24).fill(0);
  for (const sample of history) {
    for (let i = 0; i < 24; i += 1) {
      historicalAverage[i] += Number(sample.scores[i] ?? baseScores[i]);
    }
  }

  for (let i = 0; i < 24; i += 1) {
    historicalAverage[i] = historicalAverage[i] / history.length;
  }

  return baseScores.map((score, hour) => Math.round(score * 0.6 + historicalAverage[hour] * 0.4));
}

function appendHistorySample(videoId: string, scores: number[]): void {
  const history = getAudienceHistory();
  history.push({
    videoId,
    createdAt: new Date().toISOString(),
    scores,
  });
  saveAudienceHistory(history);
}

function pickBestCurrentDayHour(scores: number[], nowHour: number): number {
  let bestHour = nowHour;
  let bestScore = -1;

  for (let hour = nowHour; hour < 24; hour += 1) {
    const score = scores[hour];
    if (score > bestScore) {
      bestScore = score;
      bestHour = hour;
    }
  }

  return bestHour;
}

function normalizeRecommendedTimeToday(hour: number, minute: number, nowHour: number, nowMinute: number): { hour: number; minute: number } {
  const safeHour = Math.max(nowHour, Math.min(23, hour));
  let safeMinute = minute;

  if (safeHour > nowHour) {
    return { hour: safeHour, minute: safeMinute };
  }

  const quarterSlots = [0, 15, 30, 45];
  const nextQuarter = quarterSlots.find((slot) => slot > nowMinute + 1);
  if (typeof nextQuarter === 'number') {
    return { hour: safeHour, minute: nextQuarter };
  }

  if (safeHour < 23) {
    return { hour: safeHour + 1, minute: 0 };
  }

  return { hour: 23, minute: Math.min(59, nowMinute + 1) };
}

function getConfidence(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted[0] ?? 70;
  const second = sorted[1] ?? 65;
  return Math.max(65, Math.min(95, 70 + (top - second) * 2));
}

function buildOptimalModel(
  recommendedHour: number,
  scores: number[],
  dayKey: string,
  now: Date,
  recommendedMinute: number = 15
): OptimalUploadTime {
  const pkNow = getPakistanNowParts(now);
  const normalizedTime = normalizeRecommendedTimeToday(recommendedHour, recommendedMinute, pkNow.hour, pkNow.minute);
  const peakHour = scores.indexOf(Math.max(...scores));
  const engagementScore = Math.round(scores[normalizedTime.hour]);
  const confidenceLevel = Math.round(getConfidence(scores));
  const estimatedReach = Math.round(engagementScore * 1200 + confidenceLevel * 85);

  return {
    recommendedHour: normalizedTime.hour,
    recommendedMinute: normalizedTime.minute,
    recommendedWeekday: getPakistanWeekday(now),
    engagementScore,
    confidenceLevel,
    estimatedReach,
    peakHour,
    lastUpdated: now,
    nextAutoRefresh: new Date(now.getTime() + AUTO_REFRESH_MS),
    generatedForDate: dayKey,
    timezone: 'Asia/Karachi',
    targetAudience: 'USA',
  };
}

function buildLockedModelFromExisting(
  existing: OptimalUploadTime,
  scores: number[],
  now: Date
): OptimalUploadTime {
  const peakHour = scores.indexOf(Math.max(...scores));
  const engagementScore = Math.round(scores[existing.recommendedHour]);
  const confidenceLevel = Math.round(getConfidence(scores));
  const estimatedReach = Math.round(engagementScore * 1200 + confidenceLevel * 85);

  return {
    ...existing,
    engagementScore,
    confidenceLevel,
    estimatedReach,
    peakHour,
    lastUpdated: now,
    nextAutoRefresh: new Date(now.getTime() + AUTO_REFRESH_MS),
  };
}

export function calculateOptimalUploadTime(
  videoId: string,
  options?: { refreshStatsOnly?: boolean; advanceIfPassed?: boolean }
): OptimalUploadTime {
  const now = new Date();
  const dayKey = getPakistanDayKey(now);
  const existing = getPersistedOptimizationData(videoId);

  if (existing?.optimalTime?.generatedForDate === dayKey) {
    if (options?.advanceIfPassed) {
      const pkNow = getPakistanNowParts(now);
      const nowMinutes = pkNow.hour * 60 + pkNow.minute;
      const currentTargetMinutes = existing.optimalTime.recommendedHour * 60 + existing.optimalTime.recommendedMinute;

      if (currentTargetMinutes <= nowMinutes) {
        const refreshedScores = buildBlendedScores(videoId, now);
        appendHistorySample(videoId, refreshedScores);

        const nextHour = pickBestCurrentDayHour(refreshedScores, pkNow.hour);
        return buildOptimalModel(nextHour, refreshedScores, dayKey, now, 15);
      }
    }

    if (!options?.refreshStatsOnly) {
      return existing.optimalTime;
    }

    const refreshedScores = buildBlendedScores(videoId, now);
    appendHistorySample(videoId, refreshedScores);
    return buildLockedModelFromExisting(existing.optimalTime, refreshedScores, now);
  }

  const pkNow = getPakistanNowParts(now);
  const scores = buildBlendedScores(videoId, now);
  appendHistorySample(videoId, scores);
  const bestHour = pickBestCurrentDayHour(scores, pkNow.hour);
  return buildOptimalModel(bestHour, scores, dayKey, now, 15);
}

export function get24HourAudienceData(videoId: string): AudienceActivityData {
  const now = new Date();
  const dayStr = new Intl.DateTimeFormat('en-PK', {
    timeZone: DISPLAY_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(now);

  const scores = buildBlendedScores(videoId, now);
  const slots: AudienceActivitySlot[] = scores.map((score, hour) => ({
    hour,
    engagementScore: score,
    estimatedViewers: Math.round(score * 900 + 1500),
    timestamp: `${formatHourMinute12(hour, 0)} PKT`,
  }));

  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const peakThreshold = minScore + (maxScore - minScore) * 0.7;
  const lowThreshold = minScore + (maxScore - minScore) * 0.3;

  const peakHours = slots.filter((slot) => slot.engagementScore >= peakThreshold).map((slot) => slot.hour);
  const lowHours = slots.filter((slot) => slot.engagementScore <= lowThreshold).map((slot) => slot.hour);

  return {
    day: dayStr,
    slots,
    peakHours,
    lowHours,
  };
}

export function getMinutesUntilOptimalTime(optimalTime: OptimalUploadTime): number {
  const now = new Date();
  const pkNow = getPakistanNowParts(now);
  const nowMinutes = pkNow.hour * 60 + pkNow.minute;
  const targetMinutes = optimalTime.recommendedHour * 60 + optimalTime.recommendedMinute;

  if (targetMinutes <= nowMinutes) {
    return 0;
  }

  return targetMinutes - nowMinutes;
}

export function formatCountdown(minutes: number): { hours: number; mins: number; display: string } {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  const display = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return { hours, mins, display };
}

export function persistOptimizationData(
  videoId: string,
  optimalTime: OptimalUploadTime,
  audienceData: AudienceActivityData
): void {
  const key = `upload_optimization_${videoId}`;
  const data = {
    videoId,
    optimalTime,
    audienceData,
    generatedAt: new Date().toISOString(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

export function getPersistedOptimizationData(videoId: string): {
  videoId: string;
  optimalTime: OptimalUploadTime;
  audienceData: AudienceActivityData;
  generatedAt: string;
} | null {
  const key = `upload_optimization_${videoId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const data = JSON.parse(stored);
    return {
      ...data,
      optimalTime: {
        ...data.optimalTime,
        lastUpdated: new Date(data.optimalTime.lastUpdated),
        nextAutoRefresh: new Date(data.optimalTime.nextAutoRefresh),
      },
    };
  } catch {
    return null;
  }
}

export function clearOptimizationData(videoId: string): void {
  const key = `upload_optimization_${videoId}`;
  localStorage.removeItem(key);
}

export function shouldAutoRefresh(optimalTime: OptimalUploadTime): boolean {
  if (!optimalTime.nextAutoRefresh) return true;
  return new Date().getTime() >= new Date(optimalTime.nextAutoRefresh).getTime();
}
