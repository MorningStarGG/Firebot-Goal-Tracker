import type { EffectType } from "@crowbartools/firebot-types";
import { logger } from "../logger";
import { LocalUpdateEffectModel } from "../types/types";
import goalManagerTemplate from "../templates/goalManager-Template.html";
import { runGoalOperation } from "../plugin-runtime";
import { goalId } from "../utility/goal-store";

export function goalTrackerManagerEffectType() {
    const localUpdateEffectType: EffectType<LocalUpdateEffectModel> = {
        definition: {
            id: "msgg:goaltracker-local-update",
            name: "Advanced Goal Manager",
            description: "Data Manager for the Advanced Goal Tracker",
            icon: "fad fa-database",
            categories: ["overlay"],
            dependencies: {},
            triggers: {
                command: true,
                custom_script: true,
                event: true,
                manual: true
            }
        },
        optionsTemplate: goalManagerTemplate,
        optionsController: ($scope: any, backendCommunicator: any) => {
            if (!$scope.effect.goalId) $scope.effect.goalId = 'default';
            if (!$scope.effect.operation) $scope.effect.operation = 'add';
            $scope.goals = [{ goalId: $scope.effect.goalId }];
            backendCommunicator.fireEventAsync('msgg:goal-tracker-list', $scope.effect.goalId).then(({ goals, selectedGoalId }: { goals: any[]; selectedGoalId: string }) => {
                $scope.$applyAsync(() => {
                    $scope.effect.goalId = selectedGoalId;
                    $scope.goals = goals;
                    if (!goals.some(goal => goal.goalId === $scope.effect.goalId)) $scope.goals.unshift({ goalId: $scope.effect.goalId });
                });
            }).catch(() => {
                $scope.$applyAsync(() => { $scope.goalListError = 'Unable to load goals. Check that the Goal Tracker plugin is enabled.'; });
            });
            $scope.selectedGoal = () => $scope.goals.find((goal: any) => goal.goalId === $scope.effect.goalId);
        },
        onTriggerEvent: async (event) => runGoalOperation(async goalManager => {
            try {
                const donorName = event.effect.donorName;
                const donationAmount = event.effect.donationAmount ? Number(event.effect.donationAmount) : undefined;
                const operation = event.effect.operation;
                const id = goalId(event.effect.goalId);
                if ((operation === 'add' || operation === 'remove') && (!Number.isFinite(donationAmount) || donationAmount! <= 0)) {
                    return { success: false, errorMessage: 'Donation amount must be finite and greater than zero' };
                }
                if (['add', 'remove', 'resetUser'].includes(operation) && !donorName?.trim()) {
                    return { success: false, errorMessage: 'Donor name is required' };
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
                        }, id);
                        break;

                    case 'remove':
                        if (!donationAmount) {
                            logger.error('Donation amount required for remove operation');
                            return { success: false };
                        }
                        const localDonations = await goalManager.getLocalDonations(id);
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
                        await goalManager.removeLocalDonation(donationToRemove.id || donationToRemove.timestamp, id);
                        break;

                    case 'resetUser':
                        await goalManager.resetUserDonations(donorName, id);
                        break;

                    case 'resetStreamElements':
                        await goalManager.resetStreamElementsData(id);
                        break;

                    case 'resetExtraLife':
                        await goalManager.resetExtraLifeData(id);
                        break;

                    case 'resetLocalData':
                        await goalManager.resetLocalData(id);
                        break;

                    case 'resetRemoteGoals':
                        await goalManager.resetRemoteGoals(id);
                        break;

                    case 'hide':
                        await goalManager.hide(id);
                        break;

                    default:
                        logger.error('Invalid operation type');
                        return { success: false };
                }

                return { success: true };
            } catch (error) {
                logger.error('Error in goal tracker local update effect:', error);
                return { success: false, errorMessage: (error as Error).message };
            }
        })
    };
    return localUpdateEffectType;
}
