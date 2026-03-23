import Groq from "groq-sdk";
import { normalizeSeoOutput, type VideoAnalysisResult } from "./geminiService";

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
        return { status: 'error', message: `GROQ ERROR: ${e.message.substring(0, 100)}`, model };
    }
}

export async function analyzeWithGroq(
    url: string,
    apiKey: string,
    model: string = "llama-3.3-70b-versatile",
    metaData?: string
): Promise<VideoAnalysisResult> {
    const groq = new Groq({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

    const infoFound = metaData ? `REAL DATA FOUND FOR THIS VIDEO:\n${metaData}` : `Video URL: ${url}`;

    const prompt = `CRITICAL TASK: Generate a Viral SEO Package for "Dispatch Raw".
${infoFound}

SYSTEM MANDATE: YOU MUST include this EXACT DISCLAIMER at the VERY TOP of EVERY description:
"**DISCLAIMER:**  
This video is for educational, informational, and documentary purposes only. The footage is sourced from publicly available records and is presented to promote transparency, awareness, and understanding of law enforcement interactions. We are not affiliated with any law enforcement agency, police department, or government entity. No endorsement or affiliation is implied. Viewer discretion is advised due to potentially graphic or intense content. This is not legal advice, and nothing in this video should be construed as professional guidance."

INSTRUCTIONS:
1. SUMMARY: Analyze facts (5+ sentences). Use catchy emojis (🚨, 🔥, 😱).
2. TITLES: 3 curiosity-hooks with 🚨, 😱, 🔥, 🚔 emojis and 2 hashtags in every title.
3. DESCRIPTION: DIRECT COPY-PASTE FORMAT. (Disclaimer -> Hook 😱 -> Tease 👀 -> Dispatch Raw CTA 🔥 -> Viral Hashtags). End description with 15-20 relevant hashtags.
4. TAGS: 20-35 comma-separated tags including 'Dispatch Raw', optimized for YouTube discoverability and kept within the 500-character tag field limit.
5. TIPS: 3 tactical lines with 📽️, 🔊, 📝 icons.

SCHEMA (STRICT):
{
  "summaryEnglish": "Minimum 5 detailed sentences with emojis...",
  "summaryUrdu": "Detailed Roman Urdu...",
  "titles": ["Catchy Title 🚨 #Shorts #Arrest", "Catchy Title 😱 #Viral #Police", "Catchy Title 🔥 #Bodycam #Tactical"],
  "description": "Full copy-paste block starting WITH DISCLAIMER...",
  "tags": "Dispatch Raw, police, bodycam, incident...",
  "optimizationTips": ["📽️ tip", "🔊 tip", "📝 tip"]
}

Output ONLY pure JSON.`;

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are the Dispatch Raw Agent. You extract facts and generate dramatic SEO per the 2026 blueprint. You ONLY output valid JSON."
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
            optimizationTips: raw.optimizationTips || raw.tips || raw.extraTrends || []
        });
    } catch (e) {
        console.error("Groq Final Parse Fail:", content);
        throw new Error("The AI response was malformed. Please try again.");
    }
}
