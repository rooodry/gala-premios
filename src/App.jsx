import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import Home from './Home'
import PremioDetalle from './PremioDetalle'
import Candidatos from './Candidatos'

export default function App() {
  const [session, setSession] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)

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

  if (cargandoSesion) {
    return <p style={{ textAlign: 'center', marginTop: '4rem' }}>Cargando...</p>
  }

  if (!session) {
    return <Auth />
  }

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

        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
          <span>Hola, <strong>{nombreUsuario}</strong></span>
          <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/premio/:id" element={<PremioDetalle session={session} />} />
          <Route path="/candidatos" element={<Candidatos />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}