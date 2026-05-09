import type { Metadata } from "next";
import { Fredoka, JetBrains_Mono, Quicksand } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/providers";
import { AuroraBackground } from "./components/aurora-background";
import { SiteHeader } from "./components/layout/site-header";
import { KeyboardShortcuts } from "./components/layout/keyboard-shortcuts";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scholarship DAO · A scholarship DAO on Solana",
  description:
    "Donate SOL to become a member, then vote with the community to award scholarships",
  applicationName: "Scholarship DAO",
  authors: [{ name: "rzexin" }],
  keywords: ["Solana", "DAO", "Scholarship", "Anchor", "Web3"],
  openGraph: {
    title: "Scholarship DAO · Solana scholarship DAO",
    description:
      "Donate SOL → become a member → propose → vote → execute on-chain.",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fredoka.variable} ${quicksand.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Providers>
          <div className="relative min-h-screen text-foreground">
            <AuroraBackground />
            <div className="relative z-10 flex min-h-screen flex-col">
              <SiteHeader />
              <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 lg:px-8">
                {children}
              </main>
              <KeyboardShortcuts />
              <footer className="mx-auto w-full max-w-7xl border-t border-border-low px-5 py-6 text-xs text-foreground-muted lg:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>
                    Built for{" "}
                    <span className="font-semibold text-foreground">
                      Solana Frontier
                    </span>{" "}
                    · Anchor + @solana/kit + Next.js
                  </p>
                  <div className="flex items-center gap-4">
                    <a
                      href="https://solana.com/docs"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground"
                    >
                      Solana docs
                    </a>
                    <a
                      href="https://www.anchor-lang.com/docs/introduction"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground"
                    >
                      Anchor docs
                    </a>
                    <a
                      href="https://faucet.solana.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground"
                    >
                      Faucet
                    </a>
                  </div>
                </div>
              </footer>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
