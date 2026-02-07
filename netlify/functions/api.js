import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import serverless from 'serverless-http'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import fs from 'fs'

dotenv.config()

const app = express()
const router = express.Router()

// Configuración de CORS y headers
app.use(cors())
app.set('etag', false)
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
})

const MINSAL_URL =
  process.env.MINSAL_URL ||
  'https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php'

function normalizeComuna(value) {
  return String(value || '').trim().toLowerCase()
}

function buildHorario(apertura, cierre) {
  const a = String(apertura || '').trim()
  const c = String(cierre || '').trim()
  if (a && c) return `${a} – ${c}`
  if (a || c) return a || c
  return ''
}

// Función helper para encontrar Chrome local en Windows
const findLocalChrome = () => {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

router.get('/farmacias', async (req, res) => {
  const comunaQuery = normalizeComuna(req.query.comuna || 'temuco')
  let browser = null

  try {
    // Determinar executablePath según el entorno
    // En Netlify/AWS Lambda usamos @sparticuz/chromium
    // En local usamos Chrome instalado
    const isLocal = !process.env.AWS_LAMBDA_FUNCTION_NAME
    let executablePath = ''

    if (isLocal) {
      executablePath = findLocalChrome()
      if (!executablePath) {
        throw new Error(
          'No se encontró Chrome instalado en rutas estándar. Configura CHROME_EXECUTABLE_PATH.'
        )
      }
    } else {
      executablePath = await chromium.executablePath()
    }

    if (!executablePath) {
      throw new Error(
        `No se pudo determinar el path del ejecutable de Chromium. isLocal: ${isLocal}`
      )
    }

    // Lanzar navegador
    browser = await puppeteer.launch({
      args: isLocal ? ['--no-sandbox'] : chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    })

    const page = await browser.newPage()

    // Configurar User-Agent real
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    )

    // Navegar a la API
    // Si la API retorna JSON directamente, el contenido estará en el body dentro de un <pre> o como texto raw
    // Pero si hay Cloudflare challenge, puppeteer esperará a que pase.
    await page.goto(MINSAL_URL, {
      waitUntil: 'networkidle0', // Esperar a que termine la carga de red (útil para pasar challenges)
      timeout: 15000,
    })

    // Extraer el contenido del body (el JSON)
    // Cloudflare a veces envuelve el JSON en HTML <pre>
    const content = await page.evaluate(() => {
      return document.querySelector('body').innerText
    })

    let data = []
    try {
      data = JSON.parse(content)
    } catch (e) {
      // Si falla el parseo, puede ser que seguimos en la página de error o el formato es incorrecto
      throw new Error(`No se pudo parsear JSON. Contenido recibido: ${content.substring(0, 200)}`)
    }

    if (!Array.isArray(data)) {
      throw new Error('Formato inesperado de respuesta del proveedor (no es array)')
    }

    const filtered = data.filter(
      (item) => normalizeComuna(item?.comuna_nombre) === comunaQuery
    )

    const mapped = filtered.map((item) => ({
      nombre: item?.local_nombre ?? '',
      direccion: item?.local_direccion ?? '',
      telefono: item?.local_telefono ?? '',
      horario: buildHorario(
        item?.funcionamiento_hora_apertura,
        item?.funcionamiento_hora_cierre
      ),
      lat: item?.local_lat ? Number(item.local_lat) : null,
      lng: item?.local_lng ? Number(item.local_lng) : null,
    }))

    res.json({ ok: true, total: mapped.length, comuna: comunaQuery, data: mapped })
  } catch (err) {
    console.error('Puppeteer Error:', err)
    res.status(502).json({
      ok: false,
      error: `Error al consultar proveedor con navegador: ${err.message}`,
    })
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

app.use('/api', router)
app.use('/.netlify/functions/api', router)
app.use('/', router)

export const handler = serverless(app)
