# Security Policy

DocuBite takes the security of user data seriously. This document explains how to report a
vulnerability, what to expect once you do, and what is in and out of scope.

## Reporting a vulnerability

Please email **security@docubite.app** with:

- A description of the issue and where you found it.
- Steps to reproduce, along with any proof-of-concept payload or script.
- The impact you believe the issue has, and any suggested remediation.

If you would like to encrypt your report, our PGP key is served at
`https://docubite.app/.well-known/pgp-key.txt` and its fingerprint is published in the same
`security.txt` linked below.

Please do **not** report vulnerabilities through public GitHub issues, pull requests, or on
social media.

## Our commitment

- **Acknowledgement:** within 3 business days of receipt.
- **Initial triage and severity assignment:** within 10 business days.
- **Fix or documented mitigation:** target 30 days for critical or high, 90 days for medium, best
  effort for low, measured from triage.
- **Coordinated disclosure:** we will agree a disclosure date with the reporter once a fix is in
  place. Our default window is 90 days from initial acknowledgement. Reporters retain credit in
  our security advisories unless they ask not to be named.

## Safe harbour

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, degradation of service, and destruction
  of data.
- Only interact with accounts they own, or have explicit permission from the account holder to
  test against.
- Give us reasonable time to remediate before any public disclosure.

Research under these conditions is authorised, and we will help clarify anything ambiguous if
you ask before you test.

## Scope

**In-scope:**

- `docubite.app` and all subdomains under `*.docubite.app`.
- The DocuBite web application, its API endpoints, and its background workers.
- The DocuBite Docker images published from this repository.

**Out-of-scope:**

- Denial-of-service attacks, volumetric or otherwise, against production hosts.
- Physical attacks, social engineering of DocuBite staff or customers, phishing.
- Findings against third-party SaaS we integrate with (Stripe, Supabase, AWS, Resend, MinerU,
  OpenAI, Google, Hugging Face); please report those to the provider directly.
- Missing security headers on non-sensitive assets, missing SPF/DMARC on non-mail domains,
  clickjacking on non-interactive pages, output from automated scanners without a demonstrated
  impact.

## Signed disclosure file

Machine-readable contact and preferences live at
`https://docubite.app/.well-known/security.txt`, per RFC 9116. The file is expected to be signed
with the PGP key linked above.

## Framework mapping

This policy closes ID.RA-08 ("processes for receiving, analysing, and responding to vulnerability
disclosures") as flagged by the 2026-09-10 NIST CSF 2.0 gap assessment.
