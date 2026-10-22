// A Fakémon's pictures, as sets: Official Artwork (normal and shiny), Sprites
// (front, back and their shiny passes), an Icon, and Concept Art. A Fakémon
// can have more than one of each.
//
// The first Official Artwork set is the main one. It stays in the record's
// old fields (artwork, shinyArtwork, artCredit, shinyArtCredit), so cards,
// battles, exports, the Community Hub and every older reader keep working
// unchanged. All other sets live in `artSets`. Each image has its own credit
// and its own description (the main set: artDescription, shinyArtDescription).
//
// The editor holds the main set in state.artworkData / shinyArtworkData /
// artCredit / shinyArtCredit and the rest in state.artSets. The UI is
// js/app/components/editor/ArtworkSection.tsx.

import { api, state } from '../core/app.ts';
import { confirmDialog } from '../core/confirm-dialog.ts';
import { notify } from '../app/store.ts';

export type ArtKind = 'official' | 'sprites' | 'icon' | 'concept';
export interface ArtImage { slot: string; src: string; credit?: string; description?: string; }
export interface ArtSet { id: string; kind: ArtKind; label?: string; images: ArtImage[]; }

interface KindInfo {
    title: string;
    /** fixed slots, [slot, label]; empty for a kind that takes any number of images */
    slots: Array<[string, string]>;
    hint: string;
    /** small pixel art: draw it without smoothing */
    pixel?: boolean;
    /** the recommended size, width by height */
    size?: [number, number];
    maxBytes: number;
}

export const MAIN_ART_SET = 'main';
export const MAX_ART_SETS = 16;
export const MAX_CONCEPT_IMAGES = 12;
const CONCEPT_SLOT = 'concept';
const MAX_LABEL = 40;
const MAX_CREDIT = 200;
export const MAX_DESCRIPTION = 500;
const MB = 1024 * 1024;

export const ART_KINDS: Record<ArtKind, KindInfo> = {
    official: { title: 'Official Artwork', slots: [['normal', 'Normal'], ['shiny', 'Shiny']], hint: 'Any size, up to 2 MB each.', maxBytes: 2 * MB },
    sprites: {
        title: 'Sprites', slots: [['front', 'Front'], ['back', 'Back'], ['shinyFront', 'Shiny front'], ['shinyBack', 'Shiny back']],
        hint: '96 × 96 recommended. The shiny pass is optional.', pixel: true, size: [96, 96], maxBytes: 512 * 1024
    },
    icon: { title: 'Icon', slots: [['icon', 'Icon']], hint: '30 × 40 recommended.', pixel: true, size: [30, 40], maxBytes: 256 * 1024 },
    concept: { title: 'Concept Art', slots: [], hint: `Sketches and early designs, up to ${MAX_CONCEPT_IMAGES} images, 2 MB each.`, maxBytes: 2 * MB }
};
export const ART_KIND_ORDER: ArtKind[] = ['official', 'sprites', 'icon', 'concept'];

// No SVG: an image here can travel to other people (Community Hub, files).
const IMAGE_URI = /^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,[A-Za-z0-9+/=]+$/;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
export const ART_ACCEPT = ACCEPTED_TYPES.join(',');

const isKind = (k: unknown): k is ArtKind => typeof k === 'string' && Object.prototype.hasOwnProperty.call(ART_KINDS, k);
const cleanText = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
/** Like cleanText, but keeps line breaks (at most one empty line in a row). */
const cleanNote = (v: unknown, max: number) => typeof v === 'string'
    ? v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
    : '';
const newSetId = () => `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * The extra sets from a record, checked: known kinds, known slots, inline
 * images only. Records come from imports, old saves and other people.
 */
export function cleanArtSets(raw: unknown): ArtSet[] {
    if (!Array.isArray(raw)) return [];
    const out: ArtSet[] = [];
    const ids = new Set<string>();
    for (const s of raw) {
        if (out.length >= MAX_ART_SETS) break;
        if (!s || typeof s !== 'object' || !isKind((s as any).kind)) continue;
        const kind = (s as any).kind as ArtKind;
        const info = ART_KINDS[kind];
        const images: ArtImage[] = [];
        for (const i of Array.isArray((s as any).images) ? (s as any).images : []) {
            if (!i || typeof i !== 'object' || typeof i.src !== 'string' || !IMAGE_URI.test(i.src)) continue;
            const slot = info.slots.length ? String(i.slot) : CONCEPT_SLOT;
            if (info.slots.length ? !info.slots.some(([k]) => k === slot) || images.some(x => x.slot === slot) : images.length >= MAX_CONCEPT_IMAGES) continue;
            const credit = cleanText(i.credit, MAX_CREDIT);
            const description = cleanNote(i.description, MAX_DESCRIPTION);
            images.push({ slot, src: i.src, ...(credit ? { credit } : {}), ...(description ? { description } : {}) });
        }
        let id = typeof (s as any).id === 'string' && /^[\w-]{1,40}$/.test((s as any).id) ? (s as any).id : newSetId();
        if (id === MAIN_ART_SET || ids.has(id)) id = newSetId();
        ids.add(id);
        const label = cleanText((s as any).label, MAX_LABEL);
        out.push({ id, kind, ...(label ? { label } : {}), images });
    }
    return out;
}

/** The main Official Artwork set, from the record's old fields. */
export function mainArtSet(rec: { artwork?: any; shinyArtwork?: any; artCredit?: any; shinyArtCredit?: any; artDescription?: any; shinyArtDescription?: any }): ArtSet {
    const images: ArtImage[] = [];
    const add = (slot: string, src: unknown, credit: unknown, note: unknown) => {
        if (typeof src !== 'string' || !src) return;
        const c = cleanText(credit, MAX_CREDIT);
        const d = cleanNote(note, MAX_DESCRIPTION);
        images.push({ slot, src, ...(c ? { credit: c } : {}), ...(d ? { description: d } : {}) });
    };
    add('normal', rec.artwork, rec.artCredit, rec.artDescription);
    add('shiny', rec.shinyArtwork, rec.shinyArtCredit, rec.shinyArtDescription);
    return { id: MAIN_ART_SET, kind: 'official', images };
}

/** Every set of a record: the main one first. */
export function allArtSets(rec: any): ArtSet[] {
    return [mainArtSet(rec || {}), ...cleanArtSets(rec?.artSets)];
}

/** What a set is called: its own label, or its kind with a number when there is more than one. */
export function artSetTitle(set: ArtSet, sets: ArtSet[]): string {
    if (set.label) return set.label;
    const same = sets.filter(s => s.kind === set.kind);
    const n = same.indexOf(set) + 1;
    return n > 1 ? `${ART_KINDS[set.kind].title} ${n}` : ART_KINDS[set.kind].title;
}

export const artImage = (set: ArtSet | undefined, slot: string) => Array.isArray(set?.images) ? set.images.find(i => i?.slot === slot) : undefined;

// ==================== the editor ====================

/** The sets the editor holds, the main one first. */
export function editorArtSets(): ArtSet[] {
    return [mainArtSet({
        artwork: state.artworkData, shinyArtwork: state.shinyArtworkData,
        artCredit: state.artCredit, shinyArtCredit: state.shinyArtCredit,
        artDescription: state.artDescription, shinyArtDescription: state.shinyArtDescription
    }), ...(state.artSets || [])];
}

export function editorArtTab(): string {
    const id = state.artTab || MAIN_ART_SET;
    return id === MAIN_ART_SET || (state.artSets || []).some((s: ArtSet) => s.id === id) ? id : MAIN_ART_SET;
}

export function selectArtTab(id: string) {
    state.artTab = id;
    notify();
}

function changed(immediate = false) {
    notify();
    api.updatePreview?.();
    api.autoSave?.(immediate);
}

function extraSet(id: string): ArtSet | undefined {
    return (state.artSets || []).find((s: ArtSet) => s.id === id);
}

export function addArtSet(kind: ArtKind) {
    if (!isKind(kind)) return;
    if ((state.artSets || []).length + 1 >= MAX_ART_SETS) {
        api.showToast?.(`A Fakémon can have up to ${MAX_ART_SETS} artwork sets.`, 'warning');
        return;
    }
    const set: ArtSet = { id: newSetId(), kind, images: [] };
    state.artSets = [...(state.artSets || []), set];
    state.artTab = set.id;
    changed(true);
}

export async function removeArtSet(id: string) {
    const set = extraSet(id);
    if (!set) return;
    if (set.images.length && !await confirmDialog({ title: `Delete "${artSetTitle(set, editorArtSets())}"?`, message: 'Its images and credits go too.' })) return;
    state.artSets = (state.artSets || []).filter((s: ArtSet) => s.id !== id);
    if (state.artTab === id) state.artTab = MAIN_ART_SET;
    changed(true);
}

export function renameArtSet(id: string, label: string) {
    const set = extraSet(id);
    if (!set) return;
    const clean = cleanText(label, MAX_LABEL);
    if ((set.label || '') === clean) return;
    if (clean) set.label = clean; else delete set.label;
    state.artSets = [...state.artSets];
    changed(true);
}

/** Moves a set one place left or right among the extra sets. */
export function moveArtSet(id: string, by: -1 | 1) {
    const list: ArtSet[] = [...(state.artSets || [])];
    const at = list.findIndex(s => s.id === id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to], list[at]];
    state.artSets = list;
    changed(true);
}

/**
 * An image as a data URI an extra set can hold (IMAGE_URI). The main set takes
 * more (a link from a main-game template, SVG, TIFF...): those are drawn on a
 * canvas and come back as PNG, or WebP when the PNG is over the size cap.
 * Null when the picture cannot be read.
 */
async function portableImage(src: string): Promise<string | null> {
    if (IMAGE_URI.test(src)) return src;
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 512;
        canvas.height = img.naturalHeight || 512;
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const png = canvas.toDataURL('image/png');
        const out = png.length <= 2_800_000 ? png : canvas.toDataURL('image/webp', 0.9);
        return IMAGE_URI.test(out) && out.length <= 2_800_000 ? out : null;
    } catch {
        return null;
    }
}

/** Swaps an extra Official Artwork set with the main one. */
export async function makeMainArtSet(id: string) {
    const set = extraSet(id);
    if (!set || set.kind !== 'official') return;
    const main = editorArtSets()[0];
    // the old main pictures move into an extra set, which only holds inline
    // PNG/JPEG/WebP/GIF/AVIF/BMP: convert any other kind first, so nothing is lost
    const moved: ArtImage[] = [];
    for (const image of main.images) {
        const src = await portableImage(image.src);
        if (!src) {
            api.showToast?.('The main artwork could not be converted for the swap. Download it and upload it again, then try once more.', 'warning');
            return;
        }
        moved.push({ ...image, src });
    }
    const live = extraSet(id);
    if (!live) return;
    const next = artImage(live, 'normal'), nextShiny = artImage(live, 'shiny');
    state.artworkData = next?.src || null;
    state.artCredit = next?.credit || null;
    state.artDescription = next?.description || null;
    state.shinyArtworkData = nextShiny?.src || null;
    state.shinyArtCredit = nextShiny?.credit || null;
    state.shinyArtDescription = nextShiny?.description || null;
    live.images = moved;
    state.artSets = [...state.artSets];
    state.artTab = MAIN_ART_SET;
    api.showToast?.('That set is now the main artwork.', 'success');
    changed(true);
}

/** Reads an image file for a set, or says why it cannot. */
function readArtFile(file: File | null | undefined, kind: ArtKind): Promise<string | null> {
    if (!file) return Promise.resolve(null);
    const info = ART_KINDS[kind];
    if (!file.type?.startsWith('image/')) { api.showToast?.('Please use an image file.', 'error'); return Promise.resolve(null); }
    if (file.size > info.maxBytes) {
        const limit = info.maxBytes >= MB ? `${info.maxBytes / MB} MB` : `${Math.round(info.maxBytes / 1024)} KB`;
        api.showToast?.(`${info.title} images can be up to ${limit}.`, 'error');
        return Promise.resolve(null);
    }
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => { api.showToast?.('That image could not be read.', 'error'); resolve(null); };
        reader.readAsDataURL(file);
    });
}

/**
 * Puts an image in a set. `index` replaces that concept image; without it a
 * concept set gets a new image.
 */
export async function setArtImageFile(setId: string, slot: string, file: File | null | undefined, index?: number) {
    if (setId === MAIN_ART_SET) {
        if (slot !== 'normal' && slot !== 'shiny') return;
        // the main set runs through the old upload path, which takes any image type
        state.artworkMode = slot;
        api.processArtworkFile?.(file);
        return;
    }
    const set = extraSet(setId);
    if (!set) return;
    // the concept image to replace, held by identity: it can move while the file is read
    const target = index !== undefined ? set.images[index] : undefined;
    if (file && !ACCEPTED_TYPES.includes(file.type)) { api.showToast?.('Please use a PNG, JPEG, WebP, GIF, AVIF or BMP image.', 'error'); return; }
    const src = await readArtFile(file, set.kind);
    if (!src || !IMAGE_URI.test(src)) return;
    // the set may be gone, or swapped, while the file was read
    const live = extraSet(setId);
    if (!live) return;
    if (live.kind === 'concept') {
        const at = target ? live.images.indexOf(target) : -1;
        if (at >= 0) live.images[at] = { ...target!, src };
        else if (live.images.length >= MAX_CONCEPT_IMAGES) { api.showToast?.(`A concept art set holds up to ${MAX_CONCEPT_IMAGES} images.`, 'warning'); return; }
        else live.images.push({ slot: CONCEPT_SLOT, src });
    } else {
        if (!ART_KINDS[live.kind].slots.some(([k]) => k === slot)) return;
        const at = live.images.findIndex(i => i.slot === slot);
        if (at >= 0) live.images[at] = { ...live.images[at], src };
        else live.images.push({ slot, src });
    }
    state.artSets = [...state.artSets];
    changed(true);
}

/** Several concept images at once (a multi-file pick or drop). */
export async function addConceptFiles(setId: string, files: FileList | File[] | null | undefined) {
    for (const file of Array.from(files || [])) await setArtImageFile(setId, CONCEPT_SLOT, file);
}

export function removeArtImage(setId: string, slot: string, index?: number) {
    if (setId === MAIN_ART_SET) {
        if (slot === 'shiny') state.shinyArtworkData = null;
        else if (slot === 'normal') state.artworkData = null;
        changed(true);
        return;
    }
    const set = extraSet(setId);
    if (!set) return;
    set.images = set.kind === 'concept' && index !== undefined ? set.images.filter((_, i) => i !== index) : set.images.filter(i => i.slot !== slot);
    state.artSets = [...state.artSets];
    changed(true);
}

/** Sets an image's credit or description. An empty value removes it. */
export function setArtImageText(setId: string, slot: string, field: 'credit' | 'description', value: string, index?: number) {
    const clean = (field === 'credit' ? cleanText(value, MAX_CREDIT) : cleanNote(value, MAX_DESCRIPTION)) || null;
    if (setId === MAIN_ART_SET) {
        const key = field === 'credit' ? (slot === 'shiny' ? 'shinyArtCredit' : 'artCredit') : (slot === 'shiny' ? 'shinyArtDescription' : 'artDescription');
        state[key] = clean;
        changed(true);
        return;
    }
    const set = extraSet(setId);
    if (!set) return;
    const image = set.kind === 'concept' && index !== undefined ? set.images[index] : artImage(set, slot);
    if (!image) return;
    if (clean) image[field] = clean; else delete image[field];
    state.artSets = [...state.artSets];
    changed(true);
}

export const setArtImageCredit = (setId: string, slot: string, credit: string, index?: number) => setArtImageText(setId, slot, 'credit', credit, index);

/** Uses one credit for every image in a set that has none yet. */
export function fillArtSetCredits(setId: string, credit: string) {
    const clean = cleanText(credit, MAX_CREDIT);
    if (!clean) return;
    if (setId === MAIN_ART_SET) {
        if (state.artworkData && !state.artCredit) state.artCredit = clean;
        if (state.shinyArtworkData && !state.shinyArtCredit) state.shinyArtCredit = clean;
        changed(true);
        return;
    }
    const set = extraSet(setId);
    if (!set) return;
    set.images.forEach(i => { if (!i.credit) i.credit = clean; });
    state.artSets = [...state.artSets];
    changed(true);
}

// ==================== the board ====================

/** Which set the Pokédex board shows. */
export function setPreviewArtSet(id: string) {
    state.previewArtSet = id;
    state.previewArtIndex = 0;
    notify();
}

export function setPreviewArtIndex(index: number) {
    state.previewArtIndex = index;
    notify();
}
