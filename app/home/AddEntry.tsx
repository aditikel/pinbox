"use client";
import { useEffect, useRef } from "react";
import { EntryDialog, type EntryDialogHandle, type ResumeOption } from "@/components/EntryDialog";
import { Icon } from "@/components/Icon";
import { TodoDialog, type Todo, type TodoDialogHandle } from "./TodoDialog";

export function AddEntry({ resumes }: { resumes: ResumeOption[] }) {
  const dlg = useRef<EntryDialogHandle>(null);
  return (
    <>
      <button className="pill" style={{ left: 859, top: 74 }} onClick={() => dlg.current?.open()}>+ Add entry</button>
      <EntryDialog ref={dlg} resumes={resumes} />
    </>
  );
}

const EVENT = "pinbox:edit-todo";

/** "+ Add to-do" pill plus the one to-do dialog. Each agenda row's pencil (EditTodo) opens it with that row. */
export function AgendaTools() {
  const dlg = useRef<TodoDialogHandle>(null);
  useEffect(() => {
    const on = (e: Event) => dlg.current?.open((e as CustomEvent<Todo>).detail);
    addEventListener(EVENT, on);
    return () => removeEventListener(EVENT, on);
  }, []);
  return (
    <>
      <button className="pill" style={{ left: 731, top: 74 }} onClick={() => dlg.current?.open()}>+ Add to-do</button>
      <TodoDialog ref={dlg} />
    </>
  );
}

export function EditTodo({ todo }: { todo: Todo & { id: string } }) {
  return (
    <button className="ag-edit" aria-label={`Edit "${todo.title}"`} title="Edit to-do"
      onClick={() => dispatchEvent(new CustomEvent(EVENT, { detail: todo }))}><Icon name="edit" /></button>
  );
}
