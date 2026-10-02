import type {} from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { useEffect, useRef, useState } from "react";
import { StudioShell } from "tongflow-studio/client";
import { ChatPane } from "./ChatPane.tsx";

/** Host-provided actions injected at registration time. */
export interface StudioInjected {
    /** Register the project folder as a dsh workspace and open a session in it. */
    openWorkspace: (path: string) => Promise<void>;
    locale: string;
}

/** The Studio as the session's conversation view (session kit present → chat column shown). */
export type StudioViewProps = Pick<
    PropsRuntime<"conversation.view">,
    "useSessions"
> &
    Partial<
        Pick<
            PropsRuntime<"conversation.view">,
            "useSession" | "useChat" | "inputActions" | "useInput" | "sessionId"
        >
    > &
    StudioInjected & { onClose?: () => void };

/**
 * dsh's view area grows with content (flex: 1 0 auto inside a scrolling
 * body); the studio wants a fixed frame with internally scrolling panes, so
 * it sizes itself to the nearest scrolling ancestor's viewport.
 */
function useFillScrollport(
    ref: React.RefObject<HTMLDivElement | null>,
): number | undefined {
    const [height, setHeight] = useState<number | undefined>();
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let scroller: HTMLElement | null = el.parentElement;
        while (
            scroller &&
            !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
        )
            scroller = scroller.parentElement;
        if (!scroller) return;
        const target = scroller;
        // dsh floats its composer over the bottom of the scroll body; stop above it.
        const composer = () =>
            target.parentElement?.querySelector<HTMLElement>(
                '[class*="composerStack"]',
            ) ?? undefined;
        const apply = () => {
            const bar = composer();
            const top = target.getBoundingClientRect().top;
            const bottom = bar
                ? bar.getBoundingClientRect().top
                : target.getBoundingClientRect().bottom;
            const h = Math.max(240, Math.floor(bottom - top));
            setHeight(h);
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(target);
        const bar = composer();
        if (bar) ro.observe(bar);
        window.addEventListener("resize", apply);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", apply);
        };
    }, [ref]);
    return height;
}

/** Sync dark mode for the embedded canvas (dsh marks dark on body[data-ds-dark-theme]). */
function useDarkClass(): void {
    useEffect(() => {
        const apply = () =>
            document.documentElement.classList.toggle(
                "dark",
                document.body.hasAttribute("data-ds-dark-theme"),
            );
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(document.body, {
            attributes: true,
            attributeFilter: ["data-ds-dark-theme"],
        });
        return () => obs.disconnect();
    }, []);
}

export function StudioView(props: StudioViewProps) {
    const { useSession, useChat, inputActions, useInput, sessionId } = props;
    const cwd = props.useSessions((s) =>
        sessionId ? s.byId[sessionId]?.cwd : undefined,
    );
    // The shell's root is the anchor's only child, so the anchor measures the same scrollport.
    const anchor = useRef<HTMLDivElement>(null);
    const height = useFillScrollport(anchor);
    useDarkClass();
    const chat =
        useSession && useChat && inputActions && useInput && sessionId ? (
            <ChatPane
                useSession={useSession}
                useChat={useChat}
                inputActions={inputActions}
                useInput={useInput}
                sessionId={sessionId}
            />
        ) : undefined;
    return (
        <div ref={anchor} style={{ display: "contents" }}>
            <StudioShell
                locale={props.locale}
                openProject={props.openWorkspace}
                chat={chat}
                {...(sessionId ? { sessionId } : {})}
                {...(cwd ? { cwd } : {})}
                {...(height ? { height } : {})}
                {...(props.onClose ? { onClose: props.onClose } : {})}
            />
        </div>
    );
}
