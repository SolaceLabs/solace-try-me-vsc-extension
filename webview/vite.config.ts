import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../webview-dist',
        // outDir is outside the project root, so vite does not clear it by default;
        // stale chunks from earlier builds would otherwise be packaged into the VSIX.
        emptyOutDir: true,
        rolldownOptions: {
            output: {
                // extension.ts loads exactly assets/index.js and assets/index.css,
                // so keep lazily imported modules inside the single entry bundle.
                codeSplitting: false,
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }

    }
});
//# sourceMappingURL=vite.config.js.map