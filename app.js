// =========================================================
// 1. CONFIGURAZIONE (Sostituisci con i tuoi dati reali!)
// =========================================================

// Vai su Firebase Console > Project Settings > General > CDN
// Import the functions you need from the SDKs you need
/* import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics"; */
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Import the functions you need from the SDKs you need
/* import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics"; */
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB3DLvx0RCMaQ7uTfC8fvUNkERucEtZ7eo",
  authDomain: "esamiapp-ec2d1.firebaseapp.com",
  projectId: "esamiapp-ec2d1",
  storageBucket: "esamiapp-ec2d1.firebasestorage.app",
  messagingSenderId: "91423222512",
  appId: "1:91423222512:web:0345b2e906162d521cf035",
  measurementId: "G-98CRSRG376"
};

// Initialize Firebase
/* const app = initializeApp(firebaseConfig); */
/* const analytics = getAnalytics(app); */

// Vai su Google Cloud Console > APIs & Services > Credentials
const GOOGLE_CLOUD_VISION_API_KEY = "AIzaSyCxhmbjJtOxzBa13B2L0Xc5YT9CorcKopw";

// =========================================================
// 2. INIZIALIZZAZIONE
// =========================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const { ref, reactive, onMounted, computed } = Vue;

const app = Vue.createApp({
    setup() {
        // --- STATO ---
        const vistaCorrente = ref('home'); 
        const loading = ref(true);
        const listaCorsi = ref([]);
        const listaStudenti = ref([]);
        const corsoSelezionato = ref(null);

        // Dialoghi e Form
        const dialogNuovoCorso = ref(false);
        const dialogScansione = ref(false);
        const nuovoCorso = reactive({ nome: '' });
        const scansioneTemp = reactive({ matricola: '', voto: '', cognome: '' });
        const anteprimaImg = ref('');

        const colonneStudenti = [
            { name: 'matricola', label: 'Matricola', field: 'matricola', align: 'left', sortable: true },
            { name: 'voto', label: 'Voto', field: 'voto', sortable: true, style: 'font-weight: bold' },
            { name: 'actions', label: '', field: 'actions' }
        ];

        // --- GESTIONE CORSI ---
        
        const caricaCorsi = async () => {
            loading.value = true;
            try {
                const snap = await db.collection('corsi').orderBy('createdAt', 'desc').get();
                listaCorsi.value = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            } catch (e) { console.error(e); }
            loading.value = false;
        };

        const salvaCorso = async () => {
            if(!nuovoCorso.nome) return;
            await db.collection('corsi').add({
                nome: nuovoCorso.nome,
                data: new Date().toLocaleDateString(),
                createdAt: new Date()
            });
            nuovoCorso.nome = '';
            caricaCorsi();
        };

        const eliminaCorso = async (id) => {
            Quasar.Dialog.create({
                title: 'Conferma',
                message: 'Eliminare il corso? I dati degli studenti rimarranno ma non saranno visibili.',
                cancel: true, persistent: true
            }).onOk(async () => {
                await db.collection('corsi').doc(id).delete();
                caricaCorsi();
            });
        };

        const apriCorso = async (corso) => {
            corsoSelezionato.value = corso;
            vistaCorrente.value = 'dettaglio';
            // Carica studenti
            const snap = await db.collection('studenti').where('corso_id', '==', corso.id).orderBy('data_scansione', 'desc').get();
            listaStudenti.value = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        };

        const tornaHome = () => {
            vistaCorrente.value = 'home';
            listaStudenti.value = [];
            corsoSelezionato.value = null;
        };

        // --- GESTIONE FOTOCAMERA E OCR ---

        const attivaCamera = () => document.getElementById('cameraInput').click();

        const processaImmagine = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            Quasar.Loading.show({ message: 'Analisi con Intelligenza Artificiale...' });

            try {
                // 1. Converti in Base64
                const base64 = await toBase64(file);
                anteprimaImg.value = "data:image/jpeg;base64," + base64;

                // 2. Chiama Google Vision
                const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`;
                const body = { requests: [{ image: { content: base64 }, features: [{ type: "TEXT_DETECTION" }] }] };
                
                const response = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
                
                // --- NUOVA GESTIONE ERRORI ---
                if (!response.ok) {
                    // Se c'è un errore HTTP (tipo 403 Forbidden), lo mostriamo
                    const errData = await response.json();
                    throw new Error(`Errore Server (${response.status}): ${errData.error ? errData.error.message : response.statusText}`);
                }

                const data = await response.json();
                
                // Controlliamo se Google ha risposto in modo strano
                if (!data.responses || data.responses.length === 0) {
                    throw new Error("Google non ha restituito dati.");
                }

                // Controlliamo se c'è un errore specifico nell'analisi
                if (data.responses[0].error) {
                    throw new Error("Errore API Google: " + data.responses[0].error.message);
                }
                
                // Controlliamo se ha trovato del testo
                if (!data.responses[0].fullTextAnnotation) {
                    throw new Error("Nessun testo trovato nell'immagine. Riprova con una foto più nitida.");
                }
                
                const fullText = data.responses[0].fullTextAnnotation.text;
                // alert("DEBUG TESTO: " + fullText.substring(0, 50)); // Decommenta se vuoi vedere il testo grezzo

                // 3. Estrai Dati (Logica Euristica)
                const clean = fullText.replace(/\|/g, '').replace(/_/g, '');
                
                const matricolaMatch = clean.match(/\b\d{6}\b/);
                const votoMatch = clean.match(/\b(1[8-9]|2[0-9]|3[0-1])\b/);

                scansioneTemp.matricola = matricolaMatch ? matricolaMatch[0] : '';
                scansioneTemp.voto = votoMatch ? votoMatch[0] : '';
                scansioneTemp.cognome = ''; 

                dialogScansione.value = true;

            } catch (e) {
                // Questo mostrerà l'errore VERO sul telefono invece di "undefined"
                alert("ERRORE: " + e.message); 
                Quasar.Notify.create({ type: 'negative', message: e.message });
            } finally {
                Quasar.Loading.hide();
                document.getElementById('cameraInput').value = ''; 
            }
        };

        const salvaScansioneDB = async () => {
            if(!scansioneTemp.matricola || !scansioneTemp.voto) {
                Quasar.Notify.create({ type: 'warning', message: 'Matricola o Voto mancanti!' });
                return;
            }

            await db.collection('studenti').add({
                corso_id: corsoSelezionato.value.id,
                matricola: scansioneTemp.matricola,
                voto: parseInt(scansioneTemp.voto),
                cognome: scansioneTemp.cognome,
                data_scansione: new Date()
            });

            Quasar.Notify.create({ type: 'positive', message: 'Esame archiviato!' });
            // Ricarica la lista senza uscire
            const snap = await db.collection('studenti').where('corso_id', '==', corsoSelezionato.value.id).orderBy('data_scansione', 'desc').get();
            listaStudenti.value = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        };

        const eliminaStudente = async (id) => {
             if(!confirm("Eliminare studente?")) return;
             await db.collection('studenti').doc(id).delete();
             // Aggiorna lista locale filtrando via quello cancellato
             listaStudenti.value = listaStudenti.value.filter(s => s.id !== id);
        };

        // Utility
        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });

        onMounted(caricaCorsi);

        return {
            vistaCorrente, loading, listaCorsi, listaStudenti, corsoSelezionato,
            dialogNuovoCorso, dialogScansione, nuovoCorso, scansioneTemp, anteprimaImg, colonneStudenti,
            caricaCorsi, salvaCorso, eliminaCorso, apriCorso, tornaHome,
            attivaCamera, processaImmagine, salvaScansioneDB, eliminaStudente,
            titoloApp: computed(() => vistaCorrente.value === 'home' ? 'I Miei Corsi' : corsoSelezionato.value.nome)
        };
    }
});

app.use(Quasar);
app.mount('#q-app');