import {
    crawledVoiceOptions,
    type VoiceLanguage,
} from "@/constants/voice-options";

export const TEXT_GEN_SPEECH_CLONE = "text-gen-speech-clone";
export const TEXT_GEN_SPEECH_PRESET = "text-gen-speech-preset";
export const TEXT_GEN_SPEECH_INSTRUCT = "text-gen-speech-instruct";

export const VOICE_LANG_LABELS: Record<VoiceLanguage, string> = {
    zh: "中文",
    en: "English",
    ja: "日本語",
};

/** Labels from `useTranslations("Workspace.nodes")` */
export type NodesT = (key: string) => string;

export function getDefaultVoice(lang: VoiceLanguage): string {
    return lang === "zh"
        ? "zh_famale_1.wav"
        : (crawledVoiceOptions[lang][0]?.value ?? "zh_famale_1.wav");
}

export function getVoiceOptions(lang: VoiceLanguage, t: NodesT) {
    if (lang === "zh") {
        return [
            {
                label: t("common.voiceOptions.female"),
                value: "zh_famale_1.wav",
            },
            { label: t("common.voiceOptions.male"), value: "zh_male_1.wav" },
            ...crawledVoiceOptions.zh,
        ];
    }
    return [...crawledVoiceOptions[lang]];
}

export function buildEmotionOptions(t: NodesT) {
    return [
        { label: t("emotions.none"), value: "none" },
        { label: t("emotions.happy"), value: "happy" },
        { label: t("emotions.angry"), value: "angry" },
        { label: t("emotions.sad"), value: "sad" },
        { label: t("emotions.fear"), value: "fear" },
        { label: t("emotions.surprised"), value: "surprised" },
        { label: t("emotions.confusion"), value: "confusion" },
        { label: t("emotions.empathy"), value: "empathy" },
        { label: t("emotions.embarrass"), value: "embarrass" },
        { label: t("emotions.excited"), value: "excited" },
        { label: t("emotions.depressed"), value: "depressed" },
        { label: t("emotions.admiration"), value: "admiration" },
        { label: t("emotions.coldness"), value: "coldness" },
    ];
}

export function buildStyleOptions(t: NodesT) {
    return [
        { label: t("styles.none"), value: "none" },
        { label: t("styles.serious"), value: "serious" },
        { label: t("styles.arrogant"), value: "arrogant" },
        { label: t("styles.child"), value: "child" },
        { label: t("styles.older"), value: "older" },
        { label: t("styles.girl"), value: "girl" },
        { label: t("styles.pure"), value: "pure" },
        { label: t("styles.sister"), value: "sister" },
        { label: t("styles.sweet"), value: "sweet" },
        { label: t("styles.exaggerated"), value: "exaggerated" },
        { label: t("styles.ethereal"), value: "ethereal" },
        { label: t("styles.whisper"), value: "whisper" },
        { label: t("styles.generous"), value: "generous" },
        { label: t("styles.recite"), value: "recite" },
        { label: t("styles.act_coy"), value: "act_coy" },
        { label: t("styles.warm"), value: "warm" },
        { label: t("styles.shy"), value: "shy" },
        { label: t("styles.comfort"), value: "comfort" },
        { label: t("styles.authority"), value: "authority" },
        { label: t("styles.chat"), value: "chat" },
        { label: t("styles.radio"), value: "radio" },
        { label: t("styles.soulful"), value: "soulful" },
        { label: t("styles.gentle"), value: "gentle" },
        { label: t("styles.story"), value: "story" },
        { label: t("styles.vivid"), value: "vivid" },
        { label: t("styles.program"), value: "program" },
        { label: t("styles.news"), value: "news" },
        { label: t("styles.advertising"), value: "advertising" },
        { label: t("styles.roar"), value: "roar" },
        { label: t("styles.murmur"), value: "murmur" },
        { label: t("styles.shout"), value: "shout" },
        { label: t("styles.deeply"), value: "deeply" },
        { label: t("styles.loudly"), value: "loudly" },
    ];
}

export function buildGenderOptions(t: NodesT) {
    return [
        { label: t("genders.none"), value: "none" },
        { label: t("genders.male"), value: "male" },
        { label: t("genders.female"), value: "female" },
    ];
}

export function buildPresetDescription(
    genders: string[],
    emotions: string[],
    styles: string[],
    genderOptions: { label: string; value: string }[],
    emotionOptions: { label: string; value: string }[],
    styleOptions: { label: string; value: string }[],
): string {
    const parts: string[] = [];

    if (genders?.length) {
        const labels = genders
            .map(
                (g) => genderOptions.find((opt) => opt.value === g)?.label || g,
            )
            .filter(Boolean);
        if (labels.length > 0) parts.push(...labels);
    }

    if (emotions?.length) {
        const labels = emotions
            .map(
                (e) =>
                    emotionOptions.find((opt) => opt.value === e)?.label || e,
            )
            .filter(Boolean);
        if (labels.length > 0) parts.push(...labels);
    }

    if (styles?.length) {
        const labels = styles
            .map((s) => styleOptions.find((opt) => opt.value === s)?.label || s)
            .filter(Boolean);
        if (labels.length > 0) parts.push(...labels);
    }

    return parts.join("，");
}
