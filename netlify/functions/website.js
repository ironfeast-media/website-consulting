
const express = require('express');
const serverless = require("serverless-http");
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..','..', 'public'));
app.use(express.static(path.join(__dirname, '..','..', 'public', 'images')));



const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', { hash: process.env.CONTACT_FORM_HASH || 'test' });
});

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD
    }
});

/*
router.get('/images/:imageName', (req, res) => {
    console.log('Request for image:', req.params.imageName);
    const imageName = req.params.imageName;
    const imagePath = path.join(__dirname, '..','..', 'public', 'images', imageName);

    if (!fs.existsSync(imagePath)) {
        return res.status(404).send('Image not found');     
    }   
    console.log('Found, returning:', imagePath);
    res.sendFile(imagePath);
})*/


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

app.use('/', router);

export const handler = serverless(app);