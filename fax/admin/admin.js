import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, updateDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { firebaseConfig } from "../assets/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let requests = [];
let activeFilter = "paid";

const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginError = document.getElementById("loginError");
const whoEmail = document.getElementById("whoEmail");
const requestList = document.getElementById("requestList");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");

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

function formatDate(ts) {
    if (!ts?.toDate) return "";
    return ts.toDate().toLocaleString();
}

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
            loginError.textContent = "This account isn't authorized for the Fax Service admin yet. Ask Jimmy to add your UID to the admins list.";
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
    await loadRequests();
});

async function loadRequests() {
    const snap = await getDocs(query(collection(db, "faxRequests"), orderBy("createdAt", "desc")));
    requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
}

document.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeFilter = btn.getAttribute("data-filter");
        render();
    });
});

function render() {
    const visible = activeFilter === "all" ? requests : requests.filter((r) => r.status === activeFilter);
    if (!visible.length) {
        requestList.innerHTML = "";
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;

    requestList.innerHTML = visible.map((r) => `
        <div class="request-card" data-id="${r.id}">
            <div class="request-top">
                <span class="request-fax">${escapeHtml(r.recipientFax)}${r.recipientName ? " &middot; " + escapeHtml(r.recipientName) : ""}</span>
                <span class="status-pill ${r.status}">${(r.status || "").replace("_", " ")}</span>
            </div>
            <div class="request-meta">
                <span>From: ${escapeHtml(r.senderName)} &middot; ${escapeHtml(r.senderPhone)} &middot; ${escapeHtml(r.senderEmail)}</span>
                <span>Submitted: ${formatDate(r.createdAt)}${r.paidAt ? " &middot; Paid: " + formatDate(r.paidAt) : ""}${r.sentAt ? " &middot; Sent: " + formatDate(r.sentAt) : ""}</span>
            </div>
            ${r.note ? `<div class="request-note">${escapeHtml(r.note)}</div>` : ""}
            <div class="request-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-view-doc="${r.id}">View document</button>
                ${r.status === "paid" ? `<button type="button" class="btn btn-primary btn-sm" data-mark-sent="${r.id}">Mark as sent</button>` : ""}
            </div>
        </div>
    `).join("");

    requestList.querySelectorAll("[data-view-doc]").forEach((btn) => {
        btn.addEventListener("click", () => viewDocument(btn.getAttribute("data-view-doc")));
    });
    requestList.querySelectorAll("[data-mark-sent]").forEach((btn) => {
        btn.addEventListener("click", () => markSent(btn.getAttribute("data-mark-sent")));
    });
}

async function viewDocument(id) {
    const r = requests.find((x) => x.id === id);
    if (!r) return;
    try {
        const url = await getDownloadURL(ref(storage, r.storagePath));
        window.open(url, "_blank", "noopener");
    } catch (err) {
        showToast("Couldn't open document: " + (err.code || err.message), true);
    }
}

async function markSent(id) {
    try {
        await updateDoc(doc(db, "faxRequests", id), { status: "sent", sentAt: serverTimestamp() });
        await loadRequests();
        showToast("Marked as sent");
    } catch (err) {
        showToast("Couldn't update: " + (err.code || err.message), true);
    }
}
