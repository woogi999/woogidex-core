// The build, shared by Woogidex Core (vite.config.js here) and any site built
// on it. A site passes its own root, host module and extras; everything else
// (the 404 copy, the service worker, the emoji list, comment stripping) is
// the same for both. Vite and the React plugin come in as arguments, so a
// site's own copies are the ones that run.

import { resolve, dirname, relative, isAbsolute } from 'path';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// where Core is: this file's folder, unless a site says otherwise (a site that
// links Core in as a folder junction passes the linked path, so module ids
// keep the path the site sees; see woogidexConfig)
let CORE = import.meta.dirname;

// static site on GitHub Pages, so this has to survive being served from a
// subdirectory *and* from paths that don't exist on disk (/community/12).
//
//   base: './'   emitted URLs must be relative; index.html fixes up <base
//                href> at runtime, and an absolute '/' base would send a
//                deep link to the domain root instead.
//   assetsDir    renamed off default 'assets' since public/assets/ already
//                holds site images and both would land in dist/.
//   fallback404  GitHub Pages serves 404.html for unmatched paths, so it has
//                to be a copy of the *built* index.html (hashed bundle URLs),
//                not the source.

const NOTICE = `<!-- GENERATED FILE - DO NOT EDIT.
     A copy of the built index.html, written during 'npm run build'.
     GitHub Pages serves this for any path that is not a file on disk, which is
     how /community/12 and /profile/woogi reach the app with their URL intact. -->
`;

function fallback404() {
    return {
        name: 'woogidex-404-fallback',
        apply: 'build',
        enforce: 'post',
        // generateBundle, not closeBundle: under Rolldown the HTML is still
        // in-memory here, so emitting from it keeps the two byte-identical
        generateBundle(_options, bundle) {
            const html = bundle['index.html'];
            if (!html) throw new Error('fallback404: index.html was not emitted');
            this.emitFile({
                type: 'asset',
                fileName: '404.html',
                source: NOTICE + html.source
            });
        }
    };
}

// The service worker (sw/service-worker.js) needs the exact file list of this
// build to keep an offline copy, so it is written here rather than copied from
// public/. Precached: the page, every chunk the app can run offline, and the
// small pictures the collection draws. Left out (fetched and kept on first use
// instead, so a cheap phone doesn't download them up front): the admin panel,
// and Battle (its page, engine and 3D renderer), which only works online anyway.
const SW_SKIP = /^(admin|three\.module|battle-ui|BattlePage)-/;
const SW_PUBLIC = ['assets/favicon.png', 'assets/no_art_placeholder.png', 'assets/woogidex_logo.png'];

function serviceWorker() {
    return {
        name: 'woogidex-service-worker',
        apply: 'build',
        enforce: 'post',
        generateBundle(_options, bundle) {
            const publicDir = resolve(CORE, 'public');
            const typeIcons = readdirSync(resolve(publicDir, 'assets/types')).map(f => `assets/types/${f}`);
            const chunks = Object.keys(bundle)
                .filter(f => /^bundle\/[^/]+\.(js|css)$/.test(f) && !SW_SKIP.test(f.slice('bundle/'.length)))
                .sort();
            const files = ['./', ...chunks, ...SW_PUBLIC, ...typeIcons];
            // changes whenever anything it caches does, which is what makes the
            // browser install the new worker and refresh the offline copy
            const hash = createHash('sha256');
            for (const f of chunks) hash.update(f);
            hash.update(String(bundle['index.html']?.source ?? ''));
            for (const f of [...SW_PUBLIC, ...typeIcons]) hash.update(readFileSync(resolve(publicDir, f)));
            const source = readFileSync(resolve(CORE, 'sw/service-worker.js'), 'utf8')
                .replace('const VERSION = __VERSION__', `const VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))}`)
                .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(files)}`)
                // same rule as the HTML below: no source comments on the live site
                .replace(/^[ \t]*\/\/.*(?:\r?\n)?/gm, '');
            this.emitFile({ type: 'asset', fileName: 'sw.js', source });
        }
    };
}

// Comments are for whoever edits the source, not for anyone opening dev tools
// on the live site. JS and CSS lose theirs when they're minified; HTML (the
// pages, and the views in public/ that are copied as-is) and the small inline
// scripts in it are not minified, so this strips them from the built files.
function stripComments(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/g,
            (_, open, body, close) => open + body.replace(/^[ \t]*\/\/.*(?:\r?\n)?/gm, '') + close)
        .replace(/\n[ \t]*(?:\r?\n[ \t]*)+\n/g, '\n\n');
}

function stripHtmlComments() {
    let outDir = 'dist';
    return {
        name: 'woogidex-strip-html-comments',
        apply: 'build',
        configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
        // after everything is written, so it covers 404.html and public/views too
        closeBundle() {
            const walk = dir => readdirSync(dir, { withFileTypes: true }).forEach(entry => {
                const full = resolve(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name.endsWith('.html')) writeFileSync(full, stripComments(readFileSync(full, 'utf8')));
            });
            walk(outDir);
        }
    };
}

// The custom emojis are plain files in public/emojis (subfolders are picker
// categories). Their names come from the file names, so adding one is just
// dropping a file in: this module lists them at build time, and messages only
// ever store the ":name:" text. The browser fetches each picture once and
// caches it (public/_headers), which keeps them off our bandwidth bill.
// Names follow the same rule the files were renamed with: no leading id
// number, spaces and dashes become underscores, all lowercase.
const EMOJI_VIRTUAL = 'virtual:emoji-manifest';
const EMOJI_RESOLVED = '\0' + EMOJI_VIRTUAL;
const EMOJI_EXT = /\.(png|gif|webp|jpe?g|avif)$/i;

export function emojiName(fileName) {
    return fileName.replace(EMOJI_EXT, '')
        .replace(/^[0-9]+[-_ ]+/, '')
        .replace(/[\s-]+/g, '_')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
}

function scanEmojis(root) {
    const out = [];
    const seen = new Set();
    const walk = (dir, category) => {
        let entries = [];
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) { walk(full, entry.name); continue; }
            if (!EMOJI_EXT.test(entry.name)) continue;
            const name = emojiName(entry.name);
            if (!name || seen.has(name)) continue;     // first file wins a clash
            seen.add(name);
            const rel = full.slice(root.length + 1).replace(/\\/g, '/');
            out.push({ name, src: `emojis/${rel}`, category, animated: /\.gif$/i.test(entry.name) });
        }
    };
    walk(root, 'general');
    return out;
}

function emojiManifest() {
    const root = resolve(CORE, 'public/emojis');
    return {
        name: 'woogidex-emoji-manifest',
        resolveId(id) { return id === EMOJI_VIRTUAL ? EMOJI_RESOLVED : null; },
        load(id) {
            if (id !== EMOJI_RESOLVED) return null;
            return `export default ${JSON.stringify(scanEmojis(root))};`;
        },
        // a file dropped in while `npm run dev` is running shows up on reload
        configureServer(server) {
            server.watcher.add(root);
            const refresh = file => {
                if (!resolve(file).startsWith(root)) return;
                const mod = server.moduleGraph.getModuleById(EMOJI_RESOLVED);
                if (mod) server.moduleGraph.invalidateModule(mod);
                server.ws.send({ type: 'full-reload' });
            };
            server.watcher.on('add', refresh);
            server.watcher.on('unlink', refresh);
        }
    };
}

// The landing page is not out yet (js/core/flags.ts). Its painted scenery sits
// in public/assets/landing/ on the maker's machine, and public/ is copied into
// the build whole, so unless the build switches the landing page on
// (VITE_LANDING_PAGE=1) the copy is taken back out and never gets deployed.
function holdBackLanding(loadEnv) {
    let outDir = 'dist';
    let on = false;
    return {
        name: 'woogidex-hold-back-landing',
        apply: 'build',
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir);
            on = loadEnv(config.mode, config.root).VITE_LANDING_PAGE === '1';
        },
        closeBundle() {
            if (!on) rmSync(resolve(outDir, 'assets/landing'), { recursive: true, force: true });
        }
    };
}

// A site keeps only its own files and borrows the rest from Core, at the
// same paths: js/features/auth.ts in the site can import '../core/app.ts',
// and that is Core's js/core/app.ts. Anything the site has itself wins; a
// relative import (or a /path from the HTML) that the site does not have is
// looked up in Core. tsconfig.json's rootDirs tells TypeScript the same.
function overlay(root) {
    const inRoot = path => {
        const rel = relative(root, path);
        return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null;
    };
    // In the dev server a module is its URL. The page asking for js/core/app.ts
    // and a module importing '../core/app.ts' (served from Core's folder) would
    // be two copies of the app, so the page asks for Core's files where they are.
    const coreUrl = rel => {
        const fromRoot = inRoot(resolve(CORE, rel));
        return fromRoot ? '/' + fromRoot.replace(/\\/g, '/') : '/@fs/' + resolve(CORE, rel).replace(/\\/g, '/');
    };
    return {
        name: 'woogidex-overlay',
        enforce: 'pre',
        transformIndexHtml: {
            order: 'pre',
            handler(html, ctx) {
                if (!ctx.server) return html;
                const page = dirname(resolve(root, '.' + ctx.path));
                return html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")([^"#?:]+)(")/g, (all, open, url, close) => {
                    if (/^\/\//.test(url)) return all;
                    const file = url.startsWith('/') ? resolve(root, '.' + url) : resolve(page, url);
                    const rel = inRoot(file);
                    if (!rel || existsSync(file) || !existsSync(resolve(CORE, rel))) return all;
                    return open + coreUrl(rel) + close;
                });
            }
        },
        resolveId(source, importer) {
            if (source.startsWith('\0') || source.startsWith('/@')) return null;
            const [path, query = ''] = source.split(/(?=\?)/);
            let target;
            if (path.startsWith('/')) target = resolve(root, '.' + path);
            // (a page's <script src="js/..."> is relative too, without the ./)
            else if (importer && !importer.startsWith('\0') && (path.startsWith('.') || (/\.html$/.test(importer.split('?')[0]) && !/^[\w+.-]+:/.test(path))))
                target = resolve(dirname(importer.split('?')[0]), path);
            else return null;
            if (existsSync(target)) return null;
            const rel = inRoot(target);
            if (!rel) return null;
            const core = resolve(CORE, rel);
            // forward slashes, the way Vite writes ids: a backslashed path is a
            // different module to it, and the app would load twice
            return existsSync(core) ? core.replace(/\\/g, '/') + query : null;
        }
    };
}

// A site's public/ goes on top of Core's: served by the dev server, and
// copied over Core's in the build (a file in both: the site's wins).
function sitePublic(dir) {
    let outDir = 'dist';
    return {
        name: 'woogidex-site-public',
        configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const path = decodeURIComponent((req.url || '').split('?')[0]);
                const file = resolve(dir, '.' + path);
                if (path !== '/' && inside(dir, file) && existsSync(file) && !file.endsWith('.html')) req.url = '/@fs/' + file.replace(/\\/g, '/');
                next();
            });
        },
        writeBundle() { cpSync(dir, outDir, { recursive: true }); }
    };
}
const inside = (dir, file) => { const rel = relative(dir, file); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); };

// The same-origin Supabase proxy (a site's Worker runs it in production);
// the dev server stands in for it locally
const supabaseProxy = target => ({
    target,
    changeOrigin: true,
    // Realtime (live chat messages) is a WebSocket
    ws: true,
    rewrite: path => path.replace(/^\/sb/, '')
});

/**
 * The Vite config.
 * @param {object} o
 * @param {Function} o.react      @vitejs/plugin-react
 * @param {Function} o.loadEnv    vite's loadEnv
 * @param {string} [o.root]       the project being built (Core itself by default)
 * @param {string} [o.core]       where Core is, as the site sees it (this folder by default)
 * @param {string} [o.host]       the host module (js/host/standalone.ts by default)
 * @param {Record<string,string>} [o.inputs]  more pages, by name (the main one is root/index.html)
 * @param {string} [o.supabase]   the Supabase project URL /sb proxies to in dev
 * @param {string[]} [o.dedupe]   packages that must load once (the site's copy)
 */
export function woogidexConfig({ react, loadEnv, root, core, host, inputs = {}, supabase, dedupe = [] }) {
    if (core) CORE = resolve(core);
    root = resolve(root || CORE);
    const isSite = root !== CORE;
    const proxy = supabase ? { '/sb': supabaseProxy(supabase) } : undefined;
    return {
        root,
        base: './',
        publicDir: resolve(CORE, 'public'),
        plugins: [
            ...(isSite ? [overlay(root)] : []),
            react(), emojiManifest(), fallback404(), serviceWorker(),
            ...(isSite && existsSync(resolve(root, 'public')) ? [sitePublic(resolve(root, 'public'))] : []),
            stripHtmlComments(), holdBackLanding(loadEnv)
        ],
        resolve: {
            alias: { '@woogidex/host': host || resolve(CORE, 'js/host/standalone.ts') },
            dedupe: ['react', 'react-dom', 'three', 'html2canvas', 'gsap', 'lenis', ...dedupe],
            // Core linked into a site as a folder junction stays at the site's
            // path, so its imports find the site's node_modules
            preserveSymlinks: isSite
        },
        build: {
            outDir: resolve(root, 'dist'),
            assetsDir: 'bundle',
            emptyOutDir: true,
            rollupOptions: {
                input: { main: resolve(root, 'index.html'), ...inputs },
                output: {
                    // big, rarely-changing deps split out to stay cached across
                    // releases instead of invalidating with every code change
                    manualChunks(id) {
                        if (id.includes('node_modules/@supabase')) return 'supabase';
                    }
                }
            }
        },
        // `preview` matters too: the smoke test uses it
        server: { port: 5173, proxy, fs: { allow: [root, CORE] } },
        preview: { proxy }
    };
}
