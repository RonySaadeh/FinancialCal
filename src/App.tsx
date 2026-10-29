import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { useAuth, useUser } from './features/auth/AuthProvider';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { Spinner } from './components/ui';

// Hash routing (#/transactions) keeps deep links working on GitHub Pages,
// which has no server-side rewrites. Heavier pages load on demand.
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const SpendingPage = lazy(() => import('./pages/SpendingPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const DebtsPage = lazy(() => import('./pages/DebtsPage'));
const InvestmentsPage = lazy(() => import('./pages/InvestmentsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const page = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

function AdminOnly({ children }: { children: ReactNode }) {
  const user = useUser();
  return user.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'transactions', element: page(<TransactionsPage />) },
      { path: 'spending', element: page(<SpendingPage />) },
      { path: 'accounts', element: page(<AccountsPage />) },
      { path: 'budgets', element: page(<BudgetsPage />) },
      { path: 'goals', element: page(<GoalsPage />) },
      { path: 'debts', element: page(<DebtsPage />) },
      { path: 'investments', element: page(<InvestmentsPage />) },
      { path: 'reports', element: page(<ReportsPage />) },
      { path: 'categories', element: page(<CategoriesPage />) },
      { path: 'profile', element: page(<ProfilePage />) },
      { path: 'admin', element: page(<AdminOnly><AdminPage /></AdminOnly>) },
      { path: '*', element: page(<NotFoundPage />) }
    ]
  }
]);

export default function App() {
  const { status } = useAuth();
  if (status === 'checking') return <Spinner label="Restoring your session…" />;
  if (status === 'signedOut') return <LoginPage />;
  return <RouterProvider router={router} />;
}
