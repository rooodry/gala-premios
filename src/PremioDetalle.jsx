import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { uploadMedia } from './uploadMedia'

const MAX_FILE_SIZE = 40 * 1024 * 1024 // 40 MB

export default function PremioDetalle({ session }) {
  const { id } = useParams()
  const fileInputRef = useRef(null)

  const [premio, setPremio] = useState(null)
  const [propuestas, setPropuestas] = useState([])
  const [candidatos, setCandidatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Estados del formulario de nueva propuesta
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [candidatosSeleccionados, setCandidatosSeleccionados] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [errorForm, setErrorForm] = useState(null)

  // Estados para editar una propuesta existente
  const [editandoId, setEditandoId] = useState(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editTexto, setEditTexto] = useState('')
  const [editArchivo, setEditArchivo] = useState(null)
  const [editCandidatos, setEditCandidatos] = useState([])
  const [quitarMedia, setQuitarMedia] = useState(false)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit] = useState(null)

  const nombreUsuario =
    session.user.user_metadata?.nombre || session.user.email.split('@')[0]

  const cargarDatos = async () => {
    setCargando(true)
    setError(null)

    const [resPremio, resPropuestas, resCandidatos] = await Promise.all([
      supabase.from('premios').select('*').eq('id', id).single(),
      supabase
        .from('propuestas')
        .select('*, propuesta_candidatos(candidato_id, candidatos(id, nombre))')
        .eq('premio_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('candidatos').select('*').order('nombre')
    ])

    if (resPremio.error) {
      setError('No se encontró el premio')
    } else {
      setPremio(resPremio.data)
      setPropuestas(resPropuestas.data || [])
      setCandidatos(resCandidatos.data || [])
    }

    setCargando(false)
  }

  useEffect(() => {
    cargarDatos()
  }, [id])

  const toggleCandidato = (candidatoId, lista, setLista) => {
    if (lista.includes(candidatoId)) {
      setLista(lista.filter((c) => c !== candidatoId))
    } else {
      setLista([...lista, candidatoId])
    }
  }

  const manejarArchivo = (e) => {
    setErrorForm(null)
    const file = e.target.files?.[0]
    if (!file) {
      setArchivo(null)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorForm('El archivo supera el límite de 40 MB. Comprímelo o elige uno más ligero.')
      setArchivo(null)
      e.target.value = ''
      return
    }
    setArchivo(file)
  }

  const crearPropuesta = async (e) => {
    e.preventDefault()
    if (!titulo.trim()) return

    setSubiendo(true)
    setErrorForm(null)

    try {
      let mediaUrl = null
      let mediaTipo = 'texto'

      if (archivo) {
        const media = await uploadMedia(archivo)
        mediaUrl = media.url
        mediaTipo = media.tipo
      }

      // 1. Insertar la propuesta
      const { data: nuevaPropuesta, error: insertError } = await supabase
        .from('propuestas')
        .insert([
          {
            premio_id: id,
            titulo: titulo.trim(),
            texto: texto.trim() || null,
            media_url: mediaUrl,
            media_tipo: mediaTipo,
            creado_por: session.user.id,
            autor_nombre: nombreUsuario
          }
        ])
        .select()
        .single()

      if (insertError) throw insertError

      // 2. Asociar candidatos solo si se seleccionó alguno
      if (candidatosSeleccionados.length > 0) {
        const relaciones = candidatosSeleccionados.map((candidatoId) => ({
          propuesta_id: nuevaPropuesta.id,
          candidato_id: candidatoId
        }))

        const { error: relError } = await supabase
          .from('propuesta_candidatos')
          .insert(relaciones)

        if (relError) throw relError
      }

      // 3. Limpiar formulario y recargar lista
      setTitulo('')
      setTexto('')
      setArchivo(null)
      setCandidatosSeleccionados([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      await cargarDatos()
    } catch (err) {
      console.error('Error al crear propuesta:', err)
      setErrorForm(err.message || 'Error al subir la propuesta.')
    } finally {
      setSubiendo(false)
    }
  }

  // --- Funciones de edición ---
  const iniciarEdicion = (p) => {
    setEditandoId(p.id)
    setEditTitulo(p.titulo)
    setEditTexto(p.texto || '')
    setEditArchivo(null)
    setQuitarMedia(false)
    setEditCandidatos((p.propuesta_candidatos || []).map((pc) => pc.candidato_id))
    setErrorEdit(null)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditArchivo(null)
    setEditCandidatos([])
    setQuitarMedia(false)
    setErrorEdit(null)
  }

  const manejarArchivoEdit = (e) => {
    setErrorEdit(null)
    const file = e.target.files?.[0]
    if (!file) {
      setEditArchivo(null)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorEdit('El archivo supera el límite de 40 MB.')
      setEditArchivo(null)
      e.target.value = ''
      return
    }
    setEditArchivo(file)
    setQuitarMedia(false)
  }

  const guardarEdicion = async (e, propuestaOriginal) => {
    e.preventDefault()
    if (!editTitulo.trim()) return

    setGuardandoEdit(true)
    setErrorEdit(null)

    try {
      let mediaUrl = propuestaOriginal.media_url
      let mediaTipo = propuestaOriginal.media_tipo

      if (editArchivo) {
        const media = await uploadMedia(editArchivo)
        mediaUrl = media.url
        mediaTipo = media.tipo
      } else if (quitarMedia) {
        mediaUrl = null
        mediaTipo = 'texto'
      }

      // 1. Actualizar datos de la propuesta
      const { error: updateError } = await supabase
        .from('propuestas')
        .update({
          titulo: editTitulo.trim(),
          texto: editTexto.trim() || null,
          media_url: mediaUrl,
          media_tipo: mediaTipo
        })
        .eq('id', propuestaOriginal.id)

      if (updateError) throw updateError

      // 2. Reemplazar candidatos asociados
      const { error: delError } = await supabase
        .from('propuesta_candidatos')
        .delete()
        .eq('propuesta_id', propuestaOriginal.id)

      if (delError) throw delError

      if (editCandidatos.length > 0) {
        const nuevasRelaciones = editCandidatos.map((candidatoId) => ({
          propuesta_id: propuestaOriginal.id,
          candidato_id: candidatoId
        }))

        const { error: insError } = await supabase
          .from('propuesta_candidatos')
          .insert(nuevasRelaciones)

        if (insError) throw insError
      }

      cancelarEdicion()
      await cargarDatos()
    } catch (err) {
      console.error('Error al editar propuesta:', err)
      setErrorEdit(err.message || 'Error al guardar los cambios.')
    } finally {
      setGuardandoEdit(false)
    }
  }

  // Selector visual reutilizable de candidatos
  const renderSelectorCandidatos = (seleccionados, setSeleccionados, disabled) => {
    const nadieSeleccionado = seleccionados.length === 0

    return (
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: '0.9rem', fontWeight: 'bold' }}>
          ¿A quién(es) nominas? ({nadieSeleccionado ? 'Nadie' : `${seleccionados.length} seleccionados`})
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSeleccionados([])}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 20,
              border: nadieSeleccionado ? '1px solid #888' : '1px solid #555',
              background: nadieSeleccionado ? '#555' : 'transparent',
              color: nadieSeleccionado ? '#fff' : 'inherit',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {nadieSeleccionado ? '✓ ' : ''}Nadie
          </button>

          {candidatos.map((c) => {
            const activo = seleccionados.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleCandidato(c.id, seleccionados, setSeleccionados)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 20,
                  border: activo ? '1px solid #646cff' : '1px solid #555',
                  background: activo ? '#646cff' : 'transparent',
                  color: activo ? '#fff' : 'inherit',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                {activo ? '✓ ' : ''}{c.nombre}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

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

      {/* Formulario de nueva propuesta */}
      <section style={{ border: '1px solid #444', borderRadius: 12, padding: '1.2rem', marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Añadir una propuesta</h2>
        <form onSubmit={crearPropuesta} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <input
            type="text"
            placeholder="Título de la propuesta"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            disabled={subiendo}
            style={{ padding: '0.6rem', borderRadius: 6 }}
          />

          <textarea
            placeholder="Cuéntanos el contexto o la anécdota (opcional)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            disabled={subiendo}
            style={{ padding: '0.6rem', borderRadius: 6, resize: 'vertical' }}
          />

          {renderSelectorCandidatos(candidatosSeleccionados, setCandidatosSeleccionados, subiendo)}

          <div>
            <label htmlFor="media-file" style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>
              Foto o vídeo opcional (máx. 40 MB)
            </label>
            <input
              id="media-file"
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={manejarArchivo}
              disabled={subiendo}
            />
          </div>

          {errorForm && <p style={{ color: '#ff6b6b', margin: 0 }}>{errorForm}</p>}

          <button
            type="submit"
            disabled={subiendo}
            style={{ padding: '0.75rem', fontWeight: 'bold', cursor: subiendo ? 'not-allowed' : 'pointer' }}
          >
            {subiendo ? 'Subiendo propuesta...' : 'Publicar propuesta'}
          </button>
        </form>
      </section>

      {/* Listado de propuestas */}
      <h2>Propuestas ({propuestas.length})</h2>
      {propuestas.length === 0 ? (
        <p>Aún no hay propuestas para este premio. ¡Sé el primero en subir una!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.2rem' }}>
          {propuestas.map((p) => {
            const esMia = p.creado_por === session.user.id
            const estaEditando = editandoId === p.id
            const nominados = (p.propuesta_candidatos || [])
              .map((pc) => pc.candidatos)
              .filter(Boolean)

            return (
              <article
                key={p.id}
                style={{
                  border: '1px solid #444',
                  borderRadius: 12,
                  padding: '1.2rem'
                }}
              >
                {estaEditando ? (
                  <form
                    onSubmit={(e) => guardarEdicion(e, p)}
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
                      value={editTexto}
                      onChange={(e) => setEditTexto(e.target.value)}
                      rows={3}
                      placeholder="Descripción (opcional)"
                      disabled={guardandoEdit}
                      style={{ padding: '0.6rem', borderRadius: 6, resize: 'vertical' }}
                    />

                    {renderSelectorCandidatos(editCandidatos, setEditCandidatos, guardandoEdit)}

                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>
                        Cambiar foto o vídeo (opcional, máx. 40 MB)
                      </label>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={manejarArchivoEdit}
                        disabled={guardandoEdit}
                      />
                    </div>

                    {p.media_url && !editArchivo && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                        <input
                          type="checkbox"
                          checked={quitarMedia}
                          onChange={(e) => setQuitarMedia(e.target.checked)}
                          disabled={guardandoEdit}
                        />
                        Quitar la foto/vídeo actual
                      </label>
                    )}

                    {errorEdit && <p style={{ color: '#ff6b6b', margin: 0 }}>{errorEdit}</p>}

                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button type="submit" disabled={guardandoEdit} style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>
                        {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                      <button type="button" onClick={cancelarEdicion} disabled={guardandoEdit} style={{ padding: '0.5rem 1rem' }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>{p.titulo}</h3>
                      {esMia && (
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(p)}
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {nominados.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.8rem' }}>
                        {nominados.map((n) => (
                          <span
                            key={n.id}
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: 12,
                              background: 'rgba(100, 108, 255, 0.2)',
                              border: '1px solid rgba(100, 108, 255, 0.5)'
                            }}
                          >
                            {n.nombre}
                          </span>
                        ))}
                      </div>
                    )}

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
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}