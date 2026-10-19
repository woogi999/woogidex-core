// Small copies of Fakemon artwork, for cards and pickers.
//
// Artwork is stored as a full-size data URL (often 1000px+ and hundreds of
// KB). Every collection card used to show that full image at ~180px, so a
// collection of 100 Fakemon meant decoding 100 full pictures and holding them
// all in GPU memory: slow scrolling and dropped frames on a phone, and the
// tab being killed on a cheap one. A card now gets a ~384px WebP made once
// per session; the decode happens off the main thread where the browser
// supports it (createImageBitmap), a couple at a time so it never blocks.

import { log } from './log.ts';

const THUMB_PX = 384;
// a data URL this short is already about thumbnail-sized; not worth a copy
const MIN_SOURCE_CHARS = 60_000;
const MAX_CACHED = 400;
const PARALLEL = 2;

const ready = new Map<string, string>();         // source -> object URL (insertion order = LRU)
const waiting = new Map<string, Promise<string>>();
let running = 0;
const queue: Array<() => void> = [];

/** The thumbnail if it's already made, else null. */
export function cachedThumb(src: string): string | null {
    const hit = ready.get(src);
    if (hit) { ready.delete(src); ready.set(src, hit); }   // most recently used
    return hit || null;
}

/** Whether `src` gets a thumbnail at all (big data URLs only). */
export function wantsThumb(src: string | null | undefined): src is string {
    return !!src && src.length > MIN_SOURCE_CHARS && src.startsWith('data:image/') && typeof createImageBitmap === 'function';
}

/** Resolves to a small object URL for `src`, or to `src` itself if it can't be made smaller. */
export function thumbFor(src: string): Promise<string> {
    const hit = cachedThumb(src);
    if (hit) return Promise.resolve(hit);
    let p = waiting.get(src);
    if (!p) {
        p = new Promise<string>(resolve => {
            queue.push(() => make(src).then(url => {
                if (url !== src) remember(src, url);
                resolve(url);
            }));
            pump();
        }).finally(() => waiting.delete(src));
        waiting.set(src, p);
    }
    return p;
}

function pump() {
    while (running < PARALLEL && queue.length) {
        const job = queue.shift()!;
        running++;
        // the job resolves its own promise; this just frees the slot
        Promise.resolve().then(job).finally(() => { running--; pump(); });
    }
}

function remember(src: string, url: string) {
    ready.set(src, url);
    while (ready.size > MAX_CACHED) {
        const [oldest, oldUrl] = ready.entries().next().value as [string, string];
        ready.delete(oldest);
        URL.revokeObjectURL(oldUrl);
    }
}

async function make(src: string): Promise<string> {
    try {
        const blob = await (await fetch(src)).blob();
        const full = await createImageBitmap(blob);
        const scale = THUMB_PX / Math.max(full.width, full.height);
        if (scale >= 1) { full.close(); return src; }
        const w = Math.max(1, Math.round(full.width * scale)), h = Math.max(1, Math.round(full.height * scale));
        let out: Blob | null;
        if (typeof OffscreenCanvas === 'function') {
            const canvas = new OffscreenCanvas(w, h);
            const ctx = canvas.getContext('2d')!;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(full, 0, 0, w, h);
            out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(full, 0, 0, w, h);
            out = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.9));
        }
        full.close();
        return out ? URL.createObjectURL(out) : src;
    } catch (e) {
        log.debug('THUMBS', 'Could not make a thumbnail; showing the full image', e);
        return src;
    }
}
