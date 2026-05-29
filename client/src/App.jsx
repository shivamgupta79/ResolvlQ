import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CreateComplaint from './pages/CreateComplaint.jsx';
import ComplaintDetails from './pages/ComplaintDetails.jsx';
import EngineerList from './pages/EngineerList.jsx';
import EngineerPortal from './pages/EngineerPortal.jsx';
import Profile from './pages/Profile.jsx';
import TechnicianProfile from './pages/TechnicianProfile.jsx';
import Analytics from './pages/Analytics.jsx';

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!localStorage.getItem('token')) return <Navigate to="/login" />;
  return user?.role === 'admin' ? children : <Navigate to="/dashboard" />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/create-complaint" element={<PrivateRoute><CreateComplaint /></PrivateRoute>} />
          <Route path="/complaints/:id" element={<PrivateRoute><ComplaintDetails /></PrivateRoute>} />
          <Route path="/engineers" element={<AdminRoute><EngineerList /></AdminRoute>} />
          <Route path="/my-work" element={<PrivateRoute><EngineerPortal /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/tech-profile" element={<PrivateRoute><TechnicianProfile /></PrivateRoute>} />
          <Route path="/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
        </Routes>
      </main>
    </>
  );
}
