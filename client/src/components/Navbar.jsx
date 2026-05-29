import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="brand">ResolvIQ</Link>
      <div className="navlinks">
        {/* Admin links */}
        {user?.role === 'admin' && <Link to="/dashboard">Dashboard</Link>}
        {user?.role === 'admin' && <Link to="/engineers">Engineers</Link>}
        {user?.role === 'admin' && <Link to="/analytics">Analytics</Link>}

        {/* Resident links */}
        {user?.role === 'resident' && <Link to="/dashboard">My Complaints</Link>}
        {user?.role === 'resident' && <Link to="/create-complaint">+ New</Link>}
        {user?.role === 'resident' && <Link to="/profile">Profile</Link>}

        {/* Technician links */}
        {user?.role === 'technician' && <Link to="/my-work">My Work</Link>}
        {user?.role === 'technician' && <Link to="/tech-profile">Profile</Link>}

        {/* Auth */}
        {user ? (
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            {/* Avatar thumbnail */}
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #e2e8f0',
                  flexShrink: 0
                }}
              />
            ) : (
              <div style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: '#2563eb',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0
              }}>
                {(user.name || '?')[0].toUpperCase()}
              </div>
            )}
            <span className="muted" style={{ fontSize: 13 }}>
              {user.name} · <span style={{ textTransform: 'capitalize' }}>{user.role}</span>
            </span>
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
