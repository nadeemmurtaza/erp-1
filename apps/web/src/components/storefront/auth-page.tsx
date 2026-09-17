import type { ReactNode } from 'react';

/**
 * The frame every sign-in-shaped page shares.
 *
 * Four pages were writing it out separately and had already split into two
 * variants: login and register nested a `flex-1` column inside a
 * `flex-col lg:flex-row`, while forgot-password and reset-password centred a
 * column directly. Both then repeated `min-h-[calc(100vh-4rem)]` — a figure
 * that means "the viewport minus the header", which nothing states and
 * nothing would update if the header changed height.
 *
 * No box around the form. It is the only thing on the page, so a border has
 * nothing to separate it from; the centred column and the space around it
 * already say where it begins.
 *
 * `aside` is the panel login and register show from `lg` up. It is optional
 * because the password-reset pages have nothing to say there, and inventing
 * marketing copy to fill a column is how a calm page becomes a busy one.
 */
export function AuthPage({
  title,
  description,
  aside,
  children,
  footer,
}: {
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Shown beside the form from `lg` up; hidden below it. */
  aside?: ReactNode;
  children: ReactNode;
  /** The "no account yet?" line, under the form. */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-auth flex-col lg:flex-row">
      <div className="flex flex-1 items-center justify-center px-4 py-12 lg:px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold text-neutral-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-center text-sm text-neutral-900/60">{description}</p>
          ) : null}

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-6 text-center text-sm text-neutral-900/60">{footer}</div>
          ) : null}
        </div>
      </div>

      {aside ? (
        <div className="relative hidden items-center justify-center bg-neutral-50 p-12 lg:flex lg:flex-1">
          <div className="max-w-lg text-center">{aside}</div>
        </div>
      ) : null}
    </div>
  );
}
