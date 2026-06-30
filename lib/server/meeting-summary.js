import fs from "node:fs";
import OpenAI from "openai";

export const MEETING_SUMMARY_MODEL = "gpt-5.4-nano";

const MAX_TRANSCRIPT_CHARS = 18000;

function normalizeTranscript(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

function buildTranscriptExcerpt(text) {
  const normalized = normalizeTranscript(text);
  if (normalized.length <= MAX_TRANSCRIPT_CHARS) {
    return normalized;
  }

  const sectionSize = Math.floor(MAX_TRANSCRIPT_CHARS / 3);
  const middleStart = Math.max(0, Math.floor((normalized.length - sectionSize) / 2));
  const middleEnd = middleStart + sectionSize;

  return [
    "[Inicio de la reunion]",
    normalized.slice(0, sectionSize),
    "[Parte media de la reunion]",
    normalized.slice(middleStart, middleEnd),
    "[Cierre de la reunion]",
    normalized.slice(-sectionSize),
  ].join("\n\n");
}

function extractJson(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("La respuesta del modelo llego vacia.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No se pudo parsear el JSON del resumen.");
    }
    return JSON.parse(match[0]);
  }
}

function sanitizeSummary(summary, fallbackTitle) {
  const title = String(summary?.title ?? "").trim() || fallbackTitle;
  const description = String(summary?.description ?? "").trim();

  return {
    title: title.slice(0, 80),
    description: description.slice(0, 300),
  };
}

async function requestMeetingSummary(transcriptText, fallbackTitle) {
  const client = new OpenAI();
  const transcriptExcerpt = buildTranscriptExcerpt(transcriptText);

  const response = await client.responses.create({
    model: MEETING_SUMMARY_MODEL,
    store: false,
    max_output_tokens: 200,
    instructions: [
      "Eres un asistente que resume reuniones en espanol neutro.",
      "Devuelve solo JSON valido, sin markdown, con este esquema exacto:",
      '{"title":"string","description":"string"}',
      "title: maximo 10 palabras, directo y descriptivo, identifica el tema principal de la reunion.",
      "description: exactamente 2 frases cortas. Primera frase: de que trato la reunion. Segunda frase: resultado o conclusion principal.",
      "No inventes datos que no aparezcan en la transcripcion.",
    ].join("\n"),
    input: `Nombre base del archivo: ${fallbackTitle}\n\nTranscripcion:\n${transcriptExcerpt}`,
  });

  const parsed = extractJson(response.output_text ?? "");
  return sanitizeSummary(parsed, fallbackTitle);
}

export async function generateAndPersistMeetingSummary({
  transcriptPath,
  metadataPath,
  fallbackTitle,
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY para generar el resumen.");
  }

  if (!transcriptPath || !metadataPath) {
    throw new Error("No hay archivos suficientes para generar el resumen.");
  }

  const transcriptText = await fs.promises.readFile(transcriptPath, "utf8");
  if (!normalizeTranscript(transcriptText)) {
    throw new Error("La transcripcion esta vacia.");
  }

  let metadata = {};
  try {
    metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
  } catch {
    metadata = {};
  }

  if (
    metadata?.meetingSummary?.title &&
    metadata?.meetingSummary?.description
  ) {
    return metadata.meetingSummary;
  }

  const summary = await requestMeetingSummary(transcriptText, fallbackTitle);
  const nextMetadata = {
    ...metadata,
    meetingSummary: {
      ...summary,
      model: MEETING_SUMMARY_MODEL,
      generatedAt: new Date().toISOString(),
    },
  };

  await fs.promises.writeFile(
    metadataPath,
    JSON.stringify(nextMetadata, null, 2),
    "utf8"
  );

  return nextMetadata.meetingSummary;
}
