"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Address } from "@solana/kit";

type Tab = {
  slug: string;
  label: string;
  hint?: string;
};

const TABS: Tab[] = [
  { slug: "", label: "Overview" },
  { slug: "proposals", label: "Proposals" },
  { slug: "members", label: "Members" },
  { slug: "treasury", label: "Treasury" },
  { slug: "activity", label: "Activity" },
  { slug: "settings", label: "Settings" },
];

type Props = {
  daoAddress: Address;
};

export function DaoTabBar({ daoAddress }: Props) {
  const pathname = usePathname() ?? "";
  const base = `/dao/${daoAddress}`;

  return (
    <nav
      className="-mx-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="DAO sections"
    >
      <div className="tab-bar">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const isActive =
            t.slug === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={t.slug || "overview"}
              href={href}
              data-active={isActive}
              className="tab-bar-item"
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
