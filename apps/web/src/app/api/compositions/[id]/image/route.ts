import { readCompositionFile } from "@/lib/composition-storage";
import { getTenantContext } from "@/lib/tenant-context";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getTenantContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const composition = await context.tenant.compositions.get(id);
  if (!composition || composition.sourceTaskId) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const body = await readCompositionFile(composition.storageKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="composition-${composition.id}.png"`,
        "Content-Length": String(composition.byteSize),
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return Response.json({ error: "file-not-found" }, { status: 404 });
    }
    throw error;
  }
}
