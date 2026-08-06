import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

const FullScreen = ({ children }: { children: ReactNode }) => (
  <div className="grid h-screen place-items-center bg-background text-sm text-muted-foreground">
    {children}
  </div>
);

/** Requires a logged-in user (or auth disabled in demo mode). */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, authDisabled } = useAuth();
  const location = useLocation();

  if (authDisabled) return <>{children}</>;
  if (loading) return <FullScreen>Loading…</FullScreen>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};

/** Requires a logged-in admin. */
export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { session, isAdmin, loading, authDisabled } = useAuth();
  const location = useLocation();

  if (authDisabled) return <>{children}</>;
  if (loading) return <FullScreen>Loading…</FullScreen>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};
