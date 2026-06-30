import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { generateAndPersistMeetingSummary, MEETING_SUMMARY_MODEL } from "./meeting-summary.js";

const ROOT_DIR = process.cwd();
const TRANSCRIPTS_DIR = path.join(ROOT_DIR, "transcripts");
const UPLOAD_DIR = path.join(ROOT_DIR, ".transcribe-work", "uploads");
const JOBS_DIR = path.join(ROOT_DIR, ".transcribe-work", "jobs");
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const jobs = new Map();

function normalizePathForDisplay(filePath) {
  return filePath.replaceAll("\\", "/");
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(fileName || "audio");
  return baseName.replace(/[^a-z0-9._-]+/gi, "-");
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
  queueJobPersist(job);
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

function getJobFilePath(jobId) {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    logs: job.logs,
    result: job.result,
    error: job.error,
  };
}

async function persistJob(job) {
  await fs.promises.mkdir(JOBS_DIR, { recursive: true });
  await fs.promises.writeFile(
    getJobFilePath(job.id),
    JSON.stringify(serializeJob(job), null, 2),
    "utf8"
  );
}

function queueJobPersist(job) {
  job._persistPromise = (job._persistPromise ?? Promise.resolve())
    .then(() => persistJob(job))
    .catch(() => {});
  return job._persistPromise;
}

async function finalizeMeetingSummary(job) {
  const transcriptPath = job.result?.transcriptPath;
  const metadataPath = job.result?.metadataPath;

  if (!transcriptPath || !metadataPath) {
    appendLog(job, "Resumen omitido: no se encontraron archivos finales.");
    return;
  }

  appendLog(job, `Generando titulo y descripcion con ${MEETING_SUMMARY_MODEL}...`);

  try {
    const summary = await generateAndPersistMeetingSummary({
      transcriptPath,
      metadataPath,
      fallbackTitle: path.basename(transcriptPath, ".txt"),
    });

    if (summary?.title || summary?.description) {
      job.result = {
        ...job.result,
        aiTitle: summary.title ?? null,
        aiDescription: summary.description ?? null,
      };
      appendLog(job, `Resumen listo: ${summary.title}`);
    }
  } catch (error) {
    appendLog(
      job,
      `Resumen omitido: ${error instanceof Error ? error.message : "No se pudo resumir la reunion."}`
    );
  }
}

export async function createTranscriptionJob({
  fileBuffer,
  fileName,
  model,
  language,
  diarize,
  chunkSeconds,
  glossary,
}) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("No se recibio ningun archivo.");
  }

  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("El archivo es demasiado grande para la interfaz local.");
  }

  const safeFileName = sanitizeFileName(fileName);
  if (!safeFileName || safeFileName === ".") {
    throw new Error("Falta el nombre del archivo.");
  }

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const job = createJob();
  const uploadPath = path.join(UPLOAD_DIR, `${job.id}-${safeFileName}`);
  await queueJobPersist(job);

  await fs.promises.writeFile(uploadPath, fileBuffer);

  job.status = "running";
  appendLog(job, `Archivo recibido: ${safeFileName}`);
  appendLog(job, `Guardado temporalmente en: ${uploadPath}`);
  await queueJobPersist(job);

  const cliArgs = ["src/transcribe.js", "--input", uploadPath, "--out-dir", "transcripts"];

  if (model) cliArgs.push("--model", model);
  if (language) cliArgs.push("--language", language);
  if (diarize) cliArgs.push("--diarize");
  cliArgs.push("--chunk-seconds", String(parsePositiveInt(chunkSeconds, 600)));
  if (glossary) cliArgs.push("--prompt", glossary);
  cliArgs.push("--output-name", path.parse(safeFileName).name);

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

      if (txtPath) job.result = { ...(job.result ?? {}), transcriptPath: txtPath };
      if (jsonPath) job.result = { ...(job.result ?? {}), metadataPath: jsonPath };
      if (srtPath) job.result = { ...(job.result ?? {}), srtPath };
      if (vttPath) job.result = { ...(job.result ?? {}), vttPath };
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
    await queueJobPersist(job);
    await fs.promises.rm(uploadPath, { force: true });
  });

  child.on("close", async (code) => {
    const finalStdout = stdoutBuffer.trim();
    const finalStderr = stderrBuffer.trim();

    if (finalStdout) appendLog(job, finalStdout);
    if (finalStderr) appendLog(job, `ERROR: ${finalStderr}`);

    if (code === 0) {
      await finalizeMeetingSummary(job);
      job.status = "success";
      appendLog(job, "Transcripcion terminada correctamente.");
    } else {
      job.status = "error";
      job.error = finalStderr || `El proceso termino con codigo ${code}.`;
      appendLog(job, `ERROR: ${job.error}`);
    }

    await queueJobPersist(job);
    await fs.promises.rm(uploadPath, { force: true });
  });

  return job;
}

export async function getJob(jobId) {
  const inMemoryJob = jobs.get(jobId);
  if (inMemoryJob) {
    return serializeJob(inMemoryJob);
  }

  try {
    const raw = await fs.promises.readFile(getJobFilePath(jobId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
    aiTitle: metadata?.meetingSummary?.title ?? "",
    aiDescription: metadata?.meetingSummary?.description ?? "",
    detailedSummary: metadata?.detailedSummary ?? null,
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

export async function listTranscriptRuns() {
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
      aiTitle: run.aiTitle,
      aiDescription: run.aiDescription,
      transcriptPath: run.transcriptPath,
      metadataPath: run.metadataPath,
      srtPath: run.srtPath,
      vttPath: run.vttPath,
      preview: run.preview,
    }));
}

export async function getTranscriptRun(runId) {
  const runDir = resolveInside(TRANSCRIPTS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    throw new Error("Transcripcion no encontrada.");
  }

  return loadTranscriptRun(runDir);
}

export async function getTranscriptDownload(runId, format) {
  const run = await getTranscriptRun(runId);

  const candidates = {
    txt: run.transcriptPath,
    srt: run.srtPath,
    vtt: run.vttPath,
    json: run.metadataPath,
  };

  const chosenPath = candidates[format];
  if (!chosenPath) {
    throw new Error("Formato no disponible.");
  }

  const absolutePath = path.join(ROOT_DIR, chosenPath.replaceAll("/", path.sep));
  const content = await fs.promises.readFile(absolutePath);

  const contentTypes = {
    txt: "text/plain; charset=utf-8",
    srt: "text/plain; charset=utf-8",
    vtt: "text/vtt; charset=utf-8",
    json: "application/json; charset=utf-8",
  };

  return {
    buffer: content,
    contentType: contentTypes[format] ?? "application/octet-stream",
    fileName: path.basename(absolutePath),
  };
}
