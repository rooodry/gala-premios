import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function PremioDetalle({ session }) {
  const { id } = useParams()
  const [premio, setPremio] = useState(null)
  const [propuestas, setPropuestas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargarDatos = async () => {
    setCargando(true)
    setError(null)

    const [resPremio, resPropuestas] = await Promise.all([
      supabase.from('premios').select('*').eq('id', id).single(),
      supabase
        .from('propuestas')
        .select('*')
        .eq('premio_id', id)
        .order('created_at', { ascending: false })
    ])

    if (resPremio.error) {
      setError('No se encontró el premio')
    } else {
      setPremio(resPremio.data)
      setPropuestas(resPropuestas.data || [])
    }

    setCargando(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [id])

  if (cargando) return <p>Cargando premio...</p>
  if (error || !premio) {
    return (
      <div>
        <p style={{ color: '#ff6b6b' }}>{error || 'Premio no encontrado'}</p>
        <Link to="/">← Volver a los premios</Link>
      </div>
    )
  }

  return (
    <div>
      <Link to="/" style={{ display: 'inline-block', marginBottom: '1rem' }}>
        ← Volver a los premios
      </Link>

      {/* Cabecera del premio */}
      <section style={{ borderBottom: '1px solid #444', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>{premio.titulo}</h1>
        {premio.descripcion && (
          <p style={{ margin: '0 0 0.5rem 0', opacity: 0.85 }}>{premio.descripcion}</p>
        )}
        <small style={{ opacity: 0.6 }}>Categoría creada por {premio.autor_nombre}</small>
      </section>

      {/* Aquí irá el formulario para añadir una nueva propuesta */}

      {/* Listado de propuestas */}
      <h2>Propuestas ({propuestas.length})</h2>
      {propuestas.length === 0 ? (
        <p>Aún no hay propuestas para este premio. ¡Sé el primero en subir una!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.2rem' }}>
          {propuestas.map((p) => (
            <article
              key={p.id}
              style={{
                border: '1px solid #444',
                borderRadius: 12,
                padding: '1.2rem'
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem 0' }}>{p.titulo}</h3>

              {p.texto && (
                <p style={{ margin: '0 0 0.8rem 0', whiteSpace: 'pre-wrap' }}>{p.texto}</p>
              )}

              {p.media_tipo === 'imagen' && p.media_url && (
                <img
                  src={p.media_url}
                  alt={p.titulo}
                  style={{ width: '100%', maxHeight: 500, objectFit: 'contain', borderRadius: 8 }}
                />
              )}

              {p.media_tipo === 'video' && p.media_url && (
                <video
                  src={p.media_url}
                  controls
                  playsInline
                  style={{ width: '100%', maxHeight: 500, borderRadius: 8 }}
                />
              )}

              <div style={{ marginTop: '0.8rem' }}>
                <small style={{ opacity: 0.6 }}>Propuesto por {p.autor_nombre}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}