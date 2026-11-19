/**
 * Goal Tracking System Type Definitions
 */

// Base Types
export interface DateTimeInfo {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

// Common Types
interface BaseTotal {
  amount: number;
  donation_count: number;
}

interface BaseDonation {
  amount: number;
  timestamp: string;
}

// Donation System
export interface Donation {
  name: string;
  amount: number;
  timestamp: string;
  individual_donations: BaseDonation[];
  total_amount: number;
  total_donations: number;
}

export interface StreamElementsDonation extends IndividualDonation { }
export interface IndividualDonation extends BaseDonation {
  id?: string;
  donationType?: 'bits' | 'subscription' | 'tip' | 'local';
  subTier?: 'prime' | 'tier1' | 'tier2' | 'tier3';
}

export interface DonationData {
  name: string;
  individual_donations: IndividualDonation[];
  total_amount: number;
  total_donations: number;
}

export interface ProcessedData {
  donations: DonationData[];
  overall_total: BaseTotal;
}

// Visual Configuration
interface BaseVisualConfig {
  hideBeforeStreamStartTime: boolean;
  hideAfterStreamEndTime: boolean;
  showTitle: boolean;
  showPercentage: boolean;
  opacity?: number;
}

export interface ColorScheme {
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
}

export interface AnimationBackground {
  style: 'none' | 'solid' | 'gradient' | 'centered';
  colorOne: string;
  colorTwo: string;
}

export interface AnimationStyle {
  headerBackground?: AnimationBackground;
  subheaderBackground?: AnimationBackground;
  animationBackgroundStyle?: AnimationBackground['style'];
  animationHighlight: string;
  animationBorder: string;
  animationText: string;
  animationShadow: string;
  animationBackgroundColorOne: string;
  animationBackgroundColorTwo: string;
}

// Display Configuration
export interface WidgetGaps { top: number; bottom: number; left: number; right: number }
export interface DisplayConfig {
  fixedSectionWidths?: boolean;
  sizing?: { width: number; scale: number; autoWidth?: boolean };
  gaps?: WidgetGaps;
  progressBar: BaseVisualConfig;
  countdown: {
    countdownPosition: string;
    showCountdown: boolean;
    countdownCycle: boolean;
  };
  showHighlight: boolean;
  infoSection: {
    infoPosition: 'above' | 'below';
    /** Legacy info-only preference, migrated to display.fixedSectionWidths. */
    fixedWidth?: boolean;
  };
}

// Templates
interface BaseTemplates {
  streamBegins: string;
  streamRunning: string;
  streamEnded: string;
  progressBar: string;
  heading: string;
  subheading: string;
}

export interface ThemeTemplates {
  titles: BaseTemplates;
  donations: {
    noDonations: string;
    defaultDonorName: string;
    largestDonationFormat: string;
    donationFormat: string;
    supportMessage: string;
    recentDonations: string;
    customLargestMessage: string;
    customRecentMessage: string;
    currencySymbol: string;
  };
  colors: ColorScheme;
  animation: AnimationStyle;
}

// Platform Integrations
export interface StreamElementsConfig {
  useStreamElements: boolean;
  channelId: string;
  jwtToken: string;
  pollInterval: number;
  useLocalDonations: boolean;
  summaryType: 'monthly' | 'weekly';
  localDonationsPeriod: 'all' | 'daily' | 'weekly' | 'monthly';
  subscriptionValues: {
    prime: number;
    tier1: number;
    tier2: number;
    tier3: number;
  };
  bitsValue: number;
  autoReset?: boolean;
}

export interface ExtraLifeConfig {
  useExtraLife: boolean;
  useExtraLifeColors: boolean;
  extralifeDonorRotationInterval: number;
  dataPollInterval: number;
  participantId: string | null;
}

// Feature Configuration
export interface FeatureFlags {
  useMilestonesAsGoals: boolean;
  milestoneCycle: boolean;
  milestoneCycleMode: 'all' | 'next';
  showCompletedMilestones: boolean;
  infoSectionCycle: boolean;
  showInfoSection: boolean;
  separateInfoColors: boolean;
  showDonationAnimation: boolean;
  showLogoAnimation: boolean;
  showDonationTimestamp: boolean;
  useCustomLargestMessage: boolean;
  useCustomRecentMessage: boolean;
  largestDonationTieMode: 'all' | 'recent';
}

// Main Configuration Types
export interface GoalTrackerConfig {
  goalId: string;
  streamInfo: DateTimeInfo;
  donationGoal: number;
  mode: FeatureFlags;
  display: DisplayConfig;
  content: {
    milestones: Array<{
      title: string;
      amount: number;
    }>;
    templates: {
      extraLife: ThemeTemplates;
      default: ThemeTemplates;
    };
    branding: {
      logo: {
        extraLife: {
          src: string;
          alt: string;
          styles: Record<string, string>;
        };
        default: {
          src: string;
          resourcePath?: string;
          alt: string;
          styles: Record<string, string>;
        };
      };
    };
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
  extraLife: ExtraLifeConfig;
  streamElements: StreamElementsConfig;
  position: string;
  customCoords: {
    top: number | null;
    bottom: number | null;
    left: number | null;
    right: number | null;
  };
}

// Effect and Update Types
export interface EffectModel extends FeatureFlags {
  goalId?: string;
  widgetWidth?: number;
  widgetScale?: number;
  autoWidgetWidth?: boolean;
  overlayGaps?: WidgetGaps;
  overlayInstance: string;
  startDate: string | Date;
  startTime: string | Date;
  endDate: string | Date;
  endTime: string | Date;
  goalAmount: number;
  donationGoal: number;
  progressBarOpacity: number;
  defaultLogoPath: string;
  milestones: Array<{
    title: string;
    amount: number;
  }>;
  templates: ThemeTemplates;
  display: DisplayConfig;
  timing: GoalTrackerConfig['timing'];
  extraLife: ExtraLifeConfig;
  streamElements: StreamElementsConfig;
  position: string;
  customCoords: GoalTrackerConfig['customCoords'];
}

export interface GoalTrackerUpdate {
  type: 'update';
  goalId: string;
  uuid: string;
  revision: number;
  data: GoalUpdateData;
  overlayInstance?: string;
}

export interface GoalUpdateData {
  localDonations?: LocalDonationData;
  streamElements?: ProcessedStreamElementsData;
  extraLife?: ProcessedExtraLifeData;
}

// Event and Update Types
export interface LocalUpdateEffectModel {
  goalId?: string;
  donorName: string;
  donationAmount: number;
  operation: 'add' | 'remove' | 'resetUser' | 'resetStreamElements' | 'resetExtraLife' | 'resetLocalData' | 'resetRemoteGoals' | 'hide';
}

export interface EventData {
  type: 'show';
  goalId: string;
  uuid: string;
  overlayInstance: string;
  config: GoalTrackerConfig;
  data: GoalUpdateData;
  revision: number;
}

export type GoalOverlayEvent = EventData | GoalTrackerUpdate | {
  type: 'remove';
  goalId: string;
  revision: number;
};

// Platform-Specific Data Types
export interface ExtraLifeDonation {
  amount: number;
  displayName: string;
  message?: string;
  donationID: string;
  createdDateUTC: string;
  eventID: string;
}

export interface ProcessedStreamElementsData {
  current: StreamElementsResult;
  localDonations?: LocalDonationData;
  metadata: {
    month: number;
    year: number;
    lastUpdated: string;
  };
}

export interface ProcessedExtraLifeData {
  sumDonations: number;
  fundraisingGoal: number;
  donations: Array<{
    amount: number;
    displayName: string;
    message?: string;
    donationID: string;
    createdDateUTC: string;
    eventID: string;
  }>;
  newDonations?: ProcessedExtraLifeData['donations'];
  metadata: {
    lastUpdated: string;
    participantId: string;
    eventID: string;
  };
}

export interface LocalDonationData {
  data: {
    donations: StreamElementsDonor[];
    overall_total: BaseTotal;
    metadata: {
      lastUpdated: string;
    };
  };
}

export interface StreamElementsDonor extends DonationData { }

export interface StreamElementsResult {
  donations: StreamElementsDonor[];
  overall_total: BaseTotal;
}

export interface ExtraLifeParticipantData {
  sumDonations: number;
  fundraisingGoal: number;
  participantID: string;
}

export interface GoalState {
  goalId: string;
  uuid: string;
  revision?: number;
  config: GoalTrackerConfig;
  overlayInstance: string;
  createdAt: string;
  updatedAt: string;
  active?: boolean;
  localDonations?: LocalDonationData;
  streamElements?: { lastUpdated: string; data: ProcessedStreamElementsData; lastGoalReset?: string };
  extraLife?: { lastUpdated: string; data: ProcessedExtraLifeData };
}
