import { useEffect, useState } from 'react'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

const PUNTOS_PODIO = { 1: 3, 2: 2, 3: 1 }
const MEDALLA_INFO = {
  1: { icono: '🥇', nombre: 'ORO', color: '#f5b942', bg: 'rgba(245, 185, 66, 0.10)' },
  2: { icono: '🥈', nombre: 'PLATA', color: '#c0c0c0', bg: 'rgba(192, 192, 192, 0.08)' },
  3: { icono: '🥉', nombre: 'BRONCE', color: '#cd7f32', bg: 'rgba(205, 127, 50, 0.08)' }
}

const FRASES_DISCURSO = [
  'Ha sido un año muy largo...',
  'Lleno de momentazos, vergüenzas ajenas y leyendas del grupo...',
  'Esta noche ha habido muchos ganadores...',
  'Pero solo uno puede coronarse como el Campeón de Oro.',
  'Los dos candidatos con más puntos de toda la gala son...'
]

const CONFETI_PIEZAS = Array.from({ length: 42 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  delay: `${((i * 19) % 25) / 10}s`,
  duration: `${2.6 + ((i * 13) % 20) / 10}s`,
  color: ['#ffd700', '#ff6b6b', '#646cff', '#4caf50', '#ff9800', '#ffffff'][i % 6],
  size: 8 + (i % 6)
}))

const esUrlAudio = (url = '') => /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(url)

const ESTILOS_ANIMACIONES = `
@keyframes galaFadeUp {
  0% { opacity: 0; transform: translateY(24px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes galaZoomIn {
  0% { opacity: 0; transform: scale(0.6); }
  70% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes galaPulsoOro {
  0%, 100% { box-shadow: 0 0 18px rgba(255, 215, 0, 0.35); }
  50% { box-shadow: 0 0 42px rgba(255, 215, 0, 0.85); }
}
@keyframes galaConfeti {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
}
@keyframes galaLatido {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
`

export default function Resultados({ session, mostrarMedia = false }) {
  const [seccionActiva, setSeccionActiva] = useState(null) // null | 'normales' | 'especiales' | 'campeon'
  const [premioEspecialActivoId, setPremioEspecialActivoId] = useState(null)
  const [indiceNormalActivo, setIndiceNormalActivo] = useState(0)
  const [revelados, setRevelados] = useState({})
  const [mediaDestapados, setMediaDestapados] = useState({})

  // Estados de la ceremonia del Campeón de Oro
  const [pasoCeremonia, setPasoCeremonia] = useState('intro') // 'intro' | 'discurso' | 'finalistas' | 'suspense' | 'ganador' | 'tabla'
  const [indiceFrase, setIndiceFrase] = useState(0)
  const [finalistasDesordenados, setFinalistasDesordenados] = useState([])
  const [cuentaAtras, setCuentaAtras] = useState(3)
  const [focoSuspense, setFocoSuspense] = useState(0)

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

      // Mapa de puntuación y criterios de desempate por candidato
      const puntosPorCandidato = {}
      candidatos.forEach((c) => {
        puntosPorCandidato[c.id] = {
          ...c,
          puntosTotales: 0,
          especialesGanados: 0,
          oros: 0,
          platas: 0,
          nominaciones: 0,
          desglose: [],
          especialesDestacados: [],
          propuestasDestacadas: []
        }
      })

      // Contar nominaciones totales en premios normales (criterio e de desempate)
      propuestas.forEach((pr) => {
        if (!pr.candidato_especial_id && pr.propuesta_candidatos) {
          pr.propuesta_candidatos.forEach((pc) => {
            const cid = pc.candidato_id || pc.candidatos?.id
            if (cid && puntosPorCandidato[cid]) {
              puntosPorCandidato[cid].nominaciones += 1
            }
          })
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
            const entry = puntosPorCandidato[g.candidato.id]
            if (entry) {
              entry.puntosTotales += 5
              entry.especialesGanados += 1
              entry.desglose.push({
                premio: premio.titulo,
                detalle: 'Ganador Premio Especial',
                puntos: 5
              })
              entry.especialesDestacados.push({
                premioTitulo: premio.titulo,
                votos: g.votos,
                razones: g.razones
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
              const entry = puntosPorCandidato[nom.id]
              if (entry) {
                entry.puntosTotales += puntosGala
                if (posicion === 1) entry.oros += 1
                if (posicion === 2) entry.platas += 1
                entry.desglose.push({
                  premio: premio.titulo,
                  detalle: `${MEDALLA_INFO[posicion].icono} ${actual.titulo}`,
                  puntos: puntosGala
                })
                entry.propuestasDestacadas.push({
                  ...actual,
                  premioTitulo: premio.titulo,
                  posicion,
                  puntosGala
                })
              }
            })
          }

          return { premio, top3 }
        })

      // --- 3. TOP 11 GENERAL CON TUS 5 CRITERIOS DE DESEMPATE ---
      // a) Más puntos | b) Más especiales | c) Más oros | d) Más platas | e) Más nominaciones
      const rankingFinal = Object.values(puntosPorCandidato)
        .map((c) => ({
          ...c,
          propuestasDestacadas: [...c.propuestasDestacadas].sort(
            (a, b) => a.posicion - b.posicion || b.puntosVotacion - a.puntosVotacion
          )
        }))
        .sort(
          (a, b) =>
            b.puntosTotales - a.puntosTotales ||
            b.especialesGanados - a.especialesGanados ||
            b.oros - a.oros ||
            b.platas - a.platas ||
            b.nominaciones - a.nominaciones ||
            a.nombre.localeCompare(b.nombre)
        )

      setResultadosEspeciales(resEspCalculados)
      setResultadosNormales(resNormCalculados)
      setTop11(rankingFinal)
      setCargando(false)
    }

    calcularResultados()
  }, [esAdmin])

  // Pasar de diapositiva con flechas del teclado en Premios Normales
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

  // Animación automática del discurso inicial en Campeón de Oro
  useEffect(() => {
    if (seccionActiva !== 'campeon' || pasoCeremonia !== 'discurso') return

    const timer = setTimeout(() => {
      if (indiceFrase < FRASES_DISCURSO.length - 1) {
        setIndiceFrase((prev) => prev + 1)
      } else {
        setPasoCeremonia('finalistas')
      }
    }, 3400)

    return () => clearTimeout(timer)
  }, [seccionActiva, pasoCeremonia, indiceFrase])

  // Permitir avanzar con Barra Espaciadora cuando los 2 finalistas están de pie
  useEffect(() => {
    if (seccionActiva !== 'campeon' || pasoCeremonia !== 'finalistas') return

    const manejarEspacio = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setCuentaAtras(3)
        setPasoCeremonia('suspense')
      }
    }

    window.addEventListener('keydown', manejarEspacio)
    return () => window.removeEventListener('keydown', manejarEspacio)
  }, [seccionActiva, pasoCeremonia])

  // Cuenta atrás y efecto de foco en el suspense
  useEffect(() => {
    if (seccionActiva !== 'campeon' || pasoCeremonia !== 'suspense') return

    const focoInterval = setInterval(() => {
      setFocoSuspense((prev) => (prev === 0 ? 1 : 0))
    }, 240)

    const timer = setTimeout(() => {
      if (cuentaAtras > 1) {
        setCuentaAtras((prev) => prev - 1)
      } else {
        setPasoCeremonia('ganador')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 1150)

    return () => {
      clearInterval(focoInterval)
      clearTimeout(timer)
    }
  }, [seccionActiva, pasoCeremonia, cuentaAtras])

  const iniciarEntregaCampeon = () => {
    const dosPrimeros = top11.slice(0, 2)
    const mezclados =
      dosPrimeros.length === 2 && Math.random() < 0.5
        ? [dosPrimeros[1], dosPrimeros[0]]
        : dosPrimeros
    setFinalistasDesordenados(mezclados)
    setIndiceFrase(0)
    setPasoCeremonia('discurso')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderAvatar = (candidato, size = 80, borde = '3px solid #f5b942') => {
    if (candidato.foto_url) {
      return (
        <img
          src={candidato.foto_url}
          alt={candidato.nombre}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            border: borde,
            flexShrink: 0
          }}
        />
      )
    }
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          fontWeight: 'bold',
          border: borde,
          flexShrink: 0
        }}
      >
        {candidato.nombre.charAt(0).toUpperCase()}
      </div>
    )
  }

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
          setPasoCeremonia('intro')
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
        id: 'especiales',
        icono: '⭐',
        titulo: 'Premios Especiales',
        subtitulo: `${resultadosEspeciales.length} premios — Cajas cerradas con ganador y razones`,
        borde: '#f5b942',
        bg: 'rgba(245, 185, 66, 0.10)'
      },
      {
        id: 'normales',
        icono: '🏆',
        titulo: 'Premios Normales',
        subtitulo: `${resultadosNormales.length} categorías — Slideshow Top 3 con revelación al clic`,
        borde: '#646cff',
        bg: 'rgba(100, 108, 255, 0.10)'
      },
      {
        id: 'campeon',
        icono: '👑',
        titulo: 'Campeón de Oro',
        subtitulo: 'Entrega final automática — Sin spoilers',
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
                setPasoCeremonia('intro')
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

  // --- SECCIÓN 1: PREMIOS NORMALES (SLIDESHOW + REVELAR AL CLIC, SIN MOSTRAR PUNTOS DE GALA) ---
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
                            padding: '1.4rem',
                            animation: 'galaFadeUp 0.45s ease-out'
                          }}
                        >
                          <style>{ESTILOS_ANIMACIONES}</style>
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

  // --- SECCIÓN 2: PREMIOS ESPECIALES (CAJAS CLICABLES -> GANADOR + RAZONES, SIN MOSTRAR +5 PTS) ---
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
        <style>{ESTILOS_ANIMACIONES}</style>
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
            background: 'rgba(245, 185, 66, 0.04)',
            animation: 'galaFadeUp 0.45s ease-out'
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
                  Empate en votos y en número de razones.
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
                      {renderAvatar(candidato, 80, '3px solid #f5b942')}
                      <div>
                        <small style={{ textTransform: 'uppercase', letterSpacing: 1, color: '#f5b942', fontWeight: 'bold' }}>
                          🏆 Ganador
                        </small>
                        <h3 style={{ margin: '0.15rem 0 0 0', fontSize: '1.8rem' }}>{candidato.nombre}</h3>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: '0.35rem 0.9rem',
                        borderRadius: 16,
                        background: 'rgba(0, 0, 0, 0.35)',
                        fontWeight: 'bold',
                        fontSize: '0.95rem'
                      }}
                    >
                      {votos} {votos === 1 ? 'voto' : 'votos'}
                    </span>
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

  // --- SECCIÓN 3: CEREMONIA CAMPEÓN DE ORO ---
  const campeon = top11[0]

  return (
    <div>
      <style>{ESTILOS_ANIMACIONES}</style>
      {renderBarraVolver('👑 Campeón de Oro')}

      {/* PASO 0: PANTALLA INICIAL SIN SPOILERS */}
      {pasoCeremonia === 'intro' && (
        <div
          style={{
            minHeight: '62vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2.5rem 1.5rem',
            borderRadius: 20,
            border: '2px solid #ffd700',
            background: 'radial-gradient(circle at top, rgba(255, 215, 0, 0.16), rgba(0, 0, 0, 0.45))',
            animation: 'galaFadeUp 0.6s ease-out'
          }}
        >
          <div style={{ fontSize: '4.2rem', marginBottom: '0.8rem' }}>👑</div>
          <h2 style={{ margin: '0 0 0.8rem 0', fontSize: '2.4rem', color: '#ffd700' }}>
            Gran Entrega: Campeón de Oro
          </h2>
          <p style={{ maxWidth: 520, margin: '0 0 2.2rem 0', fontSize: '1.1rem', opacity: 0.88 }}>
            Todos los votos han sido contabilizados. A partir de aquí la página toma el control y
            ni el presentador sabe quién ha ganado.
          </p>

          {top11.length === 0 || campeon.puntosTotales === 0 ? (
            <p style={{ color: '#ff9800', fontWeight: 'bold' }}>
              Todavía no hay puntos registrados para iniciar la entrega.
            </p>
          ) : (
            <button
              type="button"
              onClick={iniciarEntregaCampeon}
              style={{
                padding: '1.1rem 2.6rem',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #ffd700, #f5a623)',
                color: '#1a1a1a',
                cursor: 'pointer',
                animation: 'galaPulsoOro 2.2s infinite'
              }}
            >
              Comenzar entrega
            </button>
          )}
        </div>
      )}

      {/* PASO 1: DISCURSO AUTOMÁTICO CON ANIMACIÓN */}
      {pasoCeremonia === 'discurso' && (
        <div
          style={{
            minHeight: '62vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '3rem 1.8rem',
            borderRadius: 20,
            border: '2px solid rgba(255, 215, 0, 0.5)',
            background: 'radial-gradient(circle at center, rgba(255, 215, 0, 0.12), rgba(0, 0, 0, 0.5))'
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1.2rem', opacity: 0.9 }}>✨</div>
          <h2
            key={indiceFrase}
            style={{
              margin: 0,
              maxWidth: 640,
              fontSize: '2.1rem',
              lineHeight: 1.35,
              color: '#fff',
              animation: 'galaFadeUp 0.9s ease-out'
            }}
          >
            {FRASES_DISCURSO[indiceFrase]}
          </h2>

          <button
            type="button"
            onClick={() => setPasoCeremonia('finalistas')}
            style={{
              marginTop: '3rem',
              background: 'transparent',
              border: '1px solid #555',
              color: '#aaa',
              padding: '0.4rem 0.9rem',
              borderRadius: 8,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Saltar intro →
          </button>
        </div>
      )}

      {/* PASO 2: LOS 2 FINALISTAS (DESORDENADOS) + PAUSA PARA QUE SALGAN AL FRENTE */}
      {pasoCeremonia === 'finalistas' && (
        <div
          style={{
            padding: '2.4rem 1.6rem',
            borderRadius: 20,
            border: '2px solid #ffd700',
            background: 'radial-gradient(circle at top, rgba(255, 215, 0, 0.14), rgba(0, 0, 0, 0.45))',
            textAlign: 'center',
            animation: 'galaFadeUp 0.7s ease-out'
          }}
        >
          <small style={{ textTransform: 'uppercase', letterSpacing: 2, color: '#ffd700', fontWeight: 'bold' }}>
            Los dos finalistas al Campeón de Oro
          </small>
          <h2 style={{ margin: '0.6rem 0 2rem 0', fontSize: '2rem' }}>
            ¡Poneos de pie y salid al frente!
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '1.5rem',
              maxWidth: 620,
              margin: '0 auto 2.4rem auto'
            }}
          >
            {finalistasDesordenados.map((f, idx) => (
              <div
                key={f.id}
                style={{
                  padding: '2rem 1.4rem',
                  borderRadius: 18,
                  border: '2px solid #ffd700',
                  background: 'rgba(255, 215, 0, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem',
                  animation: `galaZoomIn ${0.6 + idx * 0.25}s ease-out`
                }}
              >
                {renderAvatar(f, 130, '4px solid #ffd700')}
                <h3 style={{ margin: 0, fontSize: '1.8rem' }}>{f.nombre}</h3>
                <span style={{ fontSize: '0.9rem', opacity: 0.75 }}>Finalista</span>
              </div>
            ))}
          </div>

          <p style={{ margin: '0 0 1.4rem 0', opacity: 0.75, fontSize: '0.95rem' }}>
            Cuando los dos estén al frente, que alguien pulse el botón (o la barra espaciadora):
          </p>

          <button
            type="button"
            onClick={() => {
              setCuentaAtras(3)
              setPasoCeremonia('suspense')
            }}
            style={{
              padding: '1rem 2.4rem',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              borderRadius: 999,
              border: 'none',
              background: 'linear-gradient(135deg, #ffd700, #f5a623)',
              color: '#1a1a1a',
              cursor: 'pointer',
              animation: 'galaPulsoOro 2s infinite'
            }}
          >
            🥁 Anunciar al Campeón de Oro
          </button>
        </div>
      )}

      {/* PASO 3: SUSPENSE 3... 2... 1... CON FOCO ALTERNANDO */}
      {pasoCeremonia === 'suspense' && (
        <div
          style={{
            minHeight: '62vh',
            padding: '2.5rem 1.5rem',
            borderRadius: 20,
            border: '2px solid #ffd700',
            background: 'radial-gradient(circle at center, rgba(255, 215, 0, 0.16), rgba(0, 0, 0, 0.6))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center'
          }}
        >
          <small style={{ textTransform: 'uppercase', letterSpacing: 2.5, color: '#ffd700', fontWeight: 'bold' }}>
            El Campeón de Oro es...
          </small>

          <div
            key={cuentaAtras}
            style={{
              fontSize: '5rem',
              fontWeight: 'bold',
              color: '#ffd700',
              margin: '1rem 0 2rem 0',
              animation: 'galaLatido 0.9s ease-in-out'
            }}
          >
            {cuentaAtras}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '2rem'
            }}
          >
            {finalistasDesordenados.map((f, idx) => {
              const iluminado = focoSuspense === idx
              return (
                <div
                  key={f.id}
                  style={{
                    padding: '1.4rem 1.8rem',
                    borderRadius: 16,
                    border: iluminado ? '3px solid #ffd700' : '2px solid #444',
                    background: iluminado ? 'rgba(255, 215, 0, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                    transform: iluminado ? 'scale(1.08)' : 'scale(0.94)',
                    opacity: iluminado ? 1 : 0.45,
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.8rem',
                    minWidth: 180
                  }}
                >
                  {renderAvatar(f, 100, iluminado ? '4px solid #ffd700' : '2px solid #555')}
                  <strong style={{ fontSize: '1.4rem' }}>{f.nombre}</strong>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PASO 4: GANADOR + CONFETI + RAZONES Y PROPUESTAS MÁS VOTADAS */}
      {pasoCeremonia === 'ganador' && campeon && (
        <div style={{ position: 'relative' }}>
          {/* Lluvia de confeti CSS */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
              zIndex: 50
            }}
          >
            {CONFETI_PIEZAS.map((p) => (
              <span
                key={p.id}
                style={{
                  position: 'absolute',
                  top: '-5vh',
                  left: p.left,
                  width: p.size,
                  height: p.size * 1.4,
                  background: p.color,
                  borderRadius: 2,
                  animation: `galaConfeti ${p.duration} linear ${p.delay} 2 forwards`
                }}
              />
            ))}
          </div>

          {/* Tarjeta principal del Campeón */}
          <section
            style={{
              padding: '2.6rem 1.8rem',
              borderRadius: 22,
              border: '3px solid #ffd700',
              background: 'radial-gradient(circle at top, rgba(255, 215, 0, 0.25), rgba(0, 0, 0, 0.45))',
              textAlign: 'center',
              marginBottom: '2.2rem',
              animation: 'galaZoomIn 0.75s ease-out',
              boxShadow: '0 0 40px rgba(255, 215, 0, 0.28)'
            }}
          >
            <div style={{ fontSize: '3.6rem', lineHeight: 1, marginBottom: '0.6rem' }}>👑</div>
            <small style={{ textTransform: 'uppercase', letterSpacing: 2.5, color: '#ffd700', fontWeight: 'bold' }}>
              Campeón de Oro de la Gala
            </small>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '1.4rem 0' }}>
              {renderAvatar(campeon, 165, '5px solid #ffd700')}
            </div>

            <h2 style={{ margin: '0 0 0.7rem 0', fontSize: '2.8rem', color: '#ffd700' }}>
              {campeon.nombre}
            </h2>

            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
              <span
                style={{
                  padding: '0.4rem 1.1rem',
                  borderRadius: 20,
                  background: '#ffd700',
                  color: '#1a1a1a',
                  fontWeight: 'bold',
                  fontSize: '1.1rem'
                }}
              >
                {campeon.puntosTotales} puntos totales
              </span>
              {campeon.especialesGanados > 0 && (
                <span style={{ padding: '0.4rem 0.9rem', borderRadius: 20, background: '#333', fontSize: '0.95rem' }}>
                  ⭐ {campeon.especialesGanados} {campeon.especialesGanados === 1 ? 'especial' : 'especiales'}
                </span>
              )}
              {campeon.oros > 0 && (
                <span style={{ padding: '0.4rem 0.9rem', borderRadius: 20, background: '#333', fontSize: '0.95rem' }}>
                  🥇 {campeon.oros} {campeon.oros === 1 ? 'oro' : 'oros'}
                </span>
              )}
              {campeon.platas > 0 && (
                <span style={{ padding: '0.4rem 0.9rem', borderRadius: 20, background: '#333', fontSize: '0.95rem' }}>
                  🥈 {campeon.platas} {campeon.platas === 1 ? 'plata' : 'platas'}
                </span>
              )}
            </div>
          </section>

          {/* Premios Especiales ganados y sus razones */}
          {campeon.especialesDestacados.length > 0 && (
            <section style={{ marginBottom: '2.2rem', animation: 'galaFadeUp 0.8s ease-out' }}>
              <h3 style={{ color: '#ffd700', fontSize: '1.4rem', marginBottom: '1rem' }}>
                ⭐ Premios Especiales ganados por {campeon.nombre}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {campeon.especialesDestacados.map((esp, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #f5b942',
                      borderRadius: 14,
                      padding: '1.2rem',
                      background: 'rgba(245, 185, 66, 0.06)'
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1.25rem', color: '#f5b942' }}>
                      🏆 {esp.premioTitulo} ({esp.votos} {esp.votos === 1 ? 'voto' : 'votos'})
                    </h4>
                    {esp.razones.length === 0 ? (
                      <p style={{ margin: 0, opacity: 0.7 }}>Sin razones escritas.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {esp.razones.map((r) => (
                          <article
                            key={r.id}
                            style={{
                              border: '1px solid #444',
                              borderRadius: 10,
                              padding: '1rem',
                              background: 'rgba(0,0,0,0.22)'
                            }}
                          >
                            <strong style={{ display: 'block', marginBottom: '0.35rem', fontSize: '1.05rem' }}>
                              {r.titulo}
                            </strong>
                            {r.texto && <p style={{ margin: '0 0 0.4rem 0', whiteSpace: 'pre-wrap' }}>{r.texto}</p>}
                            {renderMediaPropuesta(r)}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Propuestas más votadas del Campeón */}
          {campeon.propuestasDestacadas.length > 0 && (
            <section style={{ marginBottom: '2.5rem', animation: 'galaFadeUp 0.9s ease-out' }}>
              <h3 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>
                🏆 Sus propuestas más votadas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                {campeon.propuestasDestacadas.map((prop, i) => {
                  const med = MEDALLA_INFO[prop.posicion] || MEDALLA_INFO[3]
                  return (
                    <article
                      key={`${prop.id}-${i}`}
                      style={{
                        border: `2px solid ${med.color}`,
                        background: med.bg,
                        borderRadius: 14,
                        padding: '1.2rem'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          marginBottom: '0.5rem'
                        }}
                      >
                        <span style={{ fontWeight: 'bold', color: med.color }}>
                          {med.icono} {prop.premioTitulo}
                        </span>
                        <small style={{ opacity: 0.8 }}>{prop.puntosVotacion} pts de votación</small>
                      </div>
                      <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '1.2rem' }}>{prop.titulo}</h4>
                      {prop.texto && <p style={{ margin: '0 0 0.4rem 0', whiteSpace: 'pre-wrap' }}>{prop.texto}</p>}
                      {renderMediaPropuesta(prop)}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {/* Botón para ver la tabla completa */}
          <div style={{ textAlign: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => {
                setPasoCeremonia('tabla')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              style={{
                padding: '1rem 2.2rem',
                fontSize: '1.15rem',
                fontWeight: 'bold',
                borderRadius: 12,
                border: '2px solid #ffd700',
                background: 'rgba(255, 215, 0, 0.14)',
                color: '#ffd700',
                cursor: 'pointer'
              }}
            >
              📊 Ver clasificación completa (Top 11)
            </button>
          </div>
        </div>
      )}

      {/* PASO 5: TABLA COMPLETA DEL TOP 11 */}
      {pasoCeremonia === 'tabla' && (
        <div style={{ animation: 'galaFadeUp 0.5s ease-out' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.8rem',
              marginBottom: '1.4rem'
            }}
          >
            <h2 style={{ margin: 0, color: '#ffd700' }}>Clasificación Completa — Top 11</h2>
            <button
              type="button"
              onClick={() => {
                setPasoCeremonia('ganador')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              style={{ padding: '0.45rem 0.9rem', borderRadius: 8, cursor: 'pointer' }}
            >
              ← Volver al Campeón
            </button>
          </div>

          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {top11.map((c, index) => (
              <div
                key={c.id}
                style={{
                  border: index === 0 && c.puntosTotales > 0 ? '2px solid #ffd700' : '1px solid #444',
                  background: index === 0 && c.puntosTotales > 0 ? 'rgba(255, 215, 0, 0.10)' : 'transparent',
                  borderRadius: 12,
                  padding: '1rem 1.2rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <strong style={{ fontSize: '1.2rem', width: 34 }}>
                      {index === 0 ? '👑' : `#${index + 1}`}
                    </strong>
                    {renderAvatar(c, 48, index === 0 ? '2px solid #ffd700' : '1px solid #555')}
                    <div>
                      <strong style={{ fontSize: '1.15rem', display: 'block' }}>{c.nombre}</strong>
                      <small style={{ opacity: 0.7 }}>
                        ⭐ {c.especialesGanados} esp · 🥇 {c.oros} oros · 🥈 {c.platas} platas · 📋 {c.nominaciones} nom
                      </small>
                    </div>
                  </div>

                  <span
                    style={{
                      padding: '0.35rem 0.9rem',
                      borderRadius: 16,
                      fontWeight: 'bold',
                      background: c.puntosTotales > 0 ? '#ffd700' : '#333',
                      color: c.puntosTotales > 0 ? '#1a1a1a' : '#aaa'
                    }}
                  >
                    {c.puntosTotales} pts
                  </span>
                </div>

                {c.desglose.length > 0 && (
                  <details style={{ marginTop: '0.7rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', opacity: 0.8 }}>
                      Ver desglose de puntos ({c.desglose.length})
                    </summary>
                    <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.88rem', opacity: 0.85 }}>
                      {c.desglose.map((d, i) => (
                        <li key={i}>
                          <strong>+{d.puntos} pts</strong> — {d.premio} ({d.detalle})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}