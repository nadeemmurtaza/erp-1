'use client';

import { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { Loading } from '@/components/ui';

const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md (WO-142.2) — a
 * thin React wrapper mounting `bpmn-js`'s own modeler imperatively via
 * `useRef`/`useEffect`, never as a controlled React component tree
 * (`bpmn-js` owns its own canvas and DOM). Name each task node after the
 * approver's own permission key (e.g. "purchasing.requisitions.approve")
 * or "user:<userId>" — `compileBpmnToApprovalSteps()` reads exactly that
 * on save, the same convention `RequisitionService`'s own hardcoded
 * default already uses for `approverRoleId`.
 *
 * `.claude/rules/dependencies.md`: Dependency: bpmn-js. Purpose: a
 * well-established open-source BPMN 2.0 editor, per doc 142's own explicit
 * requirement, rather than a bespoke diagram tool. Existing Alternative:
 * none — this repository has no diagramming library. Why Insufficient:
 * n/a. Security: vanilla-JS, framework-agnostic, mounts into its own DOM
 * node; no eval, no remote fetch of its own. Maintenance: bpmn-io's own
 * actively maintained BPMN.js project (639+ npm dependents at last check).
 * Bundle/Runtime Impact: loaded only on the one settings screen that
 * mounts `BpmnEditor`, never in the main admin bundle. Approval: owner's
 * own ADR-026 override already names "a well-established open-source
 * BPMN.js-shaped editor" as the required mechanism.
 */
export function BpmnEditor({
  initialXml,
  onSave,
  disabled,
}: {
  initialXml: string | null;
  onSave: (diagramXml: string) => Promise<void>;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<InstanceType<typeof BpmnModeler> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const modeler = new BpmnModeler({ container: containerRef.current });
    modelerRef.current = modeler;
    setReady(false);
    modeler
      .importXML(initialXml ?? EMPTY_DIAGRAM)
      .then(() => setReady(true))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load the diagram'));

    return () => {
      modeler.destroy();
      modelerRef.current = null;
    };
  }, [initialXml]);

  async function save() {
    if (!modelerRef.current) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      await onSave(xml!);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the workflow');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}
      <div className="relative h-[520px] w-full rounded-md border border-neutral-100">
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Loading label="Loading the workflow editor" />
          </div>
        ) : null}
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={disabled || saving || !ready} className="btn-primary">
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
        {saved ? <span className="text-sm text-green-700">Saved.</span> : null}
      </div>
    </div>
  );
}
