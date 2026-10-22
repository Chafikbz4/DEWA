import Link from "next/link";
import { Icon } from "@/components/platform";

const roles = [
  {
    href: "/register/patient",
    icon: "file" as const,
    eyebrow: "FOR PATIENTS",
    title: "Find your medication, simply",
    description: "Send your prescription, compare trusted pharmacy offers, and choose delivery or pickup.",
    action: "Create a patient account",
    tone: "teal",
  },
  {
    href: "/register/pharmacist",
    icon: "store" as const,
    eyebrow: "FOR PHARMACISTS",
    title: "Grow your pharmacy",
    description: "Receive verified requests, share your offers, and serve more patients in your area.",
    action: "Register my pharmacy",
    tone: "purple",
  },
  {
    href: "/register/driver",
    icon: "truck" as const,
    eyebrow: "FOR DRIVERS",
    title: "Deliver with DEWA",
    description: "Access nearby delivery jobs and manage every delivery from one simple workspace.",
    action: "Become a driver",
    tone: "amber",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link href="/" className="landing-brand">
          <span className="platform-logo">+</span>
          dewa
        </Link>
        <nav className="landing-nav" aria-label="Navigation principale">
          <a href="#how-it-works">How it works</a>
          <a href="#partners">For professionals</a>
          <a href="#trust">Our commitment</a>
        </nav>
        <div className="landing-actions">
          <Link href="/login" className="landing-login">Sign in</Link>
          <Link href="/register/patient" className="platform-primary">Create an account</Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="landing-kicker">HEALTHCARE, SIMPLIFIED</span>
          <h1>Your essential care, <em>within reach.</em></h1>
          <p>
            DEWA connects patients with trusted pharmacies across Algeria.
            Send your prescription, compare offers, and receive your medication with confidence.
          </p>
          <div className="landing-hero-actions">
            <Link href="/register/patient" className="platform-primary">
              Get started <Icon name="arrow" size={17} />
            </Link>
            <Link href="#how-it-works" className="landing-outline">Discover DEWA <Icon name="arrow" size={16} /></Link>
          </div>
          <div className="landing-proof">
            <span className="proof-avatars"><i>AB</i><i>YK</i><i>NR</i><i>+</i></span>
            <span><strong>A growing community</strong><small>Patients and professionals trust DEWA</small></span>
          </div>
        </div>
        <div className="landing-hero-art" aria-label="DEWA journey preview">
          <div className="hero-glow" />
          <div className="hero-card hero-main-card">
            <div className="hero-card-top"><span className="hero-mini-logo">+</span><span>Your DEWA journey</span><span className="hero-check">✓</span></div>
            <div className="hero-prescription"><span className="hero-file-icon"><Icon name="file" size={22} /></span><span><strong>Prescription sent</strong><small>3 pharmacies responding</small></span><b>●</b></div>
            <div className="hero-offers"><div><span>Offers available</span><strong>3 pharmacies</strong></div><div><span>Fastest delivery</span><strong>20–30 min</strong></div></div>
            <div className="hero-progress"><span /><span /><span /><span /></div>
            <div className="hero-progress-labels"><small>Sent</small><small>Compare</small><small>Delivery</small></div>
          </div>
          <div className="floating-card floating-secure"><span><Icon name="shield" size={18} /></span><strong>Protected data<small>Secure encryption</small></strong></div>
          <div className="floating-card floating-delivery"><span><Icon name="truck" size={18} /></span><strong>Live tracking<small>Your order is on the way</small></strong></div>
        </div>
      </section>

      <section className="landing-role-section" id="partners">
        <div className="landing-section-heading">        <span className="landing-kicker">JOIN DEWA</span><h2>A space designed for everyone.</h2><p>Whether you need treatment or want to support more patients, DEWA is built for you.</p></div>
        <div className="landing-role-grid">{roles.map((role) => <Link href={role.href} className={`landing-role-card ${role.tone}`} key={role.href}><span className="role-icon"><Icon name={role.icon} size={23} /></span><span className="landing-kicker">{role.eyebrow}</span><h3>{role.title}</h3><p>{role.description}</p><span className="role-action">{role.action} <Icon name="arrow" size={15} /></span></Link>)}</div>
      </section>

      <section className="landing-how" id="how-it-works">
        <div className="landing-section-heading"><span className="landing-kicker">MADE SIMPLE</span><h2>Your prescription, our priority.</h2></div>
        <div className="how-grid"><div><span className="how-number">01</span><h3>Send your prescription</h3><p>A photo is all it takes. Your documents stay private and are only shared with pharmacies you approve.</p></div><div><span className="how-number">02</span><h3>Compare offers</h3><p>Pharmacies check availability and send you their best options.</p></div><div><span className="how-number">03</span><h3>Receive or collect</h3><p>Choose home delivery or pharmacy pickup, then follow every step.</p></div></div>
      </section>

      <section className="landing-trust" id="trust"><span className="trust-icon"><Icon name="shield" size={25} /></span><div><span className="landing-kicker">YOUR TRUST MATTERS</span><h2>A platform built around your privacy.</h2><p>DEWA protects your health information with controlled access and secure encryption.</p></div><Link href="/register/patient" className="landing-outline">Learn more <Icon name="arrow" size={16} /></Link></section>

      <footer className="landing-footer"><Link href="/" className="landing-brand"><span className="platform-logo">+</span>dewa</Link><span>© 2026 DEWA Health · Local pharmacy, reimagined.</span><div><Link href="/login">Sign in</Link><Link href="/register/pharmacist">Register a pharmacy</Link></div></footer>
    </main>
  );
}
