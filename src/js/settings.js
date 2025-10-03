// Bot or Not Settings Controller
class SettingsManager {
  constructor() {
    this.defaultSettings = {
      autoScan: true,
      showOrganic: true,
      // Detection thresholds (calibrated for test.md actual measurements)
      cartoonThreshold: 330,    // Below this = Cartoon (avg CGI=274, max=323)
      cgiColorThreshold: 480,   // Below this + smooth gradient = CGI (neonStreet=471)
      cgiGradientThreshold: 38, // Above this = CGI smoothness (CGI avg=50%, organic=26%)
      filterGradientThreshold: 55, // Above this = Heavy filter
      // Performance
      samplingDensity: 50,      // Balance of speed and accuracy (~2500 pixels)
      colorQuantization: 16     // 16 levels per channel (4096 max colors)
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
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

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
      this.showNotification('✓ Settings saved', 'success');

      // Notify all tabs to reload settings
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated', settings: this.settings }).catch(() => {});
        });
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showNotification('✗ Save failed', 'error');
    }
  }

  setupEventListeners() {
    // Save button
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset button
    document.getElementById('reset-settings').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.settings = { ...this.defaultSettings };
        this.saveSettings();
        this.updateUI();
      }
    });

    // Checkboxes
    document.getElementById('auto-scan').addEventListener('change', (e) => {
      this.settings.autoScan = e.target.checked;
    });

    document.getElementById('show-organic').addEventListener('change', (e) => {
      this.settings.showOrganic = e.target.checked;
    });

    // Sliders with live value update
    this.setupSlider('cartoon-threshold', 'cartoon-threshold-value', 'cartoonThreshold');
    this.setupSlider('cgi-color-threshold', 'cgi-color-value', 'cgiColorThreshold');
    this.setupSlider('cgi-gradient-threshold', 'cgi-gradient-value', 'cgiGradientThreshold');
    this.setupSlider('filter-gradient-threshold', 'filter-gradient-value', 'filterGradientThreshold');
    this.setupSlider('sampling-density', 'sampling-value', 'samplingDensity');
    this.setupSlider('color-quantization', 'quantization-value', 'colorQuantization');
  }

  setupSlider(sliderId, valueId, settingKey) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueId);

    slider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      this.settings[settingKey] = value;
      valueDisplay.textContent = value;
    });
  }

  updateUI() {
    // Checkboxes
    document.getElementById('auto-scan').checked = this.settings.autoScan;
    document.getElementById('show-organic').checked = this.settings.showOrganic;

    // Sliders
    this.updateSlider('cartoon-threshold', 'cartoon-threshold-value', this.settings.cartoonThreshold);
    this.updateSlider('cgi-color-threshold', 'cgi-color-value', this.settings.cgiColorThreshold);
    this.updateSlider('cgi-gradient-threshold', 'cgi-gradient-value', this.settings.cgiGradientThreshold);
    this.updateSlider('filter-gradient-threshold', 'filter-gradient-value', this.settings.filterGradientThreshold);
    this.updateSlider('sampling-density', 'sampling-value', this.settings.samplingDensity);
    this.updateSlider('color-quantization', 'quantization-value', this.settings.colorQuantization);
  }

  updateSlider(sliderId, valueId, value) {
    document.getElementById(sliderId).value = value;
    document.getElementById(valueId).textContent = value;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '10px 16px',
      borderRadius: '6px',
      color: 'white',
      fontWeight: '500',
      fontSize: '14px',
      zIndex: '10000',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s ease',
      backgroundColor: type === 'success' ? '#10b981' : '#ef4444'
    });

    document.body.appendChild(notification);
    setTimeout(() => { notification.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new SettingsManager();
});
