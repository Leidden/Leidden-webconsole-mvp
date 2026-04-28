import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Web Console MVP",
  description: "CloudStack self-service portal MVP"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
