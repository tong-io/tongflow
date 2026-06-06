"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { getClientTranslator } from "@/i18n/client";
import { logger } from "@/lib/logger";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        logger.error("ErrorBoundary caught:", error, info.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            const t = getClientTranslator("Errors");
            return (
                <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                        {this.state.error?.message || t("somethingWentWrong")}
                    </p>
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors"
                    >
                        {t("tryAgain")}
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
