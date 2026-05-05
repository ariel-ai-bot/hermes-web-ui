import { logger } from './logger'

export function bindShutdown(server: any, groupChatServer?: any, chatRunServer?: any): void {
  let isShuttingDown = false

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return
    isShuttingDown = true

    logger.info('Shutting down (%s)...', signal)
    const forceExit = setTimeout(() => {
      logger.warn('Shutdown timed out, forcing exit')
      process.exit(0)
    }, 3000)
    forceExit.unref()

    try {
      // Close ChatRunSocket first to abort all active runs and close EventSource connections
      if (chatRunServer) {
        chatRunServer.close()
        logger.info('ChatRunSocket closed')
      }

      // Disconnect Socket.IO before HTTP server to prevent hanging
      if (groupChatServer) {
        groupChatServer.agentClients.disconnectAll()
        groupChatServer.getIO().close()
        logger.info('Socket.IO closed')
      }

      if (server) {
        server.closeIdleConnections?.()
        await new Promise<void>((resolve) => {
          server.close(() => {
            logger.info('HTTP server closed')
            resolve()
          })
          setTimeout(() => {
            server.closeAllConnections?.()
            resolve()
          }, 1000).unref()
        })
      }
    } catch (err) {
      logger.error(err, 'Shutdown error')
    }

    clearTimeout(forceExit)
    process.exit(0)
  }

  process.once('SIGUSR2', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
