"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const links = [
  { href: "/dashboard", label: "Dashboard", group: "Business" },
  { href: "/branches", label: "Branch Management", group: "Business" },
  { href: "/users", label: "Users", group: "Business" },
  { href: "/financial-logs", label: "Financial Logs", group: "Business" },
  { href: "/operations", label: "Operations Health", group: "Business" },
  { href: "/admin/dashboard", label: "Dashboard", group: "Super Admin" },
  { href: "/admin/businesses", label: "Businesses", group: "Super Admin" },
  { href: "/admin/financial-logs", label: "Financial Logs", group: "Super Admin" },
  { href: "/admin/audit-logs", label: "Audit Logs", group: "Super Admin" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 md:block">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          MST
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-950">
          M-Pesa STK Terminal
        </p>
      </div>

      <nav className="space-y-5">
        {["Business", "Super Admin"].map((group) => (
          <div key={group}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-slate-400">
              {group}
            </p>
            <div className="space-y-1">
              {links
                .filter((link) => link.group === group)
                .map((link) => (
                  <Link
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950",
                      pathname === link.href && "bg-emerald-50 text-emerald-800"
                    )}
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
