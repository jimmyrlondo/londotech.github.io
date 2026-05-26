const SETTINGS_KEY = 'settings';

let settingsState = {
  businessName: '',
  businessAddress: '',
  businessEmail: '',
  defaultInvoiceNotes: '',
  bannerUrl: '',
  bannerDataUrl: '' // data URL from uploaded PNG
};

function loadSettings() {
  const s = loadData(SETTINGS_KEY, settingsState);
  settingsState = {
    ...settingsState,
    ...s
  };

  document.getElementById('settingsBusinessName').value = settingsState.businessName || '';
  document.getElementById('settingsBusinessAddress').value = settingsState.businessAddress || '';
  document.getElementById('settingsBusinessEmail').value = settingsState.businessEmail || '';
  document.getElementById('settingsInvoiceNotes').value = settingsState.defaultInvoiceNotes || '';
  document.getElementById('settingsBannerUrl').value = settingsState.bannerUrl || '';

  updateBannerPreview();
}

function saveSettingsToStorage() {
  saveData(SETTINGS_KEY, settingsState);
}

function updateBannerPreview() {
  const wrapper = document.getElementById('settingsBannerPreviewWrapper');
  const img = document.getElementById('settingsBannerPreview');

  const src = settingsState.bannerDataUrl || settingsState.bannerUrl || '';

  if (src) {
    wrapper.style.display = 'block';
    img.src = src;
  } else {
    wrapper.style.display = 'none';
    img.src = '';
  }
}

/* Handle form submit */
document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  settingsState.businessName = document.getElementById('settingsBusinessName').value.trim();
  settingsState.businessAddress = document.getElementById('settingsBusinessAddress').value.trim();
  settingsState.businessEmail = document.getElementById('settingsBusinessEmail').value.trim();
  settingsState.defaultInvoiceNotes = document.getElementById('settingsInvoiceNotes').value.trim();
  settingsState.bannerUrl = document.getElementById('settingsBannerUrl').value.trim();

  saveSettingsToStorage();
  alert('Settings saved.');
});

/* Reset */
document.getElementById('resetSettingsBtn').addEventListener('click', () => {
  if (!confirm('Reset settings to empty?')) return;
  settingsState = {
    businessName: '',
    businessAddress: '',
    businessEmail: '',
    defaultInvoiceNotes: '',
    bannerUrl: '',
    bannerDataUrl: ''
  };
  saveSettingsToStorage();
  loadSettings();
});

/* Handle file upload: read PNG as data URL and store it */
document.getElementById('settingsBannerFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.type !== 'image/png') {
    alert('Please upload a PNG file.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (ev) {
    const dataUrl = ev.target.result;
    settingsState.bannerDataUrl = dataUrl;
    // Clear URL field so data URL takes priority
    // (you can comment this out if you want both)
    // document.getElementById('settingsBannerUrl').value = '';
    saveSettingsToStorage();
    updateBannerPreview();
  };
  reader.readAsDataURL(file);
});

loadSettings();