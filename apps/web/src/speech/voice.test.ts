import { describe, expect, it } from "vitest";
import { HOLD_MS, appendSpoken, downloadLabel, elapsedLabel, heardNothing, initialVoice, step, voiceSupport, withoutHallucination, type Event, type Voice } from "./voice";

const run = (events: Event[], from: Voice = initialVoice) =>
  events.reduce<{ state: Voice; effects: (string | null)[] }>(
    (acc, e) => {
      const { state, effect } = step(acc.state, e);
      return { state, effects: [...acc.effects, effect] };
    },
    { state: from, effects: [] },
  );

describe("voiceSupport", () => {
  const ok = { isSecureContext: true, getUserMedia: true, mediaRecorder: true, worker: true, webAssembly: true };
  it("offers the microphone where everything it needs is there", () => expect(voiceSupport(ok)).toBeNull());
  it("says plain HTTP is the reason before anything else, as browsers hide the microphone there", () =>
    expect(voiceSupport({ ...ok, isSecureContext: false, getUserMedia: false })).toBe("insecure"));
  it("calls a browser without recording or WebAssembly unsupported", () => {
    expect(voiceSupport({ ...ok, mediaRecorder: false })).toBe("unsupported");
    expect(voiceSupport({ ...ok, webAssembly: false })).toBe("unsupported");
  });
});

describe("step", () => {
  it("starts loading the model when Dictate opens, and again on Retry after a failure", () => {
    const opened = run([{ type: "load" }, { type: "progress", loaded: 5, total: 10 }]);
    expect(opened.effects[0]).toBe("loadModel");
    expect(opened.state.model).toEqual({ status: "loading", loaded: 5, total: 10 });
    const failed = run([{ type: "modelFailed", message: "404" }, { type: "load" }], opened.state);
    expect(failed.state.model).toEqual({ status: "loading", loaded: 0, total: 0 });
    expect(failed.effects[1]).toBe("loadModel");
    expect(run([{ type: "modelReady" }, { type: "load" }]).effects[1]).toBeNull();
  });

  it("taps to start and taps again to stop, then writes down what was said", () => {
    const { state, effects } = run([
      { type: "press", now: 0 },
      { type: "release", now: 100 },
      { type: "granted", now: 300 },
      { type: "press", now: 5000 },
      { type: "release", now: 5100 },
      { type: "written", text: "two chairs" },
    ]);
    expect(effects).toEqual(["askMic", null, null, "stopMic", null, null]);
    expect(state.mic).toEqual({ status: "idle", notice: undefined });
  });

  it("stops on letting go after holding, but keeps listening after a short press", () => {
    const listening = run([{ type: "press", now: 0 }, { type: "granted", now: 50 }]).state;
    expect(step(listening, { type: "release", now: HOLD_MS }).effect).toBe("stopMic");
    const tapped = step(listening, { type: "release", now: HOLD_MS - 1 });
    expect(tapped.state.mic).toMatchObject({ status: "listening", held: false });
    // A later release (the stop tap's) doesn't stop it again.
    expect(step(tapped.state, { type: "release", now: 9999 }).effect).toBeNull();
  });

  it("treats a press let go while the permission prompt is up as a tap", () => {
    const { state } = run([{ type: "press", now: 0 }, { type: "release", now: 2000 }, { type: "granted", now: 3000 }]);
    expect(state.mic).toMatchObject({ status: "listening", held: false });
  });

  it("says when the microphone is refused, and lets the user try again", () => {
    const { state } = run([{ type: "press", now: 0 }, { type: "denied" }]);
    expect(state.mic).toEqual({ status: "idle", notice: "denied" });
    expect(step(state, { type: "press", now: 1 }).effect).toBe("askMic");
  });

  it("stops by itself at the time limit and says so", () => {
    const { state, effects } = run([{ type: "press", now: 0 }, { type: "granted", now: 0 }, { type: "timeUp" }, { type: "written", text: "lamp" }]);
    expect(effects[2]).toBe("stopMic");
    expect(state.mic).toEqual({ status: "idle", notice: "timeUp" });
  });

  it("says when nothing was heard", () => {
    const { state } = run([{ type: "press", now: 0 }, { type: "granted", now: 0 }, { type: "press", now: 1 }, { type: "written", text: "  " }]);
    expect(state.mic).toEqual({ status: "idle", notice: "nothing" });
  });

  it("ignores presses while asking or writing", () => {
    const asking = run([{ type: "press", now: 0 }]).state;
    expect(step(asking, { type: "press", now: 1 }).effect).toBeNull();
    const writing = run([{ type: "granted", now: 0 }, { type: "press", now: 1 }], asking).state;
    expect(writing.mic.status).toBe("writing");
    expect(step(writing, { type: "press", now: 2 }).state).toBe(writing);
  });

  it("fails what is waiting to be written when the model fails to load", () => {
    const writing = run([{ type: "press", now: 0 }, { type: "granted", now: 0 }, { type: "press", now: 1 }]).state;
    const { state } = step(writing, { type: "modelFailed", message: "out of memory" });
    expect(state.mic).toEqual({ status: "idle", error: "out of memory" });
    expect(state.model).toEqual({ status: "failed", message: "out of memory" });
  });

  it("ignores a permission that arrives after the screen gave up asking", () => {
    expect(step(initialVoice, { type: "granted", now: 0 }).state).toBe(initialVoice);
  });
});

describe("appendSpoken", () => {
  it("adds what was said after the text so far", () => {
    expect(appendSpoken("", " two chairs ")).toBe("two chairs");
    expect(appendSpoken("two chairs,\n", "and a lamp")).toBe("two chairs, and a lamp");
    expect(appendSpoken("two chairs", "")).toBe("two chairs");
  });
});

describe("labels", () => {
  it("shows the download in whole megabytes", () => {
    expect(downloadLabel(23_400_000, 77_100_000)).toBe("23 of 77 MB");
    expect(downloadLabel(0, 0)).toBe("Starting…");
  });
  it("shows how long it has been listening as m:ss", () => {
    expect(elapsedLabel(7_900)).toBe("0:07");
    expect(elapsedLabel(65_000)).toBe("1:05");
    expect(elapsedLabel(-5)).toBe("0:00");
  });
});

describe("heardNothing", () => {
  const tone = (seconds: number, amplitude: number) =>
    Float32Array.from({ length: seconds * 16_000 }, (_, i) => amplitude * Math.sin(i / 5));
  it("passes a recording with a second or more of speech in it", () => expect(heardNothing(tone(1, 0.1))).toBe(false));
  it("drops a tap shorter than a second, however loud", () => expect(heardNothing(tone(0.9, 0.5))).toBe(true));
  it("drops a near-silent recording", () => expect(heardNothing(tone(5, 0.005))).toBe(true));
  it("passes one short word in a long quiet recording", () => {
    const audio = tone(5, 0.002);
    audio.set(tone(0.3, 0.1), 2 * 16_000);
    expect(heardNothing(audio)).toBe(false);
  });
});

it("drops Whisper's stock phrases for silence, but keeps them inside a real list", () => {
  expect(withoutHallucination(" you")).toBe("");
  expect(withoutHallucination("Thank you.")).toBe("");
  expect(withoutHallucination("Thanks for watching!")).toBe("");
  expect(withoutHallucination("[BLANK_AUDIO]")).toBe("");
  expect(withoutHallucination("Wheelbarrow.")).toBe("Wheelbarrow.");
  expect(withoutHallucination("A drill, thank you.")).toBe("A drill, thank you.");
});
