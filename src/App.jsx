import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL } from './supabaseClient'
import Auth from './Auth'
import Home from './Home'
import PremioDetalle from './PremioDetalle'
import Candidatos from './Candidatos'
import Resultados from './Resultados'

export default function App() {
  const [session, setSession] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [fase, setFase] = useState('propuestas')
  const [configId, setConfigId] = useState(null)
  const [mostrarMedia, setMostrarMedia] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCargandoSesion(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Cargar la fase actual desde configuracion
  useEffect(() => {
    if (!session) return
    supabase
      .from('configuracion')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setFase(data.fase)
          setConfigId(data.id)
        }
      })
  }, [session])

  const cambiarFase = async (nuevaFase) => {
    if (!configId) return
    const { error } = await supabase
      .from('configuracion')
      .update({ fase: nuevaFase })
      .eq('id', configId)

    if (error) {
      alert('Error al cambiar de fase: ' + error.message)
    } else {
      setFase(nuevaFase)
    }
  }

  if (cargandoSesion) {
    return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Cargando...</p>
  }

  if (!session) {
    return <Auth />
  }

  const nombreUsuario =
    session.user.user_metadata?.nombre ||
    session.user.user_metadata?.full_name ||
    session.user.email.split('@')[0]

  const esAdmin = session.user.email === ADMIN_EMAIL

  return (
    <BrowserRouter>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          padding: '1rem',
          borderBottom: '1px solid #333'
        }}
      >
        <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontWeight: 'bold', textDecoration: 'none' }}>Premios</Link>
        <Link to="/candidatos" style={{ fontWeight: 'bold', textDecoration: 'none' }}>Candidatos</Link>
        {esAdmin && (
          <Link to="/resultados" style={{ fontWeight: 'bold', textDecoration: 'none', color: '#f5b942' }}>
            Resultados
          </Link>
        )}
        </nav>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {esAdmin && (
            <>
              <select
                value={fase}
                onChange={(e) => cambiarFase(e.target.value)}
                style={{ padding: '0.35rem 0.6rem', borderRadius: 6, fontWeight: 'bold' }}
              >
                <option value="propuestas">Fase: Propuestas</option>
                <option value="votaciones">Fase: Votaciones</option>
                <option value="cerrado">Fase: Cerrado</option>
              </select>

              <button
                type="button"
                onClick={() => setMostrarMedia((prev) => !prev)}
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Media: {mostrarMedia ? 'Visible' : 'Oculto'}
              </button>
            </>
          )}

          <span>Hola, <strong>{nombreUsuario}</strong></span>
          <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<Home session={session} fase={fase} />} />
          <Route
            path="/premio/:id"
            element={<PremioDetalle session={session} mostrarMedia={mostrarMedia} fase={fase} />}
          />
          <Route path="/candidatos" element={<Candidatos />} />
          <Route
          path="/resultados"
          element={<Resultados session={session} mostrarMedia={mostrarMedia} />}
          />
        </Routes>
      </main>
    </BrowserRouter>
  )
}