"use client";

import type { LucideIcon } from "lucide-react";
import { Maximize2, Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type * as React from "react";
import {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Web Speech API shims
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
}

interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
}

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }
}

export interface NodeTextareaProps
    extends Omit<React.ComponentProps<"textarea">, "onChange"> {
    /** Label text */
    label?: string;
    /** Label icon */
    icon?: LucideIcon;
    /** Whether to show the card wrapper */
    showCard?: boolean;
    /** Extra class name for the card */
    cardClassName?: string;
    /** Extra class name for the label */
    labelClassName?: string;
    /** Textarea value */
    value?: string;
    /** Callback when the value changes */
    onChange?: (value: string) => void;
    /** Whether to enable voice input (defaults to true when supported by the browser) */
    enableVoiceInput?: boolean;
    /** Speech recognition language (defaults to zh-CN) */
    voiceLang?: string;
    /** Whether to enable fullscreen editing (defaults to true) */
    enableFullscreen?: boolean;
    /** Fullscreen dialog title */
    fullscreenTitle?: string;
}

/**
 * Shared node Textarea component with voice input support
 *
 * @example
 * // Labelled usage example
 * <NodeTextarea
 *   label="Edit instructions"
 *   icon={Sparkles}
 *   placeholder="Enter image editing instructions..."
 *   value={editText}
 *   onChange={(value) => setState({ editText: value })}
 *   rows={4}
 * />
 *
 * @example
 * // Minimal usage example
 * <NodeTextarea
 *   placeholder="Enter your instructions..."
 *   value={prompt}
 *   onChange={(value) => setState({ prompt: value })}
 *   rows={6}
 * />
 *
 * @example
 * // Disable dictation helper
 * <NodeTextarea
 *   placeholder="Enter your instructions..."
 *   value={prompt}
 *   onChange={(value) => setState({ prompt: value })}
 *   enableVoiceInput={false}
 * />
 */
const NodeTextarea = forwardRef<HTMLTextAreaElement, NodeTextareaProps>(
    (
        {
            label,
            icon: Icon,
            showCard = true,
            cardClassName,
            labelClassName,
            className,
            value,
            onChange,
            rows = 4,
            enableVoiceInput = true,
            voiceLang = "zh-CN",
            enableFullscreen = true,
            fullscreenTitle,
            ...props
        },
        ref,
    ) => {
        const t = useTranslations("Workspace.nodes.base");
        const defaultTitle = t("editText");
        const title = fullscreenTitle || defaultTitle;
        const [isListening, setIsListening] = useState(false);
        const [interimText, setInterimText] = useState("");
        const [speechSupported, setSpeechSupported] = useState(false);
        const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
        const [fullscreenValue, setFullscreenValue] = useState("");
        const recognitionRef = useRef<SpeechRecognition | null>(null);
        const textareaRef = useRef<HTMLTextAreaElement | null>(null);
        const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(null);
        const cursorPositionRef = useRef<number | null>(null);
        const isFullscreenRef = useRef(false);

        // -- Local buffering: typing updates local state only; store sync is debounced --
        const [localValue, setLocalValue] = useState(value || "");
        const isTypingRef = useRef(false);
        const onChangeRef = useRef(onChange);
        onChangeRef.current = onChange;

        useEffect(() => {
            if (!isTypingRef.current) {
                setLocalValue(value || "");
            }
        }, [value]);

        const flushToParent = useCallback((val: string) => {
            isTypingRef.current = false;
            onChangeRef.current?.(val);
        }, []);

        const debouncedFlush = useMemo(() => {
            let timer: ReturnType<typeof setTimeout>;
            return (val: string) => {
                clearTimeout(timer);
                timer = setTimeout(() => flushToParent(val), 300);
            };
        }, [flushToParent]);

        const valueRef = useRef(localValue);
        useEffect(() => {
            valueRef.current = localValue;
        }, [localValue]);

        const fullscreenValueRef = useRef(fullscreenValue);
        useEffect(() => {
            fullscreenValueRef.current = fullscreenValue;
        }, [fullscreenValue]);

        // Merge forwarded refs
        const setRefs = useCallback(
            (element: HTMLTextAreaElement | null) => {
                textareaRef.current = element;
                if (typeof ref === "function") {
                    ref(element);
                } else if (ref) {
                    ref.current = element;
                }
            },
            [ref],
        );

        // Feature-detect SpeechRecognition
        useEffect(() => {
            const SpeechRecognitionAPI =
                window.SpeechRecognition || window.webkitSpeechRecognition;
            setSpeechSupported(!!SpeechRecognitionAPI);
        }, []);

        // Track caret offsets
        const saveCursorPosition = useCallback(() => {
            if (isFullscreenRef.current && fullscreenTextareaRef.current) {
                cursorPositionRef.current =
                    fullscreenTextareaRef.current.selectionStart;
            } else if (textareaRef.current) {
                cursorPositionRef.current = textareaRef.current.selectionStart;
            }
        }, []);

        // Insert transcript at caret
        const insertTextAtCursor = useCallback(
            (text: string) => {
                const currentValue = isFullscreenRef.current
                    ? fullscreenValueRef.current || ""
                    : valueRef.current || "";
                const cursorPos = cursorPositionRef.current;

                if (cursorPos !== null && cursorPos >= 0) {
                    const newValue =
                        currentValue.slice(0, cursorPos) +
                        text +
                        currentValue.slice(cursorPos);
                    if (isFullscreenRef.current) {
                        setFullscreenValue(newValue);
                        fullscreenValueRef.current = newValue;
                    } else {
                        setLocalValue(newValue);
                        valueRef.current = newValue;
                        isTypingRef.current = true;
                        debouncedFlush(newValue);
                    }
                    cursorPositionRef.current = cursorPos + text.length;
                } else {
                    const newValue = currentValue + text;
                    if (isFullscreenRef.current) {
                        setFullscreenValue(newValue);
                        fullscreenValueRef.current = newValue;
                    } else {
                        setLocalValue(newValue);
                        valueRef.current = newValue;
                        isTypingRef.current = true;
                        debouncedFlush(newValue);
                    }
                    cursorPositionRef.current =
                        currentValue.length + text.length;
                }
            },
            [debouncedFlush],
        );

        // Start dictation
        const startListening = useCallback(() => {
            const SpeechRecognitionAPI =
                window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognitionAPI) return;

            // Snapshot caret prior to edits
            saveCursorPosition();

            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = voiceLang;

            let _initFinalTranscript = "";

            recognition.onstart = () => {
                setIsListening(true);
                setInterimText("");
                _initFinalTranscript = "";
            };

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                let currentInterim = "";
                let newFinal = "";

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        newFinal += result[0].transcript;
                    } else {
                        currentInterim += result[0].transcript;
                    }
                }

                if (newFinal) {
                    insertTextAtCursor(newFinal);
                }
                setInterimText(currentInterim);
            };

            recognition.onerror = () => {
                setIsListening(false);
                setInterimText("");
            };

            recognition.onend = () => {
                setIsListening(false);
                setInterimText("");
            };

            recognitionRef.current = recognition;
            recognition.start();
        }, [voiceLang, saveCursorPosition, insertTextAtCursor]);

        const stopListening = useCallback(() => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
            setIsListening(false);
            setInterimText("");
        }, []);

        // Toggle SpeechRecognition lifecycle
        const toggleListening = useCallback(() => {
            if (isListening) {
                stopListening();
            } else {
                startListening();
            }
        }, [isListening, startListening, stopListening]);

        // Teardown timers/listeners
        useEffect(() => {
            return () => {
                if (recognitionRef.current) {
                    recognitionRef.current.abort();
                }
            };
        }, []);

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            isTypingRef.current = true;
            setLocalValue(e.target.value);
            debouncedFlush(e.target.value);
        };

        // Refresh caret on pointer + selection updates
        const handleSelect = () => {
            saveCursorPosition();
        };

        // Expand composer dialog
        const openFullscreen = useCallback(() => {
            setFullscreenValue(localValue || "");
            setIsFullscreenOpen(true);
            isFullscreenRef.current = true;
        }, [localValue]);

        // Dismiss fullscreen without persisting edits
        const closeFullscreen = useCallback(() => {
            setIsFullscreenOpen(false);
            isFullscreenRef.current = false;
            // Stop dictation if active before closing modal
            if (isListening) {
                stopListening();
            }
        }, [isListening, stopListening]);

        // Persist textarea + close fullscreen shell
        const saveAndCloseFullscreen = useCallback(() => {
            onChange?.(fullscreenValue);
            setLocalValue(fullscreenValue);
            setIsFullscreenOpen(false);
            isFullscreenRef.current = false;
            if (isListening) {
                stopListening();
            }
        }, [fullscreenValue, onChange, isListening, stopListening]);

        // Mirror fullscreen textarea value
        const handleFullscreenChange = useCallback(
            (e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setFullscreenValue(e.target.value);
            },
            [],
        );

        const showVoiceButton = enableVoiceInput && speechSupported;
        const showFullscreenButton = enableFullscreen;
        const hasButtons = showVoiceButton || showFullscreenButton;

        // Dictation shortcut button subtree
        const VoiceButton = ({
            className: btnClassName,
        }: {
            className?: string;
        }) => (
            <Button
                type="button"
                variant={isListening ? "destructive" : "ghost"}
                size="icon"
                className={cn(
                    "h-8 w-8",
                    isListening && "animate-pulse",
                    btnClassName,
                )}
                onClick={toggleListening}
                title={isListening ? t("stopVoice") : t("startVoice")}
            >
                {isListening ? (
                    <MicOff className="h-4 w-4" />
                ) : (
                    <Mic className="h-4 w-4" />
                )}
            </Button>
        );

        const handleInlineBlur = useCallback(
            (_e: React.FocusEvent<HTMLTextAreaElement>) => {
                if (localValue !== value) {
                    isTypingRef.current = false;
                    onChange?.(localValue);
                }
            },
            [localValue, value, onChange],
        );

        const textareaElement = (
            <div className="flex flex-col gap-1.5 w-full">
                <div className="relative">
                    <Textarea
                        {...props}
                        ref={setRefs}
                        rows={rows}
                        value={localValue}
                        onChange={handleChange}
                        onBlur={(e) => {
                            handleInlineBlur(e);
                            if (typeof props.onBlur === "function") {
                                props.onBlur(e);
                            }
                        }}
                        onSelect={handleSelect}
                        onClick={handleSelect}
                        onKeyUp={handleSelect}
                        className={cn(
                            "resize-none",
                            hasButtons && "pr-12",
                            className,
                        )}
                    />
                    {hasButtons && (
                        <div className="absolute right-2 bottom-2 flex gap-1">
                            {showFullscreenButton && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={openFullscreen}
                                    title={t("fullscreenEdit")}
                                >
                                    <Maximize2 className="h-4 w-4" />
                                </Button>
                            )}
                            {showVoiceButton && <VoiceButton />}
                        </div>
                    )}
                </div>
                {isListening && interimText && (
                    <div className="text-xs text-muted-foreground italic px-1 animate-pulse truncate min-h-[16px] w-full">
                        {interimText}
                    </div>
                )}
            </div>
        );

        // Fullscreen editing modal shell
        const fullscreenDialog = (
            <Dialog
                open={isFullscreenOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeFullscreen();
                    }
                }}
            >
                <DialogContent
                    className="w-[90vw] h-[90vh] max-w-none flex flex-col"
                    aria-describedby={undefined}
                >
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            {Icon && <Icon className="h-5 w-5" />}
                            {label || title}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 flex flex-col gap-2">
                        <div className="flex-1 relative min-h-0 overflow-hidden">
                            <Textarea
                                ref={fullscreenTextareaRef}
                                value={fullscreenValue}
                                onChange={handleFullscreenChange}
                                onSelect={handleSelect}
                                onClick={handleSelect}
                                onKeyUp={handleSelect}
                                placeholder={props.placeholder}
                                className={cn(
                                    "resize-none h-full w-full overflow-y-auto",
                                    showVoiceButton && "pr-12",
                                )}
                            />
                            {showVoiceButton && (
                                <div className="absolute right-3 bottom-3">
                                    <VoiceButton />
                                </div>
                            )}
                        </div>
                        {isListening && interimText && (
                            <div className="text-sm text-muted-foreground italic truncate animate-pulse min-h-[20px] px-2 flex-shrink-0">
                                {interimText}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button variant="outline" onClick={closeFullscreen}>
                            {t("cancel")}
                        </Button>
                        <Button onClick={saveAndCloseFullscreen}>
                            {t("confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );

        const content = label ? (
            <div className="space-y-2">
                <Label
                    className={cn(
                        "flex items-center gap-2 text-sm font-medium text-muted-foreground",
                        labelClassName,
                    )}
                >
                    {Icon && <Icon className="h-4 w-4" />}
                    {label}
                </Label>
                {textareaElement}
            </div>
        ) : (
            textareaElement
        );

        if (!showCard) {
            return (
                <>
                    {content}
                    {fullscreenDialog}
                </>
            );
        }

        return (
            <>
                <Card
                    className={cn("p-3 nodrag", cardClassName)}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {content}
                </Card>
                {fullscreenDialog}
            </>
        );
    },
);

NodeTextarea.displayName = "NodeTextarea";

export { NodeTextarea };
