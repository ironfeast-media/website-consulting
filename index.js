
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

app.get('/', (req, res) => {
    res.render('index', { hash: process.env.CONTACT_FORM_HASH || 'test' });
});

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD
    }
});

app.post('/send-email', (req, res) => {
    const { name, email, phone, message } = req.body;
    if (req.body.hash !== process.env.CONTACT_FORM_HASH) {
        return res.status(401).json({ success: false, message: 'Unauthorized request.' });
    }
        
    const mailOptions = {
        to: 'contact@ironfeast.org',
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

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});