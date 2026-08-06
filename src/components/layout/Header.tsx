import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Ticket as TicketIcon, FileBarChart, Bell, Moon, Sun,
  RefreshCw, ShieldCheck, LogOut, Users, Users2, SlidersHorizontal, ScrollText,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { ALL_CUSTOMERS } from "@/config";
import { cn } from "@/lib/utils";
import { AerchainLogo } from "@/components/AerchainLogo";
import { isUsingRealAPI } from "@/services/freshdesk";
import { useAuth } from "@/auth/AuthProvider";
import { initials } from "@/lib/tickets";
import { formatDistanceToNow } from "date-fns";

interface Props {
  onOpenCommand?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | null;
  /** Customer filter — omitted / single-customer deployments hide the control. */
  companies?: string[];
  selectedCompany?: string;
  onSelectCompany?: (v: string) => void;
}

export const Header = ({
  onRefresh, isRefreshing, lastUpdated,
  companies = [], selectedCompany = ALL_CUSTOMERS, onSelectCompany,
}: Props) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { profile, isAdmin, signOut, authDisabled } = useAuth();

  const nav = [
    { label: "Home", path: "/", icon: Home },
    { label: "Tickets", path: "/tickets", icon: TicketIcon },
    // Teams & Reports are admin-only; Admin has its own button beside the profile.
    ...(isAdmin
      ? [
          { label: "Teams", path: "/teams", icon: Users2 },
          { label: "Reports", path: "/reports", icon: FileBarChart },
        ]
      : []),
  ];

  const isActive = (path: string) =>
    path === "/admin/users" ? pathname.startsWith("/admin") : pathname === path;

  const displayName = profile?.full_name || profile?.email || "User";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E8E8F0] bg-white dark:border-border dark:bg-[#0F0F1A]">
      <div className="flex h-[60px] items-center px-6 md:px-8">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-7">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            {/* Aerchain brand mark (public/logos/aerchain-logo.png|svg) */}
            <AerchainLogo height={30} />
          </Link>

          <nav className="hidden md:block">
            <div className="flex items-center gap-0.5 rounded-full border border-[#E2E2EE] bg-[#F5F5FB] p-1 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-border dark:bg-secondary/40">
              {nav.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "group relative flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[13px] font-medium transition-all duration-200",
                      active
                        ? "bg-[#6B4EFF] text-white shadow-[0_2px_12px_rgba(107,78,255,0.35)]"
                        : "text-[#6B6B8A] hover:bg-white hover:text-[#1A1A2E] hover:shadow-[0_1px_4px_rgba(0,0,0,0.08)] dark:text-muted-foreground dark:hover:bg-secondary dark:hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("h-[14px] w-[14px] shrink-0", active ? "text-white" : "text-[#9090A8] group-hover:text-[#6B4EFF] dark:text-muted-foreground")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {companies.length > 1 && onSelectCompany && (
            <div className="mr-2 hidden items-center sm:flex">
              <Select value={selectedCompany} onValueChange={onSelectCompany}>
                <SelectTrigger className="h-9 w-[190px] rounded-full border-[#E2E2EE] bg-[#F5F5FB] text-[12.5px] font-medium dark:border-border dark:bg-secondary/40">
                  <Building2 className="h-[14px] w-[14px] shrink-0 text-[#9090A8]" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CUSTOMERS}>All customers</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <span
            className={cn(
              "mr-2 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold xl:flex",
              isUsingRealAPI() ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", isUsingRealAPI() ? "animate-pulse bg-emerald-500" : "bg-amber-400")} />
            {isUsingRealAPI() ? "Live" : "Demo"}
          </span>

          {onRefresh && (
            <Button
              variant="ghost" size="icon"
              className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
              onClick={onRefresh} disabled={isRefreshing}
              title={lastUpdated ? `Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}` : "Refresh"}
            >
              <RefreshCw className={cn("h-[17px] w-[17px]", isRefreshing && "animate-spin")} />
            </Button>
          )}

          <Button
            variant="ghost" size="icon"
            className="relative h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
          >
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-rose-500 ring-[1.5px] ring-white dark:ring-background" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className="h-9 w-9 rounded-full text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
          </Button>

          {/* Admin — quick access beside the profile (admins only) */}
          {isAdmin && (
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate("/admin/users")}
              title="Admin"
              className={cn(
                "ml-0.5 h-9 gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-[#6B4EFF] text-white hover:bg-[#5B3EEF] hover:text-white shadow-[0_2px_12px_rgba(107,78,255,0.35)]"
                  : "text-[#6B6B8A] hover:bg-[#F0F0FA] hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:bg-secondary",
              )}
            >
              <ShieldCheck className="h-[16px] w-[16px]" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          )}

          <span className="mx-1.5 h-5 w-px bg-[#E2E2EE] dark:bg-border" />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full outline-none">
                <Avatar className="h-8 w-8 cursor-pointer transition-transform hover:scale-105">
                  <AvatarFallback className="bg-[#6B4EFF] text-[11px] font-bold text-white">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold">{displayName}</span>
                {profile?.email && <span className="truncate text-[11px] font-normal text-muted-foreground">{profile.email}</span>}
                {isAdmin && (
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                    <ShieldCheck className="h-3 w-3" /> System Admin
                  </span>
                )}
              </DropdownMenuLabel>

              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                    <Users className="mr-2 h-4 w-4" /> Manage users
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/sla")}>
                    <SlidersHorizontal className="mr-2 h-4 w-4" /> SLA rules
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/logs")}>
                    <ScrollText className="mr-2 h-4 w-4" /> Sync logs
                  </DropdownMenuItem>
                </>
              )}

              {!authDisabled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-rose-600 focus:text-rose-600 dark:text-rose-400">
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
