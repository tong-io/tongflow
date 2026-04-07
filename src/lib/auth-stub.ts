/**
 * Auth stub for open-source version.
 * Returns a default user for all requests — no authentication required.
 */

const DEFAULT_USER = {
    id: "default-user",
    name: "Local User",
    email: "local@openflow.dev",
    image: null,
    emailVerified: true,
};

export async function getCurrentUser() {
    return DEFAULT_USER;
}

export async function requireAuth() {
    return DEFAULT_USER;
}

export async function isAuthenticated() {
    return true;
}

export async function getSession() {
    return {
        user: DEFAULT_USER,
        session: {
            id: "default-session",
            userId: DEFAULT_USER.id,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
    };
}
