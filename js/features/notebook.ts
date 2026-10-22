// The notepad side of My Collection: how far along each Fakémon is (Draft
// or Done), its free notes, tags and drawings, and the quick ways in (quick
// add, bulk paste) that make a stub with nothing but a name.
//
// The fields sit on the Fakémon record itself (and on a region's record for
// its notepad), so they save, back up and export like everything else.
// A record from before these fields counts as Done, so an old collection does
// not suddenly look unfinished. The old "Idea" status reads as Draft.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { form, setForm } from '../editor/draft.ts';

export type Status = 'draft' | 'done';
export const STATUSES: Array<[Status, string, string]> = [
    // key, label, what it means
    ['draft', 'Draft', 'Not finished yet'],
    ['done', 'Done', 'Finished']
];

/**
 * One drawing on a notepad: a PNG data URL. The drawing made on the notes
 * themselves has the id INK_ID and keeps `w`, its width on the page in CSS
 * pixels, so it lines up with the text at any image size.
 */
export interface Doodle { id: string; src: string; w?: number; }
export const INK_ID = 'ink';

// a notepad keeps a handful of drawings, each a small PNG
export const MAX_DOODLES = 12;
export const MAX_DOODLE_CHARS = 600_000;
export const MAX_NOTES = 20_000;
export const MAX_TAGS = 12;
export const NAME_MAX_STUB = 40;

export function statusOf(f: { status?: string } | null | undefined): Status {
    return f?.status === 'idea' || f?.status === 'draft' ? 'draft' : 'done';
}

export const isUnfinished = (f: { status?: string }) => statusOf(f) !== 'done';

/** A tag as it is stored: lower case, no '#', single spaces, at most 24 characters. */
export function cleanTag(text: string): string {
    return String(text || '').replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
}

export function cleanTags(list: unknown): string[] {
    const out: string[] = [];
    for (const t of Array.isArray(list) ? list : []) {
        const c = cleanTag(String(t));
        if (c && !out.includes(c)) out.push(c);
    }
    return out.slice(0, MAX_TAGS);
}

export function cleanDoodles(list: unknown): Doodle[] {
    return (Array.isArray(list) ? list : [])
        .filter((d: any) => d && typeof d.id === 'string' && typeof d.src === 'string'
            && d.src.startsWith('data:image/png;base64,') && d.src.length <= MAX_DOODLE_CHARS)
        .slice(0, MAX_DOODLES)
        .map((d: any) => ({ id: d.id, src: d.src, ...(Number.isFinite(d.w) && d.w > 0 && d.w < 10_000 ? { w: Math.round(d.w) } : {}) }));
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---- stubs: quick add and bulk paste ----

/** A Fakémon with only a name (and maybe a note); the rest is filled in later. */
function stub(name: string, note: string, number = ''): any {
    const now = Date.now();
    const regionId = api.defaultRegionForNewFakemon?.() || null;
    return {
        id: newId(), name: name.slice(0, NAME_MAX_STUB), status: 'draft', notes: note.slice(0, MAX_NOTES),
        species: '', type1: '', type2: '', number, level: 100,
        stats: { hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 },
        abilities: [], learnset: [], sampleSets: [], dexEntry1: '', dexEntry2: '',
        height: '', weight: '', color: '', eggGroups: 'None', genderRatio: '50-50',
        artwork: null, shinyArtwork: null, cry: null,
        regionId, regionIds: regionId ? [regionId] : [],
        folderId: state.currentFolderId || null,
        pinned: false, createdAt: now, updatedAt: now
    };
}

/** Adds stubs to the collection and saves. Returns how many were made. */
export async function addStubs(entries: Array<{ name: string; note?: string; number?: string }>): Promise<number> {
    const made = entries.map(e => ({ name: e.name.trim(), note: (e.note || '').trim(), number: e.number || '' }))
        .filter(e => e.name).map(e => stub(e.name, e.note, e.number));
    if (!made.length) return 0;
    state.fakemonDB.push(...made);
    const ok = await api.saveToStorage();
    if (ok === false) {
        // the save refused (the collection did not load): take them back out
        state.fakemonDB = state.fakemonDB.filter((f: any) => !made.includes(f));
        return 0;
    }
    api.renderCollection();
    return made.length;
}

/**
 * The names in pasted text, one a line. Drops list marks ("1.", "- "),
 * blank lines and repeats. A "#004 Name" line keeps 004 as its Pokédex
 * number, and a "Name - note" or "Name: note" line keeps the note.
 */
export function parseBulkNames(text: string): Array<{ name: string; note: string; number: string }> {
    const seen = new Set<string>();
    const out: Array<{ name: string; note: string; number: string }> = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const dex = raw.match(/^\s*#(\d{1,4})\b[.:)-]?\s*/);
        const line = (dex ? raw.slice(dex[0].length) : raw).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
        if (!line) continue;
        const m = line.match(/^(.+?)\s+(?:-|–|:)\s+(.+)$/) || line.match(/^(.+?):\s*(.+)$/);
        const name = (m ? m[1] : line).trim().slice(0, NAME_MAX_STUB);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push({ name, note: m ? m[2].trim() : '', number: dex ? `#${dex[1].padStart(3, '0')}` : '' });
        if (out.length >= 500) break;
    }
    return out;
}

// ---- status, from a card or the editor header ----

export async function setFakemonStatus(id: string, status: Status) {
    const f = state.fakemonDB.find((x: any) => x.id === id);
    if (!f || statusOf(f) === status) return;
    f.status = status;
    f.updatedAt = Date.now();
    // the editor holds its own copy of the record it shows
    if (state.editingId === id && form.status !== status) setForm({ status });
    await api.saveToStorage();
    api.renderCollection();
}

// ---- searching notes and tags ----

/**
 * Whether a Fakémon matches the collection search. "#tag" matches a tag
 * exactly, "is:draft", "is:done" and "is:unfinished" match the
 * status, and anything else looks through the name, species, types, number,
 * tags and notes.
 */
export function matchesSearch(f: any, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every(w => {
        if (w.startsWith('#') && w.length > 1) return cleanTags(f.tags).includes(cleanTag(w));
        if (w.startsWith('is:')) {
            const s = w.slice(3) === 'idea' ? 'draft' : w.slice(3);
            return s === 'unfinished' ? isUnfinished(f) : statusOf(f) === s;
        }
        return [f.name, f.species, f.type1, f.type2, f.number, f.notes, ...(cleanTags(f.tags))]
            .some(v => v && String(v).toLowerCase().includes(w));
    });
}

/** Every tag in use, most used first. */
export function allTags(list: any[]): Array<[string, number]> {
    const count = new Map<string, number>();
    for (const f of list) for (const t of cleanTags(f.tags)) count.set(t, (count.get(t) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---- the dex-number check ----

/**
 * The holes and clashes in a list's Pokédex numbers: which numbers between
 * the lowest and the highest nobody has, and which numbers two or more share.
 */
export function dexNumberCheck(list: Array<{ name: string; number?: string }>) {
    const byNum = new Map<number, string[]>();
    let unnumbered = 0;
    for (const f of list) {
        const n = parseInt(String(f.number || '').replace(/^#/, ''), 10);
        if (!Number.isFinite(n) || n <= 0) { unnumbered++; continue; }
        byNum.set(n, [...(byNum.get(n) || []), f.name || 'Unnamed']);
    }
    const nums = [...byNum.keys()].sort((a, b) => a - b);
    const missing: number[] = [];
    if (nums.length) for (let n = nums[0]; n <= nums[nums.length - 1] && missing.length < 400; n++) if (!byNum.has(n)) missing.push(n);
    const clashes = nums.filter(n => byNum.get(n)!.length > 1).map(n => ({ n, names: byNum.get(n)! }));
    return { first: nums[0] ?? null, last: nums[nums.length - 1] ?? null, used: nums.length, missing, clashes, unnumbered };
}

/** "1-4, 7, 9-12": number runs, short. */
export function runs(nums: number[]): string {
    const out: string[] = [];
    for (let i = 0; i < nums.length; i++) {
        let j = i;
        while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
        out.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
        i = j;
    }
    return out.join(', ');
}

// ---- a region's notepad ----

export async function setRegionNotes(id: string, patch: { notes?: string; doodles?: Doodle[] }) {
    const region = (state.folders || []).find((f: any) => f.type === 'region' && String(f.id) === String(id));
    if (!region) return;
    if (patch.notes !== undefined) region.notes = patch.notes.slice(0, MAX_NOTES);
    if (patch.doodles !== undefined) region.doodles = cleanDoodles(patch.doodles);
    region.updatedAt = Date.now();
    notify();
    await api.saveToStorage();
}

export { newId as newDoodleId };
