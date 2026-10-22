// Small copies of Fakemon artwork, for cards and pickers.
//
// Artwork is stored as a full-size data URL (often 1000px+ and hundreds of
// KB). Every collection card used to show that full image at ~180px, so a
// collection of 100 Fakemon meant decoding 100 full pictures and holding them
// all in GPU memory: slow scrolling and dropped frames on a phone, and the
// tab being killed on a cheap one. A card now gets a ~384px WebP made once
// per session; the decode happens off the main thread where the browser
// supports it (createImageBitmap), a couple at a time so it never blocks.
//
// Order: a card on screen asks with 'now' and goes ahead of the rest. Every other
// card asks with 'later': those wait until nothing on screen is waiting, then
// go one at a time in idle moments, so a big collection fills in while you
// scroll instead of all at once.

import { log } from './log.ts';

const THUMB_PX = 384;
// a data URL this short is already about thumbnail-sized; not worth a copy
const MIN_SOURCE_CHARS = 60_000;
const MAX_CACHED = 400;
const PARALLEL = 2;

const ready = new Map<string, string>();         // source -> object URL (insertion order = LRU)
const waiting = new Map<string, Promise<string>>();
let running = 0;
type Job = { src: string; run: () => void };
const queue: Job[] = [];       // on screen, in the order they came near
const later: Job[] = [];       // off screen, in page order
let idleAsked = false;

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

/**
 * Resolves to a small object URL for `src`, or to `src` itself if it can't be
 * made smaller. 'now' (on screen) jumps the line; 'later' waits for idle time.
 * Asking 'now' for one already waiting 'later' moves it up.
 */
export function thumbFor(src: string, when: 'now' | 'later' = 'now'): Promise<string> {
    const hit = cachedThumb(src);
    if (hit) return Promise.resolve(hit);
    let p = waiting.get(src);
    if (!p) {
        p = new Promise<string>(resolve => {
            const job = { src, run: () => make(src).then(url => { if (url !== src) remember(src, url); resolve(url); }) };
            if (when === 'now') queue.push(job); else later.push(job);
            pump();
        }).finally(() => waiting.delete(src));
        waiting.set(src, p);
    } else if (when === 'now') {
        const at = later.findIndex(j => j.src === src);
        if (at >= 0) { queue.push(later.splice(at, 1)[0]); pump(); }
    }
    return p;
}

function start(job: Job) {
    running++;
    // the job resolves its own promise; this just frees the slot
    Promise.resolve().then(job.run).finally(() => { running--; pump(); });
}

function pump() {
    while (running < PARALLEL && queue.length) start(queue.shift()!);
    // off-screen work: one at a time, only when the screen has nothing waiting
    if (running || queue.length || !later.length || idleAsked) return;
    idleAsked = true;
    const go = () => { idleAsked = false; if (!running && !queue.length && later.length) start(later.shift()!); else pump(); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 120);
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
