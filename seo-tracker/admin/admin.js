import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "../assets/firebase-config.js";
import { stepsForTrack, phasesForTrack, TRACK_LABELS } from "../assets/checklist-templates.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- State ----------
let clients = []; // [{id, name, contactName, trackType, createdAt, stepStatus}]
let activeClientId = null;

// ---------- DOM ----------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginError = document.getElementById("loginError");
const whoEmail = document.getElementById("whoEmail");
const clientList = document.getElementById("clientList");
const emptyState = document.getElementById("emptyState");
const clientDetail = document.getElementById("clientDetail");
const detailName = document.getElementById("detailName");
const detailTrack = document.getElementById("detailTrack");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const phasesRoot = document.getElementById("phasesRoot");
const toast = document.getElementById("toast");
const newClientModal = document.getElementById("newClientModal");

function showToast(msg, isErr) {
    toast.textContent = msg;
    toast.classList.toggle("err", !!isErr);
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function clientProgress(clientData) {
    const steps = stepsForTrack(clientData.trackType);
    const total = steps.length;
    const done = steps.filter((s) => clientData.stepStatus?.[s.id]?.status === "done").length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---------- Auth ----------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    loginError.classList.remove("show");
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        loginError.textContent = "Sign-in failed: " + (err.code || err.message || "unknown error");
        loginError.classList.add("show");
    }
});

document.getElementById("signOutBtn").addEventListener("click", () => firebaseSignOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        appShell.classList.remove("active");
        loginScreen.style.display = "flex";
        return;
    }
    try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (!adminDoc.exists()) {
            loginError.textContent = "This account isn't authorized for the SEO Tracker yet. Ask Jimmy to add your UID to the admins list.";
            loginError.classList.add("show");
            await firebaseSignOut(auth);
            return;
        }
    } catch (err) {
        loginError.textContent = "Couldn't verify admin access: " + (err.code || err.message);
        loginError.classList.add("show");
        await firebaseSignOut(auth);
        return;
    }

    loginScreen.style.display = "none";
    appShell.classList.add("active");
    whoEmail.textContent = user.email;
    await loadClients();
});

// ---------- Client list ----------
async function loadClients() {
    const snap = await getDocs(query(collection(db, "clients"), orderBy("createdAt", "desc")));
    clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderClientList();
    if (activeClientId) {
        const still = clients.find((c) => c.id === activeClientId);
        if (still) renderClientDetail(still);
        else { activeClientId = null; clientDetail.hidden = true; emptyState.hidden = false; }
    }
}

function renderClientList() {
    if (!clients.length) {
        clientList.innerHTML = '<p class="muted" style="font-size:13px;">No clients yet.</p>';
        return;
    }
    clientList.innerHTML = clients.map((c) => {
        const { done, total, pct } = clientProgress(c);
        return `<div class="client-item ${c.id === activeClientId ? "active" : ""}" data-id="${c.id}">
            <span class="name">${escapeHtml(c.name)}</span>
            <span class="meta"><span>${TRACK_LABELS[c.trackType] || c.trackType}</span><span>${done}/${total} &middot; ${pct}%</span></span>
        </div>`;
    }).join("");
    clientList.querySelectorAll(".client-item").forEach((el) => {
        el.addEventListener("click", () => {
            activeClientId = el.getAttribute("data-id");
            const c = clients.find((x) => x.id === activeClientId);
            renderClientList();
            renderClientDetail(c);
        });
    });
}

// ---------- Client detail ----------
function renderClientDetail(c) {
    emptyState.hidden = true;
    clientDetail.hidden = false;
    detailName.textContent = c.name;
    detailTrack.textContent = TRACK_LABELS[c.trackType] || c.trackType;

    const { done, total, pct } = clientProgress(c);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${done} / ${total} steps (${pct}%)`;

    const phases = phasesForTrack(c.trackType);
    phasesRoot.innerHTML = phases.map((phase) => `
        <div class="phase">
            <div class="phase-title">${escapeHtml(phase.title)}</div>
            ${phase.steps.map((s) => {
                const status = c.stepStatus?.[s.id]?.status || "todo";
                const isDone = status === "done";
                return `<div class="step ${isDone ? "done" : ""}" data-step-id="${s.id}">
                    <input type="checkbox" ${isDone ? "checked" : ""} data-step-checkbox="${s.id}">
                    <div class="step-body">
                        <div class="step-title" data-step-toggle="${s.id}">${escapeHtml(s.title)}</div>
                        <span class="step-howto-toggle" data-howto-toggle="${s.id}">How to &rsaquo;</span>
                        <div class="step-howto" data-howto="${s.id}" hidden>${escapeHtml(s.howTo)}</div>
                    </div>
                </div>`;
            }).join("")}
        </div>
    `).join("");

    phasesRoot.querySelectorAll("[data-step-checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => toggleStep(c.id, cb.getAttribute("data-step-checkbox"), cb.checked));
    });
    phasesRoot.querySelectorAll("[data-step-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-step-toggle");
            const cb = phasesRoot.querySelector(`[data-step-checkbox="${id}"]`);
            cb.checked = !cb.checked;
            toggleStep(c.id, id, cb.checked);
        });
    });
    phasesRoot.querySelectorAll("[data-howto-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-howto-toggle");
            const body = phasesRoot.querySelector(`[data-howto="${id}"]`);
            const nowHidden = !body.hasAttribute("hidden");
            body.toggleAttribute("hidden", nowHidden);
            el.textContent = nowHidden ? "How to ›" : "Hide how to";
        });
    });
}

async function toggleStep(clientId, stepId, isDone) {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    c.stepStatus = c.stepStatus || {};
    c.stepStatus[stepId] = { status: isDone ? "done" : "todo", completedAt: isDone ? new Date().toISOString() : null };
    try {
        await updateDoc(doc(db, "clients", clientId), { stepStatus: c.stepStatus, updatedAt: serverTimestamp() });
        renderClientList();
        renderClientDetail(c);
    } catch (err) {
        showToast("Couldn't save: " + (err.code || err.message), true);
    }
}

// ---------- New client ----------
document.getElementById("newClientBtn").addEventListener("click", () => { newClientModal.hidden = false; });
document.getElementById("cancelNewClientBtn").addEventListener("click", () => { newClientModal.hidden = true; });

document.getElementById("newClientForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("newClientName").value.trim();
    const contactName = document.getElementById("newClientContact").value.trim();
    const trackType = document.getElementById("newClientTrack").value;
    if (!name) return;

    const steps = stepsForTrack(trackType);
    const stepStatus = {};
    steps.forEach((s) => { stepStatus[s.id] = { status: "todo", completedAt: null }; });

    try {
        const ref = await addDoc(collection(db, "clients"), {
            name, contactName, trackType, stepStatus, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        newClientModal.hidden = true;
        document.getElementById("newClientForm").reset();
        activeClientId = ref.id;
        await loadClients();
        showToast("Client created");
    } catch (err) {
        showToast("Couldn't create client: " + (err.code || err.message), true);
    }
});

// ---------- Delete / share ----------
document.getElementById("deleteClientBtn").addEventListener("click", async () => {
    if (!activeClientId) return;
    const c = clients.find((x) => x.id === activeClientId);
    if (!confirm(`Delete "${c?.name}"? This can't be undone.`)) return;
    try {
        await deleteDoc(doc(db, "clients", activeClientId));
        activeClientId = null;
        clientDetail.hidden = true;
        emptyState.hidden = false;
        await loadClients();
        showToast("Client deleted");
    } catch (err) {
        showToast("Couldn't delete: " + (err.code || err.message), true);
    }
});

document.getElementById("copyLinkBtn").addEventListener("click", async () => {
    if (!activeClientId) return;
    const url = `${location.origin}/seo-tracker/progress.html?c=${activeClientId}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast("Share link copied");
    } catch {
        prompt("Copy this link:", url);
    }
});
