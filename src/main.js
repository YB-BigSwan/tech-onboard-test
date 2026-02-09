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

// Check if Homebrew is installed
ipcMain.handle('check-brew', async () => {
  return new Promise((resolve) => {
    const brewPath = process.arch === 'arm64' ? '/opt/homebrew/bin/brew' : '/usr/local/bin/brew';
    
    // Check if brew exists at the expected path
    if (fs.existsSync(brewPath)) {
      resolve({ installed: true, message: 'Homebrew is installed' });
    } else {
      resolve({ installed: false, message: 'Homebrew not found' });
    }
  });
});

// Install Homebrew
ipcMain.handle('install-brew', async () => {
  mainWindow.webContents.send('log-output', 'Installing Homebrew...\n');
  
  return new Promise((resolve, reject) => {
    const brewInstall = spawn('/bin/bash', ['-c', 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'], {
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
        mainWindow.webContents.send('log-output', '✓ Homebrew installed successfully\n\n');
        resolve({ success: true, message: 'Homebrew installed successfully' });
      } else {
        reject(new Error('Failed to install Homebrew'));
      }
    });
    
    brewInstall.on('error', (error) => {
      reject(error);
    });
  });
});

// Install git via Xcode Command Line Tools
ipcMain.handle('install-git', async () => {
  mainWindow.webContents.send('log-output', 'Git not found. Installing Xcode Command Line Tools...\n');
  mainWindow.webContents.send('log-output', 'A system dialog will appear - please click "Install"\n\n');
  
  return new Promise((resolve, reject) => {
    // Trigger the xcode-select install dialog
    const xcodeInstall = spawn('xcode-select', ['--install']);
    
    xcodeInstall.stdout.on('data', (data) => {
      mainWindow.webContents.send('log-output', data.toString());
    });
    
    xcodeInstall.stderr.on('data', (data) => {
      const output = data.toString();
      mainWindow.webContents.send('log-output', output);
      
      // Check if tools are already installed
      if (output.includes('command line tools are already installed')) {
        mainWindow.webContents.send('log-output', '✓ Command Line Tools already installed\n\n');
        resolve({ success: true, message: 'Tools already installed' });
      }
    });
    
    xcodeInstall.on('close', (code) => {
      if (code === 0) {
        mainWindow.webContents.send('log-output', '\n✓ Installation dialog opened\n');
        mainWindow.webContents.send('log-output', 'Please complete the installation, then restart this app.\n\n');
        resolve({ success: true, message: 'Installation dialog opened', needsRestart: true });
      } else {
        // Even on error, the dialog might have opened
        mainWindow.webContents.send('log-output', '\nInstallation dialog should have opened.\n');
        mainWindow.webContents.send('log-output', 'Please complete the installation, then restart this app.\n\n');
        resolve({ success: true, message: 'Installation triggered', needsRestart: true });
      }
    });
    
    xcodeInstall.on('error', (error) => {
      reject(error);
    });
  });
});

// Clone repo and run bootstrap script
ipcMain.handle('run-bootstrap', async (event, repoUrl) => {
  const tempDir = path.join(os.tmpdir(), `bootstrap-${Date.now()}`);
  
  try {
    // Send initial log
    mainWindow.webContents.send('log-output', `Starting bootstrap process...\n`);
    mainWindow.webContents.send('log-output', `Temp directory: ${tempDir}\n`);
    
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Clone repository
    mainWindow.webContents.send('log-output', `Cloning repository: ${repoUrl}\n`);
    const git = simpleGit();
    
    await git.clone(repoUrl, tempDir);
    mainWindow.webContents.send('log-output', `Repository cloned successfully\n`);
    
    // Check if bootstrap.sh exists
    const bootstrapPath = path.join(tempDir, 'bootstrap.sh');
    if (!fs.existsSync(bootstrapPath)) {
      throw new Error('bootstrap.sh not found in repository');
    }
    
    // Make bootstrap.sh executable
    fs.chmodSync(bootstrapPath, '755');
    mainWindow.webContents.send('log-output', `Found bootstrap.sh, making it executable\n`);
    
    // Prompt for password using AppleScript
    mainWindow.webContents.send('log-output', `\nRequesting administrator password...\n`);
    
    const passwordPrompt = spawn('osascript', [
      '-e',
      'display dialog "The bootstrap script needs administrator access to install software. Please enter your password:" default answer "" with hidden answer with title "Administrator Password Required"',
      '-e',
      'text returned of result'
    ]);
    
    let password = '';
    
    passwordPrompt.stdout.on('data', (data) => {
      password = data.toString().trim();
    });
    
    await new Promise((resolve, reject) => {
      passwordPrompt.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Password prompt cancelled'));
        }
      });
      
      passwordPrompt.on('error', (error) => {
        reject(error);
      });
    });
    
    if (!password) {
      throw new Error('No password provided');
    }
    
    mainWindow.webContents.send('log-output', `Password received\n`);
    
    // Create an expect script to handle sudo password prompts and confirmations
    const expectScript = `#!/usr/bin/expect -f
    log_user 0
set timeout -1
spawn bash ${bootstrapPath}
expect {
  "Password:" {
    send "${password}\\r"
    exp_continue
  }
  "Press RETURN" {
    send "\\r"
    exp_continue
  }
  "RETURN" {
    send "\\r"
    exp_continue
  }
  "to continue" {
    send "\\r"
    exp_continue
  }
  eof
}
`;
    
    const expectScriptPath = path.join(tempDir, 'run-with-password.exp');
    fs.writeFileSync(expectScriptPath, expectScript, { mode: 0o755 });
    
    // Execute bootstrap script
    mainWindow.webContents.send('log-output', `\nExecuting bootstrap.sh...\n`);
    mainWindow.webContents.send('log-output', `${'='.repeat(50)}\n`);
    
    return new Promise((resolve, reject) => {
      const bootstrap = spawn('expect', [expectScriptPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          USER: process.env.USER || process.env.LOGNAME
        }
      });
      
      // Stream stdout
      bootstrap.stdout.on('data', (data) => {
        mainWindow.webContents.send('log-output', data.toString());
      });
      
      // Stream stderr
      bootstrap.stderr.on('data', (data) => {
        mainWindow.webContents.send('log-output', data.toString());
      });
      
      // Handle completion
      bootstrap.on('close', (code) => {
        mainWindow.webContents.send('log-output', `\n${'='.repeat(50)}`);
        
        // Clean up expect script
        try {
          fs.unlinkSync(expectScriptPath);
        } catch (e) {
          // Ignore
        }
        
        if (code === 0) {
          mainWindow.webContents.send('log-output', `\n✓ Bootstrap completed successfully!\n`);
          resolve({ success: true, message: 'Bootstrap completed successfully' });
        } else {
          mainWindow.webContents.send('log-output', `\n✗ Bootstrap failed with exit code ${code}\n`);
          reject(new Error(`Bootstrap script exited with code ${code}`));
        }
        
        // Cleanup temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          mainWindow.webContents.send('log-output', `Cleaned up temporary files\n`);
        } catch (err) {
          mainWindow.webContents.send('log-output', `Warning: Could not clean up ${tempDir}\n`);
        }
      });
      
      // Handle errors
      bootstrap.on('error', (error) => {
        mainWindow.webContents.send('log-output', `ERROR: ${error.message}\n`);
        reject(error);
      });
    });
    
  } catch (error) {
    mainWindow.webContents.send('log-output', `\nERROR: ${error.message}\n`);
    
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