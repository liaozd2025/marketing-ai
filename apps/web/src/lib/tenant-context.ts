import { database, tenantId } from "@marketing-ai/database";
import { redirect } from "next/navigation";

import { deleteSession, getSession } from "./session";

export async function getTenantContext() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  const tenant = database.forTenant(tenantId(session.merchantId));
  const [merchant, member] = await Promise.all([
    tenant.getMerchant(),
    tenant.getMember(session.memberId),
  ]);

  if (!merchant || !member) {
    return null;
  }

  return { member, merchant, session, tenant };
}

export async function requireTenantContext() {
  const context = await getTenantContext();
  if (!context) {
    await deleteSession();
    redirect("/login");
  }

  return context;
}
