import { GoogleGenAI } from "@google/genai";

export interface ApiQuotaInfo {
  status: 'valid' | 'invalid' | 'quota_exceeded' | 'error';
  message: string;
  model: string;
}

export async function checkApiQuota(apiKey: string, modelName: string = "gemini-2.0-flash"): Promise<ApiQuotaInfo> {
  if (!apiKey) return { status: 'invalid', message: 'No key provided', model: '' };
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

    // Using models.generateContent which is the primary pattern in v1.46.0
    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
    });

    if (result) {
      return { status: 'valid', message: 'Key is active and working', model: modelName };
    }
    return { status: 'error', message: 'Empty response', model: modelName };
  } catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { status: 'quota_exceeded', message: `FREE TIER BLOCKED: Your region/key hit the hard quota limit. Use GROQ instead.`, model: modelName };
    }
    if (msg.includes('API key not valid') || msg.includes('INVALID_ARGUMENT')) {
      return { status: 'invalid', message: 'API key is invalid or revoked.', model: '' };
    }
    return { status: 'error', message: `KEY ERROR ${msg.substring(0, 150)}`, model: modelName };
  }
}

export interface VideoAnalysisResult {
  error?: string | null;
  summaryEnglish: string;
  summaryUrdu: string;
  titles: string[];
  description: string;
  tags: string;
  optimizationTips: string[];
}

export type ProgressStep = 'initializing' | 'searching' | 'analyzing' | 'generating' | 'finalizing';

const BASE_VIRAL_HASHTAGS = [
  '#Shorts', '#ViralShorts', '#YouTubeShorts', '#Bodycam', '#PoliceBodycam', '#Police',
  '#BodycamFootage', '#LawAndOrder', '#PoliceChase', '#TrafficStop', '#Crime', '#Arrest',
  '#CaughtOnCamera', '#TrueCrime', '#PublicSafety', '#DispatchRaw', '#Investigation',
  '#TrendingNow', '#ViralVideo', '#BreakingNews', '#USPolice', '#StreetJustice'
];

function splitTags(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeTags(input: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of input) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(value);
  }
  return output;
}

function normalizeHashtag(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleaned) return '';
  return `#${cleaned}`;
}

function getDescriptionHashtags(description: string): string[] {
  const matches = description.match(/#[A-Za-z0-9_]+/g) || [];
  return dedupeTags(matches.map(normalizeHashtag).filter(Boolean));
}

function ensureDescriptionHashtags(description: string, minimum = 15): string {
  const existing = getDescriptionHashtags(description);
  const merged = dedupeTags([...existing, ...BASE_VIRAL_HASHTAGS]);
  const selected = merged.slice(0, Math.max(minimum, 18));

  const cleanedBody = description
    .replace(/(?:\n\s*)?#(?:[A-Za-z0-9_]+)(?:\s+#(?:[A-Za-z0-9_]+))*\s*$/g, '')
    .trim();

  return `${cleanedBody}\n\n${selected.join(' ')}`.trim();
}

function ensureYoutubeTags(rawTags: string): string {
  const seed = [
    'Dispatch Raw', 'youtube shorts', 'viral shorts', 'police bodycam', 'bodycam footage',
    'law enforcement', 'police chase', 'traffic stop', 'arrest footage', 'caught on camera',
    'crime news', 'true crime shorts', 'public safety', 'police investigation', 'breaking news',
    'trending shorts', 'shorts viral', 'crime documentary', 'us police', 'body cam reaction',
    'officer footage', 'real incidents', 'incident analysis', 'daily shorts', 'viral video'
  ];

  const merged = dedupeTags([...splitTags(rawTags), ...seed]);
  const selected: string[] = [];
  let totalLength = 0;

  for (const tag of merged) {
    const additional = selected.length === 0 ? tag.length : tag.length + 2;
    if (totalLength + additional > 490) break;
    selected.push(tag);
    totalLength += additional;
    if (selected.length >= 35) break;
  }

  if (selected.length < 15) {
    return merged.slice(0, 15).join(', ');
  }

  return selected.join(', ');
}

export function normalizeSeoOutput(raw: Partial<VideoAnalysisResult>): VideoAnalysisResult {
  const titles = Array.isArray(raw.titles) ? raw.titles.filter(Boolean).slice(0, 3) : [];
  const normalizedTitles = titles.length > 0
    ? titles
    : [
        'Bodycam Moment You Need To See 🚨 #Shorts #Bodycam',
        'What Happened Next Shocked Everyone 😱 #Viral #Police',
        'Critical Street Incident Breakdown 🔥 #LawAndOrder #DispatchRaw'
      ];

  return {
    summaryEnglish: raw.summaryEnglish || '',
    summaryUrdu: raw.summaryUrdu || '',
    titles: normalizedTitles,
    description: ensureDescriptionHashtags(raw.description || ''),
    tags: ensureYoutubeTags(raw.tags || ''),
    optimizationTips: Array.isArray(raw.optimizationTips) ? raw.optimizationTips.slice(0, 3) : []
  };
}

export async function analyzeVideo(
  url: string,
  apiKey: string,
  onProgress?: (step: ProgressStep) => void,
  model: string = "gemini-2.0-flash"
): Promise<VideoAnalysisResult> {
  onProgress?.('initializing');

  if (!apiKey) {
    return { error: "API Key Required: Please configure your Gemini API key in the Settings section." } as any;
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    onProgress?.('searching');

    // Extract video ID from URL for precise searching
    let videoIdFromUrl = '';
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('youtu.be')) {
        videoIdFromUrl = urlObj.pathname.slice(1).split('?')[0];
      } else {
        videoIdFromUrl = urlObj.searchParams.get('v') || '';
      }
    } catch {
      videoIdFromUrl = url; // fallback to raw input
    }

    const prompt = `TASK: Analyze the YouTube video with ID "${videoIdFromUrl}" (Full URL: ${url}).

STEP 1: Use Google Search to find this EXACT video. Search for: "youtube.com/watch?v=${videoIdFromUrl}" OR "${videoIdFromUrl} site:youtube.com"
STEP 2: Read the ACTUAL title, channel name, and topic of the video you found.
STEP 3: Based ONLY on what you found about THIS specific video, generate the SEO package below.

DO NOT make up content. DO NOT confuse this video with another video. If you cannot find this exact video, set "error" to a message explaining that.

Output a JSON object with these fields:
- summaryEnglish: A minimum of 5 DETAILED sentences. Use emojis (🚨, 🔥, 😱) to emphasize key points.
- summaryUrdu: Detailed Roman Urdu/Hindi summary (5-6 lines).
- titles: EXACTLY 3 optimized options. Each MUST end with 2 hashtags. Use psychological curiosity hooks and CATCHY EMOJIS (🚨, 😱, 🔥, 🚔) in EVERY title.
- description: A professional YouTube Shorts SEO block optimized for Copy-Paste. Use EMOJIS (🚨, 👀, 🔥) throughout the Hooks and CTAs. Structure: Disclaimer -> Hook 😱 -> Tease 👀 -> CTA 🔥 -> Hashtags. At the END include 15-20 relevant hashtags in one line.
- tags: 20-35 comma-separated SEO tags suitable for YouTube tags field. Keep the combined tag string under 500 characters. Include 'Dispatch Raw'.
- optimizationTips: Exactly 3 tactical icons (📽️, 🔊, 📝) with tips.
`;


    const result = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: `You are an expert YouTube Shorts SEO optimizer + legal disclaimer specialist for 2026 for the channel "Dispatch Raw".
Generate FULL optimized metadata ONLY for tactical / legal / police bodycam / military videos. 
Use Google Search ONLY to find the EXACT video provided by the user.

CRITICAL: YOU MUST include this EXACT DISCLAIMER at the VERY TOP of EVERY description:
"**DISCLAIMER:**  
This video is for educational, informational, and documentary purposes only. The footage is sourced from publicly available records and is presented to promote transparency, awareness, and understanding of law enforcement interactions. We are not affiliated with any law enforcement agency, police department, or government entity. No endorsement or affiliation is implied. Viewer discretion is advised due to potentially graphic or intense content. This is not legal advice, and nothing in this video should be construed as professional guidance."

Output ONLY raw JSON. No markdown.
The description must always end with 15-20 algorithm-friendly hashtags relevant to the exact video topic.
The tags field must be dense, relevant, and discoverability-focused while staying within YouTube tag limits.`,
        tools: [{ googleSearch: {} }],
      },
    });

    onProgress?.('analyzing');

    onProgress?.('finalizing');

    if (!result || !result.candidates?.[0]) {
      throw new Error("No response generated. Please try again.");
    }

    const candidate = result.candidates[0];
    if (candidate.finishReason === 'SAFETY') {
      return { error: "Analysis blocked by safety filters. This video content might be restricted." } as any;
    }

    let text = result.text || "";
    if (!text) {
      throw new Error("Empty response received from the Strategy Veteran.");
    }

    // Clean up potential markdown formatting that breaks JSON parsing
    text = text.trim();
    if (text.startsWith("```json")) {
      text = text.substring(7);
    } else if (text.startsWith("```")) {
      text = text.substring(3);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    try {
      const parsed = JSON.parse(text);
      if (parsed.error) return parsed;
      return normalizeSeoOutput(parsed);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw Text:", text);
      return { error: "Failed to extract structured data. The AI returned an invalid format. Please try again." } as any;
    }

  } catch (e: any) {
    console.error("Gemini API Error:", e);

    let errorMessage = e.message || "";

    // Handle the "Origin not allowed" or similar environment errors
    if (errorMessage.includes("Origin") || errorMessage.includes("not allowed")) {
      return { error: "Access denied. This environment might be restricting API calls. Try opening in a new tab." } as any;
    }

    // Attempt to cleanly parse the giant JSON error string from Google SDK
    try {
      if (errorMessage.includes('{"error":')) {
        const rawJsonString = errorMessage.substring(errorMessage.indexOf('{'));
        const parsedError = JSON.parse(rawJsonString);
        if (parsedError?.error?.code === 429 || parsedError?.error?.status === "RESOURCE_EXHAUSTED" || errorMessage.includes('429')) {
          return { error: `⛔ GOOGLE API BLOCKED: Your free tier quota for Gemini 2.0 Flash has been exhausted or restricted by Google in your region. PLEASE SWITCH TO GROQ MODEL to continue. (Code 429)` } as any;
        }
        errorMessage = parsedError?.error?.message || errorMessage;
      } else if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.toLowerCase().includes('resource_exhausted')) {
        return { error: `⛔ GOOGLE API BLOCKED: Your free tier quota for Gemini 2.0 Flash has been exhausted or restricted by Google in your region. PLEASE SWITCH TO GROQ MODEL to continue.` } as any;
      }
    } catch (parseErr) {
      // Fallback to raw message if parsing fails
    }

    console.error("FULL AI ERROR:", e);
    return { error: `Gemini API Error: ${errorMessage || "Connection failed. Please verify your API Key and Network Status."}` } as any;
  }
}

export async function fetchVideoMetadataFromGemini(url: string, apiKey: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{
        role: 'user',
        parts: [{ text: `TASK: USE GOOGLE SEARCH to find the EXACT video: ${url}. Provide a summary of facts found. NO SEO.` }]
      }],
      // @ts-ignore
      tools: [{ googleSearch: {} }],
    });
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "No metadata found.";
  } catch (e: any) {
    return "Metadata grounding not available.";
  }
}
