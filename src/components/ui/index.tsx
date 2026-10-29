import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { errorMessage } from '../../lib/api';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  danger: 'bg-negative text-white hover:opacity-90'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variants[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ States */

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface-3', className)} />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-negative" aria-hidden />
      <div>
        <p className="font-medium text-ink">Couldn’t load this data</p>
        <p className="mt-1 text-sm text-ink-3">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon ?? <Inbox className="size-6" />}</div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = 'warning', children }: { tone?: 'warning' | 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    warning: 'border-warning/30 bg-warning-soft text-warning',
    error: 'border-negative/30 bg-negative-soft text-negative',
    info: 'border-brand/30 bg-brand-soft text-brand-strong',
    success: 'border-positive/30 bg-positive-soft text-positive'
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', styles)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function MissingRatesNotice({ currencies, base }: { currencies?: string[]; base: string }) {
  if (!currencies?.length) return null;
  return (
    <Alert>
      Amounts in {currencies.join(', ')} are excluded from {base} totals because no exchange rate is set.{' '}
      <a className="font-medium underline" href="#/profile">Add a rate in your profile</a>.
    </Alert>
  );
}

/* ------------------------------------------------------------------- Badge */

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'warning'; children: ReactNode; className?: string }) {
  const styles = {
    neutral: 'bg-surface-3 text-ink-2',
    brand: 'bg-brand-soft text-brand-strong',
    positive: 'bg-positive-soft text-positive',
    negative: 'bg-negative-soft text-negative',
    warning: 'bg-warning-soft text-warning'
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', styles, className)}>{children}</span>;
}

export function ProgressBar({ value, tone, label }: { value: number; tone?: 'brand' | 'positive' | 'warning' | 'negative'; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const auto = tone ?? (value > 1 ? 'negative' : value > 0.85 ? 'warning' : 'brand');
  const color = { brand: 'bg-brand', positive: 'bg-positive', warning: 'bg-warning', negative: 'bg-negative' }[auto];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------- Forms */

const inputClass =
  'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60';

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-negative">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputClass, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputClass, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputClass, 'h-auto min-h-20 py-2', className)} {...rest} />;
});

/** Labelled input that wires up id/htmlFor automatically. */
export function TextField({ label, hint, error, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <Input id={id} {...rest} />
    </Field>
  );
}

export function SelectField({ label, hint, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <Select id={id} {...rest}>
        {children}
      </Select>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 rounded border-line accent-[var(--brand)]" />
      <label htmlFor={id} className="text-sm text-ink">
        {label}
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm',
        size === 'lg' ? 'max-w-3xl' : 'max-w-lg'
      )}
      aria-label={title}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose, loading, error }: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  error?: unknown;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-2">
        <div>{message}</div>
        {error ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- Tabs */

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-brand text-brand-ink shadow-sm' : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Money with sign colouring for P/L and net values. Text tokens only; never series colours. */
export function Signed({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const tone = value === null || value === undefined || value === 0 ? 'text-ink' : value > 0 ? 'text-positive' : 'text-negative';
  return <span className={cx('tabular', tone)}>{children}</span>;
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <Alert tone="error">{errorMessage(error)}</Alert>;
}
