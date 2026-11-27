import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL, DRIVE_FOLDER_URL } from './supabaseClient'
import { uploadMedia } from './uploadMedia'

const MAX_FILE_SIZE = 40 * 1024 * 1024 // 40 MB

const MEDALLAS = [
  { puntos: 3, label: '🥇 Oro (3)', color: '#f5b942', textColor: '#1a1a1a' },
  { puntos: 2, label: '🥈 Plata (2)', color: '#c0c0c0', textColor: '#1a1a1a' },
  { puntos: 1, label: '🥉 Bronce (1)', color: '#cd7f32', textColor: '#fff' }
]

export default function PremioDetalle({ session, mostrarMedia = true, fase = 'propuestas' }) {
  const { id } = useParams()
  const fileInputRef = useRef(null)

  const [premio, setPremio] = useState(null)
  const [propuestas, setPropuestas] = useState([])
  const [candidatos, setCandidatos] = useState([])
  const [candidatoActivo, setCandidatoActivo] = useState(null)
  const [mediaDestapados, setMediaDestapados] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Estados de votaciones del usuario actual
  const [misVotosNormales, setMisVotosNormales] = useState([]) // [{ propuesta_id, puntos }]
  const [miVotoEspecial, setMiVotoEspecial] = useState(null)   // candidato_id o null
  const [guardandoVoto, setGuardandoVoto] = useState(false)

  // Estados del formulario de nueva propuesta / razón
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [candidatosSeleccionados, setCandidatosSeleccionados] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const [errorForm, setErrorForm] = useState(null)

  // Estados para editar una propuesta / razón existente
  const [editandoId, setEditandoId] = useState(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editTexto, setEditTexto] = useState('')
  const [editDriveUrl, setEditDriveUrl] = useState('')
  const [editArchivo, setEditArchivo] = useState(null)
  const [editCandidatos, setEditCandidatos] = useState([])
  const [quitarMedia, setQuitarMedia] = useState(false)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [errorEdit, setErrorEdit] = useState(null)

  const nombreUsuario =
    session.user.user_metadata?.nombre || session.user.email.split('@')[0]

  const esAdmin = session.user.email === ADMIN_EMAIL
  const enPropuestas = fase === 'propuestas'
  const enVotaciones = fase === 'votaciones'

  const cargarDatos = async () => {
    setCargando(true)
    setError(null)

    const [resPremio, resPropuestas, resCandidatos, resVotosNorm, resVotoEsp] = await Promise.all([
      supabase.from('premios').select('*').eq('id', id).single(),
      supabase
        .from('propuestas')
        .select('*, propuesta_candidatos(candidato_id, candidatos(id, nombre))')
        .eq('premio_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('candidatos').select('*').order('nombre'),
      supabase
        .from('votos_normales')
        .select('propuesta_id, puntos')
        .eq('premio_id', id)
        .eq('usuario_id', session.user.id),
      supabase
        .from('votos_especiales')
        .select('candidato_id')
        .eq('premio_id', id)
        .eq('usuario_id', session.user.id)
        .maybeSingle()
    ])

    if (resPremio.error) {
      setError('No se encontró el premio')
    } else {
      setPremio(resPremio.data)
      setPropuestas(resPropuestas.data || [])
      setCandidatos(resCandidatos.data || [])
      setMisVotosNormales(resVotosNorm.data || [])
      setMiVotoEspecial(resVotoEsp.data?.candidato_id || null)
    }

    setCargando(false)
  }

  useEffect(() => {
    setCandidatoActivo(null)
    cargarDatos()
  }, [id])

  const esEspecial = premio?.tipo === 'especial'

  // --- FUNCIONES DE VOTACIÓN ---
  const votarNormal = async (propuestaId, puntos) => {
    if (!enVotaciones || guardandoVoto) return
    setGuardandoVoto(true)

    try {
      const yaTieneEsaMedalla = misVotosNormales.some(
        (v) => v.propuesta_id === propuestaId && v.puntos === puntos
      )

      if (yaTieneEsaMedalla) {
        // Quitar el voto si vuelve a pulsar la misma medalla
        const { error } = await supabase
          .from('votos_normales')
          .delete()
          .eq('premio_id', id)
          .eq('usuario_id', session.user.id)
          .eq('propuesta_id', propuestaId)

        if (error) throw error
      } else {
        // Limpiar cualquier voto previo con esos puntos O hacia esa misma propuesta
        const { error: delError } = await supabase
          .from('votos_normales')
          .delete()
          .eq('premio_id', id)
          .eq('usuario_id', session.user.id)
          .or(`puntos.eq.${puntos},propuesta_id.eq.${propuestaId}`)

        if (delError) throw delError

        // Insertar el nuevo voto
        const { error: insError } = await supabase
          .from('votos_normales')
          .insert([
            {
              premio_id: id,
              propuesta_id: propuestaId,
              usuario_id: session.user.id,
              puntos
            }
          ])

        if (insError) throw insError
      }

      // Refrescar mis votos en este premio
      const { data } = await supabase
        .from('votos_normales')
        .select('propuesta_id, puntos')
        .eq('premio_id', id)
        .eq('usuario_id', session.user.id)

      setMisVotosNormales(data || [])
    } catch (err) {
      alert('Error al guardar el voto: ' + err.message)
    } finally {
      setGuardandoVoto(false)
    }
  }

  const votarEspecial = async (candidatoId) => {
    if (!enVotaciones || guardandoVoto) return
    setGuardandoVoto(true)

    try {
      if (miVotoEspecial === candidatoId) {
        // Quitar voto
        const { error } = await supabase
          .from('votos_especiales')
          .delete()
          .eq('premio_id', id)
          .eq('usuario_id', session.user.id)

        if (error) throw error
        setMiVotoEspecial(null)
      } else {
        // Guardar o cambiar voto
        const { error } = await supabase
          .from('votos_especiales')
          .upsert(
            {
              premio_id: id,
              candidato_id: candidatoId,
              usuario_id: session.user.id
            },
            { onConflict: 'premio_id,usuario_id' }
          )

        if (error) throw error
        setMiVotoEspecial(candidatoId)
      }
    } catch (err) {
      alert('Error al guardar el voto: ' + err.message)
    } finally {
      setGuardandoVoto(false)
    }
  }

  // --- FUNCIONES DE PROPUESTAS ---
  const borrarPropuesta = async (propuesta) => {
    const confirmado = window.confirm(`¿Seguro que quieres borrar "${propuesta.titulo}"?`)
    if (!confirmado) return

    const { error } = await supabase.from('propuestas').delete().eq('id', propuesta.id)
    if (error) {
      alert('No se pudo borrar: ' + error.message)
    } else {
      setPropuestas(propuestas.filter((p) => p.id !== propuesta.id))
    }
  }

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

      const { data: nuevaPropuesta, error: insertError } = await supabase
        .from('propuestas')
        .insert([
          {
            premio_id: id,
            titulo: titulo.trim(),
            texto: texto.trim() || null,
            drive_url: driveUrl.trim() || null,
            media_url: mediaUrl,
            media_tipo: mediaTipo,
            creado_por: session.user.id,
            autor_nombre: nombreUsuario,
            candidato_especial_id: esEspecial && candidatoActivo ? candidatoActivo.id : null
          }
        ])
        .select()
        .single()

      if (insertError) throw insertError

      if (!esEspecial && candidatosSeleccionados.length > 0) {
        const relaciones = candidatosSeleccionados.map((candidatoId) => ({
          propuesta_id: nuevaPropuesta.id,
          candidato_id: candidatoId
        }))

        const { error: relError } = await supabase
          .from('propuesta_candidatos')
          .insert(relaciones)

        if (relError) throw relError
      }

      setTitulo('')
      setTexto('')
      setDriveUrl('')
      setArchivo(null)
      setCandidatosSeleccionados([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      await cargarDatos()
    } catch (err) {
      console.error('Error al crear:', err)
      setErrorForm(err.message || 'Error al subir.')
    } finally {
      setSubiendo(false)
    }
  }

  const iniciarEdicion = (p) => {
    setEditandoId(p.id)
    setEditTitulo(p.titulo)
    setEditTexto(p.texto || '')
    setEditDriveUrl(p.drive_url || '')
    setEditArchivo(null)
    setQuitarMedia(false)
    setEditCandidatos((p.propuesta_candidatos || []).map((pc) => pc.candidato_id))
    setErrorEdit(null)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditArchivo(null)
    setEditDriveUrl('')
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

      const { error: updateError } = await supabase
        .from('propuestas')
        .update({
          titulo: editTitulo.trim(),
          texto: editTexto.trim() || null,
          drive_url: editDriveUrl.trim() || null,
          media_url: mediaUrl,
          media_tipo: mediaTipo
        })
        .eq('id', propuestaOriginal.id)

      if (updateError) throw updateError

      if (!esEspecial) {
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
      }

      cancelarEdicion()
      await cargarDatos()
    } catch (err) {
      console.error('Error al editar:', err)
      setErrorEdit(err.message || 'Error al guardar los cambios.')
    } finally {
      setGuardandoEdit(false)
    }
  }

  const renderCampoDrive = (valor, setValor, disabled) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Link a Drive (opcional)</label>
        <a
          href={DRIVE_FOLDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '0.82rem',
            padding: '0.3rem 0.65rem',
            borderRadius: 6,
            border: '1px solid #646cff',
            color: '#646cff',
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          Añadir link a Drive ↗
        </a>
      </div>
      <input
        type="url"
        placeholder="Pega aquí el enlace del archivo de Google Drive..."
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        disabled={disabled}
        style={{ padding: '0.6rem', borderRadius: 6 }}
      />
    </div>
  )

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

  const renderTarjetaPropuesta = (p) => {
    const esMia = p.creado_por === session.user.id
    const puedeEditar = (enPropuestas && esMia) || esAdmin
    const estaEditando = editandoId === p.id
    const nominados = (p.propuesta_candidatos || []).map((pc) => pc.candidatos).filter(Boolean)
    const votoActual = misVotosNormales.find((v) => v.propuesta_id === p.id)

    return (
      <article
        key={p.id}
        style={{
          border: votoActual ? '2px solid #f5b942' : '1px solid #444',
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
            {!esEspecial && renderSelectorCandidatos(editCandidatos, setEditCandidatos, guardandoEdit)}
            {renderCampoDrive(editDriveUrl, setEditDriveUrl, guardandoEdit)}
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>
                Cambiar foto o vídeo (opcional, máx. 40 MB)
              </label>
              <input type="file" accept="image/*,video/*" onChange={manejarArchivoEdit} disabled={guardandoEdit} />
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
              {puedeEditar && (
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => iniciarEdicion(p)}
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => borrarPropuesta(p)}
                    style={{
                      padding: '0.3rem 0.7rem',
                      fontSize: '0.85rem',
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

            {!esEspecial && nominados.length > 0 && (
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

            {p.texto && <p style={{ margin: '0 0 0.8rem 0', whiteSpace: 'pre-wrap' }}>{p.texto}</p>}

            {p.drive_url && (
              <div
                style={{
                  marginBottom: '0.8rem',
                  padding: '0.7rem 0.9rem',
                  borderRadius: 8,
                  border: '1px solid rgba(100, 108, 255, 0.5)',
                  background: 'rgba(100, 108, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}
              >
                <small style={{ opacity: 0.75, fontWeight: 'bold' }}>Link a Drive</small>
                <a
                  href={p.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#8c92ff', wordBreak: 'break-all', textDecoration: 'underline', fontSize: '0.9rem' }}
                >
                  {p.drive_url}
                </a>
              </div>
            )}

            {p.media_url && (mostrarMedia || mediaDestapados[p.id]) ? (
              <>
                {p.media_tipo === 'imagen' && (
                  <img
                    src={p.media_url}
                    alt={p.titulo}
                    style={{ width: '100%', maxHeight: 500, objectFit: 'contain', borderRadius: 8 }}
                  />
                )}
                {p.media_tipo === 'video' && (
                  <video
                    src={p.media_url}
                    controls
                    playsInline
                    style={{ width: '100%', maxHeight: 500, borderRadius: 8 }}
                  />
                )}
              </>
            ) : p.media_url ? (
              <div
                style={{
                  padding: '0.9rem',
                  borderRadius: 8,
                  border: '1px dashed #666',
                  background: 'rgba(255, 255, 255, 0.03)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.8rem',
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ opacity: 0.75, fontSize: '0.9rem' }}>
                  {p.media_tipo === 'video' ? 'Vídeo adjunto' : 'Foto adjunta'} (oculto hasta la gala)
                </span>
                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => setMediaDestapados((prev) => ({ ...prev, [p.id]: true }))}
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Ver (solo admin)
                  </button>
                )}
              </div>
            ) : null}

            {/* BOTONES DE VOTACIÓN (Oro, Plata, Bronce) en premios normales */}
            {!esEspecial && enVotaciones && (
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.8rem',
                  borderTop: '1px solid #333',
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap'
                }}
              >
                {MEDALLAS.map((m) => {
                  const activa = votoActual?.puntos === m.puntos
                  return (
                    <button
                      key={m.puntos}
                      type="button"
                      disabled={guardandoVoto}
                      onClick={() => votarNormal(p.id, m.puntos)}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: 8,
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        cursor: guardandoVoto ? 'not-allowed' : 'pointer',
                        border: activa ? `2px solid ${m.color}` : '1px solid #555',
                        background: activa ? m.color : 'transparent',
                        color: activa ? m.textColor : 'inherit'
                      }}
                    >
                      {activa ? '✓ ' : ''}{m.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ marginTop: '0.8rem' }}>
              <small style={{ opacity: 0.6 }}>Subido por {p.autor_nombre}</small>
            </div>
          </>
        )}
      </article>
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

  // --- VISTA PARA PREMIOS ESPECIALES ---
  if (esEspecial) {
    if (!candidatoActivo) {
      const candidatoVotado = candidatos.find((c) => c.id === miVotoEspecial)

      return (
        <div>
          <Link to="/" style={{ display: 'inline-block', marginBottom: '1rem' }}>
            ← Volver a los premios
          </Link>

          <section style={{ borderBottom: '2px solid #f5b942', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <h1 style={{ margin: 0 }}>{premio.titulo}</h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  padding: '0.2rem 0.6rem',
                  borderRadius: 12,
                  background: '#f5b942',
                  color: '#1a1a1a',
                  textTransform: 'uppercase'
                }}
              >
                Premio Especial
              </span>
            </div>
            {premio.descripcion && <p style={{ margin: '0 0 0.5rem 0', opacity: 0.85 }}>{premio.descripcion}</p>}

            {enVotaciones && (
              <div
                style={{
                  marginTop: '0.8rem',
                  padding: '0.7rem 1rem',
                  borderRadius: 8,
                  background: 'rgba(245, 185, 66, 0.12)',
                  border: '1px solid #f5b942',
                  fontSize: '0.9rem'
                }}
              >
                {candidatoVotado ? (
                  <span>Tu voto actual: <strong>{candidatoVotado.nombre}</strong> (el ganador suma 5 pts).</span>
                ) : (
                  <span>Elige a <strong>1 candidato</strong> para este premio (el ganador suma 5 pts).</span>
                )}
              </div>
            )}
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
              gap: '1rem'
            }}
          >
            {candidatos.map((c) => {
              const numRazones = propuestas.filter((p) => p.candidato_especial_id === c.id).length
              const esMiVoto = miVotoEspecial === c.id

              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '1.1rem 0.8rem',
                    borderRadius: 12,
                    border: esMiVoto ? '2px solid #f5b942' : '1px solid #444',
                    background: esMiVoto ? 'rgba(245, 185, 66, 0.08)' : 'transparent',
                    textAlign: 'center'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      cancelarEdicion()
                      setCandidatoActivo(c)
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    {c.foto_url ? (
                      <img
                        src={c.foto_url}
                        alt={c.nombre}
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #f5b942'
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
                          color: '#aaa',
                          border: '2px solid #555'
                        }}
                      >
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <strong style={{ fontSize: '1.05rem' }}>{c.nombre}</strong>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.15rem 0.6rem',
                        borderRadius: 12,
                        background: numRazones > 0 ? 'rgba(245, 185, 66, 0.2)' : '#2a2a2a',
                        color: numRazones > 0 ? '#f5b942' : '#999'
                      }}
                    >
                      {numRazones} {numRazones === 1 ? 'razón' : 'razones'}
                    </span>
                  </button>

                  {enVotaciones && (
                    <button
                      type="button"
                      disabled={guardandoVoto}
                      onClick={() => votarEspecial(c.id)}
                      style={{
                        width: '100%',
                        marginTop: '0.3rem',
                        padding: '0.45rem',
                        borderRadius: 8,
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        cursor: guardandoVoto ? 'not-allowed' : 'pointer',
                        border: esMiVoto ? '1px solid #f5b942' : '1px solid #555',
                        background: esMiVoto ? '#f5b942' : 'transparent',
                        color: esMiVoto ? '#1a1a1a' : 'inherit'
                      }}
                    >
                      {esMiVoto ? '✓ Tu voto' : 'Votar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    const razonesCandidato = propuestas.filter((p) => p.candidato_especial_id === candidatoActivo.id)
    const esMiVotoActivo = miVotoEspecial === candidatoActivo.id

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            cancelarEdicion()
            setCandidatoActivo(null)
            setTitulo('')
            setTexto('')
            setDriveUrl('')
            setArchivo(null)
            setErrorForm(null)
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#646cff',
            cursor: 'pointer',
            marginBottom: '1rem',
            fontSize: '0.95rem'
          }}
        >
          ← Volver a los 11 candidatos de {premio.titulo}
        </button>

        <section
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            borderBottom: '2px solid #f5b942',
            paddingBottom: '1rem',
            marginBottom: '1.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {candidatoActivo.foto_url ? (
              <img
                src={candidatoActivo.foto_url}
                alt={candidatoActivo.nombre}
                style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f5b942' }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: '#333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  fontWeight: 'bold',
                  color: '#aaa'
                }}
              >
                {candidatoActivo.nombre.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 style={{ margin: 0 }}>{candidatoActivo.nombre}</h1>
              <p style={{ margin: '0.2rem 0 0 0', opacity: 0.8 }}>
                Candidato a <strong>{premio.titulo}</strong>
              </p>
            </div>
          </div>

          {enVotaciones && (
            <button
              type="button"
              disabled={guardandoVoto}
              onClick={() => votarEspecial(candidatoActivo.id)}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: 8,
                fontWeight: 'bold',
                cursor: guardandoVoto ? 'not-allowed' : 'pointer',
                border: '1px solid #f5b942',
                background: esMiVotoActivo ? '#f5b942' : 'transparent',
                color: esMiVotoActivo ? '#1a1a1a' : '#f5b942'
              }}
            >
              {esMiVotoActivo ? '✓ Tu voto actual' : `Votar por ${candidatoActivo.nombre}`}
            </button>
          )}
        </section>

        {enPropuestas && (
          <section style={{ border: '1px solid #444', borderRadius: 12, padding: '1.2rem', marginBottom: '2rem' }}>
            <h2 style={{ marginTop: 0 }}>Añadir una razón para {candidatoActivo.nombre}</h2>
            <form onSubmit={crearPropuesta} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <input
                type="text"
                placeholder={`Ej. "Su actuación en El Escorial"`}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
                disabled={subiendo}
                style={{ padding: '0.6rem', borderRadius: 6 }}
              />
              <textarea
                placeholder="Explica por qué merece el premio por esto (opcional)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                disabled={subiendo}
                style={{ padding: '0.6rem', borderRadius: 6, resize: 'vertical' }}
              />
              {renderCampoDrive(driveUrl, setDriveUrl, subiendo)}
              <div>
                <label htmlFor="media-file-especial" style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>
                  Foto o vídeo de prueba opcional (máx. 40 MB)
                </label>
                <input
                  id="media-file-especial"
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
                {subiendo ? 'Subiendo razón...' : 'Añadir razón'}
              </button>
            </form>
          </section>
        )}

        <h2>Razones ({razonesCandidato.length})</h2>
        {razonesCandidato.length === 0 ? (
          <p>Aún no hay razones subidas para {candidatoActivo.nombre}.</p>
        ) : (
          <div style={{ display: 'grid', gap: '1.2rem' }}>{razonesCandidato.map(renderTarjetaPropuesta)}</div>
        )}
      </div>
    )
  }

  // --- VISTA PARA PREMIOS NORMALES ---
  const resumenPodio = MEDALLAS.map((m) => {
    const voto = misVotosNormales.find((v) => v.puntos === m.puntos)
    const prop = voto ? propuestas.find((p) => p.id === voto.propuesta_id) : null
    return { ...m, propuestaTitulo: prop?.titulo || null }
  })

  return (
    <div>
      <Link to="/" style={{ display: 'inline-block', marginBottom: '1rem' }}>
        ← Volver a los premios
      </Link>

      <section style={{ borderBottom: '1px solid #444', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>{premio.titulo}</h1>
        {premio.descripcion && <p style={{ margin: '0 0 0.5rem 0', opacity: 0.85 }}>{premio.descripcion}</p>}
        <small style={{ opacity: 0.6 }}>Categoría creada por {premio.autor_nombre}</small>
      </section>

      {/* Resumen de tu podio en fase de votaciones */}
      {enVotaciones && (
        <section
          style={{
            border: '1px solid #f5b942',
            borderRadius: 12,
            padding: '1rem 1.2rem',
            marginBottom: '1.5rem',
            background: 'rgba(245, 185, 66, 0.08)'
          }}
        >
          <strong style={{ display: 'block', marginBottom: '0.6rem' }}>
            Tu podio en esta categoría ({misVotosNormales.length}/3):
          </strong>
          <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.9rem' }}>
            {resumenPodio.map((m) => (
              <div key={m.puntos}>
                <strong>{m.label}:</strong>{' '}
                {m.propuestaTitulo ? (
                  <span>{m.propuestaTitulo}</span>
                ) : (
                  <span style={{ opacity: 0.5 }}>Sin asignar</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {fase === 'cerrado' && (
        <p style={{ padding: '0.8rem', borderRadius: 8, background: '#2a2a2a', marginBottom: '1.5rem' }}>
          Las votaciones están cerradas.
        </p>
      )}

      {enPropuestas && (
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
            {renderCampoDrive(driveUrl, setDriveUrl, subiendo)}
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
      )}

      <h2>Propuestas ({propuestas.length})</h2>
      {propuestas.length === 0 ? (
        <p>Aún no hay propuestas para este premio.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.2rem' }}>{propuestas.map(renderTarjetaPropuesta)}</div>
      )}
    </div>
  )
}