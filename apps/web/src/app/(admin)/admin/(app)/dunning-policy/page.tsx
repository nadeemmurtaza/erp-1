'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader } from '@/components/ui';

interface DunningStep {
  daysOverdue: number;
  templateKey: string;
}

interface DunningPolicy {
  id: string;
  stepsJson: DunningStep[];
}

export default function DunningPolicyPage() {
  const [steps, setSteps] = useState<DunningStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    adminFetch<DunningPolicy | null>('/admin/dunning/policy')
      .then((policy) => setSteps(policy?.stepsJson ?? []))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the dunning policy'))
      .finally(() => setLoaded(true));
  }, []);

  const updateStep = (index: number, field: keyof DunningStep, value: string) => {
    const next = [...steps];
    next[index] = { ...next[index], [field]: field === 'daysOverdue' ? parseInt(value, 10) || 0 : value };
    setSteps(next);
  };

  const addStep = () => setSteps([...steps, { daysOverdue: 7, templateKey: '' }]);
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));

  const save = async () => {
    if (steps.length === 0 || steps.some((s) => !s.templateKey.trim() || s.daysOverdue <= 0)) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/dunning/policy', { method: 'PUT', body: { steps } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the dunning policy');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
      <PageHeader
        title="Dunning Policy"
        description="Days-overdue thresholds and which reminder fires at each — the nightly sweep never sends the same step twice for the same order."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 max-w-lg space-y-4">
        {steps.length === 0 ? (
          <p className="text-sm text-neutral-900/60">No steps configured yet — nothing will be sent.</p>
        ) : (
          steps
            .map((step, i) => ({ step, i }))
            .sort((a, b) => a.step.daysOverdue - b.step.daysOverdue)
            .map(({ step, i }) => (
              <div key={i} className="flex items-end gap-3">
                <div className="w-28">
                  <label htmlFor={`dp-days-${i}`} className="mb-1 block text-sm font-medium text-neutral-900">
                    Days overdue
                  </label>
                  <input
                    id={`dp-days-${i}`}
                    type="number"
                    min="1"
                    className="field-input w-full"
                    value={step.daysOverdue}
                    onChange={(e) => updateStep(i, 'daysOverdue', e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor={`dp-template-${i}`} className="mb-1 block text-sm font-medium text-neutral-900">
                    Template
                  </label>
                  <input
                    id={`dp-template-${i}`}
                    className="field-input w-full"
                    value={step.templateKey}
                    onChange={(e) => updateStep(i, 'templateKey', e.target.value)}
                    placeholder="e.g. gentle-reminder"
                  />
                </div>
                <button onClick={() => removeStep(i)} className="text-red-600 hover:underline text-xs pb-2">
                  Remove
                </button>
              </div>
            ))
        )}
        <button onClick={addStep} className="btn-secondary">
          Add step
        </button>
      </div>

      <button onClick={save} disabled={saving || steps.length === 0} className="btn-primary">
        Save policy
      </button>
    </>
  );
}
