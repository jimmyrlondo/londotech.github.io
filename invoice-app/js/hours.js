let customers = [];
let timeEntries = [];

function loadCustomersForHours() {
  customers = loadData('customers', []);
  const select = document.getElementById('timeCustomer');
  const filterSelect = document.getElementById('filterCustomer');
  select.innerHTML = '';
  filterSelect.innerHTML = '<option value="">All</option>';

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

      const fopt = document.createElement('option');
      fopt.value = idx.toString();
      fopt.textContent = c.name || ('Customer ' + (idx + 1));
      filterSelect.appendChild(fopt);
    });
  }
}

function loadTimeEntries() {
  timeEntries = loadData('timeEntries', []);
  renderTimeEntries();
}

function renderTimeEntries() {
  const tbody = document.getElementById('hoursTableBody');
  tbody.innerHTML = '';

  const filterCustomer = document.getElementById('filterCustomer').value;
  const filterFrom = document.getElementById('filterFrom').value;
  const filterTo = document.getElementById('filterTo').value;

  let totalHours = 0;

  timeEntries.forEach((entry, index) => {
    if (filterCustomer && entry.customerIndex.toString() !== filterCustomer) {
      return;
    }
    if (filterFrom && entry.date < filterFrom) return;
    if (filterTo && entry.date > filterTo) return;

    totalHours += parseFloat(entry.hours || 0);

    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = entry.date || '';
    tr.appendChild(dateTd);

    const custTd = document.createElement('td');
    const customer = customers[entry.customerIndex];
    custTd.textContent = customer ? customer.name : '(deleted customer)';
    tr.appendChild(custTd);

    const hoursTd = document.createElement('td');
    hoursTd.textContent = entry.hours || '';
    tr.appendChild(hoursTd);

    const descTd = document.createElement('td');
    descTd.textContent = entry.description || '';
    tr.appendChild(descTd);

    const actionsTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => editEntry(index);
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'danger';
    delBtn.onclick = () => deleteEntry(index);
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });

  document.getElementById('hoursSummary').textContent =
    'Total hours: ' + totalHours.toFixed(2);
}

function editEntry(index) {
  const e = timeEntries[index];
  document.getElementById('timeEntryId').value = index;
  document.getElementById('timeCustomer').value = e.customerIndex.toString();
  document.getElementById('timeDate').value = e.date || '';
  document.getElementById('timeHours').value = e.hours || '';
  document.getElementById('timeDescription').value = e.description || '';
}

function deleteEntry(index) {
  if (!confirm('Delete this time entry?')) return;
  timeEntries.splice(index, 1);
  saveData('timeEntries', timeEntries);
  renderTimeEntries();
}

function resetTimeForm() {
  document.getElementById('timeEntryId').value = '';
  document.getElementById('hoursForm').reset();
}

document.getElementById('hoursForm').addEventListener('submit', (e) => {
  e.preventDefault();

  const customerIdx = document.getElementById('timeCustomer').value;
  const date = document.getElementById('timeDate').value;
  const hours = parseFloat(document.getElementById('timeHours').value || '0');
  const description = document.getElementById('timeDescription').value.trim();

  if (customerIdx === '') {
    alert('Select a customer.');
    return;
  }
  if (!date) {
    alert('Date is required.');
    return;
  }
  if (hours <= 0) {
    alert('Hours must be greater than 0.');
    return;
  }

  const entry = {
    customerIndex: parseInt(customerIdx, 10),
    date,
    hours: hours.toFixed(2),
    description
  };

  const id = document.getElementById('timeEntryId').value;
  if (id === '') {
    timeEntries.push(entry);
  } else {
    timeEntries[parseInt(id, 10)] = entry;
  }

  saveData('timeEntries', timeEntries);
  resetTimeForm();
  renderTimeEntries();
});

document.getElementById('timeResetBtn').addEventListener('click', resetTimeForm);
document.getElementById('filterBtn').addEventListener('click', renderTimeEntries);
document.getElementById('clearFilterBtn').addEventListener('click', () => {
  document.getElementById('filterCustomer').value = '';
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value = '';
  renderTimeEntries();
});

// Initialize
loadCustomersForHours();
loadTimeEntries();