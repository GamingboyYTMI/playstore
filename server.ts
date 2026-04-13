import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure upload directories exist
  const apkDir = path.join(__dirname, 'apk');
  const imagesDir = path.join(__dirname, 'images');
  if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  // Configure Multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'apk') {
        cb(null, apkDir);
      } else if (file.fieldname === 'icon' || file.fieldname === 'previews') {
        cb(null, imagesDir);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage });

  app.use(express.json());

  // Simulate backend.php behavior for the preview
  app.all('/backend.php', upload.fields([
    { name: 'apk', maxCount: 1 }, 
    { name: 'icon', maxCount: 1 },
    { name: 'previews', maxCount: 5 }
  ]), (req: any, res: any) => {
    const action = req.query.action;

    if (action === 'upload') {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files || !files.apk || !files.icon) {
        return res.status(400).json({ error: 'Missing files' });
      }

      const apkPath = `apk/${files.apk[0].filename}`;
      const iconPath = `images/${files.icon[0].filename}`;
      const previewPaths = (files.previews || []).map(f => `images/${f.filename}`);

      res.json({
        apk: apkPath,
        icon: iconPath,
        previews: previewPaths,
        size: (files.apk[0].size / (1024 * 1024)).toFixed(1) + ' MB'
      });
    } else if (action === 'download') {
      const file = req.query.file;
      const filePath = path.join(apkDir, file);
      if (fs.existsSync(filePath)) {
        res.download(filePath);
      } else {
        res.status(404).send('File not found');
      }
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  });

  // Serve uploaded files
  app.use('/apk', express.static(path.join(__dirname, 'apk')));
  app.use('/images', express.static(path.join(__dirname, 'images')));

  // Serve the static index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
