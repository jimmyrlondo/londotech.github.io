import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
    getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";
import { firebaseConfig } from "../assets/firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ---------- State ----------
let currentCatalogId = "cutting-drilling-milling";
let allProducts = [];
let activeCategory = "All";
let activeProductId = null; // null = nothing selected; "__new__" = unsaved new product
let editingDraft = null;
let knownSizes = null;

// The 6 real Kromhard catalogs, matching their actual site categories.
// Only "Cutting, Drilling and Milling" has real product data so far (from
// the Hole Making PDF) -- the other 5 exist here so the admin picker shows
// the full planned structure, and so new catalogs don't need code changes
// to appear, just products tagged with their catalogId.
const DEFAULT_CATALOGS = [
    { id: "cutting-drilling-milling", name: "Cutting, Drilling and Milling" },
    { id: "threading-thread-repair", name: "Threading & Thread Repair Tools" },
    { id: "hand-power-tools", name: "Hand Tools and Power Tools" },
    { id: "precision-measuring", name: "Precision Measuring Tools" },
    { id: "industrial-chemicals", name: "Industrial Chemicals & Fluids" },
    { id: "workholding-material-handling", name: "Workholding & Material Handling" },
];

// ---------- DOM refs ----------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginError = document.getElementById("loginError");
const whoEmail = document.getElementById("whoEmail");
const catalogSelect = document.getElementById("catalogSelect");
const categoryChips = document.getElementById("categoryChips");
const productList = document.getElementById("productList");
const emptyState = document.getElementById("emptyState");
const editorRoot = document.getElementById("editorRoot");
const toast = document.getElementById("toast");

// ---------- Utilities ----------
function showToast(msg, isErr) {
    toast.textContent = msg;
    toast.classList.toggle("err", !!isErr);
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
}

function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function loadKnownSizes() {
    if (knownSizes) return knownSizes;
    const res = await fetch("known-sizes.json");
    knownSizes = await res.json();
    return knownSizes;
}

function buildSizeDatalistHtml() {
    if (!knownSizes) return "";
    const seen = new Set();
    const opts = [];
    for (const item of knownSizes.mostCommon) {
        if (seen.has(item.value)) continue;
        seen.add(item.value);
        opts.push(item.value);
    }
    for (const g of knownSizes.groups) {
        for (const item of g.sizes) {
            if (seen.has(item.value)) continue;
            seen.add(item.value);
            opts.push(item.value);
        }
    }
    return `<datalist id="knownSizesList">${opts.map(v => `<option value="${escapeHtml(v)}">`).join("")}</datalist>`;
}

// ---------- Auth ----------
document.getElementById("loginBtn").addEventListener("click", doLogin);
document.getElementById("loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

async function doLogin() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    loginError.classList.remove("show");
    if (!email || !password) {
        loginError.textContent = "Enter your email and password.";
        loginError.classList.add("show");
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        loginError.textContent = "Sign-in failed: " + (err.code || err.message || "unknown error");
        loginError.classList.add("show");
    }
}

document.getElementById("signOutBtn").addEventListener("click", () => firebaseSignOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        appShell.classList.remove("active");
        loginScreen.style.display = "flex";
        return;
    }
    // Authorization check: the user must have a doc in /admins/{uid}.
    // This mirrors firestore.rules exactly -- if this read fails, rules
    // are denying it, which means this account isn't an authorized admin.
    try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (!adminDoc.exists()) {
            loginError.textContent = "This account isn't authorized for the admin panel yet. Ask Jimmy to add your UID to the admins list.";
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

    await loadKnownSizes().catch(() => { knownSizes = { mostCommon: [], groups: [] }; });
    await loadCatalogs();
    await loadProducts();
});

// ---------- Catalogs ----------
async function loadCatalogs() {
    let existing = new Map();
    try {
        const snap = await getDocs(collection(db, "catalogs"));
        snap.forEach(d => existing.set(d.id, { id: d.id, ...d.data() }));
    } catch (err) {
        showToast("Couldn't load catalogs: " + err.message, true);
    }

    // Bootstrap any of the 6 real catalogs that don't exist yet, so the
    // picker always shows the full planned structure (most will be empty
    // of products until their own PDFs get indexed, which is expected).
    const missing = DEFAULT_CATALOGS.filter(c => !existing.has(c.id));
    for (const c of missing) {
        try {
            await setDoc(doc(db, "catalogs", c.id), { name: c.name });
            existing.set(c.id, c);
        } catch (err) { /* non-fatal -- will just show via DEFAULT_CATALOGS below */ }
    }

    const catalogs = DEFAULT_CATALOGS.map(c => existing.get(c.id) || c);
    catalogSelect.innerHTML = catalogs.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`).join("");
    if (!catalogs.some(c => c.id === currentCatalogId)) currentCatalogId = catalogs[0].id;
    catalogSelect.value = currentCatalogId;
}

catalogSelect.addEventListener("change", async () => {
    currentCatalogId = catalogSelect.value;
    activeCategory = "All";
    activeProductId = null;
    await loadProducts();
});

// ---------- Products: load + list ----------
async function loadProducts() {
    allProducts = [];
    try {
        const q = query(collection(db, "products"), where("catalogId", "==", currentCatalogId));
        const snap = await getDocs(q);
        snap.forEach(d => allProducts.push({ id: d.id, ...d.data() }));
    } catch (err) {
        showToast("Couldn't load products: " + err.message, true);
    }
    allProducts.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
    renderCategoryChips();
    renderProductList();
}

function renderCategoryChips() {
    const cats = ["All", ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    categoryChips.innerHTML = cats.map(c =>
        `<button type="button" class="chip${c === activeCategory ? " active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    ).join("");
    categoryChips.querySelectorAll(".chip").forEach(btn => {
        btn.addEventListener("click", () => {
            activeCategory = btn.dataset.cat;
            renderCategoryChips();
            renderProductList();
        });
    });
}

function renderProductList() {
    const filtered = allProducts.filter(p => activeCategory === "All" || p.category === activeCategory);
    productList.innerHTML = filtered.map(p => `
        <div class="product-list-item${p.id === activeProductId ? " active" : ""}${p.active === false ? " inactive-item" : ""}" data-id="${escapeHtml(p.id)}">
            <span class="pname">${escapeHtml(p.name || "(untitled)")}${p.active === false ? ' <span class="inactive-tag">Inactive</span>' : ""}</span>
            <span class="pmeta">${escapeHtml((p.listNumbers || []).join(", "))} &middot; ${(p.rows || []).length} sizes</span>
        </div>
    `).join("") || `<div style="padding:18px;color:var(--ink-soft);font-size:13.5px;">No products in this category yet.</div>`;

    productList.querySelectorAll(".product-list-item").forEach(el => {
        el.addEventListener("click", () => selectProduct(el.dataset.id));
    });
}

// ---------- Editor ----------
function blankDraft() {
    return {
        id: null,
        catalogId: currentCatalogId,
        category: activeCategory !== "All" ? activeCategory : "",
        name: "",
        listNumbers: [],
        brand: "Kromhard",
        image: "",
        description: "",
        bullets: [],
        note: "",
        price: "",
        active: true,
        columns: [{ key: "size", label: "Size" }],
        rows: [],
    };
}

function selectProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    activeProductId = id;
    editingDraft = JSON.parse(JSON.stringify(p));
    if (editingDraft.active === undefined) editingDraft.active = true; // older docs predate this field
    renderProductList();
    renderEditor();
}

document.getElementById("newProductBtn").addEventListener("click", () => {
    activeProductId = "__new__";
    editingDraft = blankDraft();
    renderProductList();
    renderEditor();
});

function renderEditor() {
    if (!editingDraft) {
        emptyState.style.display = "block";
        editorRoot.style.display = "none";
        return;
    }
    emptyState.style.display = "none";
    editorRoot.style.display = "block";

    const d = editingDraft;
    const isNew = activeProductId === "__new__";

    editorRoot.innerHTML = `
        <div class="editor-head">
            <div>
                <h2>${isNew ? "New Product Line" : escapeHtml(d.name || "(untitled)")}</h2>
                <label class="active-toggle">
                    <input type="checkbox" id="f_active" ${d.active !== false ? "checked" : ""}>
                    <span id="activeLabel">${d.active !== false ? "Active — visible on the public catalog" : "Inactive — hidden from the public catalog"}</span>
                </label>
            </div>
            <div class="editor-actions">
                <button class="btn btn-ghost btn-sm" id="exportCsvBtn" ${isNew ? "disabled" : ""}>Export Rows (CSV)</button>
                <button class="btn btn-ghost btn-sm" id="importCsvBtn" ${isNew ? "disabled" : ""}>Import Rows (CSV)</button>
                <button class="btn btn-danger btn-sm" id="deleteProductBtn" ${isNew ? "disabled" : ""}>Delete</button>
                <button class="btn btn-primary" id="saveProductBtn">Save</button>
            </div>
        </div>

        <div class="panel">
            <h3>Basics</h3>
            <div class="grid-2">
                <div class="field">
                    <label>Category</label>
                    <input type="text" id="f_category" value="${escapeHtml(d.category)}" list="categoryList">
                    <datalist id="categoryList">${[...new Set(allProducts.map(p => p.category).filter(Boolean))].map(c => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
                </div>
                <div class="field">
                    <label>Brand</label>
                    <input type="text" id="f_brand" value="${escapeHtml(d.brand)}">
                </div>
            </div>
            <div class="field">
                <label>Product Name</label>
                <input type="text" id="f_name" value="${escapeHtml(d.name)}" placeholder="e.g. Left Hand Jobber Drills">
            </div>
            <div class="field">
                <label>LIST Number(s) &mdash; comma separated</label>
                <input type="text" id="f_listNumbers" value="${escapeHtml((d.listNumbers || []).join(", "))}" placeholder="e.g. 100LH">
            </div>
            <div class="field">
                <label>Description</label>
                <textarea id="f_description" rows="3">${escapeHtml(d.description)}</textarea>
            </div>
            <div class="field">
                <label>Bullets</label>
                <div id="bulletsWrap"></div>
                <button type="button" class="btn btn-ghost btn-sm" id="addBulletBtn" style="align-self:flex-start;">+ Add bullet</button>
            </div>
            <div class="field">
                <label>Note (optional &mdash; packaging/availability caveats)</label>
                <input type="text" id="f_note" value="${escapeHtml(d.note || "")}">
            </div>
        </div>

        <div class="panel">
            <h3>Photo</h3>
            <div class="photo-preview ${d.image ? "" : "empty"}" id="photoPreview">
                ${d.image ? `<img src="${escapeHtml(d.image)}" alt="">` : "No photo yet"}
            </div>
            <input type="file" id="photoInput" accept="image/*">
            <p class="pricing-note">Uploads to Firebase Storage and saves the resulting URL. Requires Storage to be enabled on the project.</p>
        </div>

        <div class="panel">
            <span class="pricing-toggle" id="pricingToggle">&#9656; Pricing (internal only &mdash; never shown on the public catalog)</span>
            <div class="pricing-body" id="pricingBody">
                <div class="field">
                    <label>Internal price (optional)</label>
                    <input type="text" id="f_price" value="${escapeHtml(d.price || "")}" placeholder="Not shown publicly">
                </div>
                <p class="pricing-note">This field exists in the data model for later, but the public catalog page never reads or displays it.</p>
            </div>
        </div>

        <div class="panel">
            <h3>Columns</h3>
            <div id="columnsWrap"></div>
            <button type="button" class="btn btn-ghost btn-sm" id="addColumnBtn" style="margin-top:4px;">+ Add column</button>
        </div>

        <div class="panel">
            <h3>Sizes (${d.rows.length})</h3>
            <div class="sizes-table-wrap">
                <table class="edit-table" id="rowsTable"></table>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" id="addRowBtn" style="margin-top:10px;">+ Add size row</button>
        </div>

        ${buildSizeDatalistHtml()}
    `;

    renderBullets();
    renderColumns();
    renderRowsTable();

    // ---- wire up basics ----
    editorRoot.querySelector("#f_category").addEventListener("input", e => d.category = e.target.value);
    editorRoot.querySelector("#f_brand").addEventListener("input", e => d.brand = e.target.value);
    editorRoot.querySelector("#f_name").addEventListener("input", e => {
        d.name = e.target.value;
        editorRoot.querySelector(".editor-head h2").textContent = d.name || "(untitled)";
    });
    editorRoot.querySelector("#f_listNumbers").addEventListener("input", e => {
        d.listNumbers = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
    });
    editorRoot.querySelector("#f_description").addEventListener("input", e => d.description = e.target.value);
    editorRoot.querySelector("#f_note").addEventListener("input", e => d.note = e.target.value);
    editorRoot.querySelector("#f_price").addEventListener("input", e => d.price = e.target.value);
    editorRoot.querySelector("#f_active").addEventListener("change", e => {
        d.active = e.target.checked;
        editorRoot.querySelector("#activeLabel").textContent = d.active
            ? "Active — visible on the public catalog"
            : "Inactive — hidden from the public catalog";
    });

    editorRoot.querySelector("#addBulletBtn").addEventListener("click", () => { d.bullets.push(""); renderBullets(); });

    editorRoot.querySelector("#pricingToggle").addEventListener("click", () => {
        const body = editorRoot.querySelector("#pricingBody");
        const open = body.classList.toggle("open");
        editorRoot.querySelector("#pricingToggle").innerHTML =
            (open ? "&#9662; " : "&#9656; ") + "Pricing (internal only &mdash; never shown on the public catalog)";
    });

    editorRoot.querySelector("#photoInput").addEventListener("change", handlePhotoUpload);

    editorRoot.querySelector("#addColumnBtn").addEventListener("click", () => {
        d.columns.push({ key: "col" + (d.columns.length + 1), label: "New Column" });
        d.rows.forEach(r => r.push(""));
        renderColumns();
        renderRowsTable();
    });

    editorRoot.querySelector("#addRowBtn").addEventListener("click", () => {
        d.rows.push(d.columns.map(() => ""));
        renderRowsTable();
    });

    editorRoot.querySelector("#saveProductBtn").addEventListener("click", saveProduct);
    const delBtn = editorRoot.querySelector("#deleteProductBtn");
    if (!isNew) delBtn.addEventListener("click", () => openDeleteModal(d));

    const exportBtn = editorRoot.querySelector("#exportCsvBtn");
    if (!isNew) exportBtn.addEventListener("click", exportRowsCsv);
    const importBtn = editorRoot.querySelector("#importCsvBtn");
    if (!isNew) importBtn.addEventListener("click", () => document.getElementById("csvImportModal").classList.add("open"));
}

function renderBullets() {
    const wrap = editorRoot.querySelector("#bulletsWrap");
    wrap.innerHTML = editingDraft.bullets.map((b, i) => `
        <div class="bullet-row">
            <input type="text" data-i="${i}" value="${escapeHtml(b)}">
            <button type="button" class="remove-btn" data-i="${i}">&times;</button>
        </div>
    `).join("");
    wrap.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => editingDraft.bullets[+e.target.dataset.i] = e.target.value);
    });
    wrap.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", () => { editingDraft.bullets.splice(+btn.dataset.i, 1); renderBullets(); });
    });
}

function renderColumns() {
    const wrap = editorRoot.querySelector("#columnsWrap");
    wrap.innerHTML = editingDraft.columns.map((c, i) => `
        <div class="column-row">
            <input type="text" data-field="key" data-i="${i}" value="${escapeHtml(c.key)}" placeholder="key" style="max-width:140px;">
            <input type="text" data-field="label" data-i="${i}" value="${escapeHtml(c.label)}" placeholder="Column label shown to customers">
            <button type="button" class="remove-btn" data-i="${i}" ${editingDraft.columns.length <= 1 ? "disabled" : ""}>&times;</button>
        </div>
    `).join("");
    wrap.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => {
            editingDraft.columns[+e.target.dataset.i][e.target.dataset.field] = e.target.value;
            if (e.target.dataset.field === "label") renderRowsTable();
        });
    });
    wrap.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (editingDraft.columns.length <= 1) return;
            const i = +btn.dataset.i;
            editingDraft.columns.splice(i, 1);
            editingDraft.rows.forEach(r => r.splice(i, 1));
            renderColumns();
            renderRowsTable();
        });
    });
}

function renderRowsTable() {
    const table = editorRoot.querySelector("#rowsTable");
    const cols = editingDraft.columns;
    table.innerHTML = `
        <thead><tr>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}<th></th></tr></thead>
        <tbody>
            ${editingDraft.rows.map((row, ri) => `
                <tr>
                    ${cols.map((c, ci) => `<td><input type="text" data-ri="${ri}" data-ci="${ci}" value="${escapeHtml(row[ci] ?? "")}" ${ci === 0 ? 'list="knownSizesList"' : ""}></td>`).join("")}
                    <td><button type="button" class="remove-btn" data-ri="${ri}">&times;</button></td>
                </tr>
            `).join("")}
        </tbody>
    `;
    table.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => {
            editingDraft.rows[+e.target.dataset.ri][+e.target.dataset.ci] = e.target.value;
        });
    });
    table.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            editingDraft.rows.splice(+btn.dataset.ri, 1);
            renderRowsTable();
            editorRoot.querySelector(".panel h3").textContent; // no-op, title updates on next full render
        });
    });
}

// ---------- Photo upload ----------
async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    showToast("Uploading photo…");
    try {
        const path = `product-photos/${slugify(editingDraft.name || editingDraft.id || "product")}-${Date.now()}.${(file.type.split("/")[1] || "jpg")}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        editingDraft.image = url;
        const preview = document.getElementById("photoPreview");
        preview.classList.remove("empty");
        preview.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
        showToast("Photo uploaded. Click Save to attach it to this product.");
    } catch (err) {
        showToast("Photo upload failed: " + (err.code || err.message), true);
    }
}

// ---------- Save / Delete ----------
async function saveProduct() {
    const d = editingDraft;
    if (!d.name.trim()) { showToast("Give this product a name first.", true); return; }

    const id = d.id || slugify(d.listNumbers[0] || d.name) + "-" + slugify(d.name).split("-").slice(0, 3).join("-");
    const data = {
        catalogId: d.catalogId,
        category: d.category,
        name: d.name,
        listNumbers: d.listNumbers,
        brand: d.brand,
        image: d.image,
        description: d.description,
        bullets: d.bullets.filter(b => b.trim()),
        columns: d.columns,
        rows: d.rows,
        active: d.active !== false,
        updatedAt: serverTimestamp(),
    };
    if (d.note && d.note.trim()) data.note = d.note.trim();
    if (d.price && String(d.price).trim()) data.price = d.price;

    try {
        await setDoc(doc(db, "products", id), data);
        await upsertCatalogMeta(d.catalogId);
        showToast("Saved.");
        activeProductId = id;
        await loadProducts();
        editingDraft.id = id;
    } catch (err) {
        showToast("Save failed: " + (err.code || err.message), true);
    }
}

async function upsertCatalogMeta(catalogId) {
    try {
        const ref_ = doc(db, "catalogs", catalogId);
        const snap = await getDoc(ref_);
        if (!snap.exists()) {
            const known = DEFAULT_CATALOGS.find(c => c.id === catalogId);
            await setDoc(ref_, { name: known ? known.name : catalogId });
        }
    } catch (err) { /* non-fatal */ }
}

function openDeleteModal(d) {
    document.getElementById("deleteModalText").textContent = `Delete "${d.name}"? This removes it from the live catalog immediately.`;
    document.getElementById("deleteModal").classList.add("open");
    document.getElementById("deleteConfirmBtn").onclick = async () => {
        try {
            await deleteDoc(doc(db, "products", d.id));
            showToast("Deleted.");
            editingDraft = null;
            activeProductId = null;
            document.getElementById("deleteModal").classList.remove("open");
            await loadProducts();
            renderEditor();
        } catch (err) {
            showToast("Delete failed: " + (err.code || err.message), true);
        }
    };
}
document.getElementById("deleteCancelBtn").addEventListener("click", () => document.getElementById("deleteModal").classList.remove("open"));

// ---------- CSV export/import (per-product rows) ----------
function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportRowsCsv() {
    const d = editingDraft;
    const header = d.columns.map(c => c.label).join(",");
    const lines = d.rows.map(row => row.map(csvEscape).join(","));
    downloadFile(slugify(d.name) + "-sizes.csv", [header, ...lines].join("\n"), "text/csv");
}

function parseCsv(text) {
    // Minimal CSV parser: handles quoted fields with embedded commas/newlines.
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            if (row.length > 1 || row[0] !== "") rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
}

document.getElementById("csvImportCancelBtn").addEventListener("click", () => document.getElementById("csvImportModal").classList.remove("open"));
document.getElementById("csvImportConfirmBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("csvFileInput");
    const file = fileInput.files[0];
    if (!file) { showToast("Choose a CSV file first.", true); return; }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { showToast("CSV has no data rows.", true); return; }
    const dataRows = parsed.slice(1);

    let updated = 0, added = 0;
    dataRows.forEach(newRow => {
        const sizeKey = newRow[0];
        const existingIdx = editingDraft.rows.findIndex(r => r[0] === sizeKey);
        const normalized = editingDraft.columns.map((_, i) => newRow[i] ?? "");
        if (existingIdx >= 0) { editingDraft.rows[existingIdx] = normalized; updated++; }
        else { editingDraft.rows.push(normalized); added++; }
    });
    renderRowsTable();
    document.getElementById("csvImportModal").classList.remove("open");
    fileInput.value = "";
    showToast(`Imported: ${added} new, ${updated} updated. Click Save to keep these changes.`);
});

// ---------- JSON import/seed (whole catalog) ----------
document.getElementById("exportJsonBtn").addEventListener("click", () => {
    downloadFile(currentCatalogId + "-catalog.json", JSON.stringify(allProducts, null, 2), "application/json");
});
document.getElementById("importJsonBtn").addEventListener("click", () => document.getElementById("jsonImportModal").classList.add("open"));
document.getElementById("jsonImportCancelBtn").addEventListener("click", () => document.getElementById("jsonImportModal").classList.remove("open"));
document.getElementById("jsonImportConfirmBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("jsonFileInput");
    const file = fileInput.files[0];
    if (!file) { showToast("Choose a JSON file first.", true); return; }
    let items;
    try {
        items = JSON.parse(await file.text());
        if (!Array.isArray(items)) throw new Error("Expected a JSON array");
    } catch (err) {
        showToast("Couldn't parse that JSON: " + err.message, true);
        return;
    }

    showToast(`Importing ${items.length} product lines…`);
    let ok = 0, fail = 0;
    for (const item of items) {
        try {
            const id = item.id || slugify(item.listNumbers?.[0] || item.name);
            const data = { ...item, catalogId: item.catalogId || currentCatalogId, updatedAt: serverTimestamp() };
            delete data.id;
            await setDoc(doc(db, "products", id), data);
            ok++;
        } catch (err) { fail++; }
    }
    await upsertCatalogMeta(currentCatalogId);
    document.getElementById("jsonImportModal").classList.remove("open");
    fileInput.value = "";
    showToast(`Import complete: ${ok} saved${fail ? `, ${fail} failed` : ""}.`, fail > 0);
    await loadProducts();
});
