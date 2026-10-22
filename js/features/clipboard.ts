// My Collection's clipboard, as in File Explorer: Cut and Copy hold Fakémon
// or custom moves, abilities or items, and Paste puts them in the folder you
// are looking at (or the folder you pasted on). Cut moves the entries, Copy
// makes new ones named "Name - Copy". It holds one tab's kind at a time, and
// it lives only in this page: nothing goes to the system clipboard.

import { api, state } from '../core/app.ts';
import { notify } from '../app/store.ts';
import type { LibraryKind } from '../app/types.ts';

export type ClipKind = 'fakemon' | LibraryKind;
type Clip = { mode: 'cut' | 'copy'; kind: ClipKind; ids: string[] };

let clip: Clip | null = null;

const listFor = (kind: ClipKind): any[] =>
    kind === 'fakemon' ? state.fakemonDB : kind === 'moves' ? state.customMoves : kind === 'abilities' ? state.customAbilities : state.customItems;

const newId = (kind: ClipKind) => {
    const tail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return kind === 'fakemon' ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : `${{ moves: 'cm', abilities: 'ca', items: 'ci' }[kind]}_${tail}`;
};

function hold(mode: Clip['mode'], kind: ClipKind, id: string) {
    clip = { mode, kind, ids: [id] };
    notify();
    api.showToast?.(mode === 'cut' ? 'Cut. Open a folder and paste.' : 'Copied. Open a folder and paste.', 'info');
}

export const cutEntry = (kind: ClipKind, id: string) => hold('cut', kind, id);
export const copyEntry = (kind: ClipKind, id: string) => hold('copy', kind, id);

/** Whether an entry waits to be moved (its card shows faded, as in File Explorer). */
export const isCut = (id: string) => clip?.mode === 'cut' && clip.ids.includes(id);

/** Whether there is something to paste in this tab. */
export const canPaste = (kind: string) => !!clip && clip.kind === kind && clip.ids.some(id => listFor(clip!.kind)?.some(x => x.id === id));

/** Puts the clipboard's entries in `folderId` (null: outside every folder). */
export async function pasteInto(kind: string, folderId: string | null) {
    if (!clip || !canPaste(kind)) return;
    const list = listFor(clip.kind);
    const entries = clip.ids.map(id => list.find(x => x.id === id)).filter(Boolean);
    const now = Date.now();
    if (clip.mode === 'cut') {
        for (const x of entries) x.folderId = folderId;
        clip = null;
    } else {
        for (const x of entries) {
            const copy = JSON.parse(JSON.stringify(x));
            Object.assign(copy, { id: newId(kind as ClipKind), name: `${x.name || 'Unnamed'} - Copy`, folderId, pinned: false, createdAt: now, updatedAt: now });
            list.push(copy);
        }
    }
    await api.saveToStorage();
    api.renderCollection();
    notify();
    const folder = folderId ? state.folders.find((f: any) => f.id === folderId) : null;
    api.showToast?.(`Pasted ${entries.length === 1 ? `"${entries[0].name}"` : `${entries.length} entries`} in ${folder ? `"${folder.name}"` : 'My Collection'}.`, 'success');
}
