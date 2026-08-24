"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LogOut, Shirt, Sparkles, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/", label: "Essayer un vêtement", icon: Sparkles },
  { href: "/dressing", label: "Mon dressing", icon: Shirt },
  { href: "/history", label: "Historique", icon: History },
  { href: "/profile", label: "Mon profil", icon: UserRound },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-svh w-64 shrink-0 flex-col border-r bg-card">
      <div className="px-5 py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          DressAI
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <form action={signOut}>
          <Button variant="ghost" className="w-full justify-start gap-3" type="submit">
            <LogOut className="size-4" />
            Déconnexion
          </Button>
        </form>
      </div>
    </aside>
  );
}
