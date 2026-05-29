import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="hero">
      <div>
        <p className="badge">Apartment Maintenance Automation</p>
        <h1>Report issues, send maintenance emails, and schedule visits automatically.</h1>
        <p className="muted">FixFlow AI helps residents raise complaints, classify issues with AI, notify maintenance teams, and track resolution status.</p>
        <Link className="primary" to="/create-complaint">Create Complaint</Link>
      </div>
      <div className="card stats">
        <h3>Hackathon MVP Features</h3>
        <p>AI classification</p>
        <p>Email automation</p>
        <p>Calendar scheduling</p>
        <p>Complaint dashboard</p>
      </div>
    </section>
  );
}
