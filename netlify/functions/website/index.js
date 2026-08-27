const express = require('express');
const serverless = require('serverless-http');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(bodyParser.json());
// The Grant Builder gate is a plain HTML form, so urlencoded bodies must be parsed too.
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// ── GRANT BUILDER CONFIG ───────────────────────────────────────
// Hostnames that should serve the builder at "/" instead of the homepage.
// Empty until a subdomain (builder.ironfeast.org / prompt.ironfeast.org) exists,
// at which point setting this env var is the only change needed.
const BUILDER_HOSTS = (process.env.BUILDER_HOSTS || '')
	.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const SITE_BASE = (process.env.SITE_BASE || 'https://ironfeast.org').replace(/\/+$/, '');

const UNLOCK_COOKIE = 'if_builder';
const UNLOCK_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// Footer copyright year, so no page goes stale on 1 January.
const currentYear = () => new Date().getFullYear();

const isBuilderHost = req => BUILDER_HOSTS.includes(String(req.hostname || '').toLowerCase());

// Single presence-flag cookie, so a tiny inline parse beats adding cookie-parser
// to the function bundle.
const hasUnlock = req => String(req.headers.cookie || '')
	.split(';')
	.some(c => c.trim() === UNLOCK_COOKIE + '=1');

function setUnlockCookie(req, res) {
	const host = String(req.hostname || '').toLowerCase();
	const parts = [
		UNLOCK_COOKIE + '=1',
		'Path=/',
		'Max-Age=' + UNLOCK_MAX_AGE,
		'HttpOnly',
		'SameSite=Lax'
	];
	// Only scope to the apex when we are actually on it, so the cookie still works
	// on localhost under `netlify dev` and on *.netlify.app deploy previews.
	if (host === 'ironfeast.org' || host.endsWith('.ironfeast.org')) {
		parts.push('Domain=.ironfeast.org');
	}
	// serverless-http always reports req.protocol as 'https', so it cannot be trusted
	// here. Key off the host instead: everything except local dev is https on Netlify,
	// and a Secure cookie over plain http would be dropped by the browser.
	if (host !== 'localhost' && host !== '127.0.0.1') {
		parts.push('Secure');
	}
	res.setHeader('Set-Cookie', parts.join('; '));
}

// Resolve public directory from project root so Netlify Dev / function runner finds views correctly
const projectPublic = path.join(process.cwd(), 'public');
app.set('views', projectPublic);
app.use(express.static(path.join(projectPublic, 'images')));



const router = express.Router();

router.get('/', (req, res) => {
	// On a dedicated builder subdomain, "/" is the builder rather than the homepage.
	if (isBuilderHost(req)) return renderBuilder(req, res);
	res.render('index', { hash: process.env.CONTACT_FORM_HASH || 'test', year: currentYear() });
});

const transporter = nodemailer.createTransport({
	service: 'Gmail',
	auth: {
		user: process.env.EMAIL_ADDRESS,
		pass: process.env.EMAIL_PASSWORD
	}
});

router.post('/send-email', (req, res) => {
	const { name, email, phone, message } = req.body;
	if (req.body.hash !== process.env.CONTACT_FORM_HASH) {
		return res.status(401).json({ success: false, message: 'Unauthorized request.' });
	}
        
	const mailOptions = {
		to: 'ana@ironfeast.org',
		subject: `New Contact Form Submission from ${name}`,
		html: `
			<p><strong>Name:</strong> ${name}</p>
			<p><strong>Email:</strong> ${email}</p>
			<p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
			<p><strong>Message:</strong></p>
			<p>${message}</p>
		`
	};

	transporter.sendMail(mailOptions, (error, info) => {
		if (error) {
			console.log(error);
			return res.status(500).json({ success: false, message: 'Failed to send email.' });
		}
		console.log('Email sent: ' + info.response);
		res.json({ success: true, message: 'Email sent successfully!' });
	});
});

// ── GRANT OPPORTUNITY PROMPT BUILDER ───────────────────────────

// Renders the tool if the visitor has already unlocked, otherwise the email gate.
function renderBuilder(req, res, opts) {
	const options = opts || {};
	if (!options.forceUnlocked && !hasUnlock(req)) {
		return res.render('grant-builder-gate', {
			siteBase: SITE_BASE,
			year: currentYear(),
			error: options.error || null,
			values: options.values || { name: '', email: '' },
			// The gate must not promise an email we are not going to send.
			sendsConfirmation: SEND_CONFIRMATION
		});
	}
	res.render('grant-builder', { siteBase: SITE_BASE, year: currentYear() });
}

router.get('/grant-builder', (req, res) => renderBuilder(req, res));

router.post('/grant-builder', async (req, res) => {
	const name = String((req.body && req.body.name) || '').trim();
	const email = String((req.body && req.body.email) || '').trim();
	const honeypot = String((req.body && req.body.company_website) || '').trim();

	// Bots fill every field they find. Humans never see this one.
	// Unlock silently rather than showing an error, so a bot learns nothing.
	if (honeypot) {
		setUnlockCookie(req, res);
		return renderBuilder(req, res, { forceUnlocked: true });
	}

	if (!name) {
		return renderBuilder(req, res, {
			error: 'Please enter your name.',
			values: { name, email }
		});
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
		return renderBuilder(req, res, {
			error: 'That email address does not look right. Please check it and try again.',
			values: { name, email }
		});
	}

	// Delivery must never block access: the visitor already gave us their email,
	// so a mail failure is our problem to log, not theirs to be locked out by.
	try {
		await notifyLead(name, email);
	} catch (error) {
		console.error('Grant builder: lead notification failed', error);
	}
	if (SEND_CONFIRMATION) {
		try {
			await sendBuilderConfirmation(name, email);
		} catch (error) {
			console.error('Grant builder: confirmation email failed', error);
		}
	}

	setUnlockCookie(req, res);
	renderBuilder(req, res, { forceUnlocked: true });
});

// Both builder emails go through the Netlify Emails plugin (Mailgun), which is the
// path the live contact form already uses. The nodemailer transporter above is left
// alone for /send-email, but is deliberately NOT used here: nothing currently calls
// that route, so it is unproven in production.
//
// Mailgun only accepts a `from` on a domain verified with it, and the verified domain
// is ironfeast.tv — which is why the sender here is a .tv address even though the site
// is ironfeast.org. Override via env once ironfeast.org is verified with Mailgun.
const MAIL_FROM = process.env.BUILDER_MAIL_FROM || 'contactus@ironfeast.tv';
const LEAD_NOTIFY_TO = process.env.BUILDER_LEAD_TO || process.env.CONTACT_US_EMAIL || 'ana@ironfeast.tv';

// The Mailgun domain in use is a sandbox, which only delivers to a short list of
// authorized recipients. Ana is on that list; a visitor who just typed their address
// into the gate never is, so their confirmation would be rejected every time.
// Confirmations stay OFF until a real domain is verified with Mailgun, at which point
// setting BUILDER_SEND_CONFIRMATION=true turns them on with no code change.
const SEND_CONFIRMATION = String(process.env.BUILDER_SEND_CONFIRMATION || '').toLowerCase() === 'true';

async function sendPluginEmail(template, payload) {
	if (!process.env.NETLIFY_EMAILS_SECRET || !process.env.URL) {
		throw new Error('NETLIFY_EMAILS_SECRET or URL is not set');
	}
	const response = await fetch(`${process.env.URL}/.netlify/functions/emails/${template}`, {
		method: 'POST',
		headers: {
			'netlify-emails-secret': process.env.NETLIFY_EMAILS_SECRET,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(Object.assign({ from: MAIL_FROM }, payload))
	});
	if (!response.ok) {
		throw new Error(`Emails function returned ${response.status} for template "${template}"`);
	}
}

// Tells Ana a new lead used the builder.
function notifyLead(name, email) {
	return sendPluginEmail('grant-builder-lead', {
		// The plugin only forwards from/to/cc/bcc/subject/html/attachments, so there is
		// no replyTo. The template makes the lead's address a mailto: link instead.
		to: LEAD_NOTIFY_TO,
		subject: `Grant Builder lead: ${name}`,
		parameters: { name, email }
	});
}

// Sends the visitor their confirmation.
function sendBuilderConfirmation(name, email) {
	return sendPluginEmail('grant-builder', {
		to: email,
		subject: 'Your Grant Opportunity Prompt Builder link',
		parameters: {
			name,
			builderUrl: `${SITE_BASE}/grant-builder`,
			scheduleUrl: `${SITE_BASE}/schedule`
		}
	});
}

// On a builder subdomain, everything that is not the builder belongs on the main site.
router.use((req, res, next) => {
	if (!isBuilderHost(req)) return next();
	return res.redirect(301, SITE_BASE + req.originalUrl);
});

app.use('/', router);

module.exports.handler = serverless(app);
