import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { woogidexConfig } from './vite.shared.js';

// Woogidex Core on its own: My Collection, the editors and Battle, with no
// accounts and no server. See vite.shared.js for the build itself.
export default defineConfig(woogidexConfig({ react, loadEnv }));
