import { useEffect, useRef, useState } from 'react';
import { frameCount } from '../../core/art-shield.ts';
import { api } from '../../core/app.ts';
import { Modal } from '../components/Modal.tsx';
import { openDialog, registerDialog, type DialogProps } from '../dialogs.tsx';
import { BG_DEFAULTS, imagePixels, pixelsToFile, removeBackground, type BgOptions } from '../../editor/bg-remove.ts';

// ==================== removing a background ====================
// Runs on the device (js/editor/bg-remove.ts): before and after on a checker
// board, a tolerance slider, then the result replaces the image as a PNG.
// Animated images are left alone: a canvas keeps one frame.

/** Opens the remover for an image; `onDone` gets the new PNG file. */
export async function removeBackgroundThen(src: string, onDone: (file: File) => void) {
    const animated = (await frameCount(src).catch(() => 1)) > 1;
    if (animated) { api.showToast?.('Animated pictures cannot have their background removed.', 'info'); return; }
    openDialog('remove-background', { src, onDone });
}

function RemoveBackgroundDialog({ close, src, onDone }: DialogProps<{ src: string; onDone: (f: File) => void }>) {
    const [opts, setOpts] = useState<BgOptions>(BG_DEFAULTS);
    const [pixels, setPixels] = useState<ImageData | null>(null);
    const [result, setResult] = useState<{ image: ImageData; removed: number } | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        imagePixels(src).then(setPixels).catch(() => setError('This image could not be read.'));
    }, [src]);

    // work a moment after the slider stops, so dragging it stays smooth
    useEffect(() => {
        if (!pixels) return;
        const t = setTimeout(() => setResult(removeBackground(pixels, opts)), 90);
        return () => clearTimeout(t);
    }, [pixels, opts]);

    useEffect(() => {
        const c = canvas.current;
        if (!c || !result) return;
        c.width = result.image.width;
        c.height = result.image.height;
        c.getContext('2d')!.putImageData(result.image, 0, 0);
    }, [result]);

    const total = pixels ? pixels.width * pixels.height : 0;
    const share = result && total ? Math.round((result.removed / total) * 100) : 0;
    async function apply() {
        if (!result) return;
        setBusy(true);
        try {
            onDone(await pixelsToFile(result.image));
            close();
        } catch (e: any) {
            setError(e?.message || 'Could not save the image.');
            setBusy(false);
        }
    }
    return (
        <Modal onClose={close} title="Remove background" className="bg-remove-modal">
            <p className="field-hint">This works on your device. It removes the plain color around the edges of the picture.</p>
            {error && <p className="auth-modal-error">{error}</p>}
            <div className="bg-remove-compare">
                <figure><figcaption>Before</figcaption><div className="bg-remove-stage"><img src={src} alt="The image before" /></div></figure>
                <figure><figcaption>After</figcaption><div className="bg-remove-stage"><canvas ref={canvas} aria-label="The image after" /></div></figure>
            </div>
            <div className="form-group bg-remove-controls">
                <label htmlFor="bg-tolerance">How much to remove <span className="label-optional">({opts.tolerance})</span></label>
                <input id="bg-tolerance" type="range" min={0} max={100} value={opts.tolerance}
                    onChange={e => setOpts(o => ({ ...o, tolerance: Number(e.target.value) }))} />
                <label className="bg-remove-check">
                    <input type="checkbox" checked={opts.smooth} onChange={e => setOpts(o => ({ ...o, smooth: e.target.checked }))} /> Soften the edge
                </label>
                <p className="field-hint">{!result ? 'Working…' : result.removed ? `${share}% of the picture is removed.` : 'Nothing to remove. The edges may already be clear, or the background has more than one color.'}</p>
            </div>
            <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={busy || !result?.removed} onClick={apply}>{busy ? 'Saving…' : 'Use this'}</button>
            </div>
        </Modal>
    );
}
registerDialog('remove-background', RemoveBackgroundDialog);
