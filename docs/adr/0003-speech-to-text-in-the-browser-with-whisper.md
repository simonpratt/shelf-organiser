---
status: accepted, superseding the speech-to-text part of ADR 0001
---

# Speech-to-text runs in the browser with Whisper base.en, served by the app

The user decided not to rely on the phone keyboard's dictation, which sends the audio to Google or Apple. The Dictate screen now records with `getUserMedia` and `MediaRecorder` and transcribes on the phone with **Whisper base.en, int8-quantised** (`onnx-community/whisper-base.en`, pinned revision) through transformers.js in a Web Worker: WebGPU where the browser offers it, else multithreaded WASM. The text lands in the editable box and goes to Claude exactly as typed text did; the server never handles audio. Typing (or the keyboard's microphone) stays as the fallback where the browser can't record: plain HTTP, an old browser, or the microphone refused.

The model and the ONNX runtime's WASM are served by the app itself, never a CDN or Hugging Face at runtime (a LAN app; privacy). `make model` (and the Dockerfile) download the model at build time from a pinned revision and check each file's SHA-256 (`apps/web/speech-model.json`), so no large binaries are in git. They end up embedded in the binary under `/models/<name>-<revision>/`, served `immutable`, and transformers.js keeps them in the Cache API, so only the first visit to Dictate downloads them, with a progress bar counting both (a load from the cache shows none). The server sends COOP/COEP headers so the page is cross-origin isolated, which lets the WASM runtime use threads.

## Measurements

Headless Chromium on the 8-core arm64 dev sandbox, WASM (no WebGPU there), on a 9 s espeak-ng clip of a shed list and the 11 s JFK clip. Transcription time is from tapping stop to the text appearing, so it includes decoding the recording.

| Model (q8) | Download | Load, cached | 10 s clip, 1 thread | 10 s clip, threads | Shed list as heard |
|---|---|---|---|---|---|
| tiny.en | 41 MB | about 1.3 s | 1.7–2.0 s | not measured | "a **rent** toolbox and three **paintings**" |
| base.en | 77 MB | about 1.4–1.8 s | 3.6–4.0 s | 1.5–1.8 s | "a red tool box and three paint tins" |

Both wrote "crate **on** Christmas lights" and "fellow **America**". Published word error rates on LibriSpeech test-clean (OpenAI's Whisper paper, full-precision models, not measured here) are about 5.6% for tiny.en and 4.2% for base.en, and about 14.6% and 10.2% on the harder test-other (figures as recalled from the paper's tables); int8 quantisation adds a little. base.en was chosen because item names are the whole point and tiny.en garbled two of the five items; with threads it is as fast as tiny.en single-threaded. The runtime's WASM adds 27 MB to the first download, so about 105 MB in all: some 10–20 s on home Wi-Fi, once. On a mid-range phone expect a few times slower than above; that was not measured.

## Considered options

- **tiny.en**: half the download and time, but worse on exactly the nouns that become items.
- **small.en** and larger: 250 MB or more, too slow for a phone.
- **A CDN or Hugging Face at runtime**: no download step in the build, but the phone would fetch from the internet, against the LAN-only, private brief.
- **Committing the model to git**: 77 MB in every clone; a pinned, checksummed download gives the same reproducibility.
- **Keeping the keyboard's dictation (ADR 0001)**: no code, but the audio leaves for the phone vendor, which the user ruled out.

## Consequences

- The image grows by about 120 MB (model, and two WASM builds: the plain one for Safari before 26 without WebGPU).
- `getUserMedia` needs a secure context: over plain HTTP on a LAN address the screen says so and offers typing. Serving the app over HTTPS is the deployment's job.
- Whisper makes words up for silence ("you", "Thank you."), so a recording under a second, or with no tenth of a second above a low loudness, is not sent to it, and its stock phrases for silence are dropped (`heardNothing`, `withoutHallucination` in `speech/voice.ts`).
- The WebGPU path is untested (no GPU in the sandbox) and q8 is the WASM-friendly format, so on a WebGPU phone it may be no faster than WASM. If it proves slower, drop the WebGPU attempt in `speech/worker.ts`.
