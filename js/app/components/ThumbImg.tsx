// An <img> for artwork shown small (cards, pickers, team chips): a downscaled
// copy instead of the full picture (js/core/thumbs.ts). Until the copy is
// ready the box stays empty rather than decoding the full image meanwhile.
// A copy on screen (or about to be) is made first; the rest wait in line and
// fill in during idle moments.

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { cachedThumb, thumbFor, wantsThumb } from '../../core/thumbs.ts';

export function ThumbImg({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
    const small = wantsThumb(src);
    const [shown, setShown] = useState<string | null>(() => small ? cachedThumb(src) : src);
    const box = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!small) { setShown(src); return; }
        const hit = cachedThumb(src);
        setShown(hit);
        if (hit) return;
        let live = true;
        const show = (url: string) => { if (live) setShown(url); };
        thumbFor(src, 'later').then(show);
        // near the screen: ask again, which moves it to the front
        const el = box.current;
        let io: IntersectionObserver | null = null;
        if (el && typeof IntersectionObserver === 'function') {
            io = new IntersectionObserver(entries => {
                if (!entries.some(e => e.isIntersecting)) return;
                io?.disconnect();
                thumbFor(src, 'now').then(show);
            }, { rootMargin: '400px 0px' });
            io.observe(el);
        } else thumbFor(src, 'now').then(show);
        return () => { live = false; io?.disconnect(); };
    }, [src, small]);
    if (!shown) return <span ref={box} className="thumb-pending" aria-hidden />;
    return <img src={shown} decoding="async" {...rest} />;
}
