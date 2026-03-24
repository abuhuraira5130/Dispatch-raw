import Groq from "groq-sdk";
import {
    type ShortsClipSegment,
    normalizeSeoOutput,
    validateShortsClipPlan,
    extractYouTubeVideoId,
    fetchYouTubeTranscriptEntries,
    buildTranscriptGroundingText,
    validatePlanAgainstTranscript,
    type VideoAnalysisResult,
    type ThumbnailSettingsInput,
    type ThumbnailSuggestion,
} from "./geminiService";

export async function checkGroqQuota(apiKey: string, model: string = "llama-3.3-70b-versatile") {
    try {
        const groq = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
        const result = await groq.chat.completions.create({
            messages: [{ role: "user", content: "Reply OK" }],
            model: model,
            max_tokens: 5
        });
        if (result.choices[0]?.message?.content) {
            return { status: 'valid', message: 'Groq Key is Active', model };
        }
        return { status: 'error', message: 'No Response from Groq', model };
    } catch (e: any) {
        const message = String(e?.message || 'Unknown Groq error');
        if (/invalid_api_key|Invalid API Key|401/.test(message)) {
            return {
                status: 'invalid',
                message: 'Invalid GROQ API key. Please add a valid key starting with gsk_.',
                model
            };
        }
        return { status: 'error', message: `GROQ ERROR: ${message.substring(0, 140)}`, model };
    }
}

export async function analyzeWithGroq(
    url: string,
    apiKey: string,
    model: string = "llama-3.3-70b-versatile",
    metaData?: string,
    channelName: string = 'Dispatch Raw'
): Promise<VideoAnalysisResult> {
    const groq = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

    const infoFound = metaData ? `REAL DATA FOUND FOR THIS VIDEO:\n${metaData}` : `Video URL: ${url}`;

    const prompt = `CRITICAL TASK: Generate a Viral SEO Package for "${channelName}".
${infoFound}

SYSTEM MANDATE: YOU MUST include this EXACT DISCLAIMER at the VERY TOP of EVERY description:
"**DISCLAIMER:**  
This video is for educational, informational, and documentary purposes only. The footage is sourced from publicly available records and is presented to promote transparency, awareness, and understanding of law enforcement interactions. We are not affiliated with any law enforcement agency, police department, or government entity. No endorsement or affiliation is implied. Viewer discretion is advised due to potentially graphic or intense content. This is not legal advice, and nothing in this video should be construed as professional guidance."

INSTRUCTIONS:
1. SUMMARY: Analyze facts (5+ sentences). Use catchy emojis (🚨, 🔥, 😱).
2. TITLES: 3 curiosity-hooks with 🚨, 😱, 🔥, 🚔 emojis and 2 hashtags in every title.
3. DESCRIPTION: DIRECT COPY-PASTE FORMAT. (Disclaimer -> Hook 😱 -> Tease 👀 -> ${channelName} CTA 🔥 -> Viral Hashtags). End description with 15-20 relevant hashtags.
4. TAGS: 20-35 comma-separated tags including '${channelName}', optimized for YouTube discoverability and kept within the 500-character tag field limit.
5. SHORTS CLIP PLAN: Exactly 3 objects for Hook, Middle, End with exact time ranges from THIS video, clip duration in seconds, and one edit instruction per segment.

SCHEMA (STRICT):
{
  "summaryEnglish": "Minimum 5 detailed sentences with emojis...",
  "summaryUrdu": "Detailed Roman Urdu...",
  "titles": ["Catchy Title 🚨 #Shorts #Arrest", "Catchy Title 😱 #Viral #Police", "Catchy Title 🔥 #Bodycam #Tactical"],
  "description": "Full copy-paste block starting WITH DISCLAIMER...",
  "tags": "Dispatch Raw, police, bodycam, incident...",
    "shortsClipPlan": [
        { "segment": "Hook", "timeRange": "00:03-00:12", "durationSeconds": 9, "editInstruction": "Use this as opening hook with fast zoom-in and caption." },
        { "segment": "Middle", "timeRange": "00:28-00:42", "durationSeconds": 14, "editInstruction": "Keep original audio, add one context subtitle, trim pauses." },
        { "segment": "End", "timeRange": "01:10-01:18", "durationSeconds": 8, "editInstruction": "End on resolution moment and add CTA overlay in last 2 seconds." }
    ]
}

Output ONLY pure JSON.`;

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are the ${channelName} Agent. You extract facts and generate dramatic SEO per the 2026 blueprint. You ONLY output valid JSON.`
            },
            { role: "user", content: prompt }
        ],
        model: model,
        temperature: 0.8,
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Groq.");

    try {
        const cleaned = content.replace(/```json\n?|```/g, "").trim();
        const raw = JSON.parse(cleaned);

        return normalizeSeoOutput({
            summaryEnglish: raw.summaryEnglish || raw.summary_english || raw.summary || "",
            summaryUrdu: raw.summaryUrdu || raw.summary_urdu || raw.summary_roman_urdu || "",
            titles: raw.titles || raw.viral_titles || [],
            description: raw.description || raw.seo_description || "",
            tags: Array.isArray(raw.tags) ? raw.tags.join(', ') : (raw.tags || ""),
            shortsClipPlan: raw.shortsClipPlan || raw.clipPlan || raw.videoTips || raw.tips || []
        }, channelName);
    } catch (e) {
        console.error("Groq Final Parse Fail:", content);
        throw new Error("The AI response was malformed. Please try again.");
    }
}

export async function generateThumbnailSuggestionsWithGroq(
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
    const groq = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

    const avoidLine = payload.avoidHooks && payload.avoidHooks.length > 0
        ? `Avoid repeating these previous concepts/hooks: ${payload.avoidHooks.slice(-6).join(' | ')}`
        : 'No previous concepts yet.';

    const prompt = `Create exactly 1 premium YouTube thumbnail concept.

Context:
- Channel: ${payload.channelName}
- URL: ${payload.videoUrl}
- Title: ${payload.primaryTitle}
- Summary: ${payload.summary}
- Description: ${payload.description.slice(0, 700)}
- Tags: ${payload.tags.slice(0, 350)}

Settings:
- Ratio: ${payload.settings.ratio}
- Style: ${payload.settings.style}
- Tone: ${payload.settings.tone}
- Text Density: ${payload.settings.textDensity}
- Font Style: ${payload.settings.fontStyle}
${avoidLine}

Rules:
- Keep visuals realistic and strong for mobile readability.
- hookText must be 2 to 6 words only.
- Avoid spammy clutter and unreadable text.
- Output strict JSON only.

Schema:
{
    "suggestion": {
        "title": "Concept name",
        "hookText": "TEXT",
        "supportingText": "small support text",
        "visualPrompt": "detailed image prompt",
        "composition": "framing and subject placement",
        "colorDirection": "color and contrast guidance",
        "styleNotes": "realism and render notes",
        "negativePrompt": "avoid list"
    }
}`;

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are an elite YouTube thumbnail director. Return only valid JSON.",
            },
            { role: "user", content: prompt },
        ],
        model,
        temperature: 0.45,
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(content.replace(/```json\n?|```/g, "").trim());
    const single = parsed?.suggestion;
    const firstFromArray = Array.isArray(parsed?.suggestions) ? parsed.suggestions[0] : null;
    const item = single || firstFromArray || {};

    return {
        title: String(item?.title || "Thumbnail Concept"),
        hookText: String(item?.hookText || "MUST WATCH"),
        supportingText: String(item?.supportingText || ""),
        visualPrompt: String(item?.visualPrompt || ""),
        composition: String(item?.composition || ""),
        colorDirection: String(item?.colorDirection || ""),
        styleNotes: String(item?.styleNotes || ""),
        negativePrompt: String(item?.negativePrompt || ""),
    };
}

export async function generateShortsClipPlanWithGroq(
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
    const groq = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
    const videoId = extractYouTubeVideoId(payload.videoUrl);
    if (!videoId) {
        throw new Error('Could not extract a valid YouTube video ID. Please use a full YouTube watch URL.');
    }

    const transcriptEntries = await fetchYouTubeTranscriptEntries(videoId);
    if (transcriptEntries.length === 0) {
        throw new Error('Transcript is unavailable for this video, so exact timeline clip extraction is blocked for accuracy. Try another video with captions/transcript.');
    }

    const transcriptGrounding = buildTranscriptGroundingText(transcriptEntries, 55);

    const basePrompt = `Create an INTELLIGENT exact short-video clip extraction plan from THIS YouTube video context.

URL: ${payload.videoUrl}
Title: ${payload.primaryTitle}
Summary: ${payload.summary}
Description: ${payload.description.slice(0, 900)}
Target total duration: ${payload.targetDurationSeconds} seconds
${transcriptGrounding}

CRITICAL REQUIREMENTS:

Step 1: ANALYZE THE ACTUAL VIDEO CONTENT
- Understand key moments of engagement, conflict, turning points, emotional peaks
- Identify EXACT timing of high-impact scenes
- Determine exactly when each moment starts and ends

Step 2: SELECT THE BEST HOOK (NOT RANDOM)
- Hook MUST be the most attention-grabbing moment in the entire video
- It should make someone stop scrolling immediately
- Hook timeRange must match an actual compelling event in the video
- Do NOT pick random timestamps - pick the BEST one

Step 3: SELECT THE MIDDLE
- Middle should escalate or deepen the narrative from the hook
- Must be a natural continuation of the story
- Must have actual content at those specific timestamps

Step 4: SELECT THE END
- End should provide resolution or lasting impact
- Should make viewers want to watch the full video

Step 5: VERIFY ACCURACY
- Each segment timestamp must correspond to REAL content in the video
- editInstruction must accurately describe what ACTUALLY happens at those timestamps
- Do NOT invent events or falsify timestamps
- If transcript grounding is present, choose timestamp ranges that overlap transcript cues

Rules:
1. Return exactly 3 segments: Hook, Middle, End
2. Each must reference REAL events that actually occur at those video timestamps
3. Use MM:SS-MM:SS format matching actual video timeline
4. durationSeconds must EXACTLY match the timestamp range
5. Total of all durationSeconds must equal ${payload.targetDurationSeconds}
6. editInstruction must be specific to actual clip content - ACCURACY IS CRITICAL
7. ONLY suggest timestamps for events you can VERIFY really exist in the video
8. If uncertain about content accuracy, return error

Return strict JSON only:
{
  "shortsClipPlan": [
    {"segment":"Hook","timeRange":"MM:SS-MM:SS","durationSeconds":0,"editInstruction":"Exact description of what's happening - MUST BE ACCURATE"},
    {"segment":"Middle","timeRange":"MM:SS-MM:SS","durationSeconds":0,"editInstruction":"Exact description of what's happening - MUST BE ACCURATE"},
    {"segment":"End","timeRange":"MM:SS-MM:SS","durationSeconds":0,"editInstruction":"Exact description of what's happening - MUST BE ACCURATE"}
  ]
}`;

    let validationFeedback = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const prompt = validationFeedback
            ? `${basePrompt}\n\nVALIDATION/ACCURACY FAILED IN PREVIOUS ATTEMPT:\n${validationFeedback}\n\nREQUIRED FIXES:\n- CRITICALLY: Verify Hook is the SINGLE MOST COMPELLING moment and actually exists at those timestamps\n- CRITICALLY: Confirm Middle progresses story naturally and events really happen there\n- CRITICALLY: Confirm End provides closure and every timestamp is accurate\n- ACCURACY CHECK: Only suggest timestamps where you can VERIFY exact content exists in the video\n- Do NOT make up scenes, do NOT invent timestamps\n- Do NOT guess - use only actual identifiable moments from the video\n- Pick the BEST Hook wisely, not randomly\n- Regenerate with maximum confidence in accuracy`
            : basePrompt;

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert short-form video editor for ${payload.channelName}. CRITICAL: Every timestamp and event description MUST correspond to actual content in the video. Do NOT make up scenes or falsify timestamps. Choose the BEST Hook, not random timestamps. Verify accuracy before responding. Return JSON only. NO other text.`
                },
                { role: "user", content: prompt }
            ],
            model,
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("No response from Groq.");

        const parsed = JSON.parse(content.replace(/```json\n?|```/g, "").trim());
        if (parsed?.error) {
            throw new Error(String(parsed.error));
        }

        const normalized = normalizeSeoOutput({
            shortsClipPlan: parsed.shortsClipPlan || parsed.clipPlan || []
        }, payload.channelName);

        const validation = validateShortsClipPlan(normalized.shortsClipPlan, payload.targetDurationSeconds);
        const transcriptErrors = validatePlanAgainstTranscript(normalized.shortsClipPlan, transcriptEntries);
        if (validation.valid && transcriptErrors.length === 0) {
            return normalized.shortsClipPlan;
        }

        validationFeedback = [...validation.errors, ...transcriptErrors].join(' | ');
    }

    throw new Error(`Failed to generate a valid clip plan after 3 attempts. ${validationFeedback}`);
}
