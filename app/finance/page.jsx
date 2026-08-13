"use client"
import { useState, useMemo, Suspense } from "react";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, BANK, EXPENSE_CATEGORIES, DOC_TYPE_META, REPORT_MENU, formatRM, formatDate, ledgerAccountLabel, ledgerAccountMeta } from '@/lib/constants';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, isMockMode } from '@/lib/supabase';

function Modal({ width, children, onClose }) {
  return (
    <div className="fmodal-overlay" onClick={onClose}>
      <div className="fmodal-box" style={{ width }} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function Toast({ msg, onDone }) { useState(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }); return <div className="ftoast">✓ {msg}</div>; }

// An account's "natural" balance direction — assets are debit-normal, revenue/
// liabilities/equity are credit-normal. Flipping the sign for credit-normal
// accounts means every total on screen reads as a plain positive number.
const DEBIT_NORMAL = (key) => key === 'ar' || key?.startsWith('bank_') || key?.startsWith('cogs_') || key?.startsWith('opex_');
function balanceFor(entries, accountKey) {
  const raw = entries.reduce((bal, e) => {
    if (e.debit_account === accountKey) bal += e.amount;
    if (e.credit_account === accountKey) bal -= e.amount;
    return bal;
  }, 0);
  return (DEBIT_NORMAL(accountKey) ? raw : -raw) || 0;
}

// A department's Cost of Service is split across per-category sub-accounts
// (cogs_<dept>_commission, cogs_<dept>_subcontractor, ...) so those show up
// as their own line in Trial Balance/General Ledger — this sums all of them
// (plus any pre-split flat cogs_<dept> entries) back into one department
// total, by matching the account-key prefix rather than an exact key.
function cogsForDept(entries, dept) {
  const keys = new Set();
  entries.forEach(e => {
    if (e.debit_account === `cogs_${dept}` || e.debit_account?.startsWith(`cogs_${dept}_`)) keys.add(e.debit_account);
    if (e.credit_account === `cogs_${dept}` || e.credit_account?.startsWith(`cogs_${dept}_`)) keys.add(e.credit_account);
  });
  return Array.from(keys).reduce((s, k) => s + balanceFor(entries, k), 0);
}

const TYPE_META = {
  invoice: { label: 'Invoice', color: DOC_TYPE_META.invoice.color, sign: '' },
  receipt: { label: 'Receipt', color: DOC_TYPE_META.receipt.color, sign: '+' },
  job_expense: { label: 'Job Cost', color: '#E85D04', sign: '-' },
  operating_expense: { label: 'Expense', color: '#EF4444', sign: '-' },
  opening_balance: { label: 'Opening Balance', color: '#6B7280', sign: '' },
  reversal: { label: 'Reversal', color: '#9B93A8', sign: '' },
};

// ── General Ledger Report — Summary / Detail / Bank & Cash tabs ──
// Summary shows gross debit/credit turnover per account (a Trial-Balance-
// style view, not netted) using the same account keys already posted
// elsewhere in the app, dressed up with short COA-style codes. Detail
// explodes each two-sided ledger entry into its own debit row and credit
// row (standard general-ledger presentation) and, once a single account is
// selected, adds a running balance column.
function GeneralLedgerReport({ entries }) {
  const router = useRouter();
  const [tab, setTab] = useState('summary');
  // In mock mode receiptPath IS the blob URL already (opened directly); in
  // live mode it's a real storage path needing a signed URL, same pattern
  // as job attachments elsewhere in the app.
  const viewReceipt = async (path) => {
    if (isMockMode) { window.open(path, '_blank'); return; }
    const { data, error } = await supabase.storage.from('job-attachments').createSignedUrl(path, 3600);
    if (error) { alert('Failed to open receipt: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [monthFrom, setMonthFrom] = useState('01');
  const [monthTo, setMonthTo] = useState('12');
  const [account, setAccount] = useState('all');
  const [bankAccountFilter, setBankAccountFilter] = useState('all');

  const years = Array.from(new Set(entries.map(e => e.date?.slice(0,4)).filter(Boolean))).sort();
  if (!years.includes(String(thisYear))) years.push(String(thisYear));
  const monthOpts = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthName = (m) => new Date(2000, parseInt(m,10)-1, 1).toLocaleDateString('en-GB', { month: 'long' });

  const inRange = useMemo(() => entries.filter(e => {
    const d = e.date?.slice(0,10);
    if (!d || d.slice(0,4) !== year) return false;
    const m = d.slice(5,7);
    return m >= monthFrom && m <= monthTo;
  }), [entries, year, monthFrom, monthTo]);

  // Summary: every account touched, gross debit/credit totals (not netted).
  const summaryRows = useMemo(() => {
    const byAccount = {};
    inRange.forEach(e => {
      if (!byAccount[e.debit_account]) byAccount[e.debit_account] = { debit: 0, credit: 0 };
      byAccount[e.debit_account].debit += e.amount;
      if (!byAccount[e.credit_account]) byAccount[e.credit_account] = { debit: 0, credit: 0 };
      byAccount[e.credit_account].credit += e.amount;
    });
    return Object.entries(byAccount).map(([key, v]) => ({ key, ...ledgerAccountMeta(key), ...v })).sort((a,b) => a.code.localeCompare(b.code));
  }, [inRange]);

  // Detail: explode each entry into a debit-side row and a credit-side row,
  // then filter to the selected account. Running balance only makes sense
  // scoped to one account, so it's blank when "All Accounts" is selected.
  const explodedRows = useMemo(() => {
    const rows = [];
    inRange.forEach(e => {
      rows.push({ id: e.id + '-d', date: e.date, account: e.debit_account, particular: e.description, ref: e.doc_number, jobId: e.job_id, receiptPath: e.receipt_path, receiptName: e.receipt_name, debit: e.amount, credit: 0, reversed: e.reversed });
      rows.push({ id: e.id + '-c', date: e.date, account: e.credit_account, particular: e.description, ref: e.doc_number, jobId: e.job_id, receiptPath: e.receipt_path, receiptName: e.receipt_name, debit: 0, credit: e.amount, reversed: e.reversed });
    });
    return rows.sort((a,b) => new Date(a.date) - new Date(b.date));
  }, [inRange]);

  const detailAccountOptions = useMemo(() => Array.from(new Set(explodedRows.map(r => r.account))).map(k => ({ key: k, ...ledgerAccountMeta(k) })).sort((a,b) => a.code.localeCompare(b.code)), [explodedRows]);
  const bankAccountOptions = detailAccountOptions.filter(o => o.key?.startsWith('bank_'));

  const buildDetailView = (rows, selectedKey) => {
    const filtered = selectedKey === 'all' ? rows : rows.filter(r => r.account === selectedKey);
    let running = 0;
    return filtered.map(r => {
      if (selectedKey !== 'all') running += r.debit - r.credit;
      return { ...r, balance: selectedKey !== 'all' ? running : null };
    });
  };

  const detailView = useMemo(() => buildDetailView(explodedRows, account), [explodedRows, account]);
  const bankRows = useMemo(() => explodedRows.filter(r => r.account?.startsWith('bank_')), [explodedRows]);
  const bankCashView = useMemo(() => buildDetailView(bankRows, bankAccountFilter), [bankRows, bankAccountFilter]);

  const DetailTable = ({ rows }) => (
    <div style={{overflowX:"auto"}}>
      <table>
        <thead><tr><th>Date</th><th>Account</th><th>Particular</th><th>Ref No</th><th>Job ID</th><th>Receipt</th><th style={{textAlign:"right"}}>Debit</th><th style={{textAlign:"right"}}>Credit</th><th style={{textAlign:"right"}}>Running Balance</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No entries for this period/account.</td></tr>}
          {rows.map(r => (
            <tr key={r.id} style={r.reversed ? { opacity: .5 } : undefined}>
              <td className="text-sm">{formatDate(r.date)}</td>
              <td className="text-sm" style={{whiteSpace:"nowrap"}}>{ledgerAccountLabel(r.account)}</td>
              <td className="text-sm">{r.particular}{r.reversed && <span className="text-xs text-muted"> (reversed)</span>}</td>
              <td className="text-sm">{r.ref || '—'}</td>
              <td className="text-sm">
                {r.jobId
                  ? <a onClick={() => router.push(`/jobs/${r.jobId}`)} style={{ color: '#3A86FF', cursor: 'pointer', fontWeight: 600 }}>{r.jobId}</a>
                  : '—'}
              </td>
              <td className="text-sm">
                {r.receiptPath
                  ? <a onClick={() => viewReceipt(r.receiptPath)} style={{ color: '#3A86FF', cursor: 'pointer' }}>📎 {r.receiptName || 'View'}</a>
                  : '—'}
              </td>
              <td style={{textAlign:"right"}}>{r.debit ? formatRM(r.debit) : '—'}</td>
              <td style={{textAlign:"right"}}>{r.credit ? formatRM(r.credit) : '—'}</td>
              <td style={{textAlign:"right",fontWeight:600}}>{r.balance == null ? '—' : formatRM(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div className="card-title">General Ledger Report</div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",marginBottom:16}}>
        <div><label className="fl">Year</label>
          <select className="fs" style={{width:110}} value={year} onChange={e=>setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div><label className="fl">Month From</label>
          <select className="fs" style={{width:150}} value={monthFrom} onChange={e=>setMonthFrom(e.target.value)}>
            {monthOpts.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
        <div><label className="fl">Month To</label>
          <select className="fs" style={{width:150}} value={monthTo} onChange={e=>setMonthTo(e.target.value)}>
            {monthOpts.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
      </div>
      <div style={{display:"flex",gap:18,borderBottom:"1px solid #F0ECF4",marginBottom:16}}>
        {[{k:'summary',l:'Summary'},{k:'detail',l:'Detail'},{k:'bank',l:'Bank / Cash'}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} style={{background:'none',border:'none',cursor:'pointer',padding:'8px 2px',fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:600,color:tab===t.k?'#E91E63':'#9B93A8',borderBottom:tab===t.k?'2px solid #E91E63':'2px solid transparent'}}>{t.l}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div style={{overflowX:"auto"}}>
          <table>
            <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th style={{textAlign:"right"}}>Debit</th><th style={{textAlign:"right"}}>Credit</th></tr></thead>
            <tbody>
              {summaryRows.length === 0 && <tr><td colSpan={5} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No entries for this period.</td></tr>}
              {summaryRows.map(r => (
                <tr key={r.key}>
                  <td className="text-sm" style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{r.code}</td>
                  <td className="text-sm">{r.label}</td>
                  <td className="text-sm">{r.type}</td>
                  <td style={{textAlign:"right"}}>{formatRM(r.debit)}</td>
                  <td style={{textAlign:"right"}}>{formatRM(r.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'detail' && (
        <>
          <div style={{marginBottom:12,maxWidth:280}}>
            <label className="fl">Account</label>
            <select className="fs" value={account} onChange={e=>setAccount(e.target.value)}>
              <option value="all">— All Accounts —</option>
              {detailAccountOptions.map(o => <option key={o.key} value={o.key}>{o.code} · {o.label}</option>)}
            </select>
          </div>
          <DetailTable rows={detailView} />
        </>
      )}

      {tab === 'bank' && (
        <>
          <div style={{marginBottom:12,maxWidth:280}}>
            <label className="fl">Bank Account</label>
            <select className="fs" value={bankAccountFilter} onChange={e=>setBankAccountFilter(e.target.value)}>
              <option value="all">— All Banks —</option>
              {bankAccountOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <DetailTable rows={bankCashView} />
        </>
      )}
    </div>
  );
}

// ── Trial Balance — every account's NET balance as of a date, split into
// the Debit or Kredit column depending on its normal side (flipped to the
// other column if a normally-debit account happens to sit credit, or vice
// versa — real bookkeeping already allows that). Totals must match; if
// they don't, something's wrong with a posting somewhere.
function TrialBalanceReport({ entries }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0,10));
  const upToDate = useMemo(() => entries.filter(e => e.date?.slice(0,10) <= asOf), [entries, asOf]);
  const rows = useMemo(() => {
    const accounts = new Set();
    upToDate.forEach(e => { accounts.add(e.debit_account); accounts.add(e.credit_account); });
    return Array.from(accounts).map(key => {
      const meta = ledgerAccountMeta(key);
      // balanceFor() already flips the sign for credit-normal accounts, so
      // a positive result sits on the account's own natural side — not
      // necessarily the Debit column. Only a negative result (an abnormal
      // balance) crosses over to the other column.
      const bal = balanceFor(upToDate, key);
      const isDebitNormal = DEBIT_NORMAL(key);
      const onDebitSide = bal >= 0 ? isDebitNormal : !isDebitNormal;
      const magnitude = Math.abs(bal);
      return { key, ...meta, debit: onDebitSide ? magnitude : 0, credit: onDebitSide ? 0 : magnitude };
    }).filter(r => r.debit || r.credit).sort((a,b) => a.code.localeCompare(b.code));
  }, [upToDate]);
  const totalDebit = rows.reduce((s,r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s,r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:14}}>Trial Balance</div>
      <div style={{marginBottom:16,maxWidth:200}}>
        <label className="fl">As of</label>
        <input type="date" className="fi" value={asOf} onChange={e=>setAsOf(e.target.value)} />
      </div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th style={{textAlign:"right"}}>Debit</th><th style={{textAlign:"right"}}>Credit</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No balances as of this date.</td></tr>}
            {rows.map(r => (
              <tr key={r.key}>
                <td className="text-sm" style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{r.code}</td>
                <td className="text-sm">{r.label}</td>
                <td className="text-sm">{r.type}</td>
                <td style={{textAlign:"right"}}>{r.debit ? formatRM(r.debit) : '—'}</td>
                <td style={{textAlign:"right"}}>{r.credit ? formatRM(r.credit) : '—'}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{fontWeight:700,borderTop:"2px solid #E8E4ED"}}>
                <td colSpan={3}>Total</td>
                <td style={{textAlign:"right"}}>{formatRM(totalDebit)}</td>
                <td style={{textAlign:"right"}}>{formatRM(totalCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 0 && (
        <div style={{marginTop:12,fontSize:12,fontWeight:600,color:balanced?"#10B981":"#EF4444"}}>
          {balanced ? "✓ Debit = Credit, balanced." : "⚠ Debit ≠ Credit — check posting."}
        </div>
      )}
    </div>
  );
}

// ── Balance Sheet — Assets = Liabilities + Equity, as of a date. No
// Liability accounts exist in this ledger yet (no AP/loan postings), so
// Liabilities always shows RM 0 — flagged rather than hidden, since it's
// a real gap once the business takes on payables, not a bug.
function BalanceSheetReport({ entries }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0,10));
  const upToDate = useMemo(() => entries.filter(e => e.date?.slice(0,10) <= asOf), [entries, asOf]);
  const arBalance = balanceFor(upToDate, 'ar');
  const bankBalances = Object.keys(BANK).map(b => ({ key: b, label: BANK[b].label, bal: balanceFor(upToDate, `bank_${b}`) }));
  const totalAssets = arBalance + bankBalances.reduce((s,b) => s + b.bal, 0);

  const deptKeys = Object.keys(DEPT);
  const totalRevenue = deptKeys.reduce((s,d) => s + balanceFor(upToDate, `revenue_${d}`), 0);
  const totalCogs = deptKeys.reduce((s,d) => s + cogsForDept(upToDate, d), 0);
  const totalOpex = EXPENSE_CATEGORIES.reduce((s,c) => s + balanceFor(upToDate, `opex_${c.value}`), 0);
  const retainedEarnings = totalRevenue - totalCogs - totalOpex;
  const openingEquity = balanceFor(upToDate, 'equity_opening');
  const totalEquity = openingEquity + retainedEarnings;
  const totalLiabilities = 0;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  const Row = ({ label, value, bold }) => (
    <div className="dept-row" style={{gridTemplateColumns:"1fr 140px",fontWeight:bold?700:400}}>
      <span>{label}</span><span style={{textAlign:"right"}}>{formatRM(value)}</span>
    </div>
  );

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:14}}>Balance Sheet</div>
      <div style={{marginBottom:16,maxWidth:200}}>
        <label className="fl">As of</label>
        <input type="date" className="fi" value={asOf} onChange={e=>setAsOf(e.target.value)} />
      </div>

      <div className="section-label" style={{marginBottom:6}}>Assets</div>
      <Row label="Accounts Receivable (AR)" value={arBalance} />
      {bankBalances.map(b => <Row key={b.key} label={b.label} value={b.bal} />)}
      <Row label="Total Assets" value={totalAssets} bold />

      <div className="section-label" style={{margin:"18px 0 6px"}}>Liabilities</div>
      <div className="text-xs text-muted" style={{marginBottom:6}}>No liability accounts recorded in the system yet (e.g. AP, loans) — will be added when needed.</div>
      <Row label="Total Liabilities" value={totalLiabilities} bold />

      <div className="section-label" style={{margin:"18px 0 6px"}}>Equity</div>
      <Row label="Opening Balance" value={openingEquity} />
      <Row label="Retained Earnings" value={retainedEarnings} />
      <Row label="Total Equity" value={totalEquity} bold />

      <div style={{marginTop:16,paddingTop:12,borderTop:"2px solid #E8E4ED"}}>
        <Row label="Assets = Liabilities + Equity?" value={totalLiabilities + totalEquity} bold />
      </div>
      <div style={{marginTop:8,fontSize:12,fontWeight:600,color:balanced?"#10B981":"#EF4444"}}>
        {balanced ? "✓ Balance sheet balanced." : "⚠ Not balanced — check posting."}
      </div>
    </div>
  );
}

// ── Cash Book Statement — classic Terimaan/Bayaran ledger per bank
// account, exploded from the same two-sided entries as the General
// Ledger's Bank/Cash tab, with a running balance.
function CashBookStatement({ entries }) {
  const bankKeys = Object.keys(BANK);
  const [bank, setBank] = useState(bankKeys[0]);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const years = Array.from(new Set(entries.map(e => e.date?.slice(0,4)).filter(Boolean))).sort();
  if (!years.includes(String(thisYear))) years.push(String(thisYear));

  const accountKey = `bank_${bank}`;
  const rows = useMemo(() => {
    const inYear = entries.filter(e => e.date?.slice(0,4) === year && (e.debit_account === accountKey || e.credit_account === accountKey));
    const exploded = inYear.map(e => ({
      id: e.id, date: e.date, particular: e.description, ref: e.doc_number,
      terimaan: e.debit_account === accountKey ? e.amount : 0,
      bayaran: e.credit_account === accountKey ? e.amount : 0,
      reversed: e.reversed,
    })).sort((a,b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    return exploded.map(r => { running += r.terimaan - r.bayaran; return { ...r, balance: running }; });
  }, [entries, year, accountKey]);
  const totalIn = rows.reduce((s,r) => s + r.terimaan, 0);
  const totalOut = rows.reduce((s,r) => s + r.bayaran, 0);

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:14}}>Cash Book Statement</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
        <div><label className="fl">Bank</label>
          <select className="fs" style={{width:160}} value={bank} onChange={e=>setBank(e.target.value)}>
            {bankKeys.map(b => <option key={b} value={b}>{BANK[b].label}</option>)}
          </select>
        </div>
        <div><label className="fl">Year</label>
          <select className="fs" style={{width:110}} value={year} onChange={e=>setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Date</th><th>Particulars</th><th>Ref No</th><th style={{textAlign:"right"}}>Receipts</th><th style={{textAlign:"right"}}>Payments</th><th style={{textAlign:"right"}}>Balance</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No activity for this bank/year.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} style={r.reversed ? { opacity: .5 } : undefined}>
                <td className="text-sm">{formatDate(r.date)}</td>
                <td className="text-sm">{r.particular}{r.reversed && <span className="text-xs text-muted"> (reversed)</span>}</td>
                <td className="text-sm">{r.ref || '—'}</td>
                <td style={{textAlign:"right",color:"#10B981"}}>{r.terimaan ? formatRM(r.terimaan) : '—'}</td>
                <td style={{textAlign:"right",color:"#EF4444"}}>{r.bayaran ? formatRM(r.bayaran) : '—'}</td>
                <td style={{textAlign:"right",fontWeight:600}}>{formatRM(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{fontWeight:700,borderTop:"2px solid #E8E4ED"}}>
                <td colSpan={3}>Total</td>
                <td style={{textAlign:"right"}}>{formatRM(totalIn)}</td>
                <td style={{textAlign:"right"}}>{formatRM(totalOut)}</td>
                <td style={{textAlign:"right"}}>{formatRM(totalIn-totalOut)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Aging Report — outstanding AR per job, bucketed by days since the
// invoice that created the balance. Uses each job's own ledger entries
// (job_id is on every entry) rather than a separate invoice/payment
// matching table, which this system doesn't have.
function AgingReport({ entries, jobs }) {
  const rows = useMemo(() => {
    const byJob = {};
    entries.forEach(e => { if (e.job_id) { (byJob[e.job_id] ||= []).push(e); } });
    const today = new Date();
    return Object.entries(byJob).map(([jobId, jobEntries]) => {
      const outstanding = balanceFor(jobEntries, 'ar');
      if (Math.abs(outstanding) < 0.01) return null;
      const invoices = jobEntries.filter(e => e.type === 'invoice' && !e.reversed).sort((a,b) => new Date(b.date) - new Date(a.date));
      const invoiceDate = invoices[0]?.date;
      const job = jobs.find(j => j.job_id === jobId);
      const days = invoiceDate ? Math.floor((today - new Date(invoiceDate)) / 864e5) : 0;
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      return { jobId, customer: job?.customer_name || jobId, invoiceDate, days, bucket, outstanding };
    }).filter(Boolean).sort((a,b) => b.days - a.days);
  }, [entries, jobs]);

  const buckets = ['0-30','31-60','61-90','90+'];
  const bucketTotals = buckets.map(b => ({ bucket: b, total: rows.filter(r => r.bucket === b).reduce((s,r) => s + r.outstanding, 0) }));
  const grandTotal = rows.reduce((s,r) => s + r.outstanding, 0);

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:14}}>Aging Report</div>
      <div className="sum-grid" style={{marginBottom:20}}>
        {bucketTotals.map(b => (
          <div key={b.bucket} className="sum-card" style={{borderLeftColor: b.bucket==='90+'?'#EF4444':b.bucket==='61-90'?'#E85D04':b.bucket==='31-60'?'#F59E0B':'#10B981'}}>
            <div className="section-label">{b.bucket} days</div>
            <div style={{fontSize:20,fontWeight:700,marginTop:6}}>{formatRM(b.total)}</div>
          </div>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Customer</th><th>Job ID</th><th>Invoice Date</th><th style={{textAlign:"center"}}>Days</th><th>Bucket</th><th style={{textAlign:"right"}}>Outstanding</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No outstanding AR.</td></tr>}
            {rows.map(r => (
              <tr key={r.jobId}>
                <td className="text-sm">{r.customer}</td>
                <td className="jid text-sm">{r.jobId}</td>
                <td className="text-sm">{formatDate(r.invoiceDate)}</td>
                <td style={{textAlign:"center"}}>{r.days}</td>
                <td><span className="type-badge" style={{color:r.bucket==='90+'?'#EF4444':'#6B7280',background:(r.bucket==='90+'?'#EF4444':'#6B7280')+"15"}}>{r.bucket}</span></td>
                <td style={{textAlign:"right",fontWeight:600}}>{formatRM(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{fontWeight:700,borderTop:"2px solid #E8E4ED"}}><td colSpan={5}>Total</td><td style={{textAlign:"right"}}>{formatRM(grandTotal)}</td></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Bank Reconciliation Report — compares the book balance (from posted
// ledger entries) against a manually-entered bank statement closing
// balance. A full reconciliation (matching each transaction against its
// cleared/uncleared status on the statement) needs a clearing-status field
// this system doesn't track yet — this is the honest, useful subset:
// a monthly "do the numbers match" check, not a full itemized reconciliation.
function BankReconciliationReport({ entries }) {
  const bankKeys = Object.keys(BANK);
  const [statementBalances, setStatementBalances] = useState({});
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0,10));
  const upToDate = useMemo(() => entries.filter(e => e.date?.slice(0,10) <= asOf), [entries, asOf]);

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:6}}>Bank Reconciliation Report</div>
      <div className="text-xs text-muted" style={{marginBottom:16}}>Compare the book balance (system) against the actual bank statement balance. Enter the bank statement balance manually for each account.</div>
      <div style={{marginBottom:16,maxWidth:200}}>
        <label className="fl">As of</label>
        <input type="date" className="fi" value={asOf} onChange={e=>setAsOf(e.target.value)} />
      </div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Bank</th><th style={{textAlign:"right"}}>Book Balance (System)</th><th style={{textAlign:"right"}}>Bank Statement Balance</th><th style={{textAlign:"right"}}>Variance</th><th style={{textAlign:"center"}}>Status</th></tr></thead>
          <tbody>
            {bankKeys.map(b => {
              const bookBal = balanceFor(upToDate, `bank_${b}`);
              const stmt = statementBalances[b];
              const stmtNum = stmt === undefined || stmt === '' ? null : Number(stmt);
              const variance = stmtNum == null ? null : stmtNum - bookBal;
              const reconciled = variance != null && Math.abs(variance) < 0.01;
              return (
                <tr key={b}>
                  <td className="text-sm">{BANK[b].label}</td>
                  <td style={{textAlign:"right",fontWeight:600}}>{formatRM(bookBal)}</td>
                  <td style={{textAlign:"right"}}>
                    <input type="number" className="fi" style={{width:140,marginLeft:"auto",textAlign:"right"}} placeholder="0.00"
                      value={stmt ?? ''} onChange={e=>setStatementBalances(p=>({...p,[b]:e.target.value}))} />
                  </td>
                  <td style={{textAlign:"right",fontWeight:600,color:variance==null?"#9B93A8":reconciled?"#10B981":"#EF4444"}}>{variance==null?'—':formatRM(variance)}</td>
                  <td style={{textAlign:"center"}}>{variance==null?<span className="text-xs text-muted">—</span>:reconciled?<span style={{color:"#10B981",fontWeight:700}}>✓ Matched</span>:<span style={{color:"#EF4444",fontWeight:700}}>⚠ Not Matched</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sales Report — invoices issued in a period, by customer and department.
function SalesReport({ entries }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const years = Array.from(new Set(entries.map(e => e.date?.slice(0,4)).filter(Boolean))).sort();
  if (!years.includes(String(thisYear))) years.push(String(thisYear));

  const invoices = useMemo(() => entries.filter(e => e.type === 'invoice' && !e.reversed && e.date?.slice(0,4) === year), [entries, year]);
  const byCustomer = useMemo(() => {
    const m = {};
    invoices.forEach(e => {
      const name = e.description?.split(' — ')[1] || 'Customer';
      if (!m[name]) m[name] = { name, count: 0, total: 0 };
      m[name].count++; m[name].total += e.amount;
    });
    return Object.values(m).sort((a,b) => b.total - a.total);
  }, [invoices]);
  const byDept = useMemo(() => Object.keys(DEPT).map(d => ({
    key: d, label: DEPT[d].label, color: DEPT[d].color,
    count: invoices.filter(e => e.department === d).length,
    total: invoices.filter(e => e.department === d).reduce((s,e) => s + e.amount, 0),
  })).filter(d => d.count), [invoices]);
  const grandTotal = invoices.reduce((s,e) => s + e.amount, 0);

  return (
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div className="card-title">Sales Report</div>
        <div><label className="fl">Year</label>
          <select className="fs" style={{width:110}} value={year} onChange={e=>setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="sum-card" style={{borderLeftColor:"#10B981",marginBottom:20,maxWidth:260}}>
        <div className="section-label">Total Sales ({year})</div>
        <div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(grandTotal)}</div>
      </div>

      <div className="section-label" style={{marginBottom:8}}>By Department</div>
      <div className="dept-row" style={{color:"#9B93A8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".02em"}}>
        <span>Department</span><span style={{textAlign:"right"}}>No. of Invoices</span><span style={{textAlign:"right"}}>Total</span>
      </div>
      {byDept.length === 0 && <div className="text-sm text-muted" style={{padding:"12px 0"}}>No invoices for this year.</div>}
      {byDept.map(d => (
        <div key={d.key} className="dept-row" style={{gridTemplateColumns:"140px 1fr 1fr"}}>
          <span><span className="dept-tag" style={{color:d.color,background:d.color+"15"}}>{DEPT[d.key].code}</span> {d.label}</span>
          <span style={{textAlign:"right"}}>{d.count}</span>
          <span style={{textAlign:"right",fontWeight:600}}>{formatRM(d.total)}</span>
        </div>
      ))}

      <div className="section-label" style={{margin:"20px 0 8px"}}>By Customer</div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Customer</th><th style={{textAlign:"right"}}>No. of Invoices</th><th style={{textAlign:"right"}}>Total</th></tr></thead>
          <tbody>
            {byCustomer.length === 0 && <tr><td colSpan={3} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No invoices for this year.</td></tr>}
            {byCustomer.map(c => (
              <tr key={c.name}>
                <td className="text-sm">{c.name}</td>
                <td style={{textAlign:"right"}}>{c.count}</td>
                <td style={{textAlign:"right",fontWeight:600}}>{formatRM(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Installment Outstanding — every pending installment across every job
// with a special-arrangement payment plan, sorted by due date.
function InstallmentOutstandingReport({ jobs }) {
  const rows = useMemo(() => {
    const out = [];
    jobs.forEach(j => (j.installments || []).forEach((inst, i) => {
      if (inst.status !== 'paid') out.push({ id: `${j.job_id}-${i}`, jobId: j.job_id, customer: j.customer_name, amount: inst.amount, dueDate: inst.due_date });
    }));
    return out.sort((a,b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [jobs]);
  const today = new Date().toISOString().slice(0,7);
  const total = rows.reduce((s,r) => s + (r.amount || 0), 0);

  return (
    <div className="card">
      <div className="card-title" style={{marginBottom:6}}>Installment Outstanding</div>
      <div className="text-xs text-muted" style={{marginBottom:16}}>All unpaid installments across every job with a special payment arrangement</div>
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr><th>Job ID</th><th>Customer</th><th>Due Date</th><th style={{textAlign:"right"}}>Amount</th><th style={{textAlign:"center"}}>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No outstanding installments.</td></tr>}
            {rows.map(r => {
              const overdue = r.dueDate && r.dueDate < today;
              return (
                <tr key={r.id}>
                  <td className="jid text-sm">{r.jobId}</td>
                  <td className="text-sm">{r.customer}</td>
                  <td className="text-sm">{r.dueDate ? new Date(r.dueDate + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—"}</td>
                  <td style={{textAlign:"right",fontWeight:600}}>{formatRM(r.amount)}</td>
                  <td style={{textAlign:"center"}}>{overdue ? <span style={{color:"#EF4444",fontWeight:700,fontSize:11}}>⚠ Overdue</span> : <span style={{color:"#F59E0B",fontWeight:700,fontSize:11}}>Pending</span>}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr style={{fontWeight:700,borderTop:"2px solid #E8E4ED"}}><td colSpan={3}>Total</td><td style={{textAlign:"right"}}>{formatRM(total)}</td><td /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function Finance() {
  return (
    <Suspense fallback={null}>
      <FinanceContent />
    </Suspense>
  );
}

function FinanceContent() {
  const { profile } = useAuth() || {};
  const { jobs = [], ledgerEntries = [], postExpenseEntry, postOpeningBalanceAdjustment } = useData() || {};
  const visDepts = useVisibleDepts();
  const isBod = profile?.role === 'bod';
  const searchParams = useSearchParams();
  // Which report is showing is driven by the URL (?report=gl) — the picker
  // itself lives in AppShell's sidebar now, under the Finance nav item,
  // rather than taking up space in the page content here.
  const activeReport = searchParams.get('report') || 'overview';

  const [showExpense, setShowExpense] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [toast, setToast] = useState(null);
  const [fDept, setFDept] = useState('all');
  const [fBank, setFBank] = useState('all');

  // P&L Statement date range — defaults to year-to-date. Revenue/COGS/Expense
  // are period figures (what happened between these dates); bank balances
  // and outstanding AR stay all-time since those are a point-in-time position,
  // not something that happened "during" a period.
  const today = new Date();
  const [plFrom, setPlFrom] = useState(`${today.getFullYear()}-01-01`);
  const [plTo, setPlTo] = useState(today.toISOString().slice(0,10));

  const blankExpForm = () => ({ category: 'subcontractor', department: '', jobId: '', amount: '', bank: 'mbb', date: new Date().toISOString().slice(0,10), notes: '' });
  const blankOpenForm = () => ({ bank: 'mbb', amount: '', notes: '' });
  const [expForm, setExpForm] = useState(blankExpForm);
  const [openForm, setOpenForm] = useState(blankOpenForm);
  const [expReceiptFile, setExpReceiptFile] = useState(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const confirmDiscard = (dirty, closeFn) => { if (dirty && !window.confirm('Unsaved changes will be lost. Close this form?')) return; closeFn(); };
  const closeExpense = () => confirmDiscard(JSON.stringify(expForm) !== JSON.stringify(blankExpForm()) || !!expReceiptFile, () => { setShowExpense(false); setExpReceiptFile(null); });
  const closeOpening = () => confirmDiscard(JSON.stringify(openForm) !== JSON.stringify(blankOpenForm()), () => setShowOpening(false));

  const deptKeys = Object.keys(DEPT).filter(k => !visDepts || visDepts.includes(k));

  // dept_head only ever sees entries tied to their own department(s) —
  // company-wide entries (operating expense, bank movement, opening balance)
  // are a BOD-level concern.
  const scopedEntries = useMemo(() => {
    if (!visDepts) return ledgerEntries;
    return ledgerEntries.filter(e => e.department && visDepts.includes(e.department));
  }, [ledgerEntries, visDepts]);

  const filteredEntries = useMemo(() => {
    let list = [...scopedEntries].sort((a,b) => new Date(b.date) - new Date(a.date));
    if (fDept !== 'all') list = list.filter(e => e.department === fDept);
    if (fBank !== 'all') list = list.filter(e => e.bank === fBank);
    return list;
  }, [scopedEntries, fDept, fBank]);

  // P&L period slices — scoped (dept-visible) and all (BOD-only figures like
  // opex/bank), both cut down to just what happened within plFrom..plTo.
  const inPeriod = (e) => (!plFrom || e.date?.slice(0,10) >= plFrom) && (!plTo || e.date?.slice(0,10) <= plTo);
  const plEntries = useMemo(() => scopedEntries.filter(inPeriod), [scopedEntries, plFrom, plTo]);
  const plAllEntries = useMemo(() => ledgerEntries.filter(inPeriod), [ledgerEntries, plFrom, plTo]);

  const totalRevenue = deptKeys.reduce((s,d) => s + balanceFor(plEntries, `revenue_${d}`), 0);
  const totalCogs = deptKeys.reduce((s,d) => s + cogsForDept(plEntries, d), 0);
  const opexByCategory = isBod ? EXPENSE_CATEGORIES.map(c => ({ ...c, amount: balanceFor(plAllEntries, `opex_${c.value}`) })).filter(c => c.amount) : [];
  const totalOpex = opexByCategory.reduce((s,c) => s + c.amount, 0);
  const outstanding = balanceFor(scopedEntries, 'ar');
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalOpex;
  const bankBalances = isBod ? Object.keys(BANK).map(b => ({ key: b, label: BANK[b].label, bal: balanceFor(ledgerEntries, `bank_${b}`) })) : [];

  // Money that actually moved through each bank during the period — receipts
  // in, expenses out. Distinct from "Bank Balance" above, which is the running
  // (all-time) cash position, not what happened in this specific period.
  const bankActivity = isBod ? Object.keys(BANK).map(b => {
    const collected = plAllEntries.filter(e => e.type === 'receipt' && e.bank === b && !e.reversed).reduce((s,e) => s + e.amount, 0);
    const paidOut = plAllEntries.filter(e => (e.type === 'job_expense' || e.type === 'operating_expense') && e.bank === b && !e.reversed).reduce((s,e) => s + e.amount, 0);
    return { key: b, label: BANK[b].label, collected, paidOut };
  }).filter(b => b.collected || b.paidOut) : [];

  const deptBreakdown = deptKeys.map(d => ({
    key: d, label: DEPT[d].label, color: DEPT[d].color,
    revenue: balanceFor(plEntries, `revenue_${d}`),
    cogs: cogsForDept(plEntries, d),
  }));

  const jobsForExpenseDept = expForm.department ? jobs.filter(j => j.department === expForm.department && !j.archived) : [];

  const handleAddExpense = async () => {
    if (!expForm.amount || !expForm.bank) return;
    if (!expForm.department && !window.confirm('Department left blank — this expense will be recorded as a company-wide cost (not tied to a specific department). Continue?')) return;
    let receiptPath = null, receiptName = null;
    if (expReceiptFile) {
      setUploadingReceipt(true);
      try {
        if (isMockMode) {
          receiptPath = URL.createObjectURL(expReceiptFile);
        } else {
          receiptPath = `expenses/${Date.now()}_${expReceiptFile.name}`;
          const { error } = await supabase.storage.from('job-attachments').upload(receiptPath, expReceiptFile);
          if (error) throw error;
        }
        receiptName = expReceiptFile.name;
      } catch (err) {
        setUploadingReceipt(false);
        alert('Failed to upload receipt: ' + (err?.message || err));
        return;
      }
      setUploadingReceipt(false);
    }
    postExpenseEntry({
      category: expForm.category,
      department: expForm.department || null,
      jobId: expForm.jobId || null,
      amount: expForm.amount,
      bank: expForm.bank,
      date: expForm.date ? new Date(expForm.date).toISOString() : null,
      notes: expForm.notes,
      receiptPath, receiptName,
    }, profile?.name);
    setShowExpense(false);
    setExpForm(blankExpForm());
    setExpReceiptFile(null);
    setToast('Expense recorded.');
  };

  const handleAddOpening = () => {
    if (!openForm.amount) return;
    postOpeningBalanceAdjustment(openForm.bank, openForm.amount, profile?.name);
    setShowOpening(false);
    setOpenForm(blankOpenForm());
    setToast('Opening balance adjusted.');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:20px 24px;margin-bottom:24px}
        .sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
        .sum-card{background:#fff;border-radius:12px;padding:18px 22px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em}
        .card-title{font-size:14px;font-weight:700}
        .bank-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
        .bank-chip{border-radius:10px;padding:14px 16px;border:1px solid #F0ECF4;background:#F9F8FB}
        .dept-row{display:grid;grid-template-columns:140px 1fr 1fr 1fr;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #F3F1F6;font-size:13px}
        .dept-row:last-child{border-bottom:none}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;padding:10px 12px;font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;border-bottom:1px solid #F3F1F6;background:#F9F8FB}
        td{padding:10px 12px;border-bottom:1px solid #F3F1F6}
        tr:hover td{background:#F9F8FB}
        .type-badge{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600}
        .dept-tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:6px}
        .fi{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;box-sizing:border-box}
        .fi:focus{border-color:#E91E63!important}
        .fs{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;cursor:pointer;width:100%;box-sizing:border-box}
        .fl{font-size:12px;font-weight:500;color:#6B6080;display:block;margin-bottom:6px}
        .fg{margin-bottom:14px}
        .btn-primary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 20px;border-radius:8px;border:none;background:#E91E63;color:#fff;cursor:pointer}
        .btn-secondary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;padding:9px 18px;border-radius:8px;border:1px solid #E8E4ED;background:#fff;color:#1A1025;cursor:pointer}
        .btn-header{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;cursor:pointer}
        .fmodal-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);animation:fadeIn .2s}
        .fmodal-box{background:#fff;border-radius:16px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.18);animation:slideUp .25s}
        .fmodal-head{padding:20px 24px;border-bottom:1px solid #F0ECF4;display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:700}
        .fmodal-close{background:none;border:none;font-size:22px;cursor:pointer;color:#9B93A8}
        .fmodal-body{padding:24px}
        .fmodal-foot{padding:16px 24px;border-top:1px solid #F0ECF4;display:flex;justify-content:flex-end;gap:8px}
        .ftoast{position:fixed;bottom:24px;right:24px;z-index:200;background:#1A1025;color:#fff;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.2);border-left:4px solid #10B981;animation:slideUp .3s}
        .text-muted{color:#9B93A8}.text-sm{font-size:12px}.text-xs{font-size:11px}.fw600{font-weight:600}.fw700{font-weight:700}
        button:hover{filter:brightness(.97)}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="page">
        <div className="header">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            <div><div style={{fontSize:20,fontWeight:700}}>Finance</div><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>Revenue, expense &amp; ledger</div></div>
            <div style={{display:"flex",gap:8}}>
              {isBod && <button className="btn-header" onClick={()=>setShowOpening(true)}>Adjust Bank Balance</button>}
              <button className="btn-header" onClick={()=>setShowExpense(true)}>+ Add Expense</button>
            </div>
          </div>
        </div>

        <div className="content">
          {activeReport === 'gl' && <GeneralLedgerReport entries={scopedEntries} />}
          {activeReport === 'trial_balance' && <TrialBalanceReport entries={scopedEntries} />}
          {activeReport === 'balance_sheet' && <BalanceSheetReport entries={scopedEntries} />}
          {activeReport === 'cash_book' && <CashBookStatement entries={scopedEntries} />}
          {activeReport === 'aging' && <AgingReport entries={scopedEntries} jobs={jobs} />}
          {activeReport === 'bank_recon' && <BankReconciliationReport entries={scopedEntries} />}
          {activeReport === 'sales' && <SalesReport entries={scopedEntries} />}
          {activeReport === 'installment' && <InstallmentOutstandingReport jobs={jobs} />}
          {activeReport === 'overview' && (<>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <div className="card-title">P&amp;L Statement (Profit &amp; Loss)</div>
                <div className="text-xs text-muted" style={{marginTop:2}}>Revenue, cost &amp; expense for the selected period</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="date" className="fi" style={{width:150}} value={plFrom} onChange={e=>setPlFrom(e.target.value)} />
                <span className="text-xs text-muted">to</span>
                <input type="date" className="fi" style={{width:150}} value={plTo} onChange={e=>setPlTo(e.target.value)} />
              </div>
            </div>
            <div className="sum-grid" style={{marginBottom:0}}>
              <div className="sum-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Revenue</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalRevenue)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#E85D04"}}><div className="section-label">Cost of Services</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalCogs)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#6366F1"}}><div className="section-label">Gross Profit</div><div style={{fontSize:24,fontWeight:700,marginTop:6,color:grossProfit>=0?"#1A1025":"#EF4444"}}>{formatRM(grossProfit)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#3A86FF"}}><div className="section-label">Outstanding (Receivable)</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(outstanding)}</div></div>
              {isBod && <div className="sum-card" style={{borderLeftColor:"#EF4444"}}><div className="section-label">Operating Expense</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalOpex)}</div></div>}
              {isBod && <div className="sum-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Net Profit</div><div style={{fontSize:24,fontWeight:700,marginTop:6,color:netProfit>=0?"#10B981":"#EF4444"}}>{formatRM(netProfit)}</div></div>}
            </div>
            {isBod && opexByCategory.length > 0 && (
              <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #F3F1F6"}}>
                <div className="section-label" style={{marginBottom:8}}>Operating Expense by Category</div>
                {opexByCategory.map(c => (
                  <div key={c.value} className="dept-row" style={{gridTemplateColumns:"1fr 120px"}}>
                    <span className="text-sm">{c.label}</span>
                    <span style={{textAlign:"right",fontWeight:600}}>{formatRM(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isBod && bankBalances.length > 0 && (
            <div className="card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                <div className="card-title">Bank Balance <span className="text-xs text-muted" style={{fontWeight:400}}>(click to filter Ledger)</span></div>
                {fBank!=='all' && <button className="btn-secondary" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setFBank('all')}>× Clear filter</button>}
              </div>
              <div className="text-xs text-muted" style={{marginBottom:14}}>Current balance (all-time) — not limited to the P&amp;L period above</div>
              <div className="bank-grid">
                {bankBalances.map(b => (
                  <div key={b.key} className="bank-chip" style={{cursor:'pointer', outline: fBank===b.key ? '2px solid #E91E63' : 'none'}} onClick={()=>setFBank(p=>p===b.key?'all':b.key)} title="Click to filter Ledger by this bank">
                    <div className="text-xs text-muted">{b.label}</div>
                    <div style={{fontSize:19,fontWeight:700,marginTop:4}}>{formatRM(b.bal)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isBod && bankActivity.length > 0 && (
            <div className="card">
              <div className="card-title" style={{marginBottom:14}}>Collections &amp; Payments by Bank</div>
              <div className="text-xs text-muted" style={{marginTop:-8,marginBottom:14}}>Money that actually moved in/out of each bank during the P&amp;L period above</div>
              <div className="dept-row" style={{color:"#9B93A8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".02em"}}>
                <span>Bank</span><span style={{textAlign:"right"}}>Collected</span><span style={{textAlign:"right"}}>Paid Out</span><span style={{textAlign:"right"}}>Net</span>
              </div>
              {bankActivity.map(b => (
                <div key={b.key} className="dept-row">
                  <span>{b.label}</span>
                  <span style={{textAlign:"right",fontWeight:600,color:"#10B981"}}>{formatRM(b.collected)}</span>
                  <span style={{textAlign:"right",color:"#EF4444"}}>{formatRM(b.paidOut)}</span>
                  <span style={{textAlign:"right",fontWeight:700}}>{formatRM(b.collected-b.paidOut)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-title" style={{marginBottom:2}}>Department Breakdown</div>
            <div className="text-xs text-muted" style={{marginBottom:12}}>For the P&amp;L period above</div>
            <div className="dept-row" style={{color:"#9B93A8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".02em"}}>
              <span>Department</span><span style={{textAlign:"right"}}>Revenue</span><span style={{textAlign:"right"}}>Cost</span><span style={{textAlign:"right"}}>Gross Profit</span>
            </div>
            {deptBreakdown.map(d => (
              <div key={d.key} className="dept-row">
                <span><span className="dept-tag" style={{color:d.color,background:d.color+"15"}}>{DEPT[d.key].code}</span> {d.label}</span>
                <span style={{textAlign:"right",fontWeight:600}}>{formatRM(d.revenue)}</span>
                <span style={{textAlign:"right"}}>{formatRM(d.cogs)}</span>
                <span style={{textAlign:"right",fontWeight:700,color:(d.revenue-d.cogs)>=0?"#10B981":"#EF4444"}}>{formatRM(d.revenue-d.cogs)}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div className="card-title">Ledger</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(!visDepts || visDepts.length > 1) && (
                  <select className="fs" style={{width:170}} value={fDept} onChange={e=>setFDept(e.target.value)}>
                    <option value="all">All Departments</option>
                    {deptKeys.map(k => <option key={k} value={k}>{DEPT[k].label}</option>)}
                  </select>
                )}
                <select className="fs" style={{width:150}} value={fBank} onChange={e=>setFBank(e.target.value)}>
                  <option value="all">All Banks</option>
                  {Object.keys(BANK).map(k => <option key={k} value={k}>{BANK[k].label}</option>)}
                </select>
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Department</th><th>Bank</th><th>Type</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                <tbody>
                  {filteredEntries.length === 0 && <tr><td colSpan={8} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>No entries yet.</td></tr>}
                  {filteredEntries.map(e => {
                    const meta = TYPE_META[e.type] || { label: e.type, color: "#9B93A8", sign: "" };
                    return (
                      <tr key={e.id} style={e.reversed ? { opacity: .5 } : undefined}>
                        <td className="text-sm">{formatDate(e.date)}</td>
                        <td className="text-sm">{e.description}{e.reversed && <span className="text-xs text-muted"> (reversed)</span>}</td>
                        <td className="text-sm" style={{whiteSpace:"nowrap"}}>{ledgerAccountLabel(e.debit_account)}</td>
                        <td className="text-sm" style={{whiteSpace:"nowrap"}}>{ledgerAccountLabel(e.credit_account)}</td>
                        <td>{e.department ? <span className="dept-tag" style={{color:DEPT[e.department]?.color,background:(DEPT[e.department]?.color||'#6B7280')+"15"}}>{DEPT[e.department]?.code}</span> : <span className="text-xs text-muted">—</span>}</td>
                        <td className="text-sm">{e.bank ? BANK[e.bank]?.label || e.bank : <span className="text-xs text-muted">—</span>}</td>
                        <td><span className="type-badge" style={{color:meta.color,background:meta.color+"15"}}>{meta.label}</span></td>
                        <td style={{textAlign:"right",fontWeight:600}}>{meta.sign}{formatRM(e.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>)}
        </div>

        {showExpense && (
          <Modal width={440} onClose={closeExpense}>
            <div className="fmodal-head">Add Expense<button className="fmodal-close" onClick={closeExpense}>×</button></div>
            <div className="fmodal-body">
              <div className="fg"><label className="fl">Category *</label>
                <select className="fs" value={expForm.category} onChange={e=>setExpForm(p=>({...p,category:e.target.value}))}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Department <span className="text-xs text-muted">(leave blank for a company-wide expense, e.g. rent/utilities)</span></label>
                <select className="fs" value={expForm.department} onChange={e=>setExpForm(p=>({...p,department:e.target.value,jobId:''}))}>
                  <option value="">— Company-wide —</option>
                  {(visDepts || Object.keys(DEPT)).map(k => <option key={k} value={k}>{DEPT[k].label}</option>)}
                </select>
              </div>
              {expForm.department && jobsForExpenseDept.length > 0 && (
                <div className="fg"><label className="fl">Related Job (optional)</label>
                  <select className="fs" value={expForm.jobId} onChange={e=>setExpForm(p=>({...p,jobId:e.target.value}))}>
                    <option value="">— No specific job —</option>
                    {jobsForExpenseDept.map(j => <option key={j.job_id} value={j.job_id}>{j.job_id} · {j.job_type}</option>)}
                  </select>
                </div>
              )}
              <div className="fg"><label className="fl">Amount (RM) *</label><input type="number" className="fi" value={expForm.amount} onChange={e=>setExpForm(p=>({...p,amount:e.target.value}))} placeholder="0.00" /></div>
              <div className="fg"><label className="fl">Bank *</label>
                <select className="fs" value={expForm.bank} onChange={e=>setExpForm(p=>({...p,bank:e.target.value}))}>
                  {Object.entries(BANK).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Date</label><input type="date" className="fi" value={expForm.date} onChange={e=>setExpForm(p=>({...p,date:e.target.value}))} /></div>
              <div className="fg"><label className="fl">Notes</label><input className="fi" value={expForm.notes} onChange={e=>setExpForm(p=>({...p,notes:e.target.value}))} placeholder="e.g. Payment to freelance designer" /></div>
              <div className="fg"><label className="fl">Receipt <span className="text-xs text-muted">(optional)</span></label>
                <input type="file" accept="image/*,.pdf" className="fi" onChange={e=>setExpReceiptFile(e.target.files?.[0] || null)} />
                {expReceiptFile && <div className="text-xs text-muted" style={{marginTop:4}}>📎 {expReceiptFile.name}</div>}
              </div>
            </div>
            <div className="fmodal-foot"><button className="btn-secondary" onClick={closeExpense}>Cancel</button><button className="btn-primary" onClick={handleAddExpense} disabled={!expForm.amount || uploadingReceipt}>{uploadingReceipt ? 'Uploading…' : 'Save'}</button></div>
          </Modal>
        )}

        {showOpening && (
          <Modal width={400} onClose={closeOpening}>
            <div className="fmodal-head">Adjust Bank Balance<button className="fmodal-close" onClick={closeOpening}>×</button></div>
            <div className="fmodal-body">
              <div className="fg"><label className="fl">Bank *</label>
                <select className="fs" value={openForm.bank} onChange={e=>setOpenForm(p=>({...p,bank:e.target.value}))}>
                  {Object.entries(BANK).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Adjustment Amount (RM) <span className="text-xs text-muted">— can be negative to reduce</span></label><input type="number" className="fi" value={openForm.amount} onChange={e=>setOpenForm(p=>({...p,amount:e.target.value}))} placeholder="e.g. 15000" /></div>
            </div>
            <div className="fmodal-foot"><button className="btn-secondary" onClick={closeOpening}>Cancel</button><button className="btn-primary" onClick={handleAddOpening} disabled={!openForm.amount}>Save</button></div>
          </Modal>
        )}

        {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
      </div>
    </>
  );
}
