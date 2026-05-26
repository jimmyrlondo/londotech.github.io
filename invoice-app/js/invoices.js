let customers = [];
let timeEntries = [];
let invoices = [];
let currentPreviewInvoiceId = null;
let settings = {
  businessName: '',
  businessAddress: '',
  businessEmail: '',
  defaultInvoiceNotes: '',
  bannerUrl: '',
  bannerDataUrl: ''
};

function loadBaseData() {
  customers = loadData('customers', []);
  timeEntries = loadData('timeEntries', []);
  invoices = loadData('invoices', []);
  settings = loadData('settings', settings);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function getSafeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const trimmed = dataUrl.trim();
  return trimmed.startsWith('data:image/') ? trimmed : '';
}

function getServiceLines(invoice) {
  return invoice.serviceLines || invoice.lines || [];
}

function createDefaultPurchasedItem() {
  return {
    description: '',
    quantity: 1,
    unitPrice: 0,
    category: 'Purchased Item',
    receipt: null
  };
}

/* Populate customer dropdown in the invoice form */
function populateCustomerSelect() {
  const select = document.getElementById('invoiceCustomer');
  select.innerHTML = '';

  if (customers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No customers yet';
    select.appendChild(opt);
    select.disabled = true;
  } else {
    select.disabled = false;
    customers.forEach((c, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.textContent = c.name || ('Customer ' + (idx + 1));
      select.appendChild(opt);
    });
  }
}

/* Render three grouped tables: draft, sent, paid */
function renderInvoicesTable() {
  const tbodyDraft = document.getElementById('invoicesTableBodyDraft');
  const tbodySent = document.getElementById('invoicesTableBodySent');
  const tbodyPaid = document.getElementById('invoicesTableBodyPaid');

  tbodyDraft.innerHTML = '';
  tbodySent.innerHTML = '';
  tbodyPaid.innerHTML = '';

  invoices.forEach((inv, index) => {
    const tr = document.createElement('tr');

    const idTd = document.createElement('td');
    idTd.textContent = inv.id;
    tr.appendChild(idTd);

    const custTd = document.createElement('td');
    const c = customers[inv.customerIndex];
    custTd.textContent = c ? c.name : '(deleted customer)';
    tr.appendChild(custTd);

    const periodTd = document.createElement('td');
    periodTd.textContent = inv.from + ' to ' + inv.to;
    tr.appendChild(periodTd);

    const dateTd = document.createElement('td');
    dateTd.textContent = inv.invoiceDate;
    tr.appendChild(dateTd);

    const totalTd = document.createElement('td');
    totalTd.textContent = formatCurrency(inv.total);
    tr.appendChild(totalTd);

    const statusTd = document.createElement('td');
    statusTd.textContent = inv.status || 'draft';
    tr.appendChild(statusTd);

    const actionsTd = document.createElement('td');

    const previewBtn = document.createElement('button');
    previewBtn.textContent = 'Preview';
    previewBtn.onclick = () => showInvoicePreview(index);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'secondary';
    editBtn.style.marginLeft = '4px';
    editBtn.onclick = () => loadInvoiceIntoForm(index);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'danger';
    delBtn.style.marginLeft = '4px';
    delBtn.onclick = () => deleteInvoice(index);

    const markSentBtn = document.createElement('button');
    markSentBtn.textContent = 'Sent';
    markSentBtn.className = 'secondary';
    markSentBtn.style.marginLeft = '4px';
    markSentBtn.onclick = () => markInvoiceStatus(index, 'sent');

    const markPaidBtn = document.createElement('button');
    markPaidBtn.textContent = 'Paid';
    markPaidBtn.className = 'secondary';
    markPaidBtn.style.marginLeft = '4px';
    markPaidBtn.onclick = () => markInvoiceStatus(index, 'paid');

    actionsTd.appendChild(previewBtn);
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    actionsTd.appendChild(markSentBtn);
    actionsTd.appendChild(markPaidBtn);
    tr.appendChild(actionsTd);

    const status = (inv.status || 'draft').toLowerCase();
    if (status === 'sent') {
      tbodySent.appendChild(tr);
    } else if (status === 'paid') {
      tbodyPaid.appendChild(tr);
    } else {
      tbodyDraft.appendChild(tr);
    }
  });
}

function markInvoiceStatus(index, status) {
  invoices[index].status = status;
  saveData('invoices', invoices);
  renderInvoicesTable();
}

/* Incremental numeric ID for invoices */
function generateInvoiceId() {
  let maxId = 0;
  invoices.forEach((i) => {
    if (typeof i.id === 'number' && i.id > maxId) {
      maxId = i.id;
    }
  });
  return maxId + 1;
}

function updatePurchasedItemRowTotal(row) {
  const qty = parseFloat(row.querySelector('.purchased-qty').value || 0);
  const unitPrice = parseFloat(row.querySelector('.purchased-price').value || 0);
  const total = (isNaN(qty) ? 0 : qty) * (isNaN(unitPrice) ? 0 : unitPrice);
  row.querySelector('.purchased-item-total').textContent = formatCurrency(total);
}

function renderReceiptPreview(row) {
  const preview = row.querySelector('.receipt-preview');
  const receipt = row._receipt;

  if (!receipt) {
    preview.textContent = 'No receipt attached.';
    return;
  }

  const safeImageDataUrl = getSafeImageDataUrl(receipt.dataUrl);
  if (receipt.type && receipt.type.startsWith('image/') && safeImageDataUrl) {
    preview.innerHTML = 'Attached receipt: ' + escapeHtml(receipt.name || 'image') + '<img src="' + safeImageDataUrl + '" alt="Receipt preview" />';
    return;
  }

  preview.textContent = 'Attached file: ' + (receipt.name || 'Receipt file');
}

function createPurchasedItemRow(item = createDefaultPurchasedItem()) {
  const row = document.createElement('div');
  row.className = 'purchased-item-row';

  row.innerHTML = `
    <div class="form-row">
      <label style="flex:2;">
        Description
        <input type="text" class="purchased-desc" placeholder="Eero Pro Router" />
      </label>
      <label>
        Category
        <select class="purchased-category">
          <option value="Purchased Item">Purchased Item</option>
          <option value="Expense">Expense</option>
        </select>
      </label>
    </div>
    <div class="form-row">
      <label>
        Quantity
        <input type="number" class="purchased-qty" min="0" step="0.01" value="1" />
      </label>
      <label>
        Unit Price
        <input type="number" class="purchased-price" min="0" step="0.01" value="0" />
      </label>
      <div class="inline-total">Line Total: <strong>$<span class="purchased-item-total">0.00</span></strong></div>
      <button type="button" class="danger remove-purchased-item">Remove</button>
    </div>
    <div class="form-row">
      <label style="flex:1;">
        Receipt (Optional image/pdf)
        <input type="file" class="purchased-receipt" accept="image/*,.pdf,application/pdf" />
      </label>
    </div>
    <div class="receipt-preview">No receipt attached.</div>
  `;

  row.querySelector('.purchased-desc').value = item.description || '';
  row.querySelector('.purchased-category').value = item.category || 'Purchased Item';
  row.querySelector('.purchased-qty').value = typeof item.quantity === 'number' ? item.quantity : 1;
  row.querySelector('.purchased-price').value = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
  row._receipt = item.receipt || null;

  row.querySelector('.purchased-qty').addEventListener('input', () => updatePurchasedItemRowTotal(row));
  row.querySelector('.purchased-price').addEventListener('input', () => updatePurchasedItemRowTotal(row));

  row.querySelector('.remove-purchased-item').addEventListener('click', () => {
    row.remove();
    const list = document.getElementById('purchasedItemsList');
    if (list.children.length === 0) {
      list.appendChild(createPurchasedItemRow());
    }
  });

  row.querySelector('.purchased-receipt').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      row._receipt = null;
      renderReceiptPreview(row);
      return;
    }

    if (typeof FileReader === 'undefined') {
      row._receipt = {
        name: file.name,
        type: file.type || '',
        dataUrl: ''
      };
      renderReceiptPreview(row);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      row._receipt = {
        name: file.name,
        type: file.type || '',
        dataUrl: reader.result
      };
      renderReceiptPreview(row);
    };
    reader.onerror = () => {
      row._receipt = {
        name: file.name,
        type: file.type || '',
        dataUrl: ''
      };
      renderReceiptPreview(row);
    };
    reader.readAsDataURL(file);
  });

  updatePurchasedItemRowTotal(row);
  renderReceiptPreview(row);
  return row;
}

function renderPurchasedItems(items) {
  const list = document.getElementById('purchasedItemsList');
  list.innerHTML = '';

  const safeItems = Array.isArray(items) && items.length > 0 ? items : [createDefaultPurchasedItem()];
  safeItems.forEach((item) => {
    list.appendChild(createPurchasedItemRow(item));
  });
}

function collectPurchasedItemsFromForm() {
  const rows = Array.from(document.querySelectorAll('#purchasedItemsList .purchased-item-row'));
  const purchasedItems = [];

  for (const row of rows) {
    const description = row.querySelector('.purchased-desc').value.trim();
    const category = row.querySelector('.purchased-category').value || 'Purchased Item';
    const quantityRaw = row.querySelector('.purchased-qty').value;
    const priceRaw = row.querySelector('.purchased-price').value;

    const quantity = parseFloat(quantityRaw || 0);
    const unitPrice = parseFloat(priceRaw || 0);
    const receipt = row._receipt || null;

    const hasAnyValue = Boolean(
      description ||
      receipt ||
      (!isNaN(quantity) && quantity !== 1) ||
      (!isNaN(unitPrice) && unitPrice !== 0)
    );
    if (!hasAnyValue) {
      continue;
    }

    if (!description) {
      alert('Purchased item description is required.');
      return null;
    }

    if (isNaN(quantity) || quantity < 0) {
      alert('Purchased item quantity must be 0 or greater.');
      return null;
    }

    if (isNaN(unitPrice) || unitPrice < 0) {
      alert('Purchased item unit price must be 0 or greater.');
      return null;
    }

    purchasedItems.push({
      description,
      category,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
      receipt
    });
  }

  return purchasedItems;
}

/* Create or update invoice when form is submitted */
function handleCreateInvoice(e) {
  e.preventDefault();

  const customerIndex = document.getElementById('invoiceCustomer').value;
  const from = document.getElementById('invoiceFrom').value;
  const to = document.getElementById('invoiceTo').value;
  const invoiceDate = document.getElementById('invoiceDate').value;
  let notes = document.getElementById('invoiceNotes').value.trim();

  if (customerIndex === '') {
    alert('Select a customer.');
    return;
  }
  if (!from || !to || !invoiceDate) {
    alert('From, To, and Invoice Date are required.');
    return;
  }

  if (!notes && settings.defaultInvoiceNotes) {
    notes = settings.defaultInvoiceNotes;
  }

  const custIdxNum = parseInt(customerIndex, 10);

  // Collect time entries for this customer in range
  const customerTimeEntries = timeEntries.filter((t) => {
    return (
      t.customerIndex === custIdxNum &&
      t.date >= from &&
      t.date <= to
    );
  });

  if (customerTimeEntries.length === 0) {
    if (!confirm('No time entries found for this range. Create an empty invoice?')) {
      return;
    }
  }

  const customer = customers[custIdxNum];
  const rate = customer && typeof customer.rate === 'number' ? customer.rate : 0;

  let serviceSubtotal = 0;
  const serviceLines = customerTimeEntries.map((t) => {
    const hours = parseFloat(t.hours || 0);
    const amount = hours * rate;
    serviceSubtotal += amount;
    return {
      date: t.date,
      description: t.description || '',
      hours,
      rate,
      amount
    };
  });

  const purchasedItems = collectPurchasedItemsFromForm();
  if (purchasedItems === null) {
    return;
  }

  const purchasedSubtotal = purchasedItems.reduce((sum, item) => sum + item.amount, 0);
  const total = serviceSubtotal + purchasedSubtotal;

  // Determine if we are editing or creating
  const editingIndexRaw = document.getElementById('invoiceId').value;
  const isEditing = editingIndexRaw !== '';
  const editingIndex = isEditing ? parseInt(editingIndexRaw, 10) : -1;

  let id;
  if (isEditing) {
    id = invoices[editingIndex].id; // keep existing invoice number
  } else {
    id = generateInvoiceId();
  }

  const invoice = {
    id,
    customerIndex: custIdxNum,
    from,
    to,
    invoiceDate,
    notes,
    lines: serviceLines,
    serviceLines,
    purchasedItems,
    serviceSubtotal,
    purchasedSubtotal,
    total,
    status: isEditing ? (invoices[editingIndex].status || 'draft') : 'draft'
  };

  if (isEditing) {
    invoices[editingIndex] = invoice;
  } else {
    invoices.push(invoice);
  }

  saveData('invoices', invoices);
  renderInvoicesTable();

  // clear edit state
  document.getElementById('invoiceId').value = '';

  renderPurchasedItems([createDefaultPurchasedItem()]);

  showInvoicePreview(isEditing ? editingIndex : invoices.length - 1);
}

/* Load an existing invoice back into the form for editing */
function loadInvoiceIntoForm(index) {
  const inv = invoices[index];
  document.getElementById('invoiceId').value = index.toString();
  document.getElementById('invoiceCustomer').value = inv.customerIndex.toString();
  document.getElementById('invoiceFrom').value = inv.from;
  document.getElementById('invoiceTo').value = inv.to;
  document.getElementById('invoiceDate').value = inv.invoiceDate;
  document.getElementById('invoiceNotes').value = inv.notes || '';
  renderPurchasedItems(inv.purchasedItems || [createDefaultPurchasedItem()]);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Delete an invoice */
function deleteInvoice(index) {
  if (!confirm('Delete this invoice?')) return;
  invoices.splice(index, 1);
  saveData('invoices', invoices);
  renderInvoicesTable();
  const previewSection = document.getElementById('invoicePreviewSection');
  if (previewSection) previewSection.style.display = 'none';
}

function renderServiceLinesTable(serviceLines) {
  let html = '';

  html += '<div style="margin-bottom:18px;">';
  html += '<div style="font-size:12px; font-weight:bold; margin-bottom:6px;">Service Line Items</div>';
  html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
  html += '<thead>';
  html += '<tr style="background:#111827; color:#f9fafb; page-break-inside:avoid;">';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:left; padding:6px;">Date</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:left; padding:6px;">Description</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Hours</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Rate</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Amount</th>';
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';

  if (serviceLines.length > 0) {
    serviceLines.forEach((line, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f5f5f5';
      html += '<tr style="background:' + rowBg + ';">';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb;">' + escapeHtml(line.date) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb;">' + escapeHtml(line.description) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + Number(line.hours || 0).toFixed(2) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + formatCurrency(line.rate) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + formatCurrency(line.amount) + '</td>';
      html += '</tr>';
    });
  } else {
    html += '<tr><td colspan="5" style="padding:8px; text-align:center; color:#6b7280;">No service line items</td></tr>';
  }

  const subtotal = serviceLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  html += '<tr style="page-break-inside:avoid;">';
  html += '<td colspan="4" style="padding:8px; text-align:right; font-weight:bold;">Services Subtotal</td>';
  html += '<td style="padding:8px; text-align:right; font-weight:bold;">' + formatCurrency(subtotal) + '</td>';
  html += '</tr>';

  html += '</tbody></table>';
  html += '</div>';

  return { html, subtotal };
}

function renderPurchasedItemsTable(purchasedItems) {
  let html = '';

  html += '<div style="margin-bottom:18px;">';
  html += '<div style="font-size:12px; font-weight:bold; margin-bottom:6px;">Purchased Items / Expenses</div>';
  html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
  html += '<thead>';
  html += '<tr style="background:#1f2937; color:#f9fafb; page-break-inside:avoid;">';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:left; padding:6px;">Category</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:left; padding:6px;">Description</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Qty</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Unit Price</th>';
  html += '<th style="border-bottom:1px solid #e5e7eb; text-align:right; padding:6px;">Amount</th>';
  html += '</tr>';
  html += '</thead>';
  html += '<tbody>';

  if (purchasedItems.length > 0) {
    purchasedItems.forEach((item, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      html += '<tr style="background:' + rowBg + ';">';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb;">' + escapeHtml(item.category || 'Purchased Item') + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb;">' + escapeHtml(item.description) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + Number(item.quantity || 0).toFixed(2) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + formatCurrency(item.unitPrice) + '</td>';
      html += '<td style="padding:6px; border-bottom:1px solid #e5e7eb; text-align:right;">' + formatCurrency(item.amount) + '</td>';
      html += '</tr>';
    });
  } else {
    html += '<tr><td colspan="5" style="padding:8px; text-align:center; color:#6b7280;">No purchased items/expenses</td></tr>';
  }

  const subtotal = purchasedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  html += '<tr style="page-break-inside:avoid;">';
  html += '<td colspan="4" style="padding:8px; text-align:right; font-weight:bold;">Purchased Items Subtotal</td>';
  html += '<td style="padding:8px; text-align:right; font-weight:bold;">' + formatCurrency(subtotal) + '</td>';
  html += '</tr>';

  html += '</tbody></table>';
  html += '</div>';

  return { html, subtotal };
}

function renderReceiptsSection(purchasedItems) {
  const withReceipts = purchasedItems.filter((item) => item.receipt && (item.receipt.name || item.receipt.dataUrl));
  if (withReceipts.length === 0) {
    return '';
  }

  let html = '';
  html += '<div style="margin-top:8px; margin-bottom:16px; page-break-inside:auto;">';
  html += '<div style="font-size:12px; font-weight:bold; margin-bottom:6px;">Purchased Item Attachments</div>';

  withReceipts.forEach((item) => {
    const receipt = item.receipt;
    html += '<div style="border:1px solid #e5e7eb; border-radius:6px; padding:8px; margin-bottom:8px; page-break-inside:avoid;">';
    html += '<div style="font-size:12px; margin-bottom:4px;"><strong>' + escapeHtml(item.description) + '</strong> (' + escapeHtml(item.category || 'Purchased Item') + ')</div>';

    const safeImageDataUrl = getSafeImageDataUrl(receipt.dataUrl);
    if (receipt.type && receipt.type.startsWith('image/') && safeImageDataUrl) {
      html += '<img src="' + safeImageDataUrl + '" alt="Receipt for ' + escapeHtml(item.description) + '" style="max-width:100%; max-height:300px; border:1px solid #e5e7eb; border-radius:4px;"/>';
    } else {
      html += '<div style="font-size:12px; color:#374151;">Attachment available: ' + escapeHtml(receipt.name || 'Receipt file') + '</div>';
    }

    html += '</div>';
  });

  html += '</div>';
  return html;
}

/* Nicer invoice preview with optional banner and compact Invoice # */
function showInvoicePreview(index) {
  const inv = invoices[index];
  currentPreviewInvoiceId = inv.id;
  const previewDiv = document.getElementById('invoicePreview');
  const c = customers[inv.customerIndex];

  const businessName = settings.businessName || 'Your Business Name';
  const businessAddress = settings.businessAddress || 'Your Address Line 1\nCity, State ZIP';
  const businessEmail = settings.businessEmail || 'you@example.com';
  const bannerSrc = settings.bannerDataUrl || settings.bannerUrl || '';

  // ==== PAYMENT OPTIONS (edit ACH details locally) ====
  const paymentOptionsTitle = 'Payment Options';

  const achDetails =
    'ACH / Bank Transfer:\n' +
    'Bank: Huntington National Bank\n' +
    'Routing #: 041000153\n' +
    'Account #: 01663397094\n' +
    'Account Type: Checking\n' +
    'Account Holder Name: Londo Technologies LTD';

  const paymentOptionsBody =
    'PayPal: send to jimmyrlondo@gmail.com\n' +
    'Zelle: send to 440-320-1989\n' +
    'Checks: payable to "' + businessName + '" and mailed to:\n' +
    businessAddress + '\n\n' +
    achDetails;

  const footerNote =
    'Payment is due within 14 days of invoice date unless otherwise agreed in writing. ' +
    'Please include the invoice number with all payments and correspondence.';

  const serviceLines = getServiceLines(inv);
  const purchasedItems = inv.purchasedItems || [];

  const serviceSection = renderServiceLinesTable(serviceLines);
  const purchasedSection = renderPurchasedItemsTable(purchasedItems);
  const grandTotal = serviceSection.subtotal + purchasedSection.subtotal;

  let html = '';
  html += '<div style="max-width:800px; margin:0 auto; font-family:Arial,sans-serif; font-size:13px; color:#111827;">';

  // Optional banner
  if (bannerSrc) {
    html += '<div style="text-align:center; margin-bottom:16px; page-break-inside:avoid;">';
    html += '<img src="' + bannerSrc.replace(/"/g, '&quot;') + '" alt="Invoice Banner" style="max-width:100%; height:auto;"/>';
    html += '</div>';
  }

  // Header block
  html += '<div style="display:flex; justify-content:space-between; margin-bottom:20px; page-break-inside:avoid;">';

  // Left: business info (same size/weight)
  html += '<div style="max-width:60%; font-size:12px; line-height:1.5;">';
  html += '<div>' + escapeHtml(businessName) + '</div>';
  html += '<div style="white-space:pre-line;">' + escapeHtml(businessAddress) + '</div>';
  html += '<div style="margin-top:4px;">' + escapeHtml(businessEmail) + '</div>';
  html += '</div>';

  // Right: invoice meta – small and subtle
  html += '<div style="text-align:right; font-size:12px; line-height:1.5;">';
  html += '<div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#6b7280; margin-bottom:2px;">Invoice</div>';
  html += '<div style="margin-bottom:4px;">Invoice No.: ' + escapeHtml(inv.id) + '</div>';
  html += '<div>Invoice Date: ' + escapeHtml(inv.invoiceDate) + '</div>';
  html += '<div>Period: ' + escapeHtml(inv.from) + ' to ' + escapeHtml(inv.to) + '</div>';
  html += '<div>Status: ' + escapeHtml(inv.status || 'draft') + '</div>';
  html += '</div>';

  html += '</div>'; // end header flex

  // Bill To
  html += '<div style="margin-bottom:16px; page-break-inside:avoid;">';
  html += '<div style="font-size:12px; font-weight:bold; margin-bottom:4px;">Bill To</div>';
  if (c) {
    if (c.company) {
      html += '<div>' + escapeHtml(c.company) + '</div>';
    }
    if (c.companyAddress) {
      html += '<div style="white-space:pre-line;">' + escapeHtml(c.companyAddress) + '</div>';
    }
    if (c.name) {
      html += '<div>Attn: ' + escapeHtml(c.name) + '</div>';
    }
    if (c.email) html += '<div>' + escapeHtml(c.email) + '</div>';
    if (c.phone) html += '<div>' + escapeHtml(c.phone) + '</div>';
  } else {
    html += '<div>(Deleted customer)</div>';
  }
  html += '</div>';

  // Notes
  if (inv.notes) {
    html += '<div style="margin-bottom:16px; page-break-inside:avoid;">';
    html += '<div style="font-size:12px; font-weight:bold; margin-bottom:4px;">Notes</div>';
    html += '<div>' + escapeHtml(inv.notes).replace(/\n/g, '<br/>') + '</div>';
    html += '</div>';
  }

  html += serviceSection.html;
  html += purchasedSection.html;
  html += renderReceiptsSection(purchasedItems);

  html += '<div style="margin-bottom:16px; page-break-inside:avoid;">';
  html += '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
  html += '<tr>';
  html += '<td style="padding:8px; text-align:right; font-weight:bold; border-top:2px solid #111827;">Grand Total</td>';
  html += '<td style="padding:8px; text-align:right; width:140px; font-weight:bold; border-top:2px solid #111827;">' + formatCurrency(grandTotal) + '</td>';
  html += '</tr>';
  html += '</table>';
  html += '</div>';

  // Footer: payment options + terms
  html += '<div style="margin-top:32px; padding-top:12px; border-top:1px solid #e5e7eb; page-break-inside:avoid;">';

  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:12px; font-weight:bold; margin-bottom:4px;">' + paymentOptionsTitle + '</div>';
  html += '<div style="white-space:pre-line; font-size:12px;">' + escapeHtml(paymentOptionsBody) + '</div>';
  html += '</div>';

  html += '<div style="font-size:11px; color:#6b7280; margin-top:8px;">';
  html += escapeHtml(footerNote);
  html += '</div>';

  html += '</div>'; // footer

  html += '</div>'; // outer container

  previewDiv.innerHTML = html;
  document.getElementById('invoicePreviewSection').style.display = 'block';
}

function buildInvoiceFileName(inv, customer) {
  const rawCompany = (settings.businessName || 'LondoTechnologies').replace(/\s+/g, '');
  const invNumber = inv ? String(inv.id).padStart(4, '0') : '0000';
  const clientSlug = customer && customer.name
    ? customer.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').substring(0, 40)
    : 'Client';
  const datePart = inv && inv.invoiceDate ? inv.invoiceDate : new Date().toISOString().slice(0, 10);
  return `${rawCompany}_Invoice_${invNumber}_${clientSlug}_${datePart}.pdf`;
}

function getCurrentPreviewInvoiceDetails() {
  const invoiceIndex = invoices.findIndex((i) => i.id === currentPreviewInvoiceId);
  if (invoiceIndex < 0) return null;
  const inv = invoices[invoiceIndex];
  const customer = customers[inv.customerIndex] || null;
  return { invoiceIndex, inv, customer };
}

function openPrintWindow(fileName) {
  const previewHtml = document.getElementById('invoicePreview').innerHTML;
  const win = window.open('', '_blank', 'width=800,height=600');

  if (!win) {
    alert('Unable to open print window. Please check popup blocker settings.');
    return;
  }

  win.document.write('<html><head><title>' + fileName + '</title>');
  win.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}</style>');
  win.document.write('</head><body>');
  win.document.write(previewHtml);
  win.document.write('</body></html>');
  win.document.close();
  win.focus();
  win.print();
}

async function downloadCurrentInvoicePdf() {
  const details = getCurrentPreviewInvoiceDetails();
  if (!details) {
    alert('Preview an invoice before downloading.');
    return;
  }

  showInvoicePreview(details.invoiceIndex);
  const fileName = buildInvoiceFileName(details.inv, details.customer);

  const hasJsPdf = !!(window.jspdf && window.jspdf.jsPDF);
  const hasHtml2Canvas = typeof window.html2canvas !== 'undefined';

  if (!hasJsPdf || !hasHtml2Canvas) {
    alert('PDF download is not supported in this browser. Falling back to Print.');
    openPrintWindow(fileName);
    return;
  }

  const previewEl = document.getElementById('invoicePreview');

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });

    await pdf.html(previewEl, {
      margin: [20, 20, 20, 20],
      autoPaging: 'text',
      html2canvas: {
        scale: 0.65,
        useCORS: true,
        backgroundColor: '#ffffff'
      }
    });

    pdf.save(fileName);
  } catch (err) {
    console.error(err);
    alert('Could not generate PDF in this browser. Falling back to Print.');
    openPrintWindow(fileName);
  }
}

function handlePrintInvoice() {
  const details = getCurrentPreviewInvoiceDetails();
  if (!details) {
    alert('Preview an invoice before printing.');
    return;
  }
  const fileName = buildInvoiceFileName(details.inv, details.customer);
  openPrintWindow(fileName);
}

/* Init */
function init() {
  loadBaseData();
  populateCustomerSelect();
  renderInvoicesTable();
  renderPurchasedItems([createDefaultPurchasedItem()]);

  document.getElementById('invoiceForm').addEventListener('submit', handleCreateInvoice);
  document.getElementById('printInvoiceBtn').addEventListener('click', handlePrintInvoice);
  document.getElementById('downloadPdfBtn').addEventListener('click', downloadCurrentInvoicePdf);
  document.getElementById('addPurchasedItemBtn').addEventListener('click', () => {
    document.getElementById('purchasedItemsList').appendChild(createPurchasedItemRow());
  });
}

init();
