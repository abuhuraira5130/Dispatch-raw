// Upload Time Optimization Service
// Tracks audience activity patterns and recommends optimal upload times

export interface AudienceActivitySlot {
  hour: number;
  engagementScore: number; // 0-100
  estimatedViewers: number;
  timestamp: string;
}

export interface OptimalUploadTime {
  recommendedHour: number;
  recommendedMinute: number;
  engagementScore: number;
  confidenceLevel: number; // 0-100
  estimatedReach: number;
  peakHour: number;
  lastUpdated: Date;
  nextAutoRefresh: Date;
}

export interface AudienceActivityData {
  day: string;
  slots: AudienceActivitySlot[];
  peakHours: number[];
  lowHours: number[];
}

// USA timezone-aware audience patterns
// Simulates real audience activity based on typical social media patterns
const BASE_AUDIENCE_PATTERNS: Record<number, number> = {
  // Hour of day (UTC-5 EST) -> Engagement Score (0-100)
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
  12: 65, // Lunch time
  13: 62,
  14: 58,
  15: 62,
  16: 68,
  17: 72, // After work peak
  18: 78, // Prime time
  19: 82,
  20: 85, // Peak engagement
  21: 83,
  22: 75,
  23: 45,
};

// Initialize localStorage for audience tracking
function initializeAudienceTracking(): void {
  const existingData = localStorage.getItem('upload_time_optimizer_data');
  if (!existingData) {
    const initialData = {
      startDate: new Date().toISOString(),
      activityLog: [] as AudienceActivitySlot[],
      refreshCount: 0,
    };
    localStorage.setItem('upload_time_optimizer_data', JSON.stringify(initialData));
  }
}

// Get current hour in USA timezone (EST/EDT)
function getCurrentUSAHour(): number {
  const now = new Date();
  // Convert to EST (UTC-5) regardless of system timezone
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return estTime.getHours();
}

// Get current minute
function getCurrentMinute(): number {
  const now = new Date();
  return now.getMinutes();
}

// Simulate real-time audience activity variation (±20% of base for variation)
function getRealtimeEngagementScore(hour: number): number {
  const baseScore = BASE_AUDIENCE_PATTERNS[hour] || 30;
  
  // Add some randomness to simulate real activity
  const variation = (Math.random() - 0.5) * 40; // ±20% variation
  const dynamicScore = Math.max(5, Math.min(100, baseScore + variation));
  
  // Add temporal micro-variations (increases/decreases throughout the hour)
  const minutes = getCurrentMinute();
  const microVariation = (Math.sin((minutes / 60) * Math.PI) - 0.5) * 10;
  
  return Math.round(dynamicScore + microVariation);
}

// Find next optimal upload time (within 24 hours from now)
export function calculateOptimalUploadTime(generatedAt: Date): OptimalUploadTime {
  initializeAudienceTracking();
  
  const currentHour = getCurrentUSAHour();
  const currentMinute = getCurrentMinute();
  
  let bestHour = currentHour;
  let bestScore = getRealtimeEngagementScore(currentHour);
  let maxScore = bestScore;
  let peakHour = currentHour;
  const scores: number[] = [];
  
  // Check next 24 hours
  for (let i = 0; i < 24; i++) {
    const checkHour = (currentHour + i) % 24;
    const score = getRealtimeEngagementScore(checkHour);
    scores.push(score);
    
    if (score > bestScore) {
      bestScore = score;
      bestHour = checkHour;
    }
    
    if (score > maxScore) {
      maxScore = score;
      peakHour = checkHour;
    }
  }
  
  // If optimal time is in the past today, move to tomorrow
  if (bestHour < currentHour) {
    bestHour += 24;
  }
  
  // Recommend uploading at the top of the hour or 15min mark for best results
  const recommendedMinute = currentMinute < 30 ? 0 : 15;
  
  // Calculate confidence level based on score stability
  const avgScore = scores.reduce((a, b) => a + b) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
  const confidenceLevel = Math.round(Math.max(65, Math.min(95, 100 - Math.sqrt(variance) * 2)));
  
  // Estimate reach (higher engagement = more views potential)
  const estimatedReach = Math.round(bestScore * 1000 + Math.random() * 5000);
  
  const now = new Date();
  const nextRefresh = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
  
  return {
    recommendedHour: bestHour % 24,
    recommendedMinute,
    engagementScore: bestScore,
    confidenceLevel,
    estimatedReach,
    peakHour: peakHour % 24,
    lastUpdated: now,
    nextAutoRefresh: nextRefresh,
  };
}

// Get 24-hour audience activity data for graph display
export function get24HourAudienceData(): AudienceActivityData {
  const now = new Date();
  const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const slots: AudienceActivitySlot[] = [];
  const peakHours: number[] = [];
  const lowHours: number[] = [];
  
  let maxScore = 0;
  let minScore = 100;
  
  // Generate 24 hourly slots
  for (let hour = 0; hour < 24; hour++) {
    const score = getRealtimeEngagementScore(hour);
    slots.push({
      hour,
      engagementScore: score,
      estimatedViewers: Math.round(score * 800 + Math.random() * 2000),
      timestamp: `${hour.toString().padStart(2, '0')}:00 EST`,
    });
    
    maxScore = Math.max(maxScore, score);
    minScore = Math.min(minScore, score);
  }
  
  // Identify peak and low hours
  const threshold = minScore + (maxScore - minScore) * 0.7;
  slots.forEach(slot => {
    if (slot.engagementScore >= threshold) {
      peakHours.push(slot.hour);
    } else if (slot.engagementScore <= minScore + (maxScore - minScore) * 0.3) {
      lowHours.push(slot.hour);
    }
  });
  
  return {
    day: dayStr,
    slots,
    peakHours,
    lowHours,
  };
}

// Calculate minutes until optimal upload time
export function getMinutesUntilOptimalTime(optimalTime: OptimalUploadTime): number {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentHour = estTime.getHours();
  const currentMinute = estTime.getMinutes();
  
  let targetHour = optimalTime.recommendedHour;
  let targetMinute = optimalTime.recommendedMinute;
  
  // If recommended time is earlier today, it means tomorrow
  if (targetHour < currentHour || (targetHour === currentHour && targetMinute <= currentMinute)) {
    targetHour += 24;
  }
  
  const targetDate = new Date(estTime);
  targetDate.setHours(targetHour % 24, targetMinute, 0, 0);
  
  const diffMs = targetDate.getTime() - estTime.getTime();
  return Math.round(diffMs / (1000 * 60));
}

// Format time display (hours and minutes remaining)
export function formatCountdown(minutes: number): { hours: number; mins: number; display: string } {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  const display = hours > 0 
    ? `${hours}h ${mins}m`
    : `${mins}m`;
  
  return { hours, mins, display };
}

// Persist optimization data to localStorage
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

// Retrieve persisted optimization data
export function getPersistedOptimizationData(videoId: string) {
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

// Clear persistence for a video
export function clearOptimizationData(videoId: string): void {
  const key = `upload_optimization_${videoId}`;
  localStorage.removeItem(key);
}

// Check if refresh is needed (compare current time with nextAutoRefresh)
export function shouldAutoRefresh(optimalTime: OptimalUploadTime): boolean {
  if (!optimalTime.nextAutoRefresh) return true;
  
  const now = new Date();
  return now >= new Date(optimalTime.nextAutoRefresh);
}
