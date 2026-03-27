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
  shortsClipPlan: ShortsClipSegment[];
}

export interface ShortsClipSegment {
    segment: 'Hook' | 'Middle' | 'End';
    timeRange: string;
    durationSeconds: number;
    editInstruction: string;
}

export interface ShortsClipPlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  totalDurationSeconds: number;
}

export interface TranscriptEntry {
  start: number;
  end: number;
  text: string;
}

function decodeHtmlEntities(input: string): string {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function extractYouTubeVideoId(url: string): string {
  try {
    const u = new URL(String(url || '').trim());
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split(/[?&#]/)[0];
    }
    if (u.searchParams.get('v')) return String(u.searchParams.get('v'));
    const shortsMatch = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (shortsMatch?.[1]) return shortsMatch[1];
  } catch {
    const fallback = String(url || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (fallback?.[1]) return fallback[1];
  }
  return '';
}

export async function fetchYouTubeTranscriptEntries(videoId: string): Promise<TranscriptEntry[]> {
  const id = String(videoId || '').trim();
  if (!id) return [];

  const languages = ['en', 'en-US', 'ur', 'hi'];
  for (const lang of languages) {
    try {
      const endpoint = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}&fmt=srv3`;
      const res = await fetch(endpoint);
      if (!res.ok) continue;

      const xml = await res.text();
      if (!xml || !xml.includes('<text')) continue;

      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const nodes = Array.from(doc.getElementsByTagName('text'));
      const entries = nodes.map((node) => {
        const start = Number(node.getAttribute('start') || 0);
        const dur = Number(node.getAttribute('dur') || 0);
        const text = decodeHtmlEntities(node.textContent || '');
        return {
          start,
          end: start + Math.max(0, dur),
          text,
        };
      }).filter((x) => x.text.length > 0 && x.end > x.start);

      if (entries.length > 0) return entries;
    } catch {
      // best-effort: try next language
    }
  }

  return [];
}

export function buildTranscriptGroundingText(entries: TranscriptEntry[], maxLines = 40): string {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'TRANSCRIPT_GROUNDING: Not available for this video.';
  }

  const lines = entries.slice(0, Math.max(1, maxLines)).map((item) => {
    const startMin = Math.floor(item.start / 60).toString().padStart(2, '0');
    const startSec = Math.floor(item.start % 60).toString().padStart(2, '0');
    const endMin = Math.floor(item.end / 60).toString().padStart(2, '0');
    const endSec = Math.floor(item.end % 60).toString().padStart(2, '0');
    return `${startMin}:${startSec}-${endMin}:${endSec} | ${item.text}`;
  });

  return `TRANSCRIPT_GROUNDING (timeline cues):\n${lines.join('\n')}`;
}

export function validatePlanAgainstTranscript(plan: ShortsClipSegment[], entries: TranscriptEntry[]): string[] {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const errors: string[] = [];
  for (const segment of plan) {
    const parsed = parseTimeRange(segment.timeRange);
    if (!parsed) {
      errors.push(`${segment.segment}: invalid range for transcript verification.`);
      continue;
    }

    const overlaps = entries.filter((x) => x.end > parsed.start && x.start < parsed.end);
    if (overlaps.length === 0) {
      errors.push(`${segment.segment}: no transcript evidence found in ${segment.timeRange}.`);
      continue;
    }

    const mergedText = overlaps.map((x) => x.text).join(' ').trim();
    if (mergedText.length < 12) {
      errors.push(`${segment.segment}: transcript evidence too weak in ${segment.timeRange}.`);
    }
  }

  return errors;
}

export interface ThumbnailSettingsInput {
  ratio: '16:9' | '9:16' | '1:1';
  style: 'auto' | 'realistic' | 'cinematic' | 'cartoon';
  tone: 'urgent' | 'mystery' | 'authority' | 'emotional';
  textDensity: 'minimal' | 'balanced' | 'bold';
  fontStyle: 'default' | 'impact' | 'modern' | 'news' | 'condensed';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  filters: {
    brightness: number; // -100 to 100
    contrast: number;   // -100 to 100
    saturation: number; // -100 to 100
    vibrance: number;   // -100 to 100
  };
}

export interface ThumbnailSuggestion {
  title: string;
  hookText: string;
  supportingText: string;
  visualPrompt: string;
  composition: string;
  colorDirection: string;
  styleNotes: string;
  negativePrompt: string;
}

export interface FinalThumbnailPayload {
  channelName: string;
  settings: ThumbnailSettingsInput;
  concept: ThumbnailSuggestion;
  contextTitle: string;
  contextSummary: string;
}

export type ProgressStep = 'initializing' | 'searching' | 'analyzing' | 'generating' | 'finalizing';

const BASE_VIRAL_HASHTAGS = [
  '#Shorts', '#ViralShorts', '#YouTubeShorts', '#Bodycam', '#PoliceBodycam', '#Police',
  '#BodycamFootage', '#LawAndOrder', '#PoliceChase', '#TrafficStop', '#Crime', '#Arrest',
  '#CaughtOnCamera', '#TrueCrime', '#PublicSafety', '#Investigation',
  '#TrendingNow', '#ViralVideo', '#BreakingNews', '#USPolice', '#StreetJustice'
];

const YOUTUBE_TAGS_MAX_CHARS = 500;

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

function ensureDescriptionHashtags(description: string, channelName: string, minimum = 15): string {
  const existing = getDescriptionHashtags(description);
  const channelHash = normalizeHashtag(channelName.replace(/\s+/g, ''));
  const merged = dedupeTags([...existing, ...BASE_VIRAL_HASHTAGS, channelHash || '#Channel']);
  const selected = merged.slice(0, Math.max(minimum, 18));

  const cleanedBody = description
    .replace(/(?:\n\s*)?#(?:[A-Za-z0-9_]+)(?:\s+#(?:[A-Za-z0-9_]+))*\s*$/g, '')
    .trim();

  return `${cleanedBody}\n\n${selected.join(' ')}`.trim();
}

function ensureYoutubeTags(rawTags: string, channelName: string): string {
  const seed = [
    channelName, 'youtube shorts', 'viral shorts', 'police bodycam', 'bodycam footage',
    'law enforcement', 'police chase', 'traffic stop', 'arrest footage', 'caught on camera',
    'crime news', 'true crime shorts', 'public safety', 'police investigation', 'breaking news',
    'trending shorts', 'shorts viral', 'crime documentary', 'us police', 'body cam reaction',
    'officer footage', 'real incidents', 'incident analysis', 'daily shorts', 'viral video'
  ];

  const merged = dedupeTags(
    [...splitTags(rawTags), ...seed]
      .map((tag) => String(tag || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  );
  const selected: string[] = [];
  let totalLength = 0;

  for (const tag of merged) {
    if (selected.length >= 35) break;
    const additional = selected.length === 0 ? tag.length : tag.length + 2;
    if (totalLength + additional > YOUTUBE_TAGS_MAX_CHARS) continue;
    selected.push(tag);
    totalLength += additional;
  }

  if (selected.length === 0) {
    const fallback = String(channelName || 'Dispatch Raw').replace(/\s+/g, ' ').trim();
    return fallback.slice(0, YOUTUBE_TAGS_MAX_CHARS);
  }

  return selected.join(', ');
}

export function normalizeSeoOutput(raw: Partial<VideoAnalysisResult>, channelName: string = 'Dispatch Raw'): VideoAnalysisResult {
  const titles = Array.isArray(raw.titles) ? raw.titles.filter(Boolean).slice(0, 3) : [];
  const normalizedTitles = titles.length > 0
    ? titles
    : [
        'Bodycam Moment You Need To See 🚨 #Shorts #Bodycam',
        'What Happened Next Shocked Everyone 😱 #Viral #Police',
        `Critical Street Incident Breakdown 🔥 #LawAndOrder #${channelName.replace(/\s+/g, '')}`
      ];

  const normalizeSegmentLabel = (value: unknown): 'Hook' | 'Middle' | 'End' => {
    const input = String(value || '').toLowerCase();
    if (input.includes('hook') || input.includes('start') || input.includes('intro')) return 'Hook';
    if (input.includes('end') || input.includes('outro') || input.includes('close')) return 'End';
    return 'Middle';
  };

  const rawClipPlan = (raw as any)?.shortsClipPlan || (raw as any)?.clipPlan || (raw as any)?.videoTips || [];
  const shortsClipPlan = Array.isArray(rawClipPlan)
    ? rawClipPlan.slice(0, 3).map((item: any, index: number) => ({
        segment: normalizeSegmentLabel(item?.segment || item?.part || (index === 0 ? 'Hook' : index === 2 ? 'End' : 'Middle')),
        timeRange: String(item?.timeRange || item?.range || item?.timestamp || '').trim() || 'N/A',
        durationSeconds: (() => {
          const range = String(item?.timeRange || item?.range || item?.timestamp || '').trim();
          const parsed = parseTimeRange(range);
          if (parsed) return Math.max(0, parsed.end - parsed.start);
          return Number(item?.durationSeconds || item?.durationSec || item?.duration || 0) || 0;
        })(),
        editInstruction: String(item?.editInstruction || item?.instruction || item?.tip || '').trim()
      })).filter((item: { editInstruction: string; timeRange: string }) => item.editInstruction.length > 0 && item.timeRange.length > 0)
    : [];

  return {
    summaryEnglish: raw.summaryEnglish || '',
    summaryUrdu: raw.summaryUrdu || '',
    titles: normalizedTitles,
    description: ensureDescriptionHashtags(raw.description || '', channelName),
    tags: ensureYoutubeTags(raw.tags || '', channelName),
    shortsClipPlan
  };
}

export function parseTimeRange(range: string): { start: number; end: number } | null {
  const match = String(range || '').trim().match(/^(\d{2}):([0-5]\d)-(\d{2}):([0-5]\d)$/);
  if (!match) return null;

  const startMinutes = Number(match[1]);
  const startSeconds = Number(match[2]);
  const endMinutes = Number(match[3]);
  const endSeconds = Number(match[4]);

  return {
    start: (startMinutes * 60) + startSeconds,
    end: (endMinutes * 60) + endSeconds,
  };
}

export function validateShortsClipPlan(plan: ShortsClipSegment[], targetDurationSeconds: number): ShortsClipPlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedOrder: Array<'Hook' | 'Middle' | 'End'> = ['Hook', 'Middle', 'End'];

  if (plan.length !== 3) {
    errors.push(`Expected exactly 3 segments, got ${plan.length}.`);
  }

  let previousEnd = -1;
  let totalDurationSeconds = 0;

  for (let i = 0; i < Math.min(plan.length, 3); i += 1) {
    const segment = plan[i];
    const expectedSegment = expectedOrder[i];

    if (segment.segment !== expectedSegment) {
      errors.push(`Segment ${i + 1} must be ${expectedSegment}, got ${segment.segment}.`);
    }

    const parsedRange = parseTimeRange(segment.timeRange);
    if (!parsedRange) {
      errors.push(`${segment.segment}: invalid timeRange format "${segment.timeRange}". Expected MM:SS-MM:SS.`);
      continue;
    }

    if (parsedRange.end <= parsedRange.start) {
      errors.push(`${segment.segment}: end must be after start in ${segment.timeRange}.`);
      continue;
    }

    const computedDuration = parsedRange.end - parsedRange.start;
    totalDurationSeconds += computedDuration;

    if (previousEnd >= 0 && parsedRange.start < previousEnd) {
      errors.push(`${segment.segment}: overlaps previous segment. Segments must be non-overlapping and ordered.`);
    }
    previousEnd = parsedRange.end;
  }

  if (Math.abs(totalDurationSeconds - targetDurationSeconds) > 1) {
    warnings.push(`Total duration mismatch. Expected ${targetDurationSeconds}s, got ${totalDurationSeconds}s.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalDurationSeconds,
  };
}

export async function analyzeVideo(
  url: string,
  apiKey: string,
  onProgress?: (step: ProgressStep) => void,
  model: string = "gemini-2.0-flash",
  channelName: string = 'Dispatch Raw'
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
- tags: 20-35 comma-separated SEO tags suitable for YouTube tags field. Keep the combined tag string under 500 characters. Include '${channelName}'.
- shortsClipPlan: EXACTLY 3 objects for short-video editing, each with segment (Hook/Middle/End), timeRange (MM:SS-MM:SS from this video), durationSeconds (number), and editInstruction (how to cut/use this clip). Must be based on THIS exact video analysis.
`;


    const result = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        systemInstruction: `You are an expert YouTube Shorts SEO optimizer + legal disclaimer specialist for 2026 for the channel "${channelName}".
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
      return normalizeSeoOutput(parsed, channelName);
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

export async function generateShortsClipPlan(
  apiKey: string,
  model: string,
  payload: {
    videoUrl: string;
    channelName: string;
    primaryTitle: string;
    summary: string;
    description: string;
    targetDurationSeconds: number;
  }
): Promise<ShortsClipSegment[]> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const videoId = extractYouTubeVideoId(payload.videoUrl);
  if (!videoId) {
    throw new Error('Could not extract a valid YouTube video ID. Please use a full YouTube watch URL.');
  }

  const transcriptEntries = await fetchYouTubeTranscriptEntries(videoId);
  if (transcriptEntries.length === 0) {
    throw new Error('Transcript is unavailable for this video, so exact timeline clip extraction is blocked for accuracy. Try another video with captions/transcript.');
  }

  const transcriptGrounding = buildTranscriptGroundingText(transcriptEntries, 55);

  const basePrompt = `TASK: Build an INTELLIGENT short-video clip extraction plan from this exact YouTube video.

VIDEO URL: ${payload.videoUrl}
VIDEO TITLE: ${payload.primaryTitle}
SUMMARY: ${payload.summary}
DESCRIPTION: ${payload.description.slice(0, 900)}
TARGET TOTAL SHORT DURATION: ${payload.targetDurationSeconds} seconds
${transcriptGrounding}

CRITICAL REQUIREMENTS:

Step 1: ANALYZE THE ACTUAL VIDEO CONTENT
- Watch/analyze the video mentally to identify EXACT moments of high engagement
- Look for: dramatic scenes, conflict, turning points, emotional moments, humor, surprises
- For each moment, determine EXACTLY when it starts and ends in the video timeline

Step 2: SELECT THE BEST HOOK (NOT RANDOM)
- Hook MUST be the most attention-grabbing moment in the video
- It should make someone stop scrolling immediately
- It should happen early-ish in the video (but not necessarily at 0:00)
- Hook timeRange must match an actual compelling event

Step 3: SELECT THE MIDDLE
- Middle should escalate or deepen the story from hook
- It should show progression of the event/conflict/narrative
- Must be a natural continuation, not a random segment

Step 4: SELECT THE END
- End should provide resolution, impact, or lasting impression
- It should make viewers want to watch the full video

Step 5: VERIFY ACCURACY
- Each segment's timestamp must correspond to ACTUAL content that exists in the video
- The editInstruction must accurately describe what REALLY happens at those timestamps
- Do NOT invent events or timestamps that don't match video content
- If transcript grounding is provided, select ranges that overlap those transcript timeline cues

RULES:
1) Return exactly 3 segments in order: Hook, Middle, End
2) Each must reference REAL events that actually occur in the video at those times
3) Timestamp format: MM:SS-MM:SS (must match what's in the video)
4) durationSeconds must EXACTLY match the timestamp range
5) Sum of all durationSeconds must equal ${payload.targetDurationSeconds} seconds
6) editInstruction must be specific and accurate to the actual clip content
7) ONLY suggest timestamps for events you can VERIFY actually exist in the video
8) If you cannot find real, compelling moments matching this duration, return error

Output strict JSON only:
{
  "shortsClipPlan": [
    {
      "segment": "Hook",
      "timeRange": "MM:SS-MM:SS",
      "durationSeconds": NUMBER,
      "editInstruction": "Specific description of exactly what's happening in this clip - MUST BE ACCURATE TO VIDEO"
    },
    {
      "segment": "Middle",
      "timeRange": "MM:SS-MM:SS",
      "durationSeconds": NUMBER,
      "editInstruction": "Specific description of exactly what's happening in this clip - MUST BE ACCURATE TO VIDEO"
    },
    {
      "segment": "End",
      "timeRange": "MM:SS-MM:SS",
      "durationSeconds": NUMBER,
      "editInstruction": "Specific description of exactly what's happening in this clip - MUST BE ACCURATE TO VIDEO"
    }
  ]
}`;
  let validationFeedback = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const prompt = validationFeedback
      ? `${basePrompt}\n\nVALIDATION/ACCURACY FAILED IN PREVIOUS ATTEMPT:\n${validationFeedback}\n\nREQUIRED FIXES:\n- CRITICALLY: Verify Hook is the SINGLE MOST COMPELLING moment in the video and actually exists at those timestamps\n- CRITICALLY: Confirm Middle progresses the story naturally and events really happen there\n- CRITICALLY: Confirm End provides closure/impact and every timestamp is accurate\n- ACCURACY CHECK: Do NOT suggest any timestamp unless you can VERIFY that exact content exists at that time in the video\n- Do NOT make up scenes or invent timestamps\n- Do NOT guess - only use actual identifiable moments from the video\n- Pick the BEST Hook wisely, not randomly\n- Regenerate with maximum confidence in accuracy`
      : basePrompt;

    const result = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.15,
        systemInstruction: `You are an expert short-form video editor for ${payload.channelName}. CRITICAL RULES: 1) Every timestamp must match ACTUAL content in the video. 2) Do NOT invent scenes or falsify timestamps. 3) Select the BEST Hook based on engagement potential, not random timing. 4) Verify each event description matches what actually happens at those timestamps. 5) Return ONLY valid JSON, no other text.`,
        tools: [{ googleSearch: {} }],
      },
    });

    let text = (result.text || '').trim();
    if (text.startsWith('```json')) text = text.substring(7);
    else if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);

    const parsed = JSON.parse(text.trim());
    if (parsed?.error) {
      throw new Error(String(parsed.error));
    }

    const normalized = normalizeSeoOutput({ shortsClipPlan: parsed?.shortsClipPlan || parsed?.clipPlan || [] }, payload.channelName);
    const validation = validateShortsClipPlan(normalized.shortsClipPlan, payload.targetDurationSeconds);

    const transcriptErrors = validatePlanAgainstTranscript(normalized.shortsClipPlan, transcriptEntries);

    if (validation.valid && transcriptErrors.length === 0) {
      return normalized.shortsClipPlan;
    }

    validationFeedback = [...validation.errors, ...transcriptErrors].join(' | ');
  }

  throw new Error(`Failed to generate a valid clip plan after 3 attempts. ${validationFeedback}`);
}

export async function generateThumbnailSuggestions(
  apiKey: string,
  model: string,
  payload: {
    videoUrl: string;
    channelName: string;
    primaryTitle: string;
    summary: string;
    description: string;
    tags: string;
    settings: ThumbnailSettingsInput;
    avoidHooks?: string[];
  }
): Promise<ThumbnailSuggestion> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const avoidLine = payload.avoidHooks && payload.avoidHooks.length > 0
    ? `Avoid repeating these previous concepts/hooks: ${payload.avoidHooks.slice(-6).join(' | ')}`
    : 'No previous concepts yet.';

  const prompt = `Generate exactly 1 elite YouTube thumbnail concept for this video context.

Context:
- Channel: ${payload.channelName}
- Video URL: ${payload.videoUrl}
- Primary Title: ${payload.primaryTitle}
- Summary: ${payload.summary}
- Description snippet: ${payload.description.slice(0, 800)}
- Tags: ${payload.tags.slice(0, 400)}

User settings:
- Ratio: ${payload.settings.ratio}
- Style: ${payload.settings.style}
- Tone: ${payload.settings.tone}
- Text Density: ${payload.settings.textDensity}
- Font Style: ${payload.settings.fontStyle}
${avoidLine}

Rules:
1) Concept must be realistic, high-CTR, and algorithm-friendly.
2) Include big readable overlay text (2-6 words max for hookText).
3) Keep composition clear for mobile screens and avoid clutter.
4) Must match law/police/bodycam niche when context implies it.
5) Return ONLY valid JSON with this schema:
{
  "suggestion": {
    "title": "Concept name",
    "hookText": "SHORT TEXT",
    "supportingText": "optional small secondary line",
    "visualPrompt": "detailed generation prompt",
    "composition": "subject placement, depth, framing",
    "colorDirection": "palette and contrast guidance",
    "styleNotes": "render and realism guidance",
    "negativePrompt": "things to avoid"
  }
}`;

  const result = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.35,
      systemInstruction: 'You are a world-class YouTube thumbnail strategist. Output strict JSON only.',
    },
  });

  let text = result.text || '';
  text = text.trim();
  if (text.startsWith('```json')) text = text.substring(7);
  else if (text.startsWith('```')) text = text.substring(3);
  if (text.endsWith('```')) text = text.substring(0, text.length - 3);

  const parsed = JSON.parse(text.trim());
  const single = parsed?.suggestion;
  const firstFromArray = Array.isArray(parsed?.suggestions) ? parsed.suggestions[0] : null;
  const item = single || firstFromArray || {};

  return {
    title: String(item?.title || 'Thumbnail Concept'),
    hookText: String(item?.hookText || 'MUST WATCH'),
    supportingText: String(item?.supportingText || ''),
    visualPrompt: String(item?.visualPrompt || ''),
    composition: String(item?.composition || ''),
    colorDirection: String(item?.colorDirection || ''),
    styleNotes: String(item?.styleNotes || ''),
    negativePrompt: String(item?.negativePrompt || ''),
  };
}

export async function generateProfessionalThumbnailPrompt(
  payload: FinalThumbnailPayload
): Promise<string> {
  // TEXT DENSITY GUIDE - Algorithm-optimized
  const densityGuide = payload.settings.textDensity === 'minimal'
    ? 'Text overlay: 2-3 words maximum, ENORMOUS bold font, maximum readability at small thumbnail size, high contrast border'
    : payload.settings.textDensity === 'bold'
      ? 'Text overlay: 4-6 words, EXTRA bold headline + visible subline, maximum impact and CTR, high contrast and readability'
      : 'Text overlay: 3-5 words professional headline + optional short subline, excellent readability';

  // REALISTIC STYLE SPECIFICATION - Optimized for authenticity and algorithm
  let styleSpec = '';
  let realisticModifier = '';
  
  if (payload.settings.style === 'cartoon') {
    styleSpec = 'CARTOON STYLE: Vibrant saturated colors (+30%), bright playful aesthetic, comic book edges, bold outlines, high contrast';
    realisticModifier = '';
  } else if (payload.settings.style === 'cinematic') {
    styleSpec = 'CINEMATIC STYLE: Professional film-grade color grading, dramatic shadows with light rays, dark moody atmosphere, high-end color grade';
    realisticModifier = 'AUTHENTICITY: Real cinematic production value, looks like professional broadcast footage.';
  } else if (payload.settings.style === 'realistic') {
    styleSpec = 'PHOTOREALISTIC STYLE: Ultra-realistic lighting, natural skin tones, accurate true-to-life colors, professional photography quality';
    realisticModifier = 'AUTHENTICITY: Looks like real incident footage, genuine documentary style, not artificial or stylized. Real people, real emotions, authentic emergency response.';
  } else {
    styleSpec = 'AUTO-OPTIMIZED STYLE: Best visual treatment for maximum viewer engagement and algorithm performance';
    realisticModifier = 'AUTHENTICITY: Authentic appearance matching content type.';
  }

  // TONE SPECIFICATION - Algorithm-optimized emotional triggers
  let toneSpec = '';
  if (payload.settings.tone === 'urgent') {
    toneSpec = 'TONE: URGENT & SHOCKING - Dominant Red/Orange/Yellow colors, extreme high contrast, sense of immediate danger and emergency, pulse-pounding tension';
  } else if (payload.settings.tone === 'mystery') {
    toneSpec = 'TONE: INTRIGUING & REVEALED - Deep blues/purples with strategic lighting, atmospheric mystery, sense of secrets being uncovered';
  } else if (payload.settings.tone === 'emotional') {
    toneSpec = 'TONE: POWERFUL & HUMAN - Warm oranges/golds/reds with emotional lighting, human drama, captures genuine reaction and feelings';
  } else {
    toneSpec = 'TONE: AUTHORITATIVE & CREDIBLE - Professional blues/grays, clean composition, trust-building layout, news-worthy appearance';
  }

  const qualitySpec = payload.settings.quality === 'ultra'
    ? '8K MAXIMUM: 7680x4320, ultra sharp, professional broadcast quality, rich deep colors, perfect for any size viewing'
    : payload.settings.quality === 'high'
      ? '4K HIGH: 3840x2160, sharp focus, professional quality, excellent on mobile and desktop'
      : payload.settings.quality === 'medium'
        ? 'STANDARD: 1920x1080, good detail balance, optimized for social media'
        : 'OPTIMIZED: Balanced for fast rendering, mobile-friendly';

  const fontSpec = payload.settings.fontStyle === 'impact'
    ? 'HEAVY IMPACT: Uppercase bold Impact font, aggressive weight, dominates composition, maximum visibility'
    : payload.settings.fontStyle === 'modern'
      ? 'MODERN SANS: Clean contemporary typography, strong sans-serif, excellent mobile readability'
      : payload.settings.fontStyle === 'news'
        ? 'NEWS BROADCAST: Bold authoritative serif style, professional news anchor appearance, credible authority'
        : payload.settings.fontStyle === 'condensed'
          ? 'CONDENSED TALL: Optimized for mobile vertical space, tall aspect ratio efficiency'
          : 'BOLD CLASSIC: Maximum impact Typography, strong headline presence';

  const aspectRatioDesc = payload.settings.ratio === '9:16'
    ? 'VERTICAL 9:16 short-form optimized, mobile-first composition, TikTok/Shorts/Reels standard'
    : payload.settings.ratio === '1:1'
      ? 'SQUARE 1:1, perfectly balanced, maximum impact on Instagram/Twitter, centered composition'
      : 'HORIZONTAL 16:9, classic YouTube thumbnail, widescreen cinematic composition';

  // ALGORITHM-OPTIMIZED PROMPT
  const prompt = `GENERATE PROFESSIONAL 8K THUMBNAIL MAXIMIZED FOR VIEWER ENGAGEMENT AND ALGORITHM PERFORMANCE.

═══ CONTEXT & AUTHENTICITY ═══
Channel: ${payload.channelName}
Video: ${payload.contextTitle}
Summary: ${payload.contextSummary}
Concept: ${payload.concept.title}
${realisticModifier ? `Authenticity Direction: ${realisticModifier}` : ''}

═══ HEADLINE TEXT (MUST BE MASSIVE & VISIBLE) ═══
Primary Hook: "${payload.concept.hookText}"
${payload.concept.supportingText ? `Secondary: "${payload.concept.supportingText}"` : ''}

═══ VISUAL COMPOSITION ═══
Layout & Placement: ${payload.concept.composition}
Color Palette: ${payload.concept.colorDirection}
Style Direction: ${payload.concept.styleNotes}
Negative Elements: ${payload.concept.negativePrompt || 'avoid watermarks, logos, artificial effects'}

═══ MANDATORY TECHNICAL SETTINGS ═══
ASPECT RATIO: ${aspectRatioDesc}
RENDER STYLE: ${styleSpec}
EMOTIONAL TONE: ${toneSpec}
TEXT TREATMENT: ${densityGuide}
OUTPUT QUALITY: ${qualitySpec}
TYPOGRAPHY: ${fontSpec}

═══ ALGORITHM OPTIMIZATION REQUIREMENTS ═══
✓ HIGH CTR APPEAL: Designed to maximize click-through rate and viewer stops
✓ MOBILE OPTIMIZED: Legible and impactful at thumbnail size (200x120 pixels)
✓ EMOTIONAL TRIGGER: Evokes curiosity, urgency, or strong reaction
✓ FACES/PEOPLE: If applicable, show authentic human emotion and reaction
✓ ACTION: Dynamic composition suggesting incident, emergency, or important event
✓ CONTRAST: Maximum color contrast for visibility in feed
✓ TEXT READABILITY: Headline readable in 1-2 seconds maximum
✓ NO CLUTTER: Clean composition, nothing distracting
✓ PROFESSIONAL: Looks legitimate, credible, newsworthy quality

═══ GENERATION SPECIFICATIONS ═══
Resolution: 8K (7680x4320) or highest available
Format: PNG or WebP format
Color Space: RGB sRGB
Lighting: Professional multi-source lighting with proper shadows
Focus: Ultra-sharp focus, no blur except intentional depth of field
Skin Tones: If humans present - natural, not oversaturated
Encoding: Lossless quality, high fidelity colors

GENERATE IMMEDIATELY WITH MAXIMUM ENGAGEMENT OPTIMIZATION.`;

  return prompt;
}

