const express = require('express');
const admin = require('firebase-admin');

// =================================================================================================
// ÉTAPE 1 : CONFIGURATION DE LA CLÉ DE SERVICE FIREBASE
// =================================================================================================
// Pour le développement local :
// 1. Allez dans votre console Firebase -> Paramètres du projet -> Comptes de service.
// 2. Cliquez sur "Générer une nouvelle clé privée" et téléchargez le fichier JSON.
// 3. Renommez ce fichier en "serviceAccountKey.json" et placez-le dans ce même dossier "anam-server".
//
// Pour la production (sur Render) :
// Le contenu de ce fichier JSON sera stocké dans une variable d'environnement.
// =================================================================================================

let serviceAccount;

// En production (sur Render), on charge la clé depuis une variable d'environnement.
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("Clé de service Firebase chargée depuis la variable d'environnement.");
  } catch (e) {
    console.error("Erreur lors de l'analyse de la clé de service depuis la variable d'environnement.", e);
    process.exit(1);
  }
} else {
  // En développement, on charge le fichier local.
  try {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('Clé de service Firebase chargée depuis le fichier local serviceAccountKey.json.');
  } catch (e) {
    console.error(
      'ERREUR : Le fichier serviceAccountKey.json est introuvable.',
      'Veuillez suivre les instructions dans le code pour le configurer.',
      'Le serveur ne peut pas démarrer sans cette clé.'
    );
    process.exit(1); // Arrête le serveur si la clé est manquante
  }
}

const app = express();
const port = process.env.PORT || 3000;

// Initialisation de l'app Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
console.log('Connexion à Firebase initialisée.');

// --- Logique d'envoi de notification ---

/**
 * Envoie une notification push via FCM.
 * @param {string} topic Le sujet (topic) auquel envoyer la notification.
 * @param {string} title Le titre de la notification.
 * @param {string} body Le corps du message de la notification.
 */
async function sendNotification(topic, title, body) {
  if (!topic) {
    console.log('Aucun topic spécifié, notification non envoyée.');
    return;
  }

  const payload = {
    notification: {
      title: title,
      body: body,
    },
    topic: topic,
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log(`Notification envoyée avec succès au topic "${topic}" :`, response);
  } catch (error) {
    console.error(`Erreur lors de l'envoi de la notification au topic "${topic}" :`, error);
  }
}

// --- Écouteurs Firestore ---

// 1. Écouteur pour les nouveaux ÉVÉNEMENTS
db.collection('events').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      const event = change.doc.data();
      console.log('Nouvel événement détecté :', event.title);

      // Les événements sont toujours publics, on envoie à tout le monde.
      const topic = 'newPosts';
      const title = `Nouvel événement : ${event.title}`;
      const body = event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '');

      sendNotification(topic, title, body);
    }
  });
});

// 2. Écouteur pour les nouveaux BULLETINS
db.collection('bulletins').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      const bulletin = change.doc.data();
      console.log('Nouveau bulletin détecté :', bulletin.title);

      let topic;
      // Si targetInstitutionId est défini et non "all", on cible le topic de l'institution.
      if (bulletin.targetInstitutionId && bulletin.targetInstitutionId !== 'all') {
        topic = `institution_${bulletin.targetInstitutionId}`;
      } else {
        // Sinon, on envoie à tout le monde.
        topic = 'newPosts';
      }

      const title = `Nouveau bulletin : ${bulletin.title}`;
      const body = bulletin.description.substring(0, 100) + (bulletin.description.length > 100 ? '...' : '');

      sendNotification(topic, title, body);
    }
  });
});


// Route de base pour vérifier que le serveur fonctionne (Health Check)
app.get('/', (req, res) => {
  res.send('Serveur Anam Notifications est en ligne et écoute les changements Firestore !');
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur à l'écoute sur le port ${port}`);
});