import { useEffect, useState } from 'react'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

const PUNTOS_PODIO = { 1: 3, 2: 2, 3: 1 }
const MEDALLA_INFO = {
  1: { icono: '🥇', nombre: 'ORO', color: '#f5b942', bg: 'rgba(245, 185, 66, 0.10)' },
  2: { icono: '🥈', nombre: 'PLATA', color: '#c0c0c0', bg: 'rgba(192, 192, 192, 0.08)' },
  3: { icono: '🥉', nombre: 'BRONCE', color: '#cd7f32', bg: 'rgba(205, 127, 50, 0.08)' }
}

const esUrlAudio = (url = '') => /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(url)

export default function Resultados({ session, mostrarMedia = false }) {
  const [seccionActiva, setSeccionActiva] = useState(null) // null | 'normales' | 'especiales' | 'campeon'
  const [premioEspecialActivoId, setPremioEspecialActivoId] = useState(null)
  const [indiceNormalActivo, setIndiceNormalActivo] = useState(0)
  const [revelados, setRevelados] = useState({})
  const [mediaDestapados, setMediaDestapados] = useState({})

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [totalVotantes, setTotalVotantes] = useState(0)
  const [top11, setTop11] = useState([])
  const [resultadosEspeciales, setResultadosEspeciales] = useState([])
  const [resultadosNormales, setResultadosNormales] = useState([])

  const esAdmin = session.user.email === ADMIN_EMAIL

  useEffect(() => {
    if (!esAdmin) {
      setCargando(false)
      return
    }

    const calcularResultados = async () => {
      setCargando(true)
      setError(null)

      const [resCand, resPrem, resProp, resRazonesEsp, resVotosNorm, resVotosEsp] = await Promise.all([
        supabase.from('candidatos').select('id, nombre, foto_url').order('nombre'),
        supabase.from('premios').select('id, titulo, descripcion, tipo').order('created_at', { ascending: false }),
        supabase
          .from('propuestas')
          .select(
            'id, premio_id, candidato_especial_id, titulo, texto, media_url, media_tipo, drive_url, autor_nombre, propuesta_candidatos(candidato_id, candidatos(id, nombre, foto_url))'
          )
          .limit(5000),
        supabase
          .from('propuestas')
          .select('id, premio_id, candidato_especial_id, titulo, texto, media_url, media_tipo, drive_url, autor_nombre')
          .not('candidato_especial_id', 'is', null)
          .limit(5000),
        supabase.from('votos_normales').select('premio_id, propuesta_id, usuario_id, puntos').limit(5000),
        supabase.from('votos_especiales').select('premio_id, candidato_id, usuario_id').limit(5000)
      ])

      if (
        resCand.error ||
        resPrem.error ||
        resProp.error ||
        resRazonesEsp.error ||
        resVotosNorm.error ||
        resVotosEsp.error
      ) {
        setError('Error al cargar los datos del recuento.')
        setCargando(false)
        return
      }

      const candidatos = resCand.data || []
      const premios = resPrem.data || []
      const propuestas = resProp.data || []
      const razonesEspeciales = resRazonesEsp.data || []
      const votosNormales = resVotosNorm.data || []
      const votosEspeciales = resVotosEsp.data || []

      const votantesUnicos = new Set([
        ...votosNormales.map((v) => v.usuario_id),
        ...votosEspeciales.map((v) => v.usuario_id)
      ])
      setTotalVotantes(votantesUnicos.size)

      // Mapa de puntuación acumulada por candidato
      const puntosPorCandidato = {}
      candidatos.forEach((c) => {
        puntosPorCandidato[c.id] = {
          ...c,
          puntosTotales: 0,
          desglose: []
        }
      })

      // --- 1. PREMIOS ESPECIALES (+5 pts al ganador; desempate por nº de razones) ---
      const resEspCalculados = premios
        .filter((p) => p.tipo === 'especial')
        .map((premio) => {
          const votosPremio = votosEspeciales.filter((v) => v.premio_id === premio.id)
          const conteo = {}
          votosPremio.forEach((v) => {
            conteo[v.candidato_id] = (conteo[v.candidato_id] || 0) + 1
          })

          const ranking = Object.entries(conteo)
            .map(([candidatoId, votos]) => {
              const candidato = candidatos.find((c) => c.id === candidatoId)
              const razones = razonesEspeciales.filter(
                (pr) =>
                  String(pr.premio_id) === String(premio.id) &&
                  String(pr.candidato_especial_id) === String(candidatoId)
              )
              return { candidato, votos, razones }
            })
            .filter((item) => item.candidato)
            .sort((a, b) => b.votos - a.votos || b.razones.length - a.razones.length)

          const maxVotos = ranking.length > 0 ? ranking[0].votos : 0
          const empatadosAVotos = ranking.filter((r) => r.votos === maxVotos && maxVotos > 0)

          const maxRazones = empatadosAVotos.length > 0 ? empatadosAVotos[0].razones.length : 0
          const ganadores = empatadosAVotos.filter((r) => r.razones.length === maxRazones)
          const desempatePorRazones = empatadosAVotos.length > ganadores.length

          ganadores.forEach((g) => {
            if (puntosPorCandidato[g.candidato.id]) {
              puntosPorCandidato[g.candidato.id].puntosTotales += 5
              puntosPorCandidato[g.candidato.id].desglose.push({
                premio: premio.titulo,
                detalle: 'Ganador Premio Especial',
                puntos: 5
              })
            }
          })

          return {
            premio,
            totalVotos: votosPremio.length,
            ranking,
            ganadores,
            hayEmpate: ganadores.length > 1,
            desempatePorRazones
          }
        })

      // --- 2. PREMIOS NORMALES (Top 3 propuestas -> +3, +2, +1 a todos sus nominados) ---
      const resNormCalculados = premios
        .filter((p) => p.tipo !== 'especial')
        .map((premio) => {
          const votosPremio = votosNormales.filter((v) => v.premio_id === premio.id)
          const propsPremio = propuestas.filter((pr) => pr.premio_id === premio.id)

          const puntosProp = {}
          votosPremio.forEach((v) => {
            puntosProp[v.propuesta_id] = (puntosProp[v.propuesta_id] || 0) + v.puntos
          })

          const ordenadas = propsPremio
            .map((pr) => ({
              ...pr,
              puntosVotacion: puntosProp[pr.id] || 0,
              nominados: (pr.propuesta_candidatos || []).map((pc) => pc.candidatos).filter(Boolean)
            }))
            .filter((pr) => pr.puntosVotacion > 0)
            .sort((a, b) => b.puntosVotacion - a.puntosVotacion)

          const top3 = []
          for (let i = 0; i < ordenadas.length; i++) {
            const actual = ordenadas[i]
            let posicion = i + 1
            if (i > 0 && actual.puntosVotacion === ordenadas[i - 1].puntosVotacion) {
              posicion = top3[i - 1].posicion
            }
            if (posicion > 3) break

            const puntosGala = PUNTOS_PODIO[posicion]
            top3.push({ ...actual, posicion, puntosGala })

            actual.nominados.forEach((nom) => {
              if (puntosPorCandidato[nom.id]) {
                puntosPorCandidato[nom.id].puntosTotales += puntosGala
                puntosPorCandidato[nom.id].desglose.push({
                  premio: premio.titulo,
                  detalle: `${MEDALLA_INFO[posicion].icono} ${actual.titulo}`,
                  puntos: puntosGala
                })
              }
            })
          }

          return { premio, top3 }
        })

      // --- 3. TOP 11 GENERAL ---
      const rankingFinal = Object.values(puntosPorCandidato).sort(
        (a, b) => b.puntosTotales - a.puntosTotales || a.nombre.localeCompare(b.nombre)
      )

      setResultadosEspeciales(resEspCalculados)
      setResultadosNormales(resNormCalculados)
      setTop11(rankingFinal)
      setCargando(false)
    }

    calcularResultados()
  }, [esAdmin])

  // Pasar de diapositiva con las flechas del teclado en Premios Normales
  useEffect(() => {
    if (seccionActiva !== 'normales' || resultadosNormales.length === 0) return

    const manejarTecla = (e) => {
      if (e.key === 'ArrowRight') {
        setIndiceNormalActivo((prev) => Math.min(prev + 1, resultadosNormales.length - 1))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if (e.key === 'ArrowLeft') {
        setIndiceNormalActivo((prev) => Math.max(prev - 1, 0))
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    window.addEventListener('keydown', manejarTecla)
    return () => window.removeEventListener('keydown', manejarTecla)
  }, [seccionActiva, resultadosNormales.length])

  const renderMediaPropuesta = (item) => {
    if (!item.media_url && !item.drive_url) return null

    const esAudio = item.media_tipo === 'audio' || esUrlAudio(item.media_url)
    const debeMostrar = mostrarMedia || mediaDestapados[item.id]
    const etiquetaArchivo =
      item.media_tipo === 'video' && !esAudio
        ? 'Vídeo adjunto'
        : esAudio
          ? 'Audio adjunto'
          : 'Foto adjunta'

    return (
      <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {item.media_url && debeMostrar ? (
          <>
            {item.media_tipo === 'imagen' && (
              <img
                src={item.media_url}
                alt={item.titulo}
                style={{
                  width: '100%',
                  maxHeight: 480,
                  objectFit: 'contain',
                  borderRadius: 10,
                  background: '#111'
                }}
              />
            )}

            {item.media_url && item.media_tipo === 'video' && !esAudio && (
              <video
                src={item.media_url}
                controls
                playsInline
                style={{
                  width: '100%',
                  maxHeight: 480,
                  borderRadius: 10,
                  background: '#000'
                }}
              />
            )}

            {item.media_url && esAudio && (
              <audio src={item.media_url} controls style={{ width: '100%' }} />
            )}
          </>
        ) : item.media_url ? (
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
              {etiquetaArchivo} (sin cargar)
            </span>
            <button
              type="button"
              onClick={() => setMediaDestapados((prev) => ({ ...prev, [item.id]: true }))}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Cargar archivo
            </button>
          </div>
        ) : null}

        {item.drive_url && (
          <a
            href={item.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              alignSelf: 'flex-start',
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              border: '1px solid #646cff',
              background: 'rgba(100, 108, 255, 0.12)',
              color: '#9aa0ff',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            Abrir archivo en Google Drive ↗
          </a>
        )}
      </div>
    )
  }

  const renderBarraVolver = (tituloSeccion) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.8rem',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #333'
      }}
    >
      <button
        type="button"
        onClick={() => {
          setSeccionActiva(null)
          setPremioEspecialActivoId(null)
          setIndiceNormalActivo(0)
          setRevelados({})
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
        style={{
          padding: '0.45rem 0.9rem',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        ← Volver a Resultados
      </button>
      <h1 style={{ margin: 0, fontSize: '1.6rem' }}>{tituloSeccion}</h1>
    </div>
  )

  if (!esAdmin) {
    return <p>Esta sección solo está disponible para el administrador.</p>
  }

  if (cargando) return <p>Calculando resultados...</p>
  if (error) return <p style={{ color: '#ff6b6b' }}>{error}</p>

  // --- MENÚ PRINCIPAL DE LAS 3 SECCIONES ---
  if (!seccionActiva) {
    const tarjetas = [
      {
        id: 'normales',
        icono: '🏆',
        titulo: 'Premios Normales',
        subtitulo: `${resultadosNormales.length} categorías — Top 3 con fotos, vídeos y audios`,
        borde: '#646cff',
        bg: 'rgba(100, 108, 255, 0.10)'
      },
      {
        id: 'especiales',
        icono: '⭐',
        titulo: 'Premios Especiales',
        subtitulo: `${resultadosEspeciales.length} premios — +5 pts para el ganador`,
        borde: '#f5b942',
        bg: 'rgba(245, 185, 66, 0.10)'
      },
      {
        id: 'campeon',
        icono: '👑',
        titulo: 'Campeón de Oro',
        subtitulo: 'Clasificación final Top 11 de la Gala',
        borde: '#ffd700',
        bg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(245, 185, 66, 0.05))'
      }
    ]

    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1.8rem'
          }}
        >
          <h1 style={{ margin: 0 }}>Resultados de la Gala</h1>
          <span style={{ padding: '0.35rem 0.85rem', borderRadius: 20, background: '#333', fontSize: '0.9rem' }}>
            Participación: <strong>{totalVotantes}</strong> {totalVotantes === 1 ? 'votante' : 'votantes'}
          </span>
        </div>

        <div style={{ display: 'grid', gap: '1.2rem' }}>
          {tarjetas.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSeccionActiva(t.id)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.2rem',
                padding: '1.8rem 1.5rem',
                borderRadius: 16,
                border: `2px solid ${t.borde}`,
                background: t.bg,
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%'
              }}
            >
              <span style={{ fontSize: '2.6rem', lineHeight: 1 }}>{t.icono}</span>
              <div>
                <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.5rem' }}>{t.titulo}</h2>
                <p style={{ margin: 0, opacity: 0.8, fontSize: '0.95rem' }}>{t.subtitulo}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // --- SECCIÓN 1: PREMIOS NORMALES (SLIDESHOW + REVELAR AL CLIC) ---
  if (seccionActiva === 'normales') {
    const total = resultadosNormales.length
    const indiceSeguro = Math.min(indiceNormalActivo, Math.max(total - 1, 0))
    const actual = resultadosNormales[indiceSeguro]

    const irAnterior = () => {
      if (indiceSeguro > 0) {
        setIndiceNormalActivo(indiceSeguro - 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    const irSiguiente = () => {
      if (indiceSeguro < total - 1) {
        setIndiceNormalActivo(indiceSeguro + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    const estiloFlecha = (deshabilitada) => ({
      position: 'sticky',
      top: '42vh',
      flexShrink: 0,
      width: 48,
      height: 72,
      borderRadius: 12,
      border: '2px solid #555',
      background: deshabilitada ? 'rgba(255, 255, 255, 0.03)' : 'rgba(100, 108, 255, 0.16)',
      color: deshabilitada ? '#555' : '#fff',
      fontSize: '2rem',
      lineHeight: 1,
      cursor: deshabilitada ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    })

    return (
      <div>
        {renderBarraVolver('🏆 Premios Normales')}

        {total === 0 ? (
          <p>No hay premios normales todavía.</p>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.8rem',
                marginBottom: '1.2rem'
              }}
            >
              <span style={{ fontWeight: 'bold', opacity: 0.85 }}>
                Premio {indiceSeguro + 1} de {total}
              </span>

              <select
                value={indiceSeguro}
                onChange={(e) => {
                  setIndiceNormalActivo(Number(e.target.value))
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                style={{ padding: '0.4rem 0.7rem', borderRadius: 8, maxWidth: 320 }}
              >
                {resultadosNormales.map(({ premio }, idx) => (
                  <option key={premio.id} value={idx}>
                    #{idx + 1} — {premio.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
              <button
                type="button"
                onClick={irAnterior}
                disabled={indiceSeguro === 0}
                aria-label="Premio anterior"
                style={estiloFlecha(indiceSeguro === 0)}
              >
                ‹
              </button>

              <section
                key={actual.premio.id}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: '2px solid #444',
                  borderRadius: 18,
                  padding: '1.8rem',
                  background: 'rgba(255, 255, 255, 0.02)'
                }}
              >
                <div style={{ borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <small style={{ textTransform: 'uppercase', letterSpacing: 1.2, opacity: 0.6 }}>
                    Premio #{indiceSeguro + 1} de {total}
                  </small>
                  <h2 style={{ margin: '0.3rem 0 0.4rem 0', fontSize: '2rem', lineHeight: 1.15 }}>
                    {actual.premio.titulo}
                  </h2>
                  {actual.premio.descripcion && (
                    <p style={{ margin: 0, opacity: 0.8, fontSize: '1rem' }}>{actual.premio.descripcion}</p>
                  )}
                </div>

                {actual.top3.length === 0 ? (
                  <p style={{ opacity: 0.6, fontSize: '1rem' }}>Sin votos todavía en esta categoría.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {actual.top3.map((item) => {
                      const medalla = MEDALLA_INFO[item.posicion] || MEDALLA_INFO[3]
                      const claveReveal = `${actual.premio.id}-${item.id}`
                      const estaRevelado = !!revelados[claveReveal]

                      if (!estaRevelado) {
                        return (
                          <button
                            key={claveReveal}
                            type="button"
                            onClick={() =>
                              setRevelados((prev) => ({ ...prev, [claveReveal]: true }))
                            }
                            style={{
                              width: '100%',
                              padding: '2.2rem 1.5rem',
                              borderRadius: 14,
                              border: `2px dashed ${medalla.color}`,
                              background: medalla.bg,
                              color: 'inherit',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem',
                              textAlign: 'center'
                            }}
                          >
                            <span style={{ fontSize: '1.35rem', fontWeight: 'bold', color: medalla.color }}>
                              {medalla.icono} {item.posicion}º PUESTO — {medalla.nombre}
                            </span>
                            <span style={{ fontSize: '0.95rem', opacity: 0.75 }}>
                              Pulsa para revelar
                            </span>
                          </button>
                        )
                      }

                      return (
                        <article
                          key={claveReveal}
                          style={{
                            border: `2px solid ${medalla.color}`,
                            background: medalla.bg,
                            borderRadius: 14,
                            padding: '1.4rem'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '0.6rem',
                              marginBottom: '0.8rem'
                            }}
                          >
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: medalla.color }}>
                              {medalla.icono} {item.posicion}º PUESTO — {medalla.nombre}
                            </span>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  padding: '0.25rem 0.7rem',
                                  borderRadius: 16,
                                  background: 'rgba(0, 0, 0, 0.35)',
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold'
                                }}
                              >
                                {item.puntosVotacion} pts de votación
                              </span>
                              <span
                                style={{
                                  padding: '0.25rem 0.7rem',
                                  borderRadius: 16,
                                  background: medalla.color,
                                  color: '#1a1a1a',
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold'
                                }}
                              >
                                +{item.puntosGala} pts gala
                              </span>
                            </div>
                          </div>

                          <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '1.45rem' }}>{item.titulo}</h3>

                          {item.nominados.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
                              {item.nominados.map((n) => (
                                <span
                                  key={n.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: 20,
                                    background: 'rgba(100, 108, 255, 0.22)',
                                    border: '1px solid rgba(100, 108, 255, 0.6)'
                                  }}
                                >
                                  {n.foto_url && (
                                    <img
                                      src={n.foto_url}
                                      alt={n.nombre}
                                      style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                  )}
                                  {n.nombre}
                                </span>
                              ))}
                            </div>
                          )}

                          {item.texto && (
                            <p style={{ margin: '0 0 0.5rem 0', whiteSpace: 'pre-wrap', fontSize: '1rem', opacity: 0.92 }}>
                              {item.texto}
                            </p>
                          )}

                          {renderMediaPropuesta(item)}

                          <div style={{ marginTop: '0.8rem' }}>
                            <small style={{ opacity: 0.6 }}>Propuesto por {item.autor_nombre}</small>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={irSiguiente}
                disabled={indiceSeguro === total - 1}
                aria-label="Premio siguiente"
                style={estiloFlecha(indiceSeguro === total - 1)}
              >
                ›
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // --- SECCIÓN 2: PREMIOS ESPECIALES (CAJAS CLICABLES -> GANADOR + RAZONES) ---
  if (seccionActiva === 'especiales') {
    const especialSeleccionado = resultadosEspeciales.find(
      (item) => item.premio.id === premioEspecialActivoId
    )

    if (!especialSeleccionado) {
      return (
        <div>
          {renderBarraVolver('⭐ Premios Especiales')}

          {resultadosEspeciales.length === 0 ? (
            <p>No hay premios especiales todavía.</p>
          ) : (
            <div style={{ display: 'grid', gap: '1.2rem' }}>
              {resultadosEspeciales.map(({ premio, totalVotos }, idx) => (
                <button
                  key={premio.id}
                  type="button"
                  onClick={() => {
                    setPremioEspecialActivoId(premio.id)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    width: '100%',
                    padding: '1.6rem 1.5rem',
                    borderRadius: 16,
                    border: '2px solid #f5b942',
                    background: 'rgba(245, 185, 66, 0.08)',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div>
                    <small style={{ textTransform: 'uppercase', letterSpacing: 1.1, color: '#f5b942', fontWeight: 'bold' }}>
                      Premio Especial #{idx + 1}
                    </small>
                    <h2 style={{ margin: '0.3rem 0 0.3rem 0', fontSize: '1.5rem' }}>{premio.titulo}</h2>
                    {premio.descripcion && (
                      <p style={{ margin: 0, opacity: 0.8, fontSize: '0.95rem' }}>{premio.descripcion}</p>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.4rem 0.9rem',
                        borderRadius: 20,
                        background: '#f5b942',
                        color: '#1a1a1a',
                        fontWeight: 'bold',
                        fontSize: '0.85rem'
                      }}
                    >
                      Ver ganador →
                    </span>
                    <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', opacity: 0.7 }}>
                      {totalVotos} {totalVotos === 1 ? 'voto' : 'votos'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }

    const { premio, totalVotos, ranking, ganadores, hayEmpate, desempatePorRazones } = especialSeleccionado

    return (
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.8rem',
            marginBottom: '1.8rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid #333'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPremioEspecialActivoId(null)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ← Volver a Premios Especiales
          </button>
          <small style={{ opacity: 0.7 }}>
            {totalVotos} {totalVotos === 1 ? 'voto emitido' : 'votos emitidos'}
          </small>
        </div>

        <section
          style={{
            border: '2px solid #f5b942',
            borderRadius: 18,
            padding: '1.8rem',
            background: 'rgba(245, 185, 66, 0.04)'
          }}
        >
          <div
            style={{
              borderBottom: '1px solid rgba(245, 185, 66, 0.35)',
              paddingBottom: '1rem',
              marginBottom: '1.5rem'
            }}
          >
            <small style={{ textTransform: 'uppercase', letterSpacing: 1.2, color: '#f5b942', fontWeight: 'bold' }}>
              ⭐ Premio Especial
            </small>
            <h2 style={{ margin: '0.3rem 0 0.4rem 0', fontSize: '2rem', lineHeight: 1.15 }}>
              {premio.titulo}
            </h2>
            {premio.descripcion && (
              <p style={{ margin: 0, opacity: 0.8, fontSize: '1rem' }}>{premio.descripcion}</p>
            )}
          </div>

          {ganadores.length === 0 ? (
            <p style={{ opacity: 0.6 }}>Sin votos todavía en este premio.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {desempatePorRazones && !hayEmpate && (
                <p style={{ color: '#4caf50', margin: 0, fontWeight: 'bold', fontSize: '0.95rem' }}>
                  Empate a votos resuelto por mayor número de razones.
                </p>
              )}

              {hayEmpate && (
                <p style={{ color: '#ff9800', margin: 0, fontWeight: 'bold', fontSize: '0.95rem' }}>
                  Empate en votos y en número de razones — todos los ganadores suman +5 pts por ahora.
                </p>
              )}

              {ganadores.map(({ candidato, votos, razones }) => (
                <div key={candidato.id}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      padding: '1.3rem',
                      borderRadius: 14,
                      border: '2px solid #f5b942',
                      background: 'rgba(245, 185, 66, 0.14)',
                      marginBottom: '1.2rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {candidato.foto_url ? (
                        <img
                          src={candidato.foto_url}
                          alt={candidato.nombre}
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '3px solid #f5b942'
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            border: '3px solid #f5b942'
                          }}
                        >
                          {candidato.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div>
                        <small style={{ textTransform: 'uppercase', letterSpacing: 1, color: '#f5b942', fontWeight: 'bold' }}>
                          🏆 Ganador
                        </small>
                        <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.8rem' }}>{candidato.nombre}</h3>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '0.3rem 0.8rem',
                          borderRadius: 16,
                          background: 'rgba(0, 0, 0, 0.35)',
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}
                      >
                        {votos} {votos === 1 ? 'voto' : 'votos'}
                      </span>
                      <span
                        style={{
                          padding: '0.3rem 0.8rem',
                          borderRadius: 16,
                          background: '#f5b942',
                          color: '#1a1a1a',
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}
                      >
                        +5 pts gala
                      </span>
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1.1rem', opacity: 0.9 }}>
                    Razones por las que ganó ({razones.length})
                  </h4>

                  {razones.length === 0 ? (
                    <p style={{ opacity: 0.65, margin: 0 }}>
                      No se subieron razones escritas para {candidato.nombre} en este premio.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {razones.map((r) => (
                        <article
                          key={r.id}
                          style={{
                            border: '1px solid #444',
                            borderRadius: 12,
                            padding: '1.2rem',
                            background: 'rgba(255, 255, 255, 0.02)'
                          }}
                        >
                          <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>{r.titulo}</h5>
                          {r.texto && (
                            <p style={{ margin: '0 0 0.5rem 0', whiteSpace: 'pre-wrap', opacity: 0.92 }}>
                              {r.texto}
                            </p>
                          )}
                          {renderMediaPropuesta(r)}
                          <div style={{ marginTop: '0.7rem' }}>
                            <small style={{ opacity: 0.6 }}>Subido por {r.autor_nombre}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {ranking.length > 1 && (
                <details style={{ marginTop: '0.5rem', opacity: 0.85 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    Ver todos los votos de esta categoría ({ranking.length} candidatos votados)
                  </summary>
                  <ol style={{ margin: '0.6rem 0 0 0', paddingLeft: '1.4rem', display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
                    {ranking.map((r) => (
                      <li key={r.candidato.id}>
                        <strong>{r.candidato.nombre}</strong> — {r.votos} {r.votos === 1 ? 'voto' : 'votos'} · {r.razones.length} {r.razones.length === 1 ? 'razón' : 'razones'}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    )
  }

  // --- SECCIÓN 3: CAMPEÓN DE ORO (TOP 11) ---
  return (
    <div>
      {renderBarraVolver('👑 Campeón de Oro')}

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {top11.map((c, index) => (
          <div
            key={c.id}
            style={{
              border: index === 0 && c.puntosTotales > 0 ? '2px solid #f5b942' : '1px solid #444',
              background: index === 0 && c.puntosTotales > 0 ? 'rgba(245, 185, 66, 0.08)' : 'transparent',
              borderRadius: 12,
              padding: '1rem 1.2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <strong style={{ fontSize: '1.2rem', width: 32 }}>#{index + 1}</strong>
                {c.foto_url ? (
                  <img
                    src={c.foto_url}
                    alt={c.nombre}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: '#333',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}
                  >
                    {c.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
                <strong style={{ fontSize: '1.15rem' }}>{c.nombre}</strong>
              </div>

              <span
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: 16,
                  fontWeight: 'bold',
                  background: c.puntosTotales > 0 ? '#f5b942' : '#333',
                  color: c.puntosTotales > 0 ? '#1a1a1a' : '#aaa'
                }}
              >
                {c.puntosTotales} pts
              </span>
            </div>

            {c.desglose.length > 0 && (
              <ul style={{ margin: '0.7rem 0 0 0', paddingLeft: '1.6rem', fontSize: '0.88rem', opacity: 0.85 }}>
                {c.desglose.map((d, i) => (
                  <li key={i}>
                    <strong>+{d.puntos} pts</strong> — {d.premio} ({d.detalle})
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}