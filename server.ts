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

// Initialize Database
const dbPath = path.resolve(process.cwd(), 'history.db');
const db = new Database(dbPath);

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

// Initialize ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || '',
});

// Setup Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));

// API Routes

// Upload Image to ImageKit
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
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
app.post('/api/history', (req, res) => {
  try {
    const { module, summary, content, imageUrl, imageFileId, uid } = req.body;
    
    if (!module || !summary || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stmt = db.prepare(`
      INSERT INTO history (module, summary, content, image_url, image_file_id, uid)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(module, summary, JSON.stringify(content), imageUrl || null, imageFileId || null, uid || null);
    
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (error) {
    console.error('Save history error:', error);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// Get History Records
app.get('/api/history', (req, res) => {
  try {
    const { module, uid } = req.query;
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
app.delete('/api/history', async (req, res) => {
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

    // First, find all records that match the condition and have an image_file_id
    const selectStmt = db.prepare(`SELECT image_file_id FROM history WHERE ${dateCondition} AND uid = ? AND image_file_id IS NOT NULL`);
    const recordsToDelete = selectStmt.all(uid);

    // Delete images from ImageKit
    if (recordsToDelete.length > 0 && process.env.IMAGEKIT_PRIVATE_KEY) {
      const fileIds = recordsToDelete.map((r: any) => r.image_file_id);
      
      // ImageKit bulk delete API
      try {
        await imagekit.bulkDeleteFiles(fileIds);
      } catch (ikError) {
        console.error('Failed to delete some files from ImageKit:', ikError);
        // We continue to delete from local DB even if ImageKit fails partially
      }
    }

    // Delete from local database
    const deleteStmt = db.prepare(`DELETE FROM history WHERE ${dateCondition} AND uid = ?`);
    const info = deleteStmt.run(uid);

    res.json({ success: true, deletedCount: info.changes });
  } catch (error) {
    console.error('Delete history error:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
