export interface GoalTrackerConfig {
    streamInfo: StreamInfo;
    mode: ModeSettings;
    display: DisplaySettings;
    content: ContentConfig;
    timing: TimingConfig;
    extraLife: ExtraLifeConfig;
    streamElements: StreamElementsConfig;
}

export interface EventData {
    uuid: string;
    config: GoalTrackerConfig;
}

interface StreamInfo {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
}

interface ModeSettings {
    useMilestonesAsGoals: boolean;
    useCustomLargestMessage: boolean;
    useCustomRecentMessage: boolean;
    separateInfoColors: boolean;
    infoSectionCycle: boolean;
    showInfoSection: boolean;
    showDonationAnimation: boolean;
    showLogoAnimation: boolean;
    showDonationTimestamp: boolean;
    useCustomDonationData: boolean;
    largestDonationTieMode: 'all' | 'recent';
    defaultDonationGoal: number;
    customVariables: CustomVariables;
}

interface CustomVariables {
    current: string;
    goal: string;
    recentDonations: DonationData[];
    jsonVariableName: string;
    currentVariableName: string;
    goalVariableName: string;
}

export interface DonationData {
    donations: Donation[];
    overall_total: OverallTotal;
}

interface Donation {
    name: string;
    individual_donations: IndividualDonation[];
    total_amount: number;
    total_donations: number;
}

interface IndividualDonation {
    amount: number;
    timestamp: string;
}

interface OverallTotal {
    amount: number;
    donation_count: number;
}

interface DisplaySettings {
    progressBar: ProgressBarSettings;
    countdown: CountdownSettings;
    showHighlight: boolean;
}

interface ProgressBarSettings {
    hideBeforeStreamStartTime: boolean;
    hideAfterStreamEndTime: boolean;
    showTitle: boolean;
    showPercentage: boolean;
    opacity: number;
}

interface CountdownSettings {
    countdownPosition: string;
    showCountdown: boolean;
    countdownCycle: boolean;
}

interface ContentConfig {
    milestones: Milestone[];
    templates: TemplateConfig;
    branding: BrandingConfig;
}

export interface Milestone {
    title: string;
    amount: number;
}

interface TemplateConfig {
    extraLife: ThemeTemplates;
    default: ThemeTemplates;
}

interface ThemeTemplates {
    titles: TitleTemplates;
    donations: DonationTemplates;
    colors: ColorTemplates;
    animation: AnimationTemplates;
}

interface ColorTemplates {
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

interface AnimationTemplates {
    animationHighlight: string;
    animationBackgroundColorOne: string;
    animationBackgroundColorTwo: string;
    animationBorder: string;
    animationText: string;
    animationShadow: string;
}

interface TitleTemplates {
    streamBegins: string;
    streamRunning: string;
    streamEnded: string;
    progressBar: string;
    heading: string;
    subheading: string;
}

interface DonationTemplates {
    noDonations: string;
    defaultDonorName: string;
    largestDonationFormat: string;
    donationFormat: string;
    supportMessage: string;
    recentDonations: string;
    customLargestMessage: string;
    customRecentMessage: string;
}

interface BrandingConfig {
    logo: {
        extraLife: LogoConfig;
        default: LogoConfig;
    };
}

interface LogoConfig {
    src: string;
    alt: string;
    styles: Record<string, string>;
}

interface TimingConfig {
    transition: number;
    cycleDelay: number;
    animationDisplay: number;
    animationPreTiming: number;
    animationPostTiming: number;
    customDonorRotationInterval: number;
    dataPollInterval: number;
}

interface ExtraLifeConfig {
    useExtraLife: boolean;
    useExtraLifeColors: boolean;
    extralifeDonorRotationInterval: number;
    dataPollInterval: number;
    participantId: string | null;
}

interface StreamElementsConfig {
    useStreamElements: boolean;
    channelId: string;
    jwtToken: string;
    pollInterval: number;
    useLocalDonations: boolean;
    localDonationsVariable: string;
    streamElementsVariable: string;
    subscriptionValues: SubscriptionValueConfig
    bitsValue: number;
}

interface SubscriptionValueConfig {
        prime: number;
        tier1: number;
        tier2: number;
        tier3: number;
}