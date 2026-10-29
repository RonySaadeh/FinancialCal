import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  ArrowLeftRight, ChartPie, FileChartColumn, Landmark, LayoutDashboard, LogOut, Menu, Moon, PiggyBank, Plus,
  Shield, Sun, Tags, Target, TrendingUp, UserRound, Wallet, X, Monitor, Loader2, Check
} from 'lucide-react';
import { useAuth, useUser } from '../../features/auth/AuthProvider';
import { useTheme } from '../../features/theme/ThemeProvider';
import { FinanceProvider } from '../../features/FinanceContext';
import { TransactionForm, type TransactionDraft } from '../../features/transactions/TransactionForm';
import { Button, cx, IconButton } from '../ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/spending', label: 'Spending', icon: ChartPie },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/goals', label: 'Savings goals', icon: PiggyBank },
  { to: '/debts', label: 'Debts', icon: Landmark },
  { to: '/investments', label: 'Investments', icon: TrendingUp },
  { to: '/reports', label: 'Reports', icon: FileChartColumn },
  { to: '/categories', label: 'Categories', icon: Tags }
];

interface QuickAdd {
  openTransaction: (draft?: TransactionDraft) => void;
}
const QuickAddContext = createContext<QuickAdd>({ openTransaction: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path d="M4 17l5-5 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Financial Cal</p>
        <p className="text-[11px] text-sidebar-ink/70">Family finances</p>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const items = [...NAV, { to: '/profile', label: 'Profile', icon: UserRound }, ...(user.role === 'admin' ? [{ to: '/admin', label: 'Users', icon: Shield }] : [])];
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <div className="flex h-full flex-col bg-sidebar px-3 py-5 text-sidebar-ink">
      <Brand />
      <nav className="mt-8 flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
        {items.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-sidebar-active text-white' : 'hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="size-4.5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
            <p className="truncate text-xs text-sidebar-ink/70">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-1 px-1">
          <button type="button" onClick={() => setTheme(nextTheme)} className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs hover:bg-white/5 hover:text-white" aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}>
            <ThemeIcon className="size-4" aria-hidden /> {theme[0].toUpperCase() + theme.slice(1)}
          </button>
          <button type="button" onClick={() => signOut()} className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs hover:bg-white/5 hover:text-white">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shows "Saving…" while any change is being written to Google Sheets, then "Saved". */
function SaveStatus() {
  const pending = useIsMutating();
  const [justSaved, setJustSaved] = useState(false);
  const was = useRef(0);
  useEffect(() => {
    if (was.current > 0 && pending === 0) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      was.current = pending;
      return () => clearTimeout(t);
    }
    was.current = pending;
  }, [pending]);
  if (pending > 0) {
    return <span className="flex items-center gap-1.5 text-xs text-ink-3" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden />Saving…</span>;
  }
  if (justSaved) return <span className="flex items-center gap-1.5 text-xs text-positive" role="status"><Check className="size-3.5" aria-hidden />Saved</span>;
  return null;
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [draft, setDraft] = useState<TransactionDraft | undefined>();
  const location = useLocation();
  const title = [...NAV, { to: '/profile', label: 'Profile' }, { to: '/admin', label: 'Users' }].find((n) => n.to === location.pathname)?.label ?? 'Financial Cal';

  const quick: QuickAdd = {
    openTransaction: (d) => {
      setDraft(d);
      setTxOpen(true);
    }
  };

  return (
    <QuickAddContext.Provider value={quick}>
      <div className="min-h-dvh lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
          <SideNav />
        </aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-2xl">
              <SideNav onNavigate={() => setMobileOpen(false)} />
              <IconButton label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 text-white hover:bg-white/10">
                <X className="size-5" />
              </IconButton>
            </div>
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page/85 px-4 backdrop-blur lg:px-8">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
          <p className="flex-1 truncate text-sm font-medium text-ink-2 lg:hidden">{title}</p>
          <div className="ml-auto flex items-center gap-3">
            <SaveStatus />
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => quick.openTransaction()}>
              Add transaction
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <FinanceProvider>
            <Outlet />
            <TransactionForm open={txOpen} onClose={() => setTxOpen(false)} draft={draft} />
          </FinanceProvider>
        </main>
      </div>
    </QuickAddContext.Provider>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}
