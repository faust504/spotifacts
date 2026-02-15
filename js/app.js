
const $ = id => document.getElementById(id);
const landing = $('landing'), processing = $('processing'), configPanel = $('configPanel'), result = $('result'), tutorial = $('tutorial');
const dropzone = $('dropzone'), fileInput = $('fileInput'), fileListEl = $('fileList'), errorMsg = $('errorMsg');
const generateBtn = $('generateBtn'), buildBtn = $('buildBtn'), backBtn = $('backBtn'), tutorialBtn = $('tutorialBtn'), tutorialBackBtn = $('tutorialBackBtn');
const saveImageBtn = $('saveImageBtn'), resetBtn = $('resetBtn'), customizeBtn = $('customizeBtn');

// Initial state - Force disable to ensure it's unclickable
generateBtn.disabled = true;

let collectedFiles = new Map();
let parsedRawHistory = [];
let parsedExtras = {};

const ALL_SECTIONS = [
    { id: 'overview', label: 'Overview Stats' },
    { id: 'artists', label: 'Top 10 Artists' },
    { id: 'tracks', label: 'Top 10 Tracks' },
    { id: 'hours', label: 'Listening Hours' },
    { id: 'genres', label: 'Top Genres' },
    { id: 'vitamins', label: 'Library / Social' },
    { id: 'wrapped', label: 'Wrapped Extras' },
    { id: 'funfacts', label: 'Fun Facts' },
];
const PRESETS = {
    complete: ALL_SECTIONS.map(s => s.id),
    artists: ['overview', 'artists', 'funfacts'],
    tracks: ['overview', 'tracks', 'funfacts'],
    genres: ['overview', 'genres', 'hours', 'funfacts'],
    habits: ['overview', 'hours', 'wrapped', 'vitamins', 'funfacts'],
    custom: ALL_SECTIONS.map(s => s.id),
};

let activePreset = 'complete', activeSections = new Set(PRESETS.complete), activeRange = 'all';

// TUTORIAL NAV
tutorialBtn.addEventListener('click', () => { landing.style.display = 'none'; tutorial.style.display = 'block'; window.scrollTo(0, 0); });
tutorialBackBtn.addEventListener('click', () => { tutorial.style.display = 'none'; landing.style.display = 'block'; });

// FILE HANDLING
async function handleDrop(files) {
    for (const f of files) {
        if (f.name.endsWith('.zip')) await processZip(f, collectedFiles);
        else if (f.name.endsWith('.json')) collectedFiles.set(f.name, await readText(f));
    }
    renderFileList(); hideError();
    generateBtn.disabled = !hasHistory();
    if (!generateBtn.disabled) {
        setTimeout(() => generateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
}

function hasHistory() { for (const n of collectedFiles.keys()) if (n.startsWith('StreamingHistory_music_')) return true; return false }

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

function renderFileList() {
    fileListEl.innerHTML = [...collectedFiles.keys()].map(n => `<div class="file-item"><span class="check">✓</span><span class="fname">${esc(n)}</span><span class="fsize">${(collectedFiles.get(n).length / 1024).toFixed(1)}KB</span></div>`).join('');
}

function showError(m) { errorMsg.textContent = m; errorMsg.style.display = 'block' }
function hideError() { errorMsg.style.display = 'none' }

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover') });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleDrop(e.dataTransfer.files) });
fileInput.addEventListener('change', e => handleDrop(e.target.files));

generateBtn.addEventListener('click', async () => {
    if (generateBtn.disabled || !hasHistory()) return;
    try {
        landing.style.display = 'none'; processing.style.display = 'block';
        await new Promise(r => setTimeout(r, 300));

        const output = parseRawData(collectedFiles);
        parsedRawHistory = output.parsedRawHistory;
        parsedExtras = output.parsedExtras;

        await new Promise(r => setTimeout(r, 300));
        processing.style.display = 'none';
        showConfig();
    } catch (e) { processing.style.display = 'none'; landing.style.display = 'block'; showError('Error: ' + e.message); console.error(e) }
});

// CONFIG
function showConfig() { configPanel.style.display = 'block'; buildSectionToggles(); bindPresets(); bindTimeRange() }
function buildSectionToggles() {
    const c = $('sectionToggles');
    c.innerHTML = ALL_SECTIONS.map(s => `<label class="toggle-chip ${activeSections.has(s.id) ? 'on' : ''}" data-sid="${s.id}"><input type="checkbox" ${activeSections.has(s.id) ? 'checked' : ''}><span class="chip-dot"></span>${s.label}</label>`).join('');
    c.querySelectorAll('.toggle-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const sid = chip.dataset.sid, cb = chip.querySelector('input'); cb.checked = !cb.checked;
            if (cb.checked) { activeSections.add(sid); chip.classList.add('on') } else { activeSections.delete(sid); chip.classList.remove('on') }
        });
    });
}
function bindPresets() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); activePreset = btn.dataset.preset;
            activeSections = new Set(PRESETS[activePreset]);
            $('customSections').style.display = activePreset === 'custom' ? 'block' : 'none';
            buildSectionToggles();
        });
    });
}
function bindTimeRange() {
    document.querySelectorAll('.time-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active'); activeRange = pill.dataset.range;
        });
    });
}

buildBtn.addEventListener('click', () => {
    configPanel.style.display = 'none';
    const data = processData(filterByRange(parsedRawHistory, activeRange), parsedExtras);
    renderLabel(data, activeSections, activeRange);
    result.style.display = 'flex';
});
backBtn.addEventListener('click', () => { configPanel.style.display = 'none'; landing.style.display = 'block' });
customizeBtn.addEventListener('click', () => { result.style.display = 'none'; showConfig() });
resetBtn.addEventListener('click', () => { collectedFiles.clear(); fileListEl.innerHTML = ''; generateBtn.disabled = true; fileInput.value = ''; result.style.display = 'none'; configPanel.style.display = 'none'; landing.style.display = 'block' });

// Add save image functionality (was missing in my manual extraction but present in HTML)
saveImageBtn.addEventListener('click', () => {
    const label = document.getElementById('nfLabel');
    html2canvas(label, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'spotify-nutrition-facts.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
});
