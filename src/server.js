const express = require('express');
const cors = require('cors');
const Docker = require('dockerode');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

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
    port INTEGER NOT NULL,
    container_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Multer setup for uploads
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
// Serve the public directory
app.use(express.static(path.join(__dirname, '../public')));
// Serve the uploads directory at /uploads
app.use('/uploads', express.static(uploadDir));

// Get all Docker containers with their ports
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const formatted = containers.map(c => ({
      id: c.Id,
      name: c.Names[0]?.replace('/', '') || 'unknown',
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: c.Ports.map(p => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type
      })).filter(p => p.public)
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching containers:', error);
    res.status(500).json({ error: 'Failed to fetch containers' });
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
  const { name, description, icon, port, container_id } = req.body;

  if (!name || !port) {
    return res.status(400).json({ error: 'Name and port are required' });
  }

  // Determine the icon value: uploaded file path, or provided icon/url string, or default
  let iconValue = icon || 'cube';
  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO shortcuts (name, description, icon, port, container_id) VALUES (?, ?, ?, ?, ?)'
    );
    const result = stmt.run(name, description || '', iconValue, port, container_id || null);
    res.json({ id: result.lastInsertRowid, name, description, icon: iconValue, port, container_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create shortcut' });
  }
});

// Update a shortcut
app.put('/api/shortcuts/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, icon, port, container_id } = req.body;

  let iconValue = icon;
  if (req.file) {
    iconValue = 'uploads/' + req.file.filename;
  }

  try {
    // If no new icon/image is provided, we might want to keep the old one. 
    // However, the frontend should send the current value if it's not changing, or we can fetch and check.
    // For simplicity, if iconValue is undefined/null and no file, we assume the user intends to keep it or it's handled by frontend sending old value.
    // But if we want to support partial updates, we'd need dynamic SQL.
    // Here we assume the frontend sends the existing icon string if no new file is uploaded.

    // Check if we need to fetch the existing record first?
    // Let's assume frontend sends all fields.

    // BUT: "icon" field in form data might be empty if user is uploading a file OR if they didn't touch it.
    // Ideally frontend logic:
    // - If uploading file: send file.
    // - If selecting icon: send icon string.
    // - If pasting URL: send URL string.
    // - If keeping previous: send previous string.

    // If iconValue is missing (e.g. only name update), we should probably fetch previous.
    // But standard REST PUT replaces the resource.

    const stmt = db.prepare(
      'UPDATE shortcuts SET name=?, description=?, icon=?, port=?, container_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    );
    stmt.run(name, description, iconValue, port, container_id, id);
    res.json({ id, name, description, icon: iconValue, port, container_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update shortcut' });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Docker Dashboard running on http://0.0.0.0:${PORT}`);
});

