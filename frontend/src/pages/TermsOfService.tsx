import { useEffect } from 'react'
import { HubLink } from '../loader/HubTransition'
import './PrivacyPolicy.css'

export default function TermsOfService() {
  const lastUpdated = 'October 29, 2026'

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  return (
    <main className="privacy-page" aria-label="Terms of Service">
      <header className="privacy-header">
        <div className="privacy-breadcrumb">
          <HubLink to="/" className="privacy-back-link">
            ◀ <span>ARCADE HOME</span>
          </HubLink>
          <span className="privacy-kicker">LEGAL & COMPLIANCE</span>
        </div>
        <h1>
          TERMS OF SERVICE<span>.</span>
        </h1>
        <p className="privacy-subtitle">
          The rules for playing, signing in, and competing on Coding Club Arcade.
        </p>
        <div className="privacy-meta">
          <span className="privacy-badge">Fair Play Enforced</span>
          <span className="privacy-date">Last Updated: {lastUpdated}</span>
        </div>
      </header>

      <section className="privacy-card privacy-card-highlight">
        <h2>At A Glance</h2>
        <div className="privacy-grid-summary">
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🎮</span>
            <h3>Free To Play</h3>
            <p>The arcade games are free. Tickets are used to start competitive runs.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🚫</span>
            <h3>No Cheating</h3>
            <p>Scores are checked against your inputs. Tampering with runs or the API can get your account removed.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">🔑</span>
            <h3>Your Account</h3>
            <p>You are responsible for activity on your Google-signed-in account.</p>
          </div>
          <div className="summary-item">
            <span className="summary-icon" aria-hidden="true">⚖️</span>
            <h3>As-Is Service</h3>
            <p>The arcade is provided without warranties. We may change or pause games at any time.</p>
          </div>
        </div>
      </section>

      <article className="privacy-content">
        <section className="privacy-section">
          <h2>1. Acceptance of These Terms</h2>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of <strong>Coding Club Arcade</strong>, an open
            arcade gaming platform developed and maintained by the <strong>Coding Club, BITS Pilani</strong>
            (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). By accessing the site, playing any game, or
            signing in, you agree to these Terms. If you do not agree, please do not use the arcade.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Eligibility & Accounts</h2>
          <p>
            You can play without an account. Signing in with Google is required for tickets, ranked runs, and leaderboard
            entries. By signing in, you confirm that the Google Account you use belongs to you and that the information on
            it is accurate.
          </p>
          <ul>
            <li>You are responsible for all activity that happens through your signed-in session.</li>
            <li>Do not share your session, attempt to access another player&apos;s account, or impersonate anyone.</li>
            <li>You may disconnect the arcade from your Google Account at any time via Google Account Permissions.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>3. Arcade Tickets & Ranked Runs</h2>
          <p>
            Competitive runs consume arcade tickets. Tickets are a virtual, in-game resource. They have no cash value, cannot
            be exchanged for money, and are not transferable between accounts.
          </p>
          <ul>
            <li>Ticket balances are maintained by the server. We may adjust, reset, or revoke balances to fix errors or abuse.</li>
            <li>We may change how tickets are earned or spent, including the cost of a run, with reasonable notice on the site.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>4. Fair Play & Leaderboards</h2>
          <p>
            Leaderboards are meant to reflect honest play. Each ranked run is recorded as a sequence of game inputs and
            verified on our backend before a score is published.
          </p>
          <div className="privacy-callout callout-success">
            <strong>Prohibited:</strong> bots, scripts, automated input, modified clients, replaying or forging run data,
            exploiting bugs for scores, and any attempt to bypass ticket or score verification.
          </div>
          <p>
            We may remove scores, reset leaderboards, or suspend accounts that violate these rules. We are not required to
            explain every decision, but we will try to be fair and consistent.
          </p>
        </section>

        <section className="privacy-section">
          <h2>5. Acceptable Use</h2>
          <p>When using the arcade, you agree not to:</p>
          <ul>
            <li>Interfere with, overload, or disrupt the service, including its servers, APIs, or other players&apos; sessions.</li>
            <li>Probe, scan, or test the security of the platform outside a coordinated, authorized disclosure.</li>
            <li>Use the arcade for any unlawful purpose or to harass other players.</li>
            <li>Use player handles or content that is offensive, hateful, or infringes someone else&apos;s rights.</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>6. Intellectual Property</h2>
          <p>
            The games, artwork, names, and branding of Coding Club Arcade belong to the Coding Club, BITS Pilani, or their
            respective contributors. Source code published in our repository is licensed under the terms stated in that
            repository. Nothing in these Terms transfers ownership of any of these materials to you.
          </p>
          <p>
            Third-party names and marks (including Google and Google Sign-In) remain the property of their owners.
          </p>
        </section>

        <section className="privacy-section">
          <h2>7. Service Availability</h2>
          <p>
            We aim to keep the arcade running, but we do not guarantee uninterrupted or error-free access. Games may be
            updated, paused, reset, or removed at any time, and saved progress or leaderboard data may be affected by such
            changes.
          </p>
        </section>

        <section className="privacy-section">
          <h2>8. Disclaimers & Limitation of Liability</h2>
          <p>
            The arcade is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
            express or implied. To the fullest extent permitted by law, the Coding Club, BITS Pilani and its contributors
            are not liable for any indirect, incidental, or consequential damages arising from your use of the arcade,
            including loss of tickets, scores, or progress.
          </p>
        </section>

        <section className="privacy-section">
          <h2>9. Termination</h2>
          <p>
            You may stop using the arcade at any time. We may suspend or terminate your access if you violate these Terms,
            create risk for other players or the platform, or if we discontinue the arcade. Sections that by their nature
            should survive termination (such as Intellectual Property and Limitation of Liability) will continue to apply.
          </p>
        </section>

        <section className="privacy-section">
          <h2>10. Privacy</h2>
          <p>
            Our handling of personal data is described in the{' '}
            <HubLink to="/privacy">Privacy Policy</HubLink>. Using the arcade means you
            accept that policy as well.
          </p>
        </section>

        <section className="privacy-section">
          <h2>11. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. The &ldquo;Last Updated&rdquo; date at the top of this page
            shows the most recent revision. Continuing to use the arcade after a change means you accept the updated Terms.
          </p>
        </section>

        <section className="privacy-section privacy-contact-card">
          <h2>12. Contact Us</h2>
          <p>If you have questions about these Terms, please contact:</p>
          <div className="contact-details">
            <p><strong>Organization:</strong> Coding Club, BITS Pilani</p>
            <p><strong>Project:</strong> Coding Club Arcade</p>
            <p><strong>Questions:</strong> <a href="mailto:codingclub@pilani.bits-pilani.ac.in">codingclub@pilani.bits-pilani.ac.in</a></p>
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
