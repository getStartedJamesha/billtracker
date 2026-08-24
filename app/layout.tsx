import type { Metadata } from "next";
import "./globals.css";
import NavLinks from "@/components/NavLinks";

export const metadata: Metadata = {
  title: "BillTracker",
  description: "Track shared monthly subscriptions among friends",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">💸</span>
              <span className="text-lg font-semibold text-slate-900">BillTracker</span>
            </div>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
