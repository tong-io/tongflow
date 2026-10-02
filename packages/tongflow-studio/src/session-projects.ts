/**
 * Which studio project each host session (agent) is working in — set by every
 * tongflow_* tool call, read by the Studio UI so its project selector follows
 * the agent. In-memory; sessions re-establish it with their next tool call.
 */
const bySession = new Map<string, string>();

export function setSessionProject(sessionId: string, projectId: string): void {
    bySession.set(sessionId, projectId);
}

export function getSessionProject(sessionId: string): string | undefined {
    return bySession.get(sessionId);
}

export function forgetProject(projectId: string): void {
    for (const [sid, pid] of bySession)
        if (pid === projectId) bySession.delete(sid);
}
