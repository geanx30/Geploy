import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Account from './pages/Account.jsx';
import FileManager from './pages/FileManager.jsx';
import ChangePasswordRequired from './pages/ChangePasswordRequired.jsx';
import UsersAdmin from './pages/admin/Users.jsx';
import SystemsAdmin from './pages/admin/Systems.jsx';
import AuditAdmin from './pages/admin/Audit.jsx';
import ApprovalsAdmin from './pages/admin/Approvals.jsx';
import SmtpAdmin from './pages/admin/Smtp.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Carregando...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user.must_change_password) {
    return <ChangePasswordRequired />;
  }
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/account" element={<Account />} />
                <Route path="/systems/:id/files" element={<FileManager />} />
                <Route
                  path="/admin/users"
                  element={
                    <RequireAdmin>
                      <UsersAdmin />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/systems"
                  element={
                    <RequireAdmin>
                      <SystemsAdmin />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <RequireAdmin>
                      <AuditAdmin />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/approvals"
                  element={
                    <RequireAdmin>
                      <ApprovalsAdmin />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/smtp"
                  element={
                    <RequireAdmin>
                      <SmtpAdmin />
                    </RequireAdmin>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
