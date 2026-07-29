"use server";

import { compare, hash } from "bcryptjs";
import {
  database,
  EmailAlreadyRegisteredError,
} from "@marketing-ai/database";
import { redirect } from "next/navigation";

import { createSession, deleteSession } from "@/lib/session";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(path: "/login" | "/register", code: string): never {
  redirect(`${path}?error=${encodeURIComponent(code)}`);
}

export async function registerAction(formData: FormData): Promise<void> {
  const merchantName = field(formData, "merchantName");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (!merchantName || !email.includes("@") || password.length < 8) {
    redirectWithError("/register", "invalid-input");
  }

  let account;
  try {
    account = await database.identity.registerMerchant({
      email,
      merchantName,
      passwordHash: await hash(password, 12),
    });
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      redirectWithError("/register", "email-exists");
    }
    throw error;
  }

  await createSession({
    memberId: account.member.id,
    merchantId: account.merchant.id,
  });
  redirect("/workspace");
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const member = await database.identity.findMemberByEmail(email);

  if (!member || !(await compare(password, member.passwordHash))) {
    redirectWithError("/login", "invalid-credentials");
  }

  await createSession({
    memberId: member.id,
    merchantId: member.merchantId,
  });
  redirect("/workspace");
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
