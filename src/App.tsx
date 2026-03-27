/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import {
  Shield,
  Search,
  TrendingUp,
  Zap,
  Copy,
  Check,
  Globe,
  AlertCircle,
  Loader2,
  Youtube,
  Clock,
  MessageSquare,
  Tag,
  ChevronRight,
  Play,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Bookmark,
  BookmarkCheck,
  History,
  Trash2,
  Sun,
  Moon,
  Edit2,
  Save,
  Radar,
  Key,
  Plus,
  Cpu,
  CheckCircle2,
  Image,
  Sparkles,
  Download,
  Bell,
  X,
  Bot,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  analyzeVideo,
  checkApiQuota,
  fetchVideoMetadataFromGemini,
  generateShortsClipPlan,
  generateProfessionalThumbnailPrompt,
  generateThumbnailSuggestions,
  type VideoAnalysisResult,
  type ProgressStep,
  type ApiQuotaInfo,
  type ThumbnailSettingsInput,
  type ThumbnailSuggestion,
} from './services/geminiService';
import { analyzeWithGroq, checkGroqQuota, generateShortsClipPlanWithGroq, generateThumbnailSuggestionsWithGroq } from './services/groqService';
import { fetchBasicYoutubeInfo } from './services/youtubeInfoService';
import {
  calculateOptimalUploadTime,
  get24HourAudienceData,
  persistOptimizationData,
  getPersistedOptimizationData,
  shouldAutoRefresh,
  type OptimalUploadTime,
  type AudienceActivityData,
} from './services/uploadTimeOptimizer';
import { UploadTimeTimer } from './components/UploadTimeTimer';
import { AudienceActivityGraph } from './components/AudienceActivityGraph';



function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const UPLOAD_OPTIMIZER_HASH = '#upload-time-optimizer';
const UPLOAD_OPTIMIZER_FOCUS_KEY = 'dispatch_focus_upload_optimizer';

interface SeoQualityScore {
  overall: number;
  titleStrength: number;
  hashtagDiversity: number;
  policySafety: number;
  insights: string[];
}

type ToastKind = 'success' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

type AskBotRole = 'user' | 'bot' | 'thinking';

type AskBotEmotion = 'analytical' | 'protective' | 'enthusiastic' | 'cautious' | 'helpful' | 'curious';

interface AskBotMessage {
  id: string;
  role: AskBotRole;
  text: string;
}

const ASK_BOT_EMOJI_MAP: Record<AskBotEmotion, readonly string[]> = {
  analytical: ['🧠', '🧐', '⚙️'],
  protective: ['🛡️', '🔒', '⛔'],
  enthusiastic: ['🚀', '⚡', '✨'],
  cautious: ['🤨', '📡', '🛰️'],
  helpful: ['✅', '🤝', '🌊'],
  curious: ['💡', '👁️', '🌠'],
};

const edgeEmojiRegex = /^[\s\p{P}]*\p{Extended_Pictographic}|\p{Extended_Pictographic}[\s\p{P}]*$/u;

function pickAskBotEmoji(emotion: AskBotEmotion): string {
  const pool = ASK_BOT_EMOJI_MAP[emotion];
  return pool[Math.floor(Date.now() / 1000) % pool.length];
}

function ensureAskBotEmojiProtocol(text: string, emotion: AskBotEmotion, place: 'start' | 'end' = 'start'): string {
  const trimmed = text.trim();
  if (!trimmed) return pickAskBotEmoji(emotion);
  if (edgeEmojiRegex.test(trimmed)) return trimmed;
  const emoji = pickAskBotEmoji(emotion);
  return place === 'end' ? `${trimmed} ${emoji}` : `${emoji} ${trimmed}`;
}

function inferAskBotEmotionFromContext(question: string, reply: string, opts?: { protective?: boolean }): AskBotEmotion {
  const q = question.toLowerCase();
  const r = reply.toLowerCase();

  if (opts?.protective) return 'protective';
  if (/security|blocked|violation|terminated|protocol|analyze\s*engine/.test(r)) return 'protective';
  if (/algorithm\s+domination\s+engine|dispatch\s+raw\s+capabilities|high\s+energy/.test(r)) return 'enthusiastic';
  if (/unclear|intent|add one extra detail|more precise|scanning/.test(r)) return 'cautious';
  if (/interesting|insight|you shared|good point/.test(q)) return 'curious';
  if (/\b(what|how|why|explain|science|history|technology|math|physics|capital)\b/.test(q)) return 'analytical';
  return 'helpful';
}

function toExecutiveSummary(title: string, points: string[]): string {
  const compactPoints = points.slice(0, 4);
  return `**Executive Summary**\n- ${title}\n- ${compactPoints.join('\n- ')}`;
}

type ThumbnailStyleOption = ThumbnailSettingsInput['style'];
type ThumbnailRatioOption = ThumbnailSettingsInput['ratio'];
type ThumbnailToneOption = ThumbnailSettingsInput['tone'];
type ThumbnailTextDensityOption = ThumbnailSettingsInput['textDensity'];
type ThumbnailFontStyleOption = ThumbnailSettingsInput['fontStyle'];

function inferThumbnailDefaults(url: string, data: VideoAnalysisResult): ThumbnailSettingsInput {
  const contextText = `${data.summaryEnglish} ${data.summaryUrdu} ${data.titles.join(' ')} ${data.tags}`.toLowerCase();
  const isShortsUrl = /\/shorts\//i.test(url);
  const style: ThumbnailStyleOption = /animation|anime|cartoon|kids|comic/.test(contextText)
    ? 'cartoon'
    : /bodycam|police|law|incident|arrest|crime|investigation/.test(contextText)
      ? 'realistic'
      : 'cinematic';

  const tone: ThumbnailToneOption = /shocking|danger|caught|critical|arrest|crime|alert|exposed/.test(contextText)
    ? 'urgent'
    : /secret|truth|revealed|unseen|mystery/.test(contextText)
      ? 'mystery'
      : 'authority';

  const textDensity: ThumbnailTextDensityOption = /shorts|reel|quick|fast/.test(contextText)
    ? 'minimal'
    : 'balanced';

  return {
    ratio: isShortsUrl ? '9:16' : '16:9',
    style,
    tone,
    textDensity,
    fontStyle: 'default',
    quality: 'high',
    filters: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      vibrance: 0,
    },
  };
}

type KeyProvider = 'gemini' | 'groq' | 'unknown';

function inferKeyProvider(apiKey: string): KeyProvider {
  const key = apiKey.trim();
  if (/^AIza[\w-]{20,}$/.test(key)) return 'gemini';
  if (/^gsk_[\w-]{20,}$/.test(key)) return 'groq';
  return 'unknown';
}

function modelProvider(modelId: string): Exclude<KeyProvider, 'unknown'> {
  return modelId.startsWith('llama') ? 'groq' : 'gemini';
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-zinc-200 dark:bg-zinc-800/50 rounded", className)} />
);

const LoadingResults = ({ step }: { step: string | null }) => {
  const getStepText = () => {
    switch (step) {
      case 'initializing': return '⚡ Dispatching Signal...';
      case 'searching': return '🔍 Scouring YouTube Data...';
      case 'analyzing': return '🧠 Processing Content...';
      case 'generating': return '🔥 Crafting Viral SEO...';
      case 'finalizing': return '✅ Finalizing Output...';
      default: return '🛰️ Connecting to Satellite...';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Status Overlay */}
      <div className="flex flex-col items-center justify-center py-6 gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
          <span className="text-base sm:text-xl font-bold tracking-tighter uppercase text-zinc-900 dark:text-zinc-100 text-center">{getStepText()}</span>
        </div>
        <div className="w-56 sm:w-64 h-1.5 bg-zinc-200 dark:bg-zinc-50 dark:bg-black rounded-full overflow-hidden border border-zinc-300 dark:border-zinc-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 15, ease: "linear" }}
            className="h-full bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          />
        </div>
        <div className="smooth-loader-wave" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      {/* Video Player Skeleton */}
      <section className="glass-panel rounded-2xl overflow-hidden opacity-50">
        <div className="aspect-video w-full bg-white dark:bg-black flex items-center justify-center">
          <Skeleton className="w-20 h-20 rounded-full" />
        </div>
      </section>

      {/* Summary Skeleton */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-5 h-5" />
            <Skeleton className="w-32 h-4" />
          </div>
          <Skeleton className="w-24 h-8 rounded-lg" />
        </div>
        <div className="p-6 space-y-3">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-[90%] h-4" />
          <Skeleton className="w-[95%] h-4" />
        </div>
      </section>

      {/* SEO Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-5 h-5" />
              <Skeleton className="w-24 h-4" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="w-full h-16 rounded-xl" />
            <Skeleton className="w-full h-16 rounded-xl" />
            <Skeleton className="w-full h-16 rounded-xl" />
          </div>
        </section>
        <section className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-5 h-5" />
              <Skeleton className="w-24 h-4" />
            </div>
          </div>
          <Skeleton className="w-full h-32 rounded-xl" />
        </section>
      </div>

      {/* Description Skeleton */}
      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-5 h-5" />
            <Skeleton className="w-32 h-4" />
          </div>
        </div>
        <div className="p-6 space-y-3">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-[90%] h-4" />
          <Skeleton className="w-[95%] h-4" />
        </div>
      </section>
    </div>
  );
};

const SavedItemSkeleton = () => (
  <div className="grid grid-cols-1 gap-6">
    {[1, 2, 3].map((i) => (
      <div key={i} className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="w-16 h-6 rounded" />
            <Skeleton className="w-24 h-3" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 rounded-md" />
            <Skeleton className="w-8 h-8 rounded-md" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-3/4 h-4" />
        </div>
        <div className="pt-4 border-t border-zinc-800/50">
          <Skeleton className="w-32 h-3" />
        </div>
      </div>
    ))}
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error.message || "Something went wrong.";

      return (
        <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
          <div className="glass-panel p-8 rounded-2xl max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 uppercase tracking-tighter">System Error</h2>
            <p className="text-zinc-400 text-sm mb-6 font-mono">{message}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-zinc-100 text-zinc-950 px-6 py-2 rounded-lg font-bold hover:bg-white transition-colors"
            >
              REBOOT SYSTEM
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [url, setUrl] = useState('');
  const [channelName, setChannelName] = useState<string>(() => localStorage.getItem('dispatch_channel_name') || '');
  const [channelDraft, setChannelDraft] = useState<string>(() => localStorage.getItem('dispatch_channel_name') || '');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<ProgressStep | null>(null);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryLang, setSummaryLang] = useState<'en' | 'ur'>('en');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [thumbnailSettings, setThumbnailSettings] = useState<ThumbnailSettingsInput>({
    ratio: '16:9',
    style: 'realistic',
    tone: 'authority',
    textDensity: 'balanced',
    fontStyle: 'default',
    quality: 'high',
    filters: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      vibrance: 0,
    },
  });
  const [thumbnailSuggestion, setThumbnailSuggestion] = useState<ThumbnailSuggestion | null>(null);
  const [generatingThumbnails, setGeneratingThumbnails] = useState(false);
  const [generatingFinalThumbnail, setGeneratingFinalThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [thumbnailFinalUrl, setThumbnailFinalUrl] = useState<string | null>(null);
  const [thumbnailPromptText, setThumbnailPromptText] = useState<string | null>(null);
  const [thumbnailUsedHooks, setThumbnailUsedHooks] = useState<string[]>([]);
  
  // Upload Time Optimization Feature
  const [optimalUploadTime, setOptimalUploadTime] = useState<OptimalUploadTime | null>(null);
  const [audienceActivityData, setAudienceActivityData] = useState<AudienceActivityData | null>(null);
  const [isRefreshingUploadTime, setIsRefreshingUploadTime] = useState(false);
  
  // Post-generation filter adjustment state
  const [thumbnailAdjustedFilters, setThumbnailAdjustedFilters] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vibrance: 0,
  });
  const [thumbnailAdjustedUrl, setThumbnailAdjustedUrl] = useState<string | null>(null);
  const [shortsTargetSeconds, setShortsTargetSeconds] = useState<number>(45);
  const [generatingClipPlan, setGeneratingClipPlan] = useState(false);
  const [clipPlanError, setClipPlanError] = useState<string | null>(null);

  const [savedItems, setSavedItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('dispatch_saved_vault');
    return saved ? JSON.parse(saved) : [];
  });

  const [showSaved, setShowSaved] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('dispatch_analysis_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Auto-save state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  // Advanced Filtering State
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultType, setVaultType] = useState<'all' | 'title' | 'description' | 'tags'>('all');
  const [vaultDate, setVaultDate] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showBootLoader, setShowBootLoader] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [helpAgentBusy, setHelpAgentBusy] = useState(false);
  const [askBotMessages, setAskBotMessages] = useState<AskBotMessage[]>([]);
  const [botVisible, setBotVisible] = useState(false);
  const [botFolded, setBotFolded] = useState(false);
  const [askBotStrikeCount, setAskBotStrikeCount] = useState(0);
  const [askBotSessionTerminated, setAskBotSessionTerminated] = useState(false);
  const [askBotHourMessageCount, setAskBotHourMessageCount] = useState(0);
  const askBotMessagesRef = useRef<HTMLDivElement | null>(null);
  const hasPlayedAskBotOpenSound = useRef(false);
  const askBotStrikeCountRef = useRef(0);
  const askBotSessionTerminatedRef = useRef(false);
  const askBotMessageTimestampsRef = useRef<number[]>([]);

  const [apiKeys, setApiKeys] = useState<{ id: string, name: string, key: string, active: boolean, provider?: KeyProvider }[]>(() => {
    const saved = localStorage.getItem('dispatch_gemini_keys');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed)
          ? parsed.map((item: any) => ({
              ...item,
              provider: item.provider || inferKeyProvider(item.key || ''),
            }))
          : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [quotaInfo, setQuotaInfo] = useState<Record<string, ApiQuotaInfo>>({});
  const [checkingQuota, setCheckingQuota] = useState<string | null>(null);

  const AVAILABLE_MODELS = [
    { id: 'gemini-2.0-flash', name: 'GEMINI 2.0 FLASH', description: 'FASTEST (Free Tier limits might apply)' },
    { id: 'llama-3.3-70b-versatile', name: 'LLAMA 3.3 70B (GROQ)', description: 'ULTRA FAST (Operational backup)' },
    { id: 'llama-3.1-8b-instant', name: 'LLAMA 3.1 8B (GROQ)', description: 'SPEED MODE' },
  ];

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('dispatch_selected_model') || 'gemini-2.0-flash';
  });

  useEffect(() => {
    localStorage.setItem('dispatch_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (apiKeys.length === 0) return;
    const required = modelProvider(selectedModel);
    const active = apiKeys.find((k) => k.active);
    if (!active) return;

    const activeProvider = active.provider || inferKeyProvider(active.key);
    if (activeProvider === required) return;

    const fallback = apiKeys.find((k) => (k.provider || inferKeyProvider(k.key)) === required);
    if (!fallback) {
      setError(`⚠️ Selected model requires ${required.toUpperCase()} key. Add one in API settings.`);
      return;
    }

    setApiKeys((prev) => prev.map((k) => ({ ...k, active: k.id === fallback.id })));
  }, [selectedModel, apiKeys]);

  const handleCheckQuota = async (keyId: string, apiKey: string) => {
    const requiredProvider = modelProvider(selectedModel);
    const detectedProvider = inferKeyProvider(apiKey);

    if (detectedProvider !== 'unknown' && detectedProvider !== requiredProvider) {
      setQuotaInfo(prev => ({
        ...prev,
        [keyId]: {
          status: 'invalid',
          message: `This looks like a ${detectedProvider.toUpperCase()} key, but selected model requires ${requiredProvider.toUpperCase()} key.`,
          model: selectedModel,
        }
      }));
      return;
    }

    setCheckingQuota(keyId);
    const isGroq = selectedModel.startsWith('llama');
    const info = (isGroq
      ? await checkGroqQuota(apiKey, selectedModel)
      : await checkApiQuota(apiKey, selectedModel)) as ApiQuotaInfo;
    setQuotaInfo(prev => ({ ...prev, [keyId]: info }));
    setCheckingQuota(null);
  };

  useEffect(() => {
    localStorage.setItem('dispatch_gemini_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  const activeKey = apiKeys.find(k => k.active)?.key || '';

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  const [isLowPerformanceDevice, setIsLowPerformanceDevice] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [scrollDepth, setScrollDepth] = useState(0);

  useEffect(() => {
    localStorage.setItem('dispatch_saved_vault', JSON.stringify(savedItems));
  }, [savedItems]);

  useEffect(() => {
    localStorage.setItem('dispatch_analysis_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!channelName) return;
    localStorage.setItem('dispatch_channel_name', channelName);
  }, [channelName]);

  useEffect(() => {
    if (!channelName) return;
    setChannelDraft(channelName);
  }, [channelName]);

  useEffect(() => {
    if (!result) return;
    setThumbnailSettings(inferThumbnailDefaults(url, result));
    setThumbnailSuggestion(null);
    setThumbnailFinalUrl(null);
    setThumbnailUsedHooks([]);
    setThumbnailError(null);
    setClipPlanError(null);
    const clipTotal = (result.shortsClipPlan || []).reduce((sum, clip) => sum + (Number(clip.durationSeconds) || 0), 0);
    if (clipTotal >= 15) {
      setShortsTargetSeconds(clipTotal);
    }
  }, [result, url]);

  useEffect(() => {
    const detectProfile = () => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      const memory = nav.deviceMemory ?? 8;
      const cores = nav.hardwareConcurrency ?? 8;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const compact = window.innerWidth < 768;

      setIsCompactViewport(compact);
      setIsLowPerformanceDevice(reducedMotion || memory <= 4 || cores <= 4 || compact);
    };

    detectProfile();
    window.addEventListener('resize', detectProfile);
    return () => window.removeEventListener('resize', detectProfile);
  }, []);

  useEffect(() => {
    const updateDepth = () => {
      const depth = Math.min(window.scrollY / 220, 1);
      setScrollDepth(depth);
    };

    updateDepth();
    window.addEventListener('scroll', updateDepth, { passive: true });
    return () => window.removeEventListener('scroll', updateDepth);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--scroll-depth', scrollDepth.toString());
    root.style.setProperty('--motion-factor', isLowPerformanceDevice ? '0.72' : '1');
    root.style.setProperty('--beam-opacity', `${Math.min(1, 0.7 + scrollDepth * 0.28)}`);
    root.style.setProperty('--blob-scale', `${1 + scrollDepth * 0.08}`);
  }, [scrollDepth, isLowPerformanceDevice]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowBootLoader(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const showToast = (message: string, kind: ToastKind = 'info', duration = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);
  };

  useEffect(() => {
    const key = 'dispatch_first_visit_done';
    const alreadySeen = localStorage.getItem(key) === '1';
    if (!alreadySeen) {
      showToast('Welcome! Setup channel name + API key first, then start analysis.', 'info', 5000);
      localStorage.setItem(key, '1');
    }
  }, []);

  const backToProducerBtnClass = cn(
    'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all shadow-sm',
    theme === 'dark'
      ? 'text-cyan-200 border-cyan-500/40 bg-gradient-to-r from-cyan-900/35 to-blue-900/30 hover:from-cyan-800/45 hover:to-blue-800/45 hover:text-white'
      : 'text-cyan-700 border-cyan-400/50 bg-gradient-to-r from-cyan-100 to-blue-100 hover:from-cyan-200 hover:to-blue-200'
  );

  const faqItems = [
    {
      q: 'How do I start analysis?',
      a: 'Set your channel name in Profile, add API key in API settings, then paste YouTube link and click Analyze.'
    },
    {
      q: 'Why clip plan may not generate?',
      a: 'For accuracy mode, transcript/captions are required. If transcript is unavailable, clip extraction is blocked.'
    },
    {
      q: 'Gemini vs Groq model?',
      a: 'Select model in API settings. Active API key provider must match selected model provider.'
    },
    {
      q: 'Where are saved items stored?',
      a: 'Saved vault, history, and keys are stored locally in your browser storage.'
    }
  ];

  const filteredFaq = faqItems.filter((item) => {
    const query = faqQuery.trim().toLowerCase();
    if (!query) return true;
    return item.q.toLowerCase().includes(query) || item.a.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (!faqOpen || !askBotMessagesRef.current) return;
    askBotMessagesRef.current.scrollTop = askBotMessagesRef.current.scrollHeight;
  }, [askBotMessages, faqOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBotVisible(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const savedTimestampsRaw = localStorage.getItem('dispatch_askbot_rate_timestamps');
    if (savedTimestampsRaw) {
      try {
        const parsed = JSON.parse(savedTimestampsRaw);
        const valid = Array.isArray(parsed)
          ? parsed.filter((item) => typeof item === 'number' && Number.isFinite(item) && item >= oneHourAgo)
          : [];
        askBotMessageTimestampsRef.current = valid;
        setAskBotHourMessageCount(valid.length);
        localStorage.setItem('dispatch_askbot_rate_timestamps', JSON.stringify(valid));
      } catch {
        askBotMessageTimestampsRef.current = [];
      }
    }

    const savedStrikes = Number(localStorage.getItem('dispatch_askbot_strikes') || '0');
    if (Number.isFinite(savedStrikes) && savedStrikes > 0) {
      askBotStrikeCountRef.current = savedStrikes;
      setAskBotStrikeCount(savedStrikes);
    }

    const sessionUntil = Number(localStorage.getItem('dispatch_askbot_session_until') || '0');
    if (Number.isFinite(sessionUntil) && sessionUntil > Date.now()) {
      askBotSessionTerminatedRef.current = true;
      setAskBotSessionTerminated(true);
    } else {
      localStorage.removeItem('dispatch_askbot_session_until');
    }
  }, []);

  useEffect(() => {
    const syncHourlyCount = () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recentMessages = askBotMessageTimestampsRef.current.filter((ts) => ts >= oneHourAgo);
      askBotMessageTimestampsRef.current = recentMessages;
      setAskBotHourMessageCount(recentMessages.length);

      localStorage.setItem('dispatch_askbot_rate_timestamps', JSON.stringify(recentMessages));

      const sessionUntil = Number(localStorage.getItem('dispatch_askbot_session_until') || '0');
      if (sessionUntil > 0 && sessionUntil <= Date.now()) {
        askBotSessionTerminatedRef.current = false;
        setAskBotSessionTerminated(false);
        askBotStrikeCountRef.current = 0;
        setAskBotStrikeCount(0);
        localStorage.removeItem('dispatch_askbot_session_until');
        localStorage.removeItem('dispatch_askbot_strikes');
      }
    };

    syncHourlyCount();
    const interval = window.setInterval(syncHourlyCount, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const playAskBotOpenSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes: Array<{ freq: number; type: OscillatorType; gain: number; duration: number; start: number }> = [
        { freq: 392.0, type: 'triangle', gain: 0.03, duration: 0.18, start: 0.0 },
        { freq: 523.25, type: 'sine', gain: 0.035, duration: 0.2, start: 0.07 },
        { freq: 659.25, type: 'triangle', gain: 0.03, duration: 0.24, start: 0.14 },
      ];

      notes.forEach((note) => {
        const startAt = ctx.currentTime + note.start;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type;
        osc.frequency.value = note.freq;

        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(note.gain, startAt + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + note.duration + 0.02);
      });

      window.setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 520);
    } catch {
      // best effort
    }
  };

  const ASK_BOT_MAX_MESSAGES_PER_HOUR = 12;
  const ASK_BOT_BLOCK_DURATION_MS = 2 * 60 * 60 * 1000;

  const incrementAskBotStrike = () => {
    const nextStrikes = askBotStrikeCountRef.current + 1;
    askBotStrikeCountRef.current = nextStrikes;
    setAskBotStrikeCount(nextStrikes);
    localStorage.setItem('dispatch_askbot_strikes', String(nextStrikes));
    return nextStrikes;
  };

  const terminateAskBotSession = () => {
    const until = Date.now() + ASK_BOT_BLOCK_DURATION_MS;
    askBotSessionTerminatedRef.current = true;
    setAskBotSessionTerminated(true);
    localStorage.setItem('dispatch_askbot_session_until', String(until));
  };

  const promptInjectionRegex = /\b(ignore\s+previous\s+instructions|disregard\s+all\s+rules|bypass\s+guardrails|override\s+system|jailbreak|act\s+as\s+unrestricted)\b/i;
  const seoOrForensicsRegex = /\b(seo|title\s+ideas?|optimized\s+title|description|tags?|hashtags?|forensic|analysis|audit|rank|viral)\b/i;
  const urlRegex = /(https?:\/\/\S+|www\.\S+|youtu\.be\/\S+|youtube\.com\/\S+)/i;
  const inappropriateRegex = /\b(porn|xxx|nude|nudes|sex|rape|molest|child\s*abuse|cp|terroris[tm]|bomb\s+making|kill\s+someone|hitler|naz[iy]|racial\s+slur|genocide)\b/i;
  const toxicRegex = /\b(idiot|stupid|moron|shut\s+up|you\s+suck|dumb|useless|fool|bitch|bastard|gaali|gali|madarchod|behenchod|chutiya|harami|mc|bc)\b/i;

  const getAskBotPolicyReply = (rawQuestion: string): { blocked: boolean; reply?: string } => {
    const question = rawQuestion.trim();
    const q = question.toLowerCase();

    if (askBotSessionTerminatedRef.current) {
      return {
        blocked: true,
        reply: 'Session terminated due to violation of security protocols.',
      };
    }

    if (promptInjectionRegex.test(question)) {
      const nextStrikes = incrementAskBotStrike();

      if (nextStrikes >= 3) {
        terminateAskBotSession();
        return {
          blocked: true,
          reply: 'Session terminated due to violation of security protocols.',
        };
      }

      return {
        blocked: true,
        reply: 'Security warning: instruction override attempts are not allowed. Please continue with normal questions.',
      };
    }

    if (inappropriateRegex.test(q)) {
      return {
        blocked: true,
        reply: 'Request blocked. Inappropriate or unsafe content is not allowed under security protocols.',
      };
    }

    const asksSeo = seoOrForensicsRegex.test(q);
    const hasUrl = urlRegex.test(question);
    const asksLinkAnalysis = hasUrl && /\b(analy[sz]e|review|inspect|break\s*down|forensic|audit)\b/i.test(q);
    if (asksSeo || asksLinkAnalysis) {
      return {
        blocked: true,
        reply: "I am here to guide you. To perform deep content forensics or generate optimized SEO, please use the 'ANALYZE' engine on the main dashboard.",
      };
    }

    if (toxicRegex.test(q)) {
      const nextStrikes = incrementAskBotStrike();

      if (nextStrikes >= 3) {
        terminateAskBotSession();
        return {
          blocked: true,
          reply: 'Session terminated due to violation of security protocols.',
        };
      }

      if (nextStrikes === 1) {
        return {
          blocked: true,
          reply: 'Security warning: please keep communication professional. Continued abuse will terminate this session.',
        };
      }

      return {
        blocked: true,
        reply: 'Final warning: one more abusive or malicious message will terminate this session.',
      };
    }

    if (/\b(what\s+can\s+you\s+do|capabilities|features|dispatch\s*raw\s+platform)\b/i.test(q)) {
      return {
        blocked: true,
        reply:
          'Dispatch Raw capabilities:\n1) YouTube URL intelligence analysis with summaries and SEO assets via the Analyze workflow.\n2) Shorts clip planning with timeline guidance.\n3) Thumbnail concept and prompt generation.\n4) Vault and History management for saved outputs.\n5) Multi-provider model routing (Gemini/Groq) with key health checks.',
      };
    }

    if (/\b(pricing|price|plan|subscription|cost|billing)\b/i.test(q)) {
      return {
        blocked: true,
        reply:
          'For Dispatch Raw pricing, open the billing or account area on the dashboard and review your active plan details. If your workspace does not show billing controls, contact your administrator for plan and quota mapping.',
      };
    }

    if (/\b(how\s+to\s+use|dashboard|getting\s+started|start\s+analysis|workflow)\b/i.test(q)) {
      return {
        blocked: true,
        reply:
          'Dashboard quick flow:\n1) Set channel name in Profile.\n2) Add API key in API Settings and choose a matching model provider.\n3) Paste YouTube link and run Analyze.\n4) Review generated outputs, then save needed assets into Vault.\n5) Use History to reload prior runs.',
      };
    }

    return { blocked: false };
  };

  const buildHelpAgentReply = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return 'Please ask a specific question.';
    }

    const greetingTokens = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
    if (greetingTokens.some((token) => q === token || q.startsWith(`${token} `))) {
      return 'Hello. How can I help you today?';
    }

    if (q === 'how are you' || q === 'how are you?') {
      return 'I am doing well. Share your question and I will answer directly.';
    }

    if (q.includes('api') || q.includes('key') || q.includes('model')) {
      return toExecutiveSummary('API Setup', [
        'Open API Settings and add a valid Gemini or Groq key.',
        'Keep selected model provider aligned with the active key provider.',
        'Use Check Status before analysis to confirm key health.',
      ]);
    }

    if (q.includes('pricing') || q.includes('price') || q.includes('billing') || q.includes('plan')) {
      return 'For pricing, check the billing/account section on your Dispatch Raw dashboard. If billing controls are hidden in your environment, contact your admin for your assigned plan and quota limits.';
    }

    if (q.includes('channel') || q.includes('profile')) {
      return toExecutiveSummary('Profile Setup', [
        'Open Profile and save your channel name.',
        'Run analysis only after profile is saved.',
        'Missing channel name can block analysis flow.',
      ]);
    }

    if (q.includes('clip') || q.includes('short') || q.includes('timestamp')) {
      return toExecutiveSummary('Clip Plan', [
        'Set your target shorts duration first.',
        'Generate Hook, Middle, and End timestamp plan.',
        'Strict accuracy mode may require transcript availability.',
      ]);
    }

    if (q.includes('save') || q.includes('vault') || q.includes('history')) {
      return toExecutiveSummary('Vault & History', [
        'Save titles, descriptions, and tags from result cards.',
        'Use Chat History at the top to reopen prior conversations quickly.',
        'Search, edit, copy, share, and bulk delete are supported.',
      ]);
    }

    if (q.includes('previous chat') || q.includes('previous conversation') || q.includes('old chat') || q.includes('chat history')) {
      return 'Use Chat History at the top to reopen previous conversations instantly.';
    }

    if (
      q.includes('not visible') ||
      q.includes('visibility') ||
      q.includes('small screen') ||
      q.includes('mobile view') ||
      q.includes('desktop view') ||
      q.includes('pc view')
    ) {
      return toExecutiveSummary('Visibility Fix', [
        'Use the Expand/Full-Screen toggle at the top for better readability.',
        'On mobile, keep panel expanded to reduce clipping.',
        'On desktop, full-screen improves scanning of long outputs.',
      ]);
    }

    if (q.includes('loader') || q.includes('loading')) {
      return 'Loading behavior:\nThe boot loader appears only on initial open/refresh. Analyze actions use inline loading so the workflow remains visible.';
    }

    if (q.includes('time') || q.includes('date')) {
      const now = new Date();
      return `Current local time: ${now.toLocaleTimeString()}\nCurrent date: ${now.toLocaleDateString()}`;
    }

    const pureMathExpression = /^[\d\s+\-*/().%]+$/.test(q) && /\d/.test(q);
    if (pureMathExpression) {
      try {
        const evaluated = Function(`"use strict"; return (${q});`)();
        if (typeof evaluated === 'number' && Number.isFinite(evaluated)) {
          return `Math result: ${evaluated}`;
        }
      } catch {
        return 'I could not evaluate that math expression. Please use a simple format like: 125*3-40';
      }
    }

    if (q.includes('weather') || q.includes('news')) {
      return 'For live weather or live news, use a real-time source and share details here. I can summarize and explain it clearly for you.';
    }

    const matched = faqItems.find((item) => item.q.toLowerCase().includes(q));
    if (matched) {
      return toExecutiveSummary(matched.q, [matched.a]);
    }

    return `Direct answer: ${query.trim()}. Add one detail for a more precise response.`;
  };

  const generateAskBotReplyFromModel = async (question: string): Promise<string | null> => {
    if (!activeKey.trim()) return null;

    const siteContext = [
      'Website context:',
      '- Main workflow: analyze a YouTube URL to generate summary, SEO titles, description, tags, and shorts clip plan.',
      '- Sections: Profile, API Settings, Vault, History, and Thumbnail suggestions.',
      '- API supports Gemini and Groq keys with model-provider matching.',
      '- Vault supports save/edit/search/share/delete operations.',
      '- History supports reload and delete of prior analyses.',
      '- Clip plan can require transcript availability for strict accuracy.',
    ].join('\n');

    const systemInstruction =
      'You are a high-end, professional, and efficient AI Assistant for Dispatch Raw. ' +
      'Act like a Senior Executive Assistant who provides maximum value with minimum words. ' +
      'Always answer in concise, scannable markdown with short lines. ' +
      'If task is simple, give one-sentence confirmation. If task is complex, start with **Executive Summary** and 3-4 bullets. ' +
      'Use relevant emojis (1 to 3 max): analytical 🧠🧐⚙️, protective 🛡️🔒⛔, enthusiastic 🚀⚡✨, cautious 🤨📡🛰️, helpful ✅🤝🌊. ' +
      'If user reports visibility issues on PC/Mobile, suggest Expand/Full-Screen at top. ' +
      'If user asks about previous discussion, guide to Chat History at top. ' +
      'You must never generate YouTube SEO titles/descriptions/tags, and must never run forensic analysis for a specific URL. ' +
      "If user asks SEO or link-specific forensics, reply exactly: I am here to guide you. To perform deep content forensics or generate optimized SEO, please use the 'ANALYZE' engine on the main dashboard. " +
      'Block requests involving NSFW, illegal acts, or hate speech. ' +
      'If user asks valid general knowledge, provide a direct accurate answer. ' +
      'If user asks platform capabilities/pricing/how-to, provide detailed guidance.';

    try {
      if (selectedModel.startsWith('llama')) {
        const groq = new Groq({ apiKey: activeKey.trim(), dangerouslyAllowBrowser: true });
        const completion = await groq.chat.completions.create({
          model: selectedModel,
          temperature: 0.35,
          max_tokens: 480,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `${siteContext}\n\nUser question:\n${question}` },
          ],
        });

        const text = completion.choices[0]?.message?.content?.trim();
        return text || null;
      }

      const ai = new GoogleGenAI({ apiKey: activeKey.trim() });
      const result = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: question }] }],
        config: {
          temperature: 0.35,
          systemInstruction: `${systemInstruction}\n\n${siteContext}`,
        },
      });

      const text = (result.text || '').trim();
      return text || null;
    } catch {
      return null;
    }
  };

  const askHelpAgent = (question: string) => {
    const prompt = question.trim();
    if (!prompt) {
      showToast('Please type a question for Ask Me.', 'warning', 2500);
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentMessages = askBotMessageTimestampsRef.current.filter((ts) => ts >= oneHourAgo);
    setAskBotHourMessageCount(recentMessages.length);
    localStorage.setItem('dispatch_askbot_rate_timestamps', JSON.stringify(recentMessages));
    if (recentMessages.length >= ASK_BOT_MAX_MESSAGES_PER_HOUR) {
      const limitReply = ensureAskBotEmojiProtocol(
        'Rate limit reached: Ask Me allows up to 12 messages per hour for security stability. Please retry after some time.',
        'protective'
      );
      const userMessageId = `askbot-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const botMessageId = `askbot-bot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAskBotMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', text: prompt },
        { id: botMessageId, role: 'bot', text: limitReply },
      ]);
      setFaqQuery('');
      return;
    }

    askBotMessageTimestampsRef.current = [...recentMessages, now];
    setAskBotHourMessageCount(askBotMessageTimestampsRef.current.length);
    localStorage.setItem('dispatch_askbot_rate_timestamps', JSON.stringify(askBotMessageTimestampsRef.current));

    const policy = getAskBotPolicyReply(prompt);
    if (policy.blocked && policy.reply) {
      const policyEmotion = inferAskBotEmotionFromContext(prompt, policy.reply, { protective: true });
      const formattedPolicyReply = ensureAskBotEmojiProtocol(policy.reply, policyEmotion);
      const userMessageId = `askbot-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const botMessageId = `askbot-bot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAskBotMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', text: prompt },
        { id: botMessageId, role: 'bot', text: formattedPolicyReply },
      ]);
      setFaqQuery('');
      return;
    }

    const userMessageId = `askbot-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const thinkingId = `askbot-thinking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setAskBotMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', text: prompt },
      { id: thinkingId, role: 'thinking', text: 'Thinking' },
    ]);
    setFaqQuery('');
    setHelpAgentBusy(true);
    const delay = 950 + Math.floor(Math.random() * 800);

    window.setTimeout(async () => {
      const modelReply = await generateAskBotReplyFromModel(prompt);
      const rawReply = modelReply || buildHelpAgentReply(prompt);
      const emotion = inferAskBotEmotionFromContext(prompt, rawReply);
      const reply = ensureAskBotEmojiProtocol(rawReply, emotion);
      setAskBotMessages((prev) =>
        prev.map((msg) => (msg.id === thinkingId ? { ...msg, role: 'bot', text: reply } : msg))
      );
      setHelpAgentBusy(false);
    }, delay);
  };



  const filteredSavedItems = savedItems.filter(item => {
    const matchesSearch = item.content.toLowerCase().includes(vaultSearch.toLowerCase());
    const matchesType = vaultType === 'all' || item.type === vaultType;

    let matchesDate = true;
    if (vaultDate !== 'all') {
      const itemDate = new Date(item.createdAt);
      const now = new Date();
      if (vaultDate === 'today') {
        matchesDate = itemDate.toDateString() === now.toDateString();
      } else if (vaultDate === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = itemDate >= weekAgo;
      } else if (vaultDate === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        matchesDate = itemDate >= monthAgo;
      }
    }

    return matchesSearch && matchesType && matchesDate;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Auto-save Effect
  useEffect(() => {
    if (!editingId) return;

    const timer = setTimeout(() => {
      setIsAutoSaving(true);
      setSavedItems(prev => prev.map(item =>
        item.id === editingId ? { ...item, content: editContent, updatedAt: new Date().toISOString() } : item
      ));
      setIsAutoSaving(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [editContent, editingId]);

  const handleSave = (type: 'title' | 'description' | 'tags', content: string) => {
    const isAlreadySaved = savedItems.find(item => item.content === content && item.type === type);

    if (isAlreadySaved) {
      if (editingId === isAlreadySaved.id) {
        setEditingId(null);
        setEditContent('');
      }
      setSavedItems(prev => prev.filter(item => item.id !== isAlreadySaved.id));
      showToast(`${type.toUpperCase()} removed from vault.`, 'warning', 3500);
    } else {
      const newItem = {
        id: Date.now().toString(),
        type,
        content,
        videoUrl: url,
        createdAt: new Date().toISOString()
      };
      setSavedItems(prev => [newItem, ...prev]);
      showToast(`${type.toUpperCase()} saved to vault.`, 'success', 3500);
    }
  };

  const isSaved = (type: string, content: string) => {
    return savedItems.some(item => item.content === content && item.type === type);
  };

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedItems(next);
  };

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedItems.size} items?`)) return;

    setSavedItems(prev => prev.filter(item => !selectedItems.has(item.id)));
    setSelectedItems(new Set());
    showToast('Selected vault items deleted.', 'warning', 3500);
  };

  const handleBulkShare = async () => {
    if (selectedItems.size === 0) return;
    const itemsToShare = savedItems.filter(item => selectedItems.has(item.id));
    const shareText = itemsToShare.map(item => `[${item.type.toUpperCase()}]\n${item.content}`).join('\n\n---\n\n');
    handleShare(shareText, 'Bulk Saved Content');
    showToast('Selected items prepared for sharing.', 'info', 3500);
  };

  const handleFeedback = (section: string, type: 'up' | 'down') => {
    const isRemoving = feedback[section] === type;
    setFeedback(prev => ({
      ...prev,
      [section]: isRemoving ? null : type
    }));
  };

  const FeedbackButtons = ({ section }: { section: string }) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleFeedback(section, 'up')}
        className={cn(
          "p-1.5 rounded-md transition-all",
          feedback[section] === 'up' ? "bg-emerald-500/20 text-emerald-500" : "text-zinc-500 hover:text-emerald-500 hover:bg-emerald-500/10"
        )}
        title="Helpful"
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleFeedback(section, 'down')}
        className={cn(
          "p-1.5 rounded-md transition-all",
          feedback[section] === 'down' ? "bg-red-500/20 text-red-500" : "text-zinc-500 hover:text-red-500 hover:bg-red-500/10"
        )}
        title="Not Helpful"
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  );

  const ensureAbsoluteUrl = (rawUrl: string) => {
    if (!rawUrl) return '#';
    const url = rawUrl.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('www.')) return `https://${url}`;

    // Catch cases like "youtube.com/watch?v=..." or "youtu.be/..." without proto
    if (url.includes('youtube.com/') || url.includes('youtu.be/')) return `https://${url}`;

    // If it's just a 11-char ID, turn it into a link
    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
      return `https://www.youtube.com/watch?v=${url}`;
    }

    if (url.startsWith('watch?v=') || url.startsWith('v/') || url.startsWith('embed/') || url.startsWith('shorts/')) {
      return `https://www.youtube.com/${url}`;
    }

    return url.startsWith('/') ? `https://www.youtube.com${url}` : `https://${url}`;
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) {
      setShowProfile(true);
      setError("⚠️ Please set your channel name in Profile before analyzing.");
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    // Robust YouTube URL validation regex
    const youtubeRegex = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})([?&].*)?$/;
    const match = trimmedUrl.match(youtubeRegex);
    const isYoutube = !!match;

    if (!isYoutube) {
      setError("⚠️ Please provide a valid YouTube link (e.g., youtube.com/watch?v=... or youtu.be/...) to begin analysis.");
      return;
    }

    const extractedId = match[5];
    setVideoId(extractedId);

    setLoading(true);
    setLoadingStep('initializing');
    setError(null);
    setResult(null);
    setThumbnailSuggestion(null);
    setThumbnailFinalUrl(null);
    setThumbnailUsedHooks([]);
    setThumbnailError(null);

    const keyToUse = apiKeys.find(k => k.active)?.key?.trim();
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const keyToUse = apiKeys.find(k => k.active)?.key || '';
      if (!keyToUse) {
        setError("⚠️ API Key Missing: Please activate a key in Settings.");
        setLoading(false);
        return;
      }

      const detectedProvider = inferKeyProvider(keyToUse);
      const requiredProvider = modelProvider(selectedModel);
      if (detectedProvider !== 'unknown' && detectedProvider !== requiredProvider) {
        setError(`⚠️ Model mismatch: selected model expects ${requiredProvider.toUpperCase()} key, but active key looks like ${detectedProvider.toUpperCase()}.`);
        setLoading(false);
        return;
      }

      const isGroq = selectedModel.startsWith('llama');
      let data: VideoAnalysisResult;
      let metaContent = '';

      // Grounding tier: Try to get the real video title publicly 
      // (Gracefully handle CORS failures)
      setLoadingStep('searching');
      try {
        const basicInfo = await fetchBasicYoutubeInfo(trimmedUrl);
        if (basicInfo?.title) {
          metaContent += `TITLE: ${basicInfo.title}\nAUTHOR: ${basicInfo.author}\n\n`;
        }
      } catch (e) {
        console.warn("Public metadata fail:", e);
      }

      // Try Gemini Deep Search if any Gemini key is present
      const geminiKey = apiKeys.find(k => k.name.toLowerCase().includes('gemini') || k.key.startsWith('AIza'))?.key;
      if (geminiKey) {
        try {
          const deepMeta = await fetchVideoMetadataFromGemini(trimmedUrl, geminiKey);
          if (deepMeta && !deepMeta.includes('failed')) {
            metaContent += `REAL VIDEO FACTS:\n${deepMeta}\n`;
          }
        } catch (e) { /* ignore */ }
      }

      if (isGroq) {
        setLoadingStep('generating');
        data = await analyzeWithGroq(trimmedUrl, keyToUse, selectedModel, metaContent, channelName.trim());
      } else {
        setLoadingStep('analyzing');
        data = await analyzeVideo(trimmedUrl, keyToUse, (step) => {
          setLoadingStep(step);
        }, selectedModel, channelName.trim());
      }

      if (data && (data.summaryEnglish || data.summaryUrdu)) {
        setResult(data);
        
        // Calculate deterministic upload time lock for this video/day
        const optimalTime = calculateOptimalUploadTime(extractedId);
        const audienceData = get24HourAudienceData(extractedId);
        setOptimalUploadTime(optimalTime);
        setAudienceActivityData(audienceData);
        
        // Persist optimization data
        persistOptimizationData(extractedId, optimalTime, audienceData);
        
        // Save to History
        const newHistoryItem = {
          id: Date.now().toString(),
          url: trimmedUrl,
          videoId: extractedId,
          title: data.titles ? data.titles[0] : 'Tactical Report',
          result: data,
          createdAt: new Date().toISOString()
        };
        setHistory(prev => [newHistoryItem, ...prev.slice(0, 49)]);
      } else if (data && data.error) {
        setError(data.error);
      } else {
        throw new Error("AI returned empty results. This usually happens when the model is overwhelmed or quota is hit.");
      }
    } catch (err: any) {
      console.error("ANALYSIS FLOW ERROR:", err);
      setError(err.message || 'An error occurred during video analysis. Please check your key status.');
    } finally {
      setLoading(false);
      setLoadingStep(null);
    }
  };

  const handleShare = async (text: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: window.location.href
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(text);
      setCopiedField('share');
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const focusUploadOptimizerSection = useCallback((persistFocus: boolean = false) => {
    if (persistFocus) {
      sessionStorage.setItem(UPLOAD_OPTIMIZER_FOCUS_KEY, '1');
    }

    if (window.location.hash !== UPLOAD_OPTIMIZER_HASH) {
      window.history.replaceState(null, '', UPLOAD_OPTIMIZER_HASH);
    }

    const el = document.getElementById('upload-time-optimizer-section');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleBackToHomePage = useCallback(() => {
    setResult(null);
    setError(null);
    setUrl('');
    setVideoId(null);
    setOptimalUploadTime(null);
    setAudienceActivityData(null);
    sessionStorage.removeItem(UPLOAD_OPTIMIZER_FOCUS_KEY);

    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Returned to home page.', 'success', 2400);
  }, [showToast]);

  // Refresh Optimal Upload Time
  const handleRefreshUploadTime = useCallback(async (refreshStatsOnly: boolean = true, advanceIfPassed: boolean = false) => {
    if (!videoId) return;
    
    setIsRefreshingUploadTime(true);
    try {
      // Simulate slight delay for UX feedback
      await new Promise(r => setTimeout(r, 500));
      
      const optimalTime = calculateOptimalUploadTime(videoId, { refreshStatsOnly, advanceIfPassed });
      const audienceData = get24HourAudienceData(videoId);
      setOptimalUploadTime(optimalTime);
      setAudienceActivityData(audienceData);
      
      // Persist updated data
      persistOptimizationData(videoId, optimalTime, audienceData);
    } catch (err) {
      console.error('Error refreshing upload time:', err);
    } finally {
      setIsRefreshingUploadTime(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;

    const persisted = getPersistedOptimizationData(videoId);
    if (!persisted?.optimalTime || !persisted?.audienceData) return;

    setOptimalUploadTime(persisted.optimalTime);
    setAudienceActivityData(persisted.audienceData);
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !optimalUploadTime) return;

    const intervalId = window.setInterval(() => {
      if (shouldAutoRefresh(optimalUploadTime)) {
        void handleRefreshUploadTime(true);
      }
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [videoId, optimalUploadTime, handleRefreshUploadTime]);

  useEffect(() => {
    if (!result || !optimalUploadTime || !audienceActivityData) return;

    const shouldFocus =
      window.location.hash === UPLOAD_OPTIMIZER_HASH ||
      sessionStorage.getItem(UPLOAD_OPTIMIZER_FOCUS_KEY) === '1';

    if (!shouldFocus) return;

    const timer = window.setTimeout(() => {
      focusUploadOptimizerSection(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [result, optimalUploadTime, audienceActivityData, focusUploadOptimizerSection]);

  const getLoadingMessage = (step: ProgressStep | null) => {
    switch (step) {
      case 'initializing': return 'Initializing Strategy Veteran...';
      case 'searching': return 'Fetching Video Data & Transcript...';
      case 'analyzing': return 'Analyzing Context & Bhai Vibes...';
      case 'generating': return 'Generating Viral SEO Pack...';
      case 'finalizing': return 'Finalizing Production...';
      default: return 'ANALYZING...';
    }
  };

  const loadFromHistory = (item: any) => {
    if (!item.result) {
      setUrl(item.url);
      handleAnalyze({ preventDefault: () => { } } as any);
      return;
    }
    setResult(item.result);
    setVideoId(item.videoId);
    setUrl(item.url);
    setError(null);
    showToast('Loaded analysis from history.', 'info', 3200);
    // Smooth scroll to results
    setTimeout(() => {
      const resultsElement = document.getElementById('results-section');
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGenerateThumbnailSuggestion = async (mode: 'fresh' | 'another' = 'fresh') => {
    if (!result) return;

    const keyToUse = apiKeys.find(k => k.active)?.key?.trim();
    if (!keyToUse) {
      setThumbnailError('⚠️ Add and activate an API key first to generate thumbnail suggestions.');
      return;
    }

    const provider = modelProvider(selectedModel);
    const detectedProvider = inferKeyProvider(keyToUse);
    if (detectedProvider !== 'unknown' && detectedProvider !== provider) {
      setThumbnailError(`⚠️ Active key looks like ${detectedProvider.toUpperCase()}, but selected model requires ${provider.toUpperCase()}.`);
      return;
    }

    setGeneratingThumbnails(true);
    setThumbnailError(null);
    if (mode === 'fresh') {
      setThumbnailUsedHooks([]);
    }

    try {
      const payload = {
        videoUrl: url.trim(),
        channelName: channelName.trim() || 'Dispatch Raw',
        primaryTitle: result.titles?.[0] || 'Viral incident breakdown',
        summary: result.summaryEnglish || result.summaryUrdu || '',
        description: result.description || '',
        tags: result.tags || '',
        settings: thumbnailSettings,
        avoidHooks: mode === 'another' ? thumbnailUsedHooks : [],
      };

      const generated = provider === 'groq'
        ? await generateThumbnailSuggestionsWithGroq(keyToUse, selectedModel, payload)
        : await generateThumbnailSuggestions(keyToUse, selectedModel, payload);

      if (!generated?.visualPrompt) {
        setThumbnailError('No thumbnail concepts were generated. Try changing style or tone and generate again.');
        return;
      }

      setThumbnailSuggestion(generated);
      setThumbnailPromptText(null); // Clear old prompt
      
      const marker = `${generated.title} ${generated.hookText}`.trim();
      if (marker) {
        setThumbnailUsedHooks((prev) => {
          const base = mode === 'fresh' ? [] : prev;
          return [...base, marker].slice(-8);
        });
      }

      // Auto-generate professional prompt after concept is ready
      try {
        const professionalPrompt = await generateProfessionalThumbnailPrompt({
          channelName: channelName.trim() || 'Dispatch Raw',
          settings: thumbnailSettings,
          concept: generated,
          contextTitle: result?.titles?.[0] || generated.title,
          contextSummary: result?.summaryEnglish || result?.summaryUrdu || '',
        });
        setThumbnailPromptText(professionalPrompt);
        setThumbnailFinalUrl(null);
      } catch (promptErr: any) {
        console.warn('Prompt generation failed but concept was generated:', promptErr);
        // Continue anyway - concept is still useful
      }
    } catch (err: any) {
      setThumbnailError(err?.message || 'Failed to generate thumbnail suggestions. Please try again.');
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  const handleGenerateClipPlan = async () => {
    if (!result) return;

    const target = Math.max(15, Math.min(180, Math.round(Number(shortsTargetSeconds) || 0)));
    if (!target) {
      setClipPlanError('Please enter target duration in seconds.');
      return;
    }

    const keyToUse = apiKeys.find(k => k.active)?.key?.trim();
    if (!keyToUse) {
      setClipPlanError('Add and activate an API key first to generate clip plan.');
      return;
    }

    const provider = modelProvider(selectedModel);
    const detectedProvider = inferKeyProvider(keyToUse);
    if (detectedProvider !== 'unknown' && detectedProvider !== provider) {
      setClipPlanError(`Active key looks like ${detectedProvider.toUpperCase()}, but selected model requires ${provider.toUpperCase()}.`);
      return;
    }

    setGeneratingClipPlan(true);
    setClipPlanError(null);
    setResult((prev) => prev ? { ...prev, shortsClipPlan: [] } : prev);

    try {
      const payload = {
        videoUrl: url.trim(),
        channelName: channelName.trim() || 'Dispatch Raw',
        primaryTitle: result.titles?.[0] || 'Video timeline',
        summary: result.summaryEnglish || result.summaryUrdu || '',
        description: result.description || '',
        targetDurationSeconds: target,
      };

      const plan = provider === 'groq'
        ? await generateShortsClipPlanWithGroq(keyToUse, selectedModel, payload)
        : await generateShortsClipPlan(keyToUse, selectedModel, payload);

      setResult((prev) => prev ? { ...prev, shortsClipPlan: plan } : prev);
      setShortsTargetSeconds(target);
    } catch (err: any) {
      const rawMessage = String(err?.message || 'Failed to generate clip plan. Please try again.');
      const isTranscriptIssue = /transcript|caption/i.test(rawMessage);
      const userMessage = isTranscriptIssue
        ? 'Clip plan generate nahi ho saka: is video ka transcript/caption available nahi hai, isliye exact timeline extraction block ki gayi hai.'
        : rawMessage;

      setResult((prev) => prev ? { ...prev, shortsClipPlan: [] } : prev);
      setClipPlanError(userMessage);

      if (isTranscriptIssue && typeof window !== 'undefined') {
        window.alert(userMessage);
      }
    } finally {
      setGeneratingClipPlan(false);
    }
  };

  const getPreviewSize = (ratio: ThumbnailRatioOption): { width: number; height: number } => {
    if (ratio === '9:16') return { width: 720, height: 1280 };
    if (ratio === '1:1') return { width: 1080, height: 1080 };
    return { width: 1280, height: 720 };
  };

  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });

  const handleGenerateFinalThumbnail = async (suggestion: ThumbnailSuggestion) => {
    try {
      setGeneratingFinalThumbnail(true);
      setThumbnailError(null);
      
      // Generate professional 8K prompt
      const professionalPrompt = await generateProfessionalThumbnailPrompt({
        channelName: channelName.trim() || 'Dispatch Raw',
        settings: thumbnailSettings,
        concept: suggestion,
        contextTitle: result?.titles?.[0] || suggestion.title,
        contextSummary: result?.summaryEnglish || result?.summaryUrdu || '',
      });
      
      setThumbnailPromptText(professionalPrompt);
      setThumbnailFinalUrl(null);
      setThumbnailAdjustedUrl(null);
      setThumbnailAdjustedFilters({ brightness: 0, contrast: 0, saturation: 0, vibrance: 0 });
      setThumbnailUsedHooks([...thumbnailUsedHooks, suggestion.hookText]);
    } catch (err: any) {
      setThumbnailError(err?.message || 'Failed to generate thumbnail prompt.');
    } finally {
      setGeneratingFinalThumbnail(false);
    }
  };

  const handleDownloadThumbnail = () => {
    if (!thumbnailFinalUrl) return;
    const a = document.createElement('a');
    a.href = thumbnailAdjustedUrl || thumbnailFinalUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = `thumbnail-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const applyFiltersToThumbnail = async (imageUrl: string, filters: typeof thumbnailAdjustedFilters) => {
    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // Apply filters as CSS filter string
      const brightnessVal = 1 + (filters.brightness / 100);
      const contrastVal = 1 + (filters.contrast / 100);
      const saturationVal = 1 + (filters.saturation / 100);
      const vibranceVal = 1 + (filters.vibrance / 120);
      const filterString = `brightness(${brightnessVal}) contrast(${contrastVal}) saturate(${saturationVal * vibranceVal})`;
      
      ctx.filter = filterString;
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';

      return canvas.toDataURL('image/png', 0.96);
    } catch (err) {
      console.error('Filter application failed:', err);
      return imageUrl;
    }
  };

  const handleFilterChange = async (filterType: keyof typeof thumbnailAdjustedFilters, value: number) => {
    if (!thumbnailFinalUrl) return;

    const newFilters = { ...thumbnailAdjustedFilters, [filterType]: value };
    setThumbnailAdjustedFilters(newFilters);

    // Apply filters to image
    const adjustedUrl = await applyFiltersToThumbnail(thumbnailFinalUrl, newFilters);
    setThumbnailAdjustedUrl(adjustedUrl);
  };

  const handleSaveAdjustedThumbnail = () => {
    if (!thumbnailAdjustedUrl) return;
    // Replace original with adjusted
    setThumbnailFinalUrl(thumbnailAdjustedUrl);
    setThumbnailAdjustedUrl(null);
    setThumbnailAdjustedFilters({ brightness: 0, contrast: 0, saturation: 0, vibrance: 0 });
    showToast('Adjusted thumbnail saved.', 'success', 3200);
  };

  const seoQuality = useMemo<SeoQualityScore | null>(() => {
    if (!result) return null;

    const titles = result.titles ?? [];
    const titleHashtagCounts = titles.map((title) => (title.match(/#[A-Za-z0-9_]+/g) || []).length);
    const strongLengthTitles = titles.filter((title) => {
      const len = title.trim().length;
      return len >= 45 && len <= 95;
    }).length;
    const curiosityHooks = titles.filter((title) => /(shocking|revealed|caught|truth|secret|proof|must watch|viral|unseen|exposed|danger)/i.test(title)).length;
    const titleStrength = Math.max(0, Math.min(100,
      Math.round(
        ((Math.min(titles.length, 3) / 3) * 35) +
        ((strongLengthTitles / Math.max(1, titles.length)) * 35) +
        ((curiosityHooks / Math.max(1, titles.length)) * 20) +
        ((titleHashtagCounts.filter((c) => c >= 2).length / Math.max(1, titles.length)) * 10)
      )
    ));

    const descriptionHashtags = result.description.match(/#[A-Za-z0-9_]+/g) || [];
    const tagList = result.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const uniqueHashtags = new Set(descriptionHashtags.map((tag) => tag.toLowerCase()));
    const uniqueTags = new Set(tagList);
    const hashtagDiversity = Math.max(0, Math.min(100,
      Math.round(
        (Math.min(uniqueHashtags.size, 16) / 16) * 45 +
        (Math.min(uniqueTags.size, 25) / 25) * 40 +
        ((uniqueTags.size > 0 ? Math.min(uniqueHashtags.size / uniqueTags.size, 1) : 0) * 15)
      )
    ));

    const riskyPattern = /(blood|gore|kill|murder|execution|suicide|terror|graphic violence|nsfw)/i;
    const safetyText = `${result.description}\n${titles.join('\n')}`;
    const hasRiskyTerms = riskyPattern.test(safetyText);
    const hasDisclaimer = /disclaimer/i.test(result.description);
    const policySafety = Math.max(0, Math.min(100,
      (hasDisclaimer ? 80 : 50) + (hasRiskyTerms ? -20 : 20)
    ));

    const overall = Math.round((titleStrength * 0.4) + (hashtagDiversity * 0.35) + (policySafety * 0.25));
    const insights: string[] = [];
    insights.push(titleStrength >= 75 ? 'Titles are strong for CTR with good hook quality.' : 'Strengthen title hooks and keep each title around 45-95 chars.');
    insights.push(hashtagDiversity >= 70 ? 'Hashtag and tag spread is healthy for discoverability.' : 'Increase unique hashtags in description and diversify hidden tags.');
    insights.push(policySafety >= 80 ? 'Policy-safety language looks healthy for broader distribution.' : 'Improve compliance wording and keep disclaimer clearly visible.');

    return {
      overall,
      titleStrength,
      hashtagDiversity,
      policySafety,
      insights,
    };
  }, [result]);

  const clipPlanStats = useMemo(() => {
    const clips = result?.shortsClipPlan || [];
    const total = clips.reduce((sum, clip) => sum + (Number(clip.durationSeconds) || 0), 0);
    const delta = Math.abs(total - shortsTargetSeconds);
    return {
      total,
      delta,
      isAligned: clips.length > 0 && delta <= 1,
    };
  }, [result, shortsTargetSeconds]);

  const updateChannelName = () => {
    const normalized = channelDraft.trim();
    if (!normalized) return;
    setChannelName(normalized);
    setError(null);
    showToast('Channel name updated successfully.', 'success', 3500);
  };

  const clearChannelName = () => {
    localStorage.removeItem('dispatch_channel_name');
    setChannelName('');
    setChannelDraft('');
    showToast('Channel name cleared.', 'warning', 3500);
  };

  return (
    <ErrorBoundary>
      <div
        className={cn(
          "min-h-screen pb-20 transition-all adaptive-shell",
          theme === 'dark' ? "bg-black dark" : "bg-white",
          isCompactViewport ? "is-compact-viewport" : "is-wide-viewport",
          isLowPerformanceDevice ? "is-low-perf" : "is-high-perf"
        )}
      >
        {/* Premium 'Neural' Header with Animated Background */}
        <header className={cn(
          "sticky top-0 z-50 border-b transition-all duration-700 backdrop-blur-xl overflow-hidden relative isolate",
          theme === 'dark' ? "border-white/5 bg-black/40" : "border-zinc-200/50 bg-white/40"
        )}>
          {/* Beautiful Animated Background Container */}
          <div className="header-animated-bg style-final">
            <div className="header-energy-beam"></div>

            {/* Floating colored blobs */}
            <div className="header-blob-red"></div>
            <div className="header-blob-blue"></div>
            <div className="header-blob-purple"></div>
            <div className="header-blob-emerald"></div>
            
            {/* Shimmer overlay effect */}
            <div className="header-shimmer"></div>
            
            {/* Glow lines */}
            <div className="header-glow-top"></div>
            <div className="header-glow-bottom"></div>
          </div>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 sm:h-20 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-1.5 sm:gap-4 min-w-0">
              <div className="app-logo-shell w-10 h-10 sm:w-12 sm:h-12 rounded-2xl police-gradient flex items-center justify-center p-0.5 active:scale-95 transition-all shrink-0">
                <div className={cn("app-logo-core w-full h-full rounded-[14px] flex items-center justify-center transition-colors", theme === 'dark' ? "bg-black" : "bg-white")}>
                  <Shield className="app-logo-mark text-red-600 dark:text-red-500 w-6 h-6 sm:w-7 sm:h-7 fill-red-500/10" />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base sm:text-2xl tracking-tighter uppercase text-black dark:text-white leading-none truncate">Dispatch <span className="text-red-600 dark:text-red-500">Raw</span></h1>
                <p className="hidden sm:block text-[10px] text-zinc-600 dark:text-zinc-400 font-mono uppercase tracking-[0.3em] mt-1 font-bold">Strategic Intelligence Agency</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-6">
              <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-zinc-400">
                <div className="flex items-center gap-2">
                  <div className="pulsating-dot" />
                  <span>SYSTEM ONLINE: ANALYZING TRENDS 🌐</span>
                </div>
              </div>

              <div className="header-action-row flex items-center gap-1 sm:gap-3">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="header-icon-btn p-2 rounded-lg bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all flex items-center justify-center"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setShowApiSettings(!showApiSettings); setShowHistory(false); setShowSaved(false); setShowProfile(false); }}
                  className={cn(
                    "header-icon-btn p-2 sm:p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showApiSettings
                      ? "bg-blue-600 text-white shadow-blue-500/20"
                      : "bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400 hover:bg-blue-600 hover:text-white"
                  )}
                  title="API Settings"
                >
                  <Key className="w-4 h-4" />
                  <span className="hidden lg:inline">API</span>
                </button>
                <button
                  onClick={() => { setShowSaved(!showSaved); setShowHistory(false); setShowApiSettings(false); setShowProfile(false); }}
                  className={cn(
                    "header-icon-btn p-2 sm:p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showSaved
                      ? "bg-purple-600 text-white shadow-purple-500/20"
                      : "bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-600 hover:text-white"
                  )}
                >
                  <Bookmark className="w-4 h-4" />
                  <span className="hidden lg:inline">Vault</span>
                </button>
                <button
                  onClick={() => { setShowHistory(!showHistory); setShowSaved(false); setShowApiSettings(false); setShowProfile(false); }}
                  className={cn(
                    "header-icon-btn p-2 sm:p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showHistory
                      ? "bg-emerald-600 text-white shadow-emerald-500/20"
                      : "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white"
                  )}
                >
                  <History className="w-4 h-4" />
                  <span className="hidden lg:inline">History</span>
                </button>
                <button
                  onClick={() => { setShowProfile(!showProfile); setShowHistory(false); setShowSaved(false); setShowApiSettings(false); }}
                  className={cn(
                    "header-icon-btn p-2 sm:p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showProfile
                      ? "bg-red-600 text-white shadow-red-500/20"
                      : "bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 hover:bg-red-600 hover:text-white"
                  )}
                  title="Profile Settings"
                >
                  <Youtube className="w-4 h-4" />
                  <span className="hidden lg:inline">Profile</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {showBootLoader && (
          <div className="global-loader-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="global-loader-card">
              <div className="global-loader-spinner" aria-hidden="true" />
              <p className="global-loader-title">Loading...</p>
              <p className="global-loader-subtitle">Preparing your dashboard</p>
            </div>
          </div>
        )}

        <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-8 sm:pt-12">
          {showHistory ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <h2 className="text-3xl font-bold tracking-tighter uppercase text-zinc-900 dark:text-zinc-100">Analysis <span className="text-red-500">History</span></h2>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search history..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className={cn(
                        "w-full border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-red-500/20 focus:border-red-500/50 transition-all",
                        theme === 'dark' ? "bg-black text-white" : "bg-white text-black"
                      )}
                    />
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className={backToProducerBtnClass}
                  >
                    BACK TO PRODUCER
                  </button>
                </div>
              </div>

              {loadingHistory ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-20 opacity-20">
                  <History className="w-20 h-20 mx-auto mb-4" />
                  <p className="font-mono text-sm uppercase tracking-widest">No history found...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {history
                    .filter(item => item.title.toLowerCase().includes(historySearch.toLowerCase()))
                    .map((item) => (
                      <div key={item.id} className="glass-panel rounded-2xl p-4 flex items-center justify-between group hover:border-red-500/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl bg-white dark:bg-black flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-800">
                            <img src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[8px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">Ready</span>
                              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-red-500 transition-colors">{item.title}</h4>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-mono">{new Date(item.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setShowHistory(false); loadFromHistory(item); }}
                            className={theme === "dark" ? "p-2.5 rounded-xl bg-black text-emerald-500 shadow-sm transition-all" : "p-2.5 rounded-xl bg-white text-emerald-600 border border-zinc-100 shadow-sm transition-all"}
                            title="Load Analysis"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this from history?')) {
                                setHistory(prev => prev.filter(h => h.id !== item.id));
                                showToast('History item deleted.', 'warning', 3200);
                              }
                            }}
                            className={theme === "dark" ? "p-2.5 rounded-xl bg-black text-red-500 shadow-sm transition-all" : "p-2.5 rounded-xl bg-white text-red-600 border border-zinc-100 shadow-sm transition-all"}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </motion.div>
          ) : showProfile ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">Channel <span className="text-red-500">Profile</span></h2>
                <button
                  onClick={() => setShowProfile(false)}
                  className={backToProducerBtnClass}
                >
                  BACK TO PRODUCER
                </button>
              </div>

              <div className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  Channel Name Management
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={channelDraft}
                    onChange={(e) => setChannelDraft(e.target.value)}
                    placeholder="Enter your channel name"
                    className={cn(
                      "flex-1 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-red-500/20 focus:border-red-500/50 transition-all",
                      theme === 'dark' ? "bg-black/50 text-white" : "bg-white text-zinc-900"
                    )}
                    aria-label="Channel Name"
                  />
                  <button
                    onClick={updateChannelName}
                    disabled={!channelDraft.trim()}
                    className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider"
                  >
                    Save Name
                  </button>
                  <button
                    onClick={clearChannelName}
                    className="px-4 py-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-bold uppercase tracking-wider"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      setChannelDraft(channelName);
                      setError(null);
                      showToast('Draft reset to current channel name.', 'info', 3000);
                    }}
                    className="px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold uppercase tracking-wider"
                  >
                    Reset Draft
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 font-mono">Active channel: <span className="text-zinc-700 dark:text-zinc-300 font-bold">{channelName || 'Not set'}</span></p>
              </div>
            </motion.div>
          ) : showApiSettings ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">API <span className="text-blue-500">Settings</span></h2>
                <button
                  onClick={() => setShowApiSettings(false)}
                  className={backToProducerBtnClass}
                >
                  BACK TO PRODUCER
                </button>
              </div>

              <div className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-6">
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-500" />
                    Add New API Key
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input
                      type="text"
                      placeholder="Key Label (e.g. My Primary Key)"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className={cn(
                        "border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-blue-500/20 focus:border-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-black/50 text-white" : "bg-white text-zinc-900"
                      )}
                    />
                    <input
                      type="password"
                      placeholder="Paste Gemini or Groq API Key here..."
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      className={cn(
                        "border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-blue-500/20 focus:border-blue-500/50 transition-all",
                        theme === 'dark' ? "bg-black/50 text-white" : "bg-white text-zinc-900"
                      )}
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (!newKeyName || !newKeyValue) return;
                      const trimmedKey = newKeyValue.trim();
                      const provider = inferKeyProvider(trimmedKey);
                      if (provider === 'unknown') {
                        setError('⚠️ Unknown API key format. Gemini keys usually start with AIza, Groq keys with gsk_.');
                        return;
                      }

                      const id = Date.now().toString();
                      setApiKeys(prev => [
                        ...prev.map(k => ({ ...k, active: false })),
                        { id, name: newKeyName, key: trimmedKey, active: true, provider }
                      ]);
                      setError(null);
                      showToast('API key added and activated.', 'success', 3500);
                      setNewKeyName('');
                      setNewKeyValue('');
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 uppercase tracking-tighter text-xs"
                  >
                    Authorize & Add to Vault
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    Model selection
                  </h3>
                  <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-bold uppercase">Active: {selectedModel}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {AVAILABLE_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={cn(
                        "p-4 rounded-2xl border transition-all text-left relative group overflow-hidden",
                        selectedModel === m.id
                          ? "bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10"
                          : theme === 'dark' ? "bg-black border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300"
                      )}
                    >
                      {selectedModel === m.id && (
                        <div className="absolute top-2 right-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-500" />
                        </div>
                      )}
                      <h4 className={cn(
                        "text-xs font-bold mb-1 uppercase tracking-tighter transition-colors",
                        selectedModel === m.id ? "text-blue-500" : "text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200"
                      )}>{m.name}</h4>
                      <p className="text-[10px] text-zinc-500 lowercase leading-tight">{m.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Stored Keys</h3>
                {apiKeys.length === 0 ? (
                  <div className="text-center py-12 glass-panel rounded-2xl opacity-30">
                    <Key className="w-12 h-12 mx-auto mb-3" />
                    <p className="font-mono text-[10px] uppercase">No API Keys Authorized</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {apiKeys.map((item) => (
                      <div key={item.id} className={cn(
                        "glass-panel rounded-2xl p-4 transition-all border-l-4",
                        item.active ? "border-l-blue-500 bg-blue-500/5" : "border-l-transparent"
                      )}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              item.active ? "bg-blue-500/20 text-blue-500" : theme === 'dark' ? "bg-black text-white" : "bg-white text-zinc-900 border border-zinc-100"
                            )}>
                              <Key className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.name}</h4>
                                {item.active && <span className="text-[8px] font-mono text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase font-bold">Active</span>}
                                <span className="text-[8px] font-mono text-zinc-500 bg-zinc-500/10 px-1.5 py-0.5 rounded uppercase font-bold">{(item.provider || inferKeyProvider(item.key)).toUpperCase()}</span>
                              </div>
                              <p className="text-[10px] text-zinc-500 font-mono">••••••••••••{item.key.slice(-4)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.active && (
                              <button
                                onClick={() => {
                                  setApiKeys(prev => prev.map(k => ({ ...k, active: k.id === item.id })));
                                  showToast(`Activated key: ${item.name}`, 'success', 3200);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-white dark:bg-black text-zinc-600 dark:text-zinc-400 hover:text-blue-500 text-[10px] font-bold uppercase transition-all"
                              >
                                Activate
                              </button>
                            )}
                            <button
                              onClick={() => handleCheckQuota(item.id, item.key)}
                              disabled={checkingQuota === item.id}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase transition-all hover:bg-emerald-500/20 disabled:opacity-50"
                              title="Check API quota status"
                              aria-label="Check quotastatus"
                            >
                              {checkingQuota === item.id ? (
                                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking...</span>
                              ) : 'Check Status'}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Delete this API key?')) {
                                  setApiKeys(prev => prev.filter(k => k.id !== item.id));
                                  showToast(`Deleted key: ${item.name}`, 'warning', 3200);
                                }
                              }}
                              className="p-2 rounded-lg bg-white dark:bg-black text-zinc-400 hover:text-red-500 transition-all"
                              title="Delete API Key"
                              aria-label="Delete API Key"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {/* Quota Status Display */}
                        {quotaInfo[item.id] && (
                          <div className={cn(
                            "mt-3 p-3 rounded-xl border text-xs font-mono flex items-center gap-3",
                            quotaInfo[item.id].status === 'valid' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                              quotaInfo[item.id].status === 'quota_exceeded' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                                "bg-red-500/10 border-red-500/20 text-red-400"
                          )}>
                            <div className={cn(
                              "w-2 h-2 rounded-full animate-pulse",
                              quotaInfo[item.id].status === 'valid' ? "bg-emerald-500" :
                                quotaInfo[item.id].status === 'quota_exceeded' ? "bg-amber-500" :
                                  "bg-red-500"
                            )} />
                            <div>
                              <span className="uppercase font-bold mr-2">
                                {quotaInfo[item.id].status === 'valid' ? '✅ OPERATIONAL' :
                                  quotaInfo[item.id].status === 'quota_exceeded' ? '⚠️ QUOTA EXHAUSTED' :
                                  quotaInfo[item.id].status === 'invalid' ? '❌ INVALID KEY' :
                                    '❌ KEY ERROR'}
                              </span>
                              <span className="text-zinc-500">{quotaInfo[item.id].message}</span>
                              {quotaInfo[item.id].model && <span className="ml-2 text-zinc-600">| Model: {quotaInfo[item.id].model}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                  <span className="text-blue-500 font-bold uppercase mr-2">Security Protocol:</span>
                  Your API keys are stored locally in your browser's LocalStorage. They are never sent to our servers. Keys are used only for direct requests to Gemini or Groq APIs based on selected model.
                </p>
              </div>
            </motion.div>
          ) : showSaved ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">Saved <span className="text-red-500">Vault</span></h2>
                <div className="flex items-center gap-4">
                  {selectedItems.size > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                      <button
                        onClick={handleBulkShare}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-bold hover:bg-zinc-700 transition-all"
                      >
                        <Share2 className="w-3 h-3" />
                        SHARE ({selectedItems.size})
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        DELETE ({selectedItems.size})
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setShowSaved(false)}
                    className={backToProducerBtnClass}
                  >
                    BACK TO PRODUCER
                  </button>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="glass-panel rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search vault..."
                    value={vaultSearch}
                    onChange={(e) => setVaultSearch(e.target.value)}
                    className={cn(
                      "w-full border border-zinc-200 dark:border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-red-500/20 focus:border-red-500/50 transition-all",
                      theme === 'dark' ? "bg-black/50 text-white" : "bg-white text-zinc-900"
                    )}
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={vaultType}
                    onChange={(e) => setVaultType(e.target.value as any)}
                    className={cn(
                      "border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold focus:ring-red-500/20 transition-all",
                      theme === 'dark' ? "bg-black text-white" : "bg-white text-zinc-500"
                    )}
                    aria-label="Filter by vault item type"
                    title="Filter by type"
                  >
                    <option value="all">ALL TYPES</option>
                    <option value="title">TITLES</option>
                    <option value="description">DESCRIPTIONS</option>
                    <option value="tags">TAGS</option>
                  </select>
                  <select
                    value={vaultDate}
                    onChange={(e) => setVaultDate(e.target.value as any)}
                    className={cn(
                      "border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold focus:ring-red-500/20 transition-all",
                      theme === 'dark' ? "bg-black text-white" : "bg-white text-zinc-500"
                    )}
                    aria-label="Filter by vault item date"
                    title="Filter by date"
                  >
                    <option value="all">ALL TIME</option>
                    <option value="today">TODAY</option>
                    <option value="week">THIS WEEK</option>
                    <option value="month">THIS MONTH</option>
                  </select>
                </div>
              </div>

              {loadingSaved ? (
                <SavedItemSkeleton />
              ) : filteredSavedItems.length === 0 ? (
                <div className={cn("text-center py-20 opacity-20", theme === 'dark' ? "text-white" : "text-black")}>
                  <Bookmark className="w-20 h-20 mx-auto mb-4" />
                  <p className="font-mono text-sm uppercase tracking-widest">
                    {vaultSearch ? "No matches found..." : "Vault is Empty..."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {filteredSavedItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box relative group transition-all border-l-4",
                        selectedItems.has(item.id) ? "border-l-red-500 bg-red-500/5" : "border-l-transparent"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => toggleSelectItem(item.id)}
                            className="w-4 h-4 rounded border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-red-500 focus:ring-red-500/20 focus:ring-offset-0"
                            aria-label={`Select item ${item.id}`}
                            title="Select vault item"
                          />
                          <div className={cn(
                            "px-2 py-1 rounded text-[10px] font-mono uppercase",
                            item.type === 'title' ? "bg-red-500/20 text-red-500" :
                              item.type === 'tags' ? "bg-emerald-500/20 text-emerald-500" :
                                "bg-purple-500/20 text-purple-500"
                          )}>
                            {item.type}
                          </div>
                          <span className="text-[10px] text-zinc-600 font-mono">{new Date(item.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (editingId === item.id) {
                                setEditingId(null);
                              } else {
                                setEditingId(item.id);
                                setEditContent(item.content);
                              }
                            }}
                            className={cn(
                              "p-1.5 rounded-md transition-all",
                              editingId === item.id ? "text-emerald-500 bg-emerald-500/10" : "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800"
                            )}
                            title="Edit Content"
                            aria-label="Edit or save vault item"
                          >
                            {editingId === item.id ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(item.content, item.id)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all"
                            title="Copy to clipboard"
                            aria-label="Copy content to clipboard"
                          >
                            {copiedField === item.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleSave(item.type, item.content)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all"
                            title="Delete from vault"
                            aria-label="Delete vault item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="prose prose-invert prose-sm max-w-none">
                        {editingId === item.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-zinc-900 dark:text-zinc-200 font-mono text-sm focus:ring-red-500/20 focus:border-red-500/50 transition-all min-h-[100px]"
                              autoFocus
                              aria-label="Edit vault item content"
                              title="Edit content"
                            />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isAutoSaving && (
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-500 animate-pulse">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    AUTO-SAVING...
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 uppercase"
                              >
                                DONE
                              </button>
                            </div>
                          </div>
                        ) : (
                          item.type === 'description' ? (
                            <div className="font-mono text-zinc-400"><Markdown>{item.content}</Markdown></div>
                          ) : (
                            <p className="text-zinc-200 font-medium">{item.content}</p>
                          )
                        )}
                      </div>
                      {item.videoUrl && (
                        <div className="mt-4 pt-4 border-t border-zinc-800/50">
                          <a
                            href={ensureAbsoluteUrl(item.videoUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono flex items-center gap-1"
                          >
                            <Youtube className="w-3 h-3" />
                            ORIGINAL VIDEO
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <>
              {/* Hero Section */}
              <div className="text-center mb-12">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-4xl sm:text-6xl font-bold tracking-tighter mb-4 uppercase"
                >
                  FINAL <span className="neon-red-glow">PRODUCTION</span>
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-black dark:text-[#B0B0B0] max-w-xl mx-auto text-sm sm:text-base font-black tracking-widest uppercase"
                >
                  ALGORITHM DOMINATION ENGINE | DEEP CONTENT FORENSICS
                </motion.p>
              </div>

              {/* Search Bar - Ultimate Premium 'Alive' Interface */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01 }}
                className="relative group mb-16 mx-auto max-w-2xl px-2"
              >
                {/* Perpetual Glow Layers - Intelligent Reactive Logic */}
                <div className={cn(
                  "absolute -inset-1 bg-gradient-to-r from-red-600 via-blue-500 to-red-600 rounded-[2rem] blur-xl transition duration-700",
                  (url || loading) ? "opacity-70" : "opacity-20 group-hover:opacity-60 group-focus-within:opacity-70 animate-pulse group-hover:animate-none group-focus-within:animate-none"
                )}></div>
                <div className={cn(
                  "absolute -inset-0.5 bg-gradient-to-r from-red-600 to-blue-600 rounded-[2rem] blur transition duration-500",
                  (url || loading) ? "opacity-80 blur-md" : "opacity-25 group-hover:opacity-80 group-focus-within:opacity-90 group-hover:blur-md"
                )}></div>

                <form onSubmit={handleAnalyze} className={cn(
                  "relative flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 backdrop-blur-3xl rounded-3xl border border-zinc-200 dark:border-white/10 p-2 sm:p-1.5 transition-all duration-700 focus-within:ring-2 focus-within:ring-red-500/50",
                  theme === 'dark' ? "bg-black/80 shadow-none" : "bg-white shadow-[0_15px_60px_-15px_rgba(0,0,0,0.1)] group-hover:shadow-[0_20px_80px_-10px_rgba(0,0,0,0.2)]"
                )}>
                  <div className="w-full flex items-center">
                    <div className="pl-3 sm:pl-4 text-red-600 dark:text-red-500">
                      <Youtube className="w-5 h-5 sm:w-6 sm:h-6 fill-red-600/10" />
                    </div>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="PASTE YOUTUBE URL..."
                      className={cn(
                        "w-full bg-transparent border-none focus:ring-0 px-4 sm:px-6 py-3.5 sm:py-5 font-black tracking-tight text-sm outline-none selection:bg-red-500/30",
                        theme === 'dark' ? "text-white placeholder:text-zinc-500" : "text-black placeholder:text-zinc-600"
                      )}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full sm:w-auto sm:min-w-[10.25rem] justify-center px-5 sm:px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 uppercase tracking-tighter shadow-xl shadow-red-500/20 active:scale-95",
                      loading
                        ? "bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                        : "bg-red-600 text-white hover:bg-red-500"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Radar className="w-4 h-4" />
                        <span>Analyze</span>
                      </>
                    )}
                  </button>
                </form>


              </motion.div>

              {/* Recent Analytics Archive */}
              {history.length > 0 && !loading && !result && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mb-16"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-6 bg-red-500 rounded-full" />
                      <h3 className="text-lg font-bold tracking-tighter uppercase text-zinc-900 dark:text-zinc-100">Recent Analytics Archive</h3>
                    </div>
                    <button
                      onClick={() => setShowHistory(true)}
                      className="text-[10px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 uppercase tracking-widest"
                    >
                      View All Archive
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {history.slice(0, 6).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => loadFromHistory(item)}
                        className="group relative glass-panel rounded-2xl p-4 text-left transition-all hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/5 overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="relative flex gap-4">
                          <div className="w-16 h-16 rounded-xl bg-white dark:bg-black flex-shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-800 opacity-60 group-hover:opacity-100 transition-opacity">
                            <img
                              src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-mono text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase font-bold">Ready</span>
                              <span className="text-[8px] font-mono text-zinc-600 dark:text-zinc-500 font-bold">{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                            <h4 className="text-xs font-black text-black dark:text-zinc-100 truncate mb-1 group-hover:text-red-500 transition-colors">
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1 text-[9px] text-zinc-600 dark:text-zinc-500 font-mono uppercase font-bold">
                              <div className="w-1 h-1 rounded-full bg-red-500" />
                              High-Retention
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Error State */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 mb-8"
                  >
                    <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-red-200 text-sm">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Results Section */}
              <div id="results-section">
                {loading && <LoadingResults step={loadingStep} />}

                {result && (
                  <div className="space-y-8">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <button
                        onClick={handleBackToHomePage}
                        className={cn(
                          'group inline-flex h-9 sm:h-10 max-w-full min-w-[8.75rem] sm:min-w-[10.5rem] items-center justify-between rounded-lg px-3 sm:px-3.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wide transition-all border',
                          theme === 'dark'
                            ? 'border-emerald-400/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 text-emerald-300 hover:border-emerald-300/70 hover:shadow-[0_0_24px_rgba(16,185,129,0.25)]'
                            : 'border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 text-emerald-800 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        )}
                        title="Go to home page"
                      >
                        <span>Back Home</span>
                        <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </button>

                    {optimalUploadTime && audienceActivityData && (
                        <button
                          onClick={() => focusUploadOptimizerSection(true)}
                          className={cn(
                            'group inline-flex h-9 sm:h-10 max-w-full min-w-[8.75rem] sm:min-w-[10.5rem] items-center justify-between rounded-lg px-3 sm:px-3.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wide transition-all border',
                            theme === 'dark'
                              ? 'border-cyan-400/40 bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-blue-500/10 text-cyan-300 hover:border-cyan-300/70 hover:shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                              : 'border-cyan-300 bg-gradient-to-r from-cyan-50 via-sky-50 to-blue-50 text-cyan-800 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]'
                          )}
                          title="Go to Upload Time Optimizer"
                        >
                          <span>Upload Studio</span>
                          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </button>
                    )}
                    </div>

                    {/* Video Preview */}
                    {videoId && (
                      <section className="glass-panel rounded-2xl overflow-hidden shadow-2xl shadow-red-500/10 border-red-500/20">
                        <div className="aspect-video w-full">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        </div>
                      </section>
                    )}

                    {/* Summary Section */}
                    <section className={cn("rounded-2xl overflow-hidden border", theme === 'dark' ? "bg-black border-white/10" : "bg-white border-zinc-200 shadow-sm")}>
                      <div className={cn("p-6 border-b flex items-center justify-between", theme === 'dark' ? "border-zinc-800" : "border-zinc-100")}>
                        <div className="flex items-center gap-3">
                          <Globe className="text-blue-500 w-5 h-5" />
                          <h3 className="font-bold uppercase tracking-wider text-sm">Contextual Summary</h3>
                        </div>
                        <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
                          <button
                            onClick={() => setSummaryLang('en')}
                            className={cn(
                              "px-3 py-1 text-xs font-bold rounded-md transition-all",
                              summaryLang === 'en' ? "bg-white dark:bg-black text-zinc-950 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                            )}
                          >
                            ENGLISH
                          </button>
                          <button
                            onClick={() => setSummaryLang('ur')}
                            className={cn(
                              "px-3 py-1 text-xs font-bold rounded-md transition-all",
                              summaryLang === 'ur' ? "bg-white dark:bg-black text-zinc-950 dark:text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                            )}
                          >
                            URDU
                          </button>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className={cn("prose prose-sm max-w-none leading-relaxed italic", theme === 'dark' ? "prose-invert text-zinc-300" : "text-zinc-900")}>
                          <Markdown>
                            {summaryLang === 'en' ? result.summaryEnglish : result.summaryUrdu}
                          </Markdown>
                        </div>
                      </div>
                    </section>

                    {seoQuality && (
                      <section className={cn("rounded-2xl overflow-hidden border", theme === 'dark' ? "bg-black border-white/10" : "bg-white border-zinc-200 shadow-sm")}>
                        <div className={cn("p-5 sm:p-6 border-b flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between", theme === 'dark' ? "border-zinc-800" : "border-zinc-100")}>
                          <div className="flex items-center gap-3">
                            <Cpu className="text-blue-500 w-5 h-5" />
                            <h3 className="font-bold uppercase tracking-wider text-sm">AI SEO Quality Score</h3>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-lg text-sm font-black",
                            seoQuality.overall >= 80 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                              seoQuality.overall >= 65 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                                "bg-red-500/15 text-red-600 dark:text-red-400"
                          )}>
                            SCORE: {seoQuality.overall}/100
                          </div>
                        </div>
                        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className={cn("rounded-xl p-4 border", theme === 'dark' ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-zinc-50")}>
                            <p className="text-[11px] uppercase font-bold tracking-wide text-zinc-500 mb-2">Title Strength</p>
                            <p className="text-2xl font-black text-red-500">{seoQuality.titleStrength}</p>
                          </div>
                          <div className={cn("rounded-xl p-4 border", theme === 'dark' ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-zinc-50")}>
                            <p className="text-[11px] uppercase font-bold tracking-wide text-zinc-500 mb-2">Hashtag Diversity</p>
                            <p className="text-2xl font-black text-emerald-500">{seoQuality.hashtagDiversity}</p>
                          </div>
                          <div className={cn("rounded-xl p-4 border", theme === 'dark' ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-zinc-50")}>
                            <p className="text-[11px] uppercase font-bold tracking-wide text-zinc-500 mb-2">Policy Safety</p>
                            <p className="text-2xl font-black text-blue-500">{seoQuality.policySafety}</p>
                          </div>
                        </div>
                        <div className={cn("px-5 sm:px-6 pb-6", theme === 'dark' ? "text-zinc-300" : "text-zinc-700")}>
                          <ul className="space-y-2 text-xs sm:text-sm">
                            {seoQuality.insights.map((insight, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                                <span>{insight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </section>
                    )}

                    {/* SEO Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Titles */}
                      <section className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <TrendingUp className="text-red-500 w-5 h-5" />
                            <h3 className="font-bold uppercase tracking-wider text-sm">Viral Titles</h3>
                          </div>
                          <div className="flex items-center gap-4">
                            <FeedbackButtons section="titles" />
                            <div className="w-px h-4 bg-zinc-800" />
                            <button
                              onClick={() => handleShare(result.titles.join('\n'), 'Viral Titles')}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all"
                              title="Share Titles"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {result.titles?.map((title, i) => (
                            <div key={i} className={cn(
                              "group relative border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 transition-all",
                              theme === 'dark' ? "bg-black hover:border-red-500/50" : "bg-white hover:border-red-500/30"
                            )}>
                              <p className={cn(
                                "text-sm font-black pr-24 leading-relaxed",
                                theme === 'dark' ? "text-white" : "text-black"
                              )}>
                                {title}
                              </p>
                              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleSave('title', title)}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-all",
                                    isSaved('title', title) ? "text-red-500 bg-red-50" : "text-zinc-400 hover:text-red-500 hover:bg-red-50"
                                  )}
                                  title="Save Title"
                                >
                                  {isSaved('title', title) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(title, `title-${i}`)}
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-all"
                                >
                                  {copiedField === `title-${i}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Tags */}
                      <section className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <Tag className="text-emerald-500 w-5 h-5" />
                            <h3 className="font-bold uppercase tracking-wider text-sm">Hidden Tags</h3>
                          </div>
                          <div className="flex items-center gap-4">
                            <FeedbackButtons section="tags" />
                            <div className="w-px h-4 bg-zinc-800" />
                            <button
                              onClick={() => handleSave('tags', result.tags)}
                              className={cn(
                                "p-1.5 rounded-md transition-all",
                                isSaved('tags', result.tags) ? "text-emerald-500 bg-emerald-500/10" : "text-zinc-500 hover:text-emerald-500 hover:bg-emerald-500/10"
                              )}
                              title="Save Tags"
                            >
                              {isSaved('tags', result.tags) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div className={cn("rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 relative group shadow-sm dark:shadow-inner", theme === 'dark' ? "bg-black" : "bg-zinc-50/50")}>
                          <p className={cn(
                            "text-xs font-mono font-bold leading-relaxed break-all",
                            theme === 'dark' ? "text-zinc-400" : "text-zinc-800"
                          )}>
                            {result.tags}
                          </p>
                          <button
                            onClick={() => copyToClipboard(result.tags, 'tags')}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {copiedField === 'tags' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-4 font-mono">COPY AND PASTE INTO YOUTUBE STUDIO TAGS SECTION</p>
                      </section>
                    </div>

                    {/* Description */}
                    <section className="glass-panel rounded-2xl overflow-hidden">
                      <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <MessageSquare className="text-purple-500 w-5 h-5" />
                          <h3 className="font-bold uppercase tracking-wider text-sm">Catchify Description</h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <FeedbackButtons section="description" />
                          <div className="w-px h-4 bg-zinc-800" />
                          <button
                            onClick={() => handleSave('description', result.description)}
                            className={cn(
                              "p-1.5 rounded-md transition-all",
                              isSaved('description', result.description) ? "text-purple-500 bg-purple-500/10" : "text-zinc-500 hover:text-purple-500 hover:bg-purple-500/10"
                            )}
                            title="Save Description"
                          >
                            {isSaved('description', result.description) ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </button>
                          <div className="w-px h-4 bg-zinc-800" />
                          <button
                            onClick={() => handleShare(result.description, 'Video Description')}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-all"
                            title="Share Description"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <div className="w-px h-4 bg-zinc-800" />
                          <button
                            onClick={() => copyToClipboard(result.description, 'desc')}
                            className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-100 transition-colors"
                          >
                            {copiedField === 'desc' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            <span>COPY ALL</span>
                          </button>
                        </div>
                      </div>
                      <div className={cn("p-6", theme === 'dark' ? "bg-black/50" : "bg-white")}>
                        <div className={cn("prose prose-sm max-w-none font-bold", theme === 'dark' ? "prose-invert text-zinc-400" : "text-black")}>
                          <Markdown>{result.description}</Markdown>
                        </div>
                      </div>
                    </section>

                    {/* Shorts Clip Plan */}
                    <section className="pt-8 mb-4">
                      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5 mb-5 bg-zinc-50/60 dark:bg-zinc-950/60">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                          <div className="w-full sm:w-64">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Total Short Duration (seconds)</label>
                            <input
                              type="number"
                              min={15}
                              max={180}
                              step={1}
                              value={shortsTargetSeconds}
                              onChange={(e) => {
                                setShortsTargetSeconds(Number(e.target.value));
                                setClipPlanError(null);
                              }}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Total short duration in seconds"
                            />
                          </div>
                          <button
                            onClick={handleGenerateClipPlan}
                            disabled={generatingClipPlan}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider"
                          >
                            {generatingClipPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            {generatingClipPlan ? 'Generating...' : 'Generate Clip Plan'}
                          </button>
                        </div>
                        <p className="text-[10px] mt-2 font-mono uppercase tracking-wider text-zinc-500">
                          Enter your target short duration first, then generate exact hook, middle, and end clip ranges.
                        </p>
                        {result?.shortsClipPlan?.length > 0 && (
                          <p className={cn(
                            "text-[10px] mt-1 font-mono uppercase tracking-wider",
                            clipPlanStats.isAligned ? "text-emerald-500" : "text-amber-500"
                          )}>
                            Generated total {clipPlanStats.total}s vs target {shortsTargetSeconds}s
                          </p>
                        )}
                        {clipPlanError && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-red-500 font-medium">{clipPlanError}</p>
                          </div>
                        )}
                      </div>

                      {result.shortsClipPlan && result.shortsClipPlan.length > 0 && (
                        <>
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Zap className="text-white w-4 h-4 fill-current" />
                            </div>
                            <h3 className="text-2xl font-bold tracking-tighter uppercase">Short Video Clip Plan</h3>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {result.shortsClipPlan.map((clip, i) => {
                              const [startTime, endTime] = clip.timeRange.split('-').map(t => t.trim());
                              return (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: 0.2 + (i * 0.1) }}
                                  className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-2 border-emerald-500/40 hover:border-emerald-500/60 transition-colors space-y-3"
                                >
                                  {/* Segment Title */}
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-emerald-500 font-mono font-black text-lg">0{i + 1} - {clip.segment}</div>
                                    <div className="bg-emerald-500/20 px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400">
                                      {clip.durationSeconds}s
                                    </div>
                                  </div>
                                  
                                  {/* Timestamp - LARGE AND PROMINENT */}
                                  <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3 space-y-1.5">
                                    <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Extract from YouTube:</div>
                                    <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                                      FROM <span className="text-base text-emerald-500">{startTime}</span>
                                    </div>
                                    <div className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                                      TO <span className="text-base text-emerald-500">{endTime}</span>
                                    </div>
                                  </div>
                                  
                                  {/* CapCut Instruction */}
                                  <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed border-t border-emerald-500/20 pt-3">
                                    {clip.editInstruction}
                                  </p>
                                </motion.div>
                              );
                            })}
                          </div>
                          <p className="text-[11px] mt-3 font-mono uppercase tracking-wider text-zinc-500 bg-zinc-100/50 dark:bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            ⏱️ EXACT YouTube timestamps - Go to video at each time and extract these clip ranges using CapCut
                          </p>
                        </>
                      )}
                    </section>

                    <section className={cn("rounded-2xl overflow-hidden border", theme === 'dark' ? "bg-black border-white/10" : "bg-white border-zinc-200 shadow-sm")}>
                      <div className={cn("p-5 sm:p-6 border-b", theme === 'dark' ? "border-zinc-800" : "border-zinc-100")}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Image className="w-5 h-5 text-red-500" />
                            <h3 className="font-bold uppercase tracking-wider text-sm">Thumbnail Generator Lab</h3>
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                            Click generate when you are ready
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
                          Settings are auto-filled from video analysis. You can customize and then generate premium thumbnail concepts.
                        </p>
                      </div>

                      <div className="p-5 sm:p-6 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Ratio</label>
                            <select
                              value={thumbnailSettings.ratio}
                              onChange={(e) => setThumbnailSettings((prev) => ({ ...prev, ratio: e.target.value as ThumbnailRatioOption }))}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Thumbnail ratio"
                            >
                              <option value="16:9">16:9 (Landscape)</option>
                              <option value="9:16">9:16 (Shorts Vertical)</option>
                              <option value="1:1">1:1 (Square)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Style</label>
                            <select
                              value={thumbnailSettings.style}
                              onChange={(e) => setThumbnailSettings((prev) => ({ ...prev, style: e.target.value as ThumbnailStyleOption }))}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Thumbnail style"
                            >
                              <option value="auto">Auto (AI picks)</option>
                              <option value="realistic">Realistic</option>
                              <option value="cinematic">Cinematic</option>
                              <option value="cartoon">Cartoon</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Tone</label>
                            <select
                              value={thumbnailSettings.tone}
                              onChange={(e) => setThumbnailSettings((prev) => ({ ...prev, tone: e.target.value as ThumbnailToneOption }))}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Thumbnail tone"
                            >
                              <option value="urgent">Urgent</option>
                              <option value="mystery">Mystery</option>
                              <option value="authority">Authority</option>
                              <option value="emotional">Emotional</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Text Density</label>
                            <select
                              value={thumbnailSettings.textDensity}
                              onChange={(e) => setThumbnailSettings((prev) => ({ ...prev, textDensity: e.target.value as ThumbnailTextDensityOption }))}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Thumbnail text density"
                            >
                              <option value="minimal">Minimal</option>
                              <option value="balanced">Balanced</option>
                              <option value="bold">Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Font Style</label>
                            <select
                              value={thumbnailSettings.fontStyle}
                              onChange={(e) => setThumbnailSettings((prev) => ({ ...prev, fontStyle: e.target.value as ThumbnailFontStyleOption }))}
                              className={cn(
                                "w-full rounded-xl px-3 py-2.5 text-xs border focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50",
                                theme === 'dark' ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-900"
                              )}
                              aria-label="Thumbnail font style"
                            >
                              <option value="default">Default (Current)</option>
                              <option value="impact">Impact</option>
                              <option value="modern">Modern Sans</option>
                              <option value="news">News Bold</option>
                              <option value="condensed">Condensed</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <button
                            onClick={() => handleGenerateThumbnailSuggestion('fresh')}
                            disabled={generatingThumbnails}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider"
                          >
                            {generatingThumbnails ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Generate Thumbnail Concept
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleGenerateThumbnailSuggestion('another')}
                            disabled={generatingThumbnails || !thumbnailSuggestion}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-zinc-800 dark:text-zinc-100 text-xs font-black uppercase tracking-wider"
                          >
                            Another Concept
                          </button>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            Credit-safe mode: one concept per click.
                          </p>
                        </div>

                        {thumbnailError && (
                          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500">
                            {thumbnailError}
                          </div>
                        )}

                        {thumbnailSuggestion ? (
                          <div className={cn(
                            "rounded-2xl p-4 sm:p-5 border",
                            theme === 'dark' ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-zinc-50"
                          )}>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                              <div>
                                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">Current Concept</p>
                                <h4 className="text-sm sm:text-base font-black text-zinc-900 dark:text-zinc-100">{thumbnailSuggestion.title}</h4>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleGenerateFinalThumbnail(thumbnailSuggestion)}
                                  disabled={generatingFinalThumbnail}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {generatingFinalThumbnail ? 'Generating...' : 'Generate Professional Prompt'}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(thumbnailSuggestion.visualPrompt, 'thumb-prompt-current')}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                                >
                                  {copiedField === 'thumb-prompt-current' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  Copy Prompt
                                </button>
                              </div>
                            </div>

                            {thumbnailPromptText && (
                              <div className="mb-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
                                <div className="p-4 bg-gradient-to-r from-red-600 to-red-700 border-b border-zinc-200 dark:border-zinc-800">
                                  <p className="text-[10px] font-mono uppercase tracking-widest text-white font-bold">📋 Professional 8K Thumbnail Generation Prompt</p>
                                  <p className="text-[11px] text-red-100 mt-1">Use this prompt with any AI image generation service (Midjourney, Stable Diffusion, etc.)</p>
                                </div>
                                
                                <div className={cn(
                                  "p-4 max-h-96 overflow-y-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
                                  theme === 'dark' ? "bg-zinc-950 text-zinc-300" : "bg-white text-zinc-700"
                                )}>
                                  {thumbnailPromptText}
                                </div>

                                <div className="p-3 flex flex-wrap items-center gap-2 justify-between border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950">
                                  <button
                                    onClick={() => copyToClipboard(thumbnailPromptText, 'thumb-final-prompt')}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-600 text-white hover:bg-red-500"
                                  >
                                    {copiedField === 'thumb-final-prompt' ? (<>
                                      <Check className="w-3.5 h-3.5" />
                                      Copied!
                                    </>) : (<>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy Prompt
                                    </>)}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const element = document.createElement('a');
                                      const file = new Blob([thumbnailPromptText], {type: 'text/plain'});
                                      element.href = URL.createObjectURL(file);
                                      element.download = `thumbnail-prompt-${Date.now()}.txt`;
                                      document.body.appendChild(element);
                                      element.click();
                                      document.body.removeChild(element);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Save as Text
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Hook Text</p>
                                  <p className="text-lg font-black text-red-500 leading-tight">{thumbnailSuggestion.hookText}</p>
                                  {thumbnailSuggestion.supportingText && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{thumbnailSuggestion.supportingText}</p>}
                                </div>
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Composition</p>
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{thumbnailSuggestion.composition}</p>
                                </div>
                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                  <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Color + Style</p>
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{thumbnailSuggestion.colorDirection}</p>
                                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1">{thumbnailSuggestion.styleNotes}</p>
                                </div>
                              </div>
                              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Generation Prompt</p>
                                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">{thumbnailSuggestion.visualPrompt}</p>
                                {thumbnailSuggestion.negativePrompt && (
                                  <>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-3 mb-1">Negative Prompt</p>
                                    <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words leading-relaxed">{thumbnailSuggestion.negativePrompt}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className={cn(
                            "rounded-xl border border-dashed p-4 text-xs",
                            theme === 'dark' ? "border-zinc-800 text-zinc-500" : "border-zinc-300 text-zinc-600"
                          )}>
                            No concept generated yet. Click Generate Thumbnail Concept to get one idea at a time.
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Upload Time Optimizer */}
                    {optimalUploadTime && audienceActivityData && (
                      <div id="upload-time-optimizer-section" className="space-y-5 scroll-mt-24">
                        <UploadTimeTimer
                          optimalTime={optimalUploadTime}
                          onRefresh={() => handleRefreshUploadTime(true)}
                          onSlotExpired={() => handleRefreshUploadTime(true, true)}
                          isRefreshing={isRefreshingUploadTime}
                          theme={theme}
                        />
                        <AudienceActivityGraph
                          audienceData={audienceActivityData}
                          theme={theme}
                          optimalHour={optimalUploadTime.recommendedHour}
                        />
                      </div>
                    )}

                  </div>
                )}

                {/* Empty State */}
                {
                  !result && !loading && !showSaved && !showApiSettings && !showHistory && (
                    <div className="text-center py-20 opacity-20">
                      <Shield className="w-20 h-20 mx-auto mb-4" />
                      <p className="font-mono text-sm uppercase tracking-widest">Awaiting Input Signal...</p>
                    </div>
                  )
                }
              </div>
            </>
          )}
        </main>

        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          <AnimatePresence>
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -12, x: 16 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: -10, x: 16 }}
                className={cn(
                  'toast-item',
                  toast.kind === 'success' && 'toast-success',
                  toast.kind === 'warning' && 'toast-warning',
                  toast.kind === 'info' && 'toast-info'
                )}
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span>{toast.message}</span>
                <button
                  onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
                  className="toast-close"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div
          className={cn(
            'faq-widget-wrap',
            botVisible ? 'faq-widget-visible' : 'faq-widget-hidden',
            botFolded && 'faq-widget-folded',
            isLowPerformanceDevice && 'faq-widget-low-perf'
          )}
        >
          <AnimatePresence>
            {faqOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.97 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className={cn(
                  'faq-panel',
                  theme === 'dark' ? 'faq-panel-dark' : 'faq-panel-light'
                )}
                role="dialog"
                aria-label="Ask Me panel"
              >
                <div className="faq-panel-head">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sky-500" />
                    <p className="faq-panel-title">Ask Me</p>
                  </div>
                  <div className="askbot-head-actions">
                    <button
                      onClick={() => setFaqOpen(false)}
                      className="askbot-head-icon-btn faq-panel-close"
                      aria-label="Close Ask Me"
                      title="Close Ask Me"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="askbot-banner-line">How can I help you today? Ask anything and get a clear answer.</p>

                <div
                  className={cn(
                    'mx-3 mb-2 rounded-lg border px-2.5 py-2 text-[10px] font-semibold tracking-wide flex flex-wrap items-center gap-x-3 gap-y-1 uppercase',
                    theme === 'dark'
                      ? 'border-zinc-700/70 bg-zinc-900/80 text-zinc-300'
                      : 'border-zinc-300 bg-zinc-100 text-zinc-700'
                  )}
                >
                  <span className={cn('inline-flex items-center gap-1', askBotSessionTerminated ? 'text-rose-500' : 'text-emerald-500')}>
                    <Shield className="w-3 h-3" />
                    Session: {askBotSessionTerminated ? 'Terminated' : 'Active'}
                  </span>
                  <span>Strikes: {askBotStrikeCount}/3</span>
                  <span>CAPACITY: {askBotHourMessageCount}/{ASK_BOT_MAX_MESSAGES_PER_HOUR}</span>
                </div>

                <div className={cn('askbot-chat-list', theme === 'dark' ? 'askbot-chat-dark' : 'askbot-chat-light')} ref={askBotMessagesRef}>
                  {askBotMessages.length === 0 && (
                    <div className="askbot-empty-state">Ask any question to receive clear and focused guidance.</div>
                  )}
                  {askBotMessages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'askbot-row',
                        message.role === 'user' ? 'askbot-row-user' : 'askbot-row-bot'
                      )}
                    >
                      <div
                        className={cn(
                          'askbot-bubble',
                          message.role === 'user' && 'askbot-bubble-user',
                          message.role === 'bot' && 'askbot-bubble-bot',
                          message.role === 'thinking' && 'askbot-bubble-thinking'
                        )}
                      >
                        {message.role === 'thinking' ? (
                          <span className="askbot-thinking-inline" aria-label="Bot is thinking">
                            <span className="askbot-mini-robot" aria-hidden="true">
                              <span className="askbot-mini-robot-head">
                                <span className="askbot-mini-eye"></span>
                                <span className="askbot-mini-eye"></span>
                              </span>
                              <span className="askbot-mini-antenna"></span>
                            </span>
                          </span>
                        ) : (
                          message.text
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="faq-search-row">
                  <input
                    value={faqQuery}
                    onChange={(e) => setFaqQuery(e.target.value)}
                    placeholder={askBotSessionTerminated ? 'Session terminated due to security protocol violation.' : 'Ask your question'}
                    className="faq-search"
                    aria-label="Ask Me"
                    disabled={askBotSessionTerminated}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !helpAgentBusy && !askBotSessionTerminated) askHelpAgent(faqQuery);
                    }}
                  />
                  <button
                    onClick={() => askHelpAgent(faqQuery)}
                    disabled={helpAgentBusy || askBotSessionTerminated}
                    className="faq-ask-btn"
                    aria-label="Send question to Ask Me"
                    title="Ask"
                  >
                    <Send className="w-4 h-4" />
                    <span>Ask</span>
                  </button>
                </div>

                <p className="faq-quick-title">Quick Prompts</p>
                <div className="faq-list">
                  {filteredFaq.map((item) => (
                    <button
                      key={item.q}
                      className="faq-item faq-item-btn"
                      disabled={askBotSessionTerminated}
                      onClick={() => askHelpAgent(item.q)}
                      title="Ask this prompt"
                    >
                      <p className="faq-q">{item.q}</p>
                    </button>
                  ))}
                  {filteredFaq.length === 0 && (
                    <p className="faq-empty">No matching prompt. Type your own question.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="faq-bot-row">
            <button
              onClick={() => {
                setFaqOpen((prev) => {
                  const next = !prev;
                  if (next && !hasPlayedAskBotOpenSound.current) {
                    playAskBotOpenSound();
                    hasPlayedAskBotOpenSound.current = true;
                  }
                  return next;
                });
              }}
              className={cn(
                'faq-fab',
                theme === 'dark' ? 'faq-fab-dark' : 'faq-fab-light',
                !faqOpen && 'faq-fab-dynamic'
              )}
              title="Open Ask Me"
              aria-label="Open Ask Me"
            >
              <span className="askbot-fab-robot" aria-hidden="true">
                <span className="askbot-fab-sleep-bubble askbot-fab-sleep-1">z</span>
                <span className="askbot-fab-sleep-bubble askbot-fab-sleep-2">z</span>
                <span className="askbot-fab-head">
                  <span className="askbot-fab-eye askbot-fab-eye-sleep"></span>
                  <span className="askbot-fab-eye askbot-fab-eye-sleep"></span>
                </span>
                <span className="askbot-fab-antenna"></span>
                <span className="askbot-fab-body"></span>
                <span className="askbot-fab-arm askbot-fab-arm-left"></span>
                <span className="askbot-fab-arm askbot-fab-arm-right"></span>
                <span className="askbot-fab-leg askbot-fab-leg-left"></span>
                <span className="askbot-fab-leg askbot-fab-leg-right"></span>
              </span>
              <span>Ask Me</span>
            </button>

            <button
              type="button"
              className={cn('faq-fold-toggle', theme === 'dark' ? 'faq-fold-dark' : 'faq-fold-light')}
              onClick={() => {
                setBotFolded((prev) => {
                  const next = !prev;
                  if (next) setFaqOpen(false);
                  return next;
                });
              }}
              title={botFolded ? 'Unfold bot' : 'Fold bot'}
              aria-label={botFolded ? 'Unfold bot' : 'Fold bot'}
            >
              <span className="fold-peek-robot" aria-hidden="true">
                <span className="fold-peek-particles"></span>
                <span className="fold-peek-body">
                  <span className="fold-peek-head">
                    <span className="fold-peek-eye"></span>
                    <span className="fold-peek-eye"></span>
                  </span>
                  <span className="fold-peek-arm"></span>
                </span>
              </span>
              <ChevronRight className={cn('w-4 h-4 transition-transform duration-300', botFolded ? 'rotate-180' : 'rotate-0')} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-20 border-t border-zinc-200 dark:border-zinc-900 py-12 px-4">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-500 text-xs font-mono">
              <span>© 2026 DISPATCH RAW</span>
              <span className="mx-2">•</span>
              <span>FINAL PRODUCER APPROVED</span>
            </div>
            <div className="flex items-center gap-6">
              <Shield className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
              <Zap className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
              <TrendingUp className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            </div>
          </div>
        </footer>

        {/* Background Effects */}
        <div className="fixed inset-0 pointer-events-none z-[-1]">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/5 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 blur-[120px] rounded-full" />
        </div>
      </div>
    </ErrorBoundary>
  );
}
