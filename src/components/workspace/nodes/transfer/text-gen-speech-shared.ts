/** Labels from `useTranslations("Workspace.nodes")` */
export type NodesT = (key: string) => string;

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
