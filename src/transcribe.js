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
const DEFAULT_SAMPLE_RATE = "16000";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function printHelp() {
  console.log(`
Usage:
  npm run transcribe -- --input "meeting.mp4"
  npm run transcribe:diarize -- --input "meeting.mp4"

Options:
  --input, -i       Video or audio file to transcribe. Required.
  --out-dir         Output directory. Default: transcripts
  --model           OpenAI transcription model. Default: ${DEFAULT_MODEL}
  --diarize         Label who spoke in each segment with ${DIARIZATION_MODEL}.
  --speaker         Optional known speaker reference as Name=audio.wav. Repeat up to 4 times.
  --chunk-seconds   Chunk length in seconds. Default: ${DEFAULT_CHUNK_SECONDS}
  --language        Optional ISO language hint, for example es or en.
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
    } else if (arg === "--language") {
      args.language = next;
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

function displaySpeaker(speaker) {
  if (!speaker) return "Persona";
  if (/^[A-Z]$/.test(speaker)) return `Persona ${speaker}`;
  if (/^speaker[_ -]?\d+$/i.test(speaker)) {
    const number = speaker.match(/\d+/)?.[0];
    return `Persona ${number}`;
  }
  return speaker;
}

async function makeChunks({ input, workDir, chunkSeconds }) {
  fs.mkdirSync(workDir, { recursive: true });
  const chunkPattern = path.join(workDir, "chunk_%03d.mp3");

  console.log(`Extracting audio into ${chunkSeconds}s chunks...`);
  await run(ffmpeg.path, [
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    DEFAULT_SAMPLE_RATE,
    "-b:a",
    DEFAULT_AUDIO_BITRATE,
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

async function transcribeChunk({ client, chunkPath, model, language, diarize, speakers }) {
  const request = {
    file: fs.createReadStream(chunkPath),
    model,
    response_format: diarize ? "diarized_json" : "json",
  };

  if (language) request.language = language;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  assertConfig(args);

  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args.outDir);
  const baseName = safeBaseName(inputPath) || "transcript";
  const workDir = path.resolve(".transcribe-work", `${baseName}-${Date.now()}`);

  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Model: ${args.model}`);
  console.log(`Speaker labels: ${args.diarize ? "on" : "off"}`);

  const chunks = await makeChunks({
    input: inputPath,
    workDir,
    chunkSeconds: args.chunkSeconds,
  });

  const client = new OpenAI();
  const segments = [];

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

    segments.push({
      index,
      file: path.basename(chunk),
      text: result.text ?? "",
      diarizedSegments,
      raw: result,
    });
  }

  const allDiarizedSegments = segments.flatMap((segment) => segment.diarizedSegments);
  const transcriptText = args.diarize
    ? allDiarizedSegments.length > 0
      ? formatDiarizedTranscript(allDiarizedSegments)
      : transcriptFromRawDiarizedText(segments)
    : transcriptFromRawDiarizedText(segments);

  const txtPath = path.join(outDir, `${baseName}.txt`);
  const jsonPath = path.join(outDir, `${baseName}.json`);

  fs.writeFileSync(txtPath, `${transcriptText}\n`, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        input: inputPath,
        model: args.model,
        diarize: Boolean(args.diarize),
        knownSpeakers: args.speakers.map((speaker) => speaker.name),
        chunkSeconds: args.chunkSeconds,
        createdAt: new Date().toISOString(),
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
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
