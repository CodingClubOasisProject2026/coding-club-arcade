import { useEffect } from 'react'
import { HubLink } from '../loader/HubTransition'
import './PrivacyPolicy.css'

export default function PrivacyPolicy() {
  const lastUpdated = 'October 29, 2026'

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  return (
    <main className="privacy-page" aria-label="Privacy Policy">
      <header className="privacy-header">
        <div className="privacy-breadcrumb">
          <HubLink to="/" className="privacy-back-link">
            ◀ <span>ARCADE HOME</span>
          </HubLink>
          <span className="privacy-kicker">LEGAL & COMPLIANCE</span>
        </div>
        <h1>
          PRIVACY POLICY<span>.</span>
        </h1>
        <p className="privacy-subtitle">
          How Coding Club Arcade collects, uses, and safeguards your data.
        </p>
        <div className="privacy-meta">
          <span className="privacy-badge">Google OAuth 2.0 Compliant</span>
          <span className="privacy-date">Last Updated: {lastUpdated}</span>
        </div>
      </header>

      <section className="privacy-card privacy-card-highlight">
        <h2>At A Glance</h2>
        <div className="privacy-grid-summary">
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🔒</span>
            <h3>What We Request</h3>
            <p>Only basic Google profile data (Name, Email, Profile Picture). No passwords, no contacts, no drive access.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🏆</span>
            <h3>Why We Need It</h3>
            <p>To authenticate your account, allocate arcade tickets, and verify high scores on the leaderboard.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🛡️</span>
            <h3>No Data Selling</h3>
            <p>We do not sell, rent, or share personal data with third-party advertisers or data brokers.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🗑️</span>
            <h3>Your Control</h3>
            <p>Revoke access anytime in your Google Account or request full deletion of your gameplay records.</p>
          </div>
        </div>
      </section>

      <article className="privacy-content">
        <section className="privacy-section">
          <h2>1. Introduction</h2>
          <p>
            Welcome to <strong>Coding Club Arcade</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;),
            an open arcade gaming platform developed and maintained by the <strong>Coding Club, BITS Pilani</strong>.
          </p>
          <p>
            This Privacy Policy explains how we collect, handle, store, and protect your information when you access
            our games (including Defusal, Fastfind, Slither, Blockbind, Pecman, and Flightsim), sign in with Google,
            and interact with our leaderboards.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Information We Collect</h2>
          <p>We only collect the minimum information strictly required to operate the arcade platform:</p>

          <div className="privacy-subblock">
            <h3>A. Information from Google Sign-In (OAuth 2.0)</h3>
            <p>When you choose to sign in using your Google Account, we request only the standard <code>profile</code> and <code>email</code> scopes:</p>
            <ul>
              <li><strong>Your Name & Display Name:</strong> Used to identify you and display your player handle on high score leaderboards.</li>
              <li><strong>Email Address:</strong> Used as your unique account identifier to ensure secure session management. Your email is never displayed publicly.</li>
              <li><strong>Profile Picture URL:</strong> Used optionally to display your player avatar in the arcade header.</li>
              <li><strong>Google User ID:</strong> A secure unique numerical identifier provided by Google to recognize your account upon return.</li>
            </ul>
          </div>

          <div className="privacy-subblock">
            <h3>B. Gameplay & Verification Data</h3>
            <p>While playing games in ranked or verified mode, our platform records:</p>
            <ul>
              <li><strong>Scores & Durations:</strong> Final scores, level achieved, and completion time.</li>
              <li><strong>Deterministic Action Logs:</strong> Game tick inputs (e.g., arrow presses or tile guesses) submitted strictly to our backend to mathematically verify fair play and prevent cheated scores on the public leaderboard.</li>
              <li><strong>Arcade Tickets Balance:</strong> The remaining game session tickets tied to your authenticated profile.</li>
            </ul>
          </div>

          <div className="privacy-callout callout-success">
            <strong>What We Never Collect:</strong> We never request, access, or store your Google password, contacts list, Google Drive files, calendar events, location data, financial/payment information, or any sensitive Google API scopes.
          </div>
        </section>

        <section className="privacy-section">
          <h2>3. How We Use Your Information</h2>
          <p>We use the collected information exclusively for the following purposes:</p>
          <ol>
            <li><strong>Player Authentication:</strong> Establishing and maintaining your secure login session via encrypted HTTP-only session cookies.</li>
            <li><strong>Arcade Tickets:</strong> Allocating, tracking, and debiting game tickets required for competitive runs.</li>
            <li><strong>Public High Scores & Leaderboards:</strong> Calculating, verifying, and publishing ranked leaderboard standings.</li>
            <li><strong>Fair Play & Anti-Cheat:</strong> Validating that game scores match authentic input logs to protect competitive integrity.</li>
            <li><strong>Service Improvements:</strong> Debugging game simulation crashes and improving platform performance.</li>
          </ol>
        </section>

        <section className="privacy-section">
          <h2>4. Google API Services User Data Policy Compliance</h2>
          <div className="privacy-callout callout-google">
            <p>
              Coding Club Arcade&apos;s use and transfer to any other app of information received from Google APIs will
              adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </div>
          <p>Specifically:</p>
          <ul>
            <li>We do not transfer or disclose your Google user data to third parties, except as strictly necessary to operate the application.</li>
            <li>We do not use Google user data for serving personalized advertising, retargeting, or interest-based profiling.</li>
            <li>We do not allow humans to read user data unless required for security investigations or with your explicit consent.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>5. Data Sharing & Third Parties</h2>
          <p>
            <strong>We do not sell, rent, monetize, or trade your personal information.</strong>
          </p>
          <p>Your data is only visible or processed in the following limited contexts:</p>
          <ul>
            <li><strong>Public Leaderboards:</strong> Your chosen player handle / username and game scores are visible to other players on the public arcade leaderboard. Your email address remains private.</li>
            <li><strong>Infrastructure Providers:</strong> Hosted server infrastructure (e.g., cloud hosting and database systems) operating under strict confidentiality and security standards.</li>
            <li><strong>Legal Requirements:</strong> If required by law, subpoena, or valid legal process.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>6. Cookies & Client-Side Storage</h2>
          <p>Coding Club Arcade uses minimal storage technologies:</p>
          <ul>
            <li><strong>Session Cookies (<code>sessionid</code>, <code>csrftoken</code>):</strong> Required to keep you securely signed in and prevent Cross-Site Request Forgery (CSRF) attacks.</li>
            <li><strong>Local Storage:</strong> Stored locally in your browser to remember your sound preference (mute / unmute) and cache local high score records for offline play.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>7. Data Security & Retention</h2>
          <p>
            We implement industry-standard administrative and technical security measures:
          </p>
          <ul>
            <li>All data transmissions are encrypted using Transport Layer Security (TLS / HTTPS).</li>
            <li>Session cookies use secure, HTTP-only flags.</li>
            <li>User data is retained only for as long as your account remains active or as needed to maintain leaderboard historical records.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>8. Your Rights & Data Deletion</h2>
          <p>You maintain full control over your data:</p>
          <ul>
            <li>
              <strong>Revoke Google Access:</strong> You can disconnect Coding Club Arcade from your Google Account at any time via{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account Permissions
              </a>.
            </li>
            <li>
              <strong>Account & Score Deletion:</strong> If you would like your account, email association, or leaderboard scores permanently purged from our database, please contact our maintenance team at the details below. We will process your deletion request promptly.
            </li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Our arcade games are family-friendly and do not knowingly collect personal information from children under the age of 13.
            If you believe a child has provided us with personal data, please contact us so we can immediately delete it.
          </p>
        </section>

        <section className="privacy-section">
          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect platform enhancements or regulatory requirements.
            The &ldquo;Last Updated&rdquo; date at the top of this document will always indicate the most recent revision.
          </p>
        </section>

        <section className="privacy-section privacy-contact-card">
          <h2>11. Contact Us</h2>
          <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact:</p>
          <div className="contact-details">
            <p><strong>Organization:</strong> Coding Club, BITS Pilani</p>
            <p><strong>Project:</strong> Coding Club Arcade</p>
            <p><strong>Inquiries & Data Requests:</strong> <a href="mailto:codingclub@pilani.bits-pilani.ac.in">codingclub@pilani.bits-pilani.ac.in</a></p>
            <p><strong>Repository:</strong> <a href="https://github.com/CodingClubOasisProject2026/coding-club-arcade" target="_blank" rel="noopener noreferrer">Coding Club Arcade on GitHub</a></p>
          </div>
        </section>
      </article>

      <footer className="privacy-footer">
        <HubLink to="/" className="privacy-return-btn">
          ◀ RETURN TO ARCADE
        </HubLink>
      </footer>
    </main>
  )
}
