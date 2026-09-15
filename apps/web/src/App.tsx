import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { InventoryPage } from './pages/InventoryPage';
import { FileDetailPage } from './pages/FileDetailPage';
import { DispatchPage } from './pages/DispatchPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { CabinetsPage } from './pages/CabinetsPage';
import { FileExplorerPage } from './pages/FileExplorerPage';
import { ConvertPage } from './pages/ConvertPage';
import { DocumentViewerPage } from './pages/DocumentViewerPage';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { UsersPage } from './pages/UsersPage';
import { FileRequestsPage } from './pages/FileRequestsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/inventory"
        element={<ProtectedRoute><InventoryPage /></ProtectedRoute>}
      />
      <Route
        path="/inventory/:id"
        element={<ProtectedRoute><FileDetailPage /></ProtectedRoute>}
      />
      <Route
        path="/dispatch"
        element={<ProtectedRoute><DispatchPage /></ProtectedRoute>}
      />
      <Route
        path="/returns"
        element={<ProtectedRoute><ReturnsPage /></ProtectedRoute>}
      />
      <Route
        path="/audit"
        element={<ProtectedRoute><AuditPage /></ProtectedRoute>}
      />
      <Route
        path="/reports"
        element={<ProtectedRoute><ReportsPage /></ProtectedRoute>}
      />
      <Route
        path="/cabinets"
        element={<ProtectedRoute><CabinetsPage /></ProtectedRoute>}
      />
      <Route
        path="/explorer"
        element={<ProtectedRoute><FileExplorerPage /></ProtectedRoute>}
      />
      <Route
        path="/tools"
        element={<ProtectedRoute><ConvertPage /></ProtectedRoute>}
      />
      <Route
        path="/documents/:id/view"
        element={<ProtectedRoute><DocumentViewerPage /></ProtectedRoute>}
      />
      <Route
        path="/workflows"
        element={<ProtectedRoute><WorkflowsPage /></ProtectedRoute>}
      />
      <Route
        path="/users"
        element={<ProtectedRoute><UsersPage /></ProtectedRoute>}
      />
      <Route
        path="/my-requests"
        element={<ProtectedRoute><FileRequestsPage /></ProtectedRoute>}
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
