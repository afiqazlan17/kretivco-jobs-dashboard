"use client"
// ============================================================
// RichNoteComposer — rich-text entry box for the job detail page's
// Activity Log. Text formatting + inline images go straight into the
// editor's HTML content (images are embedded as base64 data URIs so
// they never depend on a signed URL that could expire later). Files
// that can't be rendered inline (Excel, Word, etc.) are attached as a
// separate chip list saved alongside the note, uploaded to the same
// private job-attachments bucket used elsewhere in the app.
// ============================================================
import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { supabase, isMockMode } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB — inline images are stored as base64 in the note text itself
const COLORS = ["#1A1025", "#E91E63", "#3A86FF", "#10B981", "#F59E0B", "#EF4444"];

function ToolbarBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
        background: active ? "#E91E6318" : "transparent", color: active ? "#E91E63" : "#4B4358",
      }}
    >{children}</button>
  );
}

export function RichNoteComposer({ jobId, onSubmit }) {
  const [files, setFiles] = useState([]); // { file, name }
  const [submitting, setSubmitting] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TextStyle,
      Color,
    ],
    editorProps: {
      attributes: { class: "rich-note-content" },
      // Paste a screenshot straight from the clipboard (Ctrl+V) — no need
      // to save it to disk first just to re-upload it through the toolbar.
      handlePaste: (view, event) => {
        const item = Array.from(event.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
        if (!item) return false;
        const file = item.getAsFile();
        if (!file) return false;
        if (file.size > MAX_IMAGE_BYTES) {
          alert("Image too large (>4MB). Use \"+ File\" to attach it as a regular file instead.");
          return true;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: reader.result });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
  });

  const insertImage = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert("Image too large (>4MB). Use \"+ File\" to attach it as a regular file instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => editor?.chain().focus().setImage({ src: reader.result }).run();
    reader.readAsDataURL(file);
  }, [editor]);

  const addLink = useCallback(() => {
    const url = window.prompt("Link URL:");
    if (url) editor?.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const addFileChip = (file) => {
    if (!file) return;
    setFiles(p => [...p, { file, name: file.name }]);
  };
  const removeFileChip = (i) => setFiles(p => p.filter((_, idx) => idx !== i));

  const isEmpty = !editor || editor.isEmpty;

  const submit = async () => {
    if (isEmpty) return;
    setSubmitting(true);
    try {
      const uploaded = [];
      for (const f of files) {
        if (isMockMode) {
          uploaded.push({ name: f.name, url: URL.createObjectURL(f.file), path: null });
        } else {
          const path = `${jobId}/log_file/${Date.now()}_${f.name}`;
          const { error } = await supabase.storage.from("job-attachments").upload(path, f.file);
          if (error) throw error;
          uploaded.push({ name: f.name, path, url: null });
        }
      }
      await onSubmit({ note: editor.getHTML(), attachments: uploaded });
      editor.commands.clearContent();
      setFiles([]);
    } catch (err) {
      alert("Failed to save note: " + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!editor) return null;

  return (
    <div style={{ border: "1px solid #E8E4ED", borderRadius: 8, overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 8px", borderBottom: "1px solid #F0ECF4", flexWrap: "wrap", position: "relative" }}>
        <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><b>B</b></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><i>I</i></ToolbarBtn>
        <ToolbarBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><u>U</u></ToolbarBtn>
        <span style={{ width: 1, height: 18, background: "#E8E4ED", margin: "0 4px" }} />
        <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">•≡</ToolbarBtn>
        <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered List">1≡</ToolbarBtn>
        <span style={{ width: 1, height: 18, background: "#E8E4ED", margin: "0 4px" }} />
        <div style={{ position: "relative" }}>
          <ToolbarBtn onClick={() => setShowColors(p => !p)} title="Text Color">🎨</ToolbarBtn>
          {showColors && (
            <div style={{ position: "absolute", top: 32, left: 0, zIndex: 20, background: "#fff", border: "1px solid #E8E4ED", borderRadius: 8, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => { editor.chain().focus().setColor(c).run(); setShowColors(false); }} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: "1px solid #0002", cursor: "pointer" }} />
              ))}
            </div>
          )}
        </div>
        <ToolbarBtn onClick={addLink} title="Link">🔗</ToolbarBtn>
        <label style={{ width: 28, height: 28, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }} title="Insert Image">
          🖼️
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { insertImage(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label style={{ width: 28, height: 28, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }} title="Attach File (Excel, Word, etc.)">
          📎
          <input type="file" accept=".xls,.xlsx,.doc,.docx,.pdf,.csv,.zip" style={{ display: "none" }} onChange={e => { addFileChip(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <span style={{ width: 1, height: 18, background: "#E8E4ED", margin: "0 4px" }} />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">↺</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">↻</ToolbarBtn>
      </div>
      <EditorContent editor={editor} style={{ padding: "10px 12px", minHeight: 90, fontSize: 13 }} />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 10px" }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, background: "#F9F8FB", border: "1px solid #E8E4ED", borderRadius: 6, padding: "4px 8px" }}>
              📄 {f.name}
              <button type="button" onClick={() => removeFileChip(i)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", borderTop: "1px solid #F0ECF4" }}>
        <button
          type="button"
          onClick={submit}
          disabled={isEmpty || submitting}
          style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 18px", borderRadius: 8, border: "none", cursor: (!isEmpty && !submitting) ? "pointer" : "not-allowed", background: (!isEmpty && !submitting) ? "#E91E63" : "#E8E4ED", color: (!isEmpty && !submitting) ? "#fff" : "#9B93A8" }}
        >{submitting ? "Saving..." : "Add Note"}</button>
      </div>
    </div>
  );
}
