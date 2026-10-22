// The content under a row of tabs, as a component: it swipes in from the side
// of the tab that was picked (useSlide in js/app/hooks.ts). Use it where a
// hook can't go, such as after an early return.

import type { ReactNode } from 'react';
import { useSlide } from '../hooks.ts';

export function SlideStage<T extends string | number>({ current, order, axis = 'x', className, children }: {
    current: T; order: readonly T[]; axis?: 'x' | 'y'; className?: string; children: ReactNode;
}) {
    const ref = useSlide(current, order, axis);
    return <div ref={ref} className={className}>{children}</div>;
}
