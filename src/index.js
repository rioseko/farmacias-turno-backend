import express from 'express'
import cors from 'cors'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.set('etag', false)
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
})

const PORT = process.env.PORT || 3000
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

app.get('/api/farmacias', async (req, res) => {
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

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  // running
})
