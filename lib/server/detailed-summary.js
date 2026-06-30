import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const SUMMARY_MODEL = "gpt-4o-mini";
const MAX_TRANSCRIPT_CHARS = 80000;

function buildExcerpt(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= MAX_TRANSCRIPT_CHARS) return normalized;

  const section = Math.floor(MAX_TRANSCRIPT_CHARS / 3);
  const midStart = Math.max(0, Math.floor((normalized.length - section) / 2));

  return [
    "[Inicio de la reunión]",
    normalized.slice(0, section),
    "[Parte media]",
    normalized.slice(midStart, midStart + section),
    "[Cierre]",
    normalized.slice(-section),
  ].join("\n\n");
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No se pudo parsear el JSON del resumen detallado.");
    return JSON.parse(match[0]);
  }
}

export async function generateDetailedMeetingSummary({ transcriptPath }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const absolutePath = path.resolve(process.cwd(), transcriptPath.replaceAll("/", path.sep));
  const transcriptText = await fs.promises.readFile(absolutePath, "utf8");

  if (!transcriptText.trim()) {
    throw new Error("La transcripción está vacía.");
  }

  const excerpt = buildExcerpt(transcriptText);
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: SUMMARY_MODEL,
    max_tokens: 1200,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: [
          "Eres un asistente experto en análisis de reuniones. Responde siempre en español neutro.",
          "Devuelve únicamente JSON válido con esta estructura exacta, sin markdown ni texto extra:",
          JSON.stringify({
            overview: "string — resumen ejecutivo de 2-3 oraciones sobre qué ocurrió en la reunión",
            keyTopics: ["string — tema 1", "string — tema 2"],
            decisions: ["string — decisión tomada 1"],
            commitments: [
              { person: "string o 'Equipo'", task: "string", dueDate: "string o null" }
            ],
            actionItems: ["string — tarea accionable 1"],
            nextSteps: "string — próximos pasos o null si no aplica",
          }),
          "Si no hay información suficiente para algún campo, usa un array vacío [] o null.",
          "No inventes datos que no estén en la transcripción.",
        ].join("\n"),
      },
      {
        role: "user",
        content: `Transcripción de la reunión:\n\n${excerpt}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = extractJson(raw);

  return {
    overview: String(parsed.overview ?? "").trim(),
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.map(String) : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
    commitments: Array.isArray(parsed.commitments)
      ? parsed.commitments.map((c) => ({
          person: String(c?.person ?? "Equipo"),
          task: String(c?.task ?? ""),
          dueDate: c?.dueDate ? String(c.dueDate) : null,
        })).filter((c) => c.task)
      : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
    nextSteps: parsed.nextSteps ? String(parsed.nextSteps).trim() : null,
  };
}
