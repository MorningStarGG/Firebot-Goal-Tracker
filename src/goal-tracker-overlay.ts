/**
 * @file goal-tracker-overlay.ts
 * @description Advanced goal tracking system for Firebot with support for:
 * - Real-time donation tracking
 * - Multiple data sources (StreamElements, Extra Life, custom)
 * - Customizable overlay display
 * - Local and remote updates
 * 
 * Contains three main effect types:
 * - goalTrackerEffectType: Main overlay configuration and display
 * - goalTrackerUpdateEffectType: One-time data updates
 * - goalTrackerLocalUpdateEffectType: Local donation tracking updates
 */

import { Firebot, ScriptModules } from "@crowbartools/firebot-custom-scripts-types";
import { logger } from "./logger";
import { randomUUID } from "crypto";
import { webServer } from "./main";
import { GoalTrackerConfig, EventData, Milestone, DonationData } from "./types";
import goalTrackerTemplate from './effect-template.html';

/**
 * @interface EffectModel
 * @description Configuration model for the main goal tracker effect
 */
interface EffectModel {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    goalAmount: number;
    defaultDonationGoal: number;
    largestDonationTieMode: 'all' | 'recent';
    showDonationTimestamp: boolean;
    progressBarOpacity: number;
    defaultLogoPath: string;
    useCustomLargestMessage: boolean;
    useCustomRecentMessage: boolean;
    useMilestonesAsGoals: boolean;
    separateInfoColors: boolean;
    infoSectionCycle: boolean;
    showInfoSection: boolean;
    showDonationAnimation: boolean;
    showLogoAnimation: boolean;
    useCustomDonationData: boolean;
    milestones: Milestone[];
    templates: {
        titles: {
            streamBegins: string;
            streamRunning: string;
            streamEnded: string;
            progressBar: string;
            heading: string;
            subheading: string;
        };
        donations: {
            noDonations: string;
            defaultDonorName: string;
            largestDonationFormat: string;
            donationFormat: string;
            supportMessage: string;
            recentDonations: string;
            customLargestMessage: string;
            customRecentMessage: string;
        };
        colors: {
            trackColor: string;
            progressColor: string;
            goalColor: string;
            milestoneColor: string;
            progressBoxColorOne: string;
            progressBoxColorTwo: string;
            goalTitleColor: string;
            countdownBackgroundColorOne: string;
            countdownBackgroundColorTwo: string;
            countdownTitleColor: string;
            countdownTimeBackground: string;
            countdownTimeColor: string;
            countdownTimeShadow: string;
            infoSectionBackgroundColorOne: string;
            infoSectionBackgroundColorTwo: string;
            donorTextColor: string;
            largestTextColor: string;
            additionalTextColor: string;
            infoDonorBackground: string;
            infoLargestBackground: string;
            infoAdditionalBackground: string;
            infoBorderColor: string;
        };
        animation: {
            animationHighlight: string;
            animationBorder: string;
            animationText: string;
            animationShadow: string;
            animationBackgroundColorOne: string;
            animationBackgroundColorTwo: string;
        };
    };
    display: {
        countdown: {
            countdownPosition: string;
            showCountdown: boolean;
            countdownCycle: boolean;
        };
        progressBar: {
            hideBeforeStreamStartTime: boolean;
            hideAfterStreamEndTime: boolean;
            showTitle: boolean;
            showPercentage: boolean
        };
        showHighlight: boolean;
    };

    timing: {
        transition: number;
        cycleDelay: number;
        animationDisplay: number;
        animationPreTiming: number;
        animationPostTiming: number;
        customDonorRotationInterval: number;
        dataPollInterval: number;
    };
    extraLife: {
        useExtraLife: boolean;
        useExtraLifeColors: boolean;
        participantId: string;
        extralifeDonorRotationInterval: number;
    };
    customVariables: {
        current: string;
        goal: string;
        recentDonations: DonationData[];
        recentDonationsJson?: string;
        jsonVariableName: string;
        currentVariableName: string;
        goalVariableName: string;
    };
    streamElements: {
        useStreamElements: boolean;
        channelId: string;
        jwtToken: string;
        pollInterval: number;
        useLocalDonations: boolean;
        localDonationsVariable: string;
        streamElementsVariable: string;
        subscriptionValues: {
            prime: number;
            tier1: number;
            tier2: number;
            tier3: number;
        };
        bitsValue: number;
    };
}

/**
 * @interface GoalTrackerUpdate
 * @description Data model for updating tracker values
 */
interface GoalTrackerUpdate {
    type: 'update';
    data: {
        current?: string;
        goal?: string;
        recentDonations?: DonationData[];
    }
}
/**
 * Creates an effect type for updating goal tracker data
 * - Handles one-time updates to donation amounts and goals
 * - Processes custom donation data in JSON format
 * - Validates data integrity before updates
 * 
 * @returns {Firebot.EffectType} Effect type for data updates
 */
export function goalTrackerUpdateEffectType() {
    interface UpdateEffectModel {
        customVariables: {
            current: string;
            goal: string;
            recentDonationsJson?: string;
        }
    }

    const updateEffectType: Firebot.EffectType<UpdateEffectModel> = {
        definition: {
            id: "msgg:goaltracker-update",
            name: "Update Goal Tracker Data",
            description: "One time update of the current donation data for Advanced Goal Tracker",
            icon: "fad fa-sync",
            categories: ["overlay"],
            dependencies: [],
            triggers: {
                command: true,
                custom_script: true,
                event: true,
                manual: true
            }
        },
        optionsTemplate: `
                        <eos-container header="Donation Information" aria-label="Donation Form Container">
                            <div class="input-group" aria-label="Donation Input Fields">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="input-group" style="margin-bottom: 10px;">
                                            <firebot-input input-title="Current Amount" pad-top="true" model="effect.customVariables.current"
                                                placeholder="Current donation amount"
                                                aria-label="Enter current donation amount"></firebot-input>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="input-group" style="margin-bottom: 10px;">
                                            <firebot-input input-title="Goal Amount" pad-top="true" model="effect.customVariables.goal"
                                                placeholder="Goal amount" aria-label="Enter donation goal amount"></firebot-input>
                                        </div>
                                    </div>
                                </div>
                                <div style="margin-bottom: 10px;" aria-label="JSON Donation Data Section">
                                    <span style="font-size: 18px; font-weight: 700; width: 100%; display: block; text-align: center;"
                                        aria-label="Important Note">*** REQUIRES "Use JSON Donation Data" ***</span>
                                    <firebot-input input-title="Custom Donations JSON" pad-top="true"
                                        model="effect.customVariables.recentDonationsJson" rows="10"
                                        placeholder="Enter donation data as a JSON array"
                                        aria-label="Enter custom donations JSON data"></firebot-input>
                                </div>
                                <span style="font-size: 14px; font-weight: 700; width: 100%; display: block; text-align: center;"
                                        aria-label="Important Note">*** WILL NOT WORK IF USING API OR CUSTOM VARIABLE IN MAIN SETTINGS! ***</span>
                                <div style="text-align: center; margin-top: 10px;" aria-label="JSON Example Controls">
                                    <button class="btn btn-primary" ng-click="copyExampleJson()"
                                        aria-label="Copy example JSON to clipboard">Copy Example JSON</button>
                                    <button class="btn btn-primary" ng-click="showExampleJson()" aria-label="Display example JSON">Show Example
                                        JSON</button>
                                </div>
                                <div id="example-json-display"
                                    style="margin-top: 10px; display: none; text-align: left; font-size: 14px; border: 1px solid #ccc; padding: 10px; background-color: #24262A;"
                                    aria-label="Example JSON display area" aria-live="polite">
                                </div>
                            </div>
                        </eos-container>
                        `,
        optionsController: ($scope: any, utilityService: any) => {
            // Example JSON data
            const exampleJson = [
                {
                    "donations": [
                        {
                            "name": "John Doe",
                            "individual_donations": [
                                {
                                    "amount": 100,
                                    "timestamp": "2024-11-06T12:30:00Z"
                                },
                                {
                                    "amount": 150.42,
                                    "timestamp": "2024-11-05T15:45:00Z"
                                },
                                {
                                    "amount": 75,
                                    "timestamp": "2024-11-08T15:45:00Z"
                                }
                            ],
                            "total_amount": 325.42,
                            "total_donations": 3
                        },
                        {
                            "name": "Jane Smith",
                            "individual_donations": [
                                {
                                    "amount": 100,
                                    "timestamp": "2024-11-06T09:20:00Z"
                                },
                                {
                                    "amount": 50,
                                    "timestamp": "2024-11-04T14:00:00Z"
                                }
                            ],
                            "total_amount": 150,
                            "total_donations": 2
                        }
                    ],
                    "overall_total": {
                        "amount": 475.42,
                        "donation_count": 5
                    }
                }
            ];
            // Copy example JSON to clipboard
            $scope.copyExampleJson = function () {
                const jsonString = JSON.stringify(exampleJson, null, 2);
                const textArea = document.createElement('textarea');
                textArea.value = jsonString;
                document.body.appendChild(textArea);
                textArea.select();

                try {
                    document.execCommand('copy');
                    utilityService.showInfoModal(
                        "Sucess: Example JSON has been copied to your clipboard!"
                    );
                } catch (err) {
                    utilityService.showErrorModal(
                        "Failed: Example JSON has NOT been copied to your clipboard!"
                    );
                }

                document.body.removeChild(textArea);
            };

            // Show/hide example JSON
            $scope.showExampleJson = function () {
                const displayDiv = document.getElementById("example-json-display");
                if (displayDiv) {
                    const currentDisplay = displayDiv.style.display;
                    if (currentDisplay === "none") {
                        // Format JSON with proper indentation
                        const formattedJson = JSON.stringify(exampleJson, null, 2);

                        displayDiv.textContent = formattedJson;
                        displayDiv.style.display = "block";
                        displayDiv.style.whiteSpace = 'pre';
                    } else {
                        displayDiv.style.display = "none";
                    }
                }
            };
        },
        optionsValidator: (effect) => {
            const errors = [];

            // Validate current amount is a valid number if provided
            if (effect.customVariables.current && !effect.customVariables.current.startsWith('$customVariable[')) {
                const currentAmount = Number(effect.customVariables.current);
                if (isNaN(currentAmount) || currentAmount < 0) {
                    errors.push("Current amount must be a valid positive number");
                }
            }

            // Validate JSON data if provided
            if (effect.customVariables.recentDonationsJson && !effect.customVariables.recentDonationsJson.startsWith('$customVariable[')) {
                try {
                    const donationData = JSON.parse(effect.customVariables.recentDonationsJson);

                    // Basic structure validation
                    if (!Array.isArray(donationData) ||
                        !donationData[0]?.donations?.length ||
                        !donationData[0]?.overall_total?.amount) {
                        errors.push("Custom donation data must match the required format with donations array and overall total");
                        return errors;
                    }

                    // Data integrity validation
                    const donations = donationData[0].donations;
                    let totalDonationCount = 0;
                    let calculatedTotalAmount = 0;

                    donations.forEach((donor: any, index: number) => {
                        if (!donor.name || !Array.isArray(donor.individual_donations)) {
                            errors.push(`Donor at index ${index} missing required fields`);
                            return;
                        }

                        totalDonationCount += donor.individual_donations.length;
                        const donorTotal = donor.individual_donations.reduce((sum: number, d: any) => sum + d.amount, 0);
                        calculatedTotalAmount += donorTotal;

                        if (donorTotal !== donor.total_amount) {
                            errors.push(`Donor ${donor.name} total amount mismatch`);
                        }
                        if (donor.individual_donations.length !== donor.total_donations) {
                            errors.push(`Donor ${donor.name} donation count mismatch`);
                        }
                    });

                    if (calculatedTotalAmount !== donationData[0].overall_total.amount) {
                        errors.push("Overall total amount doesn't match sum of donations");
                    }
                    if (totalDonationCount !== donationData[0].overall_total.donation_count) {
                        errors.push("Overall donation count doesn't match total individual donations");
                    }
                } catch (error) {
                    errors.push("Invalid JSON format for custom donation data");
                }
            }

            return errors;
        },
        onTriggerEvent: async (event) => {
            try {
                const updateData: Record<string, unknown> = {
                    type: 'update',
                    data: {
                        current: event.effect.customVariables.current,
                        goal: event.effect.customVariables.goal,
                        recentDonations: event.effect.customVariables.recentDonationsJson ?
                            JSON.parse(event.effect.customVariables.recentDonationsJson) : []
                    }
                };

                await webServer.sendToOverlay("goal-tracker", updateData);
                return { success: true };
            } catch (error) {
                logger.error('Goal Tracker Update Error:', error);
                return { success: false };
            }
        }
    };
    return updateEffectType;
}
/**
 * Creates a Firebot effect type for updating local donation tracking data
 * - Manages individual donor records and donation history
 * - Maintains running totals and donor rankings
 * - Handles data persistence through Firebot's variable system
 * 
 * @returns {Firebot.EffectType} Effect type for local donation updates
 */
export function goalTrackerLocalUpdateEffectType() {
    interface LocalUpdateEffectModel {
        donorName: string;
        donationAmount: number;
        variableName: string;
        operation: 'add' | 'remove';
    }

    interface Donor {
        name: string;
        individual_donations: Array<{ amount: number, timestamp: string }>;
        total_amount: number;
        total_donations: number;
    }

    const localUpdateEffectType: Firebot.EffectType<LocalUpdateEffectModel> = {
        definition: {
            id: "msgg:goaltracker-local-update",
            name: "Update Goal Tracker Local Data",
            description: "Updates local donation data for Advanced Goal Tracker",
            icon: "fad fa-database",
            categories: ["overlay"],
            dependencies: [],
            triggers: {
                command: true,
                custom_script: true,
                event: true,
                manual: true
            }
        },
        optionsTemplate: `
                        <eos-container header="Donation Information" aria-label="Local Donor Data">
                            <div class="input-group" role="form" aria-label="Donation input form">
                                <firebot-radios options="{ add: 'Add Donation', remove: 'Remove Donation' }" model="effect.operation"
                                    inline="true" style="padding-bottom: 5px;" />
                                <div class="row" style="margin-bottom: 10px;">
                                    <div class="col-md-6">
                                        <firebot-input input-title="Name" model="effect.donorName" placeholder="Enter donor name"
                                            aria-label="Donor name input" aria-required="true"></firebot-input>
                                    </div>
                                    <div class="col-md-6">
                                        <firebot-input input-title="Amount" model="effect.donationAmount" placeholder="Enter donation amount"
                                            aria-label="Donation amount input" aria-required="true"></firebot-input>
                                    </div>
                                </div>
                                <firebot-input input-title="Variable Name" model="effect.variableName" placeholder="Enter variable name"
                                    aria-label="Variable name input" aria-required="true"></firebot-input>
                            </div>
                        </eos-container>
        `,
        /**
         * Processes incoming donation data by:
         * 1. Finding creating or removing donor record
         * 2. Adding or removing donations while preserving history
         * 3. Updating donor and overall totals
         * 4. Sorting donations by timestamp
         * 5. Sorting donors by total amount
         */
        onTriggerEvent: async (event) => {
            try {
                // Fetch and preserve existing data
                const response = await fetch(`http://localhost:7472/api/v1/custom-variables/${event.effect.variableName}`);
                const existingData = await response.json();
        
                let incomingData = {
                    donations: existingData?.donations || [],
                    overall_total: existingData?.overall_total || {
                        amount: 0,
                        donation_count: 0
                    }
                };
        
                const donorName = event.effect.donorName;
                const donationAmount = Number(event.effect.donationAmount);
                const timestamp = new Date().toISOString();
        
                // Remove donation from donor record
                if (event.effect.operation === 'remove') {
                    // Find donor and specific donation to remove
                    const donor = incomingData.donations.find((d: Donor) => d.name.toLowerCase() === donorName.toLowerCase());
                    if (donor) {
                        const donationIndex = donor.individual_donations.findIndex(
                            (d: { amount: number }) => Math.abs(d.amount - donationAmount) < 0.01
                        );
                        
                        if (donationIndex !== -1) {
                            // Remove the donation
                            donor.individual_donations.splice(donationIndex, 1);
                            donor.total_amount = Number((donor.total_amount - donationAmount).toFixed(2));
                            donor.total_donations -= 1;
                            incomingData.overall_total.amount = Number((incomingData.overall_total.amount - donationAmount).toFixed(2));
                            incomingData.overall_total.donation_count -= 1;
        
                            // Remove donor if no donations remain
                            if (donor.individual_donations.length === 0) {
                                incomingData.donations = incomingData.donations.filter((d: Donor) => d.name !== donor.name);

                            }
                        }
                    }
                } else {
                    // Find existing donor while preserving their history
                    let donor = incomingData.donations.find((d: Donor) => d.name.toLowerCase() === donorName.toLowerCase());
        
                    if (!donor) {
                        // Create new donor if they don't exist
                        donor = {
                            name: donorName,
                            individual_donations: [],
                            total_amount: 0,
                            total_donations: 0
                        };
                        incomingData.donations.push(donor);
                    } else {
                        // Ensure existing donor has all required properties
                        donor.individual_donations = donor.individual_donations || [];
                        donor.total_amount = donor.total_amount || 0;
                        donor.total_donations = donor.total_donations || 0;
                    }
        
                    // Add new donation while preserving existing ones
                    donor.individual_donations.push({
                        amount: donationAmount,
                        timestamp: timestamp
                    });
        
                    // Update totals while maintaining precision
                    donor.total_amount = Number((donor.total_amount + donationAmount).toFixed(2));
                    donor.total_donations += 1;
        
                    // Update overall totals while maintaining precision
                    incomingData.overall_total.amount = Number((incomingData.overall_total.amount + donationAmount).toFixed(2));
                    incomingData.overall_total.donation_count += 1;
        
                    // Sort individual donations by timestamp (newest first)
                    donor.individual_donations.sort((a: { timestamp: string }, b: { timestamp: string }) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
        
                    // Sort donors by total amount (highest first)
                    incomingData.donations.sort((a: Donor, b: Donor) => b.total_amount - a.total_amount);
                }
        
                // Save merged data back to Firebot
                await fetch(`http://localhost:7472/api/v1/custom-variables/${event.effect.variableName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ttl: 0, data: incomingData })
                });
        
                return { success: true };
            } catch (error) {
                logger.error('Error:', error);
                return { success: false };
            }
        }        
    };
    return localUpdateEffectType;
}
/**
 * Creates the main goal tracker effect type for Firebot
 * - Manages overlay configuration and display
 * - Handles integration with StreamElements and Extra Life
 * - Controls visual customization and behavior settings
 * 
 * @param {ScriptModules["resourceTokenManager"]} resourceTokenManager - Manager for handling resource paths
 * @returns {Firebot.EffectType} Main goal tracker effect type
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
        optionsController: ($scope: any, utilityService: any) => {
            // Document variable capture logic
            /**
             * Watches for changes in custom variables and extracts variable names
             * - Handles both customVariable and readFile syntax
             * - Updates corresponding variable names in the effect model
             */
            $scope.$watch('effect.customVariables.recentDonationsJson', (newValue: string) => {
                if (newValue) {
                    const match = newValue.startsWith('$customVariable[')
                        ? newValue.match(/\$customVariable\[(.*?)\]/)
                        : newValue.startsWith('$readFile[')
                            ? newValue.match(/\$readFile\[(.*?)\]/)
                            : null;

                    if (match && match[1]) {
                        $scope.effect.customVariables.jsonVariableName = match[1];
                    }
                }
            });
            // Capture Variable Name or FilePath for Current
            $scope.$watch('effect.customVariables.current', (newValue: string) => {
                if (newValue) {
                    const match = newValue.startsWith('$customVariable[')
                        ? newValue.match(/\$customVariable\[(.*?)\]/)
                        : newValue.startsWith('$readFile[')
                            ? newValue.match(/\$readFile\[(.*?)\]/)
                            : null;

                    if (match && match[1]) {
                        $scope.effect.customVariables.currentVariableName = match[1];
                    }
                }
            });
            // Capture Variable Name or FilePath for Goal
            $scope.$watch('effect.customVariables.goal', (newValue: string) => {
                if (newValue) {
                    const match = newValue.startsWith('$customVariable[')
                        ? newValue.match(/\$customVariable\[(.*?)\]/)
                        : newValue.startsWith('$readFile[')
                            ? newValue.match(/\$readFile\[(.*?)\]/)
                            : null;

                    if (match && match[1]) {
                        $scope.effect.customVariables.goalVariableName = match[1];
                    }
                }
            });
            /** Shows the overlay configuration modal */
            $scope.showOverlayInfoModal = function (overlayInstance: string) {
                utilityService.showOverlayInfoModal(overlayInstance);
            };

            /** Adds a new milestone to the tracker configuration */
            $scope.addMilestone = function () {
                if (!$scope.effect.milestones) {
                    $scope.effect.milestones = [];
                }
                $scope.effect.milestones.push({
                    title: "",
                    amount: 0
                });
            };

            /** Removes a milestone at the specified index */
            $scope.removeMilestone = function (index: number) {
                $scope.effect.milestones.splice(index, 1);
            };

            // Parse recent donations from JSON
            $scope.parseRecentDonations = function () {
                try {
                    const donationData = JSON.parse($scope.effect.customVariables.recentDonationsJson);
                    $scope.effect.customVariables.recentDonations = donationData;

                    // Update current amount and goal from the JSON data
                    if (donationData[0]?.overall_total?.amount) {
                        $scope.effect.customVariables.current = donationData[0].overall_total.amount.toString();
                    }

                    // Only update goal if milestones aren't enabled
                    if (!$scope.effect.useMilestonesAsGoals && donationData[0]?.overall_total?.goal) {
                        $scope.effect.customVariables.goal = donationData[0].overall_total.goal.toString();
                    }
                } catch (e) {
                    // Keep existing data if JSON is invalid
                }
            };

            $scope.countdownPositions = {
                "above": "Above Goal Bar",
                "below": "Below Goal Bar"
            };

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
             * Creates a Date object for time values
             * @param {number} hours - Hour value (0-23)
             * @param {number} minutes - Minute value (0-59)
             * @returns {Date} Date object set to specified time
             */
            function createTimeDate(hours: number, minutes: number): Date {
                const timeDate = new Date(1970, 0, 1);
                timeDate.setHours(hours, minutes, 0, 0);
                return timeDate;
            }

            // Example JSON data
            const exampleJson = [
                {
                    "donations": [
                        {
                            "name": "John Doe",
                            "individual_donations": [
                                {
                                    "amount": 100,
                                    "timestamp": "2024-11-06T12:30:00Z"
                                },
                                {
                                    "amount": 150.42,
                                    "timestamp": "2024-11-05T15:45:00Z"
                                },
                                {
                                    "amount": 75,
                                    "timestamp": "2024-11-08T15:45:00Z"
                                }
                            ],
                            "total_amount": 325.42,
                            "total_donations": 3
                        },
                        {
                            "name": "Jane Smith",
                            "individual_donations": [
                                {
                                    "amount": 100,
                                    "timestamp": "2024-11-06T09:20:00Z"
                                },
                                {
                                    "amount": 50,
                                    "timestamp": "2024-11-04T14:00:00Z"
                                }
                            ],
                            "total_amount": 150,
                            "total_donations": 2
                        }
                    ],
                    "overall_total": {
                        "amount": 475.42,
                        "donation_count": 5
                    }
                }
            ];
            // Copy example JSON to clipboard
            $scope.copyExampleJson = function (type = 'default') {
                const streamElementsJson = exampleJson;
                const jsonString = JSON.stringify(type === 'streamElements' ? streamElementsJson : exampleJson, null, 2);
                const textArea = document.createElement('textarea');
                textArea.value = jsonString;
                document.body.appendChild(textArea);
                textArea.select();

                try {
                    document.execCommand('copy');
                    utilityService.showInfoModal(
                        "Success: Example JSON copied to clipboard!"
                    );
                } catch (err) {
                    utilityService.showErrorModal(
                        "Failed: Example JSON not copied!"
                    );
                }

                document.body.removeChild(textArea);
            };

            $scope.showExampleJson = function (type = 'default') {
                const displayId = type === 'streamElements' ? 'streamelements-json-display' : 'example-json-display';
                const displayDiv = document.getElementById(displayId);
                if (displayDiv) {
                    const currentDisplay = displayDiv.style.display;
                    if (currentDisplay === "none") {
                        const formattedJson = JSON.stringify(exampleJson, null, 2);
                        displayDiv.textContent = formattedJson;
                        displayDiv.style.display = "block";
                        displayDiv.style.whiteSpace = 'pre';
                    } else {
                        displayDiv.style.display = "none";
                    }
                }
            };


            // Show/hide JWT Info
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
                $scope.effect.defaultDonationGoal = 550;
                $scope.effect.largestDonationTieMode = "all";
                $scope.effect.showDonationTimestamp = false;
                $scope.effect.progressBarOpacity = 1;
                $scope.effect.useMilestonesAsGoals = false;
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
                $scope.effect.customVariables = {
                    current: '0',
                    goal: '500'
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
                        customRecentMessage: "Top Row Override"
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
                    localDonationsVariable: '',
                    streamElementsVariable: '',
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
        },
        /**
         * Validates the effect configuration with the following checks:
         * - Ensures valid donation goal amount
         * - Validates StreamElements credentials if enabled
         * - Verifies custom donation data structure and integrity
         * - Checks for required variables and valid JSON format
         * 
         * @param {EffectModel} effect - The effect configuration to validate
         * @returns {string[]} Array of validation error messages
         */
        optionsValidator: (effect) => {
            const errors = [];

            if (!effect.defaultDonationGoal || effect.defaultDonationGoal <= 0) {
                errors.push("Please enter a valid donation goal amount");
            }

            // StreamElements validation
            if (effect.streamElements.useStreamElements) {
                if (!effect.streamElements.streamElementsVariable) {
                    errors.push("StreamElements Variable is required when using StreamElements integration");
                }
                if (!effect.streamElements.channelId) {
                    errors.push("StreamElements Channel ID is required");
                }
                if (!effect.streamElements.jwtToken) {
                    errors.push("StreamElements JWT Token is required");
                }
            }

            // Custom donation data validation
            if (effect.useCustomDonationData) {
                const jsonData = effect.customVariables?.recentDonationsJson;

                if (!jsonData) {
                    errors.push("Custom donation data is required when using custom donation data mode");
                    return errors;
                }

                // Skip validation if using custom variable reference
                if (!jsonData.startsWith('$customVariable[')) {
                    try {
                        const donationData = JSON.parse(jsonData);

                        // Basic structure validation
                        if (!Array.isArray(donationData) ||
                            !donationData[0]?.donations?.length ||
                            !donationData[0]?.overall_total?.amount) {
                            errors.push("Custom donation data must match the required format with donations array and overall total");
                            return errors;
                        }

                        // Data integrity validation
                        const donations = donationData[0].donations;
                        let totalDonationCount = 0;
                        let calculatedTotalAmount = 0;

                        donations.forEach((donor: any, index: number) => {
                            if (!donor.name || !Array.isArray(donor.individual_donations)) {
                                errors.push(`Donor at index ${index} missing required fields`);
                                return;
                            }

                            // Verify individual donations
                            totalDonationCount += donor.individual_donations.length;
                            const donorTotal = donor.individual_donations.reduce((sum: number, d: any) => sum + d.amount, 0);
                            calculatedTotalAmount += donorTotal;

                            // Verify donor totals match their donations
                            if (donorTotal !== donor.total_amount) {
                                errors.push(`Donor ${donor.name} total amount mismatch`);
                            }
                            if (donor.individual_donations.length !== donor.total_donations) {
                                errors.push(`Donor ${donor.name} donation count mismatch`);
                            }
                        });

                        // Verify overall totals
                        if (calculatedTotalAmount !== donationData[0].overall_total.amount) {
                            errors.push("Overall total amount doesn't match sum of donations");
                        }
                        if (totalDonationCount !== donationData[0].overall_total.donation_count) {
                            errors.push("Overall donation count doesn't match total individual donations");
                        }
                    } catch (error) {
                        errors.push("Invalid JSON format for custom donation data");
                    }
                }
            }

            return errors;
        },
        onTriggerEvent: async (event) => {
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
                mode: {
                    useMilestonesAsGoals: event.effect.useMilestonesAsGoals,
                    infoSectionCycle: event.effect.infoSectionCycle,
                    showInfoSection: event.effect.showInfoSection,
                    separateInfoColors: event.effect.separateInfoColors,
                    showDonationAnimation: event.effect.showDonationAnimation,
                    showLogoAnimation: event.effect.showLogoAnimation,
                    showDonationTimestamp: event.effect.showDonationTimestamp,
                    useCustomLargestMessage: event.effect.useCustomLargestMessage,
                    useCustomRecentMessage: event.effect.useCustomRecentMessage,
                    useCustomDonationData: event.effect.useCustomDonationData,
                    largestDonationTieMode: event.effect.largestDonationTieMode,
                    defaultDonationGoal: event.effect.defaultDonationGoal,
                    customVariables: {
                        current: event.effect.customVariables?.current || '0',
                        goal: event.effect.customVariables?.goal || event.effect.defaultDonationGoal.toString(),
                        recentDonations: event.effect.customVariables?.recentDonationsJson ?
                            JSON.parse(event.effect.customVariables.recentDonationsJson) : [],
                        jsonVariableName: event.effect.customVariables.jsonVariableName,
                        currentVariableName: event.effect.customVariables.currentVariableName,
                        goalVariableName: event.effect.customVariables.goalVariableName,
                    }
                },
                display: {
                    progressBar: {
                        hideBeforeStreamStartTime: event.effect.display.progressBar.hideBeforeStreamStartTime,
                        hideAfterStreamEndTime: event.effect.display.progressBar.hideAfterStreamEndTime,
                        showTitle: event.effect.display.progressBar.showTitle,
                        showPercentage: event.effect.display.progressBar.showPercentage,
                        opacity: event.effect.progressBarOpacity
                    },
                    countdown: {
                        countdownPosition: event.effect.display.countdown.countdownPosition,
                        showCountdown: event.effect.display.countdown.showCountdown,
                        countdownCycle: event.effect.display.countdown.countdownCycle
                    },
                    showHighlight: event.effect.display.showHighlight
                },

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
                            animation: {
                                animationHighlight: "#00B4FF",
                                animationBackgroundColorOne: "#1B2838",
                                animationBackgroundColorTwo: "#2A475E",
                                animationBorder: "#00B4FF",
                                animationText: "#ffffff",
                                animationShadow: "0 2px 4px rgba(0,0,0,0.2)"
                            }
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
                                    resourceTokenManager.storeResourcePath(event.effect.defaultLogoPath, 0) : "",
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
                timing: {
                    transition: event.effect.timing?.transition || 0.5,
                    cycleDelay: event.effect.timing?.cycleDelay || 30,
                    animationDisplay: event.effect.timing?.animationDisplay || 5,
                    animationPreTiming: event.effect.timing?.animationPreTiming || 10,
                    animationPostTiming: event.effect.timing?.animationPostTiming || 10,
                    customDonorRotationInterval: event.effect.timing?.customDonorRotationInterval || 3,
                    dataPollInterval: event.effect.timing?.dataPollInterval || 60
                },
                extraLife: {
                    useExtraLife: event.effect.extraLife.useExtraLife,
                    useExtraLifeColors: event.effect.extraLife.useExtraLifeColors,
                    extralifeDonorRotationInterval: event.effect.extraLife.extralifeDonorRotationInterval,
                    dataPollInterval: 60,
                    participantId: event.effect.extraLife.participantId || null
                },
                streamElements: {
                    useStreamElements: event.effect.streamElements.useStreamElements,
                    channelId: event.effect.streamElements.channelId,
                    jwtToken: event.effect.streamElements.jwtToken,
                    pollInterval: event.effect.streamElements.pollInterval,
                    useLocalDonations: event.effect.streamElements.useLocalDonations,
                    localDonationsVariable: event.effect.streamElements.localDonationsVariable,
                    streamElementsVariable: event.effect.streamElements.streamElementsVariable,
                    subscriptionValues: {
                        prime: event.effect.streamElements.subscriptionValues.prime,
                        tier1: event.effect.streamElements.subscriptionValues.tier1,
                        tier2: event.effect.streamElements.subscriptionValues.tier2,
                        tier3: event.effect.streamElements.subscriptionValues.tier3
                    },
                    bitsValue: event.effect.streamElements.bitsValue
                }
            };

            const data = {
                uuid: randomUUID(),
                config: config
            } as Record<string, unknown>;

            webServer.sendToOverlay("goal-tracker", data);

            return {
                success: true
            };
        },
        overlayExtension: {
            dependencies: {
                css: [],
                js: []
            },
            event: {
                name: "goal-tracker",
                /**
                 * Handles overlay events for the goal tracker
                 * - Processes new configurations by injecting template
                 * - Handles updates by dispatching custom events
                 * - Converts resource tokens to full URLs
                 * 
                 * @param {unknown} data - Event data (either EventData or GoalTrackerUpdate)
                 */
                onOverlayEvent: (data: unknown) => {
                    const event = data as EventData | GoalTrackerUpdate;

                    if ((event as EventData).config) {
                        const eventData = event as EventData;

                        // Convert resource tokens to full URLs
                        if (eventData.config.content.branding.logo.default.src) {
                            eventData.config.content.branding.logo.default.src =
                                `http://${window.location.hostname}:7472/resource/${encodeURIComponent(eventData.config.content.branding.logo.default.src)}`;
                        }
                        if (eventData.config.content.branding.logo.extraLife.src) {
                            eventData.config.content.branding.logo.extraLife.src =
                                `http://${window.location.hostname}:7472/resource/${encodeURIComponent(eventData.config.content.branding.logo.extraLife.src)}`;
                        }

                        // Inject the goal tracker template and configuration
                        fetch(`http://${window.location.hostname}:7472/integrations/goal-tracker/goal-tracker.html`)
                            .then(response => response.text())
                            .then(template => {
                                // Replace the configuration placeholder with actual config
                                const configString = JSON.stringify(eventData.config, null, 2);
                                const updatedTemplate = template.replace(
                                    /const CONFIG = \{[\s\S]*?\};/,
                                    `const CONFIG = ${configString};`
                                );
                                $("#wrapper").append(updatedTemplate);
                            });
                    } else {
                        const updateEvent = event as GoalTrackerUpdate;
                        if (updateEvent.type === 'update') {
                            window.dispatchEvent(new CustomEvent('goalTrackerUpdate', {
                                detail: updateEvent.data
                            }));
                        }
                    }
                }
            }
        }
    };
    return goalTrackerEffectType;
}