/**
 * @file goal-tracker-overlay.ts
 * @description Advanced goal tracking system for Firebot with comprehensive support for:
 * - Real-time donation tracking with multiple data sources integration
 * - Customizable overlay display with flexible positioning
 * - Dynamic milestone tracking and visual customization
 * - Support for StreamElements, Extra Life, and local donations
 * - Real-time updates and local/remote data synchronization
 */

import { Firebot, ScriptModules } from "@crowbartools/firebot-custom-scripts-types";
import { randomUUID } from "crypto";
import { webServer, settings } from "../main";
import { EffectModel, GoalTrackerUpdate, EventData, GoalTrackerConfig, GoalState } from "../types/types";
import goalTrackerTemplate from "../templates/goal-template.html";
import { goalManager } from '../utility/goal-manager';
import { logger } from "../logger";

let activePollingInterval: NodeJS.Timeout | null = null;

/**
 * Creates and configures the main goal tracker effect type for Firebot
 * Handles all aspects of the goal tracking system including:
 * - Overlay configuration and display management
 * - Integration with external services (StreamElements, Extra Life)
 * - Real-time data polling and updates
 * - Visual customization and behavior settings
 * 
 * @param {ScriptModules["resourceTokenManager"]} resourceTokenManager - Manager for handling resource paths and tokens
 * @returns {Firebot.EffectType} Configured goal tracker effect type
 */
export function goalTrackerEffectType(
    resourceTokenManager: ScriptModules["resourceTokenManager"],
) {
    const goalTrackerEffectType: Firebot.EffectType<EffectModel> = {
        definition: {
            id: "msgg:goaltracker",
            name: "Advanced Goal Tracker",
            description: "Highly customizable Goal/Donation Tracking with Countdown",
            icon: "fad fa-chart-line",
            categories: ["overlay"],
            dependencies: [],
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
        optionsController: ($scope: any, utilityService: any) => {
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
                const selectedIndex = $scope.countdownPositions.findIndex((label: string) => {
                    return label === $scope.effect.display.countdown.countdownPosition;
                });

                if (selectedIndex !== -1) {
                    $scope.effect.display.countdown.countdownPositionValue = selectedIndex;
                } else {
                    console.error('Invalid countdownPosition:', $scope.effect.display.countdown.countdownPosition);
                }
            };

            /**
            * Sets the info section position and updates the corresponding value
            * Handles position validation and error logging
            */
            $scope.setInfoPosition = function () {
                const selectedIndex = $scope.infoPositions.findIndex((label: string) => {
                    return label === $scope.effect.display.infoSection.infoPosition;
                });

                if (selectedIndex !== -1) {
                    $scope.effect.display.infoSection.infoPositionValue = selectedIndex;
                } else {
                    console.error('Invalid infoPosition:', $scope.effect.display.infoSection.infoPosition);
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
                $scope.effect.useCustomDonationData = false;
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

            if ($scope.effect.showCompletedMilestones === undefined) {
                $scope.effect.showCompletedMilestones = true;
            }
        },
        /**
         * Validates the effect configuration with the following checks:
         * - Ensures valid donation goal amount
         * - Validates StreamElements credentials if enabled
         * 
         * @param {EffectModel} effect - The effect configuration to validate
         * @returns {string[]} Array of validation error messages
         */
        optionsValidator: (effect) => {
            const errors = [];

            if (!effect.donationGoal || effect.donationGoal <= 0) {
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
        },
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
        onTriggerEvent: async (event: any) => {
            let overlayInstance = event.effect.overlayInstance || '';

            /**
             * Initiates data polling for the specified mode
             * Handles different data sources (ExtraLife, StreamElements, local)
             * 
             * @param {string} mode - Polling mode ('extraLife', 'streamElements', 'local')
             * @param {any} config - Configuration for the polling operation
             * @param {string} overlayInstance - Target overlay instance
             */
            function startPolling(mode: string, config: any, overlayInstance: string) {
                // Clear existing interval
                if (activePollingInterval) {
                    clearInterval(activePollingInterval);
                    activePollingInterval = null;
                }

                const pollFunction = async () => {
                    const currentState = await goalManager.getGoalData();

                    if (currentState?.config.extraLife.useExtraLife && mode !== 'extraLife') {
                        return;
                    }
                    if (currentState?.config.streamElements.useStreamElements && mode !== 'streamElements') {
                        return;
                    }
                    if ((currentState?.config.extraLife.useExtraLife || currentState?.config.streamElements.useStreamElements) && mode === 'local') {
                        return;
                    }

                    let data = null;
                    switch (mode) {
                        case 'extraLife':
                            data = await goalManager.pollExtraLife(config.extraLife.participantId);
                            if (data !== null) {
                                await webServer.sendToOverlay("goal-tracker", {
                                    type: 'update',
                                    data: { extraLife: data },
                                    overlayInstance
                                });
                            }
                            break;

                        case 'streamElements':
                            try {
                                data = await goalManager.pollStreamElements(
                                    config.streamElements.channelId,
                                    config.streamElements.jwtToken,
                                    config.streamElements.useLocalDonations
                                );
                                if (data !== null) {
                                    if (config.streamElements.useLocalDonations) {
                                        const localDonations = await goalManager.getLocalDonations();
                                        if (localDonations) {
                                            const now = new Date();
                                            const currentMonth = now.getMonth();
                                            const currentYear = now.getFullYear();

                                            // Filter local donations based on summary type
                                            const filteredDonations = localDonations.data.donations.map(donor => ({
                                                ...donor,
                                                individual_donations: donor.individual_donations.filter(d => {
                                                    const donationDate = new Date(d.timestamp);
                                                    if (config.streamElements.summaryType === 'monthly') {
                                                        return donationDate.getMonth() === currentMonth &&
                                                            donationDate.getFullYear() === currentYear;
                                                    } else {
                                                        // Weekly - get donations from current week (Sunday to Saturday)
                                                        const weekStart = new Date(now);
                                                        weekStart.setDate(now.getDate() - now.getDay());
                                                        weekStart.setHours(0, 0, 0, 0);

                                                        const weekEnd = new Date(weekStart);
                                                        weekEnd.setDate(weekStart.getDate() + 7);

                                                        return donationDate >= weekStart && donationDate < weekEnd;
                                                    }
                                                })
                                            })).filter(donor => donor.individual_donations.length > 0);

                                            // Recalculate totals for filtered donations
                                            const filteredTotal = filteredDonations.reduce((acc, donor) => {
                                                const donorTotal = donor.individual_donations.reduce((sum, d) => sum + d.amount, 0);
                                                return {
                                                    amount: acc.amount + donorTotal,
                                                    donation_count: acc.donation_count + donor.individual_donations.length
                                                };
                                            }, { amount: 0, donation_count: 0 });

                                            data.current.donations = [...data.current.donations, ...filteredDonations];
                                            data.current.overall_total.amount = Number((data.current.overall_total.amount + filteredTotal.amount).toFixed(2));
                                            data.current.overall_total.donation_count += filteredTotal.donation_count;
                                        }
                                    }
                                    await webServer.sendToOverlay("goal-tracker", {
                                        type: 'update',
                                        data: { streamElements: data },
                                        overlayInstance
                                    });
                                }
                            } catch (error) {
                                logger.error('StreamElements polling error:', error);
                            }
                            break;

                        case 'local':
                            setTimeout(async () => {
                                const localData = await goalManager.getLocalDonations();
                                if (localData?.data?.donations) {
                                    const now = new Date();
                                    const currentMonth = now.getMonth();
                                    const currentYear = now.getFullYear();

                                    // Helper function to check if date is within period
                                    const isInPeriod = (dateStr: string, period: 'all' | 'daily' | 'weekly' | 'monthly'): boolean => {
                                        if (period === 'all') return true;  // Show all donations when 'all' is selected

                                        const date = new Date(dateStr);
                                        switch (period) {
                                            case 'daily':
                                                return date.getDate() === now.getDate() &&
                                                    date.getMonth() === currentMonth &&
                                                    date.getFullYear() === currentYear;
                                            case 'weekly': {
                                                const weekStart = new Date(now);
                                                weekStart.setDate(now.getDate() - now.getDay());
                                                weekStart.setHours(0, 0, 0, 0);

                                                const weekEnd = new Date(weekStart);
                                                weekEnd.setDate(weekStart.getDate() + 7);

                                                return date >= weekStart && date < weekEnd;
                                            }
                                            case 'monthly':
                                                return date.getMonth() === currentMonth &&
                                                    date.getFullYear() === currentYear;
                                            default:
                                                return false;
                                        }
                                    };

                                    // Filter donations based on selected period
                                    const filteredDonations = localData.data.donations.map(donor => ({
                                        ...donor,
                                        individual_donations: donor.individual_donations.filter(d => {
                                            return isInPeriod(
                                                d.timestamp,
                                                config.streamElements.localDonationsPeriod || 'monthly'
                                            );
                                        })
                                    })).filter(donor => donor.individual_donations.length > 0);

                                    // Recalculate totals
                                    const filteredTotal = filteredDonations.reduce((acc, donor) => {
                                        const donorTotal = donor.individual_donations.reduce((sum, d) => sum + d.amount, 0);
                                        return {
                                            amount: acc.amount + donorTotal,
                                            donation_count: acc.donation_count + donor.individual_donations.length
                                        };
                                    }, { amount: 0, donation_count: 0 });

                                    // Create filtered data object
                                    const filteredData = {
                                        data: {
                                            donations: filteredDonations,
                                            overall_total: {
                                                amount: Number(filteredTotal.amount.toFixed(2)),
                                                donation_count: filteredTotal.donation_count
                                            },
                                            metadata: {
                                                lastUpdated: new Date().toISOString()
                                            }
                                        }
                                    };

                                    await webServer.sendToOverlay("goal-tracker", {
                                        type: 'update',
                                        data: { localDonations: filteredData },
                                        overlayInstance
                                    });
                                }
                            }, 100);
                            break;
                    }
                };


                pollFunction();

                const interval = mode === 'extraLife' ? config.extraLife.dataPollInterval :
                    mode === 'streamElements' ? config.streamElements.pollInterval :
                        config.timing.dataPollInterval;
                activePollingInterval = setInterval(pollFunction, interval * 1000);
            }

            try {
                const goalUuid = randomUUID();

                let dataSourceMode = 'local';
                if (event.effect.extraLife.useExtraLife) {
                    dataSourceMode = 'extraLife';
                    event.effect.streamElements.useStreamElements = false;
                } else if (event.effect.streamElements.useStreamElements) {
                    dataSourceMode = 'streamElements';
                }

                // Construct base configuration
                const config: GoalTrackerConfig = {
                    streamInfo: {
                        startDate: new Date(event.effect.startDate).toISOString().split('T')[0],
                        startTime: typeof event.effect.startTime === 'object' ?
                            `${String((event.effect.startTime as Date).getHours()).padStart(2, '0')}:${String((event.effect.startTime as Date).getMinutes()).padStart(2, '0')}` :
                            new Date(event.effect.startTime).toLocaleTimeString('en-US', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit'
                            }).replace(/^24:/, '00:'),
                        endDate: new Date(event.effect.endDate).toISOString().split('T')[0],
                        endTime: typeof event.effect.endTime === 'object' ?
                            `${String((event.effect.endTime as Date).getHours()).padStart(2, '0')}:${String((event.effect.endTime as Date).getMinutes()).padStart(2, '0')}` :
                            new Date(event.effect.endTime).toLocaleTimeString('en-US', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit'
                            }).replace(/^24:/, '00:')
                    },
                    donationGoal: event.effect.donationGoal,
                    mode: {
                        useMilestonesAsGoals: event.effect.useMilestonesAsGoals,
                        milestoneCycle: event.effect.milestoneCycle,
                        milestoneCycleMode: event.effect.milestoneCycleMode,
                        showCompletedMilestones: event.effect.showCompletedMilestones,
                        infoSectionCycle: event.effect.infoSectionCycle,
                        showInfoSection: event.effect.showInfoSection,
                        separateInfoColors: event.effect.separateInfoColors,
                        showDonationAnimation: event.effect.showDonationAnimation,
                        showLogoAnimation: event.effect.showLogoAnimation,
                        showDonationTimestamp: event.effect.showDonationTimestamp,
                        useCustomLargestMessage: event.effect.useCustomLargestMessage,
                        useCustomRecentMessage: event.effect.useCustomRecentMessage,
                        largestDonationTieMode: event.effect.largestDonationTieMode
                    },
                    display: event.effect.display,
                    content: {
                        milestones: event.effect.milestones,
                        templates: {
                            extraLife: {
                                titles: event.effect.templates.titles,
                                donations: event.effect.templates.donations,
                                colors: {
                                    progressColor: "#00B4FF",
                                    trackColor: "rgba(27, 40, 56, 0.95)",
                                    goalColor: "#ffffff",
                                    milestoneColor: "#ffffff",
                                    progressBoxColorOne: "#1B2838",
                                    progressBoxColorTwo: "#2A475E",
                                    goalTitleColor: "#e3e3e3",
                                    countdownBackgroundColorOne: "#1B2838",
                                    countdownBackgroundColorTwo: "#2A475E",
                                    countdownTitleColor: "rgba(227, 227, 227, 0.95)",
                                    countdownTimeBackground: "rgba(0, 180, 255, 0.95)",
                                    countdownTimeColor: "#ffffff",
                                    countdownTimeShadow: "0 0 20px rgba(0, 180, 255, 0.3)",
                                    infoSectionBackgroundColorOne: "#1B2838",
                                    infoSectionBackgroundColorTwo: "#2A475E",
                                    donorTextColor: "#e3e3e3",
                                    largestTextColor: "#e3e3e3",
                                    additionalTextColor: "#e3e3e3",
                                    infoDonorBackground: "rgba(255, 255, 255, 0.03)",
                                    infoLargestBackground: "rgba(255, 255, 255, 0.02)",
                                    infoAdditionalBackground: "rgba(255, 255, 255, 0.03)",
                                    infoBorderColor: "rgba(227, 227, 227, 0.1)"
                                },
                                animation: event.effect.templates.animation
                            },
                            default: {
                                titles: event.effect.templates.titles,
                                donations: event.effect.templates.donations,
                                colors: event.effect.templates.colors,
                                animation: event.effect.templates.animation
                            }
                        },
                        branding: {
                            logo: {
                                extraLife: {
                                    src: resourceTokenManager.storeResourcePath("ExtraLifeLogo.png", 0),
                                    alt: "Extra Life Logo",
                                    styles: {
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        padding: "0",
                                        background: "none"
                                    }
                                },
                                default: {
                                    src: event.effect.defaultLogoPath ?
                                        resourceTokenManager.storeResourcePath(
                                            event.effect.defaultLogoPath,
                                            parseInt(goalUuid.slice(9, 17), 16) % 1000000
                                        ) : "",
                                    alt: "Stream Logo",
                                    styles: {
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        padding: "0",
                                        background: "none"
                                    }
                                }
                            }
                        }
                    },
                    timing: event.effect.timing,
                    extraLife: event.effect.extraLife,
                    streamElements: event.effect.streamElements,
                    position: event.effect.position || 'Middle',
                    customCoords: event.effect.customCoords || {
                        top: null,
                        bottom: null,
                        left: null,
                        right: null
                    }
                };

                // Construct mode-specific goal state
                const baseGoalState = {
                    uuid: goalUuid,
                    config,
                    overlayInstance: event.effect.overlayInstance || '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await goalManager.updateGoalData(baseGoalState);
                // Send initial data to overlay
                await webServer.sendToOverlay("goal-tracker", baseGoalState);

                startPolling(dataSourceMode, config, overlayInstance);

                if (settings?.useOverlayInstances()) {
                    if (event.effect.overlayInstance != null) {
                        if (settings.getOverlayInstances().includes(event.effect.overlayInstance)) {
                            overlayInstance = event.effect.overlayInstance;
                        }
                    }
                }

                return { success: true };
            } catch (error: any) {
                logger.error('Goal tracker error:', {
                    message: error?.message || 'Unknown error',
                    stack: error?.stack || 'No stack trace',
                    eventData: {
                        hasEffect: !!event.effect
                    }
                });
                return { success: false, error: error?.message || 'Unknown error' };
            }
        },
        /**
         * Configuration for overlay extension functionality
         * Handles:
         * - Dependency management
         * - Event handling
         * - DOM manipulation
         * - Resource loading
         */
        overlayExtension: {
            dependencies: {
                css: [],
                js: []
            },
            event: {
                name: "goal-tracker",
                onOverlayEvent: (data: unknown) => {
                    const event = data as EventData | GoalTrackerUpdate;

                    if ((event as EventData).config) {
                        const eventData = event as EventData;

                        const positionClass = eventData.config.position.toLowerCase().replace(' ', '-');
                        const { customCoords } = eventData.config;

                        // Convert resource tokens to full URLs immediately
                        if (eventData.config.content.branding.logo.default.src) {
                            eventData.config.content.branding.logo.default.src =
                                `http://${window.location.hostname}:7472/resource/${encodeURIComponent(eventData.config.content.branding.logo.default.src)}`;
                        }
                        if (eventData.config.content.branding.logo.extraLife.src) {
                            eventData.config.content.branding.logo.extraLife.src =
                                `http://${window.location.hostname}:7472/resource/${encodeURIComponent(eventData.config.content.branding.logo.extraLife.src)}`;
                        }

                        // Check if this goal tracker already exists
                        const existingTracker = document.getElementById('goal-tracker');
                        if (existingTracker) {
                            existingTracker.remove();
                        }
                        // Create new tracker
                        const wrapper = document.createElement('div');
                        wrapper.id = 'goal-tracker';
                        wrapper.className = `position-wrapper ${positionClass}`;

                        // Add inner position container
                        let innerHtml = `<div class="inner-position"`;
                        if (eventData.config.position === 'Custom' && customCoords) {
                            innerHtml += ` style="position: absolute;`;
                            if (customCoords.top !== null) innerHtml += `top: ${customCoords.top}px;`;
                            if (customCoords.bottom !== null) innerHtml += `bottom: ${customCoords.bottom}px;`;
                            if (customCoords.left !== null) innerHtml += `left: ${customCoords.left}px;`;
                            if (customCoords.right !== null) innerHtml += `right: ${customCoords.right}px;`;
                            innerHtml += `"`;
                        }
                        innerHtml += `>`;

                        // Inject template
                        fetch(`http://${window.location.hostname}:7472/integrations/goal-tracker/goal-tracker.html`)
                            .then(response => response.text())
                            .then(template => {
                                const configString = JSON.stringify(eventData.config, null, 2);
                                const updatedTemplate = template.replace(
                                    /const CONFIG = \{[\s\S]*?\};/,
                                    `const CONFIG = ${configString};`
                                );
                                wrapper.innerHTML = innerHtml + updatedTemplate + '</div>';
                                $("#wrapper").append(wrapper);
                            });

                    } else {
                        const updateEvent = event as GoalTrackerUpdate;
                        if (updateEvent.type === 'update') {
                            // Include goal info in the update event
                            window.dispatchEvent(new CustomEvent('goalTrackerUpdate', {
                                detail: {
                                    overlayInstance: updateEvent.overlayInstance,
                                    ...updateEvent.data
                                }
                            }));
                        }
                    }
                }
            }
        }
    };
    return goalTrackerEffectType;
}
