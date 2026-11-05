# Dictation uses the phone keyboard's speech-to-text, then Claude

Dictation needs speech-to-text and then parsing into item drafts. The Claude API takes text, images and PDFs but not audio, so it can't do both in one call.

**Speech-to-text is done by the phone vendor's keyboard dictation (Gboard, iOS), not by Anthropic or a local model.** The app gets only the text it types into a box, and sends that transcript to Claude (structured output) to turn it into drafts the user reviews before saving. It needs no audio code, works in every browser, and the keyboard's recogniser is already tuned to the user's voice. The cost is that the audio goes to Google or Apple under the phone's own settings, outside this app's control.

## Considered options

- **Record with MediaRecorder and transcribe with whisper.cpp in the container**: a model of 75 MB or more, cgo or a second binary in a distroless image, and seconds of CPU per clip on homelab hardware. Disproportionate for one user listing shed contents.
- **Record with MediaRecorder and transcribe in the browser with Whisper (transformers.js)**: keeps the audio on the phone and needs no server change, but the phone downloads and caches a model of roughly 40–150 MB (tiny to base) on first use, transcription takes several seconds per clip on a mid-range phone, and the app gains recording, progress and failure UI plus a large client dependency. Viable if keeping audio away from the phone vendor matters; not chosen for now.
- **The browser's Web Speech API**: Chrome sends the audio to Google, Firefox has none, and it needs its own start/stop/error UI. The keyboard gives the same result with none of that.

## Consequences

The app never handles audio. Without `ANTHROPIC_API_KEY` the dictate button is hidden and typed entry is unchanged. If the keyboard's dictation is off, the user can still type a list into the same box.
