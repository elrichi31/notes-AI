import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.GUI_PORT ?? "4321", 10);
const ROOT_DIR = process.cwd();
const HTML_PATH = path.join(ROOT_DIR, "src", "gui.html");
const TRANSCRIPTS_DIR = path.join(ROOT_DIR, "transcripts");
const UPLOAD_DIR = path.join(ROOT_DIR, ".transcribe-work", "uploads");
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const jobs = new Map();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function normalizePathForDisplay(filePath) {
  return filePath.replaceAll("\\", "/");
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(fileName || "audio");
  return baseName.replace(/[^a-z0-9._-]+/gi, "-");
}

function parseBooleanHeader(value) {
  return String(value).toLowerCase() === "true";
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appendLog(job, message) {
  job.logs.push(message);
  if (job.logs.length > 300) {
    job.logs.shift();
  }
}

function extractResultPath(line, label) {
  const prefix = `${label}: `;
  return line.startsWith(prefix) ? line.slice(prefix.length).trim() : null;
}

function resolveInside(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  const normalizedRoot = path.resolve(rootDir) + path.sep;
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(rootDir)) {
    throw new Error("Ruta fuera del directorio permitido.");
  }
  return resolved;
}

async function readRequestBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) {
      throw new Error("El archivo es demasiado grande para la interfaz local.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function createJob() {
  const job = {
    id: randomUUID(),
    status: "queued",
    createdAt: new Date().toISOString(),
    logs: [],
    result: null,
    error: null,
  };

  jobs.set(job.id, job);
  return job;
}

async function handleHome(_request, response) {
  const html = await fs.promises.readFile(HTML_PATH, "utf8");
  sendHtml(response, html);
}

async function handleTranscribe(request, response, url) {
  const rawFileName = url.searchParams.get("fileName") ?? "";
  const fileName = sanitizeFileName(rawFileName);
  const model = (url.searchParams.get("model") ?? "").trim();
  const language = (url.searchParams.get("language") ?? "").trim();
  const diarize = parseBooleanHeader(url.searchParams.get("diarize"));
  const chunkSeconds = parsePositiveInt(url.searchParams.get("chunkSeconds"), 600);
  const glossary = (url.searchParams.get("glossary") ?? "").trim();

  if (!fileName || fileName === ".") {
    sendJson(response, 400, { error: "Falta el nombre del archivo." });
    return;
  }

  const body = await readRequestBody(request);
  if (body.length === 0) {
    sendJson(response, 400, { error: "No se recibio ningun archivo." });
    return;
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const job = createJob();
  const uploadPath = path.join(UPLOAD_DIR, `${job.id}-${fileName}`);

  await fs.promises.writeFile(uploadPath, body);

  job.status = "running";
  appendLog(job, `Archivo recibido: ${fileName}`);
  appendLog(job, `Guardado temporalmente en: ${uploadPath}`);

  const cliArgs = ["src/transcribe.js", "--input", uploadPath, "--out-dir", "transcripts"];

  if (model) {
    cliArgs.push("--model", model);
  }
  if (language) {
    cliArgs.push("--language", language);
  }
  if (diarize) {
    cliArgs.push("--diarize");
  }
  if (chunkSeconds) {
    cliArgs.push("--chunk-seconds", String(chunkSeconds));
  }
  if (glossary) {
    cliArgs.push("--prompt", glossary);
  }
  cliArgs.push("--output-name", path.parse(fileName).name);

  const child = spawn(process.execPath, cliArgs, {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderrBuffer = "";

  const flushLines = (buffer, collector) => {
    const parts = buffer.split(/\r?\n/);
    const pending = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      collector(trimmed);
    }
    return pending;
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    stdoutBuffer = flushLines(stdoutBuffer, (line) => {
      appendLog(job, line);
      const txtPath = extractResultPath(line, "Done");
      const jsonPath = extractResultPath(line, "Metadata");
      const srtPath = extractResultPath(line, "SRT");
      const vttPath = extractResultPath(line, "VTT");
      if (txtPath) {
        job.result = { ...(job.result ?? {}), transcriptPath: txtPath };
      }
      if (jsonPath) {
        job.result = { ...(job.result ?? {}), metadataPath: jsonPath };
      }
      if (srtPath) {
        job.result = { ...(job.result ?? {}), srtPath };
      }
      if (vttPath) {
        job.result = { ...(job.result ?? {}), vttPath };
      }
    });
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    stderrBuffer = flushLines(stderrBuffer, (line) => appendLog(job, `ERROR: ${line}`));
  });

  child.on("error", async (error) => {
    job.status = "error";
    job.error = error.message;
    appendLog(job, `ERROR: ${error.message}`);
    await fs.promises.rm(uploadPath, { force: true });
  });

  child.on("close", async (code) => {
    const finalStdout = stdoutBuffer.trim();
    const finalStderr = stderrBuffer.trim();
    if (finalStdout) appendLog(job, finalStdout);
    if (finalStderr) appendLog(job, `ERROR: ${finalStderr}`);

    if (code === 0) {
      job.status = "success";
      appendLog(job, "Transcripcion terminada correctamente.");
    } else {
      job.status = "error";
      job.error = finalStderr || `El proceso termino con codigo ${code}.`;
      appendLog(job, `ERROR: ${job.error}`);
    }

    await fs.promises.rm(uploadPath, { force: true });
  });

  sendJson(response, 202, { jobId: job.id });
}

function handleJobStatus(_request, response, jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    sendJson(response, 404, { error: "Trabajo no encontrado." });
    return;
  }

  sendJson(response, 200, job);
}

async function loadTranscriptRun(runDir) {
  const entries = await fs.promises.readdir(runDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const jsonFile = files.find((file) => file.endsWith(".json"));
  const txtFile = files.find((file) => file.endsWith(".txt"));
  const srtFile = files.find((file) => file.endsWith(".srt"));
  const vttFile = files.find((file) => file.endsWith(".vtt"));
  const metadataPath = jsonFile ? path.join(runDir, jsonFile) : null;
  const transcriptPath = txtFile ? path.join(runDir, txtFile) : null;
  const srtPath = srtFile ? path.join(runDir, srtFile) : null;
  const vttPath = vttFile ? path.join(runDir, vttFile) : null;

  let metadata = null;
  if (metadataPath) {
    try {
      metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
    } catch {
      metadata = null;
    }
  }

  const transcriptContent = transcriptPath
    ? await fs.promises.readFile(transcriptPath, "utf8").catch(() => "")
    : "";

  const relativeRunDir = path.relative(TRANSCRIPTS_DIR, runDir);
  const createdAt = metadata?.createdAt ?? (await fs.promises.stat(runDir)).mtime.toISOString();

  return {
    id: relativeRunDir,
    title: transcriptPath ? path.basename(transcriptPath, ".txt") : path.basename(runDir),
    createdAt,
    model: metadata?.model ?? "desconocido",
    diarize: Boolean(metadata?.diarize),
    transcriptPath: transcriptPath ? normalizePathForDisplay(path.relative(ROOT_DIR, transcriptPath)) : null,
    metadataPath: metadataPath ? normalizePathForDisplay(path.relative(ROOT_DIR, metadataPath)) : null,
    srtPath: srtPath ? normalizePathForDisplay(path.relative(ROOT_DIR, srtPath)) : null,
    vttPath: vttPath ? normalizePathForDisplay(path.relative(ROOT_DIR, vttPath)) : null,
    preview: transcriptContent.trim().slice(0, 240),
    transcriptContent,
    srtContent: srtPath ? await fs.promises.readFile(srtPath, "utf8").catch(() => "") : "",
    vttContent: vttPath ? await fs.promises.readFile(vttPath, "utf8").catch(() => "") : "",
    metadata,
  };
}

async function listTranscriptRuns() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    return [];
  }

  const dateEntries = await fs.promises.readdir(TRANSCRIPTS_DIR, { withFileTypes: true });
  const runDirs = [];

  for (const dateEntry of dateEntries) {
    if (!dateEntry.isDirectory()) continue;
    const dateDir = path.join(TRANSCRIPTS_DIR, dateEntry.name);
    const timeEntries = await fs.promises.readdir(dateDir, { withFileTypes: true });

    for (const timeEntry of timeEntries) {
      if (!timeEntry.isDirectory()) continue;
      runDirs.push(path.join(dateDir, timeEntry.name));
    }
  }

  const runs = [];
  for (const runDir of runDirs) {
    try {
      runs.push(await loadTranscriptRun(runDir));
    } catch {
      // Ignore malformed transcript folders so the UI still loads.
    }
  }

  return runs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((run) => ({
      id: run.id,
      title: run.title,
      createdAt: run.createdAt,
      model: run.model,
      diarize: run.diarize,
      transcriptPath: run.transcriptPath,
      srtPath: run.srtPath,
      vttPath: run.vttPath,
      preview: run.preview,
    }));
}

async function handleTranscriptList(_request, response) {
  const runs = await listTranscriptRuns();
  sendJson(response, 200, { runs });
}

async function handleTranscriptDetail(_request, response, url) {
  const runId = url.searchParams.get("run") ?? "";
  if (!runId) {
    sendJson(response, 400, { error: "Falta el identificador de la transcripcion." });
    return;
  }

  const runDir = resolveInside(TRANSCRIPTS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    sendJson(response, 404, { error: "Transcripcion no encontrada." });
    return;
  }

  const run = await loadTranscriptRun(runDir);
  sendJson(response, 200, { run });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

    if (request.method === "GET" && url.pathname === "/") {
      await handleHome(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/transcribe") {
      await handleTranscribe(request, response, url);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const jobId = url.pathname.slice("/api/jobs/".length);
      handleJobStatus(request, response, jobId);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/transcripts") {
      await handleTranscriptList(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/transcript") {
      await handleTranscriptDetail(request, response, url);
      return;
    }

    sendJson(response, 404, { error: "Ruta no encontrada." });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Interfaz lista en http://${HOST}:${PORT}`);
});
