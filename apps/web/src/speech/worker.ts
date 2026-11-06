// The Web Worker that runs Whisper (ADR 0003), so the screen stays responsive
// while the model loads and transcribes. Everything it loads comes from this
// app: the model from /models/ and the ONNX runtime's WASM from the bundle.
// transformers.js keeps both in the Cache API, so only the first load downloads,
// and only that one shows progress, counting both.
import { ModelRegistry, env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
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
const wasmPaths = plain ? { mjs: plainMjs, wasm: plainWasm } : { mjs: asyncifyMjs, wasm: asyncifyWasm };
if (onnx.wasm) onnx.wasm.wasmPaths = wasmPaths;
const wasmUrl = new URL(wasmPaths.wasm, self.location.href).href;
const task = "automatic-speech-recognition";

const post = (message: FromWorker) => self.postMessage(message);
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

const openCache = () => caches.open(env.cacheKey).catch(() => null);

/** True when the model and the runtime's WASM are all in the Cache API already. */
async function allCached(): Promise<boolean> {
  try {
    const cache = await openCache();
    return !!(await cache?.match(wasmUrl)) && (await ModelRegistry.is_pipeline_cached(task, model.dir, { dtype: "q8" }));
  } catch {
    return false;
  }
}

/** The size of each file the first load downloads, from the server. */
async function sizes(): Promise<{ wasm: number; model: number }> {
  const size = (url: string) => fetch(url, { method: "HEAD" }).then((r) => Number(r.headers.get("content-length")) || 0);
  const files = await Promise.all(Object.keys(model.files).map((f) => size(`${env.localModelPath}${model.dir}/${f}`)));
  return { wasm: await size(wasmUrl), model: files.reduce((a, b) => a + b, 0) };
}

/**
 * Downloads the runtime's WASM into the cache transformers.js reads it from
 * (keyed by its URL), so the bar can count it; transformers.js then finds it there.
 */
async function fetchWasm(onBytes: (loaded: number) => void) {
  const cache = await openCache();
  if (!cache || (await cache.match(wasmUrl))) return;
  const res = await fetch(wasmUrl);
  if (!res.ok || !res.body) throw new Error(`${wasmUrl}: HTTP ${res.status}`);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (const reader = res.body.getReader(); ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes(loaded);
  }
  await cache.put(wasmUrl, new Response(new Blob(chunks as BlobPart[]), { headers: res.headers }));
}

async function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  // From the cache it takes a second or two: no bar for that.
  const quiet = await allCached();
  const total = quiet ? { wasm: 0, model: 0 } : await sizes();
  let last = 0;
  const report = (loaded: number, all: number) => {
    const now = performance.now();
    if (quiet || (now - last < 100 && loaded !== all)) return;
    last = now;
    post({ type: "progress", loaded, total: all });
  };
  if (!quiet) await fetchWasm((loaded) => report(loaded, total.wasm + total.model));
  const progress_callback = (info: { status: string; loaded?: number; total?: number }) => {
    if (info.status !== "progress_total") return;
    report(total.wasm + (info.loaded ?? 0), total.wasm + Math.max(info.total ?? 0, total.model));
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
