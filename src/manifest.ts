import type { Manifest } from '@crowbartools/firebot-types';
import pkg from '../package.json';
import metadata from '../plugin-metadata.json';

export const manifest: Manifest = {
    name: pkg.displayName,
    description: pkg.description,
    author: pkg.author,
    version: pkg.version,
    minimumFirebotVersion: metadata.minimumFirebotVersion,
    icon: metadata.icon as Manifest['icon'],
    tags: metadata.tags,
    repo: metadata.repo,
    website: pkg.homepage,
    support: pkg.bugs.url,
};
