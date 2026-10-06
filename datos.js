// Conexión de Paskis ERP con Firebase (base de datos en la nube + inicio de sesión)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs, writeBatch, increment } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvcBunSLzlFB0ygzQsoCLQbF5-_7SQYvo",
  authDomain: "paskis-erp.firebaseapp.com",
  projectId: "paskis-erp",
  storageBucket: "paskis-erp.firebasestorage.app",
  messagingSenderId: "756948999080",
  appId: "1:756948999080:web:b705fbb7ec345e51cfdb9d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ---------- Sesión ----------
export function requerirSesion() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, u => { if (u) resolve(u); else location.replace('login.html'); });
  });
}
export const usuarioActual = () => new Promise(r => { const off = onAuthStateChanged(auth, u => { off(); r(u); }); });
export const entrar = (email, pass) => signInWithEmailAndPassword(auth, email, pass);
export const salir = () => signOut(auth).then(() => location.replace('login.html'));
export const recuperarClave = email => sendPasswordResetEmail(auth, email);

// ---------- Datos ----------
const limpiarUndef = o => JSON.parse(JSON.stringify(o));
// Escucha una colección en tiempo real; cb recibe un arreglo [{id, ...}]
export function escuchar(col, cb) {
  return onSnapshot(collection(db, col),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    e => { console.error(e); aviso('No se pudieron cargar los datos: ' + e.message); });
}
export function guardar(col, obj) {
  const { id, ...data } = obj;
  return setDoc(doc(db, col, id), limpiarUndef(data)).catch(e => { aviso('No se pudo guardar: ' + e.message); throw e; });
}
export function borrar(col, id) {
  return deleteDoc(doc(db, col, id)).catch(e => { aviso('No se pudo eliminar: ' + e.message); throw e; });
}
export function sumar(col, id, campo, n) {
  return setDoc(doc(db, col, id), { [campo]: increment(n) }, { merge: true }).catch(e => { aviso('No se pudo guardar: ' + e.message); throw e; });
}
export async function obtener(col, id) {
  const s = await getDoc(doc(db, col, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function aviso(msg) { try { alert(msg); } catch (e) { console.error(msg); } }

// ---------- Migración desde el navegador (datos guardados antes de la nube) ----------
export async function migrarLocal() {
  let P = [], I = [], S = {};
  try {
    if (localStorage.getItem('paskis_migrado')) return 0;
    P = JSON.parse(localStorage.getItem('paskis_productos') || '[]');
    I = JSON.parse(localStorage.getItem('paskis_ingredientes') || '[]');
    S = JSON.parse(localStorage.getItem('paskis_stock') || '{}');
  } catch (e) { return 0; }
  const total = P.length + I.length + Object.keys(S).length;
  if (!total) return 0;
  const [rp, ri] = await Promise.all([getDocs(collection(db, 'productos')), getDocs(collection(db, 'ingredientes'))]);
  const marcar = () => { try { localStorage.setItem('paskis_migrado', '1'); } catch (e) {} };
  if (!rp.empty || !ri.empty) { marcar(); return 0; }
  if (!confirm(`Encontramos datos guardados en este navegador (${P.length} productos, ${I.length} ingredientes). ¿Quieres subirlos a la nube para verlos desde cualquier equipo?`)) { marcar(); return 0; }
  const batch = writeBatch(db);
  const ahora = Date.now();
  P.forEach((p, i) => { const { id, ...d } = p; batch.set(doc(db, 'productos', id), limpiarUndef({ ...d, creado: d.creado || ahora - i })); });
  I.forEach((x, i) => { const { id, ...d } = x; batch.set(doc(db, 'ingredientes', id), limpiarUndef({ ...d, creado: d.creado || ahora - i })); });
  Object.entries(S).forEach(([id, n]) => { if (P.find(p => p.id === id)) batch.set(doc(db, 'stock', id), { cantidad: Number(n) || 0 }); });
  await batch.commit();
  marcar();
  return total;
}
