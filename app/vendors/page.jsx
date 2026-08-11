"use client"
import { useState, useMemo, useEffect } from "react";
import { useData } from "@/lib/hooks";
import { VENDOR_CATEGORY, waLink } from "@/lib/constants";

function CategoryBadge({ c }) {
  const m = VENDOR_CATEGORY.find(v => v.value === c);
  return m ? <span className="src-badge" style={{ color: "#7209B7", background: "#7209B712" }}>{m.label}</span> : <span className="text-xs text-muted">—</span>;
}
function Av({ name, sz = 36 }) { const colors = ["#E91E63", "#7209B7", "#3A86FF", "#E85D04", "#10B981"]; const i = (name?.charCodeAt(0) || 0) % colors.length; return <div className="avatar" style={{ width: sz, height: sz, fontSize: sz * .38, background: colors[i] + "18", color: colors[i] }}>{name?.charAt(0) || "?"}</div>; }
function Modal({ w, children, onClose }) { return <div className="overlay" onClick={onClose}><div className="mbox" style={{ width: w }} onClick={e => e.stopPropagation()}>{children}</div></div>; }
function Toast({ msg, onDone }) { useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]); return <div className="toast">✓ {msg}</div>; }

// ─── Vendor Form Modal (shared by Create + Edit) ─────────────
function blankVendorForm(v) {
  return {
    name: v?.name || "", company: v?.company || "", category: v?.category || "printing",
    phone: v?.phone || "", email: v?.email || "",
    bank_name: v?.bank_name || "", bank_account: v?.bank_account || "",
    address: v?.address || "", notes: v?.notes || "",
  };
}
function VendorFormModal({ vendor, vendors, genVendorId, onSave, onClose }) {
  const isEdit = !!vendor;
  const [initial] = useState(() => blankVendorForm(vendor));
  const [f, setF] = useState(initial);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const changed = !isEdit || dirty;
  const valid = f.name.trim() && f.category;
  const guardedClose = () => { if (dirty && !window.confirm("Unsaved changes will be lost. Close this form?")) return; onClose(); };

  const duplicateMatch = useMemo(() => {
    if (!f.phone && !f.email) return null;
    return vendors.find(v => {
      if (isEdit && v.id === vendor.id) return false;
      return (f.phone && v.phone && v.phone.trim() === f.phone.trim())
        || (f.email && v.email && v.email.trim().toLowerCase() === f.email.trim().toLowerCase());
    }) || null;
  }, [f.phone, f.email, vendors, isEdit, vendor]);

  return (
    <Modal w={480} onClose={guardedClose}>
      <div className="mheader"><div><div className="mtitle">{isEdit ? "Edit Vendor" : "New Vendor"}</div><div className="jid text-muted mt-1">{isEdit ? vendor.vendor_id : `ID: ${genVendorId()}`}</div></div><button className="mclose" onClick={guardedClose}>×</button></div>
      <div className="mbody">
        <div className="fg"><label className="fl">Vendor Name *</label><input className="fi" value={f.name} onChange={e => s("name", e.target.value)} placeholder="Contact person or vendor name" /></div>
        <div className="fg"><label className="fl">Company</label><input className="fi" value={f.company} onChange={e => s("company", e.target.value)} placeholder="Optional" /></div>
        <div className="fg"><label className="fl">Category *</label>
          <select className="fs" value={f.category} onChange={e => s("category", e.target.value)}>
            {VENDOR_CATEGORY.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="frow"><div><label className="fl">Phone</label><input className="fi" value={f.phone} onChange={e => s("phone", e.target.value)} /></div><div><label className="fl">Email</label><input className="fi" value={f.email} onChange={e => s("email", e.target.value)} /></div></div>
        {duplicateMatch && <div style={{ marginBottom: 16, padding: "9px 12px", borderRadius: 8, background: "rgba(245,158,11,.08)", border: "1px dashed #F59E0B", fontSize: 11.5, color: "#1A1025", lineHeight: 1.5 }}>⚠ This vendor may already exist: <strong>{duplicateMatch.vendor_id} ({duplicateMatch.name})</strong> — please check before saving to avoid duplicates.</div>}
        <div className="frow"><div><label className="fl">Bank Name</label><input className="fi" value={f.bank_name} onChange={e => s("bank_name", e.target.value)} placeholder="e.g. Maybank" /></div><div><label className="fl">Bank Account No.</label><input className="fi" value={f.bank_account} onChange={e => s("bank_account", e.target.value)} /></div></div>
        <div className="fg"><label className="fl">Address</label><textarea style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, border: "1px solid #E8E4ED", borderRadius: 8, padding: "10px 12px", width: "100%", minHeight: 56, resize: "vertical", outline: "none", boxSizing: "border-box" }} value={f.address} onChange={e => s("address", e.target.value)} /></div>
        <div className="fg"><label className="fl">Notes</label><textarea style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, border: "1px solid #E8E4ED", borderRadius: 8, padding: "10px 12px", width: "100%", minHeight: 56, resize: "vertical", outline: "none", boxSizing: "border-box" }} value={f.notes} onChange={e => s("notes", e.target.value)} placeholder="e.g. payment terms, turnaround time" /></div>
      </div>
      <div className="mfooter"><button className="btn-secondary" onClick={guardedClose}>Cancel</button><button className={changed && valid ? "btn-primary" : "btn-disabled"} onClick={() => { if (changed && valid) onSave(f); }}>{isEdit ? "Save" : "Save Vendor"}</button></div>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function VendorDirectory() {
  const { vendors, addVendor, updateVendor, genVendorId } = useData();
  const [search, setSearch] = useState("");
  const [fCat, setFCat] = useState("all");
  const [editVendor, setEditVendor] = useState(null);
  const [toast, setToast] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const handleNewSave = (f) => {
    const vendorId = genVendorId();
    addVendor({ id: crypto.randomUUID(), vendor_id: vendorId, ...f, created_at: new Date().toISOString() });
    setShowNew(false);
    setToast(`${vendorId} (${f.name}) added.`);
  };

  const currentEditVendor = editVendor ? vendors.find(v => v.id === editVendor.id) || null : null;

  const filtered = useMemo(() => {
    let l = [...vendors];
    if (fCat !== "all") l = l.filter(v => v.category === fCat);
    if (search.trim()) { const q = search.toLowerCase(); l = l.filter(v => v.name.toLowerCase().includes(q) || (v.company || "").toLowerCase().includes(q) || (v.vendor_id || "").toLowerCase().includes(q)); }
    return l;
  }, [vendors, fCat, search]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
        .sum-card{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid}
        .filter-bar{padding:14px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
        .src-badge{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600}
        .jid{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600}
        .avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
        .tbl-h{display:grid;grid-template-columns:48px 88px 1fr 1.3fr 1fr 1fr 60px;background:#F9F8FB;padding:0 20px;border-bottom:1px solid #F3F1F6}
        .tbl-hc{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;padding:12px 4px}
        .tbl-r{display:grid;grid-template-columns:48px 88px 1fr 1.3fr 1fr 1fr 60px;padding:0 20px;align-items:center;height:52px;border-bottom:1px solid #F3F1F6;cursor:pointer}
        .tbl-r:hover{background:#F9F8FB}.tbl-c{padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);animation:fadeIn .2s}
        .mbox{position:relative;background:#fff;border-radius:16px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.18);animation:slideUp .25s}
        .mheader{padding:20px 24px;border-bottom:1px solid #F0ECF4;display:flex;justify-content:space-between;align-items:center}
        .mtitle{font-size:16px;font-weight:700}.mclose{background:none;border:none;font-size:22px;cursor:pointer;color:#9B93A8}
        .mbody{padding:24px;overflow-y:auto;flex:1}.mfooter{padding:16px 24px;border-top:1px solid #F0ECF4;display:flex;justify-content:flex-end;gap:8px}
        .fg{margin-bottom:16px}.fl{font-size:12px;font-weight:500;color:#6B6080;display:block;margin-bottom:6px}
        .fi{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;box-sizing:border-box}
        .fi:focus{border-color:#E91E63!important;box-shadow:0 0 0 3px rgba(233,30,99,.08)}
        .fs{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;cursor:pointer;appearance:auto}
        .frow{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;margin-bottom:4px}
        .card-title{font-size:14px;font-weight:700}
        .btn-primary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E91E63;color:#fff;cursor:pointer}
        .btn-secondary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;padding:9px 20px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#1A1025;cursor:pointer}
        .btn-disabled{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E8E4ED;color:#9B93A8;cursor:not-allowed}
        .search-wrap{position:relative;flex:1 1 200px;min-width:160px}.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#B0A8BC;display:flex}
        .mt-1{margin-top:4px}.mt-4{margin-top:16px}
        .text-body{font-size:13px}.text-sm{font-size:12px}.text-xs{font-size:11px}.text-muted{color:#9B93A8}.text-secondary{color:#6B6080}.fw500{font-weight:500}.fw600{font-weight:600}
        .toast{position:fixed;bottom:24px;right:24px;z-index:200;background:#1A1025;color:#fff;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.2);border-left:4px solid #10B981;animation:slideUp .3s}
        button:hover{filter:brightness(.97)}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="page">
        <div className="header"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}><div><div style={{ fontSize: 20, fontWeight: 700 }}>Vendor Directory</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{vendors.length} vendors</div></div><button onClick={() => setShowNew(true)} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 600, padding: "9px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,.4)", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16 }}>+</span> New Vendor</button></div></div>
        <div className="content">
          <div className="sum-grid">
            <div className="sum-card" style={{ borderLeftColor: "#7209B7" }}><div className="section-label">Total Vendors</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{vendors.length}</div></div>
          </div>
          <div className="card filter-bar">
            <div className="search-wrap"><span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span><input className="fi" style={{ paddingLeft: 36 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors..." /></div>
            <select className="fs" style={{ width: 190 }} value={fCat} onChange={e => setFCat(e.target.value)}><option value="all">All Categories</option>{VENDOR_CATEGORY.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="tbl-h">{["", "ID", "Name", "Company", "Category", "Phone", ""].map((h, i) => <div key={i} className="tbl-hc">{h}</div>)}</div>
            {filtered.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: "#9B93A8", fontSize: 13 }}>No vendors found.</div> : filtered.map(v => (
              <div key={v.id} className="tbl-r" onClick={() => setEditVendor(v)}>
                <div className="tbl-c"><Av name={v.name} sz={30} /></div>
                <div className="tbl-c jid text-muted">{v.vendor_id}</div>
                <div className="tbl-c text-body fw500">{v.name}</div>
                <div className="tbl-c text-sm text-secondary">{v.company || "—"}</div>
                <div className="tbl-c"><CategoryBadge c={v.category} /></div>
                <div className="tbl-c text-sm text-secondary">{v.phone ? <a href={waLink(v.phone)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: "#10B981", textDecoration: "none" }}>{v.phone}</a> : "—"}</div>
                <div className="tbl-c text-muted">›</div>
              </div>
            ))}
          </div>
          <div className="text-sm text-muted mt-4">{filtered.length} vendors</div>
        </div>
        {currentEditVendor && <VendorFormModal vendor={currentEditVendor} vendors={vendors} genVendorId={genVendorId} onSave={u => { updateVendor(currentEditVendor.id, u); setEditVendor(null); setToast(`${currentEditVendor.vendor_id} updated.`); }} onClose={() => setEditVendor(null)} />}
        {showNew && <VendorFormModal vendor={null} vendors={vendors} genVendorId={genVendorId} onSave={handleNewSave} onClose={() => setShowNew(false)} />}
        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}
