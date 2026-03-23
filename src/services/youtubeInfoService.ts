export interface BasicVideoInfo {
    title: string;
    author: string;
    url: string;
}

export async function fetchBasicYoutubeInfo(url: string): Promise<BasicVideoInfo | null> {
    try {
        // Official YouTube oEmbed endpoint (No API Key Required)
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const response = await fetch(oembedUrl);
        if (!response.ok) return null;

        const data = await response.json();
        return {
            title: data.title || '',
            author: data.author_name || '',
            url: url
        };
    } catch (error) {
        console.error('Error fetching YouTube info:', error);
        return null;
    }
}
