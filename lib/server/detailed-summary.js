import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const SUMMARY_MODEL = "gpt-4o-mini";
const MAX_TRANSCRIPT_CHARS = 120000;

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

const SCHEMA_EXAMPLE = {
  overview: "Párrafo de 4-6 oraciones que explique qué se discutió, por qué se convocó la reunión, cuáles fueron los temas centrales y cuál fue el tono general.",
  highlights: [
    "Punto o momento clave 1 — incluye contexto suficiente para entender su importancia",
    "Punto o momento clave 2"
  ],
  keyTopics: [
    { title: "Nombre del tema", detail: "2-3 oraciones explicando qué se dijo sobre este tema, qué posiciones hubo y a qué conclusión se llegó si aplica." }
  ],
  decisions: [
    { decision: "Descripción clara de la decisión tomada", rationale: "Por qué se tomó esta decisión o qué la motivó, si se mencionó." }
  ],
  commitments: [
    { person: "Nombre o 'Equipo'", task: "Descripción detallada de la tarea o compromiso adquirido", dueDate: "fecha mencionada o null" }
  ],
  actionItems: [
    { item: "Tarea accionable", owner: "Responsable o null", priority: "alta | media | baja | null" }
  ],
  blockers: [
    "Problema, riesgo o bloqueador identificado durante la reunión"
  ],
  nextSteps: "Párrafo describiendo qué viene después de esta reunión: próximas reuniones, entregables esperados, dependencias o hitos mencionados.",
  sentiment: "positivo | neutral | tenso | mixto"
};

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
    max_tokens: 4000,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "Eres un asistente experto en análisis y documentación de reuniones de trabajo.",
          "Tu objetivo es generar un resumen completo, detallado y útil en español neutro.",
          "Sé exhaustivo: el usuario quiere entender todo lo que ocurrió sin tener que leer la transcripción.",
          "Devuelve ÚNICAMENTE JSON válido con esta estructura, sin markdown ni texto extra:",
          JSON.stringify(SCHEMA_EXAMPLE),
          "",
          "Reglas:",
          "- overview: mínimo 4 oraciones, describe el contexto, los temas y el resultado general.",
          "- highlights: los 3-6 momentos o puntos más importantes de toda la reunión.",
          "- keyTopics: un objeto por tema con title y detail. detail debe tener al menos 2 oraciones.",
          "- decisions: solo decisiones reales tomadas, con la razón si se mencionó.",
          "- commitments: compromisos explícitos de personas, con tarea detallada.",
          "- actionItems: tareas concretas con responsable y prioridad si se puede inferir.",
          "- blockers: problemas, riesgos o dependencias bloqueantes mencionados.",
          "- nextSteps: párrafo con qué viene después.",
          "- sentiment: tono general percibido.",
          "- Si un campo no aplica, usa [] o null según corresponda.",
          "- No inventes datos que no estén en la transcripción.",
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
    highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String) : [],
    keyTopics: Array.isArray(parsed.keyTopics)
      ? parsed.keyTopics.map((t) => ({
          title: String(t?.title ?? ""),
          detail: String(t?.detail ?? ""),
        })).filter((t) => t.title)
      : [],
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map((d) => ({
          decision: String(d?.decision ?? d ?? ""),
          rationale: d?.rationale ? String(d.rationale).trim() : null,
        })).filter((d) => d.decision)
      : [],
    commitments: Array.isArray(parsed.commitments)
      ? parsed.commitments.map((c) => ({
          person: String(c?.person ?? "Equipo"),
          task: String(c?.task ?? ""),
          dueDate: c?.dueDate ? String(c.dueDate) : null,
        })).filter((c) => c.task)
      : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((a) => ({
          item: String(a?.item ?? a ?? ""),
          owner: a?.owner ? String(a.owner) : null,
          priority: a?.priority ?? null,
        })).filter((a) => a.item)
      : [],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(String).filter(Boolean) : [],
    nextSteps: parsed.nextSteps ? String(parsed.nextSteps).trim() : null,
    sentiment: parsed.sentiment ? String(parsed.sentiment) : null,
  };
}
