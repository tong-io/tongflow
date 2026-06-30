import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { logger } from "@/lib/logger";

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get("NEXT_LOCALE");

    let locale = "zh"; // Default to Chinese

    if (localeCookie) {
        locale = localeCookie.value;
    } else {
        // Optional: Check Accept-Language header if no cookie is set
        try {
            const headersList = await headers();
            const acceptLanguage = headersList.get("accept-language");
            // Simple check: if explicit 'en' or 'ja' preference is stronger or first
            if (acceptLanguage?.toLowerCase().startsWith("en")) {
                locale = "en";
            } else if (acceptLanguage?.toLowerCase().startsWith("ja")) {
                locale = "ja";
            } else if (acceptLanguage?.toLowerCase().startsWith("ko")) {
                locale = "ko";
            }
        } catch (e) {
            logger.error("Error detecting locale from headers", e);
        }
    }

    // Validate locale
    if (!["en", "zh", "ja", "ko"].includes(locale)) locale = "zh";

    return {
        locale,
        messages: (await import(`./messages/${locale}.json`)).default,
    };
});
