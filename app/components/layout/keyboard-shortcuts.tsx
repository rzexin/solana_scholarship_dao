"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Global keyboard shortcuts:
 *  - "/"      focus the first input[type="search"] on the page
 *  - "g d"    go to Discover (/)
 *  - "g m"    go to My Workspace (/me)
 *  - "g o"    go to the current DAO's Overview (when inside a DAO workspace)
 *  - "g p"    go to the current DAO's Proposals (when inside a DAO workspace)
 *  - "c"      create a new proposal in the current DAO (when inside a DAO workspace)
 *  - "?"      toggle the shortcuts help
 *
 * Disabled while an input/textarea/select is focused (except Esc).
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [showHelp, setShowHelp] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (showHelp) {
          setShowHelp(false);
          e.preventDefault();
        }
        if (isInput) (target as HTMLElement).blur();
        setPendingG(false);
        return;
      }
      if (isInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"]'
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (e.key === "g") {
        setPendingG(true);
        setTimeout(() => setPendingG(false), 1200);
        return;
      }
      if (pendingG) {
        if (e.key === "d") {
          router.push("/");
          setPendingG(false);
          return;
        }
        if (e.key === "m") {
          router.push("/me");
          setPendingG(false);
          return;
        }
        if (e.key === "p") {
          const m = pathname.match(/^\/dao\/([^/]+)/);
          if (m) {
            router.push(`/dao/${m[1]}/proposals`);
          }
          setPendingG(false);
          return;
        }
        if (e.key === "o") {
          const m = pathname.match(/^\/dao\/([^/]+)/);
          if (m) router.push(`/dao/${m[1]}`);
          setPendingG(false);
          return;
        }
        return;
      }
      if (e.key === "c") {
        const m = pathname.match(/^\/dao\/([^/]+)/);
        if (m) {
          e.preventDefault();
          router.push(`/dao/${m[1]}/proposals/new`);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, showHelp, pendingG]);

  if (!showHelp) {
    return pendingG ? (
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border-low bg-surface-1 px-4 py-2 text-xs text-foreground-muted shadow-md">
        Waiting for second key · <span className="kbd">d</span>
        <span className="kbd ml-1">m</span>
        <span className="kbd ml-1">p</span>
        <span className="kbd ml-1">o</span>
      </div>
    ) : null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="workspace-card max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="text-xs text-foreground-muted hover:text-foreground"
          >
            Esc to close
          </button>
        </header>
        <ul className="space-y-2 text-sm">
          <ShortcutRow keys={["/"]} desc="Focus search" />
          <ShortcutRow keys={["g", "d"]} desc="Go to Discover" />
          <ShortcutRow keys={["g", "m"]} desc="Go to My Workspace" />
          <ShortcutRow keys={["g", "o"]} desc="Current DAO Overview" />
          <ShortcutRow keys={["g", "p"]} desc="Current DAO Proposals" />
          <ShortcutRow keys={["c"]} desc="New proposal in current DAO" />
          <ShortcutRow keys={["?"]} desc="Show this help" />
        </ul>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-foreground-muted">{desc}</span>
      <span className="flex gap-1">
        {keys.map((k, i) => (
          <kbd key={i} className="kbd">
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}
