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
  meeting.txt
  meeting.json
```

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
