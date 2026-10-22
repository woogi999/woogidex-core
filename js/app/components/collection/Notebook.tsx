// My Collection's notepad views (js/features/notebook.ts):
//   - the Unfinished shelf: every draft, newest first, as the listing shows
//     them: grid cards in one row that scrolls sideways, or table rows
//   - the tag bar: every tag in use; a click searches for it

import { useState } from 'react';
import { api, state } from '../../../core/app.ts';
import { Icon } from '../Icon.tsx';
import { allTags, isUnfinished } from '../../../features/notebook.ts';
import { FakemonCard } from './cards.tsx';
import { DexTable, FakemonRow } from './CollectionTable.tsx';
import type { Fakemon } from '../../types.ts';

const SHELF_KEY = 'woogidex.collection.shelf.closed';
const SHELF_MAX = 20;

/** The ideas and drafts in view (the active region's, when one is open). */
export function unfinishedInView(): Fakemon[] {
    return (state.fakemonDB || [])
        .filter((f: Fakemon) => !f.pendingVanilla && isUnfinished(f) && (!api.getActiveRegionId?.() || api.fakemonInActiveRegion(f)))
        .sort((a: Fakemon, b: Fakemon) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

export function UnfinishedShelf({ table = false }: { table?: boolean }) {
    const list = unfinishedInView();
    const [closed, setClosed] = useState(() => { try { return localStorage.getItem(SHELF_KEY) === '1'; } catch { return false; } });
    if (!list.length) return null;
    const toggle = () => {
        setClosed(c => { try { localStorage.setItem(SHELF_KEY, c ? '0' : '1'); } catch { /* a private window keeps it open */ } return !c; });
    };
    return (
        <section className={`shelf${closed ? ' is-closed' : ''}`} aria-label="Unfinished Fakémon">
            <header className="shelf-head">
                <button type="button" className="shelf-toggle" aria-expanded={!closed} onClick={toggle}>
                    <Icon name="chevron-down" size={16} className="shelf-chev" />
                    <span className="shelf-title">Unfinished</span>
                    <span className="shelf-count">{list.length}</span>
                </button>
                {list.length > SHELF_MAX && <button type="button" className="link-btn" onClick={() => api.setCollectionSearch('is:unfinished')}>See all</button>}
            </header>
            {!closed && (table
                ? <DexTable kind="fakemon" id="">{list.slice(0, SHELF_MAX).map(f => <FakemonRow key={f.id} f={f} inFolder={!!f.folderId} />)}</DexTable>
                : (
                    <div className="collection-grid shelf-strip">
                        {list.slice(0, SHELF_MAX).map(f => <FakemonCard key={f.id} f={f} inFolder={!!f.folderId} />)}
                    </div>
                ))}
        </section>
    );
}

/** Every tag in view; a click searches for it, a second click clears that search. */
export function TagBar({ search }: { search: string }) {
    const tags = allTags((state.fakemonDB || []).filter((f: Fakemon) => !f.pendingVanilla && (!api.getActiveRegionId?.() || api.fakemonInActiveRegion(f))));
    if (!tags.length) return null;
    const current = search.trim().toLowerCase();
    return (
        <div className="tag-bar" role="group" aria-label="Tags">
            <Icon name="hashtag" size={15} className="tag-bar-icon" />
            {tags.slice(0, 24).map(([t, n]) => {
                const on = current === `#${t}`;
                return (
                    <button key={t} type="button" className={`tag-chip tag-filter${on ? ' active' : ''}`} aria-pressed={on}
                        onClick={() => api.setCollectionSearch(on ? '' : `#${t}`)}>#{t}<b>{n}</b></button>
                );
            })}
        </div>
    );
}
