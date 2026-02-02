import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

/**
 * Vite plugin to increment build number on each build
 */
function incrementBuildPlugin() {
  return {
    name: 'increment-build',
    buildStart() {
      const buildInfoPath = resolve('build-info.json');

      let buildInfo = { buildNumber: 0 };

      // Read existing build info
      if (fs.existsSync(buildInfoPath)) {
        const content = fs.readFileSync(buildInfoPath, 'utf-8');
        try {
          buildInfo = JSON.parse(content);
          // Validate buildNumber property
          if (typeof buildInfo.buildNumber !== 'number') {
            console.warn(
              'build-info.json is missing a valid buildNumber property. Resetting build number to 0.'
            );
            buildInfo = { buildNumber: 0 };
          }
        } catch (err) {
          console.error(
            `Error parsing ${buildInfoPath}: ${(err as Error).message}. Resetting build number to 0.`
          );
          buildInfo = { buildNumber: 0 };
        }
      }

      // Increment build number
      buildInfo.buildNumber = (buildInfo.buildNumber || 0) + 1;

      // Write back to file
      fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

      console.log(`Build #${buildInfo.buildNumber}`);
    }
  };
}

export default defineConfig({
  build: {
    // Output configuration
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'es2020',

    // Library mode for IIFE output (required for FoundryVTT)
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'DormanLakelysCritFumbleTables',
      formats: ['iife'],
      fileName: () => 'main.js'
    },

    // Rollup-specific options
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        sourcemapExcludeSources: false
      },
      onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      }
    }
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },

  plugins: [incrementBuildPlugin()]
});
