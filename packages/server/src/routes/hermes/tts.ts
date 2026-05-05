import Router from '@koa/router'
import { synthesizeKokoroSpeech } from '../../services/hermes/kokoro-tts'
import { logger } from '../../services/logger'

export const ttsRoutes = new Router()

ttsRoutes.post('/api/hermes/tts/kokoro', async (ctx) => {
  const body = ctx.request.body as {
    text?: string
    voice?: string
    speed?: number
  }

  try {
    const audio = await synthesizeKokoroSpeech({
      text: body.text || '',
      voice: body.voice,
      speed: body.speed,
    })

    ctx.set('Content-Type', 'audio/wav')
    ctx.set('Cache-Control', 'no-store')
    ctx.body = audio
  } catch (error: any) {
    logger.warn(error, '[kokoro-tts] synthesis failed')
    ctx.status = error?.message?.includes('too long') ? 413 : 500
    ctx.body = { error: error?.message || 'TTS synthesis failed' }
  }
})

