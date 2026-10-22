// Placeholders in the shape of what is loading (css/skeleton.css), used in
// place of a spinner or a "Loading…" line: rows of people or items, a page of
// text, or a grid of cards. Each is announced as busy for screen readers.

const widths = ['92%', '78%', '86%', '64%', '88%', '72%', '95%', '58%'];

/** List rows: an optional avatar, a short title line and a longer one. */
export function SkeletonRows({ count = 3, avatar = false, label = 'Loading' }: { count?: number; avatar?: boolean; label?: string }) {
    return (
        <div className="skel-rows" role="status" aria-busy="true" aria-label={label}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="skel-row">
                    {avatar && <span className="skel skel-circle skel-row-avatar" />}
                    <span className="skel-row-lines">
                        <span className="skel skel-text" style={{ width: `${30 + ((i * 17) % 25)}%` }} />
                        <span className="skel skel-text" style={{ width: widths[i % widths.length] }} />
                    </span>
                </div>
            ))}
        </div>
    );
}

/** A page of text: a heading line and paragraphs. */
export function SkeletonDoc({ lines = 9, label = 'Loading' }: { lines?: number; label?: string }) {
    return (
        <div className="skel-doc" role="status" aria-busy="true" aria-label={label}>
            <span className="skel skel-text skel-doc-title" />
            {Array.from({ length: lines }, (_, i) => <span key={i} className={`skel skel-text${i % 4 === 3 ? ' skel-doc-gap' : ''}`} style={{ width: widths[i % widths.length] }} />)}
        </div>
    );
}

/** A small block, for one media tile or button that is loading. */
export function SkeletonBlock({ className = '', label = 'Loading' }: { className?: string; label?: string }) {
    return <span className={`skel skel-block ${className}`} role="status" aria-busy="true" aria-label={label} />;
}
