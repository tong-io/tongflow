import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ExtSlot from "@ext/ui-slot";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "tongflow/canvas";
import { TaskFailureToaster } from "@/components/workspace/task-failure-toaster";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// The favicon follows the system theme: the dark square in light mode, the
// white square in dark mode. The SVG switches on its own; the PNG sets carry a
// media query for browsers that pick a raster icon.
const FAVICON_SIZES = [16, 32, 48, 96, 512] as const;
const faviconSet = (file: string, scheme: "light" | "dark") =>
    FAVICON_SIZES.map((size) => ({
        url: `/brand/icons/${file}-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        media: `(prefers-color-scheme: ${scheme})`,
    }));

export const metadata: Metadata = {
    title: "TongFlow",
    description:
        "Agent-Human-Friendly, Modality-First, Enterprise-Level GenAI Workflow Platform. Build generative AI workflows across text, images, audio, video, 3D, documents and links on one canvas, with AI agents or by hand.",
    icons: {
        icon: [
            { url: "/brand/tongflow-mark-adaptive.svg", type: "image/svg+xml" },
            ...faviconSet("tongflow-mark", "light"),
            ...faviconSet("tongflow-mark-white", "dark"),
        ],
        shortcut: "/favicon.ico",
        apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
    },
};

export const dynamic = "force-dynamic";

const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional inline theme script to avoid FOUC */}
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
            >
                <NextIntlClientProvider messages={messages}>
                    <ErrorBoundary>
                        <main>{children}</main>
                    </ErrorBoundary>
                    <Toaster position="top-center" />
                    <TaskFailureToaster />
                    <ExtSlot />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
