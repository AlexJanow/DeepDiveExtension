import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');
const isProd = process.env.NODE_ENV === 'production' || !isWatch;

console.log(`Building in ${isProd ? 'production' : 'development'} mode...`);

const buildOptions = {
  entryPoints: [
    'popup.js',
    'content.js',
    'background.js'
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true, // Always generate source maps for debugging
  minify: isProd, // Minify in production
  treeShaking: true, // Remove unused code
  legalComments: 'none', // Remove comments in production
};

function minifyCSS(cssContent) {
  // CSS minification disabled - the custom regex approach was breaking selectors
  // The CSS file is only ~20KB, so minification savings are minimal
  // Simply return the original content
  return cssContent;
}

async function build() {
  try {
    console.log('Creating dist directory...');
    // Create dist directory if it doesn't exist
    if (!existsSync('dist')) {
      mkdirSync('dist', { recursive: true });
    }

    console.log('Building JavaScript files...');
    // Build JavaScript files
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('✓ Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('✓ JavaScript bundled and minified');
    }

    console.log('Processing CSS files...');
    // Process and minify CSS
    try {
      const cssContent = readFileSync('popup.css', 'utf-8');
      const processedCSS = isProd ? minifyCSS(cssContent) : cssContent;
      writeFileSync(join('dist', 'popup.css'), processedCSS);
      console.log(`✓ CSS ${isProd ? 'minified' : 'copied'}`);
    } catch (err) {
      console.warn('Warning: Could not process popup.css');
    }

    console.log('Copying static files...');
    // Copy static files
    const staticFiles = [
      'popup.html',
      'manifest.json'
    ];

    staticFiles.forEach(file => {
      try {
        const fileName = file.split('/').pop();
        copyFileSync(file, join('dist', fileName));
        console.log(`✓ Copied ${file}`);
      } catch (err) {
        console.warn(`Warning: Could not copy ${file}`);
      }
    });

    console.log('Copying icons...');
    // Create icons directory in dist
    if (!existsSync('dist/icons')) {
      mkdirSync('dist/icons', { recursive: true });
    }

    // Copy icons if they exist
    const icons = ['icon16.png', 'icon48.png', 'icon128.png', 'icon.svg'];
    let iconsCopied = 0;
    icons.forEach(icon => {
      try {
        copyFileSync(join('icons', icon), join('dist/icons', icon));
        iconsCopied++;
      } catch (err) {
        // Silently skip missing icons
      }
    });
    console.log(`✓ Copied ${iconsCopied} icon(s)`);

    if (!isWatch) {
      console.log('\n✅ Build complete!');
      console.log(`📦 Output directory: dist/`);
      console.log(`🗺️  Source maps: ${buildOptions.sourcemap ? 'enabled' : 'disabled'}`);
      console.log(`📉 Minification: ${isProd ? 'enabled' : 'disabled'}`);
    }

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
