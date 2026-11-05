# Dictation uses the phone keyboard's speech-to-text, then Claude

Dictation needs speech-to-text and then parsing into item drafts. The Claude API takes text, images and PDFs but not audio, so it can't do both in one call. We use the dictation built into the phone keyboard (Gboard, iOS) to fill a text box, and send only the transcript to Claude (structured output) to turn it into drafts the user reviews before saving. It needs no audio code, works in every browser, and the keyboard's recogniser is already tuned to the user's voice.

## Considered options

- **Record with MediaRecorder and transcribe with whisper.cpp in the container**: a model of 75 MB or more, cgo or a second binary in a distroless image, and seconds of CPU per clip on homelab hardware. Disproportionate for one user listing shed contents.
- **The browser's Web Speech API**: Chrome sends the audio to Google, Firefox has none, and it needs its own start/stop/error UI. The keyboard gives the same result with none of that.

## Consequences

The app never handles audio. Without `ANTHROPIC_API_KEY` the dictate button is hidden and typed entry is unchanged. If the keyboard's dictation is off, the user can still type a list into the same box.
