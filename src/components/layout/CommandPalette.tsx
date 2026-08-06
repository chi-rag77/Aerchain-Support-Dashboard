import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  Clock,
  BarChart3,
  Settings,
  Plus,
  RefreshCw,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Ticket } from "@/types/freshdesk";
import { ticketRef } from "@/lib/tickets";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tickets: Ticket[];
  onSelectTicket: (t: Ticket) => void;
  onRefresh: () => void;
}

export const CommandPalette = ({ open, onOpenChange, tickets, onSelectTicket, onRefresh }: Props) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tickets, jump to a page, run a command…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go(() => navigate("/"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/tickets"))}>
            <TicketIcon className="mr-2 h-4 w-4" /> Tickets
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/sla"))}>
            <Clock className="mr-2 h-4 w-4" /> SLA Monitor
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/analytics"))}>
            <BarChart3 className="mr-2 h-4 w-4" /> Analytics
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate("/settings"))}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go(onRefresh)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh data
          </CommandItem>
          <CommandItem onSelect={() => go(() => {})}>
            <Plus className="mr-2 h-4 w-4" /> New ticket
          </CommandItem>
          <CommandItem onSelect={() => go(() => setTheme(theme === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Toggle theme
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tickets">
          {tickets.slice(0, 8).map((t) => (
            <CommandItem
              key={t.id}
              value={`${ticketRef(t)} ${t.subject}`}
              onSelect={() => go(() => onSelectTicket(t))}
            >
              <span className="mr-2 font-mono text-xs text-primary">{ticketRef(t)}</span>
              <span className="truncate">{t.subject}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
