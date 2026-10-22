// Keeps something on screen long enough to animate in and out: it grows open
// (height and opacity) when `show` turns on, and folds shut before it is
// removed when `show` turns off. For rows and buttons that come and go, such
// as a region's sub-pages in the sidebar. Reduced motion only fades.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { reducedMotion } from '../../core/motion.ts';

export function Presence({ show, children, className = '', inline = false }: {
    show: boolean; children: ReactNode; className?: string;
    /** sits in a row of buttons: grows sideways instead of down */
    inline?: boolean;
}) {
    const [mounted, setMounted] = useState(show);
    const box = useRef<HTMLSpanElement & HTMLDivElement>(null);
    // shown from the start: that first paint is not an entrance
    const first = useRef(show);
    // what was last shown stays on screen while it folds away
    const kept = useRef(children);
    if (show) kept.current = children;
    useLayoutEffect(() => {
        if (show) setMounted(true);
        const el = box.current;
        if (!el) return;
        const size = inline ? 'width' : 'height';
        if (show) {
            // the first paint shows things as they are: no entrance on page load
            if (first.current) { first.current = false; return; }
            gsap.killTweensOf(el);
            // the start, written without a read; the tween begins next frame,
            // when the layout is done. Measuring 'auto' now forced a layout of
            // everything React just drew (the whole listing on a tab change).
            el.style.opacity = '0';
            if (!reducedMotion()) { el.style.overflow = 'hidden'; el.style[size] = '0px'; }
            const frame = requestAnimationFrame(() => {
                if (reducedMotion()) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.16, clearProps: 'opacity' });
                else gsap.fromTo(el, { [size]: 0, opacity: 0, overflow: 'hidden' }, { [size]: 'auto', opacity: 1, duration: 0.28, ease: 'power3.out', clearProps: `${size},opacity,overflow` });
            });
            return () => cancelAnimationFrame(frame);
        } else {
            first.current = false;
            gsap.killTweensOf(el);
            gsap.to(el, {
                ...(reducedMotion() ? {} : { [size]: 0, overflow: 'hidden' }), opacity: 0, duration: reducedMotion() ? 0.12 : 0.2, ease: 'power2.in',
                onComplete: () => setMounted(false)
            });
        }
    }, [show, mounted]);
    if (!mounted) return null;
    const cls = `presence${inline ? ' presence-inline' : ''}${className ? ` ${className}` : ''}`;
    const content = show ? children : kept.current;
    return inline ? <span ref={box} className={cls}>{content}</span> : <div ref={box} className={cls}>{content}</div>;
}
