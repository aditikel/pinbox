"use client";
import { useRef } from "react";
import { EntryDialog, type EntryDialogHandle, type ResumeOption } from "@/components/EntryDialog";

export function AddEntry({ resumes }: { resumes: ResumeOption[] }) {
  const dlg = useRef<EntryDialogHandle>(null);
  return (
    <>
      <button className="pill" style={{ left: 859, top: 74, width: 106 }} onClick={() => dlg.current?.open()}>+ Add entry</button>
      <EntryDialog ref={dlg} resumes={resumes} />
    </>
  );
}
