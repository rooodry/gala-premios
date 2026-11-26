import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function Home({ session }) {
  const [premios, setPremios] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  const nombreUsuario =
    session.user.user_metadata?.nombre || session.user.email.split('@')[0]

  const cargarPremios = async () => {
    const { data, error } = await supabase
      .from('premios')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError('No se pudieron cargar los premios')
    } else {
      setPremios(data || [])
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarPremios()
  }, [])

  const crearPremio = async (e) => {
    e.preventDefault()
    if (!titulo.trim()) return

    setCreando(true)
    setError(null)

    const { data, error } = await supabase
      .from('premios')
      .insert([
        {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          creado_por: session.user.id,
          autor_nombre: nombreUsuario
        }
      ])
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      setPremios([data, ...premios])
      setTitulo('')
      setDescripcion('')
    }

    setCreando(false)
  }

  return (
    <div>
      {/* Formulario para crear un nuevo premio */}
      <section style={{ border: '1px solid #444', borderRadius: 12, padding: '1.2rem', marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Proponer un nuevo Premio</h2>
        <form onSubmit={crearPremio} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input
            type="text"
            placeholder='Ej. "Premio a fiesta del año"'
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            style={{ padding: '0.6rem', borderRadius: 6 }}
          />
          <textarea
            placeholder="Descripción opcional (de qué va esta categoría...)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            style={{ padding: '0.6rem', borderRadius: 6, resize: 'vertical' }}
          />
          {error && <p style={{ color: '#ff6b6b', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={creando} style={{ padding: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
            {creando ? 'Guardando...' : 'Crear Premio'}
          </button>
        </form>
      </section>

      {/* Lista de premios */}
      <h2>Categorías de la Gala ({premios.length})</h2>
      {cargando ? (
        <p>Cargando premios...</p>
      ) : premios.length === 0 ? (
        <p>Aún no hay premios creados. ¡Sé el primero en proponer uno!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {premios.map((premio) => (
            <Link
              key={premio.id}
              to={`/premio/${premio.id}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid #444',
                borderRadius: 12,
                padding: '1.2rem',
                transition: 'border-color 0.2s'
              }}
            >
              <h3 style={{ margin: '0 0 0.4rem 0' }}>{premio.titulo}</h3>
              {premio.descripcion && (
                <p style={{ margin: '0 0 0.8rem 0', opacity: 0.85 }}>{premio.descripcion}</p>
              )}
              <small style={{ opacity: 0.6 }}>Creado por {premio.autor_nombre}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}