import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { uploadMedia } from './uploadMedia'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB para fotos

export default function Candidatos() {
  const [candidatos, setCandidatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [subiendoId, setSubiendoId] = useState(null)
  const [error, setError] = useState(null)

  const cargarNominaciones = async () => {
    const { data, error } = await supabase
      .from('candidatos')
      .select(`
        id,
        nombre,
        foto_url,
        propuesta_candidatos (
          propuestas (
            id,
            premio_id,
            premios (
              id,
              titulo
            )
          )
        )
      `)
      .order('nombre')

    if (error) {
      setError('No se pudieron cargar los candidatos.')
    } else {
      const procesados = (data || [])
        .map((c) => {
          // Contar cuántas veces está nominado a cada premio
          const conteoPorPremio = {}
          let totalNominaciones = 0

          ;(c.propuesta_candidatos || []).forEach((pc) => {
            const premio = pc.propuestas?.premios
            if (!premio) return

            totalNominaciones += 1
            if (!conteoPorPremio[premio.id]) {
              conteoPorPremio[premio.id] = {
                premioId: premio.id,
                titulo: premio.titulo,
                cantidad: 0
              }
            }
            conteoPorPremio[premio.id].cantidad += 1
          })

          // Convertir a array y ordenar de más a menos nominaciones por premio
          const resumenPremios = Object.values(conteoPorPremio).sort(
            (a, b) => b.cantidad - a.cantidad
          )

          return {
            id: c.id,
            nombre: c.nombre,
            foto_url: c.foto_url,
            totalNominaciones,
            resumenPremios
          }
        })
        .sort((a, b) => b.totalNominaciones - a.totalNominaciones)

      setCandidatos(procesados)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarNominaciones()
  }, [])

  const subirFotoCandidato = async (candidatoId, e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      alert('La foto supera el límite de 10 MB.')
      e.target.value = ''
      return
    }

    setSubiendoId(candidatoId)
    setError(null)

    try {
      const media = await uploadMedia(file)

      const { error: updateError } = await supabase
        .from('candidatos')
        .update({ foto_url: media.url })
        .eq('id', candidatoId)

      if (updateError) throw updateError

      setCandidatos((prev) =>
        prev.map((c) => (c.id === candidatoId ? { ...c, foto_url: media.url } : c))
      )
    } catch (err) {
      setError(err.message || 'Error al subir la foto.')
    } finally {
      setSubiendoId(null)
      e.target.value = ''
    }
  }

  if (cargando) return <p>Cargando candidatos...</p>

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Candidatos</h1>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {candidatos.map((c) => (
          <section
            key={c.id}
            style={{
              display: 'flex',
              gap: '1.2rem',
              alignItems: 'flex-start',
              border: '1px solid #444',
              borderRadius: 12,
              padding: '1.2rem'
            }}
          >
            {/* Columna de la foto */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              {c.foto_url ? (
                <img
                  src={c.foto_url}
                  alt={c.nombre}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #646cff'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    background: '#333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: '#aaa'
                  }}
                >
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
              )}

              <label
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid #555',
                  borderRadius: 6,
                  cursor: subiendoId === c.id ? 'not-allowed' : 'pointer',
                  opacity: subiendoId === c.id ? 0.6 : 1
                }}
              >
                {subiendoId === c.id ? 'Subiendo...' : c.foto_url ? 'Cambiar foto' : 'Subir foto'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={subiendoId === c.id}
                  onChange={(e) => subirFotoCandidato(c.id, e)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Columna de nombre y lista de nominaciones */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{c.nombre}</h2>
                <span
                  style={{
                    padding: '0.2rem 0.65rem',
                    borderRadius: 16,
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    background: c.totalNominaciones > 0 ? '#646cff' : '#333',
                    color: '#fff'
                  }}
                >
                  {c.totalNominaciones} {c.totalNominaciones === 1 ? 'nominación' : 'nominaciones'}
                </span>
              </div>

              {c.resumenPremios.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>
                  Sin nominaciones todavía.
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '0.35rem' }}>
                  {c.resumenPremios.map((item) => (
                    <li key={item.premioId}>
                      Nominado <strong>{item.cantidad}</strong> {item.cantidad === 1 ? 'vez' : 'veces'} a{' '}
                      <Link to={`/premio/${item.premioId}`} style={{ fontWeight: 'bold', textDecoration: 'none' }}>
                        {item.titulo}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}