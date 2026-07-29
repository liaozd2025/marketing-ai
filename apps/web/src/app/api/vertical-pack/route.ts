import { getVerticalPack } from "@marketing-ai/vertical-packs";

import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json(getVerticalPack(context.merchant.verticalPackId));
}
