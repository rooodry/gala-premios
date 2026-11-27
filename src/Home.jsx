import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

const normalizar = (texto = '') =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export default function Home({ session, fase = 'propuestas' }) {
  const [premios, setPremios] = useState([])
  const [misVotosNormales, setMisVotosNormales] = useState([])
  const [misVotosEspeciales, setMisVotosEspeciales] = useState([])
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [esEspecial, setEsEspecial] = useState(false)
  const [busqueda, setBusqueda] = useState('')
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
  const enPropuestas = fase === 'propuestas'
  const enVotaciones = fase === 'votaciones'
  const nombreUsuario =
    session.user.user_metadata?.nombre || session.user.email.split('@')[0]

  const cargarDatos = async () => {
    const [resPremios, resVotosNorm, resVotosEsp] = await Promise.all([
      supabase.from('premios').select('*').order('created_at', { ascending: false }),
      supabase
        .from('votos_normales')
        .select('premio_id, puntos')
        .eq('usuario_id', session.user.id),
      supabase
        .from('votos_especiales')
        .select('premio_id')
        .eq('usuario_id', session.user.id)
    ])

    if (resPremios.error) {
      setError('No se pudieron cargar los premios')
    } else {
      setPremios(resPremios.data || [])
      setMisVotosNormales(resVotosNorm.data || [])
      setMisVotosEspeciales(resVotosEsp.data || [])
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarDatos()
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

  // Calcular estado de voto del usuario para cada premio
  const getEstadoVoto = (premio) => {
    if (premio.tipo === 'especial') {
      const votado = misVotosEspeciales.some((v) => v.premio_id === premio.id)
      return { completo: votado, texto: votado ? '✓ Votado' : 'Pendiente' }
    } else {
      const cantidad = misVotosNormales.filter((v) => v.premio_id === premio.id).length
      return {
        completo: cantidad === 3,
        parcial: cantidad > 0 && cantidad < 3,
        texto: cantidad === 3 ? '✓ 3/3' : cantidad > 0 ? `${cantidad}/3` : 'Sin votar'
      }
    }
  }

  const totalCompletados = premios.filter((p) => getEstadoVoto(p).completo).length

  const premiosEspeciales = premios.filter((p) => p.tipo === 'especial')
  const premiosNormales = premios.filter((p) => p.tipo !== 'especial')

  const termino = normalizar(busqueda.trim())
  const premiosNormalesFiltrados = termino
    ? premiosNormales.filter((p) => {
        const enTitulo = normalizar(p.titulo).includes(termino)
        const enDesc = normalizar(p.descripcion || '').includes(termino)
        const enAutor = normalizar(p.autor_nombre || '').includes(termino)
        return enTitulo || enDesc || enAutor
      })
    : premiosNormales

  const renderTarjetaPremio = (premio) => {
    const esMio = premio.creado_por === session.user.id
    const puedeGestionar = (enPropuestas && esMio) || esAdmin
    const estaEditando = editandoId === premio.id
    const destacado = premio.tipo === 'especial'
    const estadoVoto = getEstadoVoto(premio)

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
                {enVotaciones && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      padding: '0.15rem 0.6rem',
                      borderRadius: 12,
                      background: estadoVoto.completo
                        ? '#2e7d32'
                        : estadoVoto.parcial
                        ? '#ed6c02'
                        : '#333',
                      color: '#fff'
                    }}
                  >
                    {estadoVoto.texto}
                  </span>
                )}
              </div>
              {premio.descripcion && (
                <p style={{ margin: '0 0 0.8rem 0', opacity: 0.85 }}>{premio.descripcion}</p>
              )}
              <small style={{ opacity: 0.6 }}>Creado por {premio.autor_nombre}</small>
            </Link>

            {puedeGestionar && (
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
      {/* Banner de progreso en fase de votaciones */}
      {enVotaciones && !cargando && (
        <section
          style={{
            border: '1px solid #f5b942',
            borderRadius: 12,
            padding: '1rem 1.2rem',
            marginBottom: '1.5rem',
            background: 'rgba(245, 185, 66, 0.08)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Votaciones abiertas</strong>
            <span style={{ fontWeight: 'bold', color: '#f5b942' }}>
              {totalCompletados} / {premios.length} categorías completadas
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: premios.length ? `${(totalCompletados / premios.length) * 100}%` : '0%',
                height: '100%',
                background: totalCompletados === premios.length ? '#4caf50' : '#f5b942',
                transition: 'width 0.3s'
              }}
            />
          </div>
        </section>
      )}

      {fase === 'cerrado' && (
        <p style={{ padding: '0.9rem 1.2rem', borderRadius: 10, background: '#2a2a2a', marginBottom: '1.5rem' }}>
          Las votaciones están cerradas. ¡Nos vemos en la Gala!
        </p>
      )}

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

      {/* Formulario para crear un nuevo premio (solo en fase propuestas) */}
      {enPropuestas && (
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
      )}

      {/* Lista de premios normales con buscador */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>
          Categorías de la Gala (
          {termino
            ? `${premiosNormalesFiltrados.length} de ${premiosNormales.length}`
            : premiosNormales.length}
          )
        </h2>

        <div style={{ display: 'flex', gap: '0.4rem', flex: '1 1 240px', maxWidth: 360 }}>
          <input
            type="search"
            placeholder="Buscar categoría..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              flex: 1,
              padding: '0.55rem 0.75rem',
              borderRadius: 8,
              border: '1px solid #555'
            }}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              style={{ padding: '0.55rem 0.75rem', borderRadius: 8, cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <p>Cargando premios...</p>
      ) : premiosNormales.length === 0 ? (
        <p>Aún no hay premios creados. ¡Sé el primero en proponer uno!</p>
      ) : premiosNormalesFiltrados.length === 0 ? (
        <p style={{ opacity: 0.75 }}>
          No se encontraron categorías que coincidan con &ldquo;{busqueda}&rdquo;.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {premiosNormalesFiltrados.map(renderTarjetaPremio)}
        </div>
      )}
    </div>
  )
}