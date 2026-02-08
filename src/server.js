const express = require('express');
const cors = require('cors');
const Docker = require('dockerode');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { getContainerIcon, getDockerIconVaultData } = require('./utils/dockerIconVault');

const execAsync = promisify(exec);

// Validation helpers
const normalizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';

  url = url.trim();

  // If it already has a protocol, return as is
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  // Add https:// by default
  return `https://${url}`;
};

const isValidUrl = (url) => {
  if (!url) return false;

  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

// Clean description: trim and remove double spaces
const cleanDescription = (desc) => {
  if (!desc || typeof desc !== 'string') return '';
  return desc.trim().replace(/\s+/g, ' ');
};

const isValidPort = (port) => {
  if (!port) return false;
  const portNum = parseInt(port, 10);
  return !isNaN(portNum) && portNum > 0 && portNum <= 65535;
};

const app = express();
const PORT = process.env.PORT || 3000;

// Docker connection - uses socket by default
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/dashboard.db');
const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS shortcuts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'cube',
    port INTEGER,
    url TEXT,
    container_id TEXT,
    is_favorite INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    is_collapsed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme_primary TEXT DEFAULT '#3b82f6',
    theme_background TEXT DEFAULT '#0f172a',
    view_mode TEXT DEFAULT 'default',
    mobile_columns INTEGER DEFAULT 2,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Robust Migration Check
const tableInfo = db.pragma('table_info(shortcuts)');

// 1. Check for 'url' column
if (!tableInfo.find(c => c.name === 'url')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN url TEXT');
    console.log("Migrated: Added url column");
  } catch (err) { console.error(err); }
}

// 2. Check for 'container_id' column
if (!tableInfo.find(c => c.name === 'container_id')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN container_id TEXT');
    console.log("Migrated: Added container_id column");
  } catch (err) { console.error(err); }
}

// 3. Check for 'is_favorite' column
if (!tableInfo.find(c => c.name === 'is_favorite')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN is_favorite INTEGER DEFAULT 0');
    console.log("Migrated: Added is_favorite column");
  } catch (err) { console.error(err); }
}

// 4. Check for 'use_tailscale' column
if (!tableInfo.find(c => c.name === 'use_tailscale')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN use_tailscale INTEGER DEFAULT 0');
  } catch (err) { console.error(err); }
}

// 5. Check for 'position' column
if (!tableInfo.find(c => c.name === 'position')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN position INTEGER DEFAULT 0');
    // Set initial positions based on current order (by name)
    const shortcuts = db.prepare('SELECT id FROM shortcuts ORDER BY name').all();
    const updateStmt = db.prepare('UPDATE shortcuts SET position = ? WHERE id = ?');
    shortcuts.forEach((shortcut, index) => {
      updateStmt.run(index, shortcut.id);
    });
  } catch (err) { console.error(err); }
}

// 6. Check for 'section_id' column
if (!tableInfo.find(c => c.name === 'section_id')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN section_id INTEGER');
  } catch (err) { console.error(err); }
}

// 3. Check for 'port' NOT NULL constraint (SQLite doesn't support ALTER COLUMN)
const portCol = tableInfo.find(c => c.name === 'port');
if (portCol && portCol.notnull === 1) {
  console.log("Migrating: Making 'port' column nullable (recreating table)...");
  try {
    db.transaction(() => {
      db.exec('ALTER TABLE shortcuts RENAME TO shortcuts_old');
      db.exec(`
        CREATE TABLE shortcuts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT DEFAULT 'cube',
          port INTEGER,
          url TEXT,
          container_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Get common columns
      const oldCols = db.pragma('table_info(shortcuts_old)').map(c => c.name);
      const newCols = ['id', 'name', 'description', 'icon', 'port', 'url', 'container_id', 'created_at', 'updated_at'];
      const intersect = newCols.filter(c => oldCols.includes(c));
      const colsStr = intersect.join(', ');

      db.exec(`INSERT INTO shortcuts (${colsStr}) SELECT ${colsStr} FROM shortcuts_old`);
      db.exec('DROP TABLE shortcuts_old');
    })();
    console.log("Migration complete: 'port' is now nullable.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

// Multer setup for uploads
// Store images in the persistent data directory (mapped volume)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../data/images');

if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter to only accept image files
const imageFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (PNG, JPG, GIF, WebP, SVG, ICO)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 5MB limit
  }
});

app.use(cors());
app.use(express.json());
// Serve static files from the React app
const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Serve the uploads directory at /uploads
app.use('/uploads', express.static(uploadDir));

// Get list of uploaded images
app.get('/api/uploads', (req, res) => {
  try {
    if (!fs.existsSync(uploadDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(uploadDir);
    const imageFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext);
      })
      .map(file => ({
        filename: file,
        url: `uploads/${file}`,
        uploadedAt: fs.statSync(path.join(uploadDir, file)).mtime
      }))
      .sort((a, b) => b.uploadedAt - a.uploadedAt); // Most recent first

    res.json(imageFiles);
  } catch (error) {
    console.error('Error listing uploaded images:', error);
    res.status(500).json({ error: 'Failed to list uploaded images' });
  }
});

// Delete an uploaded image
app.delete('/api/uploads/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const { force } = req.query; // Allow force deletion

    // Security: prevent path traversal attacks
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(uploadDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if any shortcuts are using this image
    const shortcutsUsingImage = db.prepare(
      'SELECT id, name FROM shortcuts WHERE icon = ?'
    ).all(`uploads/${filename}`);

    if (shortcutsUsingImage.length > 0 && force !== 'true') {
      // Return info about shortcuts using this image
      return res.status(409).json({
        error: 'Image is in use',
        shortcuts: shortcutsUsingImage
      });
    }

    // If force=true, update all shortcuts using this image to use default icon
    if (force === 'true' && shortcutsUsingImage.length > 0) {
      const updateStmt = db.prepare('UPDATE shortcuts SET icon = ? WHERE icon = ?');
      updateStmt.run('Server', `uploads/${filename}`);
    }

    // Delete the file
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting uploaded image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Health check for Docker
app.get('/health', (req, res) => res.status(200).send('OK'));

// Helper function to detect Tailscale IP
async function getTailscaleIP() {
  try {
    // Method 1: Try to get Tailscale IP using 'tailscale ip' command
    const { stdout } = await execAsync('tailscale ip -4 2>/dev/null');
    const ip = stdout.trim();
    if (ip && /^100\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip;
    }
  } catch (err) {
    // Tailscale command not found or not running
  }

  try {
    // Method 2: Check network interfaces for Tailscale IP (100.x.x.x range)
    const { stdout } = await execAsync('ip addr show 2>/dev/null || ifconfig 2>/dev/null');
    const match = stdout.match(/inet (100\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (err) {
    // Network command failed
  }

  try {
    // Method 3: For Docker containers on Unraid - check host network
    // Try to detect if we're in a Docker container with host network mode
    const { stdout } = await execAsync('hostname -I 2>/dev/null');
    const ips = stdout.trim().split(/\s+/);
    const tailscaleIP = ips.find(ip => /^100\.\d+\.\d+\.\d+$/.test(ip));
    if (tailscaleIP) {
      return tailscaleIP;
    }
  } catch (err) {
    // hostname command failed
  }

  try {
    // Method 4: Check /proc/net/fib_trie for Tailscale IPs (works in containers)
    const { stdout } = await execAsync('cat /proc/net/fib_trie 2>/dev/null');
    const matches = stdout.match(/100\.\d+\.\d+\.\d+/g);
    if (matches && matches.length > 0) {
      // Filter out broadcast addresses (ending in .255)
      const validIP = matches.find(ip => !ip.endsWith('.255') && !ip.endsWith('.0'));
      if (validIP) {
        return validIP;
      }
    }
  } catch (err) {
    // /proc/net/fib_trie not available
  }

  return null;
}

// API endpoint to get Tailscale status
app.get('/api/tailscale', async (req, res) => {
  try {
    const tailscaleIP = await getTailscaleIP();
    res.json({
      available: !!tailscaleIP,
      ip: tailscaleIP
    });
  } catch (error) {
    console.error('Error checking Tailscale:', error);
    res.json({ available: false, ip: null });
  }
});

// API Routes
// Get all Docker containers with their ports
app.get('/api/containers', async (req, res) => {
  try {
    const containers = (await docker.listContainers({ all: true })) || [];
    const formatted = containers.map(c => {
      if (!c) return null;

      // Extract description from Docker labels (common label keys)
      const labels = c.Labels || {};
      const description = labels['org.opencontainers.image.description'] ||
        labels['description'] ||
        labels['com.docker.compose.project'] ||
        labels['maintainer'] ||
        '';

      // Deduplicate ports - same public port can appear multiple times (IPv4/IPv6, TCP/UDP)
      const allPorts = (c.Ports || [])
        .filter(p => p && p.PublicPort)
        .map(p => ({
          private: p.PrivatePort,
          public: p.PublicPort,
          type: p.Type
        }));

      // Keep only unique public ports (dedupe by public port number)
      const uniquePorts = [];
      const seenPublicPorts = new Set();
      for (const port of allPorts) {
        if (!seenPublicPorts.has(port.public)) {
          seenPublicPorts.add(port.public);
          uniquePorts.push(port);
        }
      }

      return {
        id: c.Id,
        name: (c.Names && c.Names[0]) ? c.Names[0].replace('/', '') : 'unknown',
        image: c.Image,
        state: c.State,
        status: c.Status,
        description: description,
        ports: uniquePorts
      };
    }).filter(Boolean);
    res.json(formatted);
  } catch (error) {
    // Check if Docker is not running
    if (error.code === 'ECONNREFUSED' || error.errno === -61) {
      console.warn('Docker is not running. Returning empty container list.');
      return res.json([]); // Return empty array instead of error
    }
    console.error('Error fetching containers:', error);
    res.status(500).json({ error: 'Failed to fetch containers' });
  }
});


// Start a container
app.post('/api/containers/:id/start', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true });
  } catch (error) {
    console.error('Error starting container:', error);
    res.status(500).json({ error: 'Failed to start container' });
  }
});

// Stop a container
app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true });
  } catch (error) {
    console.error('Error stopping container:', error);
    res.status(500).json({ error: 'Failed to stop container' });
  }
});

// Restart a container
app.post('/api/containers/:id/restart', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ success: true });
  } catch (error) {
    console.error('Error restarting container:', error);
    res.status(500).json({ error: 'Failed to restart container' });
  }
});

// Get all shortcuts
app.get('/api/shortcuts', (req, res) => {
  try {
    const shortcuts = db.prepare(`
      SELECT s.*, sec.name as section_name
      FROM shortcuts s
      LEFT JOIN sections sec ON s.section_id = sec.id
      ORDER BY s.section_id ASC, s.position ASC, s.name ASC
    `).all();
    res.json(shortcuts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shortcuts' });
  }
});

// Auto-sync containers to shortcuts (create shortcuts for containers that don't have them)
app.post('/api/shortcuts/auto-sync', async (req, res) => {
  try {
    console.log('[AUTO-SYNC] Starting auto-sync of containers to shortcuts...');

    // Get all running containers
    const containers = await docker.listContainers({ all: true });
    console.log('[AUTO-SYNC] Found', containers.length, 'containers');

    // Get existing shortcuts with container_id
    const existingShortcuts = db.prepare('SELECT container_id FROM shortcuts WHERE container_id IS NOT NULL').all();
    const existingContainerIds = new Set(existingShortcuts.map(s => s.container_id));
    console.log('[AUTO-SYNC] Found', existingContainerIds.size, 'existing shortcuts with container_id');

    let createdCount = 0;
    const stmt = db.prepare(
      'INSERT INTO shortcuts (name, description, icon, port, container_id, is_favorite) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const container of containers) {
      if (!existingContainerIds.has(container.Id)) {
        const containerName = container.Names[0].replace(/^\//, '');

        // Get icon and description from docker-icon-vault
        const iconData = await getDockerIconVaultData(containerName);
        const icon = iconData ? iconData.iconUrl : 'Server';
        const description = iconData ? iconData.description : '';
        const port = container.Ports && container.Ports[0] ? container.Ports[0].PublicPort : null;

        console.log('[AUTO-SYNC] Creating shortcut for container:', containerName);
        console.log('[AUTO-SYNC]   Icon:', icon);
        console.log('[AUTO-SYNC]   Description:', description);

        stmt.run(
          containerName,
          description,
          icon,
          port,
          container.Id,
          0 // is_favorite = false by default
        );
        createdCount++;
      }
    }

    console.log('[AUTO-SYNC] Auto-sync completed. Created', createdCount, 'new shortcuts');
    res.json({
      success: true,
      created: createdCount,
      total: containers.length,
      message: `Created ${createdCount} new shortcuts from ${containers.length} containers`
    });
  } catch (error) {
    // Check if Docker is not running
    if (error.code === 'ECONNREFUSED' || error.errno === -61) {
      console.warn('[AUTO-SYNC] Docker is not running. Skipping auto-sync.');
      return res.json({
        success: true,
        created: 0,
        total: 0,
        message: 'Docker is not running. No containers to sync.'
      });
    }
    console.error('[AUTO-SYNC] Auto-sync failed:', error);
    res.status(500).json({ error: 'Failed to auto-sync containers' });
  }
});

// Create a shortcut
app.post('/api/shortcuts', upload.single('image'), async (req, res) => {
  const { name, description, icon, port, url, container_id, is_favorite, use_tailscale } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required and cannot be empty' });
  }

  // At least one of port or url should be provided (but port can be empty for containers without ports)
  if (!port && !url && !container_id) {
    return res.status(400).json({ error: 'Either Port, URL, or Container must be specified' });
  }

  // Validate port if provided
  if (port && !isValidPort(port)) {
    return res.status(400).json({ error: 'Invalid port number. Must be between 1 and 65535' });
  }

  // Validate and normalize URL if provided
  let finalUrl = null;
  if (url) {
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format. Please enter a valid URL like example.com or https://example.com' });
    }
    finalUrl = normalizeUrl(url);
  }

  // Validate and normalize icon URL if it's a URL
  let iconValue = icon || 'Server';

  console.log('[CREATE SHORTCUT] Received icon:', icon);
  console.log('[CREATE SHORTCUT] Container ID:', container_id);

  // If no icon provided and container_id exists, try to get icon from docker-icon-vault
  if (!icon && container_id) {
    try {
      const containers = await docker.listContainers({ all: true });
      const container = containers.find(c => c.Id === container_id);
      if (container) {
        const containerName = container.Names[0].replace(/^\//, '');
        iconValue = await getContainerIcon(containerName, 'Server');
        console.log('[CREATE SHORTCUT] Auto-detected icon from container:', iconValue);
      }
    } catch (error) {
      console.error('Failed to fetch container for icon:', error);
      // Keep default 'Server' icon
    }
  }

  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
    console.log('[CREATE SHORTCUT] Using uploaded file:', iconValue);
  } else if (icon && icon.includes('http')) {
    if (!isValidUrl(icon)) {
      return res.status(400).json({ error: 'Invalid icon URL format. Please enter a valid image URL like https://example.com/image.png' });
    }
    iconValue = normalizeUrl(icon);
    console.log('[CREATE SHORTCUT] Using icon URL:', iconValue);
  }

  console.log('[CREATE SHORTCUT] Final icon value to save:', iconValue);

  // Clean and validate description
  const cleanedDescription = cleanDescription(description);

  const finalPort = port ? parseInt(port) : null;
  const finalFavorite = is_favorite === undefined ? 0 : (is_favorite === 'true' || is_favorite === true || is_favorite === 1 ? 1 : 0);
  const finalUseTailscale = use_tailscale === 'true' || use_tailscale === true || use_tailscale === 1 ? 1 : 0;

  try {
    const stmt = db.prepare(
      'INSERT INTO shortcuts (name, description, icon, port, url, container_id, is_favorite, use_tailscale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name.trim(), cleanedDescription, iconValue, finalPort, finalUrl, container_id || null, finalFavorite, finalUseTailscale);

    console.log('[CREATE SHORTCUT] Successfully saved to DB with ID:', result.lastInsertRowid);
    console.log('[CREATE SHORTCUT] Saved icon value:', iconValue);

    // Verify what was actually saved
    const saved = db.prepare('SELECT id, name, icon FROM shortcuts WHERE id = ?').get(result.lastInsertRowid);
    console.log('[CREATE SHORTCUT] Verification - DB contains:', saved);

    res.json({ id: result.lastInsertRowid, name: name.trim(), description: cleanedDescription, icon: iconValue, port: finalPort, url: finalUrl, container_id, is_favorite: finalFavorite, use_tailscale: finalUseTailscale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create shortcut. Please try again.' });
  }
});

// Update a shortcut
app.put('/api/shortcuts/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, icon, port, url, container_id, is_favorite, use_tailscale } = req.body;

  if (name && !name.trim()) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  // Validate port if provided
  if (port && !isValidPort(port)) {
    return res.status(400).json({ error: 'Invalid port number. Must be between 1 and 65535' });
  }

  // Validate and normalize URL if provided
  let finalUrl = null;
  if (url) {
    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format. Please enter a valid URL like example.com or https://example.com' });
    }
    finalUrl = normalizeUrl(url);
  }

  // Validate and normalize icon URL if it's a URL
  let iconValue = icon;

  // If no icon provided and container_id exists, try to get icon from docker-icon-vault
  if (!icon && container_id) {
    try {
      const containers = await docker.listContainers({ all: true });
      const container = containers.find(c => c.Id === container_id);
      if (container) {
        const containerName = container.Names[0].replace(/^\//, '');
        iconValue = getContainerIcon(containerName, 'Server');
      }
    } catch (error) {
      console.error('Failed to fetch container for icon:', error);
      // Keep existing icon
    }
  }

  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
  } else if (icon && icon.includes('http')) {
    if (!isValidUrl(icon)) {
      return res.status(400).json({ error: 'Invalid icon URL format. Please enter a valid image URL like https://example.com/image.png' });
    }
    iconValue = normalizeUrl(icon);
  }

  // Clean description
  const cleanedDescription = cleanDescription(description);

  const finalPort = port ? parseInt(port) : null;
  const finalFavorite = is_favorite === undefined ? undefined : (is_favorite === 'true' || is_favorite === true || is_favorite === 1 ? 1 : 0);
  const finalUseTailscale = use_tailscale === undefined ? undefined : (use_tailscale === 'true' || use_tailscale === true || use_tailscale === 1 ? 1 : 0);

  try {
    let sql = 'UPDATE shortcuts SET name=?, description=?, icon=?, port=?, url=?, container_id=?, updated_at=CURRENT_TIMESTAMP';
    const params = [name ? name.trim() : name, cleanedDescription, iconValue, finalPort, finalUrl, container_id];

    if (finalFavorite !== undefined) {
      sql += ', is_favorite=?';
      params.push(finalFavorite);
    }

    if (finalUseTailscale !== undefined) {
      sql += ', use_tailscale=?';
      params.push(finalUseTailscale);
    }

    sql += ' WHERE id=?';
    params.push(id);

    const stmt = db.prepare(sql);
    stmt.run(...params);
    res.json({ id, name: name ? name.trim() : name, description: cleanedDescription, icon: iconValue, port: finalPort, url: finalUrl, container_id, is_favorite: finalFavorite, use_tailscale: finalUseTailscale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update shortcut. Please try again.' });
  }
});

// Toggle favorite status
app.post('/api/shortcuts/:id/favorite', (req, res) => {
  const { id } = req.params;
  const { is_favorite } = req.body;
  const status = (is_favorite === true || is_favorite === 1) ? 1 : 0;

  try {
    // Convert id to integer to ensure proper matching
    const numericId = parseInt(id, 10);

    const result = db.prepare('UPDATE shortcuts SET is_favorite = ? WHERE id = ?').run(status, numericId);

    res.json({ success: true, is_favorite: status });
  } catch (err) {
    console.error('[TOGGLE FAVORITE] Error:', err);
    res.status(500).json({ error: 'Failed to update favorite status' });
  }
});

// Reorder shortcuts
app.put('/api/shortcuts/reorder', (req, res) => {
  const { shortcuts } = req.body; // Array of { id, position }

  if (!Array.isArray(shortcuts)) {
    return res.status(400).json({ error: 'Invalid request: shortcuts must be an array' });
  }

  try {
    const updateStmt = db.prepare('UPDATE shortcuts SET position = ? WHERE id = ?');
    const transaction = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.position, item.id);
      }
    });

    transaction(shortcuts);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to reorder shortcuts:', err);
    res.status(500).json({ error: 'Failed to reorder shortcuts' });
  }
});

// Delete a shortcut
app.delete('/api/shortcuts/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM shortcuts WHERE id=?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete shortcut' });
  }
});

// Check if migration is needed
app.get('/api/shortcuts/check-migration', async (req, res) => {
  try {
    // Get all shortcuts that have a container_id but don't use docker-icon-vault URLs
    const shortcuts = db.prepare(`
      SELECT id, name, description, icon FROM shortcuts
      WHERE container_id IS NOT NULL
      AND (icon NOT LIKE 'https://incari.github.io/docker-icon-vault/%' OR icon IS NULL OR icon = 'Server')
    `).all();

    res.json({
      needsMigration: shortcuts.length > 0,
      count: shortcuts.length,
      shortcuts: shortcuts.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon
      }))
    });
  } catch (error) {
    console.error('Error checking migration:', error);
    res.status(500).json({ error: 'Failed to check migration status' });
  }
});

// Migrate shortcuts to use docker-icon-vault icons
app.post('/api/shortcuts/migrate-icons', async (req, res) => {
  try {
    // Get selected shortcut IDs for icons and descriptions separately
    const { iconIds, descriptionIds } = req.body;

    // Get all shortcuts that have a container_id
    let allShortcuts = db.prepare('SELECT * FROM shortcuts WHERE container_id IS NOT NULL').all();

    // Determine which shortcuts to update for icons and descriptions
    const iconIdsArray = Array.isArray(iconIds) ? iconIds : [];
    const descriptionIdsArray = Array.isArray(descriptionIds) ? descriptionIds : [];

    // Get unique IDs that need processing (union of both arrays)
    const allIds = new Set([...iconIdsArray, ...descriptionIdsArray]);

    if (allIds.size === 0) {
      return res.json({
        success: true,
        message: 'No shortcuts selected for migration',
        updated: 0,
        total: 0
      });
    }

    // Filter shortcuts to only those selected
    const shortcuts = allShortcuts.filter(s => allIds.has(s.id));

    // Get all containers from Docker
    let containers = [];
    try {
      containers = await docker.listContainers({ all: true });
    } catch (dockerError) {
      // Check if Docker is not running
      if (dockerError.code === 'ECONNREFUSED' || dockerError.errno === -61) {
        console.warn('Migration: Docker is not running. Cannot migrate icons.');
        return res.json({
          success: false,
          message: 'Docker is not running. Please start Docker Desktop and try again.',
          updated: 0,
          total: shortcuts.length
        });
      }
      throw dockerError; // Re-throw if it's a different error
    }

    let updatedIconsCount = 0;
    let updatedDescriptionsCount = 0;

    // Process each shortcut
    for (const shortcut of shortcuts) {
      // Find the matching container
      const container = containers.find(c => c.Id === shortcut.container_id);

      if (container) {
        // Get container name (remove leading slash)
        const containerName = container.Names[0].replace(/^\//, '');

        // Get the new icon and description from docker-icon-vault
        const iconData = await getDockerIconVaultData(containerName);

        let newIcon = shortcut.icon;
        let newDescription = shortcut.description;
        let iconChanged = false;
        let descriptionChanged = false;

        // Update icon if this shortcut is in the iconIds array and data is available
        if (iconIdsArray.includes(shortcut.id) && iconData && iconData.iconUrl) {
          newIcon = iconData.iconUrl;
          if (newIcon !== shortcut.icon) {
            iconChanged = true;
          }
        }

        // Update description if this shortcut is in the descriptionIds array and data is available
        if (descriptionIdsArray.includes(shortcut.id) && iconData && iconData.description) {
          newDescription = iconData.description;
          if (newDescription !== shortcut.description) {
            descriptionChanged = true;
          }
        }

        // Only update if something changed
        if (iconChanged || descriptionChanged) {
          const updateStmt = db.prepare('UPDATE shortcuts SET icon = ?, description = ? WHERE id = ?');
          updateStmt.run(newIcon, newDescription, shortcut.id);

          if (iconChanged) updatedIconsCount++;
          if (descriptionChanged) updatedDescriptionsCount++;

          console.log(`Updated shortcut "${shortcut.name}" (${containerName}): icon=${iconChanged}, description=${descriptionChanged}`);
        }
      }
    }

    // Build success message based on what was updated
    const messages = [];
    if (updatedIconsCount > 0) {
      messages.push(`${updatedIconsCount} icon(s)`);
    }
    if (updatedDescriptionsCount > 0) {
      messages.push(`${updatedDescriptionsCount} description(s)`);
    }

    const message = messages.length > 0
      ? `Successfully updated ${messages.join(' and ')} from docker-icon-vault`
      : 'No changes were made';

    res.json({
      success: true,
      message,
      updatedIcons: updatedIconsCount,
      updatedDescriptions: updatedDescriptionsCount,
      total: shortcuts.length
    });
  } catch (error) {
    console.error('Error migrating icons:', error);
    res.status(500).json({ error: 'Failed to migrate icons' });
  }
});

// ===== SECTIONS API =====

// Get all sections
app.get('/api/sections', (req, res) => {
  try {
    const sections = db.prepare('SELECT * FROM sections ORDER BY position ASC').all();
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// Create a section
app.post('/api/sections', (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Section name is required' });
  }

  try {
    // Get the highest position
    const maxPos = db.prepare('SELECT MAX(position) as max FROM sections').get();
    const position = (maxPos.max || -1) + 1;

    const result = db.prepare(
      'INSERT INTO sections (name, position) VALUES (?, ?)'
    ).run(name.trim(), position);

    res.json({ id: result.lastInsertRowid, name: name.trim(), position, is_collapsed: 0 });
  } catch (error) {
    console.error('Failed to create section:', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// Reorder sections (must be before :id route to avoid matching "reorder" as an id)
app.put('/api/sections/reorder', (req, res) => {
  const { sections } = req.body;

  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: 'Invalid request: sections must be an array' });
  }

  try {
    const updateStmt = db.prepare('UPDATE sections SET position = ? WHERE id = ?');
    const transaction = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.position, item.id);
      }
    });

    transaction(sections);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to reorder sections:', err);
    res.status(500).json({ error: 'Failed to reorder sections' });
  }
});

// Update a section
app.put('/api/sections/:id', (req, res) => {
  const { id } = req.params;
  const { name, is_collapsed } = req.body;

  try {
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }

    if (is_collapsed !== undefined) {
      updates.push('is_collapsed = ?');
      values.push(is_collapsed ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    db.prepare(`UPDATE sections SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// Delete a section
app.delete('/api/sections/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Remove section_id from shortcuts in this section
    db.prepare('UPDATE shortcuts SET section_id = NULL WHERE section_id = ?').run(id);
    // Delete the section
    db.prepare('DELETE FROM sections WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Update shortcut's section
app.put('/api/shortcuts/:id/section', (req, res) => {
  const { id } = req.params;
  const { section_id, position } = req.body;

  try {
    // Update both section_id and position if position is provided
    if (position !== undefined) {
      db.prepare('UPDATE shortcuts SET section_id = ?, position = ? WHERE id = ?')
        .run(section_id || null, position, id);
    } else {
      db.prepare('UPDATE shortcuts SET section_id = ? WHERE id = ?')
        .run(section_id || null, id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update shortcut section:', error);
    res.status(500).json({ error: 'Failed to update shortcut section' });
  }
});

// ===== SETTINGS API =====

// Get user settings
app.get('/api/settings', (req, res) => {
  try {
    let settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // If no settings exist, create default settings
    if (!settings) {
      db.prepare(`
        INSERT INTO settings (id, theme_primary, theme_background, view_mode, mobile_columns)
        VALUES (1, '#3b82f6', '#0f172a', 'default', 2)
      `).run();
      settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    }

    res.json(settings);
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
app.put('/api/settings', (req, res) => {
  const { theme_primary, theme_background, view_mode, mobile_columns } = req.body;

  try {
    // Ensure settings row exists
    const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();

    if (!existing) {
      db.prepare(`
        INSERT INTO settings (id, theme_primary, theme_background, view_mode, mobile_columns)
        VALUES (1, ?, ?, ?, ?)
      `).run(
        theme_primary || '#3b82f6',
        theme_background || '#0f172a',
        view_mode || 'default',
        mobile_columns || 2
      );
    } else {
      const updates = [];
      const values = [];

      if (theme_primary !== undefined) {
        updates.push('theme_primary = ?');
        values.push(theme_primary);
      }

      if (theme_background !== undefined) {
        updates.push('theme_background = ?');
        values.push(theme_background);
      }

      if (view_mode !== undefined) {
        updates.push('view_mode = ?');
        values.push(view_mode);
      }

      if (mobile_columns !== undefined) {
        updates.push('mobile_columns = ?');
        values.push(mobile_columns);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        db.prepare(`UPDATE settings SET ${updates.join(', ')} WHERE id = 1`).run(...values);
      }
    }

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// For any other request, serve index.html (React proxy)
app.get('*', (req, res, next) => {
  // If it's an API request that didn't match anything above, 404 it
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }

  if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  } else {
    res.status(404).send('Frontend not built. Run npm run build.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Docker Dashboard running on http://0.0.0.0:${PORT}`);
});

