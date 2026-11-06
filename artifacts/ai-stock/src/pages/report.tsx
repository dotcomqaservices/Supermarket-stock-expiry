import { useMemo } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, Boxes, Printer, RefreshCw } from 'lucide-react';
import { useGetStore, useListProducts } from '@workspace/api-client-react';

const BRAND = 'AI Stock by dotcom.qa services';
const money = (n: number) => new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 }).format(n || 0);
const day = (v: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(v));
const statusLabel: Record<string, string> = { expired: 'Expired', expiring_soon: 'Expiring soon', safe: 'Safe' };

export default function ReportPage() {
  const { storeId = '' } = useParams<{ storeId: string }>();
  const store = useGetStore(storeId);
  const products = useListProducts(storeId);
  const generated = useMemo(() => new Date(), []);
  const rows = useMemo(() => [...(products.data || [])].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)), [products.data]);
  const totals = useMemo(() => rows.reduce((t, p) => ({
    units: t.units + p.quantity,
    cost: t.cost + p.quantity * p.costPrice,
    retail: t.retail + p.quantity * p.sellingPrice,
    expired: t.expired + (p.expiryStatus === 'expired' ? 1 : 0),
    soon: t.soon + (p.expiryStatus === 'expiring_soon' ? 1 : 0),
    atRisk: t.atRisk + (p.expiryStatus !== 'safe' ? p.quantity * p.costPrice : 0),
  }), { units: 0, cost: 0, retail: 0, expired: 0, soon: 0, atRisk: 0 }), [rows]);

  if (store.isLoading || products.isLoading) return <div className="report-page"><div className="report-sheet"><div className="skeleton" style={{ height: 34, width: 260 }} /><div className="skeleton" style={{ height: 320, marginTop: 24 }} /></div></div>;
  if (store.isError || products.isError || !store.data) return <div className="report-page"><div className="report-sheet"><div className="error-box"><span><strong>The report could not be prepared.</strong><br />Store or inventory data is unavailable.</span><button className="btn btn-soft" onClick={() => { store.refetch(); products.refetch(); }}><RefreshCw size={14} /> Retry</button></div></div></div>;
  const s = store.data;

  return <div className="report-page">
    <div className="report-actions no-print">
      <Link href={`/stores/${storeId}/inventory`} className="btn btn-plain" data-testid="link-back-inventory"><ArrowLeft size={15} /> Back to inventory</Link>
      <button className="btn btn-primary" onClick={() => window.print()} data-testid="button-print-report"><Printer size={15} /> Print report</button>
    </div>
    <article className="report-sheet" aria-label="Inventory valuation and expiry report">
      <header className="report-head">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="brand-mark"><Boxes size={19} /></span><div><strong className="display" style={{ fontSize: 20 }}>AI Stock</strong><div className="panel-kicker">{BRAND}</div></div></div>
        <div style={{ textAlign: 'right' }}><div className="eyebrow">Inventory valuation & expiry report</div><div className="mono" style={{ fontSize: 11, marginTop: 5 }} data-testid="text-report-date">Generated {generated.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}</div></div>
      </header>
      <section className="report-branch">
        <div><div className="eyebrow">Store</div><h1 className="display" style={{ margin: '5px 0', fontSize: 26 }}>{s.name}</h1><div style={{ fontSize: 12 }}>{s.branchLabel} · {s.address}</div></div>
        <div style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'right' }}>{s.contactName}<br />{s.contactPhone}<br />{s.contactEmail}</div>
      </section>
      <section className="report-totals">
        {[['Batches', String(rows.length)], ['Units on hand', totals.units.toLocaleString()], ['Cost value', money(totals.cost)], ['Retail value', money(totals.retail)], ['Expired / soon', `${totals.expired} / ${totals.soon}`], ['Cost at risk', money(totals.atRisk)]].map(([k, v]) => <div key={k}><span>{k}</span><strong className="mono">{v}</strong></div>)}
      </section>
      {rows.length === 0 ? <p style={{ fontSize: 12, color: '#6f7a72', padding: '24px 0' }}>No product batches are recorded for this branch yet.</p> :
        <table className="report-table"><thead><tr><th>Product</th><th>Batch</th><th>Category</th><th>Qty</th><th>Unit cost</th><th>Unit price</th><th>Cost value</th><th>Retail value</th><th>Expiry</th><th>Status</th></tr></thead>
          <tbody>{rows.map(p => <tr key={p.id}><td>{p.name}</td><td className="mono">{p.batchNumber}</td><td>{p.category}</td><td className="mono">{p.quantity}</td><td className="mono">{money(p.costPrice)}</td><td className="mono">{money(p.sellingPrice)}</td><td className="mono">{money(p.quantity * p.costPrice)}</td><td className="mono">{money(p.quantity * p.sellingPrice)}</td><td>{day(p.expiryDate)}</td><td><span className={`badge ${p.expiryStatus === 'expired' ? 'danger' : p.expiryStatus === 'expiring_soon' ? 'warn' : ''}`}>{statusLabel[p.expiryStatus]}</span></td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Totals</td><td className="mono">{totals.units}</td><td /><td /><td className="mono">{money(totals.cost)}</td><td className="mono">{money(totals.retail)}</td><td colSpan={2} /></tr></tfoot>
        </table>}
      <footer className="report-foot"><span>{BRAND}</span><span>Values are estimates from recorded quantities and unit prices.</span></footer>
    </article>
  </div>;
}
