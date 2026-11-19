import firebot from '@crowbartools/firebot-types';

// Forward lazily: Firebot inspects a plugin's exports before providing a runtime API.
export const logger = {
    debug: (message: string, ...meta: unknown[]) => firebot.logger.debug(message, ...meta),
    info: (message: string, ...meta: unknown[]) => firebot.logger.info(message, ...meta),
    warn: (message: string, ...meta: unknown[]) => firebot.logger.warn(message, ...meta),
    error: (message: string, ...meta: unknown[]) => firebot.logger.error(message, ...meta),
};
