import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import { logger } from "../logger";
import { LocalUpdateEffectModel } from "../types/types";
import goalManagerTemplate from "../templates/goalManager-Template.html";
import { goalManager } from "../utility/goal-manager";

export function goalTrackerManagerEffectType() {
    const localUpdateEffectType: Firebot.EffectType<LocalUpdateEffectModel> = {
        definition: {
            id: "msgg:goaltracker-local-update",
            name: "Advanced Goal Manager",
            description: "Data Manager for the Advanced Goal Tracker",
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
        optionsTemplate: goalManagerTemplate,
        onTriggerEvent: async (event) => {
            try {
                const donorName = event.effect.donorName;
                const donationAmount = event.effect.donationAmount ? Number(event.effect.donationAmount) : undefined;
                const operation = event.effect.operation;

                if (!goalManager) {
                    logger.error('Goal manager not initialized');
                    return { success: false };
                }

                switch (operation) {
                    case 'add':
                        if (!donationAmount) {
                            logger.error('Donation amount required for add operation');
                            return { success: false };
                        }
                        await goalManager.updateLocalDonation({
                            name: donorName,
                            amount: donationAmount
                        });
                        break;

                    case 'remove':
                        if (!donationAmount) {
                            logger.error('Donation amount required for remove operation');
                            return { success: false };
                        }
                        const localDonations = await goalManager.getLocalDonations();
                        if (!localDonations?.data?.donations) {
                            logger.error('Local donations data not found');
                            return { success: false };
                        }
                        const donor = localDonations.data.donations.find(
                            d => d.name.toLowerCase() === donorName.toLowerCase()
                        );
                        if (!donor) {
                            logger.error('Donor not found for removal');
                            return { success: false };
                        }
                        const donationToRemove = donor.individual_donations.find(
                            d => Math.abs(d.amount - donationAmount) < 0.01
                        );
                        if (!donationToRemove) {
                            logger.error('Donation not found for removal');
                            return { success: false };
                        }
                        await goalManager.removeLocalDonation(donationToRemove.timestamp);
                        break;

                    case 'resetUser':
                        await goalManager.resetUserDonations(donorName);
                        break;

                    case 'resetStreamElements':
                        await goalManager.resetStreamElementsData();
                        break;

                    case 'resetExtraLife':
                        await goalManager.resetExtraLifeData();
                        break;

                    case 'resetLocalData':
                        await goalManager.resetLocalData();
                        break;

                    default:
                        logger.error('Invalid operation type');
                        return { success: false };
                }

                return { success: true };
            } catch (error) {
                logger.error('Error in goal tracker local update effect:', error);
                return { success: false };
            }
        }
    };
    return localUpdateEffectType;
}