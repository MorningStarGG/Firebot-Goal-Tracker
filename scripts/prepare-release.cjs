const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function prepareRelease({ root = path.resolve(__dirname, '..'), tag, outputDirectory, releaseDate = new Date().toISOString() } = {}) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'plugin-metadata.json'), 'utf8'));
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Package version must be semver');
    if (!tag || tag !== `v${pkg.version}`) throw new Error(`Release tag must match package version: v${pkg.version}`);
    if (!/^[A-Za-z0-9_-]+$/.test(pkg.pluginOutputName)) throw new Error('Invalid plugin output name');
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(metadata.repo)) throw new Error('Expected a GitHub repository URL');
    if (!Number.isFinite(Date.parse(releaseDate))) throw new Error('Invalid release date');
    const filename = `${pkg.pluginOutputName}.js`;
    const artifact = fs.readFileSync(path.join(root, 'dist', filename));
    const sha256 = createHash('sha256').update(artifact).digest('hex');
    const manifest = {
        name: pkg.displayName, author: pkg.author, description: pkg.description, version: pkg.version,
        downloadUrl: `${metadata.repo}/releases/download/${tag}/${filename}`,
        sha256, releaseDate, type: 'single-file',
        ...metadata, website: pkg.homepage, support: pkg.bugs.url,
    };
    const destination = outputDirectory || path.join(root, 'release');
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'community-plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(destination, 'SHA256SUMS'), `${sha256}  ${filename}\n`);
    return { manifest, filename, destination };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.length !== 2 || args[0] !== '--tag') throw new Error('Usage: npm run release:prepare -- --tag v<package-version>');
        const result = prepareRelease({ tag: args[1] });
        console.log(`Prepared ${result.filename}, community-plugin.json, and SHA256SUMS for ${result.manifest.version}.`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { prepareRelease };
