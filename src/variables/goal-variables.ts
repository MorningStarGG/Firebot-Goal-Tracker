import { ReplaceVariable } from "@crowbartools/firebot-custom-scripts-types/types/modules/replace-variable-manager";
import { goalManager } from "../utility/goal-manager";

/**
 * Variable that checks if a specific donation exists for a given username and amount.
 * Used to verify individual donations in the system.
 */
export const goalDonationCheckVariable: ReplaceVariable = {
    definition: {
        handle: "goalDonation",
        description: "Checks if a donation exists for specific username and amount",
        usage: "goalDonation[username, amount]",
        examples: [
            {
                usage: "goalDonation[MorningStarGG, 5]",
                description: "Returns true if MorningStarGG donated $5"
            }
        ],
        possibleDataOutput: ["bool"]
    },
    evaluator: async (_, username: string, amount: string) => {
        // Retrieve local donation data
        const localDonations = await goalManager.getLocalDonations();
        if (!localDonations?.data?.donations) return false;

        // Find donor by case-insensitive username match
        const donor = localDonations.data.donations.find(
            d => d.name.toLowerCase() === username.toLowerCase()
        );

        if (!donor) return false;

        // Check if donor has made a donation of the specified amount
        const donationAmount = parseFloat(amount);
        return donor.individual_donations.some(
            donation => donation.amount === donationAmount
        );
    }
};

/**
 * Variable that provides goal information with configurable display options.
 * Can show current amount, goal amount, percentage, and various time-related information.
 */
export const goalInfoVariable: ReplaceVariable = {
    definition: {
        handle: "goalInfo",
        description: "Gets goal amounts with configurable display options",
        usage: "goalInfo[displays?]",
        examples: [
            {
                usage: "goalInfo",
                description: "Shows everything (default: $500/$1000 (50%))"
            },
            {
                usage: "goalInfo[amount]",
                description: "Shows just current amount (e.g. 500)"
            },
            {
                usage: "goalInfo[percent]",
                description: "Shows just percentage (e.g. 50%)"
            },
            {
                usage: "goalInfo[goal]",
                description: "Shows just goal amount (e.g. 1000)"
            },
            {
                usage: "goalInfo[amount, goal]",
                description: "Shows current and goal (e.g. $500/$1000)"
            },
            {
                usage: "goalInfo[time]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended 1y 2m 8d 7h 2m 6s format. Cannot be used with other options"
            },
            {
                usage: "goalInfo[time, zeroHours]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended with zero-padded hours (1y 2m 8d 07h 2m 6s)"
            },
            {
                usage: "goalInfo[time, zeroMinutes, zeroSeconds]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended with zero-padded minutes and seconds (1y 2m 8d 7h 02m 06s)"
            },
            {
                usage: "goalInfo[time, zeroDays, zeroHours, zeroMinutes]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended with multiple zero-padded units (1y 2m 08d 07h 02m 6s)"
            },
            {
                usage: "goalInfo[time, months]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in months only (14)"
            },
            {
                usage: "goalInfo[time, days]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in days only (435)"
            },
            {
                usage: "goalInfo[time, hours]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in hours only (10440)"
            },
            {
                usage: "goalInfo[time, minutes]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in minutes only (626400)"
            },
            {
                usage: "goalInfo[time, seconds]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in seconds only (37584000)"
            },
            {
                usage: "goalInfo[timeCode]",
                description: "Shows time until stream starts, remaining stream time, or time since stream ended in YY:MM:DD:HH:MM:SS format. Cannot be used with other options"
            },
            {
                usage: "goalInfo[timeFormatted]",
                description: "Shows time in full text format (36 hours, 12 minutes, 30 seconds)"
            }
        ],
        possibleDataOutput: ["text", "number"]
    },
    evaluator: async (_, ...params: string[]) => {
        try {
            // Fetch current goal state data
            const goalState = await goalManager.getGoalData();
            if (!goalState) return "0";

            // Get currency symbol from config or default to '$'
            const currencySymbol = goalState.config?.content?.templates?.donations?.currencySymbol || '$';

            // Convert all display options to lowercase and remove empty strings
            const displayOpts = new Set(
                params.map((opt: string) => opt.toLowerCase()).filter(Boolean)
            );

            // Validate timecode display options
            if (displayOpts.has('timeCode') && displayOpts.size > 1) {
                return "Timecode display cannot be combined with other options";
            }

            // Handle time display formatting
            if (displayOpts.has('time')) {
                const timeUnitFlags = ['months', 'days', 'hours', 'minutes', 'seconds'];
                const zeroPadFlags = ['zeroYears', 'zeroMonths', 'zeroDays', 'zeroHours', 'zeroMinutes', 'zeroSeconds'];
                const validTimeFlags = [...timeUnitFlags, ...zeroPadFlags];

                // Check if any invalid flags are present
                const invalidFlags = Array.from(displayOpts).filter(opt =>
                    opt !== 'time' && !validTimeFlags.includes(opt));

                if (invalidFlags.length > 0) {
                    return "Time display can only be combined with unit conversion or zero-padding options";
                }

                // Check for invalid combination of unit conversion and zero padding
                const hasUnitFlag = timeUnitFlags.some(flag => displayOpts.has(flag));
                const hasZeroFlag = zeroPadFlags.some(flag => displayOpts.has(flag));
                if (hasUnitFlag && hasZeroFlag) {
                    return "Cannot combine unit conversion with zero-padding options";
                }

                const now = new Date();
                const startTime = new Date(`${goalState.config.streamInfo.startDate} ${goalState.config.streamInfo.startTime}`);
                const endTime = new Date(`${goalState.config.streamInfo.endDate} ${goalState.config.streamInfo.endTime}`);

                let timeDiff: number;
                if (now < startTime) {
                    timeDiff = startTime.getTime() - now.getTime();
                } else if (now >= startTime && now < endTime) {
                    timeDiff = endTime.getTime() - now.getTime();
                } else {
                    timeDiff = now.getTime() - endTime.getTime();
                }

                // Handle single unit conversions if requested
                if (hasUnitFlag) {
                    if (displayOpts.has('months')) return Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 30));
                    if (displayOpts.has('days')) return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
                    if (displayOpts.has('hours')) return Math.floor(timeDiff / (1000 * 60 * 60));
                    if (displayOpts.has('minutes')) return Math.floor(timeDiff / (1000 * 60));
                    if (displayOpts.has('seconds')) return Math.floor(timeDiff / 1000);
                }

                // Standard time display with optional zero padding
                const seconds = Math.floor((timeDiff / 1000) % 60);
                const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
                const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
                const days = Math.floor((timeDiff / (1000 * 60 * 60 * 24)) % 30);
                const months = Math.floor((timeDiff / (1000 * 60 * 60 * 24 * 30)) % 12);
                const years = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 365));

                // Format time units with optional zero padding
                const formatUnit = (value: number, unit: string) => {
                    const unitFlag = `zero${unit.charAt(0).toUpperCase() + unit.slice(1)}`;
                    return displayOpts.has(unitFlag) ? value.toString().padStart(2, '0') : value.toString();
                };

                // Build time string with appropriate units
                const parts: string[] = [];
                if (years > 0) parts.push(`${formatUnit(years, 'years')}y`);
                if (months > 0) parts.push(`${formatUnit(months, 'months')}m`);
                if (days > 0) parts.push(`${formatUnit(days, 'days')}d`);
                if (hours > 0) parts.push(`${formatUnit(hours, 'hours')}h`);
                if (minutes > 0) parts.push(`${formatUnit(minutes, 'minutes')}m`);
                if (seconds > 0) parts.push(`${formatUnit(seconds, 'seconds')}s`);

                if (parts.length === 0) parts.push('0s');
                return parts.join(' ');
            }

            // Handle timecode display format (YY:MM:DD:HH:MM:SS)
            if (displayOpts.has("timeCode")) {
                const now = new Date();
                const startTime = new Date(`${goalState.config.streamInfo.startDate} ${goalState.config.streamInfo.startTime}`);
                const endTime = new Date(`${goalState.config.streamInfo.endDate} ${goalState.config.streamInfo.endTime}`);

                let timeDiff: number;
                if (now < startTime) {
                    timeDiff = startTime.getTime() - now.getTime();
                } else if (now >= startTime && now < endTime) {
                    timeDiff = endTime.getTime() - now.getTime();
                } else {
                    timeDiff = now.getTime() - endTime.getTime();
                }

                const seconds = Math.floor((timeDiff / 1000) % 60).toString().padStart(2, '0');
                const minutes = Math.floor((timeDiff / (1000 * 60)) % 60).toString().padStart(2, '0');
                const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
                const days = Math.floor((timeDiff / (1000 * 60 * 60 * 24)) % 30).toString().padStart(2, '0');
                const months = Math.floor((timeDiff / (1000 * 60 * 60 * 24 * 30)) % 12).toString().padStart(2, '0');
                const years = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 365)).toString().padStart(2, '0');

                return `${years}:${months}:${days}:${hours}:${minutes}:${seconds}`;
            }

            // Handle formatted time display (e.g., "2 hours, 30 minutes")
            if (displayOpts.has("timeFormatted")) {
                const now = new Date();
                const startTime = new Date(`${goalState.config.streamInfo.startDate} ${goalState.config.streamInfo.startTime}`);
                const endTime = new Date(`${goalState.config.streamInfo.endDate} ${goalState.config.streamInfo.endTime}`);

                let timeDiff: number;
                if (now < startTime) {
                    timeDiff = startTime.getTime() - now.getTime();
                } else if (now >= startTime && now < endTime) {
                    timeDiff = endTime.getTime() - now.getTime();
                } else {
                    timeDiff = now.getTime() - endTime.getTime();
                }

                const seconds = Math.floor((timeDiff / 1000) % 60);
                const minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
                const hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
                const days = Math.floor((timeDiff / (1000 * 60 * 60 * 24)) % 30);
                const months = Math.floor((timeDiff / (1000 * 60 * 60 * 24 * 30)) % 12);
                const years = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 365));

                const parts: string[] = [];
                if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
                if (months > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
                if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
                if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
                if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
                if (seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);

                if (parts.length === 0) parts.push('0 seconds');
                return parts.join(', ');
            }

            // Handle regular goal display options
            if (!displayOpts.has("time")) {
                // Default to showing everything if no options specified
                if (displayOpts.size === 0) {
                    displayOpts.add("amount");
                    displayOpts.add("goal");
                    displayOpts.add("percent");
                }
            }

            // Calculate current progress and goal amounts
            let current = 0;
            let goal: number;

            // Determine source for current amount (ExtraLife, StreamElements, or local)
            if (goalState.config.extraLife.useExtraLife) {
                current = goalState.extraLife?.data?.sumDonations || 0;
                goal = goalState.extraLife?.data?.fundraisingGoal || goalState.config.donationGoal;
            } else {
                if (goalState.config.streamElements.useStreamElements) {
                    current = goalState.streamElements?.data?.current?.overall_total?.amount || 0;
                } else {
                    current = goalState.localDonations?.data?.overall_total?.amount || 0;
                }

                // Check if using milestones as goals
                if (goalState.config.mode.useMilestonesAsGoals &&
                    Array.isArray(goalState.config.content.milestones) &&
                    goalState.config.content.milestones.length > 0) {
                    const nextMilestone = goalState.config.content.milestones
                        .find((m: { title: string; amount: number }) => m.amount > current);
                    goal = nextMilestone?.amount || goalState.config.donationGoal;
                } else {
                    goal = goalState.config.donationGoal;
                }
            }

            // Calculate percentage progress
            const percentage = goal > 0 ? Math.round((current / goal) * 100) : 0;

            // Handle single display options
            if (displayOpts.size === 1) {
                if (displayOpts.has("amount")) return `${currencySymbol}${current}`;
                if (displayOpts.has("goal")) return `${currencySymbol}${goal}`;
                if (displayOpts.has("percent")) return `${percentage}%`;
            }

            // Format combined display
            const parts = [];
            if (displayOpts.has("amount")) parts.push(`${currencySymbol}${current}`);
            if (displayOpts.has("goal")) parts.push(`${currencySymbol}${goal}`);
            if (displayOpts.has("percent")) parts.push(`(${percentage}%)`);

            return parts.join("/");
        } catch (error) {
            console.error('Error in goalAmount variable:', error);
            return "0";
        }
    }
};

/**
 * Variable that provides milestone information with configurable display options.
 * Can show individual milestone details or lists of milestones with various formatting options.
 */
export const goalMilestonesVariable: ReplaceVariable = {
    definition: {
        handle: "goalMilestones",
        description: "Gets milestone information with configurable display options",
        usage: "goalMilestones[display?]",
        examples: [
            {
                usage: "goalMilestones",
                description: "Shows everything (default: Milestone Name: $500/$1000 (50%))"
            },
            {
                usage: "goalMilestones[amount]",
                description: "Shows just current amount (e.g. 500)"
            },
            {
                usage: "goalMilestones[goal]",
                description: "Shows milestone target amount (e.g. 1000)"
            },
            {
                usage: "goalMilestones[percent]",
                description: "Shows just percentage (e.g. 50%)"
            },
            {
                usage: "goalMilestones[name]",
                description: "Shows just milestone name"
            },
            {
                usage: "goalMilestones[all]",
                description: "Lists all milestones with their progress"
            },
            {
                usage: "goalMilestones[1-3]",
                description: "Shows milestones 1 through 3"
            },
            {
                usage: "goalMilestones[3-7, amount, percent]",
                description: "Shows current amount and percentage for milestones 3-7"
            },
            {
                usage: "goalMilestones[next]",
                description: "Shows next milestone details"
            },
            {
                usage: "goalMilestones[previous]",
                description: "Shows previous milestone details"
            }
        ],
        possibleDataOutput: ["text", "number"]
    },
    evaluator: async (_, ...params: string[]) => {
        try {
            // Retrieve goal state and validate milestone configuration
            const goalState = await goalManager.getGoalData();
            if (!goalState?.config?.content?.milestones) return "No milestones configured";

            // Get currency symbol from config or use default '$'
            const currencySymbol = goalState.config?.content?.templates?.default?.donations?.currencySymbol || '$';

            // Initialize display options and range parameters
            const displayOpts = new Set<string>();  // Tracks which elements to display (amount, goal, percent, etc.)
            let rangeStart: number | null = null;   // Start index for milestone range (0-based)
            let rangeEnd: number | null = null;     // End index for milestone range (0-based)

            // Process parameters to separate range from display options
            params.forEach(param => {
                // Check if parameter is a range specification (e.g., "1-3")
                const rangeParts = param.match(/^(\d+)-(\d+)$/);
                if (rangeParts) {
                    rangeStart = parseInt(rangeParts[1]) - 1; // Convert to 0-based index
                    rangeEnd = parseInt(rangeParts[2]) - 1;
                } else {
                    // If not a range, treat as display option
                    displayOpts.add(param.toLowerCase());
                }
            });

            // Default to showing everything if no display options specified
            if (displayOpts.size === 0 || (displayOpts.size === 1 && (displayOpts.has("all") || displayOpts.has("next") || displayOpts.has("previous")))) {
                displayOpts.add('name');
                displayOpts.add('amount');
                displayOpts.add('goal');
                displayOpts.add('percent');
            }

            // Determine current donation amount from configured source
            let currentAmount = 0;
            if (goalState.config.extraLife.useExtraLife) {
                // ExtraLife integration is enabled
                currentAmount = goalState.extraLife?.data?.sumDonations || 0;
            } else if (goalState.config.streamElements.useStreamElements) {
                // StreamElements integration is enabled
                currentAmount = goalState.streamElements?.data?.current?.overall_total?.amount || 0;
            } else {
                // Using local donation tracking
                currentAmount = goalState.localDonations?.data?.overall_total?.amount || 0;
            }

            const milestones = goalState.config.content.milestones;

            /**
             * Formats the display of a single milestone based on selected display options.
             * 
             * @param milestone - Object containing milestone title and target amount
             * @param currentAmt - Current donation amount progress
             * @returns Formatted string representation of milestone progress
             */
            const formatMilestoneDisplay = (milestone: { title: string; amount: number }, currentAmt: number) => {
                // Calculate progress percentage, capped at 100%
                const percent = Math.min(Math.round((currentAmt / milestone.amount) * 100), 100);
                const parts = [];

                // Build display string based on selected options
                if (displayOpts.has('name')) {
                    parts.push(milestone.title);
                }

                const amountParts = [];
                if (displayOpts.has('amount')) {
                    amountParts.push(`${currencySymbol}${currentAmt}`);
                }
                if (displayOpts.has('goal')) {
                    amountParts.push(`${currencySymbol}${milestone.amount}`);
                }
                if (amountParts.length > 0) {
                    parts.push(amountParts.join('/'));
                }

                if (displayOpts.has('percent')) {
                    parts.push(`(${percent}%)`);
                }

                return parts.join(': ');
            };

            // Handle range display if specified
            if (rangeStart !== null && rangeEnd !== null) {
                if (rangeStart < 0 || rangeEnd >= milestones.length || rangeStart > rangeEnd) {
                    return "Invalid milestone range";
                }

                const selectedMilestones = milestones.slice(rangeStart, rangeEnd + 1);
                return selectedMilestones.map((m: { title: string; amount: number }) =>
                    formatMilestoneDisplay(m, currentAmount)).join(" | ");
            }

            // Validate exclusive display options (all, next, previous)
            const exclusiveOpts = ['all', 'next', 'previous'].filter(opt => displayOpts.has(opt));
            if (exclusiveOpts.length > 1) {
                return "Cannot combine all, next, or previous options";
            }

            // Handle 'all' milestones listing
            if (displayOpts.has("all")) {
                return milestones.map((m: { title: string; amount: number }) =>
                    formatMilestoneDisplay(m, currentAmount)).join(" | ");
            }

            // Find current milestone index for next/previous navigation
            const currentIndex = milestones.findIndex((m: { title: string; amount: number }) =>
                currentAmount <= m.amount);

            // Handle 'next' milestone
            if (displayOpts.has("next")) {
                if (currentIndex === -1 || currentIndex >= milestones.length - 1) {
                    return "No more milestones";
                }
                const nextMilestone = milestones[currentIndex + 1];
                return formatMilestoneDisplay(nextMilestone, currentAmount);
            }

            // Handle 'previous' milestone
            if (displayOpts.has("previous")) {
                if (currentIndex <= 0) return "No previous milestones";
                const prevIndex = currentIndex === -1 ? milestones.length - 1 : currentIndex - 1;
                const prevMilestone = milestones[prevIndex];
                return formatMilestoneDisplay(prevMilestone, currentAmount);
            }

            // Default: display current active milestone
            const currentMilestone = currentIndex === -1 ?
                milestones[milestones.length - 1] :
                milestones[currentIndex];

            if (!currentMilestone) return "No active milestone";
            return formatMilestoneDisplay(currentMilestone, currentAmount);

        } catch (error) {
            console.error('Error in milestone variable:', error);
            return "Error retrieving milestone data";
        }
    }
};