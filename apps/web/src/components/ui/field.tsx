import { useId, type FormHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** What a `Field` hands its control, so the label, hint and error are wired by construction. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * One labelled field (FRM-3, `PER-1`).
 *
 * The label sits above the control and stays when it is filled, closer to its
 * own field (4px) than to the field before it (16px, from `FormStack`), which is
 * how a reader knows whose label it is. The placeholder is the caller's to
 * write, and it shows an example of the answer ("you@company.com"), never the
 * question: a label that lives in the placeholder disappears when the person
 * starts typing, and then the form is a memory test (`COG-6`).
 *
 * The control is a render prop, so any control can be a field's control (an
 * input, a `Select`, a `DateField`) and each is given the same three attributes:
 * its `id` (the label's `htmlFor`), `aria-describedby` pointing at the hint and
 * the error, and `aria-invalid` while there is an error, which is also what
 * turns the field's edge red and plays its one nudge.
 *
 *   <Field label="Email" hint="We only use it to sign you in." error={emailError}>
 *     {(control) => <input {...control} type="email" className="field-input field-xl" placeholder="you@company.com" />}
 *   </Field>
 *
 * An error says what is wrong and how to fix it (chapter 06); it is announced
 * when it appears (`role="alert"`) and sits under the field, where the eye is.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-neutral-900/60">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-feedback-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A form's rhythm (FRM-2, `SPA-2`): fields 16px apart, and 32px between the last
 * of them and the actions. The larger gap says "the fields are done" before the
 * eye reaches the button; the same gap everywhere is what makes a sign-in form
 * and a settings form read as one product.
 *
 * `actions` is the primary button first and, after it, the links (FRM-1): one
 * filled button per form, because a second one is a second decision (`COG-1`,
 * `COG-12`). Anything else in the form (a notice, a group of fields) joins the
 * same 16px rhythm.
 */
export function FormStack({
  children,
  actions,
  className,
  ...form
}: Omit<FormHTMLAttributes<HTMLFormElement>, 'children'> & {
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <form className={cn('grid gap-4', className)} {...form}>
      {children}
      {/* The grid's 16px plus this 16px is the 32px before the primary action. */}
      <div className="mt-4 grid gap-4">{actions}</div>
    </form>
  );
}
