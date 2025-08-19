// Popup script for AI-Free Coding Focus Extension

document.addEventListener('DOMContentLoaded', initialize);

let timerInterval = null;
let currentPanel = 'main';

async function initialize() {
  setupEventListeners();
  await updateUI();
  await loadSettings();
  await loadLogs();
  
  // Start timer update interval
  timerInterval = setInterval(updateUI, 1000);
}

function setupEventListeners() {
  // Main controls
  document.getElementById('startBtn').addEventListener('click', startSession);
  document.getElementById('stopBtn').addEventListener('click', stopSession);
  
  // Tab navigation
  document.getElementById('mainTab').addEventListener('click', () => showPanel('main'));
  document.getElementById('settingsTab').addEventListener('click', () => showPanel('settings'));
  document.getElementById('logsTab').addEventListener('click', () => showPanel('logs'));
  
  // Back buttons
  document.getElementById('settingsBackBtn').addEventListener('click', () => showPanel('main'));
  document.getElementById('logsBackBtn').addEventListener('click', () => showPanel('main'));
  
  // Settings
  document.getElementById('addSiteBtn').addEventListener('click', addSite);
  document.getElementById('newSiteInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSite();
  });
  document.getElementById('resetBlocklistBtn').addEventListener('click', resetBlocklist);
  
  // Logs
  document.getElementById('exportLogsBtn').addEventListener('click', exportLogs);
  document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
}

async function startSession() {
  try {
    console.log('Starting session...');
    const response = await sendMessage({ action: 'START_SESSION' });
    console.log('Start session response:', response);
    
    if (response && response.success) {
      await updateUI();
      showNotification('Coding session started! AI sites are now blocked.');
    } else {
      throw new Error('Failed to start session');
    }
  } catch (error) {
    console.error('Error starting session:', error);
    showNotification('Failed to start session: ' + error.message, 'error');
  }
}

async function stopSession() {
  try {
    await sendMessage({ action: 'STOP_SESSION' });
    await updateUI();
    await loadLogs(); // Refresh logs
    showNotification('Session completed! Well done!');
  } catch (error) {
    console.error('Error stopping session:', error);
    showNotification('Failed to stop session', 'error');
  }
}

async function updateUI() {
  try {
    const status = await sendMessage({ action: 'GET_STATUS' });
    
    // Update status indicator
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (status.isBlocking) {
      statusDot.classList.add('blocking');
      statusText.textContent = 'AI Blocked';
    } else {
      statusDot.classList.remove('blocking');
      statusText.textContent = 'AI Unblocked';
    }
    
    // Update timer
    const timerText = document.querySelector('.timer-text');
    const elapsed = status.elapsed || 0;
    timerText.textContent = formatTime(elapsed);
    
    // Update controls
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    startBtn.disabled = status.isBlocking;
    stopBtn.disabled = !status.isBlocking;
    
    // Update session count (today only)
    const sessionCount = document.getElementById('sessionCount');
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = await getTodaySessions();
    sessionCount.textContent = todaySessions.length;
    
  } catch (error) {
    console.error('Error updating UI:', error);
  }
}

async function getTodaySessions() {
  try {
    const response = await sendMessage({ action: 'EXPORT_LOGS' });
    const logs = response?.logs || [];
    const today = new Date().toISOString().split('T')[0];
    return logs.filter(log => log.date === today);
  } catch (error) {
    console.error('Error getting today sessions:', error);
    return [];
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showPanel(panelName) {
  console.log('Switching to panel:', panelName);
  
  // Update active tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  if (panelName === 'main') {
    // Show main content, hide all panels
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('logsPanel').style.display = 'none';
    document.getElementById('mainTab').classList.add('active');
  } else {
    // Hide main content, show selected panel
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('logsPanel').style.display = 'none';
    
    const panelElement = document.getElementById(`${panelName}Panel`);
    if (panelElement) {
      panelElement.style.display = 'flex';
      document.getElementById(`${panelName}Tab`).classList.add('active');
      
      // Load data when switching to specific panels
      if (panelName === 'logs') {
        setTimeout(loadLogs, 100); // Small delay to ensure panel is shown
      } else if (panelName === 'settings') {
        setTimeout(loadSettings, 100);
      }
    } else {
      console.error('Panel not found:', `${panelName}Panel`);
    }
  }
  
  currentPanel = panelName;
}

// Make showPanel globally available for onclick handlers
window.showPanel = showPanel;

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get('blocklist');
    const blocklist = data.blocklist || [];
    
    const blocklistItems = document.getElementById('blocklistItems');
    blocklistItems.innerHTML = '';
    
    blocklist.forEach(site => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${site}</span>
        <span class="remove-site" onclick="removeSite('${site}')">&times;</span>
      `;
      blocklistItems.appendChild(li);
    });
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function addSite() {
  const input = document.getElementById('newSiteInput');
  const site = input.value.trim();
  
  if (!site) return;
  
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(site)) {
    showNotification('Please enter a valid domain', 'error');
    return;
  }
  
  try {
    const data = await chrome.storage.local.get('blocklist');
    const blocklist = data.blocklist || [];
    
    if (blocklist.includes(site)) {
      showNotification('Site already in blocklist', 'error');
      return;
    }
    
    blocklist.push(site);
    await sendMessage({ action: 'UPDATE_BLOCKLIST', blocklist });
    
    input.value = '';
    await loadSettings();
    showNotification('Site added to blocklist');
  } catch (error) {
    console.error('Error adding site:', error);
    showNotification('Failed to add site', 'error');
  }
}

async function removeSite(site) {
  try {
    const data = await chrome.storage.local.get('blocklist');
    const blocklist = data.blocklist || [];
    
    const newBlocklist = blocklist.filter(s => s !== site);
    await sendMessage({ action: 'UPDATE_BLOCKLIST', blocklist: newBlocklist });
    
    await loadSettings();
    showNotification('Site removed from blocklist');
  } catch (error) {
    console.error('Error removing site:', error);
    showNotification('Failed to remove site', 'error');
  }
}

// Make removeSite globally available
window.removeSite = removeSite;

async function resetBlocklist() {
  const defaultBlocklist = [
    'chat.openai.com',
    'claude.ai',
    'gemini.google.com',
    'copilot.microsoft.com',
    'github.com/copilot',
    'codeium.com',
    'tabnine.com'
  ];
  
  try {
    await sendMessage({ action: 'UPDATE_BLOCKLIST', blocklist: defaultBlocklist });
    await loadSettings();
    showNotification('Blocklist reset to default');
  } catch (error) {
    console.error('Error resetting blocklist:', error);
    showNotification('Failed to reset blocklist', 'error');
  }
}

async function loadLogs() {
  try {
    const response = await sendMessage({ action: 'EXPORT_LOGS' });
    const logs = response?.logs || [];
    const logsContainer = document.getElementById('logsContainer');
    
    if (!logs || logs.length === 0) {
      logsContainer.innerHTML = '<div class="no-logs">No sessions recorded yet</div>';
      return;
    }
    
    // Sort logs by date/time (most recent first)
    const sortedLogs = logs.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.start}`);
      const dateB = new Date(`${b.date} ${b.start}`);
      return dateB - dateA;
    });
    
    logsContainer.innerHTML = sortedLogs.map(log => `
      <div class="log-entry">
        <div class="log-date">${formatDate(log.date)}</div>
        <div class="log-time">
          ${log.start} - ${log.end}
          <span class="log-duration">${log.duration_min} min</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading logs:', error);
    const logsContainer = document.getElementById('logsContainer');
    logsContainer.innerHTML = '<div class="no-logs">Error loading logs</div>';
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
}

async function exportLogs() {
  try {
    const response = await sendMessage({ action: 'EXPORT_LOGS' });
    const logs = response?.logs || [];
    
    const dataStr = JSON.stringify(logs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `ai-free-coding-logs-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification('Logs exported successfully');
  } catch (error) {
    console.error('Error exporting logs:', error);
    showNotification('Failed to export logs', 'error');
  }
}

async function clearLogs() {
  if (confirm('Are you sure you want to clear all session history? This cannot be undone.')) {
    try {
      await chrome.storage.local.set({ sessionLogs: [] });
      await loadLogs();
      showNotification('Session history cleared');
    } catch (error) {
      console.error('Error clearing logs:', error);
      showNotification('Failed to clear logs', 'error');
    }
  }
}

function showNotification(message, type = 'success') {
  // Create a simple notification system
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: ${type === 'error' ? '#ef4444' : '#10b981'};
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.error('Send message error:', error);
      reject(error);
    }
  });
}