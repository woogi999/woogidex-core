// A small drawing board for notepads (js/app/components/notes/NotesField.tsx):
// pen, marker and eraser, three sizes, a short palette, undo and redo. A pen's
// pressure changes the line's width. The drawing saves as a PNG with a clear
// background; notepads show it on paper, so dark ink stays readable in dark
// mode. Opened with openDialog('doodle', { src?, onSave }).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { registerDialog, type DialogProps } from '../../dialogs.tsx';
import { Modal } from '../Modal.tsx';
import { Icon } from '../Icon.tsx';
import { MAX_DOODLE_CHARS } from '../../../features/notebook.ts';

const W = 960, H = 640;
const COLORS = ['#1d2433', '#7c5cff', '#e2574c', '#f09a36', '#e6c229', '#3fae5a', '#3b82f6', '#8a8f9c'];
const SIZES: Array<[string, number]> = [['Fine', 3], ['Medium', 7], ['Bold', 14]];
type Tool = 'pen' | 'marker' | 'eraser';
const TOOLS: Array<[Tool, string, string]> = [['pen', 'pencil', 'Pen'], ['marker', 'paint-brush', 'Marker'], ['eraser', 'backspace', 'Eraser']];
const HISTORY = 30;

interface DoodleProps { src?: string; onSave: (src: string) => void; }

function DoodleDialog({ close, src, onSave }: DialogProps<DoodleProps>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState(COLORS[0]);
    const [size, setSize] = useState(SIZES[1][1]);
    const undo = useRef<ImageData[]>([]);
    const redo = useRef<ImageData[]>([]);
    const [, bump] = useState(0);
    const [error, setError] = useState('');

    const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!;
    const snapshot = () => ctx().getImageData(0, 0, W, H);
    const remember = () => {
        undo.current.push(snapshot());
        if (undo.current.length > HISTORY) undo.current.shift();
        redo.current = [];
        bump(n => n + 1);
    };
    const step = (from: React.MutableRefObject<ImageData[]>, to: React.MutableRefObject<ImageData[]>) => {
        const img = from.current.pop();
        if (!img) return;
        to.current.push(snapshot());
        ctx().putImageData(img, 0, 0);
        bump(n => n + 1);
    };

    // an existing doodle opens where it left off
    useLayoutEffect(() => {
        if (!src) return;
        const img = new Image();
        img.onload = () => ctx().drawImage(img, 0, 0, W, H);
        img.src = src;
    }, []);

    useEffect(() => {
        const keys = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
            e.preventDefault();
            if (e.shiftKey) step(redo, undo); else step(undo, redo);
        };
        document.addEventListener('keydown', keys);
        return () => document.removeEventListener('keydown', keys);
    }, []);

    // ---- drawing: a smoothed line through the pointer's points ----
    const last = useRef<{ x: number; y: number; w: number } | null>(null);
    const at = (e: React.PointerEvent) => {
        const r = canvas.current!.getBoundingClientRect();
        // a mouse reports no pressure (0.5); a pen goes from thin to thick
        const p = e.pointerType === 'pen' ? Math.max(0.15, e.pressure || 0.5) * 2 : 1;
        return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, w: size * (tool === 'marker' ? 2.2 : 1) * (tool === 'eraser' ? 2.5 : 1) * p };
    };
    const style = (c: CanvasRenderingContext2D) => {
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        c.strokeStyle = tool === 'eraser' ? '#000' : color;
        c.fillStyle = c.strokeStyle;
        c.globalAlpha = tool === 'marker' ? 0.45 : 1;
    };
    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        remember();
        const p = at(e);
        last.current = p;
        const c = ctx();
        style(c);
        c.beginPath();
        c.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
        c.fill();
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const from = last.current;
        if (!from) return;
        const c = ctx();
        style(c);
        // every coalesced point, so a fast stroke stays a curve, not a polygon
        const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
        let prev = from;
        for (const ev of events) {
            const p = at({ ...e, clientX: ev.clientX, clientY: ev.clientY, pressure: ev.pressure, pointerType: ev.pointerType } as React.PointerEvent);
            const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
            c.lineWidth = (prev.w + p.w) / 2;
            c.beginPath();
            c.moveTo(prev.x, prev.y);
            c.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
            c.lineTo(p.x, p.y);
            c.stroke();
            prev = p;
        }
        last.current = prev;
    };
    const up = () => { last.current = null; };

    const clear = () => { remember(); ctx().clearRect(0, 0, W, H); };

    /** The PNG, made smaller until it fits a notepad's limit. */
    const save = () => {
        let out = canvas.current!.toDataURL('image/png');
        for (let scale = 0.75; out.length > MAX_DOODLE_CHARS && scale > 0.2; scale -= 0.15) {
            const small = document.createElement('canvas');
            small.width = Math.round(W * scale); small.height = Math.round(H * scale);
            small.getContext('2d')!.drawImage(canvas.current!, 0, 0, small.width, small.height);
            out = small.toDataURL('image/png');
        }
        if (out.length > MAX_DOODLE_CHARS) { setError('This drawing is too detailed to save. Clear part of it and try again.'); return; }
        onSave(out);
        close();
    };

    return (
        <Modal onClose={close} className="doodle-dialog" title={src ? 'Edit doodle' : 'New doodle'}>
            <div className="doodle-tools" role="toolbar" aria-label="Drawing tools">
                <div className="segmented" role="group" aria-label="Tool">
                    {TOOLS.map(([key, icon, label]) => (
                        <button key={key} type="button" className={tool === key ? 'active' : ''} aria-pressed={tool === key} title={label} aria-label={label} onClick={() => setTool(key)}>
                            <Icon name={icon} size={16} />
                        </button>
                    ))}
                </div>
                <div className="segmented" role="group" aria-label="Size">
                    {SIZES.map(([label, px]) => (
                        <button key={label} type="button" className={size === px ? 'active' : ''} aria-pressed={size === px} title={label} aria-label={label} onClick={() => setSize(px)}>
                            <span className="doodle-size-dot" style={{ width: 4 + px / 1.5, height: 4 + px / 1.5 }} />
                        </button>
                    ))}
                </div>
                <div className="doodle-colors" role="group" aria-label="Colour">
                    {COLORS.map(c => (
                        <button key={c} type="button" className={`doodle-color${color === c && tool !== 'eraser' ? ' active' : ''}`} style={{ background: c }}
                            aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }} />
                    ))}
                </div>
                <div className="doodle-history">
                    <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={!undo.current.length} onClick={() => step(undo, redo)} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="arrow-uturn-left" size={16} /></button>
                    <button type="button" className="btn btn-secondary btn-icon btn-sm" disabled={!redo.current.length} onClick={() => step(redo, undo)} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Icon name="arrow-uturn-right" size={16} /></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={clear}>Clear</button>
                </div>
            </div>
            <div className="doodle-paper">
                <canvas ref={canvas} width={W} height={H} className={`doodle-canvas tool-${tool}`} aria-label="Drawing area"
                    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} />
            </div>
            {error && <p className="doodle-error" role="alert">{error}</p>}
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={save}><Icon name="check" />Save doodle</button>
            </div>
        </Modal>
    );
}

registerDialog('doodle', DoodleDialog);
