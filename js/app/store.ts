// React's view of the app's state.
//
// The data itself stays in the one mutable `state` object (js/core/app.ts)
// that the storage, battle and analysis code already read and write. React
// components read from it directly; whatever changes it calls notify(), and
// every component using useStore() re-renders. One version number instead of
// per-field subscriptions keeps this impossible to get subtly wrong, and the
// app is small enough that re-rendering the visible page is cheap.

import { createContext, useContext, useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;
let queued = false;

/**
 * Tells React the shared state changed. Several calls in one tick (a save
 * touches the collection, the manifest and the sidebar) become one render.
 */
export function notify(): void {
    version++;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
        queued = false;
        listeners.forEach(fn => fn());
    });
}

/**
 * notify(), but the components re-render before this returns. For values a
 * controlled input shows: React puts an input back to its current value right
 * after the keystroke's event, so the new value has to be there by then.
 */
export function notifySync(): void {
    version++;
    listeners.forEach(fn => fn());
}

export function subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

// ---- pages off screen keep their last render ----
// Every page stays mounted. Without this, each keystroke in the editor
// re-rendered My Collection's whole grid behind the sheet, and every page
// opened once before (the Community Hub, Settings...) on every change.

/** The page (its view id) the components below belong to; null for the shell. */
export const PageView = createContext<string | null>(null);

// the editor's hidden board feeds Export as PNG and the quick preview, so the
// editor always keeps up
const ALWAYS_LIVE = new Set(['editor-view', 'ability-block-editor-view']);

/** Whether a page is off screen, or under the editor sheet. */
function offScreen(view: string): boolean {
    if (ALWAYS_LIVE.has(view)) return false;
    const page = document.body.dataset.page;
    if (view !== page) return true;
    return document.body.classList.contains('editor-sheet-open');
}

const pausedAt = new Map<string, number>();

/** The version a page sees: the live one, or the one it had when it went off screen. */
function versionFor(view: string | null): number {
    if (!view || !offScreen(view)) { if (view) pausedAt.delete(view); return version; }
    if (!pausedAt.has(view)) pausedAt.set(view, version);
    return pausedAt.get(view)!;
}

/**
 * Re-renders the calling component whenever notify() runs; returns the
 * version. Inside a page that is off screen it waits, and catches up when
 * the page shows again (showing a page calls notify()).
 */
export function useStore(): number {
    const view = useContext(PageView);
    return useSyncExternalStore(subscribe, () => versionFor(view));
}

// ---- pages being opened ----
// A React page stays mounted while hidden, so "when it opens" is a counter
// the page shell bumps each time it shows the page; an effect keyed on it
// runs on every visit (refetching what may have changed meanwhile).
const shown = new Map<string, number>();

/** Called by the page shell whenever it shows a page. */
export function markViewShown(viewId: string): void {
    shown.set(viewId, (shown.get(viewId) || 0) + 1);
    notify();
}

/** How many times the page has been shown; changes on every visit. */
export function useViewShown(viewId: string): number {
    useStore();
    return shown.get(viewId) || 0;
}
