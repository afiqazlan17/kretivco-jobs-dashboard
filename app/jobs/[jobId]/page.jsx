"use client"
import { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { STATUS, CANCEL_REASONS, formatRM } from '@/lib/constants';
import { supabase, isMockMode } from '@/lib/supabase';
import { DetailPanel, CompleteModal, CancelModal, ConfirmModal, Toast, GlobalJobStyles, JID } from '../_shared';

// A single job's own page — reached by clicking a row in Job Monitor, a
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
  const { jobs, customers, updateJob, updateCustomer, getActivity, addLog, postInvoiceEntry, postReceiptEntry, reverseJobLedgerEntries, dataLoading } = useData();

  const job = jobs.find(j => j.job_id === jobId);

  const [completeJob, setCompleteJob] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [cancelJob, setCancelJob] = useState(null);
  const [toast, setToast] = useState(null);

  const handleStatus = useCallback((job, s) => {
    if (s === "completed") { setCompleteJob(job); return; }
    updateJob(job.id, { status: s }, profile?.name, { action: 'status_change', from: job.status, to: s });
    setToast(`${job.job_id}: → ${STATUS[s].label}`);
  }, [updateJob, profile]);

  const handleRollback = useCallback((job, s) => {
    setConfirm({
      title: "Rollback Status?",
      msg: `Adakah anda pasti mahu rollback ${job.job_id} dari ${STATUS[job.status]?.label} ke ${STATUS[s]?.label}?`,
      label: `← ${STATUS[s]?.label}`,
      color: "#F59E0B",
      showReasonField: true,
      onConfirm: (reasonText) => {
        updateJob(job.id, { status: s }, profile?.name, { action: 'rollback', from: job.status, to: s, reason: reasonText || undefined });
        setConfirm(null);
        setToast(`${job.job_id}: ← ${STATUS[s].label}`);
      }
    });
  }, [updateJob, profile]);

  const handleCancel = useCallback((job) => {
    setCancelJob(job);
  }, []);

  const handleAddNote = useCallback((jobId, text, jobUuid, attachment) => {
    addLog(jobId, { action: 'note', user: profile?.name || 'System', note: text, attachmentPath: attachment?.attachmentPath || null, attachmentName: attachment?.attachmentName || null, attachmentUrl: attachment?.attachmentUrl || null }, jobUuid);
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
    setToast(`${cancelJob.job_id} dibatalkan.`);
  }, [cancelJob, updateJob, reverseJobLedgerEntries, profile]);

  const handleArchive = useCallback((job) => {
    setConfirm({
      title: "Arkib Job?", msg: `${job.job_id} akan diarkibkan.`, label: "Arkib", color: "#6B7280",
      onConfirm: () => {
        updateJob(job.id, { archived: true }, profile?.name, { action: 'edited', field: 'archived', old: 'false', val: 'true' });
        setConfirm(null);
        setToast(`${job.job_id} diarkibkan.`);
      }
    });
  }, [updateJob, profile]);

  const handleToggleInstallment = useCallback((job, installmentIndex) => {
    const updated = [...(job.installments || [])];
    updated[installmentIndex] = { ...updated[installmentIndex], status: updated[installmentIndex].status === 'paid' ? 'pending' : 'paid' };
    updateJob(job.id, { installments: updated }, profile?.name);
  }, [updateJob, profile]);

  // Claiming a "new" (unclaimed) ticket sets the PIC and advances it to
  // "assigned" in one step — staff don't fill PIC separately first.
  const handleClaim = useCallback((job) => {
    const name = profile?.name || 'Staff';
    updateJob(job.id, { pic: name, status: 'assigned' }, profile?.name, { action: 'status_change', from: job.status, to: 'assigned', detail: `Ticket diambil oleh ${name}` });
    setToast(`${job.job_id}: diambil oleh ${name}.`);
  }, [updateJob, profile]);

  if (!job) {
    return (
      <>
        <GlobalJobStyles />
        <div className="page">
          <div className="header">
            <div className="h-title">{dataLoading ? 'Memuatkan...' : 'Job tidak dijumpai'}</div>
            <div className="h-sub">{dataLoading ? '' : `Tiada job dengan ID "${jobId}"`}</div>
          </div>
          <div className="content">
            <button className="btn-secondary" onClick={() => router.push('/jobs')}>← Kembali ke Job Monitor</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalJobStyles />
      <div className="page">
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => router.push('/jobs')} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer' }}>← Kembali</button>
            <div>
              <div className="h-title"><JID>{job.job_id}</JID></div>
              <div className="h-sub">{job.job_type} · {job.customer_name}</div>
            </div>
          </div>
        </div>
        <div className="content">
          <DetailPanel
            job={job}
            jobs={jobs}
            customers={customers}
            visDepts={visDepts}
            getActivity={getActivity}
            onStatus={handleStatus}
            onRollback={handleRollback}
            onCancel={handleCancel}
            onArchive={handleArchive}
            onClaim={handleClaim}
            onToggleInstallment={handleToggleInstallment}
            onUpdateJob={updateJob}
            onUpdateCustomer={updateCustomer}
            onAddNote={handleAddNote}
            onDocGenerated={handleDocGenerated}
            onJumpToJob={handleJumpToJob}
            userName={profile?.name}
          />
        </div>
        {completeJob && <CompleteModal job={completeJob} onConfirm={fv => { updateJob(completeJob.id, { status: "completed", final_value: fv }, profile?.name, { action: 'completed', detail: `Final value: ${formatRM(fv)}` }); setCompleteJob(null); setToast(`${completeJob.job_id} selesai. Final: ${formatRM(fv)}`); }} onClose={() => setCompleteJob(null)} />}
        {cancelJob && <CancelModal job={cancelJob} onConfirm={handleCancelConfirm} onClose={() => setCancelJob(null)} />}
        {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        {toast && <Toast msg={typeof toast === 'string' ? toast : toast.msg} action={typeof toast === 'object' ? toast.action : null} onDone={() => setToast(null)} />}
      </div>
    </>
  );
}
