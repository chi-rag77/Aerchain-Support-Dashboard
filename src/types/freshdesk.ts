export type Priority = 1 | 2 | 3 | 4; // 1: Low, 2: Medium, 3: High, 4: Urgent
// Real NSE Freshdesk status codes:
//   2 Open · 3 Pending · 4 Resolved · 5 Closed · 7 On Tech · 8 Waiting on Customer · 9 On Product
export type Status = 2 | 3 | 4 | 5 | 7 | 8 | 9;

/** Freshdesk ticket "Type" (Query / Bug / Tech-Task / Service Task / Requirement / CS Task / …) */
export type TicketType = string | null;

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  priority: Priority;
  status: Status;
  created_at: string;
  updated_at: string;
  requester_id: number;
  company_id: number;
  responder_id: number | null;
  tags: string[];
  // Freshdesk-native classification fields
  ticket_type: TicketType;     // Freshdesk "Type" (Query/Bug/Tech-Task/Service Task/…)
  module: string | null;       // cf_module — PO / Invoice / GRN / PR / RFQ-QC / …
  sub_type: string | null;     // cf_issue_type — Slowness / Login / Integration / …
  // Freshdesk stats (resolved_at, first_responded_at from include=stats)
  fr_due_by: string | null;
  due_by: string | null;
  fr_escalated: boolean;
  is_escalated: boolean;
  spam: boolean;
  // Agent / company metadata
  company_name?: string;
  requester_name?: string;
  requester_email?: string;
  responder_name?: string;
  sla_policy_id?: number;
  // All Freshdesk custom_fields as a passthrough bag
  custom_fields: Record<string, unknown>;
}

export interface Conversation {
  id: number;
  body: string;
  body_text: string;
  incoming: boolean;
  private: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
  attachments: any[];
}

export type SLAStatus = 'on_track' | 'attention' | 'breached';

export interface SLAMetrics {
  remaining_time: number; // in seconds
  status: SLAStatus;
  label: string;
}