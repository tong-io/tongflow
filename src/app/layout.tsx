import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "react-hot-toast";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "OpenFlow",
    description:
        "Open-source AI workflow editor — drag and drop to create AI workflows with an infinite canvas.",
    icons: {
        icon: "/favicon.png",
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
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
