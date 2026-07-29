import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  description: "私域内容营销工作台",
  title: "Marketing AI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
