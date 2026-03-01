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
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/standings", label: "Standings" },
];

export const metadata: Metadata = {
  title: "F1 VibeTiming | Live Weekend Dashboard",
  description: "Track F1 live timing, practices, qualifying, races, and standings.",
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
          <header className="border-b border-black/10 bg-white/75 backdrop-blur">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
              <Link href="/" className="text-2xl uppercase tracking-wide text-[var(--ink)]">
                F1 VibeTiming
              </Link>
              <nav className="flex items-center gap-4 text-sm font-semibold uppercase tracking-wide text-black/65">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-full px-3 py-1 transition hover:bg-black/5 hover:text-black"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
