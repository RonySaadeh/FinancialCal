import { Fragment, useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash, TrendingUp } from 'lucide-react';
import { useAction, useInvestments } from '../lib/queries';
import { ASSET_TYPE_LABELS, COMMON_CURRENCIES, formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format';
import type { AssetType, Holding } from '../lib/types';
import { useFinance } from '../features/FinanceContext';
import { allocationSlices, DonutWithLegend, PortfolioChart, SERIES } from '../components/charts';
import {
  Alert, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, FormError, IconButton, MissingRatesNotice, Modal, PageHeader, Segmented, SelectField, Signed, Spinner, TextField
} from '../components/ui';

type Dialog =
  | { kind: 'holding'; holding: Holding | null }
  | { kind: 'trade'; holding: Holding | null }
  | { kind: 'price'; holding: Holding }
  | null;

export default function InvestmentsPage() {
  const q = useInvestments();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Holding | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const update = useAction('updateInvestment');
  const del = useAction('deleteInvestment');
  const delTrade = useAction('deleteInvestmentTransaction');
  const delPrice = useAction('deletePrice');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investments"
        subtitle="Manually tracked holdings — no external price feeds, nothing invented"
        actions={
          <>
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setDialog({ kind: 'holding', holding: null })}>Add holding</Button>
            <Button icon={<Plus className="size-4" />} disabled={!q.data?.holdings.length} onClick={() => setDialog({ kind: 'trade', holding: null })}>Record trade</Button>
          </>
        }
      />
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (() => {
        const d = q.data;
        const c = d.currency;
        const holdings = d.holdings.filter((h) => showArchived || !h.archived);
        if (!d.holdings.length) {
          return <Card><EmptyState icon={<TrendingUp className="size-6" />} title="No investments yet" description="Add a holding (stock, ETF, fund, bond, crypto, gold, property…), then record purchases and sales. Update prices manually whenever you like." action={<Button onClick={() => setDialog({ kind: 'holding', holding: null })}>Add holding</Button>} /></Card>;
        }
        return (
          <>
            <MissingRatesNotice currencies={d.missingRates} base={c} />
            {d.staleCount > 0 && <Alert>{d.staleCount} holding{d.staleCount > 1 ? 's have' : ' has'} a price older than {d.stalePriceDays} days. Values use that last known price — update them for an accurate picture.</Alert>}
            <FormError error={update.error ?? delTrade.error ?? delPrice.error} />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Market value" value={formatMoney(d.totals.marketValue, c)} />
              <Stat label="Cost basis" value={formatMoney(d.totals.costBasis, c)} hint="Weighted average cost" />
              <Stat label="Unrealised P/L" value={<Signed value={d.totals.unrealizedPL}>{formatMoney(d.totals.unrealizedPL, c, { sign: true })}</Signed>} />
              <Stat label="Realised P/L" value={<Signed value={d.totals.realizedPL}>{formatMoney(d.totals.realizedPL, c, { sign: true })}</Signed>} hint="From sales" />
              <Stat label="Return" value={<Signed value={d.totals.returnPct}>{formatPercent(d.totals.returnPct, 1, true)}</Signed>} hint="Unrealised ÷ cost basis" />
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader title="Allocation by asset type" />
                <div className="p-5">{d.allocationByType.length ? <DonutWithLegend slices={allocationSlices(d.allocationByType)} currency={c} label="Allocation by asset type" height={170} /> : <p className="text-sm text-ink-3">No current holdings.</p>}</div>
              </Card>
              <Card>
                <CardHeader title="Allocation by holding" />
                <div className="p-5">
                  {d.allocationByHolding.length ? (
                    <DonutWithLegend slices={d.allocationByHolding.map((h) => ({ key: h.id, label: h.ticker || h.name, value: h.value, color: holdingColor(d.holdings, h.id) }))} currency={c} label="Allocation by holding" height={170} />
                  ) : <p className="text-sm text-ink-3">No current holdings.</p>}
                </div>
              </Card>
              <Card>
                <CardHeader title="Portfolio performance" subtitle="Month-end value from recorded prices" />
                <div className="p-5"><PortfolioChart data={d.history} currency={c} height={190} /></div>
              </Card>
            </div>
            <Card className="overflow-hidden">
              <CardHeader title="Holdings" subtitle="Click a holding to see its trades and price history" action={d.holdings.some((h) => h.archived) && <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</Button>} />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-ink-3">
                    <tr>
                      <th className="px-4 py-3 font-medium">Holding</th>
                      <th className="px-4 py-3 text-right font-medium">Quantity</th>
                      <th className="px-4 py-3 text-right font-medium">Avg cost</th>
                      <th className="px-4 py-3 text-right font-medium">Price</th>
                      <th className="px-4 py-3 text-right font-medium">Value</th>
                      <th className="px-4 py-3 text-right font-medium">Unrealised</th>
                      <th className="px-4 py-3 text-right font-medium">Realised</th>
                      <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {holdings.map((h) => {
                      const m = h.metrics;
                      const isOpen = expanded === h.id;
                      return (
                        <Fragment key={h.id}>
                          <tr className={`hover:bg-surface-2 ${h.archived ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-3">
                              <button type="button" className="flex items-center gap-2 text-left" onClick={() => setExpanded(isOpen ? null : h.id)} aria-expanded={isOpen}>
                                {isOpen ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronRight className="size-4 text-ink-3" />}
                                <span>
                                  <span className="block font-medium text-ink">{h.name}{h.ticker ? <span className="ml-1.5 text-xs text-ink-3">{h.ticker}</span> : null}</span>
                                  <span className="block text-xs text-ink-3">{ASSET_TYPE_LABELS[h.assetType]} · {h.currency}</span>
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right tabular">{formatNumber(m.quantity, 8)}</td>
                            <td className="px-4 py-3 text-right tabular">{m.quantity > 0 ? formatMoney(m.averageCost, h.currency) : '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="tabular">{formatMoney(m.price, h.currency)}</span>
                              <span className="block text-xs text-ink-3">
                                {m.priceDate ? `${m.priceSource === 'trade' ? 'trade' : 'manual'} · ${formatDate(m.priceDate)}` : 'no price'}
                              </span>
                              {m.stale && <Badge tone="warning">Outdated</Badge>}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular">{formatMoney(m.marketValue, h.currency)}</td>
                            <td className="px-4 py-3 text-right">
                              <Signed value={m.unrealizedPL}>{formatMoney(m.unrealizedPL, h.currency, { sign: true })}</Signed>
                              <span className="block text-xs"><Signed value={m.returnPct}>{formatPercent(m.returnPct, 1, true)}</Signed></span>
                            </td>
                            <td className="px-4 py-3 text-right"><Signed value={m.realizedPL}>{formatMoney(m.realizedPL, h.currency, { sign: true })}</Signed></td>
                            <td className="whitespace-nowrap px-2 py-3 text-right">
                              <IconButton label={`Update ${h.name} price`} onClick={() => setDialog({ kind: 'price', holding: h })}><RefreshCw className="size-4" /></IconButton>
                              <IconButton label={`Record trade for ${h.name}`} onClick={() => setDialog({ kind: 'trade', holding: h })}><Plus className="size-4" /></IconButton>
                              <IconButton label={`Edit ${h.name}`} onClick={() => setDialog({ kind: 'holding', holding: h })}><Pencil className="size-4" /></IconButton>
                              <IconButton label={h.archived ? 'Restore holding' : 'Archive holding'} onClick={() => update.mutate({ id: h.id, archived: !h.archived })}>{h.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</IconButton>
                              <IconButton label={`Delete ${h.name}`} onClick={() => { del.reset(); setDeleting(h); }}><Trash className="size-4" /></IconButton>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-surface-2">
                              <td colSpan={8} className="px-4 py-4">
                                <div className="grid gap-6 lg:grid-cols-2">
                                  <div>
                                    <p className="mb-2 text-xs font-semibold text-ink-2">Trades</p>
                                    {h.transactions.length ? (
                                      <table className="w-full text-xs">
                                        <thead className="text-left text-ink-3"><tr><th className="py-1 font-medium">Date</th><th className="font-medium">Type</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">Fees</th><th /></tr></thead>
                                        <tbody className="divide-y divide-line">
                                          {h.transactions.map((t) => (
                                            <tr key={t.id}>
                                              <td className="py-1.5">{formatDate(t.date)}</td>
                                              <td><Badge tone={t.type === 'buy' ? 'brand' : 'neutral'}>{t.type}</Badge></td>
                                              <td className="text-right tabular">{formatNumber(t.quantity, 8)}</td>
                                              <td className="text-right tabular">{formatMoney(t.price, h.currency)}</td>
                                              <td className="text-right tabular">{formatMoney(t.fees, h.currency)}</td>
                                              <td className="text-right"><IconButton label="Delete trade" disabled={delTrade.isPending} onClick={() => delTrade.mutate({ id: t.id })}><Trash className="size-3.5" /></IconButton></td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : <p className="text-xs text-ink-3">No trades yet.</p>}
                                    <p className="mt-2 text-xs text-ink-3">Invested {formatMoney(m.totalInvested, h.currency)} · proceeds {formatMoney(m.totalProceeds, h.currency)} · fees {formatMoney(m.feesPaid, h.currency)}</p>
                                  </div>
                                  <div>
                                    <p className="mb-2 text-xs font-semibold text-ink-2">Manual price history</p>
                                    {h.prices.length ? (
                                      <ul className="divide-y divide-line text-xs">
                                        {h.prices.map((p) => (
                                          <li key={p.id} className="flex items-center justify-between py-1.5">
                                            <span>{formatDate(p.date)}</span>
                                            <span className="flex items-center gap-2 tabular">{formatMoney(p.price, h.currency)}<IconButton label="Delete price" disabled={delPrice.isPending} onClick={() => delPrice.mutate({ id: p.id })}><Trash className="size-3.5" /></IconButton></span>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : <p className="text-xs text-ink-3">No manual prices — the last trade price is used.</p>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-ink-3">
              Cost basis uses the weighted average cost method: purchase fees are added to cost; a sale realises (price × quantity − fees) − average cost × quantity.
              Trades linked to a cash account move money as transfers, so purchases never count as spending.
            </p>
          </>
        );
      })()}

      <Modal open={dialog?.kind === 'holding'} onClose={() => setDialog(null)} title={dialog?.kind === 'holding' && dialog.holding ? 'Edit holding' : 'Add holding'}>
        {dialog?.kind === 'holding' && <HoldingForm holding={dialog.holding} onDone={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === 'trade'} onClose={() => setDialog(null)} title="Record trade">
        {dialog?.kind === 'trade' && q.data && <TradeForm holdings={q.data.holdings.filter((h) => !h.archived)} initial={dialog.holding} onDone={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === 'price'} onClose={() => setDialog(null)} title={`Update price · ${dialog?.kind === 'price' ? dialog.holding.name : ''}`}>
        {dialog?.kind === 'price' && <PriceForm holding={dialog.holding} onDone={() => setDialog(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting} title="Delete holding?" loading={del.isPending} error={del.error}
        message={<>Delete <strong>{deleting?.name}</strong> with all its trades, prices and linked cash transfers? Account balances will change accordingly. Archive it instead to keep history.</>}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

/** Colour follows the holding (stable alphabetical slot), not its rank by value. */
function holdingColor(all: Holding[], id: string) {
  const order = [...all].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return SERIES[Math.max(0, order.findIndex((h) => h.id === id)) % SERIES.length];
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight tabular">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

function HoldingForm({ holding, onDone }: { holding: Holding | null; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addInvestment');
  const update = useAction('updateInvestment');
  const m = holding ? update : add;
  const [name, setName] = useState(holding?.name ?? '');
  const [ticker, setTicker] = useState(holding?.ticker ?? '');
  const [assetType, setAssetType] = useState<AssetType>(holding?.assetType ?? 'stock');
  const [currency, setCurrency] = useState(holding?.currency ?? f.base);
  const [notes, setNotes] = useState(holding?.notes ?? '');
  const locked = !!holding && holding.transactions.length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name, ticker, assetType, notes };
    if (!locked) payload.currency = currency;
    if (holding) payload.id = holding.id;
    m.mutate(payload, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Asset name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vanguard S&P 500 ETF" />
        <TextField label="Ticker (optional)" maxLength={20} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="VOO" />
        <SelectField label="Asset type" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
          {Object.entries(ASSET_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <SelectField label="Currency" value={currency} disabled={locked} onChange={(e) => setCurrency(e.target.value)} hint={locked ? 'Locked once trades exist' : 'Currency the asset is priced in'}>
          {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </SelectField>
      </div>
      <TextField label="Notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <FormError error={m.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>{holding ? 'Save' : 'Add holding'}</Button>
      </div>
    </form>
  );
}

function TradeForm({ holdings, initial, onDone }: { holdings: Holding[]; initial: Holding | null; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('addInvestmentTransaction');
  const [investmentId, setInvestmentId] = useState(initial?.id ?? holdings[0]?.id ?? '');
  const holding = holdings.find((h) => h.id === investmentId);
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [date, setDate] = useState(f.today);
  const [cashAccountId, setCash] = useState('');
  const [note, setNote] = useState('');
  const accounts = f.openAccounts.filter((a) => a.currency === holding?.currency);
  const gross = Number(quantity || 0) * Number(price || 0);
  const cash = type === 'buy' ? gross + Number(fees || 0) : gross - Number(fees || 0);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate({ investmentId, type, quantity: Number(quantity), price: Number(price), fees: Number(fees || 0), date, cashAccountId, note }, { onSuccess: onDone }); }}>
      <SelectField label="Holding" value={investmentId} onChange={(e) => { setInvestmentId(e.target.value); setCash(''); }}>
        {holdings.map((h) => <option key={h.id} value={h.id}>{h.name}{h.ticker ? ` (${h.ticker})` : ''} · {h.currency}</option>)}
      </SelectField>
      <Segmented label="Trade type" value={type} onChange={setType} options={[{ value: 'buy', label: 'Buy / contribute' }, { value: 'sell', label: 'Sell' }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Quantity" type="number" min="0" step="any" required value={quantity} onChange={(e) => setQuantity(e.target.value)} hint={type === 'sell' && holding ? `You hold ${formatNumber(holding.metrics.quantity, 8)}` : 'Units, shares, grams…'} />
        <TextField label={`Price per unit (${holding?.currency ?? ''})`} type="number" min="0" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
        <TextField label="Fees" type="number" min="0" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <SelectField label={type === 'buy' ? 'Paid from cash account' : 'Proceeds to cash account'} value={cashAccountId} onChange={(e) => setCash(e.target.value)}
        hint={accounts.length ? 'Creates a linked transfer so the account balance stays right. Not counted as spending.' : `No open ${holding?.currency ?? ''} accounts to link.`}>
        <option value="">Don’t link to an account</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </SelectField>
      <TextField label="Note (optional)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      {holding && gross > 0 && <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-2">{type === 'buy' ? 'Total cost' : 'Net proceeds'}: <strong className="tabular">{formatMoney(cash, holding.currency)}</strong></p>}
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={add.isPending} disabled={!investmentId}>Save trade</Button>
      </div>
    </form>
  );
}

function PriceForm({ holding, onDone }: { holding: Holding; onDone: () => void }) {
  const f = useFinance();
  const add = useAction('updateInvestmentPrice');
  const [price, setPrice] = useState(holding.metrics.price !== null ? String(holding.metrics.price) : '');
  const [date, setDate] = useState(f.today);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate({ investmentId: holding.id, price: Number(price), date }, { onSuccess: onDone }); }}>
      <p className="text-sm text-ink-2">Enter the current market price from your broker or a trusted source. It’s stored with its date so outdated prices are flagged.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={`Price per unit (${holding.currency})`} type="number" min="0" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
        <TextField label="Price date" type="date" required max={f.today} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <FormError error={add.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={add.isPending}>Save price</Button>
      </div>
    </form>
  );
}
