import { requireAuth } from "@/lib/auth-stub";
import { scanModalWorkers } from "@/lib/modal-scan";

export const dynamic = "force-dynamic";

export async function GET() {
    await requireAuth();
    const workers = scanModalWorkers();
    return Response.json({ workers });
}
