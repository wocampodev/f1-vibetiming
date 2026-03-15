import type { Metadata } from "next";
import { Barlow_Condensed, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const navItems = [
  { href: "/live", label: "Live" },
  { href: "/standings", label: "Standings" },
];

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "F1 VibeTiming",
    template: "%s | F1 VibeTiming",
  },
  description: "Live timing board and championship standings for F1 weekends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <div className="min-h-screen">
          <header className="border-b border-[var(--line)] bg-[#070d15]/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-4 sm:px-6">
              <Link
                href="/live"
                className="text-2xl uppercase tracking-wide text-[var(--ink)]"
              >
                F1 VibeTiming
              </Link>
              <nav className="flex items-center gap-4 text-sm font-semibold uppercase tracking-wide text-[#b9cae2]">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full border border-transparent px-3 py-1 transition hover:border-[var(--line)] hover:bg-[#0b1420] hover:text-[#e5efff]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
