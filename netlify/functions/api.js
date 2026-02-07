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
        'User-Agent': 'farmacias-turno-proxy/1.0',
        Accept: 'application/json',
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
    res.status(502).json({
      ok: false,
      error:
        status && status >= 400
          ? `Error del proveedor (${status})`
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
