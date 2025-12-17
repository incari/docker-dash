const API_BASE = '';
const ICONS = {
  cube: 'fa-cube', server: 'fa-server', database: 'fa-database', cloud: 'fa-cloud',
  code: 'fa-code', film: 'fa-film', download: 'fa-download', home: 'fa-home',
  shield: 'fa-shield-halved', chart: 'fa-chart-line', globe: 'fa-globe',
  terminal: 'fa-terminal', bug: 'fa-bug', gamepad: 'fa-gamepad',
  music: 'fa-music', image: 'fa-image', file: 'fa-file', folder: 'fa-folder'
};

let shortcuts = [];
let containers = [];

// Fetch data on load
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initIconGrid();
});

function initIconGrid() {
  const grid = document.getElementById('content-icon');
  if (!grid) return;
  grid.innerHTML = Object.entries(ICONS).map(([name, cls]) => `
    <button type="button" onclick="selectIcon('${name}')" 
            class="p-2 h-10 rounded hover:bg-gray-800 border border-transparent hover:border-gray-600 flex items-center justify-center transition-all icon-choice"
            data-icon="${name}">
      <i class="fas ${cls} text-lg text-gray-400"></i>
    </button>
  `).join('');
}

async function loadData() {
  await Promise.all([loadShortcuts(), loadContainers()]);

  // Decide initial view
  if (shortcuts.length === 0) {
    switchView('add');
  } else {
    switchView('dashboard');
  }
}

async function loadShortcuts() {
  try {
    const res = await fetch(`${API_BASE}/api/shortcuts`);
    shortcuts = await res.json();
    renderShortcuts();
  } catch (e) { console.error('Failed to load shortcuts:', e); }
}

async function loadContainers() {
  try {
    const res = await fetch(`${API_BASE}/api/containers`);
    containers = await res.json();
    renderContainers();
  } catch (e) { console.error('Failed to load containers:', e); }
}

// View Management
function switchView(viewName) {
  const dashboard = document.getElementById('view-dashboard');
  const add = document.getElementById('view-add');

  if (viewName === 'add') {
    dashboard.classList.add('hidden');
    add.classList.remove('hidden');
    // Ensure containers are rendered when switching to add view
    renderContainers();
  } else {
    add.classList.add('hidden');
    dashboard.classList.remove('hidden');
    renderShortcuts();
  }
}

function renderShortcuts() {
  const grid = document.getElementById('shortcuts-grid');
  const emptyState = document.getElementById('dashboard-empty');

  if (shortcuts.length === 0) {
    if (grid) grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  if (grid) {
    grid.innerHTML = shortcuts.map(s => {
      // Determine if image or icon
      let iconHtml = '';
      if (s.icon && (s.icon.startsWith('http') || s.icon.includes('/'))) {
        const src = s.icon.startsWith('http') ? s.icon : `${API_BASE}/${s.icon}`;
        iconHtml = `<img src="${escapeHtml(src)}" alt="${escapeHtml(s.name)}" class="w-12 h-12 object-cover rounded-lg">`;
      } else {
        const cls = ICONS[s.icon] || 'fa-cube';
        iconHtml = `<i class="fas ${cls} text-2xl"></i>`;
      }

      const link = `http://${location.hostname}:${s.port}`;

      return `
      <div class="relative group">
        <!-- Main Card Link -->
        <a href="${link}" target="_blank" 
           class="block bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all h-full">
          
          <div class="flex items-center gap-4 mb-4">
             <div class="w-16 h-16 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-400">
                ${iconHtml}
             </div>
             <div>
               <h3 class="font-bold text-lg text-white mb-1 leading-tight">${escapeHtml(s.name)}</h3>
               <span class="text-xs font-mono text-gray-500 bg-gray-900 px-2 py-1 rounded border border-gray-700">:${s.port}</span>
             </div>
          </div>
          
          <p class="text-gray-400 text-sm line-clamp-2">${escapeHtml(s.description || 'No description')}</p>
        </a>

        <!-- Gear / Edit Button -->
        <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button onclick="event.stopPropagation(); editShortcut(${s.id})" 
                    class="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300 hover:text-white shadow-md transition-colors"
                    title="Edit Shortcut">
              <i class="fas fa-cog text-sm"></i>
            </button>
             <button onclick="event.stopPropagation(); deleteShortcut(${s.id})" 
                    class="w-8 h-8 rounded-full bg-gray-700 hover:bg-red-900/50 flex items-center justify-center text-gray-300 hover:text-red-400 shadow-md transition-colors"
                    title="Delete Shortcut">
              <i class="fas fa-trash text-sm"></i>
            </button>
        </div>
      </div>
    `;
    }).join('');
  }
}

function renderContainers() {
  const grid = document.getElementById('containers-grid');
  if (!grid) return;

  grid.innerHTML = containers.map(c => {
    const isRunning = c.state === 'running';
    const ports = c.ports.map(p => p.public).filter(Boolean);
    const mainPort = ports[0]; // Use first port for default

    return `
      <div onclick="quickAdd('${escapeHtml(c.name)}', ${mainPort}, '${escapeHtml(c.id)}')" 
           class="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-green-500/50 hover:bg-gray-800/80 cursor-pointer transition-all group relative overflow-hidden">
        
        <!-- Hover Effect Badge -->
        <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
           <span class="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">Import</span>
        </div>

        <div class="flex items-center gap-3 mb-3">
          <span class="w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-gray-500'}"></span>
          <h3 class="font-bold text-gray-200 truncate pr-6">${escapeHtml(c.name)}</h3>
        </div>
        
        <p class="text-gray-500 text-xs font-mono mb-4 truncate" title="${escapeHtml(c.image)}">${escapeHtml(c.image)}</p>
        
        <div class="flex flex-wrap gap-1">
          ${ports.map(p => `
            <span class="text-xs bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700">:${p}</span>
          `).join('') || '<span class="text-gray-600 text-xs italic">No exposed ports</span>'}
        </div>
      </div>
    `;
  }).join('');
}

// Global modal helpers
function switchTab(tab) {
  ['icon', 'url', 'upload'].forEach(t => {
    document.getElementById(`tab-${t}`).className = t === tab
      ? 'flex-1 py-1.5 rounded text-sm font-medium transition-colors bg-gray-700 text-white shadow-sm'
      : 'flex-1 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors';

    const content = document.getElementById(`content-${t}`);
    if (content) {
      content.className = t === tab
        ? (t === 'icon' ? 'grid grid-cols-5 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-900 rounded-lg border border-gray-700 custom-scrollbar' : '')
        : 'hidden';

      if (t !== 'icon' && t === tab && content.className === '') {
        content.className = 'block'; // Ensure block for non-grid items
      }
    }
  });
  document.getElementById('current-tab').value = tab;
}

function selectIcon(name) {
  document.getElementById('selected-icon-value').value = name;
  document.querySelectorAll('.icon-choice').forEach(btn => {
    if (btn.dataset.icon === name) {
      btn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
      btn.querySelector('i').classList.remove('text-gray-400');
      btn.querySelector('i').classList.add('text-white');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
      btn.querySelector('i').classList.add('text-gray-400');
      btn.querySelector('i').classList.remove('text-white');
    }
  });
}

function previewUpload(input) {
  const preview = document.getElementById('upload-preview');
  const filename = document.getElementById('upload-filename');
  if (input.files && input.files[0]) {
    preview.classList.remove('hidden');
    filename.textContent = input.files[0].name;
  } else {
    preview.classList.add('hidden');
  }
}

function openModal(data = null) {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('active'); // legacy support if needed
  modal.classList.add('flex'); // ensure flex display

  document.getElementById('modal-title').textContent = data ? 'Edit Shortcut' : 'Add Shortcut';
  document.getElementById('shortcut-id').value = data?.id || '';
  document.getElementById('shortcut-name').value = data?.name || '';
  document.getElementById('shortcut-desc').value = data?.description || '';
  document.getElementById('shortcut-port').value = data?.port || '';

  // Handle Icon/Image state
  const iconVal = data?.icon || 'cube';
  const originalIconInput = document.getElementById('original-icon');
  if (originalIconInput) originalIconInput.value = iconVal;

  if (iconVal.startsWith('http')) {
    switchTab('url');
    document.getElementById('shortcut-image-url').value = iconVal;
  } else if (iconVal.includes('/')) {
    switchTab('upload');
    // Can't set file input value, but we can show name if we want, or just leave empty
    document.getElementById('upload-filename').textContent = "Current: " + iconVal.split('/').pop();
    document.getElementById('upload-preview').classList.remove('hidden');
  } else {
    switchTab('icon');
    selectIcon(iconVal);
  }

  // Container Selection Logic
  const containerSelectWrapper = document.getElementById('container-select-wrapper');
  const containerSelect = document.getElementById('container-select');

  // If editing, hide selector. If adding (data is null), show selector.
  if (data) {
    if (containerSelectWrapper) containerSelectWrapper.classList.add('hidden');
  } else {
    if (containerSelectWrapper) containerSelectWrapper.classList.remove('hidden');
    // We already populate helper list.
    // However, if opened via quickAdd (container click), we might want to pre-select?
    // See quickAdd implementation below.
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('active');
  modal.classList.remove('flex');
  // Reset form
  document.getElementById('shortcut-form').reset();
  selectIcon('cube');
  document.getElementById('upload-preview').classList.add('hidden');

  // Reset container select
  const containerSelect = document.getElementById('container-select');
  if (containerSelect) containerSelect.value = '';
}

// Updated quickAdd to support container ID for pre-selection
function quickAdd(name, port, containerId) {
  openModal({
    id: null, // New shortcut
    name,
    port,
    icon: 'cube',
    container_id: containerId
  });

  // Also pre-select in the dropdown if it exists
  const containerSelect = document.getElementById('container-select');
  if (containerSelect && containerId) {
    containerSelect.value = containerId;
  }
}

function editShortcut(id) {
  const s = shortcuts.find(x => x.id === id);
  if (s) openModal(s);
}

async function deleteShortcut(id) {
  if (!confirm('Delete this shortcut?')) return;
  await fetch(`${API_BASE}/api/shortcuts/${id}`, { method: 'DELETE' });
  loadShortcuts();
}

async function saveShortcut(e) {
  e.preventDefault();
  const id = document.getElementById('shortcut-id').value;
  const tab = document.getElementById('current-tab').value;

  const formData = new FormData();
  formData.append('name', document.getElementById('shortcut-name').value);
  formData.append('description', document.getElementById('shortcut-desc').value);
  formData.append('port', document.getElementById('shortcut-port').value);

  if (tab === 'icon') {
    formData.append('icon', document.getElementById('selected-icon-value').value);
  } else if (tab === 'url') {
    formData.append('icon', document.getElementById('shortcut-image-url').value);
  } else if (tab === 'upload') {
    const fileInput = document.getElementById('shortcut-image-file');
    if (fileInput.files[0]) {
      formData.append('image', fileInput.files[0]);
    } else {
      formData.append('icon', document.getElementById('original-icon').value);
    }
  }

  // Append container ID if selected from dropdown
  const containerSelect = document.getElementById('container-select');
  if (containerSelect && containerSelect.value) {
    formData.append('container_id', containerSelect.value);
  }

  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API_BASE}/api/shortcuts/${id}` : `${API_BASE}/api/shortcuts`;

  try {
    const res = await fetch(url, { method, body: formData });
    if (!res.ok) throw new Error('Failed to save');
    closeModal();
    // Reload and go to dashboard view
    await loadShortcuts();
    switchView('dashboard');
  } catch (err) {
    console.error(err);
    // alert('Error saving shortcut');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

