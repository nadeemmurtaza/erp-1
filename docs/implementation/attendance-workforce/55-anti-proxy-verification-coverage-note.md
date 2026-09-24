# 55 — Anti-proxy verification: already specified in doc 30

"Purpose-built biometric validation to permanently eliminate buddy
punching and proxy attendance without physical contact" is, word for
word, what `30-field-attendance-biometric-geofencing.md` already
specifies. This document exists only to say so plainly, cite the exact
mechanism, and name the one piece doc 30 itself left as a real, open
question — so nobody builds a second anti-proxy design believing this
gap is unaddressed.

## Where it already lives

- **`FaceMatchProvider`** (doc 30 §1) — the extension-point interface a
  CCTV/camera-based face-recognition appliance implements, verified
  against `FaceMatchProfile`, contactless by construction (a camera, not
  a fingerprint or card reader).
- **`FaceMatchVerification`** (doc 30 §1 schema) — one row per match
  attempt, linked to the underlying `AttendanceEvent` it verifies —
  this is the actual anti-proxy mechanism: a coworker badging in for an
  absent employee still writes a punch, but the camera's own
  independent identity check flags the mismatch as
  `FACE_MATCH_MISMATCH` on doc 22's existing reconcile queue, caught
  without ever refusing the door.
- **The explicit design reasoning** (doc 30 §1) already states why this
  is contactless rather than a physical scanner: "a camera does not
  replace `AttendanceEvent.source`... what CCTV adds is a verification
  signal attached to a punch."
- **Privacy-by-design, already stated** (doc 30's own scope lens on
  erasure): "this repository never stores a raw biometric template" —
  the appliance holds templates, this system holds only match results.

## The one thing doc 30 leaves open, restated here for visibility

Doc 30's own "Out of scope" section already names it: **which specific
vendor appliance implements `FaceMatchProvider`** is not decided — doc 30
builds the interface and the verification/exception path, deliberately
not a specific camera hardware integration, for the identical reason doc
15 does not guess FBR's field format: a specific vendor's SDK/protocol
should be chosen against a real procurement decision, not assumed here.

## Acceptance

Doc 30's own acceptance criteria already cover this domain in full — a
punch with low face-match confidence is flagged, never refused; a forged
appliance webhook is rejected; revoking a profile stops future matches
without touching history. Nothing here adds to that list.

## Out of scope

Everything this document's title names is already specified in doc 30;
there is no further scoping pass here. Selecting and integrating a
specific vendor's face-recognition appliance remains the one named,
deliberately deferred decision — doc 30's own `FaceMatchProvider`
interface is what makes that choice a driver, not a redesign, whenever it
is made.
