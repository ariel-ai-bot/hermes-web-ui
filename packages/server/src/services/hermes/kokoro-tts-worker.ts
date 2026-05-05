import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOCAL_MODEL_PATH = join(homedir(), '.hermes-web-ui/models/kokoro-82m')
const REMOTE_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const MODEL_ID = process.env.KOKORO_TTS_MODEL || (existsSync(LOCAL_MODEL_PATH) ? LOCAL_MODEL_PATH : REMOTE_MODEL_ID)
const DTYPE = (process.env.KOKORO_TTS_DTYPE || 'q8') as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
const DEVICE = (process.env.KOKORO_TTS_DEVICE || 'cpu') as 'wasm' | 'webgpu' | 'cpu' | null

process.on('message', async (message: any) => {
  try {
    const { KokoroTTS } = require('kokoro-js')
    const model = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device: DEVICE,
    })
    const audio = await model.generate(message.text, {
      voice: message.voice,
      speed: message.speed,
    } as any)

    process.send?.({
      ok: true,
      audio: Buffer.from(audio.toWav()).toString('base64'),
    })
  } catch (error: any) {
    process.send?.({
      ok: false,
      error: error?.message || 'TTS worker failed',
    })
  }
})
