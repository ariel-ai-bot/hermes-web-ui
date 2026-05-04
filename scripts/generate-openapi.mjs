#!/usr/bin/env node
/**
 * Auto-generate OpenAPI specification from existing Koa routes
 *
 * This script scans route files and generates OpenAPI documentation
 * without requiring code changes or decorators.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = resolve(__dirname, '..')
const routesDir = join(rootDir, 'packages/server/src/routes')

// OpenAPI template
const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Hermes Web UI API',
    description: 'BFF server API for Hermes Web UI',
    version: '0.5.9',
  },
  servers: [
    { url: 'http://localhost:8648', description: 'Local development' },
  ],
  tags: [],
  paths: {},
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Token',
      },
    },
    schemas: {},
  },
}

// Tag mappings based on route directories
const tagMappings = {
  'routes/hermes/sessions.ts': { name: 'Sessions', description: 'Chat session management' },
  'routes/hermes/profiles.ts': { name: 'Profiles', description: 'Hermes profile management' },
  'routes/hermes/gateways.ts': { name: 'Gateways', description: 'Gateway process management' },
  'routes/hermes/models.ts': { name: 'Models', description: 'Model configuration' },
  'routes/hermes/skills.ts': { name: 'Skills', description: 'Skill browsing and management' },
  'routes/hermes/memory.ts': { name: 'Memory', description: 'Agent memory files' },
  'routes/hermes/logs.ts': { name: 'Logs', description: 'Log file access' },
  'routes/hermes/jobs.ts': { name: 'Jobs', description: 'Scheduled job management' },
  'routes/hermes/weixin.ts': { name: 'Weixin', description: 'WeChat QR code login' },
  'routes/hermes/codex-auth.ts': { name: 'Codex Auth', description: 'OpenAI Codex OAuth' },
  'routes/health.ts': { name: 'Health', description: 'Health check' },
  'routes/update.ts': { name: 'Update', description: 'Self-update management' },
  'routes/upload.ts': { name: 'Upload', description: 'File upload' },
}

// Extract route definitions from route files
function scanRoutes() {
  const paths = {}

  // Scan hermes routes
  const hermesRoutesDir = join(routesDir, 'hermes')
  const hermesRouteFiles = readdirSync(hermesRoutesDir).filter(f => f.endsWith('.ts'))

  for (const file of hermesRouteFiles) {
    const routePath = join('hermes', file)
    const tagInfo = tagMappings[`routes/${routePath}`]
    if (tagInfo) {
      scanRouteFile(join(hermesRoutesDir, file), tagInfo, paths)
    }
  }

  // Scan top-level routes
  for (const [routeFile, tagInfo] of Object.entries(tagMappings)) {
    if (!routeFile.startsWith('routes/hermes/')) {
      const filePath = join(routesDir, routeFile.replace('routes/', ''))
      try {
        scanRouteFile(filePath, tagInfo, paths)
      } catch (e) {
        // File might not exist, skip
      }
    }
  }

  return paths
}

function scanRouteFile(filePath, tagInfo, paths) {
  const content = readFileSync(filePath, 'utf-8')

  // Extract route definitions
  // Pattern: sessionRoutes.get('/path', ctrl.method) or router.post('/path', ctrl.method)
  const routeRegex = /\w+Routes\.(get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*ctrl\.(\w+)/g

  let match
  while ((match = routeRegex.exec(content)) !== null) {
    const [, method, path, controllerMethod] = match

    // Clean path parameters
    const openapiPath = path
      .replace(/:([^/]+)/g, '{$1}')
      .replace(/\*\*([^/]*)/g, '{$1}')

    if (!paths[openapiPath]) {
      paths[openapiPath] = {}
    }

    // Generate operation ID
    const operationId = `${controllerMethod}`

    // Generate description from JSDoc comments above the route
    const methodDefIndex = content.lastIndexOf(match[0])
    const precedingContent = content.substring(Math.max(0, methodDefIndex - 500), methodDefIndex)
    const description = extractJsDocDescription(precedingContent) || `${method.toUpperCase()} ${path}`

    paths[openapiPath][method] = {
      tags: [tagInfo.name],
      summary: generateSummary(path, method),
      description,
      operationId,
      security: [{ BearerAuth: [] }],
      responses: generateResponses(path, method),
    }
  }
}

function extractJsDocDescription(content) {
  const jsDocRegex = /\/\*\*[\s\S]*?\*\//
  const match = content.match(jsDocRegex)
  if (match) {
    const jsDoc = match[0]
    // Extract description text
    const description = jsDoc
      .replace(/\/\*\*|\*\//g, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line && !line.startsWith('@'))
      .join('\n')
    return description || null
  }
  return null
}

function generateSummary(path, method) {
  const parts = path.split('/').filter(Boolean)
  const resource = parts[parts.length - 1] || 'root'
  const action = {
    get: 'List',
    post: 'Create',
    put: 'Update',
    patch: 'Patch',
    delete: 'Delete',
  }[method]

  if (resource.includes('{')) {
    return `${action} ${parts[parts.length - 2] || 'resource'} by ${resource.match(/\{([^}]+)\}/)[1]}`
  }

  return `${action} ${resource}`
}

function generateResponses(path, method) {
  const responses = {
    '200': {
      description: 'Success',
    },
    '401': {
      $ref: '#/components/responses/Unauthorized',
    },
  }

  if (method === 'get' && path.includes('/')) {
    responses['404'] = { description: 'Not found' }
  }

  return responses
}

// Add standard responses
openapi.components.responses = {
  Unauthorized: {
    description: 'Unauthorized - Invalid or missing authentication token',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  BadRequest: {
    description: 'Bad Request - Invalid parameters',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
}

// Run scanner
console.log('Scanning routes...')
openapi.paths = scanRoutes()

// Collect all tags
const tagSet = new Set()
Object.values(openapi.paths).forEach(pathItem => {
  Object.values(pathItem).forEach(operation => {
    operation.tags?.forEach(tag => tagSet.add(tag))
  })
})

openapi.tags = Array.from(tagSet).map(tag => {
  const tagInfo = Object.values(tagMappings).find(t => t.name === tag)
  return {
    name: tag,
    description: tagInfo?.description || '',
  }
})

// Sort paths
const sortedPaths = {}
Object.keys(openapi.paths).sort().forEach(key => {
  sortedPaths[key] = openapi.paths[key]
})
openapi.paths = sortedPaths

// Write output
const outputPath = join(rootDir, 'docs/openapi.json')
writeFileSync(outputPath, JSON.stringify(openapi, null, 2))

console.log(`✓ Generated OpenAPI spec: ${outputPath}`)
console.log(`  ${Object.keys(openapi.paths).length} endpoints`)
console.log(`  ${openapi.tags.length} tags`)
