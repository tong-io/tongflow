/**
 * Qwen3-TTS CustomVoice preset speakers — the 9 timbres shipped in
 * `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`.
 */

export type QwenSpeakerGender = "male" | "female";

export interface QwenSpeaker {
    value: string;
    gender: QwenSpeakerGender;
    /** Translation key under `Languages` for display. */
    langKey: string;
    /** Qwen3-TTS `language` parameter value for this speaker's native language. */
    language: string;
}

export const QWEN_SPEAKERS: QwenSpeaker[] = [
    { value: "Vivian", gender: "female", langKey: "zh", language: "Chinese" },
    { value: "Serena", gender: "female", langKey: "zh", language: "Chinese" },
    { value: "Uncle_Fu", gender: "male", langKey: "zh", language: "Chinese" },
    { value: "Dylan", gender: "male", langKey: "zh", language: "Chinese" },
    { value: "Eric", gender: "male", langKey: "zh", language: "Chinese" },
    { value: "Ryan", gender: "male", langKey: "en", language: "English" },
    { value: "Aiden", gender: "male", langKey: "en", language: "English" },
    {
        value: "Ono_Anna",
        gender: "female",
        langKey: "ja",
        language: "Japanese",
    },
    { value: "Sohee", gender: "female", langKey: "ko", language: "Korean" },
];

export const DEFAULT_QWEN_SPEAKER = QWEN_SPEAKERS[0];
