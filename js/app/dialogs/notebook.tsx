// The fast ways to start something, as a notepad would: Quick add (a name
// and a one-line note, nothing required beyond the name) and Paste a list
// (one name a line becomes one Fakémon draft each). Quick add makes a
// Fakémon, a move, an ability, an item or a type. Each one goes in the region
// and folder you are looking at (js/features/notebook.ts). The N key opens
// Quick add from anywhere outside a text field.

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { api, state } from '../../core/app.ts';
import { registerDialog, openDialog, isDialogOpen, type DialogProps } from '../dialogs.tsx';
import { Modal } from '../components/Modal.tsx';
import { Icon } from '../components/Icon.tsx';
import { NAME_MAX_STUB, addStubs, parseBulkNames } from '../../features/notebook.ts';
import { customTypeDraft, saveCustomTypeDraft } from '../../features/custom-types.ts';
import type { CollectionTab } from '../types.ts';

// kind, button label, noun, name example, note example
const KINDS: Array<[CollectionTab, string, string, string, string]> = [
    ['fakemon', 'Fakémon', 'Fakémon', 'Loxicant', 'I hate Fairy-types!'],
    ['moves', 'Move', 'move', 'Zekrom Kick', 'Deals Dragon or Electric type damage.'],
    ['abilities', 'Ability', 'ability', 'Degenerator', 'Takes 33% of the Pokémons max HP when it switches out.'],
    ['items', 'Item', 'item', 'College Degree', 'No competitive use.'],
    ['types', 'Type', 'type', 'Nuclear', 'Your life is now like Mechamaru']
];

const newLibraryId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Makes a custom move, ability, item or type with only a name and a
 * description. Returns a problem to show, or '' once it is saved.
 */
async function addLibraryStub(kind: CollectionTab, name: string, desc: string): Promise<string> {
    const regionIds = [api.defaultRegionForNewFakemon?.()].filter(Boolean);
    if (kind === 'types') return saveCustomTypeDraft(null, { ...customTypeDraft(null), name, desc }, regionIds);
    if (kind === 'items') return api.saveCustomItem({ name, desc, regionIds });
    // moves and abilities go straight to the library: their editors' saves
    // also add them to the Fakémon open in the editor
    const key = kind === 'moves' ? 'customMoves' : 'customAbilities';
    const entry: any = kind === 'moves'
        ? { id: newLibraryId('cm'), name, type: 'Normal', category: 'Status', basePower: 0, accuracy: 100, pp: 10, priority: 0, flags: {}, desc, artwork: '', rawCode: '' }
        : { id: newLibraryId('ca'), name, desc, rawCode: '', artwork: '' };
    if (api.collectionUI?.().view === kind && state.currentFolderId) entry.folderId = state.currentFolderId;
    api.setEntryRegionIds?.(entry, regionIds);
    if (!Array.isArray(state[key])) state[key] = [];
    state[key].push(entry);
    if (await api.saveToStorage() === false) {
        state[key] = state[key].filter((x: any) => x !== entry);
        return `That ${kind === 'moves' ? 'move' : 'ability'} could not be saved. Your collection did not load.`;
    }
    api.renderCollection();
    return '';
}

function QuickAddDialog({ close }: DialogProps<object>) {
    // it starts on the tab My Collection shows
    const [kind, setKind] = useState<CollectionTab>(() => document.body.dataset.page === 'collection-view' ? api.collectionUI?.().view || 'fakemon' : 'fakemon');
    const [name, setName] = useState('');
    const [note, setNote] = useState('');
    const [added, setAdded] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const nameBox = useRef<HTMLInputElement>(null);
    const [, label, noun, nameExample, noteExample] = KINDS.find(k => k[0] === kind) || KINDS[0];

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        let problem = '';
        if (kind === 'fakemon') problem = await addStubs([{ name, note }]) ? '' : 'That Fakémon could not be saved. Your collection did not load.';
        else problem = await addLibraryStub(kind, name.trim(), note.trim());
        setBusy(false);
        if (problem) { api.showToast?.(problem, 'error'); return; }
        // ready for the next one straight away
        setAdded(list => [name.trim(), ...list].slice(0, 6));
        setName('');
        setNote('');
        nameBox.current?.focus();
    }

    return (
        <Modal onClose={close} className="quick-add-dialog" title="Quick add">
            <form onSubmit={submit} className="quick-add-form">
                <div className="segmented quick-add-kinds" role="radiogroup" aria-label="What to add">
                    {KINDS.map(([key, text]) => (
                        <button key={key} type="button" role="radio" aria-checked={kind === key} className={kind === key ? 'active' : ''}
                            onClick={() => { setKind(key); nameBox.current?.focus(); }}>{text}</button>
                    ))}
                </div>
                <p className="quick-add-lead">
                    {kind === 'fakemon' ? 'A name is enough. Fill in the rest later from the Unfinished shelf.' : `A name is enough. Open the ${noun} from My Collection to fill in the rest.`}
                </p>
                <label className="quick-add-field">
                    <span>Name</span>
                    <input ref={nameBox} autoFocus type="text" maxLength={NAME_MAX_STUB} placeholder={`e.g. ${nameExample}`} value={name} onChange={e => setName(e.target.value)} />
                </label>
                <label className="quick-add-field">
                    <span>{kind === 'fakemon' ? 'Note' : 'Description'} <em>(optional)</em></span>
                    <input type="text" maxLength={200} placeholder={noteExample} value={note} onChange={e => setNote(e.target.value)} />
                </label>
                {added.length > 0 && (
                    <p className="quick-add-done" role="status"><Icon name="check-circle" size={16} />Added {added.join(', ')}</p>
                )}
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={close}>{added.length ? 'Done' : 'Cancel'}</button>
                    <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}><Icon name="plus" />Add {label === 'Fakémon' ? 'Fakémon' : noun}</button>
                </div>
            </form>
        </Modal>
    );
}

function BulkPasteDialog({ close }: DialogProps<object>) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const list = useMemo(() => parseBulkNames(text), [text]);

    async function make() {
        if (!list.length || busy) return;
        setBusy(true);
        const n = await addStubs(list);
        setBusy(false);
        if (!n) { api.showToast?.('Those drafts could not be saved. Your collection did not load.', 'error'); return; }
        api.showToast?.(`${n} new draft${n === 1 ? '' : 's'} added. Find them on the Unfinished shelf.`, 'success');
        close();
    }

    return (
        <Modal onClose={close} className="bulk-paste-dialog" title="Paste a list of names">
            <p className="quick-add-lead">One name a line. Numbers and list marks go away. Add a note after a dash: <code>Loxicant - I hate Fairy-types!</code>.</p>
            <textarea className="bulk-paste-text" autoFocus rows={9} value={text} onChange={e => setText(e.target.value)}
                placeholder={'1. Arcaspark - Regen glue mon\n2. Paldemaria\n3. Fonspring - the water one\n#004 Posdra'} aria-label="Names, one a line" />
            <div className="bulk-paste-preview" aria-live="polite">
                {list.length === 0 ? <span className="an-muted">Nothing to add yet.</span> : (
                    <>
                        <strong>{list.length} draft{list.length === 1 ? '' : 's'}:</strong>
                        <span className="bulk-paste-names">
                            {list.slice(0, 40).map(x => <span key={x.name} className="tag-chip" title={x.note || undefined}>{x.name}</span>)}
                            {list.length > 40 && <span className="an-muted">and {list.length - 40} more</span>}
                        </span>
                    </>
                )}
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!list.length || busy} onClick={make}>
                    <Icon name="plus" />Add {list.length || ''} draft{list.length === 1 ? '' : 's'}
                </button>
            </div>
        </Modal>
    );
}

registerDialog('quick-add', QuickAddDialog);
registerDialog('bulk-paste', BulkPasteDialog);

export const openQuickAdd = () => { if (!isDialogOpen('quick-add')) openDialog('quick-add'); };
export const openBulkPaste = () => openDialog('bulk-paste');

// N, anywhere outside a field and without a dialog open
document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
    if (document.body.classList.contains('modal-open') || document.querySelector('.modal-overlay.active, .qs-layer')) return;
    e.preventDefault();
    openQuickAdd();
});
