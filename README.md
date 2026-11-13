# DartBoard

A responsive, browser-local darts training app. The deployable website is in `dist/`; no build or runtime server is required.

## Use

- **Overview:** clearly labeled example sessions until the first real practice is saved; real scoring, hit-rate and practice-duration summaries thereafter.
- **Practice:** select an exact target and 30/60/90 darts, or play 501/301/101 double-out. Log the segment actually hit using the board or number pad. Undo the last dart, resume after reloading, finish and save.
- **Checkout lab:** routes with 1–3 darts, alternative finishes, and setup visits. Bull counts as a double. Busts reset the whole visit.
- **Form coach:** local video or camera capture, independent timelines, synchronized slow motion, and uploaded professional reference clips. Detect shoulder/elbow/wrist with the self-hosted MediaPipe Pose Landmarker, or mark points manually. Compare visible elbow angles from matched frames.
- **My sessions:** history, per-dart details, filtering and CSV export.

## Privacy and limits

Sessions and preferences use browser localStorage. They do not sync between devices. CSV export provides a summary backup. Videos remain local and are released when leaving the coach; they are not uploaded or retained. Camera access starts only after an explicit action and browser permission.

The experimental MediaPipe model estimates general-purpose pose landmarks. It has **not** been trained or validated on professional darts footage. A 2D elbow-angle difference is an observation, not an assessment of correct posture. Match camera angle, handedness and throw phase; check landmark placement. Detection rejects arm landmarks with visibility below 0.6 and falls back to manual marking.

Professional clips are supplied by the visitor. The app links to the official PDC video library for discovery, and does not copy or train on those videos. A production darts-specific coaching model needs permitted footage, phase/landmark labels, representative amateur recordings, and validation against qualified coaches. See `dist/assets/SOURCES.txt` for model and SDK provenance.

## Develop and verify

Serve `dist/` from an HTTPS static host (HTTPS or localhost is required for camera access). The optional Google Fonts request has system-font fallbacks. ML assets are self-hosted and loaded only on demand.

Requires Node 20+ for source checks only. No package installation is necessary.

```sh
npm test
npm run check
```

Tests cover every score 2–170 with 1–3 darts, returned route validity, double-out and bull, bogey numbers, bust reset and target analytics. The hosting identity lives in `.openai/hosting.json`.
