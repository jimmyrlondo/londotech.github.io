import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "../assets/firebase-config.js";
import { stepsForTrack, phasesForTrack, TRACK_LABELS } from "../assets/checklist-templates.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// A new client starts with these as blank rows to fill in (or delete) --
// just the platforms almost every engagement touches, not an attempt to
// guess every one up front.
const DEFAULT_CREDENTIAL_PLATFORMS = [
    "Google Business Profile", "Google Analytics (GA4)", "Google Search Console",
    "Bing Webmaster Tools / Bing Places", "Yelp for Business", "Facebook Business",
    "Instagram", "Website CMS / hosting", "Domain registrar",
];

// ---------- State ----------
let clients = []; // [{id, name, contactName, trackType, createdAt, stepStatus}]
let activeClientId = null;
let credentials = []; // [{id, platform, username, password, notes}] for the active client
let editingCredId = null;

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
const credsList = document.getElementById("credsList");
const credModal = document.getElementById("credModal");
const credModalTitle = document.getElementById("credModalTitle");

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

// Steps marked "n/a" (doesn't apply to this client) are dropped from both
// sides of the fraction, not just left unchecked, so a client who doesn't
// need e.g. a Nextdoor listing isn't stuck below 100% forever over it.
function clientProgress(clientData) {
    const steps = stepsForTrack(clientData.trackType).filter((s) => clientData.stepStatus?.[s.id]?.status !== "na");
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
            loadCredentials(activeClientId);
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
                const isNa = status === "na";
                return `<div class="step ${isDone ? "done" : ""} ${isNa ? "na" : ""}" data-step-id="${s.id}">
                    <input type="checkbox" ${isDone ? "checked" : ""} ${isNa ? "disabled" : ""} data-step-checkbox="${s.id}">
                    <div class="step-body">
                        <div class="step-title" data-step-toggle="${s.id}">${escapeHtml(s.title)}${isNa ? ' <span class="na-tag">Not applicable</span>' : ""}</div>
                        ${isNa ? "" : `<span class="step-howto-toggle" data-howto-toggle="${s.id}">How to &rsaquo;</span>`}
                        <span class="step-na-toggle" data-na-toggle="${s.id}">${isNa ? "Mark as applicable" : "Mark N/A"}</span>
                        <div class="step-howto" data-howto="${s.id}" hidden>${escapeHtml(s.howTo)}</div>
                    </div>
                </div>`;
            }).join("")}
        </div>
    `).join("");

    phasesRoot.querySelectorAll("[data-step-checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => setStepStatus(c.id, cb.getAttribute("data-step-checkbox"), cb.checked ? "done" : "todo"));
    });
    phasesRoot.querySelectorAll("[data-step-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-step-toggle");
            const cb = phasesRoot.querySelector(`[data-step-checkbox="${id}"]`);
            if (cb.disabled) return; // n/a steps don't toggle via the title
            cb.checked = !cb.checked;
            setStepStatus(c.id, id, cb.checked ? "done" : "todo");
        });
    });
    phasesRoot.querySelectorAll("[data-na-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.getAttribute("data-na-toggle");
            const currentlyNa = (c.stepStatus?.[id]?.status || "todo") === "na";
            setStepStatus(c.id, id, currentlyNa ? "todo" : "na");
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

async function setStepStatus(clientId, stepId, status) {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    c.stepStatus = c.stepStatus || {};
    c.stepStatus[stepId] = { status, completedAt: status === "done" ? new Date().toISOString() : null };
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
        await Promise.all(DEFAULT_CREDENTIAL_PLATFORMS.map((platform) =>
            addDoc(collection(db, "clients", ref.id, "credentials"), {
                platform, username: "", password: "", notes: "", createdAt: serverTimestamp(),
            })
        ));
        newClientModal.hidden = true;
        document.getElementById("newClientForm").reset();
        activeClientId = ref.id;
        await loadClients();
        await loadCredentials(activeClientId);
        showToast("Client created");
    } catch (err) {
        showToast("Couldn't create client: " + (err.code || err.message), true);
    }
});

// ---------- Credentials ----------
async function loadCredentials(clientId) {
    const snap = await getDocs(query(collection(db, "clients", clientId, "credentials"), orderBy("createdAt", "asc")));
    credentials = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCredentials();
}

function renderCredentials() {
    if (!credentials.length) {
        credsList.innerHTML = '<p class="muted" style="font-size:13px;">No credentials saved yet.</p>';
        return;
    }
    credsList.innerHTML = credentials.map((cred) => `
        <div class="cred-row" data-cred-id="${cred.id}">
            <span class="cred-platform">${escapeHtml(cred.platform)}</span>
            <span class="cred-field ${cred.username ? "" : "empty"}">${cred.username ? escapeHtml(cred.username) : "not set"}</span>
            <span class="cred-field ${cred.password ? "" : "empty"}" data-pw-cell>
                ${cred.password ? `<span data-pw-masked>${"&bull;".repeat(Math.min(cred.password.length, 10))}</span><span data-pw-plain hidden>${escapeHtml(cred.password)}</span><span class="show-pw-toggle" data-pw-toggle>show</span>` : "not set"}
            </span>
            <span class="cred-notes">${cred.notes ? escapeHtml(cred.notes) : ""}</span>
            <span class="cred-actions">
                <button type="button" data-cred-edit="${cred.id}">Edit</button>
                <button type="button" class="del" data-cred-delete="${cred.id}">Delete</button>
            </span>
        </div>
    `).join("");

    credsList.querySelectorAll("[data-pw-toggle]").forEach((el) => {
        el.addEventListener("click", () => {
            const cell = el.closest("[data-pw-cell]");
            const masked = cell.querySelector("[data-pw-masked]");
            const plain = cell.querySelector("[data-pw-plain]");
            const nowShowing = plain.hasAttribute("hidden");
            masked.hidden = nowShowing;
            plain.hidden = !nowShowing;
            el.textContent = nowShowing ? "hide" : "show";
        });
    });
    credsList.querySelectorAll("[data-cred-edit]").forEach((el) => {
        el.addEventListener("click", () => openCredModal(el.getAttribute("data-cred-edit")));
    });
    credsList.querySelectorAll("[data-cred-delete]").forEach((el) => {
        el.addEventListener("click", () => deleteCredential(el.getAttribute("data-cred-delete")));
    });
}

function openCredModal(credId) {
    editingCredId = credId || null;
    const cred = credId ? credentials.find((c) => c.id === credId) : null;
    credModalTitle.textContent = cred ? "Edit credential" : "Add credential";
    document.getElementById("credPlatform").value = cred?.platform || "";
    document.getElementById("credUsername").value = cred?.username || "";
    document.getElementById("credPassword").value = cred?.password || "";
    document.getElementById("credNotes").value = cred?.notes || "";
    credModal.hidden = false;
}

document.getElementById("addCredBtn").addEventListener("click", () => openCredModal(null));
document.getElementById("cancelCredBtn").addEventListener("click", () => { credModal.hidden = true; });

document.getElementById("credForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeClientId) return;
    const data = {
        platform: document.getElementById("credPlatform").value.trim(),
        username: document.getElementById("credUsername").value.trim(),
        password: document.getElementById("credPassword").value,
        notes: document.getElementById("credNotes").value.trim(),
    };
    if (!data.platform) return;
    try {
        if (editingCredId) {
            await updateDoc(doc(db, "clients", activeClientId, "credentials", editingCredId), data);
        } else {
            await addDoc(collection(db, "clients", activeClientId, "credentials"), { ...data, createdAt: serverTimestamp() });
        }
        credModal.hidden = true;
        await loadCredentials(activeClientId);
        showToast("Credential saved");
    } catch (err) {
        showToast("Couldn't save credential: " + (err.code || err.message), true);
    }
});

async function deleteCredential(credId) {
    if (!activeClientId) return;
    if (!confirm("Delete this credential?")) return;
    try {
        await deleteDoc(doc(db, "clients", activeClientId, "credentials", credId));
        await loadCredentials(activeClientId);
    } catch (err) {
        showToast("Couldn't delete: " + (err.code || err.message), true);
    }
}

document.getElementById("printCredsBtn").addEventListener("click", () => {
    if (!activeClientId) return;
    const c = clients.find((x) => x.id === activeClientId);
    document.getElementById("printClientName").textContent = (c?.name || "Client") + ": Login & Password Reference";
    document.getElementById("printDate").textContent = "Printed " + new Date().toLocaleDateString();
    document.getElementById("printTableBody").innerHTML = credentials.map((cred) => `
        <tr>
            <td>${escapeHtml(cred.platform)}</td>
            <td>${escapeHtml(cred.username || "")}</td>
            <td>${escapeHtml(cred.password || "")}</td>
            <td>${escapeHtml(cred.notes || "")}</td>
        </tr>
    `).join("");

    document.body.classList.add("printing-creds");
    const restore = () => { document.body.classList.remove("printing-creds"); window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(() => window.print(), 50);
    setTimeout(restore, 60000);
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
