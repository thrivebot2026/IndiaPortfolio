import { useState } from 'react';
import { Mail, Lock, User, LogIn, UserPlus } from 'lucide-react';

function Login({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password || (!isLogin && !name)) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      try {
        const users = JSON.parse(localStorage.getItem('indiaportfolio_users') || '[]');

        if (isLogin) {
          // Find matching user
          const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (!user || user.password !== password) {
            setError('Invalid email or password');
            setLoading(false);
            return;
          }
          onLoginSuccess(`mock-token-${user.id}`, { id: user.id, email: user.email, name: user.name });
        } else {
          // Register user
          const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
          if (exists) {
            setError('User already exists with this email');
            setLoading(false);
            return;
          }

          const newUser = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name,
            email,
            password, // Saved locally in browser storage
            createdAt: new Date().toISOString()
          };

          users.push(newUser);
          localStorage.setItem('indiaportfolio_users', JSON.stringify(users));
          onLoginSuccess(`mock-token-${newUser.id}`, { id: newUser.id, email: newUser.email, name: newUser.name });
        }
      } catch (err) {
        console.error('LocalStorage auth error:', err);
        setError('Failed to access local browser storage.');
      } finally {
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '1.5rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: '420px',
        width: '100%',
        padding: '2.5rem',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Logo and Titles */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '2rem',
            fontFamily: 'var(--font-display)',
            fontWeight: '800',
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {isLogin ? 'Manage your Indian stock portfolio efficiently' : 'Start tracking your investments with Screener.in data'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="glow-danger" style={{
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            color: '#f43f5e',
            fontSize: '0.8125rem',
            marginBottom: '1.5rem',
            lineHeight: 1.4
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  <User size={18} />
                </span>
                <input
                  type="text"
                  placeholder="John Doe"
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  required={!isLogin}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <Mail size={18} />
              </span>
              <input
                type="email"
                placeholder="name@example.com"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <Lock size={18} />
              </span>
              <input
                type="password"
                placeholder="••••••••"
                className="form-input"
                style={{ paddingLeft: '2.5rem' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', gap: '0.75rem', height: '44px' }}
            disabled={loading}
          >
            {loading ? (
              <div style={{
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255,255,255,0.2)',
                borderTopColor: '#ffffff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
            ) : isLogin ? (
              <>
                <LogIn size={18} />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <UserPlus size={18} />
                <span>Sign Up</span>
              </>
            )}
          </button>
        </form>

        {/* Toggle link */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366f1',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.875rem'
              }}
              disabled={loading}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default Login;
