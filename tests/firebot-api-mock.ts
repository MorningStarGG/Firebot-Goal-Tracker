import type { InstalledPlugin } from '@crowbartools/firebot-types';

const api = {
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    storage: { path: '' },
    plugins: { getInstalledPlugins: jest.fn(async (): Promise<InstalledPlugin[]> => []) },
    webServer: { createResourceToken: jest.fn((path: string) => path) },
};
export default api;
