import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, arrayUnion
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
let currentCatalogCategories = []; // explicit category list for the selected catalog (lets an empty category show up before any product uses it)
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
    {
        id: "cutting-drilling-milling", name: "Cutting, Drilling and Milling",
        categories: ["Drill Blanks", "Jobber Drills", "Screw Machine / Stub Drills", "Silver & Deming Drills",
            "Taper Shank Drills", "Spotting & Centering Drills", "Step Drills", "Straight Flute (Die) Drills",
            "Extended Length Drills", "Drill Sets", "Center / Combined Drills", "Masonry Drills",
            "Specialty Drills", "Woodworking Bits", "Annular Cutters", "Spade Drill Inserts & Holders", "Hole Saws"],
    },
    { id: "threading-thread-repair", name: "Threading & Thread Repair Tools", categories: [] },
    { id: "hand-power-tools", name: "Hand Tools and Power Tools", categories: [] },
    { id: "precision-measuring", name: "Precision Measuring Tools", categories: [] },
    { id: "industrial-chemicals", name: "Industrial Chemicals & Fluids", categories: [] },
    { id: "workholding-material-handling", name: "Workholding & Material Handling", categories: [] },
];

// ---------- DOM refs ----------
const loginScreen = document.getElementById("loginScreen");
const appShell = document.getElementById("appShell");
const loginError = document.getElementById("loginError");
const whoEmail = document.getElementById("whoEmail");
const catalogSelect = document.getElementById("catalogSelect");
const categorySelect = document.getElementById("categorySelect");
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

// Firestore rejects an array that directly contains other arrays (a bare
// array-of-arrays), which is exactly what "rows" is everywhere else in this
// app (one array per size). So rows only get wrapped as [{values:[...]}]
// right at the write boundary, and unwrapped right at the read boundary --
// every other function in this file and in the public catalog page keeps
// working with plain arrays-of-arrays, unaware this translation happens.
function wrapRowsForFirestore(rows) {
    return (rows || []).map(r => ({ values: r }));
}
function unwrapRowsFromFirestore(rows) {
    return (rows || []).map(r => (r && r.values) || r);
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
let allCatalogs = [];

function syncCurrentCatalogCategories() {
    const c = allCatalogs.find(x => x.id === currentCatalogId);
    currentCatalogCategories = (c && c.categories) || [];
}

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
            await setDoc(doc(db, "catalogs", c.id), { name: c.name, categories: c.categories || [] });
            existing.set(c.id, c);
        } catch (err) { /* non-fatal -- will just show via DEFAULT_CATALOGS below */ }
    }

    allCatalogs = DEFAULT_CATALOGS.map(c => existing.get(c.id) || c);
    catalogSelect.innerHTML = allCatalogs.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`).join("");
    if (!allCatalogs.some(c => c.id === currentCatalogId)) currentCatalogId = allCatalogs[0].id;
    catalogSelect.value = currentCatalogId;
    syncCurrentCatalogCategories();
}

catalogSelect.addEventListener("change", async () => {
    currentCatalogId = catalogSelect.value;
    syncCurrentCatalogCategories();
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
        snap.forEach(d => {
            const data = d.data();
            allProducts.push({ id: d.id, ...data, rows: unwrapRowsFromFirestore(data.rows) });
        });
    } catch (err) {
        showToast("Couldn't load products: " + err.message, true);
    }
    allProducts.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
    renderCategoryChips();
    renderProductList();
}

function allKnownCategories() {
    // Union of this catalog's explicit category list (so a brand-new, still-
    // empty category shows up right away) and whatever categories existing
    // products actually use (in case one was added some other way).
    return [...new Set([...currentCatalogCategories, ...allProducts.map(p => p.category).filter(Boolean)])];
}

const NEW_CATEGORY_OPTION = "__new_category__";

function renderCategoryChips() {
    const cats = ["All", ...allKnownCategories().sort((a, b) => a.localeCompare(b))];
    categorySelect.innerHTML = cats.map(c =>
        `<option value="${escapeHtml(c)}"${c === activeCategory ? " selected" : ""}>${escapeHtml(c)}</option>`
    ).join("") + `<option value="${NEW_CATEGORY_OPTION}">+ New Category&hellip;</option>`;
}

categorySelect.addEventListener("change", async () => {
    if (categorySelect.value === NEW_CATEGORY_OPTION) {
        await createNewCategory();
        return;
    }
    activeCategory = categorySelect.value;
    renderProductList();
});

async function createNewCategory() {
    const name = (prompt("Name for the new category (e.g. \"Thread Repair Kits\"):") || "").trim();
    if (!name || allKnownCategories().some(c => c.toLowerCase() === name.toLowerCase())) {
        if (name) showToast("That category already exists.", true);
        renderCategoryChips(); // reset the dropdown back off "+ New Category..."
        return;
    }
    await addCategoryToCatalog(currentCatalogId, name);
    activeCategory = name;
    renderCategoryChips();
    renderProductList();
    showToast(`Added "${name}". It'll show up empty until a product is saved under it.`);
}

async function addCategoryToCatalog(catalogId, name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
        await updateDoc(doc(db, "catalogs", catalogId), { categories: arrayUnion(trimmed) });
    } catch (err) {
        try { await setDoc(doc(db, "catalogs", catalogId), { categories: [trimmed] }, { merge: true }); } catch (e2) { /* non-fatal */ }
    }
    const c = allCatalogs.find(x => x.id === catalogId);
    if (c) c.categories = [...new Set([...(c.categories || []), trimmed])];
    if (catalogId === currentCatalogId) syncCurrentCatalogCategories();
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
                    <span id="activeLabel">${d.active !== false ? "Active, visible on the public catalog" : "Inactive, hidden from the public catalog"}</span>
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
            <p class="panel-intro">The main info customers see when they open this product on the catalog page.</p>
            <div class="grid-2">
                <div class="field">
                    <label>Category</label>
                    <p class="field-hint">Which group this shows under on the catalog page (e.g. "Jobber Drills"). Pick an existing one from the list when you can. Typing a brand-new name here creates it too, but the "+ New Category" button in the left sidebar is the clearer way if you just want to set one up first.</p>
                    <input type="text" id="f_category" value="${escapeHtml(d.category)}" list="categoryList">
                    <datalist id="categoryList">${allKnownCategories().map(c => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
                </div>
                <div class="field">
                    <label>Brand</label>
                    <p class="field-hint">Usually "Kromhard". Change it only if this is a resold line with its own brand name (e.g. "Allied", "ThunderTwist").</p>
                    <input type="text" id="f_brand" value="${escapeHtml(d.brand)}">
                </div>
            </div>
            <div class="field">
                <label>Product Name</label>
                <p class="field-hint">The title customers see, in large text at the top of this product's card.</p>
                <input type="text" id="f_name" value="${escapeHtml(d.name)}" placeholder="e.g. Left Hand Jobber Drills">
            </div>
            <div class="field">
                <label>LIST Number(s)</label>
                <p class="field-hint">Kromhard's own catalog number(s) for this product, e.g. 100LH. If there's more than one (different finishes of the same item, say), separate them with commas.</p>
                <input type="text" id="f_listNumbers" value="${escapeHtml((d.listNumbers || []).join(", "))}" placeholder="e.g. 100LH">
            </div>
            <div class="field">
                <label>Description</label>
                <p class="field-hint">A sentence or two explaining what it is and what it's good for. Shows as a paragraph right under the product name.</p>
                <textarea id="f_description" rows="3">${escapeHtml(d.description)}</textarea>
            </div>
            <div class="field">
                <label>Bullets</label>
                <p class="field-hint">Short feature highlights, shown as a bulleted list under the description. One fact per line, kept short. Example: "Bright finish, 118&deg; point" or "Can double as an extractor for broken bolt removal."</p>
                <div id="bulletsWrap"></div>
                <button type="button" class="btn btn-ghost btn-sm" id="addBulletBtn" style="align-self:flex-start;">+ Add bullet</button>
            </div>
            <div class="field">
                <label>Note (optional)</label>
                <p class="field-hint">Small-print packaging or availability detail, shown below the sizing table. Example: "TiN sizes A&ndash;L pack 6, sizes M&ndash;Z pack 3." Leave blank if there's nothing special to call out.</p>
                <input type="text" id="f_note" value="${escapeHtml(d.note || "")}">
            </div>
        </div>

        <div class="panel">
            <h3>Photo</h3>
            <p class="panel-intro">One representative photo of this product, shown at the top of its card.</p>
            <div class="photo-preview ${d.image ? "" : "empty"}" id="photoPreview">
                ${d.image ? `<img src="${escapeHtml(d.image)}" alt="">` : "No photo yet"}
            </div>
            <input type="file" id="photoInput" accept="image/*">
            <p class="field-hint">Choose a file to upload a new photo. It replaces the one above as soon as the upload finishes. Nothing is saved until you also click Save below.</p>
        </div>

        <div class="panel">
            <span class="pricing-toggle" id="pricingToggle">&#9656; Pricing (internal only, never shown on the public catalog)</span>
            <div class="pricing-body" id="pricingBody">
                <div class="field">
                    <label>Internal price (optional)</label>
                    <input type="text" id="f_price" value="${escapeHtml(d.price || "")}" placeholder="Not shown publicly">
                </div>
                <p class="field-hint">This is stored for later but never shown to customers or printed anywhere on the public site. Safe to fill in whenever you're ready, even if Kromhard hasn't decided on public pricing yet.</p>
            </div>
        </div>

        <div class="panel">
            <h3>Columns</h3>
            <p class="panel-intro">These become the column headings on the sizing table below (e.g. "Flute Length", "Pack Qty"). Most products won't need any changes here. Only touch this if a size needs to track something the current columns don't cover.</p>
            <div id="columnsWrap"></div>
            <button type="button" class="btn btn-ghost btn-sm" id="addColumnBtn" style="margin-top:4px;">+ Add column</button>
        </div>

        <div class="panel">
            <h3>Sizes (${d.rows.length})</h3>
            <p class="panel-intro">One row per size Kromhard stocks for this product. The first box in each row is the size itself. Start typing and matching sizes already used elsewhere in the catalog will show up to pick from, or just type a new one.</p>
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
            ? "Active, visible on the public catalog"
            : "Inactive, hidden from the public catalog";
    });

    editorRoot.querySelector("#addBulletBtn").addEventListener("click", () => { d.bullets.push(""); renderBullets(); });

    editorRoot.querySelector("#pricingToggle").addEventListener("click", () => {
        const body = editorRoot.querySelector("#pricingBody");
        const open = body.classList.toggle("open");
        editorRoot.querySelector("#pricingToggle").innerHTML =
            (open ? "&#9662; " : "&#9656; ") + "Pricing (internal only, never shown on the public catalog)";
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

function uniqueColumnKey(label, i) {
    const base = slugify(label) || "col" + (i + 1);
    let key = base, n = 2;
    while (editingDraft.columns.some((c, ci) => ci !== i && c.key === key)) key = base + "-" + (n++);
    return key;
}

function renderColumns() {
    const wrap = editorRoot.querySelector("#columnsWrap");
    // Admins only ever see/edit the label (e.g. "Flute Length") -- the
    // "key" field used to be a second, nearly-identical-looking box here
    // ("size" / "Size") with no real purpose: nothing in this app actually
    // matches rows to columns by key, only by position. It's now just
    // auto-derived from the label and kept out of sight.
    wrap.innerHTML = editingDraft.columns.map((c, i) => `
        <div class="column-row">
            <span class="column-index">${i === 0 ? "Size column" : "Column " + (i + 1)}</span>
            <input type="text" data-i="${i}" value="${escapeHtml(c.label)}" placeholder="Column heading shown to customers">
            <button type="button" class="remove-btn" data-i="${i}" ${(editingDraft.columns.length <= 1 || i === 0) ? "disabled" : ""} title="${i === 0 ? "The first column can't be removed -- it's always treated as this product's size." : "Remove this column"}">&times;</button>
        </div>
    `).join("");
    wrap.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", e => {
            const i = +e.target.dataset.i;
            editingDraft.columns[i].label = e.target.value;
            editingDraft.columns[i].key = uniqueColumnKey(e.target.value, i);
            renderRowsTable();
        });
    });
    wrap.querySelectorAll(".remove-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = +btn.dataset.i;
            if (editingDraft.columns.length <= 1 || i === 0) return;
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
        rows: wrapRowsForFirestore(d.rows),
        active: d.active !== false,
        updatedAt: serverTimestamp(),
    };
    if (d.note && d.note.trim()) data.note = d.note.trim();
    if (d.price && String(d.price).trim()) data.price = d.price;

    try {
        await setDoc(doc(db, "products", id), data);
        await upsertCatalogMeta(d.catalogId);
        if (d.category && d.category.trim()) await addCategoryToCatalog(d.catalogId, d.category.trim());
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

// ---------- Catalog Tools dropdown ----------
const toolsMenuBtn = document.getElementById("toolsMenuBtn");
const toolsMenu = document.getElementById("toolsMenu");
toolsMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toolsMenu.classList.toggle("open");
});
document.addEventListener("click", (e) => {
    if (!toolsMenu.contains(e.target) && e.target !== toolsMenuBtn) toolsMenu.classList.remove("open");
});

// ---------- JSON import/seed (whole catalog) ----------
document.getElementById("exportJsonBtn").addEventListener("click", () => {
    toolsMenu.classList.remove("open");
    downloadFile(currentCatalogId + "-catalog.json", JSON.stringify(allProducts, null, 2), "application/json");
});
document.getElementById("importJsonBtn").addEventListener("click", () => {
    toolsMenu.classList.remove("open");
    document.getElementById("jsonImportModal").classList.add("open");
});
document.getElementById("jsonImportCancelBtn").addEventListener("click", () => document.getElementById("jsonImportModal").classList.remove("open"));

async function importItems(items) {
    showToast(`Importing ${items.length} product lines…`);
    let ok = 0, fail = 0, firstError = null;
    for (const item of items) {
        try {
            const id = item.id || slugify(item.listNumbers?.[0] || item.name);
            const data = { ...item, catalogId: item.catalogId || currentCatalogId, rows: wrapRowsForFirestore(item.rows), updatedAt: serverTimestamp() };
            delete data.id;
            await setDoc(doc(db, "products", id), data);
            ok++;
        } catch (err) {
            fail++;
            if (!firstError) firstError = err;
            console.error("Import failed for item", item.id || item.name, err);
        }
    }
    await upsertCatalogMeta(currentCatalogId);
    const summary = `Import complete: ${ok} saved${fail ? `, ${fail} failed` : ""}.`;
    showToast(fail && firstError ? `${summary} First error: ${firstError.code || firstError.message}` : summary, fail > 0);
    await loadProducts();
}

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
    document.getElementById("jsonImportModal").classList.remove("open");
    fileInput.value = "";
    await importItems(items);
});

// Fetches the site's own bundled seed file directly (no download/upload
// round trip, and no risk of re-importing a stale saved copy like the one
// that caused this to exist: a manually re-uploaded file that still had
// the pre-fix text). Cache-busted so it's never a stale cached response.
document.getElementById("resyncBtn").addEventListener("click", async () => {
    toolsMenu.classList.remove("open");
    try {
        const res = await fetch(`/kromhard/admin/seed-cutting-drilling-milling.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const items = await res.json();
        if (!Array.isArray(items)) throw new Error("Expected a JSON array");
        await importItems(items);
    } catch (err) {
        showToast("Re-sync failed: " + err.message, true);
    }
});
