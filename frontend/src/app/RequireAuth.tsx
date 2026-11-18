import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/features/auth/session';
import { Spinner } from '@/components/ui/States';

/** Gate for signed-in routes. UI gating only; every API call is authorised by the server. */
export function RequireAuth() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'booting') {
    return <div className="grid min-h-dvh place-items-center"><Spinner label="Opening ManageEDocs" /></div>;
  }
  if (status === 'signedOut') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Hides a page from users without the capability (the API would refuse them anyway). */
export function RequireCapability({ code, children }: { code: string; children: React.ReactNode }) {
  const allowed = useSession((s) => s.user?.permissions.includes(code) ?? false);
  if (!allowed) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="doc-title text-xl">You don’t have access to this page</h1>
        <p className="mt-2 text-[13.5px] text-muted">Ask your administrator if you need it for your work.</p>
      </div>
    );
  }
  return <>{children}</>;
}
