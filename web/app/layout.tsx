import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bops Web",
  description: "Personal, non-commercial prototype. A chief of staff and a few specialists, in the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
