// The notepad pieces: free notes you can also draw on (NotesField), tags (TagsInput)
// and Draft / Done (StatusPicker). The editor's Notes tab and a
// region's details page use them; the data rules are in
// js/features/notebook.ts.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { openDialog } from '../../dialogs.tsx';
import { Icon } from '../Icon.tsx';
import { openContextMenu } from '../ContextMenu.tsx';
import { api } from '../../../core/app.ts';
import {
    INK_ID, MAX_NOTES, MAX_TAGS, STATUSES, cleanTag, type Doodle, type Status
} from '../../../features/notebook.ts';
import { InkLayer } from './InkLayer.tsx';
import './DoodlePad.tsx';

/** A textarea that grows with its text. */
function useAutosize(value: string) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(900, el.scrollHeight + 2)}px`;
    }, [value]);
    return ref;
}

/**
 * Free notes, with ink drawn on them (InkLayer.tsx). The text hands itself
 * over a moment after typing stops (and on leaving the field), so a notepad
 * does not save on every key. Doodles from before the ink still show under
 * the notes, where they can be edited or deleted.
 */
export function NotesField({ notes, doodles, onNotes, onDoodles, placeholder, label = 'Notes' }: {
    notes: string; doodles: Doodle[]; onNotes: (v: string) => void; onDoodles: (list: Doodle[]) => void;
    placeholder: string; label?: string;
}) {
    const [draft, setDraft] = useState(notes);
    const sent = useRef(notes);
    useEffect(() => { if (notes !== sent.current) { sent.current = notes; setDraft(notes); } }, [notes]);
    const commit = (v: string) => { if (v !== sent.current) { sent.current = v; onNotes(v); } };
    useEffect(() => {
        if (draft === sent.current) return;
        const t = setTimeout(() => commit(draft), 500);
        return () => clearTimeout(t);
    }, [draft]);
    // a notepad closed mid-sentence keeps the sentence
    const latest = useRef(draft);
    latest.current = draft;
    useEffect(() => () => commit(latest.current), []);
    const area = useAutosize(draft);

    const ink = doodles.find(d => d.id === INK_ID);
    const older = doodles.filter(d => d.id !== INK_ID);
    const draw = (doodle: Doodle) => openDialog('doodle', {
        src: doodle.src,
        onSave: (src: string) => onDoodles(doodles.map(d => d.id === doodle.id ? { ...d, src } : d))
    });
    const menu = (e: React.MouseEvent, d: Doodle, i: number) => openContextMenu(e, {
        title: `Doodle ${i + 1}`,
        items: [
            { label: 'Edit', icon: 'pencil', run: () => draw(d) },
            { label: 'Save as PNG', icon: 'download', run: () => { const a = document.createElement('a'); a.href = d.src; a.download = `doodle-${i + 1}.png`; a.click(); } },
            'sep',
            { label: 'Delete', icon: 'trash-2', danger: true, run: () => onDoodles(doodles.filter(x => x.id !== d.id)) }
        ]
    });

    return (
        <div className="notes-field">
            <InkLayer ink={ink} onInk={d => onDoodles(d ? [...older, d] : older)}
                onTooBig={() => api.showToast?.('This drawing is too big to save. Clear part of it and try again.', 'error')}>
                <textarea ref={area} className="notes-text" aria-label={label} placeholder={placeholder} maxLength={MAX_NOTES} value={draft}
                    onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)} />
            </InkLayer>
            {older.length > 0 && (
                <div className="notes-doodles">
                    {older.map((d, i) => (
                        <button key={d.id} type="button" className="notes-doodle" aria-label={`Doodle ${i + 1}: actions`} aria-haspopup="menu"
                            onClick={e => { e.preventDefault(); menu(e, d, i); }} onContextMenu={e => { e.preventDefault(); menu(e, d, i); }}
                            onDoubleClick={() => draw(d)}>
                            <img src={d.src} alt={`Doodle ${i + 1}`} draggable={false} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Tags as chips: Enter or a comma adds one, Backspace in the empty box takes the last one off. */
export function TagsInput({ tags, onTags, suggestions = [] }: { tags: string[]; onTags: (t: string[]) => void; suggestions?: string[] }) {
    const [text, setText] = useState('');
    const add = (raw: string) => {
        const t = cleanTag(raw);
        setText('');
        if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
        onTags([...tags, t]);
    };
    const listId = 'notes-tag-suggestions';
    return (
        <div className="tags-input" onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
            {tags.map(t => (
                <span key={t} className="tag-chip">#{t}
                    <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onTags(tags.filter(x => x !== t))}><Icon name="x-mark" size={12} /></button>
                </span>
            ))}
            {tags.length < MAX_TAGS && (
                <input type="text" value={text} list={listId} placeholder={tags.length ? 'Add a tag' : 'Add tags: starter, legendary, needs art…'} aria-label="Add a tag"
                    onChange={e => { const v = e.target.value; if (v.endsWith(',')) add(v.slice(0, -1)); else setText(v); }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); add(text); }
                        else if (e.key === 'Backspace' && !text && tags.length) onTags(tags.slice(0, -1));
                    }}
                    onBlur={() => { if (text.trim()) add(text); }} />
            )}
            <datalist id={listId}>{suggestions.filter(s => !tags.includes(s)).slice(0, 30).map(s => <option key={s} value={s} />)}</datalist>
        </div>
    );
}

/** Draft or Done. */
export function StatusPicker({ status, onStatus, compact = false }: { status: Status; onStatus: (s: Status) => void; compact?: boolean }) {
    return (
        <div className={`segmented status-picker${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label="How far along it is">
            {STATUSES.map(([key, label, hint]) => (
                <button key={key} type="button" role="radio" aria-checked={status === key} className={`status-${key}${status === key ? ' active' : ''}`}
                    title={hint} onClick={() => onStatus(key)}>
                    <i className="status-dot" aria-hidden="true" />{label}
                </button>
            ))}
        </div>
    );
}

/** A small "Draft" label; nothing for Done. */
export function StatusBadge({ status }: { status: Status }) {
    if (status === 'done') return null;
    return <span className={`status-badge status-${status}`}><Icon name="document-text" size={12} className="status-icon" />Draft</span>;
}
