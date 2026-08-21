# Security Policy

## Supported versions

Security fixes are provided for the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Contact the
maintainer privately and include the affected version, reproduction steps and
the potential impact. Allow reasonable time for investigation and a release
before public disclosure.

Do not include real guest information, database files, uploaded invitations,
session cookies, setup keys or other secrets in a report.

## Deployment baseline

Internet-facing installations must use HTTPS behind a trusted reverse proxy,
set `TRUST_PROXY=1` and `SECURE_COOKIES=1`, restrict direct access to the app
port, use a long random `SETUP_KEY`, and regularly back up the persistent
volume.
