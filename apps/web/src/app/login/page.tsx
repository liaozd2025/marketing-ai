import Link from "next/link";

import { loginAction } from "@/app/actions";

const errorMessages: Record<string, string> = {
  "invalid-credentials": "邮箱或密码不正确。",
};

export default async function LoginPage({
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
        <p className="eyebrow">MARKETING AI</p>
        <h1>登录商家空间</h1>
        <p className="muted">继续管理你的知识库和私域内容。</p>

        {error && errorMessages[error] ? (
          <p className="form-error" role="alert">
            {errorMessages[error]}
          </p>
        ) : null}

        <form action={loginAction} className="auth-form">
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
              autoComplete="current-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <button type="submit">登录</button>
        </form>

        <p className="auth-switch">
          还没有商家空间？ <Link href="/register">立即注册</Link>
        </p>
      </section>
    </main>
  );
}
