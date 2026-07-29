import { readAssetFile } from "@/lib/asset-storage";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getTenantContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const asset = await context.tenant.knowledgeBase.getAsset(id);
  if (!asset) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const body = await readAssetFile(asset.storageKey);
    const encodedName = encodeURIComponent(asset.originalName);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(asset.byteSize),
        "Content-Type": asset.mimeType,
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
