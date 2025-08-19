// Service Worker for AI-Free Coding Focus Extension

let sessionTimer = null;
let sessionStartTime = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated');
  
  // Set default state
  await chrome.storage.local.set({
    isBlocking: false,
    sessionLogs: [],
    blocklist: [
      'chat.openai.com',
      'claude.ai',
      'gemini.google.com',
      'copilot.microsoft.com',
      'github.com/copilot',
      'codeium.com',
      'tabnine.com',
      'bard.google.com',
      'poe.com',
      'chatgpt.com'
    ]
  });
  
  // Ensure blocking is disabled on install
  await updateBlockingRules(false);
  console.log('Extension initialized');
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    try {
      switch (message.action) {
        case 'START_SESSION':
          await startSession();
          return { success: true };
          
        case 'STOP_SESSION':
          await stopSession();
          return { success: true };
          
        case 'GET_STATUS':
          const status = await getSessionStatus();
          return status;
          
        case 'UPDATE_BLOCKLIST':
          await updateBlocklist(message.blocklist);
          return { success: true };
          
        case 'EXPORT_LOGS':
          const logs = await chrome.storage.local.get('sessionLogs');
          return { logs: logs.sessionLogs || [] };
          
        default:
          return { error: 'Unknown action' };
      }
    } catch (error) {
      console.error('Background script error:', error);
      return { error: error.message };
    }
  };
  
  handleMessage().then(sendResponse);
  return true; // Keep message channel open for async response
});

async function startSession() {
  const now = new Date();
  sessionStartTime = now;
  
  // Clear any existing timer
  if (sessionTimer) {
    clearInterval(sessionTimer);
  }
  
  // Start timer that updates every second
  sessionTimer = setInterval(updateTimer, 1000);
  
  // Enable blocking
  await chrome.storage.local.set({ 
    isBlocking: true,
    currentSessionStart: now.toISOString()
  });
  
  await updateBlockingRules(true);
  
  // Update badge
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
}

async function stopSession() {
  if (!sessionStartTime) return;
  
  const endTime = new Date();
  const duration = Math.round((endTime - sessionStartTime) / 60000); // minutes
  
  // Clear timer
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
  
  // Create session log
  const sessionLog = {
    date: sessionStartTime.toISOString().split('T')[0],
    start: sessionStartTime.toTimeString().slice(0, 5),
    end: endTime.toTimeString().slice(0, 5),
    duration_min: duration
  };
  
  // Save session log
  const { sessionLogs = [] } = await chrome.storage.local.get('sessionLogs');
  sessionLogs.push(sessionLog);
  
  // Disable blocking
  await chrome.storage.local.set({ 
    isBlocking: false,
    sessionLogs,
    currentSessionStart: null
  });
  
  await updateBlockingRules(false);
  
  sessionStartTime = null;
  
  // Update badge
  chrome.action.setBadgeText({ text: '' });
}

async function updateTimer() {
  if (!sessionStartTime) return;
  
  // Update storage with current duration for popup display
  const now = new Date();
  const elapsed = Math.round((now - sessionStartTime) / 1000); // seconds
  
  await chrome.storage.local.set({ currentSessionElapsed: elapsed });
}

async function getSessionStatus() {
  const data = await chrome.storage.local.get([
    'isBlocking', 
    'currentSessionStart', 
    'currentSessionElapsed',
    'sessionLogs'
  ]);
  
  let elapsed = 0;
  if (data.isBlocking && data.currentSessionStart) {
    const start = new Date(data.currentSessionStart);
    elapsed = Math.round((new Date() - start) / 1000);
  }
  
  return {
    isBlocking: data.isBlocking || false,
    elapsed: elapsed,
    totalSessions: (data.sessionLogs || []).length
  };
}

async function updateBlockingRules(enable) {
  try {
    console.log('Updating blocking rules, enable:', enable);
    
    // Clear existing rules first
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = existingRules.map(rule => rule.id);
    
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      });
    }
    
    if (enable) {
      const { blocklist } = await chrome.storage.local.get('blocklist');
      console.log('Blocklist:', blocklist);
      
      if (!blocklist || blocklist.length === 0) {
        console.warn('No sites in blocklist');
        return;
      }
      
      const rules = blocklist.map((domain, index) => {
        // Handle different domain formats
        let urlFilter;
        if (domain.includes('/')) {
          // For domains with paths like github.com/copilot
          urlFilter = `*://${domain}*`;
        } else {
          // For simple domains
          urlFilter = `*://${domain}/*`;
        }
        
        return {
          id: index + 1,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: urlFilter,
            resourceTypes: ['main_frame']
          }
        };
      });
      
      console.log('Adding blocking rules:', rules);
      
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });
      
      console.log('Blocking rules added successfully');
    } else {
      console.log('All blocking rules removed');
    }
  } catch (error) {
    console.error('Error updating blocking rules:', error);
    // Don't throw error, just log it to prevent popup failures
  }
}

async function updateBlocklist(newBlocklist) {
  await chrome.storage.local.set({ blocklist: newBlocklist });
  
  // If currently blocking, update the rules
  const { isBlocking } = await chrome.storage.local.get('isBlocking');
  if (isBlocking) {
    await updateBlockingRules(true);
  }
}