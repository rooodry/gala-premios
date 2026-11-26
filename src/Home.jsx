import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

export default function Home({ session }) {
  const [premios, setPremios] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esEspecial, setEsEspecial] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  // Estados para editar una categoría
  const [editandoId, setEditandoId] = useState(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editEspecial, setEditEspecial] = useState(false)
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
          tipo: esAdmin && esEspecial ? 'especial' : 'normal',
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
      setEsEspecial(false)
    }

    setCreando(false)
  }

  const iniciarEdicion = (premio) => {
    setEditandoId(premio.id)
    setEditTitulo(premio.titulo)
    setEditDescripcion(premio.descripcion || '')
    setEditEspecial(premio.tipo === 'especial')
  }

  const guardarEdicion = async (e, premioId) => {
    e.preventDefault()
    if (!editTitulo.trim()) return

    setGuardandoEdit(true)
    const { data, error } = await supabase
      .from('premios')
      .update({
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim() || null,
        tipo: editEspecial ? 'especial' : 'normal'
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

  const premiosEspeciales = premios.filter((p) => p.tipo === 'especial')
  const premiosNormales = premios.filter((p) => p.tipo !== 'especial')

  const renderTarjetaPremio = (premio) => {
    const esMio = premio.creado_por === session.user.id
    const estaEditando = editandoId === premio.id
    const destacado = premio.tipo === 'especial'

    return (
      <div
        key={premio.id}
        style={{
          border: destacado ? '2px solid #f5b942' : '1px solid #444',
          background: destacado ? 'rgba(245, 185, 66, 0.08)' : 'transparent',
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
            {esAdmin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={editEspecial}
                  onChange={(e) => setEditEspecial(e.target.checked)}
                  disabled={guardandoEdit}
                />
                Premio Especial (fijo arriba, dividido por los 11 candidatos)
              </label>
            )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                <h3 style={{ margin: 0 }}>{premio.titulo}</h3>
                {destacado && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 'bold',
                      padding: '0.15rem 0.55rem',
                      borderRadius: 12,
                      background: '#f5b942',
                      color: '#1a1a1a',
                      textTransform: 'uppercase'
                    }}
                  >
                    Especial
                  </span>
                )}
              </div>
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
  }

  return (
    <div>
      {/* Premios Especiales fijados arriba del todo */}
      {!cargando && premiosEspeciales.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginTop: 0, color: '#f5b942' }}>
            Premios Especiales ({premiosEspeciales.length})
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {premiosEspeciales.map(renderTarjetaPremio)}
          </div>
        </section>
      )}

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
          {esAdmin && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={esEspecial}
                onChange={(e) => setEsEspecial(e.target.checked)}
              />
              Marcar como Premio Especial (fijo arriba, con las 11 secciones de candidatos)
            </label>
          )}
          {error && <p style={{ color: '#ff6b6b', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={creando} style={{ padding: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>
            {creando ? 'Guardando...' : 'Crear Premio'}
          </button>
        </form>
      </section>

      {/* Lista de premios normales */}
      <h2>Categorías de la Gala ({premiosNormales.length})</h2>
      {cargando ? (
        <p>Cargando premios...</p>
      ) : premiosNormales.length === 0 ? (
        <p>Aún no hay premios creados. ¡Sé el primero en proponer uno!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {premiosNormales.map(renderTarjetaPremio)}
        </div>
      )}
    </div>
  )
}