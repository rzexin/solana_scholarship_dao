"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ClusterSelect } from "../cluster-select";
import { WalletButton } from "../wallet-button";
import { CreateDaoCard } from "../dao/create-dao-card";
import { useWallet } from "../../lib/wallet/context";

const NAV_ITEMS = [
  { href: "/", label: "Discover", match: (p: string) => p === "/" },
  {
    href: "/me",
    label: "My Workspace",
    match: (p: string) => p.startsWith("/me"),
  },
];

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const { status } = useWallet();
  const isConnected = status === "connected";
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-colors ${
        scrolled
          ? "border-b border-border-low bg-background/85 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3.5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-2xl text-white shadow-md"
            style={{
              background:
                "linear-gradient(135deg,#F4A261 0%,#9D4EDD 60%,#48BFE3 100%)",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10L12 5 2 10l10 5 10-5z" />
              <path d="M6 12v5c3 2 9 2 12 0v-5" />
            </svg>
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Scholarship<span className="text-primary-strong">.DAO</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-active={item.match(pathname)}
              className="nav-item"
            >
              {item.label}
            </Link>
          ))}
          {isConnected && (
            <CreateDaoCard mode="compact" triggerVariant="header" />
          )}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <ClusterSelect />
            <WalletButton />
          </div>
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="btn-ghost size-10 p-0 md:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="absolute right-0 top-0 flex h-full w-72 max-w-[85%] flex-col gap-4 bg-surface-1 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold">
                Navigation
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-xs text-foreground-muted"
              >
                Close ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={item.match(pathname)}
                  className="nav-item w-full"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {isConnected && (
              <div className="border-t border-border-low pt-4">
                <CreateDaoCard mode="compact" triggerVariant="header" />
              </div>
            )}
            <div className="border-t border-border-low pt-4">
              <ClusterSelect />
              <div className="mt-3">
                <WalletButton />
              </div>
            </div>
            <p className="mt-auto text-xs text-foreground-muted">
              Tip: press <kbd className="kbd">?</kbd> for keyboard shortcuts
            </p>
          </aside>
        </div>
      )}
    </header>
  );
}
