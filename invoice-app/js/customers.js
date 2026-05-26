let customers = [];

function loadCustomers() {
  customers = loadData('customers', []);
  renderCustomers();
}

function renderCustomers() {
  const tbody = document.getElementById('customersTableBody');
  tbody.innerHTML = '';
  customers.forEach((c, index) => {
    const tr = document.createElement('tr');

    const companyTd = document.createElement('td');
    companyTd.textContent = c.company || '';
    tr.appendChild(companyTd);

    const nameTd = document.createElement('td');
    nameTd.textContent = c.name || '';
    tr.appendChild(nameTd);

    const emailTd = document.createElement('td');
    emailTd.textContent = c.email || '';
    tr.appendChild(emailTd);

    const phoneTd = document.createElement('td');
    phoneTd.textContent = c.phone || '';
    tr.appendChild(phoneTd);

    const rateTd = document.createElement('td');
    rateTd.textContent = c.rate || '';
    tr.appendChild(rateTd);

    const actionsTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => editCustomer(index);
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'danger';
    delBtn.style.marginLeft = '4px';
    delBtn.onclick = () => deleteCustomer(index);
    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });
}

function editCustomer(index) {
  const c = customers[index];
  document.getElementById('customerId').value = index;

  document.getElementById('customerName').value = c.name || '';
  document.getElementById('customerCompany').value = c.company || '';
  document.getElementById('customerCompanyAddress').value = c.companyAddress || '';

  document.getElementById('customerEmail').value = c.email || '';
  document.getElementById('customerPhone').value = c.phone || '';
  document.getElementById('customerRate').value = c.rate || '';
  document.getElementById('customerNotes').value = c.notes || '';
}

function deleteCustomer(index) {
  if (!confirm('Delete this customer?')) return;
  customers.splice(index, 1);
  saveData('customers', customers);
  renderCustomers();
}

function resetForm() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerForm').reset();
}

document.getElementById('customerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('customerId').value;

  const c = {
    name: document.getElementById('customerName').value.trim(),
    company: document.getElementById('customerCompany').value.trim(),
    companyAddress: document.getElementById('customerCompanyAddress').value.trim(),
    email: document.getElementById('customerEmail').value.trim(),
    phone: document.getElementById('customerPhone').value.trim(),
    rate: parseFloat(document.getElementById('customerRate').value || '0'),
    notes: document.getElementById('customerNotes').value.trim()
  };

  if (!c.name && !c.company) {
    alert('At least a contact name or company name is required.');
    return;
  }

  if (id === '') {
    customers.push(c);
  } else {
    customers[parseInt(id, 10)] = c;
  }
  saveData('customers', customers);
  resetForm();
  renderCustomers();
});

document.getElementById('resetBtn').addEventListener('click', resetForm);

loadCustomers();