# Grant Opportunity Prompt Builder — Design

**Date:** 2026-08-27
**Status:** Approved, ready for implementation planning

## Goal

Publish the existing standalone "Grant Opportunity Prompt Builder v3.0" tool on the
IronFeast Consulting site as an **email-gated lead magnet**, architected so it can later
move to its own subdomain (`builder.ironfeast.org` or `prompt.ironfeast.org`) without a
code change.

## Source material

`grant-prompt-builder_forProfit_nonProfit (1).html` — 993 lines / 64KB, fully
self-contained. Inline `<style>` and `<script>`; **no** network calls, no `localStorage`.
The only external reference is a Google Fonts `@import` (Lora, JetBrains Mono).

Behaviour: a Nonprofit/For-Profit mode toggle drives three tabs (Build Prompt, Generated
Prompt, How to Use). A form collects organization basics, geography, audience, grant
search filters, financial criteria and calibration context via inputs, selects, tag
inputs and clickable pills. `buildPrompt()` assembles a "5-layer" AI research prompt;
`copyPrompt()` writes it to the clipboard. Nothing is submitted anywhere.

Verified pre-conditions:
- **0** occurrences of `<%` — safe to rename to `.ejs` with no escaping work.
- 86 backticks are JS template literals in `buildPrompt()`; no EJS conflict.

## Decisions

| Question | Decision |
|---|---|
| Audience | Public lead magnet, email-gated |
| Gate timing | Before the form loads |
| Lead delivery | Notify Ana **and** send the visitor a templated confirmation |
| Design fit | Site header/footer **copied** into the new pages; builder interior untouched |
| Modes | Keep both; default to **For-Profit** |
| Canonical domain | `ironfeast.org` |
| Confirmation sender | `ana@ironfeast.org` |
| URL | `/grant-builder`, subdomain-ready |

## Architecture

### Routing and domain

The `/*` → `/.netlify/functions/website/:splat` redirect in `netlify.toml` is
`force = true`, so **every** request already reaches the express app. Host-awareness
therefore belongs in the router, not in `netlify.toml` — no Netlify domain-redirect
features are required.

In `netlify/functions/website/index.js`:

```js
const BUILDER_HOSTS = (process.env.BUILDER_HOSTS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isBuilderHost = req => BUILDER_HOSTS.includes((req.hostname || '').toLowerCase());
```

| Request | Main host | Builder host |
|---|---|---|
| `GET /` | renders `index` (unchanged) | renders the gate |
| `GET /grant-builder` | renders the gate | renders the gate |
| `POST /grant-builder` | validate → mail → render tool | same |

Ships at `ironfeast.org/grant-builder`. When a builder subdomain is later pointed at the
same Netlify site as a domain alias, its root serves the gate with **zero code changes** —
DNS plus setting `BUILDER_HOSTS`. Keeping the hostnames in an env var means choosing
between `builder.` and `prompt.` (or running both) needs no deploy.

Consequences handled as part of this work:

- **Duplicate content.** A domain alias serves the whole site on both hosts. Emit
  `<link rel="canonical">` on every page; on the builder host, 301 any non-builder path
  back to `SITE_BASE`.
- **Nav breakage.** Nav items are `#overview`, `#about`, `#sbir`, `#contact` — anchors
  into the one-pager, which scroll to nothing on a subdomain. Pass a `siteBase` variable
  into the templates so links render absolute on the builder host and stay plain anchors
  on the main site.

### Middleware prerequisites

The express app currently registers only `bodyParser.json()`. The gate is a plain HTML
form, so two additions are required before the routes will work:

- `bodyParser.urlencoded({ extended: true })` — otherwise `req.body` is empty for the
  gate POST.
- Cookie reading — either `cookie-parser` (a new dependency) or a small inline parse of
  the `Cookie` header. Given a single presence-flag cookie, inline parsing avoids adding
  a dependency to the function bundle.

### Gate flow

`GET /grant-builder` renders a gate page: site chrome, a short pitch for what the tool
produces, and name + email fields posting back to the same URL.

`POST /grant-builder`:

1. **Validate** server-side — name non-empty, email against a sane regex. On failure,
   re-render the gate with the error and the submitted values preserved. The gate works
   without JavaScript.
2. **Send both emails, failure-tolerant.** If delivery throws, the visitor still receives
   the tool and the error is logged. Losing a lead notification is bad; blocking someone
   who already handed over their email is worse.
3. **Set an unlock cookie** — `SameSite=Lax`, `HttpOnly`, `Secure`, ~90 days. The cookie
   is a **presence flag only** (`if_builder=1`); it carries no identity and is not signed,
   because the gate is a lead-capture device rather than access control (see Open risks).
   Its `Domain` is set to `.ironfeast.org` **only when the request host ends in
   `ironfeast.org`** — so both hosts share one unlock — and otherwise omitted, which keeps
   it host-scoped and working on `localhost` under `netlify dev` and on
   `*.netlify.app` deploy previews.
4. **Render the tool.**

`GET` carrying a valid unlock cookie skips the gate and renders the tool directly.
Without this, every refresh re-gates the visitor and re-notifies Ana about a lead she
already has.

### Email delivery

**To Ana** — call the nodemailer transporter already constructed at module scope in
`netlify/functions/website/index.js` (from `EMAIL_ADDRESS` / `EMAIL_PASSWORD`) directly
with new `mailOptions`, rather than making an HTTP `POST /send-email` round-trip to the
same express app. Recipient `ana@ironfeast.org`, matching the existing contact form.

**To the visitor** — the Netlify Emails plugin, via a new template at
`emails/grant-builder/index.html`. `[functions.emails] included_files = ["./emails/**"]`
is already configured, so the template is picked up automatically. Sender:
`ana@ironfeast.org`.

The `CONTACT_FORM_HASH` guard does not transfer — it exists because `/send-email` is
publicly callable, and on a gate form it would be ceremony. Its absence leaves the
endpoint spammable, so add a hidden **honeypot** field instead: no user friction, and it
stops naive bots from flooding Ana.

### Tool page

`public/grant-builder.ejs` — the source file renamed, with three changes:

1. **Default to For-Profit** — initialise with `setMode('fp')`, move the `active-np`
   class to `#btn-fp`.
2. **Closing CTA** below the generated prompt — "Want us to actually run this for you?"
   linking to `/schedule`. This is the conversion path the gate exists to feed.
3. **Google Fonts as a `<link>`** rather than an `@import` inside `<style>`, which is
   render-blocking and currently causes a flash of unstyled form.

### Site chrome

The chrome is **copied** into each new page rather than extracted into shared partials.
`schedule.html` already duplicates it (its own `.navbar` / `.logo` CSS at lines 43–49,
copied `<header>` at line 349), so this makes a third copy — accepted deliberately in
exchange for not editing the live 527-line `index.ejs` beyond a single nav link. Extracting
`public/partials/` remains the right cleanup once this has shipped and settled.

`schedule.html` is left as-is: it is a static file served by a `force` redirect and never
passes through EJS. Converting it is out of scope.

**CSS isolation:** both stylesheets define `:root` custom properties and bare-element
rules (`*`, `body`). Scope the chrome CSS to `.site-header` / `.site-footer` rather than
importing the whole homepage stylesheet, so the builder's tuned interior cannot be
clobbered.

## File inventory

**New**
- `public/grant-builder.ejs` — the tool, wrapped in site chrome
- `public/grant-builder-gate.ejs` — the email gate
- `emails/grant-builder/index.html` — visitor confirmation template

**Modified**
- `netlify/functions/website/index.js` — host detection, three routes, cookie handling,
  lead notification
- `public/index.ejs` — **one line only**: a "Grant Builder" nav item

**Unchanged**
- `netlify.toml` — the existing `/*` fallback already covers the new routes
- `public/schedule.html`

## Environment variables

| Name | Purpose | Status |
|---|---|---|
| `BUILDER_HOSTS` | Comma-separated hostnames that serve the builder at `/` | **New**; empty until the subdomain exists |
| `SITE_BASE` | Canonical origin for absolute links and canonical tags; defaults to `https://ironfeast.org` | **New** |
| `EMAIL_ADDRESS`, `EMAIL_PASSWORD` | Existing nodemailer Gmail credentials | Existing |
| `NETLIFY_EMAILS_SECRET`, `URL` | Used by the Netlify Emails plugin | Existing |

## Error handling

- Invalid gate submission → re-render the gate with an inline error, values preserved, HTTP 200.
- Mail failure → logged; the visitor is still unlocked and served the tool.
- Missing or invalid unlock cookie on `GET` → gate, not an error.
- Non-builder path on the builder host → 301 to `${SITE_BASE}<path>`.

## Testing

- Gate rejects empty name, malformed email, and honeypot-filled submissions.
- Valid submission renders the tool and sets a correctly-scoped cookie.
- `GET` with a valid cookie bypasses the gate; without one, gates.
- Host detection: with `BUILDER_HOSTS` set, `/` serves the gate; unset, `/` serves the homepage.
- Mail-send failure still unlocks the visitor.
- Both modes render, and the page opens in For-Profit.
- Homepage is unchanged after the chrome-partial refactor.

## Out of scope

- Converting `schedule.html` to EJS
- Persisting leads to Netlify Blobs (email only for now)
- Actually provisioning the subdomain (DNS + Netlify domain alias)
- Restyling the builder's interior to match the site palette
- The in-flight TypeScript migration of the Netlify functions

## Open risks

1. `ana@ironfeast.org` must be verified as a sender with the Emails provider, or every
   confirmation bounces. This is an account-side task.
2. A client-side "copy" is still reachable to anyone who unlocks once; the gate is a
   lead-capture device, not access control. Accepted.
3. ~~Editing the live `index.ejs` for the chrome refactor~~ — **resolved**: the chrome is
   copied instead, so the only homepage change is one added nav `<li>`. Reverting that
   single line fully removes the feature from the site.

## Implementation notes

Discovered while building, worth keeping:

- **`serverless-http` always reports `req.protocol === 'https'`**, even on `localhost` with
  no `x-forwarded-proto` header. Gating the cookie's `Secure` attribute on `req.protocol`
  therefore sets it unconditionally, and a `Secure` cookie over plain http is dropped by
  the browser — which would have made the gate impossible to unlock under `netlify dev`.
  `setUnlockCookie` keys off the hostname instead.
- The honeypot unlocks **silently** rather than showing an error, so a bot cannot learn
  which field trapped it.
