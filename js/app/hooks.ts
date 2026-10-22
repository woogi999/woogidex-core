// Hooks shared by the React pages.

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { currentRoute, onRouteChange, type Route } from '../core/router.ts';
import { directionIn, slideIn } from '../core/motion.ts';

let lastHref = '';
let lastRoute: Route = { name: '', param: '' };

// useSyncExternalStore needs the same object back until something changes
function routeSnapshot(): Route {
    const href = window.location.href;
    if (href !== lastHref) {
        lastHref = href;
        lastRoute = currentRoute();
    }
    return lastRoute;
}

/** The route the address bar names; re-renders on navigation and back/forward. */
export function useRoute(): Route {
    return useSyncExternalStore(onRouteChange, routeSnapshot);
}

/** The ?name= value from the address bar, kept in step like useRoute(). */
export function useQueryParam(name: string): string {
    useRoute();
    return new URLSearchParams(window.location.search).get(name) || '';
}

/**
 * The swipe every tab set uses: when `current` changes, the element on the
 * returned ref slides in from the side of the new tab in `order` (a later tab
 * from the right). Put the ref on the tab's content, not on the tab bar.
 */
export function useSlide<T extends string | number>(current: T, order: readonly T[], axis: 'x' | 'y' = 'x') {
    const ref = useRef<HTMLDivElement>(null);
    const last = useRef(current);
    useLayoutEffect(() => {
        if (last.current === current) return;
        slideIn(ref.current, directionIn(order.map(String), String(last.current), String(current)), axis);
        last.current = current;
    }, [current]);
    return ref;
}
