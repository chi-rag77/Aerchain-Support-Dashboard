// ============================================================================
// Deployment configuration.
//
// This is the multi-customer roll-up dashboard: it shows EVERY Aerchain
// customer's support in one place, EXCEPT NSE (which has its own dedicated
// dashboard). The data scope lives in the sync-freshdesk Edge Function —
// it keeps all cf_company values except those in FRESHDESK_EXCLUDE_COMPANY_NAME
// (default "NSE"). Use the in-app "customer" filter to drill into one company.
//
//   VITE_COMPANY_NAME       short label shown in the UI; default "All Customers"
//   VITE_COMPANY_FULL_NAME  full name for the login subtitle (optional)
// ============================================================================

export const COMPANY_NAME =
  ((import.meta.env.VITE_COMPANY_NAME as string | undefined) ?? "").trim() || "All Customers";

export const COMPANY_FULL_NAME =
  ((import.meta.env.VITE_COMPANY_FULL_NAME as string | undefined) ?? "").trim() ||
  "all Aerchain customers";

// Sentinel for the "show every customer" option in the header's customer filter.
export const ALL_CUSTOMERS = "__all__";
