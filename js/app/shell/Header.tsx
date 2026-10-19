// The app shell's header: logo on the left, the places you can go in the
// middle (Facebook-style tabs), the account menu on the right. Tabs are
// icon-only on narrow screens; each carries its name in title/aria-label.
// A host adds tabs, buttons and menu rows (js/core/extend.ts).

import { api } from '../../core/app.ts';
import { ext, registerNav } from '../../core/extend.ts';
import { Icon } from '../components/Icon.tsx';
import { useClickAway } from '../components/editor/fields.tsx';
import { notify, useStore } from '../store.ts';

registerNav({ page: 'collection-view', label: 'Collection', title: 'My Collection', icon: 'library', order: 10, open: () => api.showCollection() });
registerNav({ page: 'battle-view', label: 'Battle', title: 'Battle', icon: 'swords', order: 30, open: () => api.openBattle() });

/** A badge's number: 9+ past nine. */
export const countLabel = (n: number) => (n > 9 ? '9+' : String(n));

// ==================== the account menu ====================
let accountMenuOpen = false;

export function isAccountMenuOpen() { return accountMenuOpen; }

export function toggleHeaderProfilePopover(event?: Event) {
    event?.stopPropagation();
    accountMenuOpen = !accountMenuOpen;
    notify();
}

export function closeHeaderProfilePopover() {
    if (!accountMenuOpen) return;
    accountMenuOpen = false;
    notify();
}

export function Header() {
    useStore();
    const page = document.body.dataset.page || '';
    // a page can light up another page's tab (a post is still "in" Community)
    const section = ext.nav.find(n => n.alsoFor?.includes(page))?.page || page;
    return (
        <>
            <div className="header-left">
                <button className="logo logo-button" type="button" onClick={() => api.showLanding()} aria-label="Woogidex home" title="Woogidex">
                    <img src="assets/woogidex_logo.png" alt="Woogidex" width="95" height="32" />
                </button>
                {ext.headerLeft.map((Slot, i) => <Slot key={i} />)}
            </div>
            <nav className="header-nav" aria-label="Main navigation">
                {ext.nav.map(n => {
                    const badge = n.badge?.() || 0;
                    return (
                        <button key={n.page} className={`header-nav-btn${section === n.page ? ' active' : ''}`} type="button" onClick={n.open}
                            title={n.title} aria-label={n.title} aria-current={section === n.page ? 'page' : undefined}>
                            <Icon name={n.icon} /><span className="header-nav-label">{n.label}</span>
                            {badge > 0 && <span className="header-nav-badge">{countLabel(badge)}</span>}
                        </button>
                    );
                })}
            </nav>
            <div className="header-actions">
                {ext.headerActions.map((Slot, i) => <Slot key={i} />)}
                <AccountMenu />
            </div>
        </>
    );
}

/**
 * The theme switch and Settings, plus whatever the host puts in it (who you
 * are, sign-out, policy links).
 */
function AccountMenu() {
    const open = accountMenuOpen;
    const ref = useClickAway(open, closeHeaderProfilePopover);
    const close = closeHeaderProfilePopover;
    const then = (fn: () => void) => () => { close(); fn(); };
    const Button = ext.accountButton;
    const signedIn = !!api.isLoggedIn?.();
    return (
        <div className={`header-profile-wrap${signedIn ? '' : ' is-signed-out'}`} ref={ref}>
            <button className="header-profile-btn" type="button" onClick={() => toggleHeaderProfilePopover()} aria-haspopup="true" aria-expanded={open} aria-label="Account menu" title="Account menu">
                <span className="header-profile-avatar">{Button ? <Button /> : <Icon name="user" />}</span>
            </button>
            {open && (
                <div className="header-profile-popover">
                    {ext.accountMenuTop.map((Slot, i) => <Slot key={i} close={close} />)}
                    <button type="button" className="header-profile-popover-item" onClick={then(() => api.openSettings())}><Icon name="settings" /><span>Settings</span></button>
                    {ext.accountMenuItems.map((Slot, i) => <Slot key={i} close={close} />)}
                    {/* a switch, not a one-shot button, so it reads as a setting and shows which theme is on */}
                    <label className="header-profile-popover-item header-theme-row">
                        <Icon name="moon" /><span>Dark mode</span>
                        <input className="header-theme-input" type="checkbox" role="switch" checked={!!api.isDarkModeEnabled()} onChange={() => api.toggleDarkMode()} />
                        <span className="header-theme-switch" aria-hidden="true" />
                    </label>
                    {ext.accountMenuBottom.map((Slot, i) => <Slot key={i} close={close} />)}
                </div>
            )}
        </div>
    );
}
