import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Transcriber } from "./transcriber";

const mic = vi.hoisted(() => ({ start: vi.fn(), decode: vi.fn() }));
vi.mock("./microphone", async (actual) => ({
  ...(await actual<typeof import("./microphone")>()),
  startRecording: mic.start,
  decodeForWhisper: mic.decode,
}));
const fake = vi.hoisted(() => ({ load: vi.fn(), transcribe: vi.fn() }) satisfies Transcriber);
vi.mock("./transcriber", () => ({ transcriber: () => fake }));

const { useVoice } = await import("./useVoice");

beforeEach(() => {
  vi.resetAllMocks();
  mic.start.mockResolvedValue({ stop: async () => new Blob(["audio"]), cancel: vi.fn() });
  mic.decode.mockResolvedValue(new Float32Array(16_000));
});

it("loads the model on opening, then turns a tap-to-stop recording into text", async () => {
  // Like the real one, every load waits on the same download.
  let ready!: () => void;
  const loaded = new Promise<void>((resolve) => (ready = resolve));
  fake.load.mockImplementation((onProgress: (l: number, t: number) => void) => {
    onProgress(40, 100);
    return loaded;
  });
  fake.transcribe.mockResolvedValue("two camping chairs");
  const onText = vi.fn();
  const { result } = renderHook(() => useVoice(onText, true));
  await waitFor(() => expect(result.current.voice.model).toEqual({ status: "loading", loaded: 40, total: 100 }));

  // Speaking while the model is still downloading waits for it.
  act(() => result.current.dispatch({ type: "press", now: 0 }));
  act(() => result.current.dispatch({ type: "release", now: 10 }));
  await waitFor(() => expect(result.current.voice.mic.status).toBe("listening"));
  act(() => result.current.dispatch({ type: "press", now: 5000 }));
  expect(result.current.voice.mic.status).toBe("writing");
  await act(async () => ready());
  await waitFor(() => expect(result.current.voice.mic.status).toBe("idle"));
  expect(onText).toHaveBeenCalledWith("two camping chairs");
  expect(result.current.voice.model.status).toBe("ready");
});

it("says the microphone was refused and writes nothing", async () => {
  fake.load.mockResolvedValue(undefined);
  mic.start.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
  const onText = vi.fn();
  const { result } = renderHook(() => useVoice(onText, true));
  act(() => result.current.dispatch({ type: "press", now: 0 }));
  await waitFor(() => expect(result.current.voice.mic).toEqual({ status: "idle", notice: "denied" }));
  expect(onText).not.toHaveBeenCalled();
});

it("shows a failed transcription as an error and keeps the button ready", async () => {
  fake.load.mockResolvedValue(undefined);
  fake.transcribe.mockRejectedValue(new Error("out of memory"));
  const { result } = renderHook(() => useVoice(vi.fn(), true));
  act(() => result.current.dispatch({ type: "press", now: 0 }));
  await waitFor(() => expect(result.current.voice.mic.status).toBe("listening"));
  act(() => result.current.dispatch({ type: "press", now: 1 }));
  await waitFor(() => expect(result.current.voice.mic).toEqual({ status: "idle", error: "out of memory" }));
});

it("takes a recording too short to decode as nothing said", async () => {
  fake.load.mockResolvedValue(undefined);
  mic.decode.mockRejectedValue(new DOMException("Unable to decode audio data", "EncodingError"));
  const onText = vi.fn();
  const { result } = renderHook(() => useVoice(onText, true));
  act(() => result.current.dispatch({ type: "press", now: 0 }));
  await waitFor(() => expect(result.current.voice.mic.status).toBe("listening"));
  act(() => result.current.dispatch({ type: "press", now: 1 }));
  await waitFor(() => expect(result.current.voice.mic).toEqual({ status: "idle", notice: "nothing" }));
  expect(fake.transcribe).not.toHaveBeenCalled();
  expect(onText).not.toHaveBeenCalled();
});

it("loads nothing where the browser can't record", () => {
  renderHook(() => useVoice(vi.fn(), false));
  expect(fake.load).not.toHaveBeenCalled();
});
