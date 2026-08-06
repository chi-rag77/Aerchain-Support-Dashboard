import { Ticket } from "../types/freshdesk";
import { ticketRef } from "@/lib/tickets";

const priorityLabel = (p: number) =>
  ({ 1: "Low", 2: "Medium", 3: "High", 4: "Critical" }[p] ?? String(p));

const statusLabel = (s: number) =>
  ({ 2: "Open", 3: "In Progress", 4: "Resolved", 5: "Closed", 6: "Waiting" }[s] ?? String(s));

export const exportTicketsCSV = (tickets: Ticket[], filename = "tickets.csv") => {
  const headers = [
    "Ticket ID",
    "Subject",
    "Priority",
    "Status",
    "Requester",
    "Assignee",
    "Company",
    "Tags",
    "Created At",
    "Updated At",
  ];

  const rows = tickets.map((t) => [
    ticketRef(t),
    `"${t.subject.replace(/"/g, '""')}"`,
    priorityLabel(t.priority),
    statusLabel(t.status),
    t.requester_name ?? "",
    t.responder_name ?? "Unassigned",
    t.company_name ?? "",
    t.tags.join("; "),
    t.created_at,
    t.updated_at,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
