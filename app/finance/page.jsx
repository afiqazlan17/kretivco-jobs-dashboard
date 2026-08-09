"use client"
import { useState, useMemo } from "react";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, BANK, EXPENSE_CATEGORIES, DOC_TYPE_META, formatRM, formatDate, ledgerAccountLabel, ledgerAccountMeta } from '@/lib/constants';

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

const TYPE_META = {
  invoice: { label: 'Invois', color: DOC_TYPE_META.invoice.color, sign: '' },
  receipt: { label: 'Resit', color: DOC_TYPE_META.receipt.color, sign: '+' },
  job_expense: { label: 'Kos Job', color: '#E85D04', sign: '-' },
  operating_expense: { label: 'Expense', color: '#EF4444', sign: '-' },
  opening_balance: { label: 'Baki Permulaan', color: '#6B7280', sign: '' },
  reversal: { label: 'Reversal', color: '#9B93A8', sign: '' },
};

// Only the report types that actually apply to Kretivco's business (a
// services/print agency, not a retailer) — no Stock/Warranty/Agent
// Commission reports, and e-Filing & Zakat is skipped until there's an
// actual filing need for it.
const REPORT_MENU = [
  { key: 'overview', label: 'Ringkasan', icon: '📊', built: true },
  { key: 'gl', label: 'General Ledger Report', icon: '📒', built: true },
  { key: 'trial_balance', label: 'Trial Balance', icon: '⚖️', built: false },
  { key: 'balance_sheet', label: 'Balance Sheet', icon: '🧾', built: false },
  { key: 'cash_book', label: 'Cash Book Statement', icon: '💵', built: false },
  { key: 'aging', label: 'Aging Report', icon: '⏳', built: false },
  { key: 'bank_recon', label: 'Bank Reconciliation Report', icon: '🏦', built: false },
  { key: 'sales', label: 'Sales Report', icon: '📈', built: false },
  { key: 'installment', label: 'Installment Outstanding', icon: '📅', built: false },
];

// ── General Ledger Report — Summary / Detail / Bank & Cash tabs ──
// Summary shows gross debit/credit turnover per account (a Trial-Balance-
// style view, not netted) using the same account keys already posted
// elsewhere in the app, dressed up with short COA-style codes. Detail
// explodes each two-sided ledger entry into its own debit row and credit
// row (standard general-ledger presentation) and, once a single account is
// selected, adds a running balance column.
function GeneralLedgerReport({ entries }) {
  const [tab, setTab] = useState('summary');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const [monthFrom, setMonthFrom] = useState('01');
  const [monthTo, setMonthTo] = useState('12');
  const [account, setAccount] = useState('all');
  const [bankAccountFilter, setBankAccountFilter] = useState('all');

  const years = Array.from(new Set(entries.map(e => e.date?.slice(0,4)).filter(Boolean))).sort();
  if (!years.includes(String(thisYear))) years.push(String(thisYear));
  const monthOpts = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const monthName = (m) => new Date(2000, parseInt(m,10)-1, 1).toLocaleDateString('ms-MY', { month: 'long' });

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
  // scoped to one account, so it's blank when "Semua Akaun" is selected.
  const explodedRows = useMemo(() => {
    const rows = [];
    inRange.forEach(e => {
      rows.push({ id: e.id + '-d', date: e.date, account: e.debit_account, particular: e.description, ref: e.doc_number, debit: e.amount, credit: 0, reversed: e.reversed });
      rows.push({ id: e.id + '-c', date: e.date, account: e.credit_account, particular: e.description, ref: e.doc_number, debit: 0, credit: e.amount, reversed: e.reversed });
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
        <thead><tr><th>Tarikh</th><th>Akaun</th><th>Particular</th><th>Ref No</th><th style={{textAlign:"right"}}>Debit</th><th style={{textAlign:"right"}}>Kredit</th><th style={{textAlign:"right"}}>Baki Akru</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>Tiada entry untuk tempoh/akaun ini.</td></tr>}
          {rows.map(r => (
            <tr key={r.id} style={r.reversed ? { opacity: .5 } : undefined}>
              <td className="text-sm">{formatDate(r.date)}</td>
              <td className="text-sm" style={{whiteSpace:"nowrap"}}>{ledgerAccountLabel(r.account)}</td>
              <td className="text-sm">{r.particular}{r.reversed && <span className="text-xs text-muted"> (dibatalkan)</span>}</td>
              <td className="text-sm">{r.ref || '—'}</td>
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
        <div><label className="fl">Tahun</label>
          <select className="fs" style={{width:110}} value={year} onChange={e=>setYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div><label className="fl">Bulan Dari</label>
          <select className="fs" style={{width:150}} value={monthFrom} onChange={e=>setMonthFrom(e.target.value)}>
            {monthOpts.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
          </select>
        </div>
        <div><label className="fl">Bulan Hingga</label>
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
            <thead><tr><th>Kod</th><th>Nama Akaun</th><th>Jenis</th><th style={{textAlign:"right"}}>Debit</th><th style={{textAlign:"right"}}>Kredit</th></tr></thead>
            <tbody>
              {summaryRows.length === 0 && <tr><td colSpan={5} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>Tiada entry untuk tempoh ini.</td></tr>}
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
            <label className="fl">Akaun</label>
            <select className="fs" value={account} onChange={e=>setAccount(e.target.value)}>
              <option value="all">— Semua Akaun —</option>
              {detailAccountOptions.map(o => <option key={o.key} value={o.key}>{o.code} · {o.label}</option>)}
            </select>
          </div>
          <DetailTable rows={detailView} />
        </>
      )}

      {tab === 'bank' && (
        <>
          <div style={{marginBottom:12,maxWidth:280}}>
            <label className="fl">Akaun Bank</label>
            <select className="fs" value={bankAccountFilter} onChange={e=>setBankAccountFilter(e.target.value)}>
              <option value="all">— Semua Bank —</option>
              {bankAccountOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          <DetailTable rows={bankCashView} />
        </>
      )}
    </div>
  );
}

function ReportComingSoon({ label }) {
  return (
    <div className="card" style={{textAlign:"center",padding:"48px 24px"}}>
      <div style={{fontSize:32,marginBottom:12}}>🚧</div>
      <div className="card-title" style={{marginBottom:6}}>{label}</div>
      <div className="text-sm text-muted">Belum dibina lagi — akan datang.</div>
    </div>
  );
}

export default function Finance() {
  const { profile } = useAuth() || {};
  const { jobs = [], ledgerEntries = [], postExpenseEntry, postOpeningBalanceAdjustment } = useData() || {};
  const visDepts = useVisibleDepts();
  const isBod = profile?.role === 'bod';

  const [showExpense, setShowExpense] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [toast, setToast] = useState(null);
  const [fDept, setFDept] = useState('all');
  const [fBank, setFBank] = useState('all');
  const [activeReport, setActiveReport] = useState('overview');
  const [reportMenuOpen, setReportMenuOpen] = useState(true);

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
  const confirmDiscard = (dirty, closeFn) => { if (dirty && !window.confirm('Perubahan belum disimpan akan hilang. Tutup borang ini?')) return; closeFn(); };
  const closeExpense = () => confirmDiscard(JSON.stringify(expForm) !== JSON.stringify(blankExpForm()), () => setShowExpense(false));
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
  const totalCogs = deptKeys.reduce((s,d) => s + balanceFor(plEntries, `cogs_${d}`), 0);
  const opexByCategory = isBod ? EXPENSE_CATEGORIES.map(c => ({ ...c, amount: balanceFor(plAllEntries, `opex_${c.value}`) })).filter(c => c.amount) : [];
  const totalOpex = opexByCategory.reduce((s,c) => s + c.amount, 0);
  const outstanding = balanceFor(scopedEntries, 'ar');
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalOpex;
  const bankBalances = isBod ? Object.keys(BANK).map(b => ({ key: b, label: BANK[b].label, bal: balanceFor(ledgerEntries, `bank_${b}`) })) : [];

  // Money that actually moved through each bank during the period — receipts
  // in, expenses out. Distinct from "Baki Bank" above, which is the running
  // (all-time) cash position, not what happened in this specific period.
  const bankActivity = isBod ? Object.keys(BANK).map(b => {
    const collected = plAllEntries.filter(e => e.type === 'receipt' && e.bank === b && !e.reversed).reduce((s,e) => s + e.amount, 0);
    const paidOut = plAllEntries.filter(e => (e.type === 'job_expense' || e.type === 'operating_expense') && e.bank === b && !e.reversed).reduce((s,e) => s + e.amount, 0);
    return { key: b, label: BANK[b].label, collected, paidOut };
  }).filter(b => b.collected || b.paidOut) : [];

  const deptBreakdown = deptKeys.map(d => ({
    key: d, label: DEPT[d].label, color: DEPT[d].color,
    revenue: balanceFor(plEntries, `revenue_${d}`),
    cogs: balanceFor(plEntries, `cogs_${d}`),
  }));

  const jobsForExpenseDept = expForm.department ? jobs.filter(j => j.department === expForm.department && !j.archived) : [];

  const handleAddExpense = () => {
    if (!expForm.amount || !expForm.bank) return;
    if (!expForm.department && !window.confirm('Department dikosongkan — expense ini akan direkod sebagai kos company-wide (bukan kos department tertentu). Teruskan?')) return;
    postExpenseEntry({
      category: expForm.category,
      department: expForm.department || null,
      jobId: expForm.jobId || null,
      amount: expForm.amount,
      bank: expForm.bank,
      date: expForm.date ? new Date(expForm.date).toISOString() : null,
      notes: expForm.notes,
    }, profile?.name);
    setShowExpense(false);
    setExpForm(blankExpForm());
    setToast('Expense direkodkan.');
  };

  const handleAddOpening = () => {
    if (!openForm.amount) return;
    postOpeningBalanceAdjustment(openForm.bank, openForm.amount, profile?.name);
    setShowOpening(false);
    setOpenForm(blankOpenForm());
    setToast('Baki permulaan diselaraskan.');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px;max-width:1200px;margin:0 auto}
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
              {isBod && <button className="btn-header" onClick={()=>setShowOpening(true)}>Selaraskan Baki Bank</button>}
              <button className="btn-header" onClick={()=>setShowExpense(true)}>+ Tambah Expense</button>
            </div>
          </div>
        </div>

        <div className="content" style={{display:"flex",gap:20,alignItems:"flex-start",maxWidth:1400}}>
          <div className="card" style={{width:250,flexShrink:0,padding:"12px 8px"}}>
            <button onClick={()=>setReportMenuOpen(p=>!p)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"8px 10px",fontFamily:"'Poppins',sans-serif"}}>
              <span style={{display:"flex",alignItems:"center",gap:8,fontSize:12,fontWeight:700,color:"#E91E63",letterSpacing:".03em"}}>📊 REPORT</span>
              <span style={{fontSize:11,color:"#9B93A8",transform:reportMenuOpen?"rotate(0deg)":"rotate(180deg)"}}>▲</span>
            </button>
            {reportMenuOpen && (
              <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:4}}>
                {REPORT_MENU.map(r => (
                  <button key={r.key} onClick={()=>setActiveReport(r.key)} style={{
                    display:"flex",alignItems:"center",gap:8,textAlign:"left",width:"100%",
                    padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",
                    fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:activeReport===r.key?700:400,
                    background:activeReport===r.key?"#E91E63":"transparent",color:activeReport===r.key?"#fff":"#4B4358",
                  }}>
                    <span>{r.icon}</span><span>{r.label}</span>
                    {!r.built && <span style={{marginLeft:"auto",fontSize:9,opacity:.7}}>●</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{flex:1,minWidth:0}}>
          {activeReport === 'gl' && <GeneralLedgerReport entries={scopedEntries} />}
          {activeReport !== 'overview' && activeReport !== 'gl' && (
            <ReportComingSoon label={REPORT_MENU.find(r => r.key === activeReport)?.label} />
          )}
          {activeReport === 'overview' && (<>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div>
                <div className="card-title">P&amp;L Statement (Untung Rugi)</div>
                <div className="text-xs text-muted" style={{marginTop:2}}>Revenue, kos &amp; expense untuk tempoh dipilih</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="date" className="fi" style={{width:150}} value={plFrom} onChange={e=>setPlFrom(e.target.value)} />
                <span className="text-xs text-muted">hingga</span>
                <input type="date" className="fi" style={{width:150}} value={plTo} onChange={e=>setPlTo(e.target.value)} />
              </div>
            </div>
            <div className="sum-grid" style={{marginBottom:0}}>
              <div className="sum-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Revenue</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalRevenue)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#E85D04"}}><div className="section-label">Kos Perkhidmatan</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalCogs)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#6366F1"}}><div className="section-label">Untung Kasar</div><div style={{fontSize:24,fontWeight:700,marginTop:6,color:grossProfit>=0?"#1A1025":"#EF4444"}}>{formatRM(grossProfit)}</div></div>
              <div className="sum-card" style={{borderLeftColor:"#3A86FF"}}><div className="section-label">Outstanding (Belum Terima)</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(outstanding)}</div></div>
              {isBod && <div className="sum-card" style={{borderLeftColor:"#EF4444"}}><div className="section-label">Operating Expense</div><div style={{fontSize:24,fontWeight:700,marginTop:6}}>{formatRM(totalOpex)}</div></div>}
              {isBod && <div className="sum-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Untung Bersih</div><div style={{fontSize:24,fontWeight:700,marginTop:6,color:netProfit>=0?"#10B981":"#EF4444"}}>{formatRM(netProfit)}</div></div>}
            </div>
            {isBod && opexByCategory.length > 0 && (
              <div style={{marginTop:16,paddingTop:16,borderTop:"1px solid #F3F1F6"}}>
                <div className="section-label" style={{marginBottom:8}}>Operating Expense ikut Kategori</div>
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
                <div className="card-title">Baki Bank <span className="text-xs text-muted" style={{fontWeight:400}}>(klik untuk tapis Ledger)</span></div>
                {fBank!=='all' && <button className="btn-secondary" style={{fontSize:11,padding:'4px 10px'}} onClick={()=>setFBank('all')}>× Clear filter</button>}
              </div>
              <div className="text-xs text-muted" style={{marginBottom:14}}>Baki semasa (all-time) — bukan untuk tempoh P&amp;L di atas</div>
              <div className="bank-grid">
                {bankBalances.map(b => (
                  <div key={b.key} className="bank-chip" style={{cursor:'pointer', outline: fBank===b.key ? '2px solid #E91E63' : 'none'}} onClick={()=>setFBank(p=>p===b.key?'all':b.key)} title="Klik untuk tapis Ledger ikut bank ini">
                    <div className="text-xs text-muted">{b.label}</div>
                    <div style={{fontSize:19,fontWeight:700,marginTop:4}}>{formatRM(b.bal)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isBod && bankActivity.length > 0 && (
            <div className="card">
              <div className="card-title" style={{marginBottom:14}}>Kutipan &amp; Bayaran Ikut Bank</div>
              <div className="text-xs text-muted" style={{marginTop:-8,marginBottom:14}}>Duit yang betul-betul masuk/keluar setiap bank dalam tempoh P&amp;L di atas</div>
              <div className="dept-row" style={{color:"#9B93A8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".02em"}}>
                <span>Bank</span><span style={{textAlign:"right"}}>Kutipan Masuk</span><span style={{textAlign:"right"}}>Bayaran Keluar</span><span style={{textAlign:"right"}}>Net</span>
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
            <div className="card-title" style={{marginBottom:2}}>Pecahan Department</div>
            <div className="text-xs text-muted" style={{marginBottom:12}}>Untuk tempoh P&amp;L di atas</div>
            <div className="dept-row" style={{color:"#9B93A8",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:".02em"}}>
              <span>Department</span><span style={{textAlign:"right"}}>Revenue</span><span style={{textAlign:"right"}}>Kos</span><span style={{textAlign:"right"}}>Untung Kasar</span>
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
                    <option value="all">Semua Department</option>
                    {deptKeys.map(k => <option key={k} value={k}>{DEPT[k].label}</option>)}
                  </select>
                )}
                <select className="fs" style={{width:150}} value={fBank} onChange={e=>setFBank(e.target.value)}>
                  <option value="all">Semua Bank</option>
                  {Object.keys(BANK).map(k => <option key={k} value={k}>{BANK[k].label}</option>)}
                </select>
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table>
                <thead><tr><th>Tarikh</th><th>Keterangan</th><th>Debit</th><th>Credit</th><th>Department</th><th>Bank</th><th>Jenis</th><th style={{textAlign:"right"}}>Jumlah</th></tr></thead>
                <tbody>
                  {filteredEntries.length === 0 && <tr><td colSpan={8} style={{textAlign:"center",padding:24,color:"#9B93A8"}}>Tiada entry lagi.</td></tr>}
                  {filteredEntries.map(e => {
                    const meta = TYPE_META[e.type] || { label: e.type, color: "#9B93A8", sign: "" };
                    return (
                      <tr key={e.id} style={e.reversed ? { opacity: .5 } : undefined}>
                        <td className="text-sm">{formatDate(e.date)}</td>
                        <td className="text-sm">{e.description}{e.reversed && <span className="text-xs text-muted"> (dibatalkan)</span>}</td>
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
        </div>

        {showExpense && (
          <Modal width={440} onClose={closeExpense}>
            <div className="fmodal-head">Tambah Expense<button className="fmodal-close" onClick={closeExpense}>×</button></div>
            <div className="fmodal-body">
              <div className="fg"><label className="fl">Kategori *</label>
                <select className="fs" value={expForm.category} onChange={e=>setExpForm(p=>({...p,category:e.target.value}))}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Department <span className="text-xs text-muted">(kosongkan untuk expense company-wide, cth sewa/utiliti)</span></label>
                <select className="fs" value={expForm.department} onChange={e=>setExpForm(p=>({...p,department:e.target.value,jobId:''}))}>
                  <option value="">— Company-wide —</option>
                  {(visDepts || Object.keys(DEPT)).map(k => <option key={k} value={k}>{DEPT[k].label}</option>)}
                </select>
              </div>
              {expForm.department && jobsForExpenseDept.length > 0 && (
                <div className="fg"><label className="fl">Job berkaitan (optional)</label>
                  <select className="fs" value={expForm.jobId} onChange={e=>setExpForm(p=>({...p,jobId:e.target.value}))}>
                    <option value="">— Tiada job spesifik —</option>
                    {jobsForExpenseDept.map(j => <option key={j.job_id} value={j.job_id}>{j.job_id} · {j.job_type}</option>)}
                  </select>
                </div>
              )}
              <div className="fg"><label className="fl">Jumlah (RM) *</label><input type="number" className="fi" value={expForm.amount} onChange={e=>setExpForm(p=>({...p,amount:e.target.value}))} placeholder="0.00" /></div>
              <div className="fg"><label className="fl">Bank *</label>
                <select className="fs" value={expForm.bank} onChange={e=>setExpForm(p=>({...p,bank:e.target.value}))}>
                  {Object.entries(BANK).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Tarikh</label><input type="date" className="fi" value={expForm.date} onChange={e=>setExpForm(p=>({...p,date:e.target.value}))} /></div>
              <div className="fg"><label className="fl">Nota</label><input className="fi" value={expForm.notes} onChange={e=>setExpForm(p=>({...p,notes:e.target.value}))} placeholder="cth: Bayaran designer freelance" /></div>
            </div>
            <div className="fmodal-foot"><button className="btn-secondary" onClick={closeExpense}>Batal</button><button className="btn-primary" onClick={handleAddExpense} disabled={!expForm.amount}>Simpan</button></div>
          </Modal>
        )}

        {showOpening && (
          <Modal width={400} onClose={closeOpening}>
            <div className="fmodal-head">Selaraskan Baki Bank<button className="fmodal-close" onClick={closeOpening}>×</button></div>
            <div className="fmodal-body">
              <div className="fg"><label className="fl">Bank *</label>
                <select className="fs" value={openForm.bank} onChange={e=>setOpenForm(p=>({...p,bank:e.target.value}))}>
                  {Object.entries(BANK).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Jumlah Pelarasan (RM) <span className="text-xs text-muted">— boleh negatif untuk kurangkan</span></label><input type="number" className="fi" value={openForm.amount} onChange={e=>setOpenForm(p=>({...p,amount:e.target.value}))} placeholder="cth: 15000" /></div>
            </div>
            <div className="fmodal-foot"><button className="btn-secondary" onClick={closeOpening}>Batal</button><button className="btn-primary" onClick={handleAddOpening} disabled={!openForm.amount}>Simpan</button></div>
          </Modal>
        )}

        {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
      </div>
    </>
  );
}
