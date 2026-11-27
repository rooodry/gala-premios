import { useEffect, useState } from 'react'
import { supabase, ADMIN_EMAIL } from './supabaseClient'

const PUNTOS_PODIO = { 1: 3, 2: 2, 3: 1 }
const MEDALLA_ICONO = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function Resultados({ session }) {
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

      const [resCand, resPrem, resProp, resVotosNorm, resVotosEsp] = await Promise.all([
        supabase.from('candidatos').select('id, nombre, foto_url').order('nombre'),
        supabase.from('premios').select('id, titulo, tipo').order('created_at', { ascending: false }),
        supabase
          .from('propuestas')
          .select('id, premio_id, titulo, propuesta_candidatos(candidato_id, candidatos(id, nombre))'),
        supabase.from('votos_normales').select('premio_id, propuesta_id, usuario_id, puntos'),
        supabase.from('votos_especiales').select('premio_id, candidato_id, usuario_id')
      ])

      if (resCand.error || resPrem.error || resProp.error || resVotosNorm.error || resVotosEsp.error) {
        setError('Error al cargar los datos del recuento.')
        setCargando(false)
        return
      }

      const candidatos = resCand.data || []
      const premios = resPrem.data || []
      const propuestas = resProp.data || []
      const votosNormales = resVotosNorm.data || []
      const votosEspeciales = resVotosEsp.data || []

      // Contar usuarios únicos que han emitido al menos un voto
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

      // --- 1. PREMIOS ESPECIALES (+5 pts al ganador / empatados en 1º puesto) ---
      const resEspCalculados = premios
        .filter((p) => p.tipo === 'especial')
        .map((premio) => {
          const votosPremio = votosEspeciales.filter((v) => v.premio_id === premio.id)
          const conteo = {}
          votosPremio.forEach((v) => {
            conteo[v.candidato_id] = (conteo[v.candidato_id] || 0) + 1
          })

          const ranking = Object.entries(conteo)
            .map(([candidatoId, votos]) => ({
              candidato: candidatos.find((c) => c.id === candidatoId),
              votos
            }))
            .filter((item) => item.candidato)
            .sort((a, b) => b.votos - a.votos)

          const maxVotos = ranking.length > 0 ? ranking[0].votos : 0
          const ganadores = ranking.filter((r) => r.votos === maxVotos && maxVotos > 0)

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
            hayEmpate: ganadores.length > 1
          }
        })

      // --- 2. PREMIOS NORMALES (Top 3 propuestas -> +3, +2, +1 a sus nominados) ---
      const resNormCalculados = premios
        .filter((p) => p.tipo !== 'especial')
        .map((premio) => {
          const votosPremio = votosNormales.filter((v) => v.premio_id === premio.id)
          const propsPremio = propuestas.filter((pr) => pr.premio_id === premio.id)

          // Sumar puntos de votación a cada propuesta
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

          // Asignar posición (1, 2, 3) respetando empates (ej: 1, 1, 3)
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

            // Sumar puntos a TODOS los candidatos nominados en esa propuesta
            actual.nominados.forEach((nom) => {
              if (puntosPorCandidato[nom.id]) {
                puntosPorCandidato[nom.id].puntosTotales += puntosGala
                puntosPorCandidato[nom.id].desglose.push({
                  premio: premio.titulo,
                  detalle: `${MEDALLA_ICONO[posicion]} ${actual.titulo}`,
                  puntos: puntosGala
                })
              }
            })
          }

          return {
            premio,
            top3
          }
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

  if (!esAdmin) {
    return <p>Esta sección solo está disponible para el administrador.</p>
  }

  if (cargando) return <p>Calculando resultados...</p>
  if (error) return <p style={{ color: '#ff6b6b' }}>{error}</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Recuento de la Gala (Admin)</h1>
        <span style={{ padding: '0.35rem 0.8rem', borderRadius: 20, background: '#333', fontSize: '0.9rem' }}>
          Participación: <strong>{totalVotantes}</strong> {totalVotantes === 1 ? 'votante' : 'votantes'}
        </span>
      </div>

      {/* TOP 11 GENERAL */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ color: '#f5b942', marginTop: 0 }}>Top 11 — Campeón de la Gala</h2>
        <div style={{ display: 'grid', gap: '0.8rem' }}>
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
                  <strong style={{ fontSize: '1.2rem', width: 28 }}>#{index + 1}</strong>
                  {c.foto_url ? (
                    <img
                      src={c.foto_url}
                      alt={c.nombre}
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
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
                  <strong style={{ fontSize: '1.1rem' }}>{c.nombre}</strong>
                </div>

                <span
                  style={{
                    padding: '0.3rem 0.8rem',
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
                <ul style={{ margin: '0.7rem 0 0 0', paddingLeft: '1.5rem', fontSize: '0.85rem', opacity: 0.85 }}>
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
      </section>

      {/* PREMIOS ESPECIALES */}
      {resultadosEspeciales.length > 0 && (
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ color: '#f5b942' }}>Resultados — Premios Especiales (+5 pts)</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {resultadosEspeciales.map(({ premio, totalVotos, ranking, hayEmpate }) => (
              <div key={premio.id} style={{ border: '1px solid #f5b942', borderRadius: 12, padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h3 style={{ margin: 0 }}>{premio.titulo}</h3>
                  <small style={{ opacity: 0.7 }}>{totalVotos} votos</small>
                </div>

                {hayEmpate && (
                  <p style={{ color: '#ff9800', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                    Hay empate en el 1º puesto (ambos suman +5 pts).
                  </p>
                )}

                {ranking.length === 0 ? (
                  <p style={{ margin: 0, opacity: 0.6 }}>Sin votos todavía.</p>
                ) : (
                  <ol style={{ margin: 0, paddingLeft: '1.3rem', display: 'grid', gap: '0.3rem' }}>
                    {ranking.map((r, i) => (
                      <li key={r.candidato.id}>
                        <strong>{r.candidato.nombre}</strong> — {r.votos} {r.votos === 1 ? 'voto' : 'votos'}
                        {r.votos === ranking[0].votos ? ' 🏆 (+5 pts)' : ''}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PREMIOS NORMALES */}
      <section>
        <h2>Resultados — Premios Normales (Top 3)</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {resultadosNormales.map(({ premio, top3 }) => (
            <div key={premio.id} style={{ border: '1px solid #444', borderRadius: 12, padding: '1rem 1.2rem' }}>
              <h3 style={{ margin: '0 0 0.6rem 0' }}>{premio.titulo}</h3>
              {top3.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.6 }}>Sin votos todavía.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.45rem' }}>
                  {top3.map((item) => (
                    <div key={item.id} style={{ fontSize: '0.95rem' }}>
                      <strong>
                        {MEDALLA_ICONO[item.posicion]} {item.titulo}
                      </strong>{' '}
                      <span style={{ opacity: 0.75 }}>({item.puntosVotacion} pts de votación)</span>
                      {item.nominados.length > 0 && (
                        <span style={{ color: '#8c92ff', marginLeft: '0.4rem', fontSize: '0.85rem' }}>
                          → +{item.puntosGala} pts para {item.nominados.map((n) => n.nombre).join(', ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}