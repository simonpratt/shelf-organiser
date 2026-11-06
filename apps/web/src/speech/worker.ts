// The Web Worker that runs Whisper (ADR 0003), so the screen stays responsive
// while the model loads and transcribes. Everything it loads comes from this
// app: the model from /models/ and the ONNX runtime's WASM from the bundle.
// transformers.js keeps both in the Cache API, so only the first load downloads.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import asyncifyMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import asyncifyWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import plainMjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import plainWasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import model from "../../speech-model.json";
import type { FromWorker, ToWorker } from "./transcriber";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
// transformers.js points the runtime at a CDN by default; serve it from here,
// choosing the build as it does: the one that also drives WebGPU, except on
// Safari before 26 without WebGPU, which only runs the plain one.
const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
const safariVersion = /Version\/(\d+).*Safari/.exec(navigator.userAgent)?.[1];
const plain = !gpu && safariVersion !== undefined && Number(safariVersion) < 26 && !/Chrome|Chromium|Android/.test(navigator.userAgent);
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } };
if (onnx.wasm) onnx.wasm.wasmPaths = plain ? { mjs: plainMjs, wasm: plainWasm } : { mjs: asyncifyMjs, wasm: asyncifyWasm };

const post = (message: FromWorker) => self.postMessage(message);
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  let last = 0;
  const progress_callback = (info: { status: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress_total") return;
    const now = performance.now();
    if (now - last < 100 && info.loaded !== info.total) return;
    last = now;
    post({ type: "progress", loaded: info.loaded ?? 0, total: info.total ?? 0 });
  };
  const open = (device: "webgpu" | "wasm") =>
    pipeline("automatic-speech-recognition", model.dir, { device, dtype: "q8", progress_callback });
  // WebGPU where the browser has it, else (or if it fails) WASM on the CPU.
  if (gpu && (await gpu.requestAdapter().catch(() => null))) {
    try {
      return await open("webgpu");
    } catch {
      // fall through to WASM
    }
  }
  return open("wasm");
}

self.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  if (data.type === "load") {
    asr ??= load();
    try {
      await asr;
      post({ type: "ready" });
    } catch (e) {
      asr = null;
      post({ type: "failed", message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  try {
    if (!asr) throw new Error("the speech model isn't loaded");
    const out = await (await asr)(data.audio, { chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
    post({ type: "text", id: data.id, text });
  } catch (e) {
    post({ type: "textFailed", id: data.id, message: e instanceof Error ? e.message : String(e) });
  }
};
