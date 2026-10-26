// A background remover that runs on the device: nothing is uploaded, no
// model is downloaded. It finds the background from the image's edges and
// flood-fills it away, so it works on art drawn on a plain or near-plain
// background (the usual Fakémon upload). It does not cut a subject out of a
// photo. The editor's Artwork tab uses it (js/app/dialogs/removeBackground.tsx).

export interface BgOptions {
    /** 0 to 100: how far a color can be from the background and still go */
    tolerance: number;
    /** soften the cut edge by one pixel */
    smooth: boolean;
}

export const BG_DEFAULTS: BgOptions = { tolerance: 18, smooth: true };

/** Loads an image source into pixels. Rejects for an image the browser cannot read. */
export async function imagePixels(src: string): Promise<ImageData> {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The most common color on the image's border, quantized: the background.
 * Null when the border is already mostly transparent.
 */
function borderColor(d: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
    const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
    let clear = 0, total = 0;
    const visit = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        total++;
        if (d[i + 3] < 16) { clear++; return; }
        const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        const c = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        c.n++; c.r += d[i]; c.g += d[i + 1]; c.b += d[i + 2];
        counts.set(key, c);
    };
    for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { visit(0, y); visit(w - 1, y); }
    if (clear > total * 0.6) return null;
    let best: { n: number; r: number; g: number; b: number } | null = null;
    for (const c of counts.values()) if (!best || c.n > best.n) best = c;
    return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : null;
}

/**
 * Removes the background: every pixel joined to the edge whose color is
 * within the tolerance of the edge color becomes transparent. Returns new
 * pixels and how many were removed; the input is not changed.
 */
export function removeBackground(src: ImageData, opts: BgOptions): { image: ImageData; removed: number } {
    const { width: w, height: h } = src;
    const d = new Uint8ClampedArray(src.data);
    const bg = borderColor(d, w, h);
    if (!bg) return { image: new ImageData(d, w, h), removed: 0 };
    // tolerance 0..100 maps onto a distance in RGB space (max about 441)
    const limit = (Math.max(0, Math.min(100, opts.tolerance)) / 100) * 200;
    const limit2 = limit * limit;
    const far = (i: number) => {
        const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
        return dr * dr + dg * dg + db * db > limit2;
    };
    const gone = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let top = 0;
    const seed = (p: number) => {
        if (gone[p]) return;
        const i = p * 4;
        if (d[i + 3] >= 16 && far(i)) return;
        gone[p] = 1;
        stack[top++] = p;
    };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (top) {
        const p = stack[--top];
        const x = p % w, y = (p - x) / w;
        if (x > 0) seed(p - 1);
        if (x < w - 1) seed(p + 1);
        if (y > 0) seed(p - w);
        if (y < h - 1) seed(p + w);
    }
    let removed = 0;
    for (let p = 0; p < w * h; p++) if (gone[p]) { d[p * 4 + 3] = 0; removed++; }
    if (opts.smooth) {
        // a kept pixel beside a removed one keeps half its alpha: no hard halo
        for (let p = 0; p < w * h; p++) {
            if (gone[p]) continue;
            const x = p % w;
            const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (p >= w && gone[p - w]) || (p < w * (h - 1) && gone[p + w]);
            if (edge) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * 0.55);
        }
    }
    return { image: new ImageData(d, w, h), removed };
}

/** Pixels to a PNG file, named like the image it replaces. */
export async function pixelsToFile(image: ImageData, name = 'artwork.png'): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    const blob: Blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the PNG.'))), 'image/png'));
    return new File([blob], name.replace(/\.[a-z0-9]+$/i, '') + '.png', { type: 'image/png' });
}
