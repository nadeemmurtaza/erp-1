'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import {
  MAX_REASON_LENGTH,
  SELF_DECISION_SENTENCE,
  actLabel,
  actNeedsReason,
  bidderActs,
  decisionOf,
  describeBidderFailure,
  describeLoadFailure,
  reasonHint,
  statusWord,
  strikeStanding,
  successSentence,
  type BidderAct,
  type BidderDetail,
  type StrikeRow,
} from '@/lib/auction-bidders';
import { Badge, Button, Dialog, Disclosure, Field, FormStack, Select } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

export interface SheetLot {
  id: string;
  lotNo: number;
  title: string;
}

/** What the open form is for: an act on the registration or a strike, or the voiding of one strike. */
type Form = { kind: 'act'; act: Exclude<BidderAct, 'approve'> } | { kind: 'void'; strike: StrikeRow };

/**
 * launchpad-apps/234-auction-app.md §8 (WO-234.5) — one bidder, as a side sheet
 * over the auction page: who they are, what they asked for, and every act staff
 * can take, each as a short form that replaces the buttons rather than opening a
 * second dialog on top of this one. The queue is the overview; this is the
 * detail of the one row a person asked about (Law 7).
 *
 * A decision is sent with the status the screen was showing, so if someone else
 * decided first the server refuses it and this sheet says so and reads the
 * bidder again, instead of landing an act on a state nobody chose it for. Every
 * act ends in a sentence saying what happened to which bidder, and, when someone
 * else is still waiting, the one loud way to the next.
 */
export function AuctionBidderSheet({
  auctionId,
  bidderId,
  lots,
  waiting,
  onClose,
  onChanged,
  onReviewNext,
}: {
  auctionId: string;
  bidderId: string | null;
  lots: readonly SheetLot[];
  /** How many are waiting for a decision as the page last read it, so a finished one can offer the next only if someone else is. */
  waiting: number;
  onClose: () => void;
  /** The numbers on the page have moved: read the summary and the list again. */
  onChanged: () => void;
  onReviewNext: () => void;
}) {
  const [detail, setDetail] = useState<BidderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reason, setReason] = useState('');
  const [lotId, setLotId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /** Who else was waiting at the moment of the act, worked out once: if it followed the page's own count it would change under the person's cursor as the count refreshed. */
  const [othersWaiting, setOthersWaiting] = useState(0);

  const body = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<HTMLParagraphElement>(null);
  /** The `data-act` of the button that opened the form, to return focus to: the node itself is replaced while the form is open. */
  const opener = useRef<string | null>(null);
  const base = `/admin/auctions/${auctionId}/bidders`;

  const load = useCallback(async () => {
    if (!bidderId) return;
    setLoadError(null);
    try {
      setDetail(await adminFetch<BidderDetail>(`${base}/${bidderId}`));
    } catch (cause) {
      setLoadError(describeLoadFailure(cause, 'bidder'));
    }
  }, [base, bidderId]);

  // Another bidder starts clean: nothing typed for the last one is carried over. Closing keeps what was showing until the sheet has left, so it does not flash "Loading bidder" on its way out.
  useEffect(() => {
    if (!bidderId) return;
    setDetail(null);
    setLoadError(null);
    setForm(null);
    setReason('');
    setLotId('');
    setProblem(null);
    setDone(null);
    setOthersWaiting(0);
    void load();
  }, [load, bidderId]);

  useEffect(() => {
    if (form) reasonRef.current?.focus();
  }, [form]);
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);
  // A refusal is read where it is told: focus goes to it, as on the storefront card.
  useEffect(() => {
    if (problem) problemRef.current?.focus();
  }, [problem]);

  const open = (next: Form, trigger: string) => {
    opener.current = trigger;
    setReason('');
    setLotId('');
    setProblem(null);
    setForm(next);
  };

  const cancel = () => {
    setForm(null);
    setProblem(null);
    // Back to the button that opened the form: it is a new node once the form closes, so it is found again by its `data-act` on the next frame.
    const back = opener.current;
    if (back) requestAnimationFrame(() => body.current?.querySelector<HTMLElement>(`[data-act="${CSS.escape(back)}"]`)?.focus());
  };

  /** Runs one write; on success the sheet shows the sentence for it, on a refusal the reason, and on "someone else decided" the bidder as they are now. */
  const send = async (key: string, success: BidderAct | 'void', write: () => Promise<BidderDetail>) => {
    if (!detail) return;
    const wasWaiting = detail.status === 'PENDING';
    setBusy(key);
    setProblem(null);
    try {
      const after = await write();
      setDetail(after);
      setForm(null);
      setReason('');
      setOthersWaiting(Math.max(0, waiting - (wasWaiting ? 1 : 0)));
      setDone(successSentence(success, after));
      onChanged();
    } catch (cause) {
      setProblem(describeBidderFailure(cause, detail.alias));
      if (cause instanceof ApiError && (cause.body as { code?: string } | undefined)?.code === 'BIDDER_CHANGED') {
        setForm(null);
        void load();
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  };

  const approve = () =>
    send('approve', 'approve', () =>
      adminFetch<BidderDetail>(`${base}/${detail!.id}/decision`, { method: 'POST', body: { decision: 'APPROVE', expectedStatus: detail!.status } }),
    );

  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !form || !reason.trim()) return;
    const text = reason.trim();
    if (form.kind === 'void') {
      void send('void', 'void', () => adminFetch<BidderDetail>(`${base}/${detail.id}/strikes/${form.strike.id}/void`, { method: 'POST', body: { reason: text } }));
    } else if (form.act === 'strike') {
      void send('strike', 'strike', () =>
        adminFetch<BidderDetail>(`${base}/${detail.id}/strikes`, { method: 'POST', body: { reason: text, ...(lotId ? { lotId } : {}) } }),
      );
    } else {
      const act = form.act;
      void send(act, act, () =>
        adminFetch<BidderDetail>(`${base}/${detail.id}/decision`, {
          method: 'POST',
          body: { decision: decisionOf(act), expectedStatus: detail.status, reason: text },
        }),
      );
    }
  };

  const lotName = (id: string | null) => {
    const lot = id ? lots.find((candidate) => candidate.id === id) : undefined;
    return lot ? `Lot ${lot.lotNo}` : null;
  };

  const formTitle = (current: Form, alias: string) =>
    current.kind === 'void' ? `Void the strike recorded ${formatDateTime(current.strike.recordedAt)}` : current.act === 'strike' ? `Record a strike for ${alias}` : actLabel(current.act, { alias, status: detail?.status ?? 'PENDING' });

  return (
    <Dialog open={bidderId !== null} onClose={busy ? () => {} : onClose} title={detail ? `Review ${detail.alias}` : 'Review bidder'} align="end">
      {loadError ? (
        <div role="alert" className="notice notice-error">
          <p>{loadError}</p>
          <Button variant="secondary" className="mt-2" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !detail ? (
        <p role="status" className="text-sm text-neutral-900/60">
          Loading bidder
        </p>
      ) : (
        <div ref={body} className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={detail.status} label={statusWord(detail.status)} />
            {detail.appeal.state === 'WAITING' ? <Badge tone="warning">Appeal waiting</Badge> : null}
            {detail.strikes.reviewDue ? <Badge tone="danger">Review due</Badge> : null}
          </div>

          <dl className="grid gap-3 text-sm">
            <Fact label="Name" value={detail.person.name} />
            <Fact label="Email" value={detail.person.email} />
            <Fact label="Phone" value={detail.person.phone} />
            <Fact label="Identity verified" value={detail.verified ? 'Yes' : 'No'} />
            <Fact label="Joined" value={formatDateTime(detail.joinedAt)} />
          </dl>

          {detail.status === 'DECLINED' || detail.status === 'SUSPENDED' ? (
            <section className="grid gap-1 text-sm">
              <h3 className="font-medium text-neutral-900">
                {detail.status === 'DECLINED' ? 'Declined' : 'Suspended'}
                {detail.decidedAt ? ` ${formatDateTime(detail.decidedAt)}` : ''}
              </h3>
              {detail.decisionReason ? (
                <p dir="auto" className="whitespace-pre-line break-words text-neutral-900/80">
                  {detail.decisionReason}
                </p>
              ) : null}
            </section>
          ) : null}

          {detail.appeal.state === 'WAITING' && detail.appeal.text ? (
            <section className="grid gap-1 text-sm">
              <h3 className="font-medium text-neutral-900">Their appeal{detail.appeal.at ? `, ${formatDateTime(detail.appeal.at)}` : ''}</h3>
              <p dir="auto" className="whitespace-pre-line break-words text-neutral-900/80">
                {detail.appeal.text}
              </p>
            </section>
          ) : null}
          {detail.appeal.state === 'KEPT' ? <p className="text-sm text-neutral-900/60">You kept this decision after an appeal. They cannot appeal it again.</p> : null}

          {/* The acts: the buttons, or the one form that replaced them, or the sentence that says it is done. */}
          <section aria-label="Decide" className="grid gap-3">
            {problem ? (
              <p ref={problemRef} tabIndex={-1} role="alert" className="notice notice-error">
                {problem}
              </p>
            ) : null}

            {done ? (
              <div ref={doneRef} tabIndex={-1} role="status" className="notice notice-success grid gap-3">
                <p>{done}</p>
                <div className="flex flex-wrap gap-2">
                  {othersWaiting > 0 ? <Button onClick={onReviewNext}>Review next waiting bidder</Button> : null}
                  <Button variant={othersWaiting > 0 ? 'secondary' : 'primary'} onClick={onClose}>
                    Back to bidders
                  </Button>
                </div>
              </div>
            ) : form ? (
              <FormStack
                onSubmit={submitForm}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" loading={busy !== null} loadingLabel="Saving…" disabled={!reason.trim()}>
                      {form.kind === 'void' ? 'Void strike' : form.act === 'strike' ? `Record strike for ${detail.alias}` : actLabel(form.act, detail)}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy !== null} onClick={cancel}>
                      Cancel
                    </Button>
                  </div>
                }
              >
                <h3 className="text-sm font-medium text-neutral-900">{formTitle(form, detail.alias)}</h3>
                {form.kind === 'void' ? (
                  <p dir="auto" className="break-words text-sm text-neutral-900/60">
                    “{form.strike.reason.length > 120 ? `${form.strike.reason.slice(0, 120)}…` : form.strike.reason}”
                  </p>
                ) : null}
                {form.kind === 'act' && form.act === 'suspend' ? (
                  <p className="text-sm text-neutral-900/60">Bids {detail.alias} already placed stand. Only further bids stop.</p>
                ) : null}
                <Field
                  label={form.kind === 'void' ? 'Why was it a mistake?' : form.act === 'strike' ? 'What happened' : 'Reason'}
                  hint={form.kind === 'void' ? 'Kept with the strike, which stays on record.' : reasonHint(form.act, detail.alias)}
                >
                  {(control) => (
                    <textarea
                      {...control}
                      ref={reasonRef}
                      className="field-input w-full"
                      rows={3}
                      maxLength={MAX_REASON_LENGTH}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  )}
                </Field>
                {form.kind === 'act' && form.act === 'strike' ? (
                  <Field label="Lot" hint={`Counts toward ${detail.policy.strikesToReview} strikes in ${detail.policy.windowDays} days.`}>
                    {(control) => (
                      <Select
                        id={control.id}
                        label="Lot"
                        value={lotId}
                        onChange={setLotId}
                        options={[
                          { value: '', label: 'No particular lot' },
                          ...lots.map((lot) => ({ value: lot.id, label: `Lot ${lot.lotNo}: ${lot.title}` })),
                        ]}
                      />
                    )}
                  </Field>
                ) : null}
              </FormStack>
            ) : (
              <>
                {detail.isSelf ? <p className="text-sm text-neutral-900/70">{SELF_DECISION_SENTENCE}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {bidderActs(detail).map((act, index) =>
                    !actNeedsReason(act) ? (
                      <Button
                        key={act}
                        data-act={act}
                        variant={index === 0 ? 'primary' : 'secondary'}
                        loading={busy === 'approve'}
                        loadingLabel="Approving…"
                        disabled={detail.isSelf || busy !== null}
                        onClick={() => void approve()}
                      >
                        {actLabel(act, detail)}
                      </Button>
                    ) : (
                      <Button
                        key={act}
                        data-act={act}
                        variant={index === 0 && act !== 'decline' && act !== 'suspend' ? 'primary' : 'secondary'}
                        disabled={detail.isSelf || busy !== null}
                        onClick={() => open({ kind: 'act', act }, act)}
                      >
                        {actLabel(act, detail)}
                      </Button>
                    ),
                  )}
                </div>
              </>
            )}
          </section>

          <div className="grid gap-1">
            <p className="text-sm text-neutral-900/70">{strikeStanding(detail.strikes, detail.policy)}</p>
            <Disclosure label={`Strikes (${detail.strikeList.length})`} className="mt-0">
              {detail.strikeList.length === 0 ? (
                <p className="text-sm text-neutral-900/60">No strikes on record.</p>
              ) : (
                <ul className="grid gap-4">
                  {detail.strikeList.map((strike) => (
                    <li key={strike.id} className="grid gap-1 text-sm">
                      <p className="text-xs text-neutral-900/60">
                        {formatDateTime(strike.recordedAt)}
                        {strike.recordedBy ? ` by ${strike.recordedBy}` : ''}
                        {lotName(strike.lotId) ? `, ${lotName(strike.lotId)}` : ''}
                        {strike.auction.id !== auctionId ? `, ${strike.auction.number}` : ''}
                      </p>
                      <p dir="auto" className={`whitespace-pre-line break-words ${strike.voided ? 'text-neutral-900/60 line-through' : 'text-neutral-900'}`}>
                        {strike.reason}
                      </p>
                      {strike.voided ? (
                        <p className="text-xs text-neutral-900/60">
                          Voided {formatDateTime(strike.voided.at)}
                          {strike.voided.by ? ` by ${strike.voided.by}` : ''}: {strike.voided.reason}
                        </p>
                      ) : form === null ? (
                        <Button
                          variant="ghost"
                          className="justify-self-start"
                          data-act={`void-${strike.id}`}
                          disabled={detail.isSelf || busy !== null}
                          onClick={() => open({ kind: 'void', strike }, `void-${strike.id}`)}
                          aria-label={`Void strike, recorded ${formatDateTime(strike.recordedAt)}`}
                        >
                          Void strike
                        </Button>
                      ) : form.kind === 'void' && form.strike.id === strike.id ? (
                        <p className="text-xs text-neutral-900/60">Being voided: finish or cancel the form under Decide.</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** One line of what is known about the person; nothing is shown as blank, because a gap reads as a bug. */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-neutral-900/60">{label}</dt>
      <dd className="break-words text-neutral-900">{value ?? 'Not given'}</dd>
    </div>
  );
}
