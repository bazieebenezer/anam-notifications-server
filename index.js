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

console.log('Début du chargement de la clé de service Firebase...');
// En production (sur Render), on charge la clé depuis une variable d'environnement.
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.log('Variable d\'environnement FIREBASE_SERVICE_ACCOUNT_KEY détectée.');
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    console.log("Clé de service Firebase chargée et parsée avec succès depuis la variable d'environnement.");
  } catch (e) {
    console.error("ERREUR CRITIQUE: Erreur lors de l'analyse de la clé de service depuis la variable d'environnement.", e);
    process.exit(1);
  }
} else {
  console.log('Variable d\'environnement FIREBASE_SERVICE_ACCOUNT_KEY non détectée, tentative de chargement du fichier local.');
  // En développement, on charge le fichier local.
  try {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('Clé de service Firebase chargée avec succès depuis le fichier local serviceAccountKey.json.');
  } catch (e) {
    console.error(
      'ERREUR CRITIQUE : Le fichier serviceAccountKey.json est introuvable ou illisible.',
      'Veuillez suivre les instructions dans le code pour le configurer.',
      'Le serveur ne peut pas démarrer sans cette clé.', e
    );
    process.exit(1);
  }
}

const app = express();
const port = process.env.PORT || 3000;

console.log('Tentative d\'initialisation de l\'application Firebase Admin...');
// Initialisation de l\'app Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
console.log('Application Firebase Admin initialisée avec succès.');

const db = admin.firestore();
console.log('Connexion à Firestore établie.');


// --- Logique d'envoi de notification ---

/**
 * Envoie une notification push via FCM.
 * @param {string} topic Le sujet (topic) auquel envoyer la notification.
 * @param {string} title Le titre de la notification.
 * @param {string} body Le corps du message de la notification.
 */
async function sendNotification(topic, title, body) {
  if (!topic) {
    console.log('Aucun topic spécifié, notification non envoyée. Vérifiez bien les topics.');
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