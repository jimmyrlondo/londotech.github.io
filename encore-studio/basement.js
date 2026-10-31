// Encore: Basement Studio's page: the download buttons point at the newest release on GitHub
// (pre-releases included, since that's where the app is for now), with the installer preferred
// over the zip. If GitHub can't be reached, the buttons stay on the releases page.
const $ = id => document.getElementById(id);
const REPO = 'jimmyrlondo/encore-studio';

// screenshots in shots/ (shown when there are any)
const SHOTS = [
  { file: 'basement-tracks.jpg', alt: 'A band recorded on every input: drums grouped, bass, guitars and vocals' },
  { file: 'basement-mixer.jpg', alt: 'The mixer: effects, groups, sends and the master strip' },
  { file: 'basement-tuner.jpg', alt: 'The tuner: 87 instruments and their tunings' },
];
if (SHOTS.length) $('shots').innerHTML = SHOTS.map(s => `<figure><a href="shots/${s.file}" target="_blank" rel="noopener"><img src="shots/${s.file}" alt="${s.alt}" loading="lazy"></a><figcaption>${s.alt}</figcaption></figure>`).join('');
else $('shots').remove();

function pick(assets, tests) {
  for (const t of tests) { const a = assets.find(x => t.test(x.name)); if (a) return a; }
  return null;
}
const size = b => b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.round(b / 1e3) + ' KB';

try {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(res.status);
  const rel = (await res.json()).find(r => !r.draft && r.assets?.length);
  if (rel) {
    const win = pick(rel.assets, [/windows.*setup.*\.exe$/i, /\.exe$/i, /windows.*\.zip$/i]);
    const mac = pick(rel.assets, [/macos.*\.dmg$/i, /\.dmg$/i, /macos.*\.zip$/i]);
    if (win) { $('dlWin').href = win.browser_download_url; $('dlWin').title = `${win.name} (${size(win.size)})`; if (/\.zip$/i.test(win.name)) $('dlWin').textContent = 'Download for Windows (zip)'; }
    if (mac) { $('dlMac').href = mac.browser_download_url; $('dlMac').title = `${mac.name} (${size(mac.size)})`; }
    const when = new Date(rel.published_at || rel.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('ver').textContent = `Version ${rel.tag_name.replace(/^v/, '')}${rel.prerelease ? ' (preview)' : ''}, ${when}. Free, no account needed. Windows 10/11 and macOS.`;
  }
} catch { /* the buttons already lead to the releases page */ }
