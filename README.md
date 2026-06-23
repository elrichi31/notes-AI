# Notes AI

CLI para transcribir videos o audios de reuniones con OpenAI.

## Setup

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` desde `.env.example` y agrega tu API key:

```bash
OPENAI_API_KEY=sk-proj-your-key-here
```

## Transcribir

```bash
npm run transcribe -- --input "C:\path\to\meeting.mp4" --language es
```

Por defecto usa `gpt-4o-transcribe`, extrae el audio del video, lo convierte a MP3 mono liviano y lo separa en bloques de 10 minutos para evitar el limite de subida por archivo.

Antes de enviar el audio, el CLI aplica limpieza local con ffmpeg: reduce frecuencias que no suelen ser voz, baja ruido constante y normaliza volumen. Esto no agrega llamadas a OpenAI.

Nota: OpenAI ahora limita `gpt-4o-transcribe` y `gpt-4o-mini-transcribe` a respuestas `json` o `text`. Eso evita el error de `verbose_json`, pero tambien significa que esos modelos pueden no devolver segmentos con tiempo para subtitulos `SRT` y `VTT`. Para marcas de tiempo por hablante, usa `gpt-4o-transcribe-diarize`.

## Transcribir con personas

Para separar la reunion por hablante:

```bash
npm run transcribe:diarize -- --input "C:\path\to\meeting.mp4" --language es
```

Esto usa `gpt-4o-transcribe-diarize` y genera un TXT con lineas parecidas a:

```text
[00:00:01 - 00:00:04] Persona A: Hola, como estan?
[00:00:05 - 00:00:10] Persona B: Bien, revisemos los pendientes.
```

En modo diarizacion el audio se prepara a `64k` por defecto para preservar mejor diferencias entre voces. El costo de OpenAI sigue dependiendo de los minutos procesados, no de este preprocesamiento local.

Si tienes muestras cortas de voz, puedes dar nombres reales. Cada muestra debe ser un audio corto de referencia del hablante:

```bash
npm run transcribe:diarize -- --input "meeting.mp4" --language es --speaker "Nico=nico.wav" --speaker "Richi=richi.wav"
```

Los resultados quedan en:

```text
transcripts/
  06-06-2026/
    14-30-15/
      meeting.txt
      meeting.json
      meeting.srt
      meeting.vtt
```

Cada ejecucion crea su propia carpeta con fecha y hora para mantener las transcripciones ordenadas. Se usa `06-06-2026` en vez de `06/06/2026` porque Windows no permite `/` en nombres de carpeta.

## Opciones utiles

```bash
npm run transcribe -- --input "meeting.mp4" --chunk-seconds 300 --language es
```

Usa `--chunk-seconds 300` si algun bloque queda demasiado grande. Usa `--keep-chunks` si quieres revisar los audios generados.

Puedes ajustar la calidad de audio local:

```bash
npm run transcribe:diarize -- --input "meeting.mp4" --language es --audio-bitrate 96k
```

Si el audio ya esta muy limpio y quieres desactivar filtros:

```bash
npm run transcribe -- --input "meeting.mp4" --language es --no-audio-cleanup
```

## Interfaz web con Next.js

Si prefieres trabajar desde una interfaz local moderna:

```bash
npm run dev
```

Luego abre:

```text
http://127.0.0.1:3000
```

La pantalla principal ahora corre sobre Next.js e incluye:

- Vista principal de transcripcion con mas espacio para el flujo actual.
- Biblioteca separada en `/biblioteca`.
- Selector de modelo, glosario editable y estado del proceso en vivo.
- Generacion de `TXT`, `JSON`, `SRT` y `VTT` con descarga desde la biblioteca.

Desde ahi puedes subir el archivo, elegir el modelo, cambiar el tamano de los bloques y activar la opcion de separar por hablante.
Tambien incluye un glosario editable precargado en formato de etiquetas para que sea mas facil de revisar y ampliar, por ejemplo:

```text
[EDR] [XDR] [SIEM] [SOAR] [SOC] [IOC] [TTP] [MITRE ATT&CK]
[CrowdStrike] [SentinelOne] [Microsoft Defender for Endpoint] [Wazuh]
[phishing] [ransomware] [lateral movement] [data exfiltration]
[IAM] [PAM] [MFA] [Zero Trust] [DLP] [SASE] [CVE] [CVSS]
```

El glosario ya trae mas palabras de ciberseguridad, identidad, monitoreo, respuesta a incidentes, nube y cumplimiento para mejorar nombres de herramientas y conceptos.
