import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'
import serverless from 'serverless-http'

dotenv.config()

const app = express()
const router = express.Router()

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

router.get('/farmacias', async (req, res) => {
  const comunaQuery = normalizeComuna(req.query.comuna || 'temuco')

  try {
    const { data } = await axios.get(MINSAL_URL, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    })

    if (!Array.isArray(data)) {
      return res.status(502).json({
        ok: false,
        error: 'Formato inesperado de respuesta del proveedor',
      })
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
    const status = err.response?.status
    const dataError = err.response?.data
    // Si es un string (HTML), tomar los primeros 200 caracteres para depuración
    const msg =
      typeof dataError === 'string'
        ? dataError.substring(0, 200).replace(/\n/g, ' ')
        : ''

    res.status(502).json({
      ok: false,
      error:
        status && status >= 400
          ? `Error del proveedor (${status}): ${msg}`
          : 'Error al consultar proveedor',
    })
  }
})

// Ruta de salud para verificar funcionamiento
router.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

// Montar router en todas las rutas posibles para asegurar que Netlify lo encuentre
app.use('/api', router)
app.use('/.netlify/functions/api', router)
app.use('/', router) // Fallback para desarrollo o rutas directas

export const handler = serverless(app)
