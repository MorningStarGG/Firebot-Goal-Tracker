/**
 * Advanced Goal Tracker Script for Firebot
 * 
 * This script implements a customizable goal/donation tracking system with countdown functionality.
 * It registers custom effects, HTTP routes, and variables to manage goal tracking overlays in Firebot.
 * 
 * @module AdvancedGoalTracker
 */
import { Firebot, ScriptModules } from "@crowbartools/firebot-custom-scripts-types";
import { goalTrackerEffectType } from "./effects/goal";
import { goalTrackerManagerEffectType } from "./effects/goalManager"
import { initLogger, logger } from "./logger";
import { Request, Response } from 'express';
import goalTrackerHtml from './overlay/goal-tracker.html';
import { HttpServerManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/http-server-manager";
import { ReplaceVariableManager } from "@crowbartools/firebot-custom-scripts-types/types/modules/replace-variable-manager";
import { FirebotSettings } from '@crowbartools/firebot-custom-scripts-types/types/settings';
import { createGoalManager } from './utility/goal-manager';
import * as goalVariables from "./variables/goal-variables";

/** 
 * Configuration parameters for the script.
 */
interface Params { }

/** HTTP server manager instance for handling overlay routes */
export let webServer: HttpServerManager;
/** Firebot settings manager for accessing global configurations */
export let settings: FirebotSettings;
/** Script modules provided by Firebot runtime */
export let modules: ScriptModules;
/** Variable replacement manager for handling dynamic content */
export let replaceVariableManager: ReplaceVariableManager;

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

        settings = runRequest.modules.settings as FirebotSettings;

        /**
         * Registers HTTP route handlers for the goal tracker overlay.
         * @param {Request} req - Express request object
         * @param {Response} res - Express response object
         */
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
        modules = runRequest.modules;
        replaceVariableManager = runRequest.modules.replaceVariableManager;

        createGoalManager(modules.path.join(SCRIPTS_DIR, '..', 'db', 'goalTracker.db'), modules);

        // Initialize logging
        initLogger(runRequest.modules.logger);
        logger.info("Advanced Goal Tracker Overlay Script is loading...");
        const request = (runRequest.modules as any).request;

        // Register custom effects for the goal tracker
        effectManager.registerEffect(
            goalTrackerEffectType(resourceTokenManager)
        );
        effectManager.registerEffect(
            goalTrackerManagerEffectType()
        );

        //Register Goal Tracker variables
        Object.values(goalVariables).forEach(variable => {
            replaceVariableManager.registerReplaceVariable(variable);
        });
    },
};
export default script;