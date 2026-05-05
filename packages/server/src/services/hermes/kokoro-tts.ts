import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOCAL_MODEL_PATH = join(homedir(), '.hermes-web-ui/models/kokoro-82m')
const REMOTE_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const MODEL_ID = process.env.KOKORO_TTS_MODEL || (existsSync(LOCAL_MODEL_PATH) ? LOCAL_MODEL_PATH : REMOTE_MODEL_ID)
const DTYPE = (process.env.KOKORO_TTS_DTYPE || 'q8') as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
const DEVICE = (process.env.KOKORO_TTS_DEVICE || 'cpu') as 'wasm' | 'webgpu' | 'cpu' | null
const DEFAULT_VOICE = process.env.KOKORO_TTS_VOICE || 'af_heart'
const MAX_TEXT_LENGTH = Number(process.env.KOKORO_TTS_MAX_TEXT_LENGTH || 2000)
const WORKER_TIMEOUT_MS = Number(process.env.KOKORO_TTS_WORKER_TIMEOUT_MS || 120000)

export interface KokoroSynthesisOptions {
  text: string
  voice?: string
  speed?: number
}

export async function synthesizeKokoroSpeech(options: KokoroSynthesisOptions): Promise<Buffer> {
  const text = options.text.trim()
  if (!text) {
    throw new Error('Text is required')
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text is too long. Max length is ${MAX_TEXT_LENGTH} characters.`)
  }

  const speed = Number.isFinite(options.speed) ? Math.min(Math.max(options.speed || 1, 0.5), 2) : 1

  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'kokoro-tts-worker.ts')
    const worker = fork(workerPath, [], {
      execArgv: ['-r', 'ts-node/register'],
      env: {
        ...process.env,
        KOKORO_TTS_MODEL: MODEL_ID,
        KOKORO_TTS_DTYPE: DTYPE,
        KOKORO_TTS_DEVICE: DEVICE || '',
      },
      silent: true,
    })

    let settled = false
    let stderr = ''
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      worker.kill('SIGKILL')
      reject(new Error('TTS synthesis timed out'))
    }, WORKER_TIMEOUT_MS)

    worker.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    worker.on('message', (message: any) => {
      if (settled) return
      if (message?.ok) {
        settled = true
        clearTimeout(timeout)
        resolve(Buffer.from(message.audio, 'base64'))
        worker.kill('SIGKILL')
        return
      }
      if (message?.error) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(message.error))
        worker.kill('SIGKILL')
      }
    })

    worker.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })

    worker.on('exit', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(stderr.trim() || `TTS worker exited before completing. code=${code} signal=${signal}`))
    })

    worker.send({
      text,
      voice: options.voice || DEFAULT_VOICE,
      speed,
    })
  })
}
