import React, { useEffect, useState } from "react";

// Header, Quarrix bar and footer mirror the nexonic WordPress theme
// (nexonictechnologies.com) so the subdomain reads as the same site.
export const SITE = "https://nexonictechnologies.com";

const MENU = [
  ["Home", "/"],
  ["Services", "/services/"],
  ["Work", "/work/"],
  ["Projects", "/projects/"],
  ["Library", "/library/", [["All designs", "/library/"], ["Free designs", "/library/#free"], ["Studio", "/studio/"]]],
  ["Blog & News", "/blog/"],
  ["About", "/about/"],
  ["Contact", "/contact/"],
];

const SERVICES = [
  ["EdTech & School Technology", "/service/edtech-school-technology/"],
  ["Website Design & Development", "/service/website-design-development/"],
  ["Search Engine Optimisation", "/service/search-engine-optimisation/"],
  ["Performance Marketing", "/service/performance-marketing/"],
  ["Social Media Management", "/service/social-media-management/"],
  ["AI Automation & Chatbots", "/service/ai-automation-chatbots/"],
];

const SOCIAL = [
  ["LinkedIn", "https://www.linkedin.com/company/nexonic-technologies/", <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></>],
  ["Instagram", "https://www.instagram.com/nexonictech", <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>],
  ["YouTube", "https://www.youtube.com/@NexonicTechnologies", <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" /></>],
  ["Facebook", "https://www.facebook.com/NexonicTechnologies", <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5Z" />],
  ["TikTok", "https://www.tiktok.com/@nexonictech", <><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.5 5 4.8" /></>],
  ["GitHub", "https://github.com/nexonic-technologies", <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />],
];

export function Icon({ children, className = "" }) {
  return (
    <svg className={"nx-icon " + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
export const Arrow = () => <Icon><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const External = () => <Icon><path d="M7 17 17 7M8 7h9v9" /></Icon>;

function Logo({ id }) {
  return (
    <a className="nx-logo" href={SITE + "/"} rel="home">
      <svg className="nx-mark" viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--nx-primary)" />
            <stop offset="1" stopColor="var(--nx-violet)" />
          </linearGradient>
        </defs>
        <path className="nx-mark__hex" d="M20 2 36 11v18L20 38 4 29V11Z" fill={`url(#${id})`} />
        <path className="nx-mark__n" pathLength="1" d="M13 27V13l14 14V13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="nx-logo__text">
        <span className="nx-logo__word" aria-label="nexonic" role="text">
          {"nexonic".split("").map((c, i) => (
            <i key={i} aria-hidden="true" style={{ "--i": i }}>{c}</i>
          ))}
        </span>
        <small>technologies</small>
      </span>
    </a>
  );
}

export function Header({ user, route, go }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let last = window.scrollY, ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 20);
        setHidden(y > last && y > 400 && !document.body.classList.contains("nx-nav-open"));
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.classList.toggle("nx-nav-open", open);
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => setOpen(false), [route]);
  const initial = user?.email?.[0]?.toUpperCase() || "";
  return (
    <header className={"nx-header" + (scrolled ? " is-scrolled" : "") + (hidden ? " is-hidden" : "")} id="nx-header">
      <div className="nx-container nx-header__inner">
        <Logo id="nxg-h" />
        <nav className="nx-nav" id="nx-nav" aria-label="Primary">
          <ul className="nx-menu">
            {MENU.map(([label, href, sub]) => (
              <li key={label} className={"menu-item" + (sub ? " menu-item-has-children" : "")}>
                <a href={SITE + href}>{label}</a>
                {sub && (
                  <ul className="sub-menu">
                    {sub.map(([l, h]) => (
                      <li key={l} className="menu-item"><a href={SITE + h}>{l}</a></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="nx-nav__cta">
            <a className="nx-btn nx-btn--primary" href={SITE + "/contact/"}><span>Book a Free Call</span></a>
          </div>
        </nav>
        <div className="nx-header__actions">
          <a
            className={"nx-acct-link" + (user ? " is-in" : "")}
            href={user ? "#/workspace" : "#/sign-in"}
            aria-label={user ? "Your Quarrix workspace" : undefined}
            onClick={(e) => { e.preventDefault(); go(user ? "workspace" : "sign-in"); }}
          >
            {user ? (
              <span aria-hidden="true">{initial}</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                <span>Sign in</span>
              </>
            )}
          </a>
          <a className="nx-btn nx-btn--primary nx-btn--sm" href={SITE + "/contact/"}><span>Book a Free Call</span></a>
          <button className="nx-burger" id="nx-burger" aria-controls="nx-nav" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

// Product bar: the Quarrix sections, under the shared site header.
export function ProductBar({ route, go, user, onSignOut }) {
  const tabs = [
    ["discover", "Discover"],
    ["workspace", "Workspace"],
    ["desktop", "Desktop"],
  ];
  const current = ["jobs", "customers", "grants"].includes(route) ? "discover" : route;
  return (
    <div className="qx-bar">
      <div className="nx-container qx-bar__inner">
        <a className="qx-bar__name" href="#/" onClick={(e) => { e.preventDefault(); go("discover"); }}>
          <b>Quarrix</b><span>by Nexonic</span>
        </a>
        <nav aria-label="Quarrix">
          {tabs.map(([id, label]) => (
            <a key={id} href={"#/" + (id === "discover" ? "" : id)} aria-current={current === id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); go(id); }}>
              {label}
            </a>
          ))}
          {user && <button type="button" className="qx-bar__out" onClick={onSignOut}>Sign out</button>}
        </nav>
      </div>
    </div>
  );
}

export function Footer({ privacy }) {
  return (
    <footer className="nx-footer">
      <div className="nx-footer__glow" aria-hidden="true" />
      <div className="nx-container">
        <div className="nx-footer__grid">
          <div className="nx-footer__brand">
            <Logo id="nxg-f" />
            <p>Nexonic Technologies is a digital marketing and web agency building websites, SEO, AI automation and open-source software.</p>
            <div className="nx-social">
              {SOCIAL.map(([name, href, path]) => (
                <a key={name} href={href} target="_blank" rel="noopener me" aria-label={name} title={name}><Icon>{path}</Icon></a>
              ))}
            </div>
            <a className="nx-review-btn" href="https://g.page/r/CXJQ7TQyY_reEBI/review" target="_blank" rel="noopener">
              <svg className="nx-review-btn__g" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6H1.4a12 12 0 0 0 0 10.9l4-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
              </svg>
              <span className="nx-review-btn__text">
                <strong>Review us on Google</strong>
                <span className="nx-review-btn__stars" aria-hidden="true">★★★★★</span>
              </span>
            </a>
          </div>
          <div className="nx-footer__col">
            <h2 className="nx-footer__title">Services</h2>
            <ul>{SERVICES.map(([l, h]) => <li key={l}><a href={SITE + h}>{l}</a></li>)}</ul>
          </div>
          <div className="nx-footer__col">
            <h2 className="nx-footer__title">Company</h2>
            <ul>
              {[["About", "/about/"], ["Projects", "/projects/"], ["Services", "/services/"], ["Contact", "/contact/"]].map(([l, h]) => (
                <li key={l}><a href={SITE + h}>{l}</a></li>
              ))}
            </ul>
          </div>
          <div className="nx-footer__col">
            <h2 className="nx-footer__title">Get in touch</h2>
            <ul>
              <li><a href="mailto:info@nexonictechnologies.com">info@nexonictechnologies.com</a></li>
              <li><a href="mailto:quarrix@nexonictechnologies.com">Quarrix support</a></li>
              <li><a href={SITE + "/contact/"}>Book a free consultation</a></li>
              <li><a href="https://github.com/nexonic-technologies" target="_blank" rel="noopener">Our GitHub</a></li>
            </ul>
          </div>
        </div>
        <div className="nx-brandmark">
          <div className="nx-wordmark" aria-hidden="true">nexonic<span>nexonic</span></div>
          <p className="nx-credit">A project by <a href="https://shahrukhalid.com/" target="_blank" rel="noopener">Shahrukh Khalid</a></p>
        </div>
        <div className="nx-footer__bottom">
          <p>© {new Date().getFullYear()} Nexonic Technologies. All rights reserved.</p>
          <a href={SITE + "/privacy-policy/"}>Privacy Policy</a>
          <a href="#/privacy" onClick={privacy}>Quarrix privacy notice</a>
          <a href={SITE + "/terms-of-sale/"}>Terms of Sale</a>
          <a href={SITE + "/refund-policy/"}>Refund Policy</a>
        </div>
      </div>
    </footer>
  );
}
