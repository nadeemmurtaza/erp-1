'use client';

import { useState } from 'react';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DateField } from '@/components/ui/date-field';

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y' | 'TIERED';
export type DiscountScope = 'ORDER' | 'PRODUCT' | 'CATEGORY' | 'COLLECTION' | 'SHIPPING';

export interface DiscountFormValues {
  name: string;
  type: DiscountType;
  scope: DiscountScope;
  value: number; // bps for PERCENTAGE/TIERED, paisa for FIXED_AMOUNT
  maxDiscount: number | null;
  minSubtotal: number | null;
  minQuantity: number | null;
  productIds: string[];
  categoryIds: string[];
  firstOrderOnly: boolean;
  buyQuantity: number | null;
  getQuantity: number | null;
  getDiscountBps: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  isStackable: boolean;
  priority: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
}

export const EMPTY_DISCOUNT: DiscountFormValues = {
  name: '',
  type: 'PERCENTAGE',
  scope: 'ORDER',
  value: 0,
  maxDiscount: null,
  minSubtotal: null,
  minQuantity: null,
  productIds: [],
  categoryIds: [],
  firstOrderOnly: false,
  buyQuantity: null,
  getQuantity: null,
  getDiscountBps: null,
  startsAt: null,
  endsAt: null,
  isActive: true,
  isStackable: false,
  priority: 0,
  usageLimit: null,
  usageLimitPerUser: null,
};

interface PreviewResult {
  ordersAffected: number;
  ordersSampled: number;
  revenueGivenUp: number;
  marginImpact: number;
}

function toApiPayload(values: DiscountFormValues) {
  return {
    name: values.name,
    type: values.type,
    scope: values.scope,
    value: values.value,
    maxDiscount: values.maxDiscount,
    minSubtotal: values.minSubtotal,
    minQuantity: values.minQuantity,
    productIds: values.productIds,
    categoryIds: values.categoryIds,
    firstOrderOnly: values.firstOrderOnly,
    buyQuantity: values.buyQuantity,
    getQuantity: values.getQuantity,
    getDiscountBps: values.getDiscountBps,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    isActive: values.isActive,
    isStackable: values.isStackable,
    priority: values.priority,
    usageLimit: values.usageLimit,
    usageLimitPerUser: values.usageLimitPerUser,
  };
}

/**
 * The discount builder — one form, shared by "new" and "edit" (Law 5's own
 * job is "define a discount rule"; create vs. update is just which endpoint
 * the same payload goes to). The 30-day preview (WO-5.6) is worth the effort
 * the doc asks for: it runs the SAME evaluator the real checkout uses,
 * against the shop's own last month of orders, before anything goes live.
 */
export function DiscountForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial: DiscountFormValues;
  onSubmit: (payload: ReturnType<typeof toApiPayload>) => Promise<void>;
  submitLabel: string;
}) {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [values, setValues] = useState<DiscountFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const isPercentageLike = values.type === 'PERCENTAGE' || values.type === 'TIERED';
  const isBuyXGetY = values.type === 'BUY_X_GET_Y';
  const needsValue = isPercentageLike || values.type === 'FIXED_AMOUNT';

  function update<K extends keyof DiscountFormValues>(key: K, value: DiscountFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function parseIds(text: string): string[] {
    return text
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await adminFetch<PreviewResult>('/admin/promotions/discounts/preview', {
        method: 'POST',
        body: toApiPayload(values),
      });
      setPreview(result);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not run the preview', 'error');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(toApiPayload(values));
      addToast('Discount saved.', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the discount', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
        <label className="block">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Eid sale — 10% off"
            required
          />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Type</span>
            <select className="field-input" value={values.type} onChange={(e) => update('type', e.target.value as DiscountType)}>
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
              <option value="FREE_SHIPPING">Free shipping</option>
              <option value="BUY_X_GET_Y">Buy X get Y</option>
              <option value="TIERED">Tiered (spend more, save more)</option>
            </select>
          </label>

          <label className="block">
            <span className="field-label">Applies to</span>
            <select className="field-input" value={values.scope} onChange={(e) => update('scope', e.target.value as DiscountScope)}>
              <option value="ORDER">Whole order</option>
              <option value="PRODUCT">Specific products</option>
              <option value="CATEGORY">A category</option>
              <option value="COLLECTION">A collection</option>
              <option value="SHIPPING">Shipping</option>
            </select>
          </label>
        </div>

        {needsValue && (
          <label className="block">
            <span className="field-label">{isPercentageLike ? 'Percentage off' : 'Amount off (Rs)'}</span>
            <input
              type="number"
              min={0}
              className="field-input"
              value={isPercentageLike ? values.value / 100 : values.value / 100}
              onChange={(e) =>
                update('value', isPercentageLike ? Math.round(Number(e.target.value) * 100) : Math.round(Number(e.target.value) * 100))
              }
              required
            />
          </label>
        )}

        {isPercentageLike && (
          <label className="block">
            <span className="field-label">Cap the discount at (Rs, optional)</span>
            <input
              type="number"
              min={0}
              className="field-input"
              value={values.maxDiscount === null ? '' : values.maxDiscount / 100}
              onChange={(e) => update('maxDiscount', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))}
            />
          </label>
        )}

        {isBuyXGetY && (
          <div className="flex flex-wrap gap-4">
            <label className="block">
              <span className="field-label">Buy quantity</span>
              <input
                type="number"
                min={1}
                className="field-input"
                value={values.buyQuantity ?? ''}
                onChange={(e) => update('buyQuantity', e.target.value === '' ? null : Number(e.target.value))}
                required
              />
            </label>
            <label className="block">
              <span className="field-label">Get quantity</span>
              <input
                type="number"
                min={1}
                className="field-input"
                value={values.getQuantity ?? ''}
                onChange={(e) => update('getQuantity', e.target.value === '' ? null : Number(e.target.value))}
                required
              />
            </label>
            <label className="block">
              <span className="field-label">Discount on those units (%, 100 = free)</span>
              <input
                type="number"
                min={1}
                max={100}
                className="field-input"
                value={values.getDiscountBps === null ? '' : values.getDiscountBps / 100}
                onChange={(e) => update('getDiscountBps', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))}
                required
              />
            </label>
          </div>
        )}

        {(values.scope === 'PRODUCT' || values.scope === 'COLLECTION') && (
          <label className="block">
            <span className="field-label">Product IDs (comma-separated)</span>
            <input
              className="field-input"
              value={values.productIds.join(', ')}
              onChange={(e) => update('productIds', parseIds(e.target.value))}
            />
          </label>
        )}

        {values.scope === 'CATEGORY' && (
          <label className="block">
            <span className="field-label">Category IDs (comma-separated)</span>
            <input
              className="field-input"
              value={values.categoryIds.join(', ')}
              onChange={(e) => update('categoryIds', parseIds(e.target.value))}
            />
          </label>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Minimum order value (Rs, optional)</span>
            <input
              type="number"
              min={0}
              className="field-input"
              value={values.minSubtotal === null ? '' : values.minSubtotal / 100}
              onChange={(e) => update('minSubtotal', e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))}
            />
          </label>
          <label className="block">
            <span className="field-label">Minimum quantity (optional)</span>
            <input
              type="number"
              min={1}
              className="field-input"
              value={values.minQuantity ?? ''}
              onChange={(e) => update('minQuantity', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="discount-starts" className="field-label">
              Starts (optional)
            </label>
            <DateField
              id="discount-starts"
              value={values.startsAt ? values.startsAt.slice(0, 10) : ''}
              onChange={(next) => update('startsAt', next ? new Date(next).toISOString() : null)}
            />
          </div>
          <div>
            <label htmlFor="discount-ends" className="field-label">
              Ends (optional)
            </label>
            <DateField
              id="discount-ends"
              value={values.endsAt ? values.endsAt.slice(0, 10) : ''}
              onChange={(next) => update('endsAt', next ? new Date(next).toISOString() : null)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="field-label">Total redemption limit (optional)</span>
            <input
              type="number"
              min={1}
              className="field-input"
              value={values.usageLimit ?? ''}
              onChange={(e) => update('usageLimit', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="field-label">Per-customer limit (optional)</span>
            <input
              type="number"
              min={1}
              className="field-input"
              value={values.usageLimitPerUser ?? ''}
              onChange={(e) => update('usageLimitPerUser', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="field-label">Priority (lower runs first when stacked)</span>
            <input
              type="number"
              className="field-input"
              value={values.priority}
              onChange={(e) => update('priority', Number(e.target.value))}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-neutral-900/70">
            <input type="checkbox" className="field-check" checked={values.isActive} onChange={(e) => update('isActive', e.target.checked)} />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-900/70">
            <input
              type="checkbox"
              className="field-check"
              checked={values.isStackable}
              onChange={(e) => update('isStackable', e.target.checked)}
            />
            Can combine with other discounts
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-900/70">
            <input
              type="checkbox"
              className="field-check"
              checked={values.firstOrderOnly}
              onChange={(e) => update('firstOrderOnly', e.target.checked)}
            />
            First order only
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : submitLabel}
          </button>
          <button type="button" onClick={() => void handlePreview()} disabled={previewing || !values.name} className="btn-secondary">
            {previewing ? 'Running…' : 'Preview against last 30 days'}
          </button>
        </div>

        {preview && (
          <div className="card p-4 text-sm">
            <p>
              Would have affected <strong>{preview.ordersAffected}</strong> of the last{' '}
              <strong>{preview.ordersSampled}</strong> orders.
            </p>
            <p>
              Revenue given up: <strong>{formatMoney(preview.revenueGivenUp)}</strong>
            </p>
            <p>
              Margin impact: <strong>{formatMoney(preview.marginImpact)}</strong>
            </p>
          </div>
        )}
      </form>
    </>
  );
}
