import express from 'express';
import { createServer as createViteServer } from 'vite';
import ImageKit from 'imagekit';
import multer from 'multer';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Database lazily
let db: any = null;

// Initialize ImageKit lazily
let imagekit: ImageKit | null = null;

function initServices() {
  try {
    const dbPath = path.resolve(process.cwd(), 'history.db');
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        image_file_id TEXT,
        uid TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add uid column if it doesn't exist (for existing databases)
    try {
      db.exec(`ALTER TABLE history ADD COLUMN uid TEXT`);
    } catch (e) {
      // Column already exists or other error
    }

    if (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
      imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      });
    }
  } catch (e) {
    console.error("Failed to initialize services:", e);
  }
}

// Cloud Sync Functions
async function syncToCloud(uid: string) {
  if (!imagekit) return;
  try {
    const stmt = db.prepare('SELECT * FROM history WHERE uid = ? ORDER BY created_at DESC LIMIT 50');
    const records = stmt.all(uid);
    const buffer = Buffer.from(JSON.stringify(records), 'utf-8');
    await imagekit.upload({
      file: buffer,
      fileName: `history_backup_${uid}.json`,
      folder: '/ai_study_assistant/backups',
      useUniqueFileName: false,
      overwriteFile: true
    });
    console.log(`Synced ${records.length} records to cloud for user ${uid}`);
  } catch (e) {
    console.error('Failed to sync to cloud:', e);
  }
}

async function restoreFromCloudIfNeeded(uid: string) {
  if (!imagekit || !process.env.IMAGEKIT_URL_ENDPOINT) return;
  try {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM history WHERE uid = ?');
    const { count } = countStmt.get(uid) as any;
    
    if (count === 0) {
      console.log(`Local DB empty for user ${uid}, attempting to restore from cloud...`);
      // Construct the URL directly to avoid listFiles API call
      let endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
      if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
      
      const url = `${endpoint}/ai_study_assistant/backups/history_backup_${uid}.json?t=${Date.now()}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const records = await response.json();
        if (Array.isArray(records) && records.length > 0) {
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO history (id, module, summary, content, image_url, image_file_id, uid, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const transaction = db.transaction((recs) => {
            for (const r of recs) {
              insertStmt.run(r.id, r.module, r.summary, r.content, r.image_url, r.image_file_id, r.uid, r.created_at);
            }
          });
          transaction(records);
          console.log(`Restored ${records.length} records from cloud for user ${uid}`);
        }
      } else {
        console.log(`No cloud backup found for user ${uid} (status: ${response.status})`);
      }
    }
  } catch (e) {
    console.error('Failed to restore from cloud:', e);
  }
}

// Setup Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// API Routes

// Upload Image to ImageKit
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!imagekit) {
      return res.status(500).json({ error: 'ImageKit credentials not configured in .env' });
    }

    const response = await imagekit.upload({
      file: req.file.buffer,
      fileName: `upload_${Date.now()}_${req.file.originalname}`,
      folder: '/ai_study_assistant',
    });

    res.json({
      url: response.url,
      fileId: response.fileId,
    });
  } catch (error) {
    console.error('ImageKit upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Save History Record
app.post('/api/records', async (req, res) => {
  try {
    const { module, summary, content, imageUrl, imageFileId, uid } = req.body;
    
    if (!module || !summary || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let finalContent = JSON.stringify(content);

    if (imagekit) {
      try {
        const buffer = Buffer.from(finalContent, 'utf-8');
        const response = await imagekit.upload({
          file: buffer,
          fileName: `history_${module}_${Date.now()}.json`,
          folder: '/ai_study_assistant/history',
          useUniqueFileName: true
        });
        
        finalContent = JSON.stringify({
          isCloudFile: true,
          url: response.url,
          fileId: response.fileId
        });
      } catch (uploadError) {
        console.error('Failed to upload content to ImageKit, falling back to DB storage:', uploadError);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO history (module, summary, content, image_url, image_file_id, uid)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(module, summary, finalContent, imageUrl || null, imageFileId || null, uid || null);
    
    if (uid) {
      syncToCloud(uid); // Fire and forget
    }
    
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (error) {
    console.error('Save history error:', error);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

app.get('/api/proxy', async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).send('URL required');
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('Proxy error:', e);
    res.status(500).send('Failed to fetch URL');
  }
});

// Get History Records
app.get('/api/records', async (req, res) => {
  try {
    const { module, uid } = req.query as { module?: string, uid?: string };
    
    if (uid) {
      await restoreFromCloudIfNeeded(uid);
    }

    let stmt;
    
    if (module && uid) {
      stmt = db.prepare('SELECT * FROM history WHERE module = ? AND uid = ? ORDER BY created_at DESC');
      res.json(stmt.all(module, uid));
    } else if (module) {
      stmt = db.prepare('SELECT * FROM history WHERE module = ? ORDER BY created_at DESC');
      res.json(stmt.all(module));
    } else if (uid) {
      stmt = db.prepare('SELECT * FROM history WHERE uid = ? ORDER BY created_at DESC');
      res.json(stmt.all(uid));
    } else {
      stmt = db.prepare('SELECT * FROM history ORDER BY created_at DESC');
      res.json(stmt.all());
    }
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Delete History Records by Time Period
app.delete('/api/records', async (req, res) => {
  try {
    const { period, uid } = req.query; // 'all', '7days', '30days'
    
    if (!uid) {
      return res.status(400).json({ error: 'UID is required for deletion' });
    }

    let dateCondition = '';
    if (period === '1day') {
      dateCondition = "created_at < datetime('now', '-1 day')";
    } else if (period === '3days') {
      dateCondition = "created_at < datetime('now', '-3 days')";
    } else if (period === '7days') {
      dateCondition = "created_at < datetime('now', '-7 days')";
    } else if (period === '30days') {
      dateCondition = "created_at < datetime('now', '-30 days')";
    } else if (period === '90days') {
      dateCondition = "created_at < datetime('now', '-90 days')";
    } else if (period === 'all') {
      dateCondition = "1=1"; // Delete all
    } else {
      return res.status(400).json({ error: 'Invalid period specified' });
    }

    // First, find all records that match the condition
    const selectStmt = db.prepare(`SELECT content, image_file_id FROM history WHERE ${dateCondition} AND uid = ?`);
    const recordsToDelete = selectStmt.all(uid);

    // Delete images and cloud files from ImageKit
    if (recordsToDelete.length > 0 && imagekit) {
      const fileIds: string[] = [];
      
      recordsToDelete.forEach((r: any) => {
        if (r.image_file_id) {
          fileIds.push(r.image_file_id);
        }
        try {
          const parsedContent = JSON.parse(r.content);
          if (parsedContent && parsedContent.isCloudFile && parsedContent.fileId) {
            fileIds.push(parsedContent.fileId);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      if (fileIds.length > 0) {
        try {
          await imagekit.bulkDeleteFiles(fileIds);
        } catch (ikError) {
          console.error('Failed to delete some files from ImageKit:', ikError);
          // We continue to delete from local DB even if ImageKit fails partially
        }
      }
    }

    // Delete from local database
    const deleteStmt = db.prepare(`DELETE FROM history WHERE ${dateCondition} AND uid = ?`);
    const info = deleteStmt.run(uid);

    if (uid) {
      syncToCloud(uid as string); // Fire and forget
    }

    res.json({ success: true, deletedCount: info.changes });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

async function startServer() {
  // Start listening immediately to satisfy platform health checks
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}, initializing services...`);
  });

  // Initialize DB and other services after listening
  initServices();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting Vite in middleware mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware integrated.');
  } else {
    app.use(express.static('dist'));
  }
}

startServer();
