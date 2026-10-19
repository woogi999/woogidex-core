// An <img> for artwork shown small (cards, pickers, team chips): a downscaled
// copy instead of the full picture (js/core/thumbs.ts). Until the copy is
// ready the box stays empty rather than decoding the full image meanwhile.

import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { cachedThumb, thumbFor, wantsThumb } from '../../core/thumbs.ts';

export function ThumbImg({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
    const small = wantsThumb(src);
    const [shown, setShown] = useState<string | null>(() => small ? cachedThumb(src) : src);
    useEffect(() => {
        if (!small) { setShown(src); return; }
        let live = true;
        const hit = cachedThumb(src);
        setShown(hit);
        if (!hit) thumbFor(src).then(url => { if (live) setShown(url); });
        return () => { live = false; };
    }, [src, small]);
    if (!shown) return <span className="thumb-pending" aria-hidden />;
    return <img src={shown} decoding="async" {...rest} />;
}
