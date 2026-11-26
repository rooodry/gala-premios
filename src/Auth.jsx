import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [esRegistro, setEsRegistro] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)

  const manejarSubmit = async (e) => {
    e.preventDefault()
    setCargando(true)
    setError(null)

    if (esRegistro) {
      // Crear cuenta nueva guardando el nombre elegido en user_metadata
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre: nombre.trim()
          }
        }
      })
      if (error) setError(error.message)
    } else {
      // Iniciar sesión con email y contraseña
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) setError('Correo o contraseña incorrectos')
    }

    setCargando(false)
  }

  return (
    <div style={{ maxWidth: 380, margin: '4rem auto', padding: '1.5rem', border: '1px solid #ddd', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>
        {esRegistro ? 'Crear cuenta para la Gala' : 'Iniciar sesión'}
      </h2>

      <form onSubmit={manejarSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {esRegistro && (
          <div>
            <label htmlFor="nombre" style={{ display: 'block', marginBottom: 4 }}>Tu nombre</label>
            <input
              id="nombre"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Ej. Carlos"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              style={{ width: '100%', padding: '0.6rem', boxSizing: 'border-box' }}
            />
          </div>
        )}

        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 4 }}>Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.6rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', marginBottom: 4 }}>Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={esRegistro ? 'new-password' : 'current-password'}
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            style={{ width: '100%', padding: '0.6rem', boxSizing: 'border-box' }}
          />
        </div>

        {error && <p style={{ color: '#d32f2f', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          style={{ padding: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {cargando ? 'Entrando...' : esRegistro ? 'Crear cuenta y entrar' : 'Entrar'}
        </button>
      </form>

      <div style={{ marginTop: '1rem', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => {
            setEsRegistro(!esRegistro)
            setError(null)
          }}
          style={{ background: 'none', border: 'none', color: '#0066cc', textDecoration: 'underline', cursor: 'pointer' }}
        >
          {esRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí'}
        </button>
      </div>
    </div>
  )
}