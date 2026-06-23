import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-transcribe";
const DIARIZATION_MODEL = "gpt-4o-transcribe-diarize";
const DEFAULT_CHUNK_SECONDS = 600;
const DEFAULT_AUDIO_BITRATE = "32k";
const DEFAULT_DIARIZE_AUDIO_BITRATE = "64k";
const DEFAULT_SAMPLE_RATE = "16000";
const DEFAULT_AUDIO_FILTERS = "highpass=f=80,lowpass=f=8000,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MINI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

function printHelp() {
  console.log(`
Usage:
  npm run transcribe -- --input "meeting.mp4"
  npm run transcribe:diarize -- --input "meeting.mp4"

Options:
  --input, -i       Video or audio file to transcribe. Required.
  --out-dir         Output directory. Default: transcripts
  --model           OpenAI transcription model. Default: ${DEFAULT_MODEL}
                    Useful values: ${DEFAULT_MODEL}, ${MINI_TRANSCRIBE_MODEL}, ${DIARIZATION_MODEL}
  --diarize         Label who spoke in each segment with ${DIARIZATION_MODEL}.
  --speaker         Optional known speaker reference as Name=audio.wav. Repeat up to 4 times.
  --chunk-seconds   Chunk length in seconds. Default: ${DEFAULT_CHUNK_SECONDS}
  --audio-bitrate   MP3 bitrate for chunks. Default: ${DEFAULT_AUDIO_BITRATE}, or ${DEFAULT_DIARIZE_AUDIO_BITRATE} with --diarize.
  --no-audio-cleanup Disable local voice cleanup filters before transcription.
  --language        Optional ISO language hint, for example es or en.
  --prompt          Optional glossary or context to bias transcription wording.
  --output-name     Optional base name for generated files.
  --keep-chunks     Keep generated audio chunks for inspection.
  --help, -h        Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    outDir: "transcripts",
    model: DEFAULT_MODEL,
    chunkSeconds: DEFAULT_CHUNK_SECONDS,
    keepChunks: false,
    audioCleanup: true,
    speakers: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--keep-chunks") args.keepChunks = true;
    else if (arg === "--diarize") {
      args.diarize = true;
      if (args.model === DEFAULT_MODEL) args.model = DIARIZATION_MODEL;
    }
    else if (arg === "--input" || arg === "-i") {
      args.input = next;
      i += 1;
    } else if (arg === "--out-dir") {
      args.outDir = next;
      i += 1;
    } else if (arg === "--model") {
      args.model = next;
      i += 1;
    } else if (arg === "--chunk-seconds") {
      args.chunkSeconds = Number.parseInt(next, 10);
      i += 1;
    } else if (arg === "--audio-bitrate") {
      args.audioBitrate = next;
      i += 1;
    } else if (arg === "--no-audio-cleanup") {
      args.audioCleanup = false;
    } else if (arg === "--language") {
      args.language = next;
      i += 1;
    } else if (arg === "--prompt") {
      args.prompt = next;
      i += 1;
    } else if (arg === "--output-name") {
      args.outputName = next;
      i += 1;
    } else if (arg === "--speaker") {
      args.speakers.push(parseSpeakerReference(next));
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.model === DIARIZATION_MODEL) args.diarize = true;
  if (args.diarize) args.model = DIARIZATION_MODEL;
  if (!args.audioBitrate) {
    args.audioBitrate = args.diarize ? DEFAULT_DIARIZE_AUDIO_BITRATE : DEFAULT_AUDIO_BITRATE;
  }

  return args;
}

function assertConfig(args) {
  if (args.help) return;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY. Add it to .env or export it in your shell.");
  }
  if (!args.input) {
    throw new Error("Missing --input. Run with --help for an example.");
  }
  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file does not exist: ${args.input}`);
  }
  if (!Number.isFinite(args.chunkSeconds) || args.chunkSeconds < 30) {
    throw new Error("--chunk-seconds must be a number >= 30.");
  }
  if (!/^\d+k$/i.test(args.audioBitrate)) {
    throw new Error('--audio-bitrate must use a value like "32k", "64k", or "96k".');
  }
  if (args.speakers.length > 0 && !args.diarize) {
    throw new Error("--speaker only works together with --diarize.");
  }
  if (args.speakers.length > 4) {
    throw new Error("OpenAI supports up to 4 known speaker references.");
  }
  for (const speaker of args.speakers) {
    if (!fs.existsSync(speaker.filePath)) {
      throw new Error(`Speaker reference does not exist: ${speaker.filePath}`);
    }
  }
}

function parseSpeakerReference(value) {
  const separator = value?.indexOf("=");
  if (!value || separator <= 0 || separator === value.length - 1) {
    throw new Error('--speaker must use the format "Name=audio.wav".');
  }

  return {
    name: value.slice(0, separator).trim(),
    filePath: path.resolve(value.slice(separator + 1).trim()),
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stdout.on("data", (data) => process.stdout.write(data));
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function safeBaseName(input) {
  return path
    .basename(input, path.extname(input))
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".mp4") return "audio/mp4";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".webm") return "audio/webm";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

function toDataUrl(filePath) {
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mimeTypeFor(filePath)};base64,${base64}`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function formatCaptionTimestamp(seconds, separator) {
  const safeMs = Math.max(0, Math.round((seconds ?? 0) * 1000));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((safeMs % 60_000) / 1000);
  const milliseconds = safeMs % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0"),
  ].join(":") + `${separator}${String(milliseconds).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildOutputFolderParts(date) {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return {
    dateFolder: `${day}-${month}-${year}`,
    timeFolder: `${hours}-${minutes}-${seconds}`,
  };
}

function displaySpeaker(speaker) {
  if (!speaker) return "Persona";
  if (/^[A-Z]$/.test(speaker)) return `Persona ${speaker}`;
  if (/^speaker[_ -]?\d+$/i.test(speaker)) {
    const number = speaker.match(/\d+/)?.[0];
    return `Persona ${number}`;
  }
  return speaker;
}

function responseFormatForModel(model, diarize) {
  if (diarize) return "diarized_json";
  if (
    model === DEFAULT_MODEL ||
    model === MINI_TRANSCRIBE_MODEL ||
    model === DIARIZATION_MODEL ||
    model.startsWith("gpt-4o-transcribe")
  ) {
    return "json";
  }
  return "verbose_json";
}

function supportsTimedSegments(model, diarize) {
  return diarize || ![DEFAULT_MODEL, MINI_TRANSCRIBE_MODEL].includes(model);
}

async function makeChunks({ input, workDir, chunkSeconds, audioBitrate, audioCleanup }) {
  fs.mkdirSync(workDir, { recursive: true });
  const chunkPattern = path.join(workDir, "chunk_%03d.mp3");
  const ffmpegArgs = [
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    DEFAULT_SAMPLE_RATE,
  ];

  if (audioCleanup) {
    ffmpegArgs.push("-af", DEFAULT_AUDIO_FILTERS);
  }

  console.log(`Extracting audio into ${chunkSeconds}s chunks...`);
  await run(ffmpeg.path, [
    ...ffmpegArgs,
    "-b:a",
    audioBitrate,
    "-f",
    "segment",
    "-segment_time",
    String(chunkSeconds),
    "-reset_timestamps",
    "1",
    chunkPattern,
  ]);

  const chunks = fs
    .readdirSync(workDir)
    .filter((file) => /^chunk_\d+\.mp3$/.test(file))
    .sort()
    .map((file) => path.join(workDir, file));

  if (chunks.length === 0) {
    throw new Error("No audio chunks were created. Check that the input has an audio track.");
  }

  for (const chunk of chunks) {
    const size = fs.statSync(chunk).size;
    if (size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `${path.basename(chunk)} is ${(size / 1024 / 1024).toFixed(1)} MB. ` +
          "Lower --chunk-seconds and try again."
      );
    }
  }

  return chunks;
}

async function transcribeChunk({ client, chunkPath, model, language, diarize, speakers, prompt }) {
  const request = {
    file: fs.createReadStream(chunkPath),
    model,
    response_format: responseFormatForModel(model, diarize),
  };

  if (language) request.language = language;
  if (prompt) request.prompt = prompt;
  if (diarize) {
    request.chunking_strategy = "auto";
  }
  if (speakers.length > 0) {
    request.extra_body = {
      known_speaker_names: speakers.map((speaker) => speaker.name),
      known_speaker_references: speakers.map((speaker) => toDataUrl(speaker.filePath)),
    };
  }

  return client.audio.transcriptions.create(request);
}

function flattenDiarizedSegments(segments, chunkIndex, chunkSeconds) {
  const chunkOffset = chunkIndex * chunkSeconds;
  return segments.map((segment) => ({
    ...segment,
    start: typeof segment.start === "number" ? segment.start + chunkOffset : undefined,
    end: typeof segment.end === "number" ? segment.end + chunkOffset : undefined,
  }));
}

function flattenSegments(segments, chunkIndex, chunkSeconds) {
  const chunkOffset = chunkIndex * chunkSeconds;
  return segments.map((segment) => ({
    ...segment,
    start: typeof segment.start === "number" ? segment.start + chunkOffset : undefined,
    end: typeof segment.end === "number" ? segment.end + chunkOffset : undefined,
  }));
}

function formatDiarizedTranscript(diarizedSegments) {
  return diarizedSegments
    .map((segment) => {
      const speaker = displaySpeaker(segment.speaker);
      const start = formatTime(segment.start);
      const end = formatTime(segment.end);
      return `[${start} - ${end}] ${speaker}: ${segment.text?.trim() ?? ""}`;
    })
    .filter((line) => line.trim())
    .join("\n");
}

function transcriptFromRawDiarizedText(segments) {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function buildCaptionEntries({ segments, diarize }) {
  if (diarize) {
    return segments
      .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number")
      .map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: `${displaySpeaker(segment.speaker)}: ${segment.text?.trim() ?? ""}`.trim(),
      }))
      .filter((segment) => segment.text);
  }

  return segments
    .filter((segment) => typeof segment.start === "number" && typeof segment.end === "number")
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text?.trim() ?? "",
    }))
    .filter((segment) => segment.text);
}

function formatSrt(entries) {
  return entries
    .map(
      (entry, index) =>
        `${index + 1}\n` +
        `${formatCaptionTimestamp(entry.start, ",")} --> ${formatCaptionTimestamp(entry.end, ",")}\n` +
        `${entry.text}`,
    )
    .join("\n\n");
}

function formatVtt(entries) {
  const body = entries
    .map(
      (entry) =>
        `${formatCaptionTimestamp(entry.start, ".")} --> ${formatCaptionTimestamp(entry.end, ".")}\n${entry.text}`,
    )
    .join("\n\n");

  return `WEBVTT\n\n${body}`;
}

function buildPrompt(glossary) {
  const normalized = glossary?.trim();
  if (!normalized) return undefined;

  return [
    "Transcribe con ortografia precisa en el idioma detectado.",
    "Si escuchas terminos parecidos, prioriza estas herramientas y conceptos:",
    normalized,
  ].join("\n");
}

function resolvePromptForModel(prompt, diarize) {
  if (!prompt) return undefined;
  if (diarize) return undefined;
  return prompt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  assertConfig(args);

  const inputPath = path.resolve(args.input);
  const createdAt = new Date();
  const outDir = path.resolve(args.outDir);
  const baseName = safeBaseName(args.outputName || inputPath) || "transcript";
  const workDir = path.resolve(".transcribe-work", `${baseName}-${Date.now()}`);
  const { dateFolder, timeFolder } = buildOutputFolderParts(createdAt);
  const runOutDir = path.join(outDir, dateFolder, timeFolder);
  const requestedPrompt = buildPrompt(args.prompt);
  const prompt = resolvePromptForModel(requestedPrompt, args.diarize);

  fs.mkdirSync(runOutDir, { recursive: true });

  console.log(`Model: ${args.model}`);
  console.log(`Speaker labels: ${args.diarize ? "on" : "off"}`);
  console.log(`Audio bitrate: ${args.audioBitrate}`);
  console.log(`Audio cleanup: ${args.audioCleanup ? "on" : "off"}`);
  console.log(`Glossary prompt: ${prompt ? "on" : "off"}`);
  if (requestedPrompt && !prompt) {
    console.log("Glossary prompt skipped: diarization models do not support prompt.");
  }
  if (!supportsTimedSegments(args.model, args.diarize)) {
    console.log(
      `Caption timing note: ${args.model} returns plain json/text only, so SRT/VTT timing segments are not available.`
    );
  }

  const chunks = await makeChunks({
    input: inputPath,
    workDir,
    chunkSeconds: args.chunkSeconds,
    audioBitrate: args.audioBitrate,
    audioCleanup: args.audioCleanup,
  });

  const client = new OpenAI();
  const segments = [];
  const nonDiarizedSegments = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    console.log(`Transcribing chunk ${index + 1}/${chunks.length}: ${path.basename(chunk)}`);
    const result = await transcribeChunk({
      client,
      chunkPath: chunk,
      model: args.model,
      language: args.language,
      diarize: args.diarize,
      speakers: args.speakers,
      prompt,
    });

    const resultSegments = result.segments ?? [];
    if (args.diarize && resultSegments.length === 0) {
      console.warn(
        `Warning: ${path.basename(chunk)} did not return diarized segments. ` +
          "The raw response was saved in the JSON file."
      );
    }

    const diarizedSegments = args.diarize
      ? flattenDiarizedSegments(resultSegments, index, args.chunkSeconds)
      : [];
    const plainSegments = args.diarize
      ? []
      : flattenSegments(resultSegments, index, args.chunkSeconds);

    segments.push({
      index,
      file: path.basename(chunk),
      text: result.text ?? "",
      diarizedSegments,
      plainSegments,
      raw: result,
    });

    if (plainSegments.length > 0) {
      nonDiarizedSegments.push(...plainSegments);
    }
  }

  const allDiarizedSegments = segments.flatMap((segment) => segment.diarizedSegments);
  const transcriptText = args.diarize
    ? allDiarizedSegments.length > 0
      ? formatDiarizedTranscript(allDiarizedSegments)
      : transcriptFromRawDiarizedText(segments)
    : transcriptFromRawDiarizedText(segments);

  const txtPath = path.join(runOutDir, `${baseName}.txt`);
  const jsonPath = path.join(runOutDir, `${baseName}.json`);
  const srtPath = path.join(runOutDir, `${baseName}.srt`);
  const vttPath = path.join(runOutDir, `${baseName}.vtt`);
  const captionEntries = buildCaptionEntries({
    segments: args.diarize ? allDiarizedSegments : nonDiarizedSegments,
    diarize: Boolean(args.diarize),
  });

  if (captionEntries.length === 0) {
    console.warn(
      "Warning: no timed segments were returned, so the generated SRT/VTT files do not include subtitle timings."
    );
  }

  fs.writeFileSync(txtPath, `${transcriptText}\n`, "utf8");
  fs.writeFileSync(srtPath, `${formatSrt(captionEntries)}\n`, "utf8");
  fs.writeFileSync(vttPath, `${formatVtt(captionEntries)}\n`, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        input: inputPath,
        model: args.model,
        diarize: Boolean(args.diarize),
        knownSpeakers: args.speakers.map((speaker) => speaker.name),
        prompt: args.prompt ?? "",
        promptApplied: Boolean(prompt),
        chunkSeconds: args.chunkSeconds,
        audioBitrate: args.audioBitrate,
        audioCleanup: args.audioCleanup,
        createdAt: createdAt.toISOString(),
        txtPath,
        srtPath,
        vttPath,
        segments,
      },
      null,
      2
    ),
    "utf8"
  );

  if (!args.keepChunks) {
    fs.rmSync(workDir, { recursive: true, force: true });
  } else {
    console.log(`Kept audio chunks in ${workDir}`);
  }

  console.log(`Done: ${txtPath}`);
  console.log(`Metadata: ${jsonPath}`);
  console.log(`SRT: ${srtPath}`);
  console.log(`VTT: ${vttPath}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
