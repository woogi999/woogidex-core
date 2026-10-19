// Avatars, masked the way community artwork is.
//
// An avatar used to be a public bucket URL rendered as <img src>. That put a
// real image request in the network panel for every face on the page, and the
// URL kept working for anyone who copied it. Now the bytes live in
// profiles.avatar_data, come back AES-masked from profile_avatars(), and paint
// into a canvas -- see js/core/art-shield.ts, which owns the decoding and is
// honest about what this kind of protection is and is not.
//
// avatar_url is still the fallback. Anyone who has not re-saved their profile
// since this shipped has no avatar_data, and their bucket copy is all there is.
//
// Batched and cached per page life: a busy comment thread asks for one round
// trip, not one per face. Also kept on disk (art-cache.ts) against the
// person's avatar_url: avatar_data and avatar_url are always saved together
// (auth.ts), and the URL carries the upload time, so while it's the same URL
// it's the same face and the next visit needs no request for it at all.

import { maskedArtwork } from './art-shield.ts';
import { getCachedArt, putCachedArt } from './art-cache.ts';
import { log } from './log.ts';

// user id -> masked avatar, or '' for "asked, and there isn't one"
const cache = new Map();
const waiters = new Map();       // user id -> [resolve, ...]
const queue = new Set();
const versions = new Map<string, string>();   // user id -> the avatar_url it was asked with
let flushTimer: any = null;
const diskKey = (userId: string) => `avatar:${userId}`;
let getClient: any = null;

/**
 * Hands this module the Supabase client getter. Called once from app start;
 * kept as a setter so this file has no import cycle back into the feature
 * layer, the same way art-shield.ts stays dependency-free.
 * @param clientGetter
 */
export function initAvatars(clientGetter: () => Promise<Record<string, any>>) {
    getClient = clientGetter;
}

/**
 * Masked avatar for one user, if they have one.
 * @param userId
 * @param version their avatar_url, when the caller has it: what the copy on disk is checked against
 * @returns '' when there is none, or when the lookup failed
 */
export function requestAvatar(userId: string, version = ''): Promise<string> {
    if (!userId) return Promise.resolve('');
    const hit = cache.get(userId);
    if (hit !== undefined) return Promise.resolve(hit);
    return new Promise(resolve => {
        if (!waiters.has(userId)) waiters.set(userId, []);
        waiters.get(userId).push(resolve);
        if (version) versions.set(userId, version);
        queue.add(userId);
        // coalesce a burst (a comment thread painting, a feed of cards) into
        // one round trip rather than one request per face
        flushTimer ||= setTimeout(flush, 50);
    });
}

/** What is already in hand, synchronously. '' if nothing, undefined if unasked. */
export function cachedAvatar(userId) {
    return userId ? cache.get(userId) : undefined;
}

async function flush() {
    flushTimer = null;
    // capped like the artwork batches: a big thread's faces in one response can time out
    const ids = ([...queue] as string[]).slice(0, 40);
    ids.forEach(id => queue.delete(id));
    if (queue.size) flushTimer = setTimeout(flush, 0);
    if (!ids.length) return;
    // the ones on disk under the same avatar_url need no request
    const ask: string[] = [];
    await Promise.all(ids.map(async id => {
        const v = versions.get(id);
        const stored = v ? await getCachedArt(diskKey(id)) : null;
        try {
            const entry = stored ? JSON.parse(stored) : null;
            if (entry && entry.v === v && typeof entry.image === 'string') { cache.set(id, entry.image); return; }
        } catch { /* unreadable: ask again */ }
        ask.push(id);
    }));
    if (ask.length) {
        try {
            if (!getClient) throw new Error('avatars: no client getter registered');
            const client = await getClient();
            const { data, error } = await client.rpc('profile_avatars', { p_ids: ask });
            if (error) throw error;
            for (const row of data || []) cache.set(row.user_id, maskedArtwork(row.image));
            // remembered with the URL they were asked with, faces and no-faces alike
            for (const id of ask) {
                const v = versions.get(id);
                if (v) putCachedArt(diskKey(id), JSON.stringify({ v, image: cache.get(id) || '' }));
            }
        } catch (e: any) {
            log.debug('AVATAR', 'Could not load avatars', e);
            // fall through: everyone asked for gets '' below and falls back to the
            // plain URL, which is what they were showing before this existed
        }
    }
    // Anyone the query did not answer for has no avatar_data. Cached as '' so a
    // second scroll past them does not ask again.
    for (const id of ids) {
        if (!cache.has(id)) cache.set(id, '');
        const list = waiters.get(id);
        if (!list) continue;
        waiters.delete(id);
        for (const resolve of list) resolve(cache.get(id) || '');
    }
}

/** Forgets one entry, so a fresh upload is picked up rather than the old face. */
export function dropCachedAvatar(userId) {
    if (!userId) return;
    cache.delete(userId);
    versions.delete(userId);
}
