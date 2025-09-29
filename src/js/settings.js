// Bot or Not Settings Controller
// Handles settings interface and user preferences

class SettingsManager {
  constructor() {
    this.defaultSettings = {
      autoScan: true,
      showOrganic: true,
      signatureDetection: true,
      colorAnalysis: true,
      minImageSize: 100,
      confidenceThreshold: 70
    };
    
    this.stats = {
      imagesAnalyzed: 0,
      aiDetected: 0,
      organicDetected: 0
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(Object.keys(this.defaultSettings));
      this.settings = { ...this.defaultSettings, ...result };
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { ...this.defaultSettings };
    }
  }

  async loadStats() {
    try {
      const result = await chrome.storage.local.get(['stats']);
      this.stats = { ...this.stats, ...result.stats };
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
      this.showNotification('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  async saveStats() {
    try {
      await chrome.storage.local.set({ stats: this.stats });
    } catch (error) {
      console.error('Failed to save stats:', error);
    }
  }

  setupEventListeners() {
    // Save settings button
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset settings button
    document.getElementById('reset-settings').addEventListener('click', () => {
      this.resetSettings();
    });

    // Export data button
    document.getElementById('export-data').addEventListener('click', () => {
      this.exportData();
    });

    // Checkbox changes
    document.getElementById('auto-scan').addEventListener('change', (e) => {
      this.settings.autoScan = e.target.checked;
    });

    document.getElementById('show-organic').addEventListener('change', (e) => {
      this.settings.showOrganic = e.target.checked;
    });

    document.getElementById('signature-detection').addEventListener('change', (e) => {
      this.settings.signatureDetection = e.target.checked;
    });

    document.getElementById('color-analysis').addEventListener('change', (e) => {
      this.settings.colorAnalysis = e.target.checked;
    });

    // Number input changes
    document.getElementById('min-image-size').addEventListener('change', (e) => {
      this.settings.minImageSize = parseInt(e.target.value);
    });

    // Range input changes
    const confidenceSlider = document.getElementById('confidence-threshold');
    const confidenceValue = document.getElementById('confidence-value');
    
    confidenceSlider.addEventListener('input', (e) => {
      this.settings.confidenceThreshold = parseInt(e.target.value);
      confidenceValue.textContent = `${e.target.value}%`;
    });
  }

  updateUI() {
    // Update checkboxes
    document.getElementById('auto-scan').checked = this.settings.autoScan;
    document.getElementById('show-organic').checked = this.settings.showOrganic;
    document.getElementById('signature-detection').checked = this.settings.signatureDetection;
    document.getElementById('color-analysis').checked = this.settings.colorAnalysis;

    // Update number inputs
    document.getElementById('min-image-size').value = this.settings.minImageSize;

    // Update range input
    const confidenceSlider = document.getElementById('confidence-threshold');
    const confidenceValue = document.getElementById('confidence-value');
    confidenceSlider.value = this.settings.confidenceThreshold;
    confidenceValue.textContent = `${this.settings.confidenceThreshold}%`;

    // Update statistics
    document.getElementById('images-analyzed').textContent = this.stats.imagesAnalyzed;
    document.getElementById('ai-detected').textContent = this.stats.aiDetected;
    document.getElementById('organic-detected').textContent = this.stats.organicDetected;
  }

  async resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settings = { ...this.defaultSettings };
      await this.saveSettings();
      this.updateUI();
      this.showNotification('Settings reset to defaults', 'success');
    }
  }

  async exportData() {
    try {
      const data = {
        settings: this.settings,
        stats: this.stats,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `bot-or-not-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showNotification('Data exported successfully!', 'success');
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showNotification('Failed to export data', 'error');
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      borderRadius: '8px',
      color: 'white',
      fontWeight: '500',
      zIndex: '10000',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease',
      maxWidth: '300px',
      wordWrap: 'break-word'
    });

    // Set background color based on type
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    // Add to page
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Remove after delay
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Initialize settings manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});

// Listen for messages from content script to update stats
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    // Update stats in settings page if it's open
    const imagesAnalyzed = document.getElementById('images-analyzed');
    const aiDetected = document.getElementById('ai-detected');
    const organicDetected = document.getElementById('organic-detected');
    
    if (imagesAnalyzed) {
      imagesAnalyzed.textContent = message.stats.imagesAnalyzed || 0;
    }
    if (aiDetected) {
      aiDetected.textContent = message.stats.aiDetected || 0;
    }
    if (organicDetected) {
      organicDetected.textContent = message.stats.organicDetected || 0;
    }
  }
});
