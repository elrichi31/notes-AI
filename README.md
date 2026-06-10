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

Los resultados quedan en:

```text
transcripts/
  meeting.txt
  meeting.json
```

## Opciones utiles

```bash
npm run transcribe -- --input "meeting.mp4" --chunk-seconds 300 --language es
```

Usa `--chunk-seconds 300` si algun bloque queda demasiado grande. Usa `--keep-chunks` si quieres revisar los audios generados.
