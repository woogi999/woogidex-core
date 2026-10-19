// The host for Woogidex Core on its own: nothing to add. The app runs with
// no accounts and no server, the collection lives in this browser, and the
// pages are My Collection, the editors, Battle and Settings.
//
// A site built on Core points the '@woogidex/host' alias at its own module
// (see vite.shared.js) and registers its pages, routes and functions there
// through js/core/extend.ts.

export function installHost(): void {}
