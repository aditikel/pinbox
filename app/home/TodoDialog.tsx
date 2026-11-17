"use client";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import { deleteTodo, saveTodo, type TodoState } from "./actions";

export type Todo = { id?: string; title?: string; due?: string | null; priority?: string; manual?: boolean; subtitle?: string };
export type TodoDialogHandle = { open: (t?: Todo) => void };

// Add / edit one to-do on the Daily Agenda. Separate from the pipeline's entry dialog: this edits the task itself.
export const TodoDialog = forwardRef<TodoDialogHandle>(function TodoDialog(_, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [todo, setTodo] = useState<Todo>({});
  const [version, setVersion] = useState(0);
  const [state, action, pending] = useActionState<TodoState, FormData>(saveTodo, {});
  const [, startTransition] = useTransition();

  useImperativeHandle(ref, () => ({ open: (t = {}) => { setTodo(t); setVersion((v) => v + 1); dlg.current?.showModal(); } }));
  useEffect(() => { if (state.ok) dlg.current?.close(); }, [state.ok]);

  const editing = !!todo.id;
  return (
    <dialog ref={dlg} aria-labelledby="todo-title">
      <form key={version} action={action}>
        <h3 id="todo-title">{editing ? "Edit to-do" : "Add to-do"}</h3>
        {todo.subtitle && <p className="dlg-sub">{todo.subtitle}</p>}
        {editing && <input type="hidden" name="id" value={todo.id} />}
        <label>Task<input name="title" required autoFocus maxLength={200} placeholder="Send thank-you note" defaultValue={todo.title ?? ""} /></label>
        <label>Due<input name="due" type="date" defaultValue={todo.due ?? ""} /></label>
        <label>Priority
          <select name="priority" defaultValue={todo.manual ? todo.priority : "auto"}>
            <option value="auto">Automatic (from the due date)</option>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        {state.error && version > 0 && <p className="err" role="alert">{state.error}</p>}
        <div className="row">
          {editing && (
            <button type="button" className="g" style={{ marginRight: "auto" }} onClick={() => {
              if (!confirm(`Delete "${todo.title}"?`)) return;
              dlg.current?.close();
              startTransition(() => deleteTodo(todo.id!));
            }}>Delete</button>
          )}
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
});
