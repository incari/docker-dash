import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Plus,
  Settings,
  Trash2,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  Star,
  Check,
  ArrowLeft,
  Server,
  AlertTriangle,
  Bookmark,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
  CheckCircle,
  X,
  Edit2,
  Box,
  Database,
  Cloud,
  Code,
  Film,
  Download,
  Home,
  Shield,
  LineChart,
  Globe,
  Terminal,
  Bug,
  Gamepad,
  Music,
  File,
  Folder
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

const ICONS = {
  cube: 'Box',
  server: 'Server',
  database: 'Database',
  cloud: 'Cloud',
  code: 'Code',
  film: 'Film',
  download: 'Download',
  home: 'Home',
  shield: 'Shield',
  chart: 'LineChart',
  globe: 'Globe',
  terminal: 'Terminal',
  bug: 'Bug',
  gamepad: 'Gamepad',
  music: 'Music',
  image: 'ImageIcon',
  file: 'File',
  folder: 'Folder'
};

function App() {
  const [view, setView] = useState('dashboard');
  const [shortcuts, setShortcuts] = useState([]);
  const [containers, setContainers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });
  const [tailscaleInfo, setTailscaleInfo] = useState({ available: false, ip: null });

  useEffect(() => {
    fetchData();
    fetchTailscaleInfo();
  }, []);

  const fetchTailscaleInfo = async () => {
    try {
      const res = await axios.get(`${API_BASE}/tailscale`);
      setTailscaleInfo(res.data);
    } catch (err) {
      console.error('Failed to fetch Tailscale info', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shortcutsRes, containersRes] = await Promise.all([
        axios.get(`${API_BASE}/shortcuts`),
        axios.get(`${API_BASE}/containers`)
      ]);
      setShortcuts(shortcutsRes.data);
      setContainers(containersRes.data);

      if (shortcutsRes.data.length === 0 && view === 'dashboard') {
        setView('add');
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (id) => {
    try {
      await axios.post(`${API_BASE}/containers/${id}/start`);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleStop = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Stop Container',
      message: 'Are you sure you want to stop this container? This will terminate all active processes.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`${API_BASE}/containers/${id}/stop`);
          fetchData();
        } catch (err) { console.error(err); }
      }
    });
  };

  const handleRestart = async (id) => {
    try {
      await axios.post(`${API_BASE}/containers/${id}/restart`);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Shortcut',
      message: 'Are you sure you want to delete this shortcut? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`${API_BASE}/shortcuts/${id}`);
          fetchData();
        } catch (err) { console.error(err); }
      }
    });
  };

  const handleQuickAdd = async (container) => {
    const ports = container.ports.map(p => p.public).filter(Boolean);
    const port = ports[0] || 0;

    const formData = new FormData();
    formData.append('name', container.name);
    formData.append('port', port);
    formData.append('container_id', container.id);
    formData.append('icon', 'cube');
    formData.append('description', 'Quick added container');

    try {
      await axios.post(`${API_BASE}/shortcuts`, formData);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Failed to add shortcut');
    }
  };

  const handleToggleFavorite = async (id, currentStatus) => {
    try {
      await axios.post(`${API_BASE}/shortcuts/${id}/favorite`, { is_favorite: !currentStatus });
      fetchData();
    } catch (err) { console.error(err); }
  };

  const openEditModal = (shortcut) => {
    setEditingShortcut(shortcut);
    setIsModalOpen(true);
  };

  const dashboardShortcuts = shortcuts.filter(s => s.is_favorite === 1);
  const customShortcuts = shortcuts.filter(s => !s.container_id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Server className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Docker<span className="text-blue-500">Dash</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('dashboard')}
              className={`text-sm font-medium transition-colors ${view === 'dashboard' ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView('add')}
              className={`text-sm font-medium transition-colors ${view === 'add' ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
            >
              Management
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Bookmark className="text-blue-500 w-6 h-6" /> My Shortcuts
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Quick access to your running services.</p>
                </div>
                <button
                  onClick={() => { setEditingShortcut(null); setIsModalOpen(true); }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 font-medium"
                >
                  <Plus className="w-4 h-4" /> Add New
                </button>
              </div>

              {dashboardShortcuts.length === 0 && !loading ? (
                <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
                  <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bookmark className="w-8 h-8 text-slate-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">No favorites found</h3>
                  <p className="text-slate-400 mt-2 mb-6">Star your containers or URLs in the management page to see them here.</p>
                  <button
                    onClick={() => setView('add')}
                    className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4"
                  >
                    Manage your shortcuts
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {dashboardShortcuts.map(s => (
                    <ShortcutCard
                      key={s.id}
                      shortcut={s}
                      container={s.container_id ? containers.find(c => c.id === s.container_id) : null}
                      tailscaleIP={tailscaleInfo.ip}
                      onEdit={() => openEditModal(s)}
                      onDelete={() => handleDelete(s.id)}
                      onStart={() => handleStart(s.container_id)}
                      onStop={() => handleStop(s.container_id)}
                      onRestart={() => handleRestart(s.container_id)}
                      onToggleFavorite={() => handleToggleFavorite(s.id, s.is_favorite)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="add"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              {/* Manual URL Section */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setView('dashboard')} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <LinkIcon className="text-blue-500 w-6 h-6" /> Custom Shortcuts
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">Manual entries not linked to local containers.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingShortcut(null); setIsModalOpen(true); }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 font-medium"
                  >
                    <Plus className="w-4 h-4" /> Add Manual Link
                  </button>
                </div>

                {customShortcuts.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-3xl opacity-50">
                    <p className="text-slate-500 text-sm">No manual shortcuts added yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {customShortcuts.map(s => (
                      <ShortcutCard
                        key={s.id}
                        shortcut={s}
                        container={null}
                        tailscaleIP={tailscaleInfo.ip}
                        onEdit={() => openEditModal(s)}
                        onDelete={() => handleDelete(s.id)}
                        onToggleFavorite={() => handleToggleFavorite(s.id, s.is_favorite)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Containers Section */}
              <section className="space-y-6 pt-6 border-t border-white/5">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Server className="text-green-500 w-6 h-6" /> Docker Containers
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Running instances detected on this host.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {containers.map(c => {
                    const existing = shortcuts.find(s => s.container_id === c.id);
                    return (
                      <ContainerCard
                        key={c.id}
                        container={c}
                        isAdded={!!existing}
                        isFavorite={existing?.is_favorite === 1}
                        onQuickAdd={() => handleQuickAdd(c)}
                        onToggleFavorite={() => existing && handleToggleFavorite(existing.id, existing.is_favorite)}
                        onCustomize={() => {
                          const ports = c.ports.map(p => p.public).filter(Boolean);
                          openEditModal(existing || {
                            name: c.name,
                            port: ports[0] || '',
                            container_id: c.id,
                            icon: 'cube',
                            description: ''
                          });
                        }}
                        onStart={() => handleStart(c.id)}
                        onStop={() => handleStop(c.id)}
                      />
                    );
                  })}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modal Overlay */}
      <ShortcutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={fetchData}
        shortcut={editingShortcut}
        containers={containers}
        tailscaleInfo={tailscaleInfo}
      />

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function ConfirmModal({ isOpen, title, message, onConfirm, onClose, type = 'danger' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/90 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center ${type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-slate-400 leading-relaxed">{message}</p>
        </div>

        <div className="p-6 bg-slate-800/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 ${type === 'danger' ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'}`}
          >
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const ICON_COMPONENTS = {
  Box,
  Server,
  Database,
  Cloud,
  Code,
  Film,
  Download,
  Home,
  Shield,
  LineChart,
  Globe,
  Terminal,
  Bug,
  Gamepad,
  Music,
  ImageIcon,
  File,
  Folder
};

const DynamicIcon = ({ name, className }) => {
  const IconComponent = ICON_COMPONENTS[name] || Box;
  return <IconComponent className={className} />;
};

function ShortcutCard({ shortcut, container, tailscaleIP, onEdit, onDelete, onStart, onStop, onRestart, onToggleFavorite }) {
  const isRunning = container?.state === 'running';

  // Determine the link based on use_tailscale setting
  let link;
  if (shortcut.url) {
    link = shortcut.url;
  } else if (shortcut.use_tailscale && tailscaleIP) {
    link = `http://${tailscaleIP}:${shortcut.port}`;
  } else {
    link = `http://${window.location.hostname}:${shortcut.port}`;
  }

  const subtitle = shortcut.url ? 'Custom URL' : (shortcut.use_tailscale && tailscaleIP ? `Tailscale :${shortcut.port}` : `Port :${shortcut.port}`);

  const renderIcon = () => {
    if (shortcut.icon && (shortcut.icon.startsWith('http') || shortcut.icon.includes('/'))) {
      const src = shortcut.icon.startsWith('http') ? shortcut.icon : `/${shortcut.icon}`;
      return <img src={src} alt={shortcut.name} className="w-10 h-10 object-cover rounded-lg group-hover:scale-110 transition-transform duration-500" />;
    }
    return <DynamicIcon name={shortcut.icon} className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform duration-500" />;
  };

  return (
    <div className="group relative bg-slate-900/60 border border-white/5 hover:border-blue-500/30 rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/5 shrink-0 overflow-hidden">
            {renderIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-white font-bold text-lg truncate leading-tight group-hover:text-blue-400 transition-colors uppercase">{shortcut.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-white/5 tracking-wider uppercase">
                {subtitle}
              </span>
              {container && (
                <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-slate-400 text-sm leading-relaxed line-clamp-2 mb-6 flex-1">
        {shortcut.description || 'Quickly access and manage this container instance.'}
      </p>

      <div className="flex items-center justify-between gap-3 mt-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(link, '_blank')}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Launch
          </button>

          {container && (
            <div className="flex gap-1">
              {isRunning ? (
                <>
                  <button onClick={onStop} className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/10">
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                  <button onClick={onRestart} className="p-2 rounded-xl bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all border border-yellow-500/10 shadow-lg shadow-yellow-500/10">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button onClick={onStart} className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all border border-green-500/10">
                  <Play className="w-3.5 h-3.5" fill="currentColor" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-2 transition-colors ${shortcut.is_favorite ? 'text-accent hover:text-accent/80' : 'text-slate-500 hover:text-white'}`}
            title={shortcut.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Star className={`w-4 h-4 ${shortcut.is_favorite ? 'fill-current' : ''}`} />
          </button>
          <button onClick={onEdit} className="p-2 text-slate-500 hover:text-white transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ContainerCard({ container, isAdded, isFavorite, onQuickAdd, onToggleFavorite, onCustomize, onStart, onStop }) {
  const isRunning = container.state === 'running';
  const ports = container.ports.map(p => p.public).filter(Boolean);

  return (
    <div className="group relative bg-slate-900/60 border border-white/5 hover:border-green-500/30 rounded-3xl p-6 transition-all duration-300 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-3 h-3 rounded-full shrink-0 ${isRunning ? 'bg-green-500 shadow-[0_0_12px_rgba(22,163,74,0.4)]' : 'bg-slate-600'}`} />
          <div className="min-w-0">
            <h3 className="text-white font-bold truncate">{container.name}</h3>
            <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5 opacity-60">{container.image}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {ports.map((p, i) => (
          <span key={i} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-white/5">
            :{p}
          </span>
        ))}
        {ports.length === 0 && <span className="text-[10px] text-slate-600 italic">No ports</span>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={onStop}
              className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/10 active:scale-95"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onStart}
              className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all border border-green-500/10 active:scale-95"
              title="Start"
            >
              <Play className="w-3.5 h-3.5" fill="currentColor" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isAdded ? (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickAdd(); }}
              className="p-2 text-slate-500 hover:text-accent transition-colors"
              title="Add to Favorites"
            >
              <Star className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
              className={`p-2 transition-colors ${isFavorite ? 'text-accent hover:text-accent/80' : 'text-slate-500 hover:text-white'}`}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            onClick={onCustomize}
            className="p-2 text-slate-500 hover:text-white transition-colors"
            title="Customize"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutModal({ isOpen, onClose, onSave, shortcut, containers, tailscaleInfo }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    port: '',
    url: '',
    icon: 'cube',
    container_id: '',
    type: 'port', // or 'url'
    use_tailscale: false
  });
  const [activeTab, setActiveTab] = useState('icon'); // 'icon', 'url', 'upload'
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (shortcut) {
      setFormData({
        name: shortcut.name || '',
        description: shortcut.description || '',
        port: shortcut.port || '',
        url: shortcut.url || '',
        icon: shortcut.icon || 'cube',
        container_id: shortcut.container_id || '',
        type: shortcut.url ? 'url' : 'port',
        use_tailscale: shortcut.use_tailscale === 1 || shortcut.use_tailscale === true
      });
      if (shortcut.icon?.startsWith('http')) setActiveTab('url');
      else if (shortcut.icon?.includes('/')) setActiveTab('upload');
      else setActiveTab('icon');
    } else {
      setFormData({
        name: '', description: '', port: '', url: '', icon: 'cube', container_id: '', type: 'port', use_tailscale: false
      });
      setActiveTab('icon');
    }
  }, [shortcut, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('name', formData.name);
    data.append('description', formData.description);

    if (formData.type === 'port') {
      data.append('port', formData.port);
      data.append('use_tailscale', formData.use_tailscale);
    } else {
      data.append('url', formData.url);
    }

    if (activeTab === 'icon') data.append('icon', formData.icon);
    else if (activeTab === 'url') data.append('icon', formData.url); // Use image URL
    else if (activeTab === 'upload' && selectedFile) data.append('image', selectedFile);
    else if (shortcut) data.append('icon', shortcut.icon);

    if (formData.container_id) data.append('container_id', formData.container_id);

    try {
      if (shortcut?.id) {
        await axios.put(`${API_BASE}/shortcuts/${shortcut.id}`, data);
      } else {
        await axios.post(`${API_BASE}/shortcuts`, data);
      }
      onSave();
      onClose();
    } catch (err) { alert('Error saving shortcut'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-slate-900 border border-white/10 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-800/20">
          <h2 className="text-xl font-bold text-white">{shortcut?.id ? 'Edit Shortcut' : 'Create New Shortcut'}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Container Selection */}
          {!shortcut?.id && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Link to Container (Optional)</label>
              <select
                value={formData.container_id}
                onChange={(e) => {
                  const c = containers.find(x => x.id === e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    container_id: e.target.value,
                    name: c ? c.name : prev.name,
                    port: c ? (c.ports[0]?.public || '') : prev.port
                  }));
                }}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white appearance-none"
              >
                <option value="">Manual Entry</option>
                {containers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Display Name</label>
              <input
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Plex Media"
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white placeholder-slate-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Connection Mode</label>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'port' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${formData.type === 'port' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500'}`}
                >
                  LOCAL PORT
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'url' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${formData.type === 'url' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500'}`}
                >
                  WEB URL
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              {formData.type === 'port' ? 'Port Number' : 'Target URL'}
            </label>
            <input
              required
              value={formData.type === 'port' ? formData.port : formData.url}
              onChange={e => setFormData({ ...formData, [formData.type]: e.target.value })}
              placeholder={formData.type === 'port' ? '8080' : 'https://myapp.com'}
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white"
            />
          </div>

          {/* Tailscale Toggle - Only show for port mode */}
          {formData.type === 'port' && tailscaleInfo.available && (
            <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-slate-300">Use Tailscale IP</label>
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                      {tailscaleInfo.ip}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Access this service via your Tailscale network instead of local IP
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, use_tailscale: !formData.use_tailscale })}
                  className={`relative w-14 h-7 rounded-full transition-colors ${formData.use_tailscale ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${formData.use_tailscale ? 'translate-x-7' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">Description</label>
            <textarea
              rows="2"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this service do?"
              className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white resize-none"
            />
          </div>

          {/* Icon Selector */}
          <div className="space-y-4 pt-2">
            <label className="text-sm font-semibold text-slate-300">Identity & Branding</label>
            <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-white/10">
              {['icon', 'url', 'upload'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === t ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t === 'icon' && <Bookmark className="w-3 h-3" />}
                  {t === 'url' && <LinkIcon className="w-3 h-3" />}
                  {t === 'upload' && <Upload className="w-3 h-3" />}
                  {t}
                </button>
              ))}
            </div>

            <div className="bg-slate-950/50 rounded-2xl p-6 border border-white/5 min-h-32 flex items-center justify-center">
              {activeTab === 'icon' && (
                <div className="grid grid-cols-6 gap-3">
                  {Object.keys(ICONS).map(iconKey => (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: iconKey })}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${formData.icon === iconKey ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                    >
                      <DynamicIcon name={iconKey} className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'url' && (
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3 bg-slate-800 border border-white/10 rounded-xl px-4 py-3">
                    <LinkIcon className="w-5 h-5 text-slate-500" />
                    <input
                      className="bg-transparent flex-1 focus:outline-none text-white text-sm"
                      placeholder="Paste image link here..."
                      value={formData.icon?.startsWith('http') ? formData.icon : ''}
                      onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 pl-1 italic">Prefer direct links to PNG/SVG assets.</p>
                </div>
              )}

              {activeTab === 'upload' && (
                <label className="w-full h-24 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.02] transition-colors group">
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => setSelectedFile(e.target.files[0])}
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center text-green-400">
                      <CheckCircle className="w-6 h-6 mb-1" />
                      <span className="text-xs font-medium truncate max-w-[200px]">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="w-6 h-6 text-slate-500 group-hover:text-blue-500 mb-1 transition-colors" />
                      <span className="text-xs text-slate-500 group-hover:text-slate-300">Choose local asset</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>

          <div className="pt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
            >
              {shortcut?.id ? 'Update Shortcut' : 'Create Shortcut'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default App;
