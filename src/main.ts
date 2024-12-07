/**
 * Advanced Goal Tracker Script for Firebot
 * A custom script that implements a configurable goal/donation tracking system with countdown functionality.
 * 
 * @module AdvancedGoalTracker
 */

import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import { goalTrackerEffectType, goalTrackerUpdateEffectType, goalTrackerLocalUpdateEffectType } from "./goal-tracker-overlay";
import { initLogger, logger } from "./logger";
import { Request, Response } from 'express';
import goalTrackerHtml from './overlay/goal-tracker.html';
import { HttpServerManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/http-server-manager";

/** Parameters interface for script configuration - currently empty but can be extended */
interface Params {
}

/**
 * Main script definition that implements the Firebot.CustomScript interface
 * Handles registration of effects and HTTP routes for the goal tracker
 */
const script: Firebot.CustomScript<Params> = {
    /**
     * Provides metadata about the script
     * @returns {object} Script manifest containing name, description, author, and version information
     */
    getScriptManifest: () => {
        return {
            name: "Advanced Goal Tracker",
            description: "Highly customizable Goal/Donation Tracking with Countdown",
            author: "MorningStarGG",
            version: "1.0",
            firebotVersion: "5",
        };
    },
    /**
     * Returns default parameters for the script
     * @returns {Params} Empty object for now, can be extended with default configurations
     */
    getDefaultParameters: () => {
        return {};
    },
    /**
     * Main execution point of the script
     * Sets up HTTP routes and registers custom effects
     * 
     * @param {Firebot.RunRequest<Params>} runRequest - Contains modules and utilities provided by Firebot
     */
    run: (runRequest) => {
        // Extract required modules from runRequest
        const { effectManager, resourceTokenManager, httpServer } = runRequest.modules;

        // Register HTTP route for serving the goal tracker overlay
        httpServer.registerCustomRoute(
            "goal-tracker", 
            "goal-tracker.html", 
            "GET", 
            (req: Request, res: Response) => {
                res.setHeader('content-type', 'text/html');
                res.end(goalTrackerHtml)
            }
        );

        // Store HTTP server reference globally
        webServer = httpServer;

        // Initialize logging
        initLogger(runRequest.modules.logger);
        logger.info("Advanced Goal Tracker Overlay Script is loading...");
        const request = (runRequest.modules as any).request;
        
        // Register custom effects for the goal tracker
        effectManager.registerEffect(
            goalTrackerEffectType(resourceTokenManager)
        );
        effectManager.registerEffect(
            goalTrackerUpdateEffectType()
        );
        effectManager.registerEffect(
            goalTrackerLocalUpdateEffectType()
        );
    },
};
/** Global reference to the HTTP server instance */
export let webServer: HttpServerManager;
export default script;