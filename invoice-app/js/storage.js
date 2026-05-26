// Simple wrapper around localStorage with JSON and versioning

const LONDO_STORAGE_PREFIX = 'londo_tool_';

function saveData(key, value) {
  const fullKey = LONDO_STORAGE_PREFIX + key;
  const payload = {
    version: 1,
    data: value
  };
  localStorage.setItem(fullKey, JSON.stringify(payload));
}

function loadData(key, defaultValue) {
  const fullKey = LONDO_STORAGE_PREFIX + key;
  const raw = localStorage.getItem(fullKey);
  if (!raw) return defaultValue;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed.data;
    }
    return defaultValue;
  } catch (e) {
    console.error('Failed to parse storage for key', key, e);
    return defaultValue;
  }
}

function exportAllData() {
  const all = {};
  for (let i = 0; i < localStorage.length; i++) {
    const fullKey = localStorage.key(i);
    if (fullKey && fullKey.startsWith(LONDO_STORAGE_PREFIX)) {
      const shortKey = fullKey.substring(LONDO_STORAGE_PREFIX.length);
      all[shortKey] = JSON.parse(localStorage.getItem(fullKey));
    }
  }
  return JSON.stringify(all, null, 2);
}

function importAllData(jsonString) {
  const all = JSON.parse(jsonString);
  for (const key in all) {
    const fullKey = LONDO_STORAGE_PREFIX + key;
    localStorage.setItem(fullKey, JSON.stringify(all[key]));
  }
}