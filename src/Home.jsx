import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

export default function Home({ session }) {
  const [premios, setPremios] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  // Estados para editar una categoría
  const [editandoId, setEditandoId] = useState(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  const esAdmin = session.user.email === ADMIN_EMAIL
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

  const iniciarEdicion = (premio) => {
    setEditandoId(premio.id)
    setEditTitulo(premio.titulo)
    setEditDescripcion(premio.descripcion || '')
  }

  const guardarEdicion = async (e, premioId) => {
    e.preventDefault()
    if (!editTitulo.trim()) return

    setGuardandoEdit(true)
    const { data, error } = await supabase
      .from('premios')
      .update({
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim() || null
      })
      .eq('id', premioId)
      .select()
      .single()

    if (error) {
      alert('Error al editar: ' + error.message)
    } else {
      setPremios(premios.map((p) => (p.id === premioId ? data : p)))
      setEditandoId(null)
    }
    setGuardandoEdit(false)
  }

  const borrarPremio = async (premio) => {
    const confirmado = window.confirm(
      `¿Seguro que quieres borrar la categoría "${premio.titulo}"? Se borrarán también todas sus propuestas.`
    )
    if (!confirmado) return

    const { error } = await supabase.from('premios').delete().eq('id', premio.id)

    if (error) {
      alert('No se pudo borrar: ' + error.message)
    } else {
      setPremios(premios.filter((p) => p.id !== premio.id))
    }
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
          {premios.map((premio) => {
            const esMio = premio.creado_por === session.user.id
            const estaEditando = editandoId === premio.id

            return (
              <div
                key={premio.id}
                style={{
                  border: '1px solid #444',
                  borderRadius: 12,
                  padding: '1.2rem'
                }}
              >
                {estaEditando ? (
                  <form
                    onSubmit={(e) => guardarEdicion(e, premio.id)}
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
                  >
                    <input
                      type="text"
                      value={editTitulo}
                      onChange={(e) => setEditTitulo(e.target.value)}
                      required
                      disabled={guardandoEdit}
                      style={{ padding: '0.6rem', borderRadius: 6 }}
                    />
                    <textarea
                      value={editDescripcion}
                      onChange={(e) => setEditDescripcion(e.target.value)}
                      rows={2}
                      placeholder="Descripción (opcional)"
                      disabled={guardandoEdit}
                      style={{ padding: '0.6rem', borderRadius: 6, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" disabled={guardandoEdit} style={{ padding: '0.4rem 0.9rem', fontWeight: 'bold' }}>
                        {guardandoEdit ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setEditandoId(null)} disabled={guardandoEdit} style={{ padding: '0.4rem 0.9rem' }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <Link
                      to={`/premio/${premio.id}`}
                      style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}
                    >
                      <h3 style={{ margin: '0 0 0.4rem 0' }}>{premio.titulo}</h3>
                      {premio.descripcion && (
                        <p style={{ margin: '0 0 0.8rem 0', opacity: 0.85 }}>{premio.descripcion}</p>
                      )}
                      <small style={{ opacity: 0.6 }}>Creado por {premio.autor_nombre}</small>
                    </Link>

                    {(esMio || esAdmin) && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        {esAdmin && (
                          <button
                            type="button"
                            onClick={() => iniciarEdicion(premio)}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
                          >
                            Editar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => borrarPremio(premio)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            color: '#ff6b6b',
                            borderColor: '#ff6b6b'
                          }}
                        >
                          Borrar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}