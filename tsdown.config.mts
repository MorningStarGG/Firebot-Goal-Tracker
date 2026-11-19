import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const { pluginOutputName } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
    entry: { [pluginOutputName]: './src/main.ts' },
    outDir: './dist',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outExtensions: () => ({ js: '.js' }),
    clean: true,
    banner: `/*! Bundled dependency notices\n${['node-json-db', 'rwlock'].map(name =>
        `${name}:\n${readFileSync(new URL(`./node_modules/${name}/LICENSE`, import.meta.url), 'utf8')}`
    ).join('\n')}\n*/`,
    unbundle: false,
    minify: { mangle: false, compress: true },
    deps: {
        neverBundle: ['@crowbartools/firebot-types'],
        alwaysBundle: ['node-json-db', 'rwlock'],
        onlyBundle: ['node-json-db', 'rwlock'],
    },
    dts: false,
    loader: { '.html': 'text' },
});
