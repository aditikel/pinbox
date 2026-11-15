"use client";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { saveEntry, type EntryState } from "@/app/entries-actions";
import { STATUSES } from "@/lib/statuses";

export type Entry = { id?: string; company?: string; role?: string; status?: string; next_action?: string | null; deadline?: string | null; resume_id?: string | null };
export type ResumeOption = { id: string; label: string; isDefault: boolean };
export type EntryDialogHandle = { open: (e?: Entry) => void };

// Add entry / Edit entry dialog, shared by Home and Pipeline.
export const EntryDialog = forwardRef<EntryDialogHandle, { resumes?: ResumeOption[] }>(function EntryDialog({ resumes = [] }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [entry, setEntry] = useState<Entry>({});
  const [version, setVersion] = useState(0); // remounts the form so defaults refresh
  const [state, action, pending] = useActionState<EntryState, FormData>(saveEntry, {});

  useImperativeHandle(ref, () => ({ open: (e = {}) => { setEntry(e); setVersion((v) => v + 1); dlg.current?.showModal(); } }));
  useEffect(() => { if (state.ok) dlg.current?.close(); }, [state.ok]);

  const editing = !!entry.id;
  return (
    <dialog ref={dlg} aria-labelledby="entry-title">
      <form key={version} action={action}>
        <h3 id="entry-title">{editing ? "Edit entry" : "Add entry"}</h3>
        {editing && <input type="hidden" name="id" value={entry.id} />}
        <label>Company<input name="company" required autoFocus defaultValue={entry.company ?? ""} /></label>
        <label>Role<input name="role" defaultValue={entry.role ?? ""} /></label>
        <label>Status
          <select name="status" defaultValue={entry.status ?? "Applied"}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Next action<input name="next" placeholder="Complete OA" defaultValue={entry.next_action ?? ""} /></label>
        <label>Deadline<input name="deadline" type="date" defaultValue={entry.deadline ?? ""} /></label>
        {resumes.length > 0 && (
          <label>Resume
            <select name="resume" defaultValue={entry.resume_id ?? ""}>
              <option value="">Default resume{(() => { const d = resumes.find((r) => r.isDefault); return d ? ` (${d.label})` : ""; })()}</option>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        )}
        {state.error && version > 0 && <p className="err" role="alert">{state.error}</p>}
        <div className="row">
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save entry"}</button>
        </div>
      </form>
    </dialog>
  );
});
