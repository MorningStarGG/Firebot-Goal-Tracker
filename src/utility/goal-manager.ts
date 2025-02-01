import { ScriptModules } from '@crowbartools/firebot-custom-scripts-types';
import { JsonDB } from 'node-json-db';
import { DonationData, ProcessedExtraLifeData, ExtraLifeParticipantData, ExtraLifeDonation, StreamElementsConfig, LocalDonationData, Donation, ProcessedStreamElementsData, StreamElementsDonor, StreamElementsDonation, StreamElementsResult } from '../types/types';
import { logger } from '../logger';

/**
 * GoalManager class handles all donation-related operations including tracking,
 * processing, and synchronizing donation data from multiple sources.
 */
class GoalManager {
    private _db: JsonDB;

    /**
     * Creates a new GoalManager instance
     * @param path - Path to the database file
     * @param modules - Firebot script modules
     */
    constructor(path: string, modules: ScriptModules) {
        // @ts-ignore
        this._db = new modules.JsonDb(path, true, true);
    }

    /**
     * Rounds a number to two decimal places to ensure consistent currency handling
     * @param value - Number to round
     * @returns Rounded number
     */
    private roundToTwoDecimals(value: number): number {
        return parseFloat(value.toFixed(2));
    }

    /**
     * Safely adds two numbers while handling floating point precision issues
     * @param a - First number
     * @param b - Second number
     * @returns Sum of the two numbers, properly rounded
     */
    private safeAdd(a: number, b: number): number {
        return this.roundToTwoDecimals((a * 100 + b * 100) / 100);
    }

    /**
     * Deep comparison of two objects, handling special cases like dates
     * @param obj1 - First object to compare
     * @param obj2 - Second object to compare
     * @returns Boolean indicating if objects are equal
     */
    private isEqual(obj1: any, obj2: any): boolean {
        // Handle null/undefined cases
        if (obj1 === obj2) return true;
        if (!obj1 || !obj2) return false;

        // Handle date strings consistently
        if (typeof obj1 === 'string' && typeof obj2 === 'string') {
            const date1 = new Date(obj1).getTime();
            const date2 = new Date(obj2).getTime();
            if (!isNaN(date1) && !isNaN(date2)) {
                return date1 === date2;
            }
        }

        // Handle arrays
        if (Array.isArray(obj1) && Array.isArray(obj2)) {
            if (obj1.length !== obj2.length) return false;
            return obj1.every((item, index) => this.isEqual(item, obj2[index]));
        }

        // Handle objects
        if (typeof obj1 === 'object' && typeof obj2 === 'object') {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
            if (keys1.length !== keys2.length) return false;
            return keys1.every(key => this.isEqual(obj1[key], obj2[key]));
        }

        return obj1 === obj2;
    }

    /**
     * Processes StreamElements data to calculate totals and organize donations
     * @param seData - Raw StreamElements data
     * @param previousData - Previously processed data
     * @param currentMonth - Current month for filtering
     * @param currentYear - Current year for filtering
     * @param config - StreamElements configuration
     * @returns Processed StreamElements data
     */
    private processStreamElementsData(seData: any, previousData: any, currentMonth: number, currentYear: number, config: StreamElementsConfig): StreamElementsResult {
        let cheerTotal = 0;
        let subscriberTotal = 0;
        let tipTotal = 0;

        const subValues = config.subscriptionValues;
        const bitsValue = config.bitsValue;
        const summaryType = config.summaryType || 'monthly';

        // Function to check if a donation is within the current period
        const isInCurrentPeriod = (timestamp: string) => {
            return summaryType === 'monthly'
                ? this.isCurrentMonth(timestamp, currentMonth, currentYear)
                : this.isCurrentWeek(timestamp);
        };

        // Start with previous data but clean out old donations
        const seResult: StreamElementsResult = {
            donations: previousData?.donations
                ? previousData.donations.map((donor: StreamElementsDonor) => ({
                    ...donor,
                    // Filter out old donations for each donor
                    individual_donations: donor.individual_donations.filter(d =>
                        isInCurrentPeriod(d.timestamp)
                    )
                }))
                    // Remove donors who have no remaining donations after filtering
                    .filter((donor: StreamElementsDonor) => donor.individual_donations.length > 0)
                : [],
            overall_total: { amount: 0, donation_count: 0 }
        };

        // Recalculate totals for remaining donations
        seResult.donations.forEach(donor => {
            donor.total_amount = this.roundToTwoDecimals(
                donor.individual_donations.reduce((sum, d) => this.safeAdd(sum, d.amount), 0)
            );
            donor.total_donations = donor.individual_donations.length;
            seResult.overall_total.amount = this.safeAdd(
                seResult.overall_total.amount,
                donor.total_amount
            );
            seResult.overall_total.donation_count += donor.total_donations;
        });

        /**
         * Helper function to add a new donation to the result
         */
        const addDonation = (
            name: string,
            amount: number,
            timestamp: string,
            donationType: "bits" | "subscription" | "tip" | "local",
            subTier?: "prime" | "tier1" | "tier2" | "tier3"
        ): void => {
            let donor = seResult.donations.find((d: StreamElementsDonor) =>
                d.name.toLowerCase() === name.toLowerCase());

            if (!donor) {
                const localDonor = previousData?.localDonations?.donations.find(
                    (d: DonationData) => d.name.toLowerCase() === name.toLowerCase()
                );

                donor = {
                    name,
                    individual_donations: localDonor?.individual_donations || [],
                    total_amount: this.roundToTwoDecimals(localDonor?.total_amount || 0),
                    total_donations: localDonor?.total_donations || 0
                };
                seResult.donations.push(donor);
            }

            // Check for duplicate donations
            const duplicate = donor.individual_donations.some((d: StreamElementsDonation) =>
                d.amount === amount && d.timestamp === timestamp
            );

            if (!duplicate) {
                const numericAmount = this.roundToTwoDecimals(amount);
                donor.individual_donations.push({
                    amount: numericAmount,
                    timestamp,
                    donationType,
                    ...(subTier && { subTier })
                });
                donor.total_amount = this.safeAdd(donor.total_amount, numericAmount);
                donor.total_donations++;
                seResult.overall_total.amount = this.safeAdd(
                    seResult.overall_total.amount,
                    numericAmount
                );
                seResult.overall_total.donation_count++;
            }
        };

        // Process subscribers
        seData.data['subscriber-recent']?.forEach((sub: any) => {
            if (isInCurrentPeriod(sub.createdAt)) {
                const subValue =
                    sub.tier === '2000' ? subValues.tier2 :
                        sub.tier === '3000' ? subValues.tier3 :
                            sub.tier === 'prime' ? subValues.prime :
                                subValues.tier1;

                subscriberTotal += subValue;
                const latestGifted = seData.data['subscriber-gifted-latest'];
                const isGifted = latestGifted &&
                    latestGifted.name === sub.name &&
                    latestGifted.tier === sub.tier;
                const donorName = isGifted ? latestGifted.sender : sub.name;
                addDonation(donorName, subValue, sub.createdAt, 'subscription', sub.tier);
            }
        });

        // Process bits/cheers
        seData.data['cheer-recent']?.forEach((cheer: any) => {
            if (isInCurrentPeriod(cheer.createdAt)) {
                const cheerValue = cheer.amount * bitsValue;
                cheerTotal += cheerValue;
                addDonation(cheer.name, cheerValue, cheer.createdAt, 'bits');
            }
        });

        // Process tips/donations
        seData.data['tip-recent']?.forEach((tip: any) => {
            if (isInCurrentPeriod(tip.createdAt)) {
                const tipValue = typeof tip.amount === 'string' ? parseFloat(tip.amount) : tip.amount;
                tipTotal += tipValue;
                addDonation(tip.name, tipValue, tip.createdAt, 'tip');
            }
        });

        // Compare with period summaries and adjust if needed
        const cheerGoal = seData.data['cheer-goal']?.amount * bitsValue || 0;
        const subscriberGoal = seData.data['subscriber-goal']?.amount * subValues.tier1 || 0;
        const tipGoal = seData.data['tip-goal']?.amount || 0;

        // Add any missing amounts from summaries
        if (cheerGoal > cheerTotal) {
            seResult.overall_total.amount += cheerGoal - cheerTotal;
        }
        if (subscriberGoal > subscriberTotal) {
            seResult.overall_total.amount += subscriberGoal - subscriberTotal;
        }
        if (tipGoal > tipTotal) {
            seResult.overall_total.amount += tipGoal - tipTotal;
        }

        // Sort donations by timestamp and amount
        seResult.donations.forEach((donor: StreamElementsDonor) => {
            donor.individual_donations.sort((a: StreamElementsDonation, b: StreamElementsDonation) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
        });

        seResult.donations.sort((a: StreamElementsDonor, b: StreamElementsDonor) => b.total_amount - a.total_amount);

        return seResult;
    }

    /**
     * Checks if a given date is in the current month
     * @param dateStr - ISO date string to check
     * @param currentMonth - Month to compare against (0-11)
     * @param currentYear - Year to compare against
     * @returns Boolean indicating if date is in the current month
     */
    private isCurrentMonth(dateStr: string, currentMonth: number, currentYear: number): boolean {
        const date = new Date(dateStr);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }

    /**
     * Checks if a given date is in the current week (Sunday to Saturday)
     * @param dateStr - ISO date string to check
     * @returns Boolean indicating if date is in the current week
     */
    private isCurrentWeek(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Set to Sunday
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        return date >= weekStart && date < weekEnd;
    }

    /**
     * Checks if a given date is today
     * @param dateStr - ISO date string to check
     * @returns Boolean indicating if date is today
     */
    private isCurrentDay(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        return date.getDate() === now.getDate() &&
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear();
    }

    /**
     * Checks and resets StreamElements goal values if needed based on timing conditions.
     * Goals are reset at the start of each week (for weekly summaries) or month (for monthly summaries).
     * The function will reset all goal values (tips, cheers, subscribers, followers) to 0 using the StreamElements API.
     * 
     * @param channelId - The StreamElements channel ID to reset goals for
     * @param jwtToken - JWT authentication token for StreamElements API
     * @param summaryType - Determines reset timing: 'weekly' resets on Sundays, 'monthly' resets on the 1st
     * 
     * @remarks
     * - For weekly summaries, resets occur at the start of Sunday (UTC)
     * - For monthly summaries, resets occur at the start of the 1st day of each month (UTC)
     * - The function checks the last reset time to prevent multiple resets on the same day
     * - The reset time is stored in the database at '/goal/streamElements/lastGoalReset'
     */
    private async resetGoalValuesIfNeeded(channelId: string, jwtToken: string, summaryType: 'weekly' | 'monthly') {
        try {
            // Get current time in UTC
            const now = new Date();
            const lastResetKey = `/goal/streamElements/lastGoalReset`;

            // Check if we need to reset based on summary type
            let shouldReset = false;
            try {
                const lastReset = new Date(await this._db.getData(lastResetKey));

                if (summaryType === 'weekly') {
                    // Check if it's a new week (Sunday) and we haven't reset yet today
                    shouldReset = now.getDay() === 0 && 
                        lastReset.getDate() !== now.getDate(); 
                } else {
                    // Check if it's the first of the month and we haven't reset yet today
                    shouldReset = now.getDate() === 1 && 
                        lastReset.getDate() !== now.getDate();
                }
            } catch {
                // No last reset found, we should do a reset
                shouldReset = true;
            }

            if (shouldReset) {
                // Reset the goals via StreamElements API
                const response = await fetch(
                    `https://api.streamelements.com/kappa/v2/sessions/${channelId}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${jwtToken}`
                        },
                        body: JSON.stringify({
                            // Reset just the goal values
                            'tip-goal': { amount: 0 },
                            'cheer-goal': { amount: 0 },
                            'subscriber-goal': { amount: 0 },
                            'follower-goal': { amount: 0 }
                        })
                    }
                );

                if (!response.ok) {
                    throw new Error(`Failed to reset goals: ${response.status} ${response.statusText}`);
                }

                // Save the reset time
                await this._db.push(lastResetKey, new Date().toISOString());
                logger.info('Successfully reset StreamElements goals');
            }
        } catch (error) {
            logger.error('Error resetting StreamElements goals:', error);
            throw error;
        }
    }

    /**
      * Retrieves goal data from the database
      * @returns Goal data if found, undefined otherwise
      */
    async getGoalData() {
        try {
            return await this._db.getData('/goal');
        } catch {
            return undefined;
        }
    }

    /**
     * Resets StreamElements data to initial state
     * @throws Error if reset operation fails
     */
    async resetStreamElementsData(): Promise<void> {
        try {
            const goalState = await this.getGoalData();
            if (!goalState) return;

            // Initialize fresh StreamElements data structure
            goalState.streamElements = {
                lastUpdated: new Date().toISOString(),
                data: {
                    current: {
                        donations: [],
                        overall_total: {
                            amount: 0,
                            donation_count: 0
                        }
                    },
                    metadata: {
                        month: new Date().getMonth(),
                        year: new Date().getFullYear(),
                        lastUpdated: new Date().toISOString()
                    }
                }
            };

            await this.updateGoalData(goalState);
        } catch (error) {
            logger.error('Error resetting StreamElements data:', error);
            throw error;
        }
    }

    /**
     * Resets Extra Life data to initial state
     * @throws Error if reset operation fails
     */
    async resetExtraLifeData(): Promise<void> {
        try {
            const goalState = await this.getGoalData();
            if (!goalState) return;

            // Initialize fresh Extra Life data structure
            goalState.extraLife = {
                lastUpdated: new Date().toISOString(),
                data: {
                    sumDonations: 0,
                    fundraisingGoal: goalState.config.donationGoal,
                    donations: [],
                    metadata: {
                        lastUpdated: new Date().toISOString(),
                        participantId: goalState.config.extraLife.participantId,
                        eventID: ''
                    }
                }
            };

            await this.updateGoalData(goalState);
        } catch (error) {
            logger.error('Error resetting Extra Life data:', error);
            throw error;
        }
    }

    /**
     * Resets local donation data to initial state
     * @throws Error if reset operation fails
     */
    async resetLocalData(): Promise<void> {
        try {
            // Reset local donations to initial state
            const emptyLocalData: LocalDonationData = {
                data: {
                    donations: [],
                    overall_total: {
                        amount: 0,
                        donation_count: 0
                    },
                    metadata: {
                        lastUpdated: new Date().toISOString()
                    }
                }
            };

            await this._db.push(`/goal/localDonations`, emptyLocalData);
        } catch (error) {
            logger.error('Error resetting local donation data:', error);
            throw error;
        }
    }

    /**
     * Resets all donations for a specific user
     * @param userName - Name of the user whose donations should be reset
     * @returns Updated local donation data
     * @throws Error if user not found or operation fails
     */
    async resetUserDonations(userName: string): Promise<LocalDonationData> {
        try {
            const currentLocalData = await this.getLocalDonations();
            if (!currentLocalData?.data?.donations) {
                throw new Error('No local donation data found');
            }

            // Find the donor
            const donorIndex = currentLocalData.data.donations.findIndex(
                donor => donor.name.toLowerCase() === userName.toLowerCase()
            );

            if (donorIndex === -1) {
                throw new Error('Donor not found');
            }

            const donor = currentLocalData.data.donations[donorIndex];

            // Update overall totals by subtracting donor's contributions
            currentLocalData.data.overall_total.amount = this.roundToTwoDecimals(
                currentLocalData.data.overall_total.amount - donor.total_amount
            );
            currentLocalData.data.overall_total.donation_count -= donor.total_donations;

            // Remove the donor's data
            currentLocalData.data.donations.splice(donorIndex, 1);

            // Update metadata timestamp
            currentLocalData.data.metadata.lastUpdated = new Date().toISOString();

            // Save the updated data
            await this._db.push(`/goal/localDonations`, currentLocalData);
            return currentLocalData;
        } catch (error) {
            logger.error('Error removing all donations from user:', error);
            throw error;
        }
    }

    /**
    * Adds or updates a local donation
    * @param donation - Object containing donor name and donation amount
    * @returns Updated local donation data or null if duplicate detected
    * @throws Error if donation amount is invalid or operation fails
    */
    async updateLocalDonation(donation: { name: string, amount: number }): Promise<LocalDonationData | null> {
        try {
            if (donation.amount <= 0) {
                throw new Error('Donation amount must be greater than 0');
            }

            // Initialize or get current local data
            const currentLocalData: LocalDonationData = await this.getLocalDonations() || {
                data: {
                    donations: [],
                    overall_total: {
                        amount: 0,
                        donation_count: 0
                    },
                    metadata: {
                        lastUpdated: new Date().toISOString()
                    }
                }
            };

            // Create new donation record
            const newDonation: StreamElementsDonation = {
                amount: this.roundToTwoDecimals(donation.amount),
                timestamp: new Date().toISOString(),
                donationType: "local"
            };

            // Check for duplicate donations within a small time window (e.g., 5 seconds)
            const isDuplicate = currentLocalData.data.donations.some(donor =>
                donor.name.toLowerCase() === donation.name.toLowerCase() &&
                donor.individual_donations.some(d => {
                    const timeDiff = Math.abs(
                        new Date(d.timestamp).getTime() - new Date(newDonation.timestamp).getTime()
                    );
                    return d.amount === newDonation.amount && timeDiff < 5000; // 5 second window
                })
            );

            if (isDuplicate) {
                logger.info('Duplicate donation detected, skipping update');
                return null;
            }

            // Find or create donor record
            let donor = currentLocalData.data.donations.find(
                d => d.name.toLowerCase() === donation.name.toLowerCase()
            );

            if (!donor) {
                donor = {
                    name: donation.name,
                    individual_donations: [],
                    total_amount: 0,
                    total_donations: 0
                };
                currentLocalData.data.donations.push(donor);
            }

            // Update donor and overall totals
            donor.individual_donations.push(newDonation);
            donor.total_amount = this.safeAdd(donor.total_amount, newDonation.amount);
            donor.total_donations++;

            currentLocalData.data.overall_total.amount = this.safeAdd(
                currentLocalData.data.overall_total.amount,
                newDonation.amount
            );
            currentLocalData.data.overall_total.donation_count++;
            currentLocalData.data.metadata = {
                lastUpdated: new Date().toISOString()
            };

            await this._db.push(`/goal/localDonations`, currentLocalData);
            return currentLocalData;
        } catch (error) {
            logger.error('Error updating local donation:', error);
            throw error;
        }
    }

    /**
     * Removes a specific local donation by its timestamp
     * @param timestamp - ISO timestamp of the donation to remove
     * @returns Updated local donation data
     * @throws Error if donation not found or operation fails
     */
    async removeLocalDonation(timestamp: string): Promise<LocalDonationData> {
        try {
            const currentLocalData = await this.getLocalDonations();
            if (!currentLocalData?.data?.donations) {
                throw new Error('No local donation data found');
            }

            // Find the donation and its donor
            let donorIndex = -1;
            let donationIndex = -1;

            currentLocalData.data.donations.forEach((donor, dIndex) => {
                const donationIdx = donor.individual_donations.findIndex(d => d.timestamp === timestamp);
                if (donationIdx !== -1) {
                    donorIndex = dIndex;
                    donationIndex = donationIdx;
                }
            });

            if (donorIndex === -1 || donationIndex === -1) {
                throw new Error('Donation not found');
            }

            const donor = currentLocalData.data.donations[donorIndex];
            const removedDonation = donor.individual_donations[donationIndex];

            // Update donor totals
            donor.individual_donations.splice(donationIndex, 1);
            donor.total_amount = donor.total_amount - removedDonation.amount;
            donor.total_donations--;

            // Remove donor if they have no remaining donations
            if (donor.individual_donations.length === 0) {
                currentLocalData.data.donations.splice(donorIndex, 1);
            }

            // Update overall totals
            currentLocalData.data.overall_total.amount = currentLocalData.data.overall_total.amount - removedDonation.amount;
            currentLocalData.data.overall_total.donation_count--;
            currentLocalData.data.metadata.lastUpdated = new Date().toISOString();

            await this._db.push(`/goal/localDonations`, currentLocalData);

            return currentLocalData;
        } catch (error) {
            logger.error('Error removing local donation:', error);
            throw error;
        }
    }

    /**
     * Gets all local donations for a goal
     */
    async getLocalDonations(): Promise<LocalDonationData | undefined> {
        try {
            return await this._db.getData(`/goal/localDonations`);
        } catch {
            return undefined;
        }
    }

    /**
     * Updates the goal data in the database
     * @param data - Goal data to update
     * @returns Promise<void>
     * @throws Error if update operation fails
     */
    async updateGoalData(data: any) {
        try {
            const currentState = await this.getGoalData() || {
                uuid: data.uuid,
                config: data.config,
                overlayInstance: data.overlayInstance,
                createdAt: new Date().toISOString()
            };

            // Keep existing config if present
            if (data.config) {
                currentState.config = data.config;
            }

            // Store StreamElements data without config
            if (data.streamElements) {
                currentState.streamElements = {
                    lastUpdated: data.streamElements.lastUpdated,
                    lastGoalReset: data.streamElements.lastGoalReset,
                    data: data.streamElements.data
                };
            }

            // Store Extra Life data without config
            if (data.extraLife) {
                currentState.extraLife = {
                    lastUpdated: data.extraLife.lastUpdated,
                    data: data.extraLife.data
                };
            }

            // Store local donations data without config
            if (data.localDonations) {
                currentState.localDonations = {
                    lastUpdated: data.localDonations.lastUpdated,
                    data: data.localDonations.data
                };
            }

            // Calculate combined totals
            let totalAmount = 0;
            let allDonations: Array<Donation> = [];

            // Add local donations
            if (currentState.localDonations) {
                totalAmount = totalAmount + currentState.localDonations.total;
                allDonations = allDonations.concat(currentState.localDonations.donations);
            }

            // Add StreamElements donations
            if (currentState.streamElements?.data?.current?.overall_total) {
                totalAmount = totalAmount + currentState.streamElements.data.current.overall_total.amount;
                allDonations = allDonations.concat(currentState.streamElements.data.current.donations);
            }

            // Add Extra Life donations
            if (currentState.extraLife?.data?.sumDonations) {
                totalAmount = totalAmount + currentState.extraLife.data.sumDonations;
                allDonations = allDonations.concat(currentState.extraLife.data.donations);
            }

            // Save updated state
            await this._db.push('/goal', {
                ...currentState,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error updating goal:', error);
            throw error;
        }
    }

    /**
      * Updates StreamElements data in the database
     * @param data - StreamElements data to update
     * @returns Promise<void>
     * @throws Error if update operation fails
     */
    async updateStreamElementsData(data: any) {
        await this._db.push(`/goal/streamElements`, data);
    }

    /**
     * Updates Extra Life data in the database
     * @param data - Extra Life data to update
     * @returns Promise<void>
     * @throws Error if update operation fails
     */
    async updateExtraLifeData(data: any) {
        await this._db.push(`/goal/extraLife`, data);
    }

    /**
     * Updates a single donation in the database
     * @param donation - Object containing donor name and donation amount
     * @returns Promise<void>
     * @throws Error if update operation fails
     */
    async updateDonation(donation: { name: string, amount: number }) {
        const goalState = await this.getGoalData();
        if (!goalState) return;

        goalState.donations.push({
            ...donation,
            timestamp: new Date().toISOString()
        });
        goalState.current += donation.amount;

        await this.updateGoalData(goalState);
    }

    /**
     * Retrieves StreamElements data from the database
     * @returns Promise<any | undefined> StreamElements data if found, undefined otherwise
     */
    async syncExternalData(
        source: 'streamElements' | 'extraLife',
        newData: ProcessedStreamElementsData | ProcessedExtraLifeData
    ): Promise<boolean> {
        try {
            const goalState = await this.getGoalData();
            if (!goalState) return false;

            const currentData = goalState[source]?.data;
            const lastGoalReset = goalState[source]?.lastGoalReset;  // Preserve this value

            // Skip update if data hasn't changed
            if (currentData && this.isEqual(currentData, newData)) {
                logger.info(`${source} data unchanged, skipping update`);
                return false;
            }

            goalState[source] = {
                lastUpdated: new Date().toISOString(),
                lastGoalReset: lastGoalReset,  // Keep the lastGoalReset
                data: newData
            };

            await this.updateGoalData(goalState);
            return true;
        } catch (error) {
            logger.error(`Error syncing ${source} data:`, error);
            throw error;
        }
    }

    /**
     * Polls the StreamElements API for updated donation data
     * @param channelId - StreamElements channel ID
     * @param jwtToken - StreamElements JWT authentication token
     * @param useLocalDonations - Flag to include local donations in processing
     * @returns Processed StreamElements data or null if error occurs
     */
    async pollStreamElements(channelId: string, jwtToken: string, useLocalDonations: boolean = false) {
        try {
            const goalState = await this.getGoalData();
            if (!goalState) return null;

            // Check and reset goals if needed
            await this.resetGoalValuesIfNeeded(
                channelId,
                jwtToken,
                goalState?.config?.streamElements?.summaryType || 'monthly'
            );

            const previousData = await this.getStreamElementsData();
            const config = goalState.config.streamElements;

            // Fetch current data from StreamElements API
            const response = await fetch(
                `https://api.streamelements.com/kappa/v2/sessions/${channelId}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${jwtToken}`
                    }
                }
            );

            if (!response.ok) {
                logger.error(`StreamElements API error: ${response.status} ${response.statusText}`);
                return previousData || null;
            }

            const currentData = await response.json();
            const now = new Date();

            // Process the new data
            const processedData = this.processStreamElementsData(
                currentData,
                previousData,
                now.getMonth(),
                now.getFullYear(),
                config
            );

            // Compare with previous data before updating
            if (previousData?.current && this.isEqual(previousData.current, processedData)) {
                logger.info('StreamElements data unchanged, skipping update');
                return previousData;
            }

            // Prepare final data structure
            const finalData: ProcessedStreamElementsData = {
                current: processedData,
                metadata: {
                    month: now.getMonth(),
                    year: now.getFullYear(),
                    lastUpdated: now.toISOString()
                }
            };

            await this.syncExternalData('streamElements', finalData);
            return finalData;

        } catch (err: unknown) {
            const error = err as Error;
            logger.error('StreamElements polling error:', {
                name: error?.name || 'Unknown Error',
                message: error?.message || 'No error message available',
                stack: error?.stack || 'No stack trace available'
            });
            return null;
        }
    }

    async getStreamElementsData() {
        try {
            const goalState = await this.getGoalData();
            return goalState?.streamElements?.data;
        } catch {
            return undefined;
        }
    }

    /**
     * Polls the Extra Life API for updated donation data
     * @param participantId - Extra Life participant ID
     * @returns Processed Extra Life data or null if error occurs
     */
    async pollExtraLife(participantId: string | null): Promise<ProcessedExtraLifeData | null> {
        if (!participantId) {
            logger.info('Extra Life polling skipped - no participant ID provided');
            return null;
        }

        try {
            const goalState = await this.getGoalData();
            const previousData = await this.getExtraLifeData();

            // Check if participant ID has changed
            const hasParticipantChanged = previousData &&
                previousData.metadata.participantId !== participantId;

            if (hasParticipantChanged) {
                logger.info(`Participant ID changed from ${previousData.metadata.participantId} to ${participantId}. Clearing previous donations.`);
            }

            // Fetch participant data
            const participantResponse = await fetch(
                `https://www.extra-life.org/api/participants/${participantId}`
            );
            if (!participantResponse.ok) {
                logger.error(`Extra Life participant API error: ${participantResponse.status}`);
                return previousData || null;
            }
            const participantData = await participantResponse.json() as ExtraLifeParticipantData & {
                eventID: string;
            };

            // Only compare data if participant hasn't changed
            if (!hasParticipantChanged && previousData &&
                previousData.sumDonations === participantData.sumDonations &&
                previousData.fundraisingGoal === participantData.fundraisingGoal &&
                previousData.metadata.eventID === participantData.eventID) {
                logger.info('Extra Life data unchanged, skipping update');
                return previousData;
            }

            // Fetch donations
            const donationsResponse = await fetch(
                `https://www.extra-life.org/api/participants/${participantId}/donations`
            );
            if (!donationsResponse.ok) {
                logger.error(`Extra Life donations API error: ${donationsResponse.status}`);
                return previousData || null;
            }
            const donations = await donationsResponse.json() as any[];

            // Process and validate the data
            const processedData: ProcessedExtraLifeData = {
                sumDonations: participantData.sumDonations || 0,
                fundraisingGoal: participantData.fundraisingGoal || goalState.config.donationGoal,
                donations: [],
                metadata: {
                    lastUpdated: new Date().toISOString(),
                    participantId: participantId,
                    eventID: participantData.eventID
                }
            };

            // Process donations for current event only
            const validDonations = donations.map((donation): ExtraLifeDonation => ({
                amount: donation.amount,
                displayName: donation.displayName || 'Anonymous',
                message: donation.message || '',
                donationID: donation.donationID,
                createdDateUTC: donation.createdDateUTC,
                eventID: donation.eventID
            })).filter(donation => donation.eventID === participantData.eventID);

            // If we have previous data and participant hasn't changed, merge while respecting event ID
            if (previousData?.donations && !hasParticipantChanged) {
                const previousValidDonations = previousData.donations.filter(donation =>
                    donation.eventID === participantData.eventID
                );

                // Track existing donations to avoid duplicates
                const existingDonationIds = new Set(previousValidDonations.map(d => d.donationID));

                // Add new donations to the newDonations array
                const newDonations = validDonations.filter(donation =>
                    !existingDonationIds.has(donation.donationID)
                );

                if (newDonations.length > 0) {
                    processedData.newDonations = newDonations;
                }

                // Combine previous and new donations, removing duplicates
                processedData.donations = [
                    ...previousValidDonations,
                    ...validDonations.filter(donation => !existingDonationIds.has(donation.donationID))
                ];
            } else {
                // If participant changed or no previous donations, use only new donations
                processedData.donations = validDonations;
                if (validDonations.length > 0) {
                    processedData.newDonations = validDonations;
                }
            }

            // Sort donations by date
            processedData.donations.sort((a, b) =>
                new Date(b.createdDateUTC).getTime() - new Date(a.createdDateUTC).getTime()
            );

            // Store the updated data
            await this.syncExternalData('extraLife', processedData);
            return processedData;

        } catch (err: unknown) {
            const error = err as Error;
            logger.error('Extra Life polling error:', {
                name: error?.name || 'Unknown Error',
                message: error?.message || 'No error message available',
                stack: error?.stack || 'No stack trace available'
            });
            return null;
        }
    }

    // Update the getExtraLifeData method to use proper typing:
    async getExtraLifeData(): Promise<ProcessedExtraLifeData | undefined> {
        try {
            const goalState = await this.getGoalData();
            return goalState?.extraLife?.data;
        } catch {
            return undefined;
        }
    }

}

export let goalManager: GoalManager;

export function createGoalManager(path: string, modules: ScriptModules): GoalManager {
    if (!goalManager) {
        goalManager = new GoalManager(path, modules);
    }
    return goalManager;
}