"use client"
import { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { STATUS, HOLD_STATUS, CANCEL_REASONS, DEPT, formatRM } from '@/lib/constants';
import { supabase, isMockMode } from '@/lib/supabase';
import { DetailPanel, CancelModal, ReassignModal, ConfirmModal, Toast, GlobalJobStyles, ActionMenu } from '../_shared';

// A single job's own page — reached by clicking a row in Job Queue, a
// project-sibling link, or a direct link (e.g. from the Dashboard). All the
// job-level actions that used to live on the list page (status changes,
// cancel, archive, notes, document generation) live here now, scoped to
// just this one job.
export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId;

  const { profile } = useAuth() || {};
  const visDepts = useVisibleDepts();
  const { jobs, customers, vendors, addVendor, genVendorId, updateJob, updateCustomer, getActivity, addLog, ledgerEntries, postInvoiceEntry, postReceiptEntry, postExpenseEntry, reverseJobLedgerEntries, dataLoading } = useData();

  const job = jobs.find(j => j.job_id === jobId);
  const cust = job ? customers.find(c => c.id === job.customer_id) : null;

  const [confirm, setConfirm] = useState(null);
  const [cancelJob, setCancelJob] = useState(null);
  const [reassignJob, setReassignJob] = useState(null);
  const [toast, setToast] = useState(null);

  const handleStatus = useCallback((job, s) => {
    if (s === "completed") {
      // Final Value used to be a manual pop-up, but everything needed to
      // compute it is already captured elsewhere by the time a job
      // closes: what was actually billed (latest un-reversed Invoice),
      // else the item total, else the original estimate.
      const latestInvoice = (ledgerEntries || []).filter(e => e.job_id === job.job_id && e.type === 'invoice' && !e.reversed).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const itemsTotal = (job.line_items || []).reduce((s2, li) => s2 + (li.total || (li.qty * li.price) || 0), 0);
      const finalValue = latestInvoice?.amount || itemsTotal || job.estimation_value || 0;
      updateJob(job.id, { status: "completed", final_value: finalValue }, profile?.name, { action: 'completed', detail: `Final value: ${formatRM(finalValue)}` });
      setToast(`${job.job_id} completed. Final: ${formatRM(finalValue)}`);
      return;
    }
    updateJob(job.id, { status: s }, profile?.name, { action: 'status_change', from: job.status, to: s });
    setToast(`${job.job_id}: → ${STATUS[s].label}`);
  }, [updateJob, profile, ledgerEntries]);

  const handleCancel = useCallback((job) => {
    setCancelJob(job);
  }, []);

  const handleAddNote = useCallback((jobId, text, jobUuid, attachment) => {
    addLog(jobId, { action: 'note', user: profile?.name || 'System', note: text, attachments: attachment?.attachments || [] }, jobUuid);
  }, [addLog, profile]);

  const handleDocGenerated = useCallback(async ({ jobs: involvedJobs, type, label, docNumber, total, blob, filename }) => {
    involvedJobs.forEach(j => {
      addLog(j.job_id, { action: 'document_generated', user: profile?.name || 'System', detail: `${label} (${docNumber})` }, j.id);
    });
    // A single-job doc may have been fine-tuned in the live preview (delivery/
    // discount, edited item prices) — post that exact total. Combined docs
    // still let each job compute its own amount from its own line items.
    const override = involvedJobs.length === 1 ? total : undefined;
    if (type === 'invoice') involvedJobs.forEach(j => postInvoiceEntry(j, docNumber, profile?.name, override));
    if (type === 'receipt') involvedJobs.forEach(j => postReceiptEntry(j, docNumber, profile?.name, override));

    // Archive a copy of the generated PDF on every involved job so other
    // staff can refer to exactly what was sent, instead of it only ever
    // existing as a download on whichever PC generated it.
    if (blob) {
      for (const j of involvedJobs) {
        try {
          let path = null, url = null;
          if (isMockMode) {
            url = URL.createObjectURL(blob);
          } else {
            path = `${j.job_id}/document/${Date.now()}_${filename}`;
            const { error } = await supabase.storage.from('job-attachments').upload(path, blob);
            if (error) throw error;
          }
          const entry = { id: crypto.randomUUID(), kind: 'document', doc_type: type, doc_number: docNumber, path, url, name: filename, uploaded_by: profile?.name || 'System', uploaded_at: new Date().toISOString() };
          updateJob(j.id, { attachments: [...(j.attachments || []), entry] }, profile?.name);
        } catch (err) {
          console.error('Failed to archive generated PDF:', err);
        }
      }
    }
  }, [addLog, postInvoiceEntry, postReceiptEntry, profile, updateJob]);

  const handleJumpToJob = useCallback((jobId) => {
    router.push(`/jobs/${jobId}`);
  }, [router]);

  const handleCancelConfirm = useCallback((reason, customText) => {
    if (!cancelJob) return;
    const reasonLabel = CANCEL_REASONS.find(r => r.value === reason)?.label || reason;
    const detail = reason === 'other' && customText ? customText : reasonLabel;
    updateJob(cancelJob.id, { status: 'cancelled', cancel_reason: reason, cancel_reason_text: reason === 'other' ? customText : '' }, profile?.name, { action: 'cancelled', detail });
    reverseJobLedgerEntries(cancelJob.job_id, profile?.name);
    setCancelJob(null);
    setToast(`${cancelJob.job_id} cancelled.`);
  }, [cancelJob, updateJob, reverseJobLedgerEntries, profile]);

  const handleArchive = useCallback((job) => {
    setConfirm({
      title: "Archive Job?", msg: `${job.job_id} will be archived.`, label: "Archive", color: "#6B7280",
      onConfirm: () => {
        updateJob(job.id, { archived: true }, profile?.name, { action: 'edited', field: 'archived', old: 'false', val: 'true' });
        setConfirm(null);
        setToast(`${job.job_id} archived.`);
      }
    });
  }, [updateJob, profile]);

  const handleToggleInstallment = useCallback((job, installmentIndex) => {
    const updated = [...(job.installments || [])];
    updated[installmentIndex] = { ...updated[installmentIndex], status: updated[installmentIndex].status === 'paid' ? 'pending' : 'paid' };
    updateJob(job.id, { installments: updated }, profile?.name);
  }, [updateJob, profile]);

  // Take In Job works regardless of who currently holds the job. An
  // unclaimed "potential" job gets claimed AND advanced to "in_progress" in
  // one step; an already-in-progress job just hands the PIC over to
  // whoever clicks — no status change (covers e.g. a staff member on leave).
  const handleTakeIn = useCallback((job) => {
    const name = profile?.name || 'Staff';
    const newStatus = job.status === 'potential' ? 'in_progress' : job.status;
    updateJob(job.id, { pic: name, status: newStatus }, profile?.name, { action: 'edited', field: 'pic', old: job.pic || '', val: name });
    setToast(`${job.job_id}: claimed by ${name}.`);
  }, [updateJob, profile]);

  const handleHold = useCallback((job, type) => {
    const reasonText = window.prompt(`Reason for ${HOLD_STATUS[type]?.label || type} (optional):`) || '';
    updateJob(job.id, { hold_status: type, hold_reason: reasonText }, profile?.name, { action: 'edited', field: 'hold_status', old: job.hold_status || '', val: type, detail: reasonText || undefined });
    setToast(`${job.job_id}: ${HOLD_STATUS[type]?.label}.`);
  }, [updateJob, profile]);

  const handleResume = useCallback((job) => {
    updateJob(job.id, { hold_status: null, hold_reason: null }, profile?.name, { action: 'edited', field: 'hold_status', old: job.hold_status || '', val: '' });
    setToast(`${job.job_id}: resumed.`);
  }, [updateJob, profile]);

  const handleReassignConfirm = useCallback((name) => {
    if (!reassignJob) return;
    updateJob(reassignJob.id, { pic: name }, profile?.name, { action: 'edited', field: 'pic', old: reassignJob.pic || '', val: name });
    setToast(`${reassignJob.job_id}: Current Responsible → ${name}.`);
    setReassignJob(null);
  }, [reassignJob, updateJob, profile]);

  if (!job) {
    return (
      <>
        <GlobalJobStyles />
        <div className="page">
          <div className="header">
            <div className="h-title">{dataLoading ? 'Loading...' : 'Job not found'}</div>
            <div className="h-sub">{dataLoading ? '' : `No job found with ID "${jobId}"`}</div>
          </div>
          <div className="content">
            <button className="btn-secondary" onClick={() => router.push('/jobs')}>← Back to Job Queue</button>
          </div>
        </div>
      </>
    );
  }

  const heldMeta = job.hold_status ? HOLD_STATUS[job.hold_status] : null;

  return (
    <>
      <GlobalJobStyles />
      <div className="page">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 12 }}>
            <button onClick={() => router.push('/jobs')} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>← Back</button>
            <ActionMenu
              job={job}
              onTakeIn={() => handleTakeIn(job)}
              onChangeResponsible={() => setReassignJob(job)}
              onCloseJob={() => handleStatus(job, 'completed')}
              onHold={(type) => handleHold(job, type)}
              onResume={() => handleResume(job)}
              onCancel={() => handleCancel(job)}
              onArchive={() => handleArchive(job)}
            />
          </div>
          <div className="job-header-row">
            <div>
              <div className="h-title">{job.job_id} | {job.job_type}</div>
              <div className="job-header-line">
                {cust ? (
                  <a onClick={() => router.push(`/customers?customer=${cust.id}`)} style={{ color: '#fff', textDecoration: 'underline', cursor: 'pointer' }}>{cust.customer_id} | {cust.company || cust.name}</a>
                ) : (job.customer_name || '—')}
              </div>
              <div className="job-header-line">{cust?.name || job.customer_name || '—'} | {cust?.phone || '—'}</div>
              {cust?.email && <div className="job-header-line">{cust.email}</div>}
              {job.project_id && <div className="job-header-line">Project ID: {job.project_id}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="job-header-line" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Status: {STATUS[job.status]?.label}</div>
              <div className="job-header-line">Current Responsible: {job.pic || <span style={{ fontStyle: 'italic' }}>Not yet assigned</span>}</div>
              <div className="job-header-line">Current Department: {DEPT[job.department]?.label || job.department}</div>
              {heldMeta && <div className="hold-badge" style={{ background: '#fff', color: heldMeta.color }}>{heldMeta.icon} {heldMeta.label}{job.hold_reason ? `: ${job.hold_reason}` : ''}</div>}
            </div>
          </div>
        </div>
        <div className="content">
          <DetailPanel
            job={job}
            jobs={jobs}
            customers={customers}
            visDepts={visDepts}
            ledgerEntries={ledgerEntries}
            getActivity={getActivity}
            vendors={vendors}
            onAddVendor={addVendor}
            genVendorId={genVendorId}
            postExpenseEntry={postExpenseEntry}
            onToggleInstallment={handleToggleInstallment}
            onUpdateJob={updateJob}
            onUpdateCustomer={updateCustomer}
            onAddNote={handleAddNote}
            onDocGenerated={handleDocGenerated}
            onJumpToJob={handleJumpToJob}
            userName={profile?.name}
          />
        </div>
        {cancelJob && <CancelModal job={cancelJob} onConfirm={handleCancelConfirm} onClose={() => setCancelJob(null)} />}
        {reassignJob && <ReassignModal job={reassignJob} onConfirm={handleReassignConfirm} onClose={() => setReassignJob(null)} />}
        {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        {toast && <Toast msg={typeof toast === 'string' ? toast : toast.msg} action={typeof toast === 'object' ? toast.action : null} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}
