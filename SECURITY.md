# 🔒 Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 10.x    | ✅ Active support  |
| < 10.0  | ❌ No longer supported |

## Reporting a Vulnerability

**If you discover a security vulnerability, please DO NOT open a public GitHub issue.**

Instead, report it privately:

1. **Email:** [Insert security email]
2. **GitHub:** Use [Private vulnerability reporting](https://github.com/pabloeckert/MejoraContactos/security/advisories/new)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Initial response:** Within 48 hours
- **Triage:** Within 5 business days
- **Fix & disclosure:** Coordinated with reporter

## Security Measures

- **Client-side processing:** Contact data is processed in the browser (IndexedDB). No contact data is sent to our servers.
- **Edge Functions:** Only anonymized text snippets sent to AI providers for cleaning. No PII stored server-side.
- **API Keys:** User-provided keys stored in localStorage only. Never transmitted to our backend.
- **Supabase:** Row Level Security (RLS) enabled. Anonymous access limited.
- **HTTPS:** All traffic encrypted in transit.
- **CSP:** Content Security Policy headers configured via `.htaccess`.
- **Dependencies:** Automated via Dependabot + `npm audit` in CI.

## Scope

In scope:
- XSS, CSRF, injection attacks
- Authentication/authorization bypass
- Data leakage
- Dependency vulnerabilities with known exploits

Out of scope:
- Social engineering
- Denial of service
- Issues in third-party services (Supabase, AI providers)
- Issues requiring physical access to user device

## Recognition

We appreciate responsible disclosure. Reporters will be credited in release notes (unless they prefer anonymity).
