/**
 * The Studio as a page of its own, served by `serve.ts`: no host around it,
 * so no chat column — the conversation happens in the agent host, and the
 * page follows the project that session's agent works in (`?session=`).
 */
import { createRoot } from "react-dom/client";
import { StudioShell } from "./StudioShell.tsx";

const session = new URLSearchParams(location.search).get("session");
const locale = (navigator.language || "en").split("-")[0];

// The canvas and the page palette key their dark scheme on `html.dark`.
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () =>
    document.documentElement.classList.toggle("dark", dark.matches);
applyScheme();
dark.addEventListener("change", applyScheme);

const root = document.getElementById("root");
if (root)
    createRoot(root).render(
        <StudioShell
            locale={locale}
            {...(session ? { sessionId: session } : {})}
        />,
    );
