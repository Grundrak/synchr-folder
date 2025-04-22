const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { sendEmailWithAttachments } = require('./service');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Setup Multer
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Endpoint pour envoyer les emails
app.post('/send-email', upload.array('files'), async (req, res) => {
  const { to, subject, message } = req.body;
  const files = req.files;
  
  try {
    await sendEmailWithAttachments(to, subject, message, files);
    console.log(`Email envoyé avec succès à ${to} avec ${files.length} fichier(s)`);
    res.status(200).send('E-mail envoyé avec succès');
  } catch (err) {
    console.error('Erreur lors de l\'envoi:', err);
    res.status(500).send('Erreur lors de l\'envoi');
  } finally {
    // Supprimer les fichiers après l'envoi
    files.forEach(file => fs.unlink(file.path, () => {}));
  }
});

// Endpoint pour vérifier l'état du serveur
app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'online' });
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Gérer toutes les autres routes pour l'application SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur en écoute sur http://localhost:${PORT}`);
});