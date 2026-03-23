/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzeVideo, checkApiQuota, fetchVideoMetadataFromGemini, type VideoAnalysisResult, type ProgressStep, type ApiQuotaInfo } from './services/geminiService';
import { analyzeWithGroq, checkGroqQuota } from './services/groqService';
import { fetchBasicYoutubeInfo } from './services/youtubeInfoService';



function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
          <span className="text-xl font-bold tracking-tighter uppercase text-zinc-900 dark:text-zinc-100">{getStepText()}</span>
        </div>
        <div className="w-64 h-1.5 bg-zinc-200 dark:bg-zinc-50 dark:bg-black rounded-full overflow-hidden border border-zinc-300 dark:border-zinc-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 15, ease: "linear" }}
            className="h-full bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          />
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
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<ProgressStep | null>(null);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryLang, setSummaryLang] = useState<'en' | 'ur'>('en');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});

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

  const [apiKeys, setApiKeys] = useState<{ id: string, name: string, key: string, active: boolean }[]>(() => {
    const saved = localStorage.getItem('dispatch_gemini_keys');
    if (saved) return JSON.parse(saved);
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

  const handleCheckQuota = async (keyId: string, apiKey: string) => {
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
    } else {
      const newItem = {
        id: Date.now().toString(),
        type,
        content,
        videoUrl: url,
        createdAt: new Date().toISOString()
      };
      setSavedItems(prev => [newItem, ...prev]);
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
  };

  const handleBulkShare = async () => {
    if (selectedItems.size === 0) return;
    const itemsToShare = savedItems.filter(item => selectedItems.has(item.id));
    const shareText = itemsToShare.map(item => `[${item.type.toUpperCase()}]\n${item.content}`).join('\n\n---\n\n');
    handleShare(shareText, 'Bulk Saved Content');
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
        data = await analyzeWithGroq(trimmedUrl, keyToUse, selectedModel, metaContent);
      } else {
        setLoadingStep('analyzing');
        data = await analyzeVideo(trimmedUrl, keyToUse, (step) => {
          setLoadingStep(step);
        }, selectedModel);
      }

      if (data && (data.summaryEnglish || data.summaryUrdu)) {
        setResult(data);
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

  return (
    <ErrorBoundary>
      <div className={cn("min-h-screen pb-20 transition-all", theme === 'dark' ? "bg-black dark" : "bg-white")}>
        {/* Premium 'Neural' Header with Animated Background */}
        <header className={cn(
          "sticky top-0 z-50 border-b transition-all duration-700 backdrop-blur-3xl overflow-hidden relative isolate",
          theme === 'dark' ? "border-white/5 bg-black/40" : "border-zinc-200/50 bg-white/40"
        )}>
          {/* Beautiful Animated Background Container */}
          <div className="header-animated-bg">
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
          <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl police-gradient flex items-center justify-center p-0.5 shadow-2xl shadow-red-500/20 active:scale-95 transition-all">
                <div className={cn("w-full h-full rounded-[14px] flex items-center justify-center transition-colors", theme === 'dark' ? "bg-black" : "bg-white")}>
                  <Shield className="text-red-600 dark:text-red-500 w-7 h-7 fill-red-500/10" />
                </div>
              </div>
              <div>
                <h1 className="font-bold text-2xl tracking-tighter uppercase text-black dark:text-white leading-none">Dispatch <span className="text-red-600 dark:text-red-500">Raw</span></h1>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono uppercase tracking-[0.3em] mt-1 font-bold">Strategic Intelligence Agency</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-zinc-400">
                <div className="flex items-center gap-2">
                  <div className="pulsating-dot" />
                  <span>SYSTEM ONLINE: ANALYZING TRENDS 🌐</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-2 rounded-lg bg-white dark:bg-black/50 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all flex items-center justify-center"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setShowApiSettings(!showApiSettings); setShowHistory(false); setShowSaved(false); }}
                  className={cn(
                    "p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
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
                  onClick={() => { setShowSaved(!showSaved); setShowHistory(false); setShowApiSettings(false); }}
                  className={cn(
                    "p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showSaved
                      ? "bg-purple-600 text-white shadow-purple-500/20"
                      : "bg-purple-50 dark:bg-purple-900/10 text-purple-700 dark:text-purple-400 hover:bg-purple-600 hover:text-white"
                  )}
                >
                  <Bookmark className="w-4 h-4" />
                  <span className="hidden lg:inline">Vault</span>
                </button>
                <button
                  onClick={() => { setShowHistory(!showHistory); setShowSaved(false); setShowApiSettings(false); }}
                  className={cn(
                    "p-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                    showHistory
                      ? "bg-emerald-600 text-white shadow-emerald-500/20"
                      : "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white"
                  )}
                >
                  <History className="w-4 h-4" />
                  <span className="hidden lg:inline">History</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 pt-12">
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
                    className="text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 whitespace-nowrap"
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
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300"
                >
                  BACK TO PRODUCER
                </button>
              </div>

              <div className="rounded-2xl p-6 border border-zinc-200 dark:border-white/10 theme-aware-box space-y-6">
                <div className="flex flex-col gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-500" />
                    Add New Gemini Key
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
                      placeholder="Paste Gemini API Key here..."
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
                      const id = Date.now().toString();
                      setApiKeys(prev => [
                        ...prev.map(k => ({ ...k, active: false })),
                        { id, name: newKeyName, key: newKeyValue, active: true }
                      ]);
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
                              </div>
                              <p className="text-[10px] text-zinc-500 font-mono">••••••••••••{item.key.slice(-4)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!item.active && (
                              <button
                                onClick={() => setApiKeys(prev => prev.map(k => ({ ...k, active: k.id === item.id })))}
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
                  Your API keys are stored locally in your browser's LocalStorage. They are never sent to our servers. Keys are only used to authenticate direct requests to the Google Gemini API.
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
                    className="text-xs font-mono text-zinc-500 hover:text-zinc-300"
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
                  "relative flex items-center backdrop-blur-3xl rounded-3xl border border-zinc-200 dark:border-white/10 p-1.5 transition-all duration-700 focus-within:ring-2 focus-within:ring-red-500/50",
                  theme === 'dark' ? "bg-black/80 shadow-none" : "bg-white shadow-[0_15px_60px_-15px_rgba(0,0,0,0.1)] group-hover:shadow-[0_20px_80px_-10px_rgba(0,0,0,0.2)]"
                )}>
                  <div className="pl-4 text-red-600 dark:text-red-500">
                    <Youtube className="w-6 h-6 fill-red-600/10" />
                  </div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="PASTE DISPATCH TARGET URL (YOUTUBE)..."
                    className={cn(
                      "flex-1 bg-transparent border-none focus:ring-0 px-6 py-5 font-black tracking-tight text-sm outline-none selection:bg-red-500/30",
                      theme === 'dark' ? "text-white placeholder:text-zinc-500" : "text-black placeholder:text-zinc-600"
                    )}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 uppercase tracking-tighter shadow-xl shadow-red-500/20 active:scale-95",
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
                  <div className="flex items-center justify-between mb-6">
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

                    {/* Tactical Optimization Tips */}
                    {result.optimizationTips && result.optimizationTips.length > 0 && (
                      <section className="pt-8 mb-4">
                        <div className="flex items-center gap-3 mb-8">
                          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Zap className="text-white w-4 h-4 fill-current" />
                          </div>
                          <h3 className="text-2xl font-bold tracking-tighter uppercase">Tactical Optimization Tips</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {result.optimizationTips.map((tip, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.2 + (i * 0.1) }}
                              className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex gap-3"
                            >
                              <div className="text-emerald-500 font-mono font-bold">0{i + 1}</div>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">{tip}</p>
                            </motion.div>
                          ))}
                        </div>
                      </section>
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
          <div className="scanline" />
        </div>
      </div>
    </ErrorBoundary>
  );
}
