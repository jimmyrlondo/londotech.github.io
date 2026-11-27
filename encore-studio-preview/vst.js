// ENCORE. VST's page: the download button points at the newest installer on GitHub
// (jimmyrlondo/encore-vst holds only the releases). If GitHub can't be reached, or
// there's no release yet, the button stays on the releases page.
const $ = id => document.getElementById(id);
const REPO = 'jimmyrlondo/encore-vst';
const size = b => b > 1e6 ? (b / 1e6).toFixed(0) + ' MB' : Math.round(b / 1e3) + ' KB';

try {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(res.status);
  const rel = (await res.json()).find(r => !r.draft && r.assets?.length);
  const win = rel?.assets.find(a => /windows.*setup.*\.exe$/i.test(a.name)) || rel?.assets.find(a => /\.exe$/i.test(a.name));
  if (win) {
    $('dl').hidden = false; $('soon').remove();
    $('dlWin').href = win.browser_download_url;
    $('dlWin').title = `${win.name} (${size(win.size)})`;
    const when = new Date(rel.published_at || rel.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('ver').textContent = `Version ${rel.tag_name.replace(/^v/, '')}${rel.prerelease ? ' (preview)' : ''}, ${when}, ${size(win.size)}. Free, no account needed. Windows 10 and 11, 64-bit, VST3. Mac is coming.`;
  }
} catch { /* the button already leads to the releases page */ }
