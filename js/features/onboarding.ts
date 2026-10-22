// First-visit tips: a few short steps the first time someone opens each part
// of the site (My Collection and the editor; a host adds its own), shown
// once each and skippable. Battle has none while it's paused. Settings can
// turn them off (ShowTips in app.ts) or bring them all back. The tips
// themselves are js/app/shell/Onboarding.tsx.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import { ext } from '../core/extend.ts';

export type TourKey = string;

export interface TourStep {
    /** what the tip points at: the first of these that's on screen; none (or none showing) centres it */
    targets?: string[];
    title: string;
    body: string;
}

// a host adds its own tours here, and steps to these (see ext.tourFor)
export const TOURS: Record<TourKey, TourStep[]> = {
    collection: [
        {
            targets: ['.collection-add-card', '#collection-header-row .btn-primary'],
            title: 'Your collection lives here',
            body: 'Everything you make shows up on this page, saved right in your browser. Hit the + card (or Create) to make your first Fakémon.'
        },
        {
            targets: ['#app-sidebar', '#collection-regions-btn'],
            title: 'Regions, if you want them',
            body: 'Group Fakémon into regions to build a whole dex of your own. Totally optional.'
        },
        {
            targets: ['#collection-header-row .export-as-wrap .btn-secondary'],
            title: 'Back it up now and then',
            body: 'Your Fakémon are stored on this device, so export a backup every so often. Sign in and you can turn on cloud backup too.'
        }
    ],
    editor: [
        {
            targets: ['.editor-tabs'],
            title: 'Fill it in, any order',
            body: 'Basic Info has the name, types and Dex entries. Artwork, stats, moves and analysis are in the tabs next door. It saves as you go.'
        },
        {
            targets: ['.editor-preview-tab'],
            title: 'Peek at the board',
            body: 'Preview shows your Pokédex board, updating live while you type.'
        },
        {
            targets: ['.editor-sheet-head .export-as-wrap'],
            title: 'Take it with you',
            body: 'Export the board as a PNG, or the whole Fakémon for Showdown or Pokémon Essentials.'
        }
    ]
};

const STORAGE_KEY = 'woogidex-tips-seen';

function readSeen(): TourKey[] {
    try {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

export function tourSeen(key: TourKey): boolean {
    return readSeen().includes(key);
}

export function markTourSeen(key: TourKey): void {
    const seen = readSeen();
    if (seen.includes(key)) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen, key])); } catch { /* private mode: they show again next visit */ }
}

/** Settings' "take the tips again": forgets what's been seen, and turns tips back on. */
export function resetTours(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
    if (api.getShowTips?.() === false) api.setShowTips?.(true);
    notify();
    api.showToast?.('Tips are back. They’ll pop up as you visit each part of the site.', 'success');
}

/** Which part of the site is on screen, as far as the tips care. */
export function currentTourSection(): TourKey | null {
    const body = document.body;
    if (body.classList.contains('editor-sheet-open')) return state.isCommunityPreview ? null : 'editor';
    const page = body.dataset.page;
    if (page === 'collection-view') return 'collection';
    // the host's pages
    for (const fn of ext.tourFor) {
        const key = fn();
        if (key && TOURS[key]) return key;
    }
    return null;
}
