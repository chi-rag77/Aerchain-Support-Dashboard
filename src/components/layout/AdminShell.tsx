import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Users, SlidersHorizontal, ScrollText, ShieldCheck, Image, Slack } from "lucide-react";
import { Header } from "./Header";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Users", path: "/admin/users", icon: Users, desc: "Create & manage who can access the tool" },
  { label: "SLA Rules", path: "/admin/sla", icon: SlidersHorizontal, desc: "Resolution targets by severity" },
  { label: "Slack", path: "/admin/slack", icon: Slack, desc: "Alert assignees & post SLA reminders" },
  { label: "Branding", path: "/admin/branding", icon: Image, desc: "Upload the logo shown across the app" },
  { label: "Sync Logs", path: "/admin/logs", icon: ScrollText, desc: "Freshdesk sync history" },
];

export const AdminShell = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto app-canvas">
        <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
          {/* Title */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10">
              <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">Administration</h1>
              <p className="text-[12.5px] text-muted-foreground">System settings · admin only</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tabs.map((t) => {
              const active = pathname === t.path;
              return (
                <Link
                  key={t.path}
                  to={t.path}
                  className={cn(
                    "group rounded-2xl border p-4 transition-all",
                    active
                      ? "border-violet-300 bg-violet-500/[0.06] dark:border-violet-500/40"
                      : "border-border bg-card hover:border-violet-200 hover:bg-secondary/40"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <t.icon className={cn("h-4 w-4", active ? "text-violet-600 dark:text-violet-300" : "text-muted-foreground")} />
                    <span className={cn("text-[13px] font-bold", active && "text-violet-700 dark:text-violet-300")}>{t.label}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">{t.desc}</p>
                </Link>
              );
            })}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
};
