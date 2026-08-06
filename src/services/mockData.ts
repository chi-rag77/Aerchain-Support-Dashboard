import { Ticket, Conversation } from '../types/freshdesk';
import { subHours, subDays, formatISO } from 'date-fns';

const mockDefaults = {
  ticket_type: null as null,
  module: null as null,
  sub_type: null as null,
  fr_due_by: null as null,
  due_by: null as null,
  fr_escalated: false,
  is_escalated: false,
  spam: false,
  custom_fields: {} as Record<string, unknown>,
};

export const MOCK_TICKETS: Ticket[] = [
  {
    ...mockDefaults,
    id: 10245,
    subject: "Critical: Latency spikes in Order Management System",
    description: "We are observing intermittent latency spikes exceeding 500ms in the OMS gateway.",
    priority: 4,
    status: 2,
    created_at: formatISO(subHours(new Date(), 1)),
    updated_at: formatISO(subHours(new Date(), 0.5)),
    requester_id: 1,
    company_id: 101,
    company_name: "Meta",
    requester_name: "Rajesh Kumar",
    responder_id: 501,
    responder_name: "Ananya Sharma",
    tags: ["Performance", "OMS"],
    ticket_type: "Bug",
    module: "PO",
  },
  {
    ...mockDefaults,
    id: 10246,
    subject: "User Access: New trader onboarding request",
    description: "Requesting access for 5 new traders from the institutional desk.",
    priority: 2,
    status: 3,
    created_at: formatISO(subHours(new Date(), 4)),
    updated_at: formatISO(subHours(new Date(), 2)),
    requester_id: 2,
    company_id: 101,
    company_name: "Danone",
    requester_name: "Suresh Raina",
    responder_id: 502,
    responder_name: "Vikram Singh",
    tags: ["Onboarding"],
    ticket_type: "Service Task",
    module: "Org Settings",
  },
  {
    ...mockDefaults,
    id: 10247,
    subject: "Report Generation: Monthly compliance report failing",
    description: "The automated compliance report for February failed to generate this morning.",
    priority: 3,
    status: 2,
    created_at: formatISO(subHours(new Date(), 12)),
    updated_at: formatISO(subHours(new Date(), 10)),
    requester_id: 3,
    company_id: 101,
    company_name: "Unilever",
    requester_name: "Priya Mehta",
    responder_id: null,
    responder_name: "Unassigned",
    tags: ["Compliance"],
    ticket_type: "Bug",
    module: "Reports",
  },
  {
    ...mockDefaults,
    id: 10248,
    subject: "API Integration: Webhook timeout on trade confirmation",
    description: "Our listener is timing out when receiving trade confirmations from Aerchain.",
    priority: 4,
    status: 2,
    created_at: formatISO(subHours(new Date(), 0.2)),
    updated_at: formatISO(subHours(new Date(), 0.1)),
    requester_id: 4,
    company_id: 101,
    company_name: "Meta",
    requester_name: "Amit Shah",
    responder_id: 501,
    responder_name: "Ananya Sharma",
    tags: ["API", "Webhook"],
    ticket_type: "Bug",
    module: "Invoice",
  }
];

export const MOCK_CONVERSATIONS: Record<number, Conversation[]> = {
  10245: [
    {
      id: 1,
      body: "We are seeing latency spikes. Please investigate immediately.",
      user_id: 1,
      incoming: true,
      created_at: formatISO(subHours(new Date(), 1))
    },
    {
      id: 2,
      body: "Acknowledged. Our engineering team is looking into the gateway logs now.",
      user_id: 501,
      incoming: false,
      created_at: formatISO(subHours(new Date(), 0.8))
    }
  ]
};