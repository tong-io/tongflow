export interface ModalWorkerEntry {
    /** POSIX path under modal/, e.g. cpu/whisper.py */
    file: string;
    category: "cpu" | "gpu";
    appName: string | null;
    title: string | null;
}
