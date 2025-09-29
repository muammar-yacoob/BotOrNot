// Bot or Not Extension Configuration
// Centralized settings and feature flags

export const CONFIG = {
  // Extension metadata
  EXTENSION_NAME: 'Bot or Not',
  VERSION: '1.0.0',
  
  // Feature flags
  FEATURES: {
    AI_DETECTION: true,
    CGI_ANALYSIS: true,
    COLOR_ANALYSIS: true,
    SIGNATURE_DETECTION: true,
    MODAL_INTERFACE: true
  },
  
  // Detection settings
  DETECTION: {
    MIN_IMAGE_SIZE: 100, // Minimum image size to analyze
    MAX_FILE_SIZE: 65536, // Maximum file size to analyze (64KB)
    CONFIDENCE_THRESHOLD: 70, // Minimum confidence for AI detection
    COLOR_THRESHOLD: 200 // Color count threshold for CGI detection
  },
  
  // UI settings
  UI: {
    ICON_SIZE: 48,
    MODAL_WIDTH: 500,
    MODAL_HEIGHT: 600,
    ANIMATION_DURATION: 300
  },
  
  // File paths
  PATHS: {
    SIGNATURES: 'src/signatures.json',
    MODAL_TEMPLATE: 'src/html/modal.html',
    MODAL_CSS: 'src/styles/modal.css'
  },
  
  // Platform detection
  PLATFORMS: {
    INSTAGRAM: ['instagram.com', 'cdninstagram.com'],
    TWITTER: ['twitter.com', 'x.com', 'twimg.com'],
    FACEBOOK: ['facebook.com', 'fbcdn.com', 'fbsbx.com'],
    TIKTOK: ['tiktok.com', 'tiktokcdn.com'],
    YOUTUBE: ['youtube.com', 'ytimg.com'],
    LINKEDIN: ['linkedin.com', 'licdn.com'],
    DISCORD: ['discord.com', 'discordapp.com'],
    REDDIT: ['reddit.com', 'redd.it']
  }
};

// Development settings
export const DEV_CONFIG = {
  DEBUG: false,
  LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
  MOCK_ANALYSIS: false // For testing without real analysis
};
