export interface YouTubeMetadata { title: string; author: string }

/** Read public oEmbed metadata directly from YouTube, with bounded requests. */
export class YouTubeMetadataLoader {
  private cache = new Map<string, Promise<YouTubeMetadata | null>>();
  private queue: Array<() => void> = [];
  private controllers = new Set<AbortController>();
  private active = 0;
  private closed = false;
  constructor(private request: typeof fetch = (input, init) => fetch(input, init)) {}
  load(url: string): Promise<YouTubeMetadata | null> {
    if (this.closed) return Promise.resolve(null);
    const existing = this.cache.get(url);
    if (existing) return existing;
    const result = new Promise<YouTubeMetadata | null>(resolve => {
      this.queue.push(() => {
        if (this.closed) { resolve(null); return; }
        this.active++;
        const controller = new AbortController();
        this.controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 8000);
        void this.request(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
          signal: controller.signal, credentials: 'omit'
        }).then(async response => {
          if (!response.ok) return null;
          const data: unknown = await response.json();
          if (!data || typeof data !== 'object' || !('title' in data) || typeof data.title !== 'string' || !data.title.trim()) return null;
          return { title: data.title.trim(), author: 'author_name' in data && typeof data.author_name === 'string' ? data.author_name.trim() : 'YouTube' };
        }).catch(() => null).then(resolve).finally(() => {
          clearTimeout(timeout);
          this.controllers.delete(controller);
          this.active--;
          this.pump();
        });
      });
    });
    this.cache.set(url, result);
    this.pump();
    return result;
  }
  private pump() { while (this.active < 4 && this.queue.length) this.queue.shift()!(); }
  dispose() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    for (const resolve of this.queue.splice(0)) resolve();
    this.cache.clear();
  }
}
