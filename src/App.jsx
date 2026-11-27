import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase, ADMIN_EMAIL } from './supabaseClient'
import Auth from './Auth'
import Home from './Home'
import PremioDetalle from './PremioDetalle'
import Candidatos from './Candidatos'

export default function App() {
  const [session, setSession] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [mostrarMedia, setMostrarMedia] = useState(true)
  const [actualizandoMedia, setActualizandoMedia] = useState(false)

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

  // Cargar configuración global cuando hay sesión
  useEffect(() => {
    if (!session) return

    const cargarConfig = async () => {
      const { data } = await supabase
        .from('configuracion')
        .select('mostrar_media')
        .eq('id', 1)
        .single()

      if (data) setMostrarMedia(data.mostrar_media)
    }

    cargarConfig()
  }, [session])

  const alternarMostrarMedia = async () => {
    setActualizandoMedia(true)
    const nuevoValor = !mostrarMedia

    const { error } = await supabase
      .from('configuracion')
      .update({ mostrar_media: nuevoValor })
      .eq('id', 1)

    if (error) {
      alert('No se pudo cambiar la configuración: ' + error.message)
    } else {
      setMostrarMedia(nuevoValor)
    }
    setActualizandoMedia(false)
  }

  if (cargandoSesion) {
    return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Cargando...</p>
  }

  if (!session) {
    return <Auth />
  }

  const esAdmin = session.user.email === ADMIN_EMAIL
  const nombreUsuario = session.user.user_metadata?.nombre || session.user.email

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
        <nav style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
          <Link to="/" style={{ fontWeight: 'bold', textDecoration: 'none' }}>
            Premios
          </Link>
          <Link to="/candidatos" style={{ fontWeight: 'bold', textDecoration: 'none' }}>
            Candidatos
          </Link>
        </nav>

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {esAdmin && (
            <button
              type="button"
              onClick={alternarMostrarMedia}
              disabled={actualizandoMedia}
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                borderRadius: 6,
                border: mostrarMedia ? '1px solid #4caf50' : '1px solid #ff9800',
                color: mostrarMedia ? '#4caf50' : '#ff9800',
                background: 'transparent'
              }}
            >
              {mostrarMedia ? 'Media: Visible' : 'Media: Oculto'}
            </button>
          )}

          <span>Hola, <strong>{nombreUsuario}</strong></span>
          <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route
            path="/premio/:id"
            element={<PremioDetalle session={session} mostrarMedia={mostrarMedia} />}
          />
          <Route path="/candidatos" element={<Candidatos />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}