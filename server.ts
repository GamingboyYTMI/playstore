import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, 'tokens.json');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

function saveTokens(tokens: any) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

function loadTokens() {
  if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    oauth2Client.setCredentials(tokens);
    return tokens;
  }
  return null;
}

async function uploadToDrive(filePath: string, fileName: string, mimeType: string) {
  try {
    const tokens = loadTokens();
    if (!tokens) {
      console.log('No Google Drive tokens found, skipping drive upload.');
      return null;
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      },
    });
    return response.data.id;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    return null;
  }
}

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

  // Google OAuth Routes
  app.get('/api/auth/google/url', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);
      saveTokens(tokens);
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Google Drive connected! This window will close.</p>
          </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send('Authentication failed');
    }
  });

  app.get('/api/auth/google/status', (req, res) => {
    res.json({ connected: fs.existsSync(TOKEN_PATH) });
  });

  // Simulate backend.php behavior for the preview
  app.all('/backend.php', upload.fields([
    { name: 'apk', maxCount: 1 }, 
    { name: 'icon', maxCount: 1 },
    { name: 'previews', maxCount: 5 }
  ]), async (req: any, res: any) => {
    const action = req.query.action;

    if (action === 'upload') {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files || !files.apk || !files.icon) {
        return res.status(400).json({ error: 'Missing files' });
      }

      const apkFile = files.apk[0];
      const iconFile = files.icon[0];
      const previewFiles = files.previews || [];

      const apkPath = `apk/${apkFile.filename}`;
      const iconPath = `images/${iconFile.filename}`;
      const previewPaths = previewFiles.map(f => `images/${f.filename}`);

      // Auto-upload to Google Drive if connected
      await uploadToDrive(path.join(__dirname, 'apk', apkFile.filename), apkFile.originalname, 'application/vnd.android.package-archive');
      await uploadToDrive(path.join(__dirname, 'images', iconFile.filename), iconFile.originalname, iconFile.mimetype);
      for (const f of previewFiles) {
        await uploadToDrive(path.join(__dirname, 'images', f.filename), f.originalname, f.mimetype);
      }

      res.json({
        apk: apkPath,
        icon: iconPath,
        previews: previewPaths,
        size: (apkFile.size / (1024 * 1024)).toFixed(1) + ' MB'
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
