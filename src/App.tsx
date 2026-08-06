import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { BrandingProvider } from "./hooks/useBranding";
import { ProtectedRoute, AdminRoute } from "./auth/guards";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import NotFound from "./pages/NotFound";

const Reports = lazy(() => import("./pages/Reports"));
const AdminAgents = lazy(() => import("./pages/admin/AdminAgents"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSLA = lazy(() => import("./pages/admin/AdminSLA"));
const AdminLogs = lazy(() => import("./pages/admin/AdminLogs"));
const AdminBranding = lazy(() => import("./pages/admin/AdminBranding"));
const AdminSlack = lazy(() => import("./pages/admin/AdminSlack"));

const queryClient = new QueryClient();

const Loading = ({ label }: { label: string }) => (
  <div className="grid h-screen place-items-center text-sm text-muted-foreground">{label}</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
            {/* Reports is admin-only */}
            <Route
              path="/reports"
              element={
                <AdminRoute>
                  <Suspense fallback={<Loading label="Loading reports…" />}><Reports /></Suspense>
                </AdminRoute>
              }
            />

            {/* Admin-only */}
            <Route
              path="/admin/agents"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminAgents /></Suspense></AdminRoute>}
            />
            <Route
              path="/admin/users"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminUsers /></Suspense></AdminRoute>}
            />
            <Route
              path="/admin/sla"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminSLA /></Suspense></AdminRoute>}
            />
            <Route
              path="/admin/logs"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminLogs /></Suspense></AdminRoute>}
            />
            <Route
              path="/admin/branding"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminBranding /></Suspense></AdminRoute>}
            />
            <Route
              path="/admin/slack"
              element={<AdminRoute><Suspense fallback={<Loading label="Loading…" />}><AdminSlack /></Suspense></AdminRoute>}
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
