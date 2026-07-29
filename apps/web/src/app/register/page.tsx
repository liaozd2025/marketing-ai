import Link from "next/link";

import { registerAction } from "@/app/actions";

const errorMessages: Record<string, string> = {
  "email-exists": "该邮箱已注册，请直接登录。",
  "invalid-input": "请填写商家名称、有效邮箱和至少 8 位密码。",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <p className="eyebrow">创建独立租户</p>
        <h1>注册商家空间</h1>
        <p className="muted">注册人会成为该商家的所有者。</p>

        {error && errorMessages[error] ? (
          <p className="form-error" role="alert">
            {errorMessages[error]}
          </p>
        ) : null}

        <form action={registerAction} className="auth-form">
          <label>
            商家名称
            <input
              autoComplete="organization"
              name="merchantName"
              placeholder="悦见美学"
              required
            />
          </label>
          <label>
            邮箱
            <input
              autoComplete="email"
              name="email"
              placeholder="owner@example.com"
              required
              type="email"
            />
          </label>
          <label>
            密码
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <button type="submit">创建并进入空间</button>
        </form>

        <p className="auth-switch">
          已有账号？ <Link href="/login">返回登录</Link>
        </p>
      </section>
    </main>
  );
}
