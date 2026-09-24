# 65 — Repurposing existing cameras: already the only shape doc 30 allows

"Converting standard IP/CCTV security camera infrastructure into AI
biometric time clocks without purchasing proprietary biometric hardware"
describes exactly the boundary doc 30's own `FaceMatchProvider` extension
point (`docs/implementation/attendance-workforce/30-field-attendance-biometric-geofencing.md`,
lines 139-153) already draws, not by accident: the interface takes an
`imageRef`, never a proprietary device handle —

```ts
export interface FaceMatchProvider {
  verifyPunch(input: { imageRef: string; capturedAt: Date }): Promise<{
    matchedEmployeeId: string | null;
    confidence: number;
  }>;
}
```

— and doc 30's own text states the consequence directly: "a deployment
with no camera hardware runs with zero implementations registered and
simply never gets a `FaceMatchVerification` row, which is a correct,
silent absence, not an error." Nothing in `hr-attendance` imports a vendor
SDK or assumes a specific biometric appliance exists; it depends only on
*something* producing an `imageRef` and a confidence score. This is a
coverage note, not a new document.

## 1. What "repurposing" concretely means here

A standard IP/CCTV camera already streams frames; it becomes a time clock
the moment **any** `FaceMatchProvider` implementation is registered that
can read those frames and produce a match — whether that implementation
calls a proprietary appliance's API, a self-hosted open-source
face-recognition service pointed at the existing RTSP stream, or a
third-party video-analytics platform the camera vendor already offers.
Doc 30 was deliberately written not to care which: `hr-attendance` calls
`verifyPunch(imageRef, capturedAt)` and gets back a match or `null`,
identically regardless of what sits behind the interface.

The one genuinely new piece an "existing CCTV" implementation needs that a
purpose-built appliance's own SDK would otherwise provide for free is
**frame capture and forwarding** — something has to pull a frame from the
existing camera's stream at punch time and hand it to whichever
`FaceMatchProvider` implementation is registered. That capture step lives
entirely inside the vendor-specific implementation itself (per-camera RTSP
URL, per-vendor stream protocol), never inside `hr-attendance` — the same
"core never imports a pack" boundary applied to a hardware integration
instead of a business module.

## Scope lenses

Not repeated — doc 30's own scope lenses already cover every lens for the
`FaceMatchProvider` boundary (actor, principal, revocation, visibility,
absence, idempotency, volume, erasure, failure path) in full, and this
document introduces no new schema, write path, or permission. The only
lens worth restating: **The absent collaborator** — a site with genuinely
no camera of any kind (not even a repurposed one) already degrades
correctly per doc 30's own stated behavior: no `FaceMatchProvider`
registered, no `FaceMatchVerification` rows, attendance continues to work
from `AttendanceEvent`'s own other sources (badge, mobile geofence) alone.

## Work orders

**WO-65.1** — none against `hr-attendance` itself; the interface already
supports this. A vendor-specific `FaceMatchProvider` implementation that
reads an existing IP/CCTV stream (rather than a proprietary appliance's
push API) is registered exactly like any other implementation, at the
point a client's actual camera hardware is known — never built
speculatively ahead of a real deployment's specific stream protocol.
**WO-65.2 — documentation only**: add one sentence to doc 30's own
"Extension point" section (or this document, cross-referenced from there)
stating explicitly that `imageRef` accepts a frame pulled from any camera
source, existing or purpose-bought, so a future implementer does not
mistakenly assume a specific vendor appliance is required.

## Acceptance

- No schema, permission, or service change — `FaceMatchProvider`'s
  existing shape already satisfies this request.
- Doc 30 (or this note) states plainly, in text a future reader will find,
  that an existing CCTV/IP camera is a valid frame source, not only a
  purpose-bought biometric device.

## Out of scope

Any specific vendor's stream-capture implementation — that is real
integration work scoped against a real client's actual camera hardware and
network topology at deployment time, not a generic capability this
document can specify in the abstract.
