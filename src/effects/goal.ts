/**
 * @file goal-tracker-overlay.ts
 * @description Advanced goal tracking system for Firebot with comprehensive support for:
 * - Real-time donation tracking with multiple data sources integration
 * - Customizable overlay display with flexible positioning
 * - Dynamic milestone tracking and visual customization
 * - Support for StreamElements, Extra Life, and local donations
 * - Real-time updates and local/remote data synchronization
 */

import firebot, { EffectType } from "@crowbartools/firebot-types";
import { randomUUID } from "crypto";

import { EffectModel, GoalOverlayEvent } from "../types/types";
import goalTrackerTemplate from "../templates/goal-template.html";
import { activateGoal } from '../plugin-runtime';
import { logger } from "../logger";

import { buildGoalConfig, validateEffect } from "../utility/configuration";
import { onGoalOverlayEvent } from "../overlay/overlay-events";
import { withRendererRules } from "../utility/renderer-callback";

/**
 * Creates and configures the main goal tracker effect type for Firebot
 * Handles all aspects of the goal tracking system including:
 * - Overlay configuration and display management
 * - Integration with external services (StreamElements, Extra Life)
 * - Real-time data polling and updates
 * - Visual customization and behavior settings
 * 
 * @returns Configured goal tracker effect type
 */
export function goalTrackerEffectType() {
    const goalTrackerEffectType: EffectType<EffectModel, GoalOverlayEvent> = {
        definition: {
            id: "msgg:goaltracker",
            name: "Advanced Goal Tracker",
            description: "Highly customizable Goal/Donation Tracking with Countdown",
            icon: "fad fa-chart-line",
            categories: ["overlay"],
            dependencies: {},
            triggers: {
                command: true,
                custom_script: true,
                startup_script: true,
                api: true,
                event: true,
                hotkey: true,
                timer: true,
                counter: true,
                preset: true,
                manual: true,
            },
        },
        optionsTemplate: goalTrackerTemplate,
        /**
         * Controller for managing the goal tracker options interface
         * Handles UI interactions, form state, and configuration updates
         * 
         * @param {any} $scope - Angular scope object
         * @param {any} utilityService - Utility service for overlay management
         */
        optionsController: withRendererRules(['$scope', 'utilityService'], (goalLogic, $scope: any, utilityService: any) => {
            /** 
             * Displays the overlay information modal for the specified instance
             * @param {string} overlayInstance - Identifier for the overlay instance
             */
            $scope.showOverlayInfoModal = function (overlayInstance: string) {
                utilityService.showOverlayInfoModal(overlayInstance);
            };

            /** 
             * Changes the milestone cycle mode
             */
            $scope.milestoneCycleModes = {
                "next": "Next Milestone",
                "all": "All Milestones"
            };

            /** 
             * Adds a new milestone to the tracker configuration
             * Initializes with empty title and zero amount
             */
            $scope.addMilestone = function () {
                if (!$scope.effect.milestones) {
                    $scope.effect.milestones = [];
                }
                $scope.effect.milestones.push({
                    title: "",
                    amount: 0
                });
            };

            /** 
             * Removes a milestone at the specified index
             * @param {number} index - Index of milestone to remove
             */
            $scope.removeMilestone = function (index: number) {
                $scope.effect.milestones.splice(index, 1);
            };

            $scope.countdownPositions = {
                "above": "Above Goal Bar",
                "below": "Below Goal Bar"
            };

            $scope.infoPositions = {
                "below": "Below Goal Bar",
                "above": "Above Goal Bar"
            };

            /**
             * Sets the countdown position and updates the corresponding value
             * Handles position validation and error logging
             */
            $scope.setCountdownPosition = function () {
                if (!$scope.countdownPositions[$scope.effect.display.countdown.countdownPosition]) {
                    $scope.effect.display.countdown.countdownPosition = 'below';
                }
            };

            /**
            * Sets the info section position and updates the corresponding value
            * Handles position validation and error logging
            */
            $scope.setInfoPosition = function () {
                if (!$scope.infoPositions[$scope.effect.display.infoSection.infoPosition]) {
                    $scope.effect.display.infoSection.infoPosition = 'below';
                }
            };

            /**
             * Creates a Date object for time values with hour and minute precision
             * Used for consistent time handling across the application
             * 
             * @param {number} hours - Hour value (0-23)
             * @param {number} minutes - Minute value (0-59)
             * @returns {Date} Configured date object
             */
            function createTimeDate(hours: number, minutes: number): Date {
                const timeDate = new Date(1970, 0, 1);
                timeDate.setHours(hours, minutes, 0, 0);
                return timeDate;
            }

            /** 
             * Toggles the display of JWT help information
             * Provides step-by-step instructions for obtaining StreamElements JWT token
             */
            $scope.showJwtHelp = function () {
                const displayDiv = document.getElementById("jwt-help-display");
                if (displayDiv) {
                    const currentDisplay = displayDiv.style.display;
                    if (currentDisplay === "none") {
                        const helpText = `
                            <ol>
                                <li>Log in to <a href="https://www.streamelements.com/" target="_blank">StreamElements</a></li>
                                <li>Go to <a href="https://streamelements.com/dashboard/account/channels" target="_blank">Account/Channel settings</a></li>
                                <li>Under the Channels tab, locate your channel</li>
                                <li>Copy the Account ID/JWT Token</li>
                            </ol>`;
                        displayDiv.innerHTML = helpText;
                        displayDiv.querySelectorAll('a').forEach(link => {
                            link.style.color = '#007bff';
                            link.style.textDecoration = 'underline';
                            link.style.cursor = 'pointer';
                        });
                        displayDiv.style.display = "block";
                    } else {
                        displayDiv.style.display = "none";
                    }
                }
            };

            /**
             * Default effect configuration
             * - Sets up initial dates and times
             * - Configures default donation goals and display options
             * - Initializes templates and color schemes
             * - Sets up timing and animation defaults
             */
            if ($scope.effect.startDate == null) {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);

                $scope.effect.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                $scope.effect.endDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
                $scope.effect.startTime = createTimeDate(8, 0);
                $scope.effect.endTime = createTimeDate(8, 0);
                $scope.effect.goalId = "goal_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                $scope.effect.donationGoal = 550;
                $scope.effect.largestDonationTieMode = "all";
                $scope.effect.showDonationTimestamp = false;
                $scope.effect.progressBarOpacity = 1;
                $scope.effect.useMilestonesAsGoals = false;
                $scope.effect.milestoneCycle = false;
                $scope.effect.milestoneCycleMode = 'next';
                $scope.effect.showCompletedMilestones = true;
                $scope.effect.useCustomRecentMessage = false;
                $scope.effect.useCustomLargestMessage = false;
                $scope.effect.showInfoSection = true;
                $scope.effect.infoSectionCycle = true;
                $scope.effect.separateInfoColors = false;
                $scope.effect.showDonationAnimation = true;
                $scope.effect.showLogoAnimation = true;
                $scope.effect.milestones = [];
                $scope.effect.extraLife = {
                    useExtraLife: false,
                    useExtraLifeColors: false,
                    participantId: '',
                    extralifeDonorRotationInterval: 3,
                    dataPollInterval: 60
                };
                $scope.effect.templates = {
                    titles: {
                        streamBegins: "STREAM BEGINS IN",
                        streamRunning: "STREAM TIME REMAINING",
                        streamEnded: "STREAM TOTAL TIME",
                        progressBar: "Fundraising Progress",
                        heading: "Stream Event!",
                        subheading: "Every donation helps us reach our goal!"

                    },
                    donations: {
                        noDonations: "No donations yet!",
                        defaultDonorName: "Anonymous",
                        largestDonationFormat: "Largest Donation: ${amount} by {name}",
                        donationFormat: "{name} donated ${amount}",
                        supportMessage: "Support the Stream!",
                        recentDonations: "Current Fundraising",
                        customLargestMessage: "Middle Row Override",
                        customRecentMessage: "Top Row Override",
                        currencySymbol: "$"
                    },
                    colors: {
                        trackColor: "#404040",
                        progressColor: "#a60000",
                        goalColor: "#ffffff",
                        milestoneColor: "#ffffff",
                        progressBoxColorOne: "#2a2a2a",
                        progressBoxColorTwo: "#1a1a1a",
                        goalTitleColor: "#ffffff",
                        countdownBackgroundColorOne: "#2a2a2a",
                        countdownBackgroundColorTwo: "#1a1a1a",
                        countdownTitleColor: "#e3e3e3",
                        countdownTimeBackground: "#a60000",
                        countdownTimeColor: "#ffffff",
                        countdownTimeShadow: "0 0 20px rgba(166, 0, 0, 0.3)",
                        infoSectionBackgroundColorOne: "#2a2a2a",
                        infoSectionBackgroundColorTwo: "#1a1a1a",
                        donorTextColor: "#e3e3e3",
                        largestTextColor: "#e3e3e3",
                        additionalTextColor: "#e3e3e3",
                        infoDonorBackground: "",
                        infoLargestBackground: "",
                        infoAdditionalBackground: "",
                        infoBorderColor: "rgba(227, 227, 227, 0.1)"
                    },
                    animation: {
                        animationHighlight: "#a60000",
                        animationBackgroundColorOne: "#111111",
                        animationBackgroundColorTwo: "#1a1a1a",
                        animationBorder: "#a60000",
                        animationText: "#ffffff",
                        animationShadow: "0 2px 4px rgba(0,0,0,0.2)"
                    }
                },
                    $scope.effect.display = {
                        countdown: {
                            countdownPosition: 'below',
                            showCountdown: true,
                            countdownCycle: false
                        },
                        infoSection: {
                            infoPosition: 'below'
                        },
                        progressBar: {
                            hideBeforeStreamStartTime: false,
                            hideAfterStreamEndTime: false,
                            showTitle: false,
                            showPercentage: true
                        },
                        showHighlight: true
                    };
                $scope.effect.timing = {
                    transition: 0.5,
                    cycleDelay: 30,
                    animationDisplay: 5,
                    animationPreTiming: 10,
                    animationPostTiming: 10,
                    customDonorRotationInterval: 3,
                    dataPollInterval: 60
                };
                $scope.effect.streamElements = {
                    useStreamElements: false,
                    channelId: '',
                    jwtToken: '',
                    pollInterval: 60,
                    useLocalDonations: false,
                    autoReset: false,
                    summaryType: 'monthly',
                    localDonationsPeriod: 'monthly',
                    subscriptionValues: {
                        prime: 2.50,
                        tier1: 2.50,
                        tier2: 5.00,
                        tier3: 12.50
                    },
                    bitsValue: 0.01
                };
            } else {
                // Convert stored string dates back to Date objects
                const startDate = new Date($scope.effect.startDate);
                const endDate = new Date($scope.effect.endDate);

                $scope.effect.startDate = new Date(
                    startDate.getFullYear(),
                    startDate.getMonth(),
                    startDate.getDate()
                );

                $scope.effect.endDate = new Date(
                    endDate.getFullYear(),
                    endDate.getMonth(),
                    endDate.getDate()
                );

                const savedStart = new Date($scope.effect.startTime);
                const savedEnd = new Date($scope.effect.endTime);

                $scope.effect.startTime = createTimeDate(savedStart.getHours(), savedStart.getMinutes());
                $scope.effect.endTime = createTimeDate(savedEnd.getHours(), savedEnd.getMinutes());
            }

            if (!$scope.effect.goalId) $scope.effect.goalId = "default";
            Object.assign($scope.effect.templates.animation, goalLogic.animationBackgrounds($scope.effect.templates.animation));
            // Native number inputs require numeric models, including values saved by older text controls.
            const sizing = goalLogic.widgetSizing($scope.effect.widgetWidth, $scope.effect.widgetScale, $scope.effect.autoWidgetWidth);
            $scope.effect.widgetWidth = sizing.width;
            $scope.effect.widgetScale = sizing.scale;
            $scope.effect.autoWidgetWidth = sizing.autoWidth;
            $scope.effect.display.fixedSectionWidths = goalLogic.fixedSectionWidths($scope.effect.display);
            delete $scope.effect.display.infoSection.fixedWidth;
            $scope.effect.overlayGaps = goalLogic.widgetGaps($scope.effect.overlayGaps);
            if ($scope.effect.streamElements.autoReset === undefined) $scope.effect.streamElements.autoReset = false;
            if ($scope.effect.showCompletedMilestones === undefined) {
                $scope.effect.showCompletedMilestones = true;
            }
        }),
        /**
         * Validates the effect configuration with the following checks:
         * - Ensures valid donation goal amount
         * - Validates StreamElements credentials if enabled
         * 
         * @param {EffectModel} effect - The effect configuration to validate
         * @returns {string[]} Array of validation error messages
         */
        optionsValidator: withRendererRules(['effect'], (goalLogic, effect: EffectModel) => {
            const errors = [...goalLogic.widgetSizingErrors(effect.widgetWidth, effect.widgetScale, effect.autoWidgetWidth),
            ...(String(effect.position).toLowerCase() === 'custom' ? [] : goalLogic.widgetGapErrors(effect.overlayGaps))];

            if (!Number.isFinite(Number(effect.donationGoal)) || Number(effect.donationGoal) <= 0) {
                errors.push("Please enter a valid donation goal amount");
            }

            // StreamElements validation
            if (effect.streamElements.useStreamElements) {
                if (!effect.streamElements.channelId) {
                    errors.push("StreamElements Channel ID is required");
                }
                if (!effect.streamElements.jwtToken) {
                    errors.push("StreamElements JWT Token is required");
                }
            }
            return errors;
        }),
        /**
         * Handles trigger events for the goal tracker
         * Manages:
         * - Data source selection and configuration
         * - Goal state initialization
         * - Overlay updates and synchronization
         * - Polling setup for real-time updates
         * 
         * @param {any} event - Trigger event data
         * @returns {Promise<{success: boolean, error?: string}>} Operation result
         */
        onTriggerEvent: async (event) => {
            try {
                validateEffect(event.effect);
                const goalUuid = randomUUID();
                const config = buildGoalConfig(event.effect, path => firebot.webServer.createResourceToken(path));
                await activateGoal(config, event.effect.overlayInstance || '', goalUuid, event.sendDataToOverlay);
                return { success: true };
            } catch (error) {
                logger.error('Goal tracker configuration failed:', error);
                return { success: false, errorMessage: (error as Error).message };
            }
        },
        overlayExtension: {
            dependencies: { css: [], js: [] },
            event: { name: "goal-tracker", onOverlayEvent: onGoalOverlayEvent }
        }
    };
    return goalTrackerEffectType;
}
