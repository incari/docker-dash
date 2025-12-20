const express = require('express');
const cors = require('cors');
const Docker = require('dockerode');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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
    db.exec('ALTER TABLE shortcuts ADD COLUMN is_favorite INTEGER DEFAULT 1');
    console.log("Migrated: Added is_favorite column");
  } catch (err) { console.error(err); }
}

// 4. Check for 'use_tailscale' column
if (!tableInfo.find(c => c.name === 'use_tailscale')) {
  try {
    db.exec('ALTER TABLE shortcuts ADD COLUMN use_tailscale INTEGER DEFAULT 0');
    console.log("Migrated: Added use_tailscale column");
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

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
// Serve static files from the React app
const frontendPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Serve the uploads directory at /uploads
app.use('/uploads', express.static(uploadDir));

// Health check for Docker
app.get('/health', (req, res) => res.status(200).send('OK'));

// Helper function to detect Tailscale IP
async function getTailscaleIP() {
  try {
    // Try to get Tailscale IP using 'tailscale ip' command
    const { stdout } = await execAsync('tailscale ip -4 2>/dev/null');
    const ip = stdout.trim();
    if (ip && /^100\.\d+\.\d+\.\d+$/.test(ip)) {
      return ip;
    }
  } catch (err) {
    // Tailscale command not found or not running
  }

  try {
    // Fallback: Check network interfaces for Tailscale IP (100.x.x.x range)
    const { stdout } = await execAsync('ip addr show 2>/dev/null || ifconfig 2>/dev/null');
    const match = stdout.match(/inet (100\.\d+\.\d+\.\d+)/);
    if (match) {
      return match[1];
    }
  } catch (err) {
    // Network command failed
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
      return {
        id: c.Id,
        name: (c.Names && c.Names[0]) ? c.Names[0].replace('/', '') : 'unknown',
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports: (c.Ports || []).map(p => ({
          private: p?.PrivatePort,
          public: p?.PublicPort,
          type: p?.Type
        })).filter(p => p && p.public)
      };
    }).filter(Boolean);
    res.json(formatted);
  } catch (error) {
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
    const shortcuts = db.prepare('SELECT * FROM shortcuts ORDER BY name').all();
    res.json(shortcuts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shortcuts' });
  }
});

// Create a shortcut
app.post('/api/shortcuts', upload.single('image'), (req, res) => {
  const { name, description, icon, port, url, container_id, is_favorite, use_tailscale } = req.body;

  if (!name || (!port && !url)) {
    return res.status(400).json({ error: 'Name and either Port or URL are required' });
  }

  // Determine the icon value: uploaded file path, or provided icon/url string, or default
  let iconValue = icon || 'cube';
  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
  }

  const finalPort = port ? parseInt(port) : null;
  const finalUrl = url || null;
  const finalFavorite = is_favorite === undefined ? 1 : (is_favorite === 'true' || is_favorite === true || is_favorite === 1 ? 1 : 0);
  const finalUseTailscale = use_tailscale === 'true' || use_tailscale === true || use_tailscale === 1 ? 1 : 0;

  try {
    const stmt = db.prepare(
      'INSERT INTO shortcuts (name, description, icon, port, url, container_id, is_favorite, use_tailscale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, description || '', iconValue, finalPort, finalUrl, container_id || null, finalFavorite, finalUseTailscale);
    res.json({ id: result.lastInsertRowid, name, description, icon: iconValue, port: finalPort, url: finalUrl, container_id, is_favorite: finalFavorite, use_tailscale: finalUseTailscale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create shortcut' });
  }
});

// Update a shortcut
app.put('/api/shortcuts/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, icon, port, url, container_id, is_favorite, use_tailscale } = req.body;

  let iconValue = icon;
  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
  }

  const finalPort = port ? parseInt(port) : null;
  const finalUrl = url || null;
  const finalFavorite = is_favorite === undefined ? undefined : (is_favorite === 'true' || is_favorite === true || is_favorite === 1 ? 1 : 0);
  const finalUseTailscale = use_tailscale === undefined ? undefined : (use_tailscale === 'true' || use_tailscale === true || use_tailscale === 1 ? 1 : 0);

  try {
    let sql = 'UPDATE shortcuts SET name=?, description=?, icon=?, port=?, url=?, container_id=?, updated_at=CURRENT_TIMESTAMP';
    const params = [name, description, iconValue, finalPort, finalUrl, container_id];

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
    res.json({ id, name, description, icon: iconValue, port: finalPort, url: finalUrl, container_id, is_favorite: finalFavorite, use_tailscale: finalUseTailscale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update shortcut' });
  }
});

// Toggle favorite status
app.post('/api/shortcuts/:id/favorite', (req, res) => {
  const { id } = req.params;
  const { is_favorite } = req.body;
  const status = (is_favorite === true || is_favorite === 1) ? 1 : 0;

  try {
    db.prepare('UPDATE shortcuts SET is_favorite = ? WHERE id = ?').run(status, id);
    res.json({ success: true, is_favorite: status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update favorite status' });
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

