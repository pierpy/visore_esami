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
const storage = firebase.storage(); // <--- NUOVO: Inizializziamo lo Storage
const { ref, reactive, onMounted, computed } = Vue;
const { exportFile, useQuasar } = Quasar; 

const app = Vue.createApp({
    setup() {
        const $q = useQuasar(); 

        // --- STATO ---
        const vistaCorrente = ref('home'); 
        const loading = ref(true);
        const listaCorsi = ref([]);
        const listaStudenti = ref([]);
        const corsoSelezionato = ref(null);
        const testoRicerca = ref('');

        // Dialoghi
        const dialogNuovoCorso = ref(false);
        const dialogStudente = ref(false);
        const dialogFotoProva = ref(false); // <--- NUOVO: Dialogo per vedere la foto salvata
        const fotoProvaUrl = ref('');       // <--- NUOVO: URL della foto da mostrare
        
        const nuovoCorso = reactive({ nome: '' });
        
        const studenteForm = reactive({ 
            id: null, 
            matricola: '', 
            nome: '', 
            cognome: '', 
            voto: '',
            foto_url: '' // <--- NUOVO: Qui salveremo il link della foto
        });
        
        const anteprimaImg = ref(''); // Foto temporanea (appena scattata)

        // --- CALCOLO STATISTICHE ---
        const statistiche = computed(() => {
            const tot = listaStudenti.value.length;
            if (tot === 0) return { media: 0, promossi: 0, bocciati: 0, totale: 0 };
            const votiValidi = listaStudenti.value.filter(s => s.voto >= 18);
            const sommaVoti = votiValidi.reduce((acc, s) => acc + s.voto, 0);
            const media = votiValidi.length > 0 ? (sommaVoti / votiValidi.length).toFixed(1) : 0;
            return {
                media: media,
                promossi: votiValidi.length,
                bocciati: listaStudenti.value.filter(s => s.voto < 18).length,
                totale: tot
            };
        });

        const studentiFiltrati = computed(() => {
            if (!testoRicerca.value) return listaStudenti.value;
            const search = testoRicerca.value.toLowerCase();
            return listaStudenti.value.filter(s => 
                s.matricola.includes(search) || 
                (s.cognome && s.cognome.toLowerCase().includes(search)) ||
                (s.nome && s.nome.toLowerCase().includes(search))
            );
        });

        const scaricaExcel = () => {
            if (listaStudenti.value.length === 0) return;
            let csvContent = "Matricola;Cognome;Nome;Voto;Data;Link Prova\n";
            listaStudenti.value.forEach(row => {
                let dataStr = row.data_scansione && row.data_scansione.toDate ? row.data_scansione.toDate().toLocaleDateString() : "";
                // Aggiungiamo anche il link della foto nell'Excel
                csvContent += `${row.matricola};${row.cognome || ''};${row.nome || ''};${row.voto};${dataStr};${row.foto_url || ''}\n`;
            });
            const status = exportFile('esami_export.csv', csvContent, 'text/csv');
            if (!status) $q.notify({ message: 'Download bloccato', color: 'negative' });
        };

        // --- LOGICA ---

        const apriInserimentoManuale = () => {
            studenteForm.id = null;
            studenteForm.matricola = '';
            studenteForm.nome = '';
            studenteForm.cognome = '';
            studenteForm.voto = '';
            studenteForm.foto_url = '';
            anteprimaImg.value = ''; 
            dialogStudente.value = true;
        };

        const modificaStudente = (row) => {
            studenteForm.id = row.id;
            studenteForm.matricola = row.matricola;
            studenteForm.nome = row.nome || '';
            studenteForm.cognome = row.cognome || '';
            studenteForm.voto = row.voto;
            studenteForm.foto_url = row.foto_url || ''; // Carichiamo il link esistente
            anteprimaImg.value = ''; 
            dialogStudente.value = true;
        };

        const mostraFotoProva = (url) => {
            fotoProvaUrl.value = url;
            dialogFotoProva.value = true;
        };

        // --- SALVATAGGIO CON UPLOAD FOTO ---
        const salvaStudenteDB = async () => {
            if(!studenteForm.matricola || !studenteForm.voto) {
                $q.notify({ type: 'warning', message: 'Dati obbligatori mancanti!' });
                return;
            }

            $q.loading.show({ message: 'Salvataggio e upload foto...' });

            try {
                let downloadURL = studenteForm.foto_url; // Mantiene quella vecchia se c'è

                // SE C'È UNA NUOVA FOTO SCATTATA (anteprimaImg piena), LA CARICHIAMO
                if (anteprimaImg.value && anteprimaImg.value.startsWith('data:image')) {
                    // 1. Crea nome file unico
                    const nomeFile = `prove_esame/${new Date().getTime()}_${studenteForm.matricola}.jpg`;
                    const storageRef = storage.ref().child(nomeFile);
                    
                    // 2. Carica la stringa Base64 (togliendo l'intestazione data:image...)
                    const rawBase64 = anteprimaImg.value.split(',')[1];
                    await storageRef.putString(rawBase64, 'base64');
                    
                    // 3. Ottieni il link pubblico
                    downloadURL = await storageRef.getDownloadURL();
                }

                const datiDaSalvare = {
                    corso_id: corsoSelezionato.value.id,
                    matricola: studenteForm.matricola,
                    nome: studenteForm.nome,
                    cognome: studenteForm.cognome,
                    voto: parseInt(studenteForm.voto),
                    data_scansione: new Date(),
                    foto_url: downloadURL // Salviamo il link nel database
                };

                if (studenteForm.id) {
                    await db.collection('studenti').doc(studenteForm.id).update(datiDaSalvare);
                    $q.notify({ type: 'positive', message: 'Aggiornato!' });
                } else {
                    await db.collection('studenti').add(datiDaSalvare);
                    $q.notify({ type: 'positive', message: 'Salvato con prova!' });
                }
                
                dialogStudente.value = false;
                apriCorso(corsoSelezionato.value); 
            } catch (e) {
                console.error(e);
                $q.notify({ type: 'negative', message: 'Errore upload: ' + e.message });
            } finally {
                $q.loading.hide();
            }
        };

        const attivaCamera = () => document.getElementById('cameraInput').click();

        const processaImmagine = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            $q.loading.show({ message: 'Analisi IA...' });

            try {
                const base64 = await toBase64(file);
                studenteForm.id = null; 
                studenteForm.nome = '';
                studenteForm.cognome = '';
                studenteForm.foto_url = ''; // Reset
                
                anteprimaImg.value = "data:image/jpeg;base64," + base64;

                const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`;
                const body = { requests: [{ image: { content: base64 }, features: [{ type: "TEXT_DETECTION" }] }] };
                
                const response = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
                if (!response.ok) throw new Error("Errore API Google");

                const data = await response.json();
                if (!data.responses || !data.responses[0].fullTextAnnotation) throw new Error("Nessun testo trovato.");
                
                const fullText = data.responses[0].fullTextAnnotation.text;
                const clean = fullText.replace(/\|/g, '').replace(/_/g, '');
                
                const matricolaMatch = clean.match(/\b\d{6}\b/);
                const votoMatch = clean.match(/\b(1[8-9]|2[0-9]|3[0-1])\b/);

                studenteForm.matricola = matricolaMatch ? matricolaMatch[0] : '';
                studenteForm.voto = votoMatch ? votoMatch[0] : '';
                
                dialogStudente.value = true;

            } catch (e) {
                $q.notify({ type: 'negative', message: e.message });
            } finally {
                $q.loading.hide();
                document.getElementById('cameraInput').value = ''; 
            }
        };

        // --- ALTRE FUNZIONI ---
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
            await db.collection('corsi').add({ nome: nuovoCorso.nome, data: new Date().toLocaleDateString(), createdAt: new Date() });
            nuovoCorso.nome = '';
            caricaCorsi();
        };

        const eliminaCorso = async (id) => {
            if(!confirm("Eliminare corso?")) return;
            await db.collection('corsi').doc(id).delete();
            caricaCorsi();
        };

        const apriCorso = async (corso) => {
            corsoSelezionato.value = corso;
            testoRicerca.value = '';
            vistaCorrente.value = 'dettaglio';
            loading.value = true;
            try {
                const snap = await db.collection('studenti').where('corso_id', '==', corso.id).orderBy('data_scansione', 'desc').get();
                listaStudenti.value = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            } catch(e) { console.error(e); }
            loading.value = false;
        };

        const tornaHome = () => {
            vistaCorrente.value = 'home';
            listaStudenti.value = [];
            corsoSelezionato.value = null;
        };

        const eliminaStudente = async (id) => {
             if(!confirm("Eliminare studente?")) return;
             await db.collection('studenti').doc(id).delete();
             listaStudenti.value = listaStudenti.value.filter(s => s.id !== id);
        };

        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });

        onMounted(caricaCorsi);

        return {
            vistaCorrente, loading, listaCorsi, listaStudenti, corsoSelezionato,
            dialogNuovoCorso, dialogStudente, dialogFotoProva, fotoProvaUrl, // <--- Esposti
            nuovoCorso, studenteForm, anteprimaImg,
            statistiche, studentiFiltrati, testoRicerca, scaricaExcel,
            caricaCorsi, salvaCorso, eliminaCorso, apriCorso, tornaHome,
            attivaCamera, processaImmagine, salvaStudenteDB, eliminaStudente,
            apriInserimentoManuale, modificaStudente, mostraFotoProva,
            titoloApp: computed(() => vistaCorrente.value === 'home' ? 'I Miei Corsi' : corsoSelezionato.value.nome)
        };
    }
});

app.use(Quasar);
app.mount('#q-app');