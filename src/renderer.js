const repoUrlInput = document.getElementById('repoUrl');
const startButton = document.getElementById('startButton');
const logOutput = document.getElementById('logOutput');
const statusMessage = document.getElementById('statusMessage');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let isRunning = false;

// Progress tracking
const progressSteps = [
  { progress: 10, text: 'Checking git installation...' },
  { progress: 20, text: 'Cloning repository...' },
  { progress: 40, text: 'Installing Homebrew...' },
  { progress: 60, text: 'Installing packages...' },
  { progress: 80, text: 'Installing applications...' },
  { progress: 90, text: 'Configuring environment...' },
  { progress: 100, text: 'Setup complete!' }
];

let currentStep = 0;

function updateProgress(step) {
  if (step < progressSteps.length) {
    currentStep = step;
    const { progress, text } = progressSteps[step];
    progressBar.style.width = `${progress}%`;
    progressText.textContent = text;
  }
}

// Listen for log output from main process
window.electronAPI.onLogOutput((data) => {
  appendLog(data);
  
  // Update progress based on log content
  const logLower = data.toLowerCase();
  if (logLower.includes('cloning') || logLower.includes('clone')) {
    updateProgress(2);
  } else if (logLower.includes('homebrew')) {
    updateProgress(3);
  } else if (logLower.includes('installing') || logLower.includes('install:')) {
    if (currentStep < 5) updateProgress(4);
  } else if (logLower.includes('configuring') || logLower.includes('setup')) {
    if (currentStep < 6) updateProgress(5);
  }
});

// Append log message and auto-scroll
function appendLog(message) {
  logOutput.textContent += message;
  logOutput.scrollTop = logOutput.scrollHeight;
}

// Show status message
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
}

// Hide status message
function hideStatus() {
  statusMessage.className = 'status hidden';
}

// Validate URL
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Start button click handler
startButton.addEventListener('click', async () => {
  if (isRunning) return;
  
  const repoUrl = repoUrlInput.value.trim();
  
  // Validate input
  if (!repoUrl) {
    showStatus('Please enter a repository URL', 'error');
    return;
  }
  
  if (!isValidUrl(repoUrl)) {
    showStatus('Please enter a valid URL (must start with http:// or https://)', 'error');
    return;
  }
  
  // Disable button and input
  isRunning = true;
  startButton.disabled = true;
  repoUrlInput.disabled = true;
  hideStatus();
  
  // Clear previous logs and reset progress
  logOutput.textContent = '';
  progressBar.style.width = '0%';
  progressText.textContent = 'Starting...';
  currentStep = 0;
  
  try {
    // Check if git is installed
    updateProgress(0);
    appendLog('Checking for git installation...\n');
    const gitCheck = await window.electronAPI.checkGit();
    
    if (!gitCheck.installed) {
      showStatus('Git not installed. Installing Xcode Command Line Tools...', 'info');
      appendLog('Git is not installed. Installing Xcode Command Line Tools...\n\n');
      
      try {
        const installResult = await window.electronAPI.installGit();
        
        if (installResult.needsRestart) {
          showStatus('Please complete the installation and restart this app', 'info');
          appendLog('⚠️  Installation in progress\n');
          appendLog('Once the installation completes, please restart this app and try again.\n');
          progressBar.style.width = '0%';
          progressText.textContent = 'Waiting for installation...';
          return;
        } else {
          appendLog('✓ Xcode Command Line Tools installed\n\n');
        }
      } catch (installError) {
        showStatus('Failed to install Command Line Tools', 'error');
        appendLog(`ERROR: ${installError.message}\n`);
        appendLog('\nPlease install manually:\n');
        appendLog('1. Open Terminal\n');
        appendLog('2. Run: xcode-select --install\n');
        appendLog('3. Restart this app after installation\n');
        progressBar.style.width = '0%';
        progressText.textContent = 'Installation required';
        return;
      }
    } else {
      appendLog('✓ Git is installed\n\n');
    }
    
    // Check if Homebrew is installed
    appendLog('Checking for Homebrew installation...\n');
    const brewCheck = await window.electronAPI.checkBrew();
    
    if (!brewCheck.installed) {
      appendLog('Homebrew is not installed.\n');
      appendLog('The bootstrap script will install it automatically.\n\n');
    } else {
      appendLog('✓ Homebrew is installed\n\n');
    }
    
    updateProgress(1);
    
    // Run bootstrap
    showStatus('Running bootstrap script... This may take 15-30 minutes', 'info');
    await window.electronAPI.runBootstrap(repoUrl);
    
    updateProgress(6); // Complete
    showStatus('✓ Setup completed successfully!', 'success');
    
  } catch (error) {
    showStatus(`✗ Setup failed: ${error.message}`, 'error');
    appendLog(`\nFATAL ERROR: ${error.message}\n`);
    progressBar.style.width = '0%';
    progressText.textContent = 'Setup failed';
  } finally {
    // Re-enable button and input
    isRunning = false;
    startButton.disabled = false;
    repoUrlInput.disabled = false;
  }
});

// Allow Enter key to trigger button
repoUrlInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter' && !isRunning) {
    startButton.click();
  }
});

// Initial focus on input
repoUrlInput.focus();