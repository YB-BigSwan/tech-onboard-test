const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const simpleGit = require('simple-git');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Check if git is installed
ipcMain.handle('check-git', async () => {
  return new Promise((resolve) => {
    const gitCheck = spawn('git', ['--version']);
    
    gitCheck.on('error', () => {
      resolve({ installed: false, message: 'Git not found' });
    });
    
    gitCheck.on('close', (code) => {
      if (code === 0) {
        resolve({ installed: true, message: 'Git is installed' });
      } else {
        resolve({ installed: false, message: 'Git check failed' });
      }
    });
  });
});

// Install git using Homebrew
ipcMain.handle('install-git', async () => {
  mainWindow.webContents.send('log-output', 'Git not found. Installing git...\n');
  
  return new Promise((resolve, reject) => {
    // First check if Homebrew is installed
    const brewCheck = spawn('brew', ['--version']);
    
    brewCheck.on('error', () => {
      // Homebrew not installed, install it first
      mainWindow.webContents.send('log-output', 'Homebrew not found. Installing Homebrew first...\n');
      
      const brewInstall = spawn('/bin/bash', ['-c', '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'], {
        env: { ...process.env, NONINTERACTIVE: '1' },
        shell: true
      });
      
      brewInstall.stdout.on('data', (data) => {
        mainWindow.webContents.send('log-output', data.toString());
      });
      
      brewInstall.stderr.on('data', (data) => {
        mainWindow.webContents.send('log-output', data.toString());
      });
      
      brewInstall.on('close', (code) => {
        if (code === 0) {
          // Now install git
          installGitWithBrew(resolve, reject);
        } else {
          reject(new Error('Failed to install Homebrew'));
        }
      });
    });
    
    brewCheck.on('close', (code) => {
      if (code === 0) {
        // Homebrew exists, just install git
        installGitWithBrew(resolve, reject);
      }
    });
  });
});

// Helper function to install git with brew
function installGitWithBrew(resolve, reject) {
  mainWindow.webContents.send('log-output', 'Installing git via Homebrew...\n');
  
  const gitInstall = spawn('brew', ['install', 'git']);
  
  gitInstall.stdout.on('data', (data) => {
    mainWindow.webContents.send('log-output', data.toString());
  });
  
  gitInstall.stderr.on('data', (data) => {
    mainWindow.webContents.send('log-output', data.toString());
  });
  
  gitInstall.on('close', (code) => {
    if (code === 0) {
      mainWindow.webContents.send('log-output', '✓ Git installed successfully\n\n');
      resolve({ success: true, message: 'Git installed successfully' });
    } else {
      reject(new Error('Failed to install git'));
    }
  });
  
  gitInstall.on('error', (error) => {
    reject(error);
  });
}

// Clone repo and run bootstrap script
ipcMain.handle('run-bootstrap', async (event, repoUrl) => {
  const tempDir = path.join(os.tmpdir(), `bootstrap-${Date.now()}`);
  
  try {
    // Send initial log
    mainWindow.webContents.send('log-output', `Starting bootstrap process...`);
    mainWindow.webContents.send('log-output', `Temp directory: ${tempDir}`);
    
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Clone repository
    mainWindow.webContents.send('log-output', `Cloning repository: ${repoUrl}`);
    const git = simpleGit();
    
    await git.clone(repoUrl, tempDir);
    mainWindow.webContents.send('log-output', `Repository cloned successfully`);
    
    // Check if bootstrap.sh exists
    const bootstrapPath = path.join(tempDir, 'bootstrap.sh');
    if (!fs.existsSync(bootstrapPath)) {
      throw new Error('bootstrap.sh not found in repository');
    }
    
    // Make bootstrap.sh executable
    fs.chmodSync(bootstrapPath, '755');
    mainWindow.webContents.send('log-output', `Found bootstrap.sh, making it executable`);
    
    // Execute bootstrap script
    mainWindow.webContents.send('log-output', `\nExecuting bootstrap.sh...\n`);
    mainWindow.webContents.send('log-output', `${'='.repeat(50)}\n`);
    
    return new Promise((resolve, reject) => {
      const bootstrap = spawn('bash', [bootstrapPath], {
        cwd: tempDir,
        shell: true
      });
      
      // Stream stdout
      bootstrap.stdout.on('data', (data) => {
        mainWindow.webContents.send('log-output', data.toString());
      });
      
      // Stream stderr
      bootstrap.stderr.on('data', (data) => {
        mainWindow.webContents.send('log-output', `ERROR: ${data.toString()}`);
      });
      
      // Handle completion
      bootstrap.on('close', (code) => {
        mainWindow.webContents.send('log-output', `\n${'='.repeat(50)}`);
        
        if (code === 0) {
          mainWindow.webContents.send('log-output', `\n✓ Bootstrap completed successfully!`);
          resolve({ success: true, message: 'Bootstrap completed successfully' });
        } else {
          mainWindow.webContents.send('log-output', `\n✗ Bootstrap failed with exit code ${code}`);
          reject(new Error(`Bootstrap script exited with code ${code}`));
        }
        
        // Cleanup temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          mainWindow.webContents.send('log-output', `Cleaned up temporary files`);
        } catch (err) {
          mainWindow.webContents.send('log-output', `Warning: Could not clean up ${tempDir}`);
        }
      });
      
      // Handle errors
      bootstrap.on('error', (error) => {
        mainWindow.webContents.send('log-output', `ERROR: ${error.message}`);
        reject(error);
      });
    });
    
  } catch (error) {
    mainWindow.webContents.send('log-output', `\nERROR: ${error.message}`);
    
    // Cleanup on error
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw error;
  }
});