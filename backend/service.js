const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter;

// Initialiser le transporteur de mail
function initTransporter() {
  if (transporter) return;
  
  console.log("Initialisation du transporteur d'email");
  console.log("EMAIL_USER:", process.env.EMAIL_USER);
  // Ne pas logger le mot de passe pour des raisons de sécurité
  
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// Vérifier la connexion au service d'email
async function verifyConnection() {
  try {
    initTransporter();
    await transporter.verify();
    console.log("Connexion au service d'email vérifiée");
    return true;
  } catch (error) {
    console.error("Erreur de connexion au service d'email:", error);
    return false;
  }
}

// Envoyer un email avec pièces jointes
async function sendEmailWithAttachments(to, subject, text, attachments) {
  initTransporter();
  
  // Vérifier s'il y a des pièces jointes
  if (!attachments || attachments.length === 0) {
    console.warn("Tentative d'envoi d'email sans pièces jointes");
  }
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    attachments: attachments.map(file => ({
      filename: file.originalname || file.name,
      path: file.path || file
    }))
  };
  
  try {
    console.log(`Envoi d'email à ${to} avec ${attachments.length} pièce(s) jointe(s)`);
    const info = await transporter.sendMail(mailOptions);
    console.log('Email envoyé:', info.messageId);
    return info;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    throw error;
  }
}

// Créer un fichier .env s'il n'existe pas
const fs = require('fs');
const path = require('path');

if (!fs.existsSync(path.join(__dirname, '.env'))) {
  console.log('Création du fichier .env exemple');
  fs.writeFileSync(path.join(__dirname, '.env.example'), envExample.trim());
}

module.exports = { 
  sendEmailWithAttachments,
  verifyConnection
};