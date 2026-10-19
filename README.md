<img width="1019" height="343" alt="woogidex_icon" src="https://github.com/user-attachments/assets/78e38332-dfce-4ab5-b92a-8d7955316862" />

A browser-based toolkit for making and battling with Fakemon.

I started this because I wanted one place to actually **design a Fakemon from start to finish**, instead of bouncing between a bunch of different tools. It's grown a fair bit since then.

This repo is **Woogidex Core**: the Fakemon maker and the battle simulator. It runs on its own, in your browser, with no account and no server. The live site at [dex.woogi.xyz](https://dex.woogi.xyz) is built on top of it, and adds the Community Hub, accounts, events and messages.

## Run it

```sh
npm install
npm run dev
```

Then open http://localhost:5173. To check a production build: `npm run build`, then `npm run preview`.

Your collection lives in this browser (IndexedDB). Localhost is a different site from dex.woogi.xyz as far as the browser cares, so it starts empty. Export from the live site and import here to bring your Fakemon over.

## Features

**Editor**
- Stats, BST, typing, abilities, egg groups, gender ratios, height and weight
- Learnset editor with move recommendations
- Custom moves, abilities, and items, including a visual (Scratch-style) block editor for writing their actual battle effects
- Evolution lines, with methods and connected learnsets
- Sample competitive set generator
- Type matchup / bulk comparison analysis tab
- Shiny artwork, cries, and art credit
- PNG, plain text, JSON, Pokémon Showdown, and Pokémon Essentials export
- A name generator for when you're stuck

**My Collection**
- Folders, pins, search and sorting
- Regions: group Fakemon into a dex of your own, with analytics
- Custom types
- Safety checks and a recovery scan, so a bad load never wipes your collection

**Battle**
- A Pokémon-style battle simulator, including a fair amount of Showdown's move/ability/item data
- Battle a bot. Online battles need accounts, which a host site brings (see below)

## Sample Set Generator

Woogidex looks at a Fakemon's actual data and tries to build a sensible competitive set for it: base stats, typing, abilities, available moves, STAB, coverage, setup, recovery, priority, hazards, and so on. It scores the Fakemon against roles like Physical Sweeper, Wallbreaker, Bulky Attacker, Support, Pivot and Hazard Setter, and builds a set around whichever fits best.

It's not perfect, but it's a genuinely useful starting point.

## How the code is laid out

| Folder | What is in it |
|---|---|
| `js/core/` | Boot (`app.ts`), routing, storage, the extension registries (`extend.ts`) |
| `js/editor/` | The Fakemon editor, the ability block editor, sample sets |
| `js/battle/` | The battle engine, its UI and 3D field, and the netcode |
| `js/export/` | PNG, Showdown, Essentials and ZIP export |
| `js/features/` | Pokédex data, analysis, evolution, regions, custom types, recovery |
| `js/app/` | The React pages, components and dialogs |
| `css/` | Stylesheets. The order in `index.html` matters |
| `public/` | Pictures, type icons and emojis, copied into the build as they are |
| `vite.shared.js` | The build, shared with sites built on Core |

## Building a site on Core

Core takes a **host**: a module that adds pages, routes, header buttons and settings through `js/core/extend.ts`. On its own, Core uses `js/host/standalone.ts`, which adds nothing.

A site keeps only its own files, at the same paths as Core's, and builds with Core's `vite.shared.js`:

```js
// vite.config.js in the site's repo, with Core cloned or linked at ./core
const { woogidexConfig } = await import('./core/vite.shared.js');
export default defineConfig(woogidexConfig({ react, loadEnv, root: here, core: './core', host: './js/host.ts' }));
```

A file the site does not have comes from Core, so the site's `js/features/auth.ts` can import `'../core/app.ts'`. The `rootDirs` option in the site's `tsconfig.json` tells TypeScript the same thing.

## Status

Still very much a **work in progress**. Things will probably break, things will probably get redesigned, and some systems (looking at you, battle sim) are still being actively fought with.

## Contributing

Found something broken, or have an idea? Open an issue or a PR. CI type-checks and builds every pull request.

Have fun making weird Pokémon. :3
