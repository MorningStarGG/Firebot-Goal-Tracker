import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function removeTestDirectory(directory: string, prefix: string): Promise<void> {
    const target = path.resolve(directory);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith(prefix)) {
        throw new Error(`Refusing to remove unexpected test directory: ${target}`);
    }
    await fs.rm(target, { recursive: true, force: true });
}
