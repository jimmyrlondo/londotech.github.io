// ENCORE. VST's page: the download button points at the newest installer on GitHub
// (jimmyrlondo/encore-vst holds only the releases). If GitHub can't be reached, or
// there's no release yet, the buttons stay on the releases page.
const $ = id => document.getElementById(id);
const REPO = 'jimmyrlondo/encore-vst';
const size = b => b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.round(b / 1e3) + ' KB';

try {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(res.status);
  const rel = (await res.json()).find(r => !r.draft && r.assets?.length);
  const win = rel?.assets.find(a => /windows.*setup.*\.exe$/i.test(a.name)) || rel?.assets.find(a => /\.exe$/i.test(a.name));
  if (win) {
    $('dlWin').href = win.browser_download_url;
    $('dlWin').title = `${win.name} (${size(win.size)})`;
    const when = new Date(rel.published_at || rel.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const mac = rel.assets.find(a => /macos.*\.pkg$/i.test(a.name)) || rel.assets.find(a => /mac.*\.(pkg|dmg|zip)$/i.test(a.name));
    if (mac) { $('dlMac').href = mac.browser_download_url; $('dlMac').title = `${mac.name} (${size(mac.size)})`; }
    const linux = rel.assets.some(a => /linux/i.test(a.name));
    const os = ['Windows 10 and 11 (64-bit)', mac && 'macOS 11 or newer', linux && 'Linux and Raspberry Pi'].filter(Boolean);
    const list = os.length > 1 ? os.slice(0, -1).join(', ') + ' and ' + os.at(-1) : os[0];
    $('ver').textContent = `Version ${rel.tag_name.replace(/^v/, '')}${rel.prerelease ? ' (preview)' : ''}, ${when}. Free, no account needed. ${list}.`;
  }
} catch { /* the button already leads to the releases page */ }
