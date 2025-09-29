// Bot or Not Content Script - Simple Offline Database Approach
class BotOrNotExtension {
  constructor() {
        this.analyzer = null;
        this.config = {
            minImageSize: 100,
            badgeThreshold: 128,
            autoScan: true,
            showIcons: true,
            debounceDelay: 300,
            enableCGIDetection: true,
            enableHeaderParsing: true
        };
        this.init();
  }

  async init() {
        await this.loadConfig();
        this.loadIconStyles();
        this.setupComponents();
        this.setupMessageListener();
        this.startAutoScan();
    }

    async loadConfig() {
        try {
            // Check if extension context is valid
            if (!chrome.runtime?.id) {
                console.warn('Extension context invalidated during config load');
                return;
            }
            
            const response = await fetch(chrome.runtime.getURL('config.json'));
            this.config = await response.json();
        } catch (error) {
            console.warn('Config not loaded, using defaults:', error);
        }
    }

    setupComponents() {
        this.analyzer = new BotOrNotAnalyzer();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
            if (message.action === 'analyzeMedia') {
                const element = this.findImageElement(message.srcUrl);
                const analysis = await this.analyzer.analyzeMedia(
                    message.srcUrl,
                    message.mediaType,
                    element
                );
                await this.storeAnalysis(message.srcUrl, analysis);
                this.openModal(message.srcUrl);
            }
        });
    }

    startAutoScan() {
        if (!this.config.autoScan) return;

        const scanImages = () => {
            const images = document.querySelectorAll('img');
            images.forEach(img => this.processImage(img));
        };

        scanImages();

        const observer = new MutationObserver(() => {
            this.debounce(() => {
                scanImages();
                this.cleanupBadges();
            }, this.config.debounceDelay)();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    async processImage(img) {
        if (!this.config.showIcons) return;
        if (!img.src) return;
        if (img.dataset.botOrNotProcessed) return;

        const rect = img.getBoundingClientRect();
        if (rect.width < this.config.badgeThreshold || rect.height < this.config.badgeThreshold) return;
        if (img.closest('[data-bot-or-not-modal]')) return;

        img.dataset.botOrNotProcessed = 'true';

        // Check if analysis already exists in database
        const existingAnalysis = await this.getStoredAnalysis(img.src);
        if (existingAnalysis) {
            this.addBadge(img, existingAnalysis);
        } else {
            this.addBadge(img, null); // Will show analyzing icon
            this.analyzeAndStore(img);
        }
    }

    async analyzeAndStore(img) {
        try {
            const analysis = await this.analyzer.analyzeMedia(img.src, 'image', img);
            await this.storeAnalysis(img.src, analysis);
            this.updateBadgeFromStorage(img.src);
        } catch (error) {
            const errorAnalysis = { confidence: 'error', error: error.message, isAI: false };
            await this.storeAnalysis(img.src, errorAnalysis);
            this.updateBadgeFromStorage(img.src);
        }
    }

    addBadge(img, analysis) {
        const badge = document.createElement('div');
        badge.className = 'bot-or-not-icon';
        badge.dataset.srcUrl = img.src;

        // Position badge
        const computedStyle = window.getComputedStyle(img);
        if (computedStyle.position === 'static') {
            img.style.position = 'relative';
        }
        img.parentElement.appendChild(badge);

        if (analysis) {
            this.updateBadgeDisplay(badge, analysis);
        } else {
            badge.dataset.loading = 'true';
            badge.innerHTML = `<img src="${chrome.runtime.getURL('assets/icons/analyzing.png')}" alt="Analyzing..." style="width: 28px; height: 28px;" />`;
        }

        this.attachClickHandler(badge, img.src);
    }

    updateBadgeDisplay(badge, analysis) {
        badge.dataset.loading = 'false';
        badge.dataset.confidence = analysis.confidence || 'none';
        badge.dataset.isAi = analysis.isAI ? 'true' : 'false';
        badge.className = `bot-or-not-icon confidence-${analysis.confidence}`;

        let iconPath, altText;
        if (analysis.confidence === 'error') {
            iconPath = 'assets/icons/icon32.png';
            altText = 'Error';
            badge.title = `Analysis Error: ${analysis.error || 'Unknown error'}`;
        } else {
            iconPath = analysis.isAI ? 'assets/icons/bot.png' : 'assets/icons/organic.png';
            altText = analysis.isAI ? 'AI' : 'Organic';
            badge.title = analysis.isAI ?
                `AI Detected: ${analysis.aiScore || 0}% confidence${analysis.detectedTool ? ` (${analysis.detectedTool})` : ''}` :
                'Organic Content';
        }
        badge.innerHTML = `<img src="${chrome.runtime.getURL(iconPath)}" alt="${altText}" style="width: 28px; height: 28px;" />`;
    }

    async updateBadgeFromStorage(srcUrl) {
        const analysis = await this.getStoredAnalysis(srcUrl);
        if (analysis) {
            const badge = document.querySelector(`.bot-or-not-icon[data-src-url="${srcUrl}"]`);
            if (badge) {
                this.updateBadgeDisplay(badge, analysis);
            }
        }
    }

    attachClickHandler(badge, srcUrl) {
        const clickHandler = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Get and log the stored analysis data for this image
            const storedAnalysis = await this.getStoredAnalysis(srcUrl);
            console.log('=== BADGE CLICKED ===');
            console.log('Image:', srcUrl.substring(srcUrl.lastIndexOf('/') + 1));
            console.log('Stored Data:', storedAnalysis ? {
                result: storedAnalysis.isAI ? `AI (${storedAnalysis.detectedTool || 'Unknown tool'})` : 'Organic',
                confidence: storedAnalysis.confidence,
                method: storedAnalysis.method,
                aiScore: storedAnalysis.aiScore,
                signatures: storedAnalysis.signatures?.length || 0,
                colors: storedAnalysis.cgiDetection?.metrics?.uniqueColors || 'N/A',
                gradientRatio: storedAnalysis.cgiDetection?.metrics?.gradientRatio || 'N/A'
            } : 'No data found');
            console.log('Storage Key:', this.getStorageKey(srcUrl));
            console.log('====================');
            
            this.openModal(srcUrl);
        };
        badge.addEventListener('click', clickHandler);
    }

    async openModal(srcUrl) {
        try {
            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                console.warn('Extension context invalidated, cannot open modal');
                return;
            }

            // Load modal template
            const response = await fetch(chrome.runtime.getURL('src/html/modal.html'));
            if (!response.ok) {
                throw new Error(`Failed to load modal template: ${response.status}`);
            }
            const modalTemplate = await response.text();

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.dataset.botOrNotModal = 'true';
            modal.dataset.srcUrl = srcUrl;
            modal.innerHTML = modalTemplate;

            // Load modal styles
            this.loadModalStyles();

            // Add to page
            document.body.appendChild(modal);

            // Setup event listeners
            this.setupModalEventListeners(modal);

            // Trigger animation
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        } catch (error) {
            console.error('Failed to open modal:', error);
            if (error.message.includes('Extension context invalidated')) {
                console.warn('Extension was reloaded. Please refresh the page to use the extension.');
            }
        }
    }

    loadIconStyles() {
        if (document.querySelector('link[data-bot-or-not-icon-styles]')) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('src/styles/icon.css');
        link.dataset.botOrNotIconStyles = 'true';
        document.head.appendChild(link);
    }

    loadModalStyles() {
        if (document.querySelector('link[data-bot-or-not-modal-styles]')) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('src/styles/modal.css');
        link.dataset.botOrNotModalStyles = 'true';
        document.head.appendChild(link);
    }

    setupModalEventListeners(modal) {
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.remove();
                }
            }, 200);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Make close function globally accessible
        window.BotOrNotContent = window.BotOrNotContent || {};
        window.BotOrNotContent.closeModal = closeModal;
    }

    // Offline Database Functions
    getStorageKey(srcUrl) {
        const pageUrl = window.location.href.split('#')[0]; // Remove hash
        return `bot-or-not-analysis-${pageUrl}-${srcUrl}`;
    }

    async storeAnalysis(srcUrl, analysis) {
        try {
            // Check if extension context is valid
            if (!chrome.runtime?.id) {
                console.warn('Extension context invalidated, cannot store analysis');
                return;
            }
            
            const key = this.getStorageKey(srcUrl);
            const data = {
                analysis,
                timestamp: Date.now(),
                pageUrl: window.location.href,
                srcUrl
            };
            
            
            await chrome.storage.local.set({ [key]: data });
        } catch (error) {
            console.error('Failed to store analysis:', error);
        }
    }

    async getStoredAnalysis(srcUrl) {
        try {
            // Check if extension context is valid
            if (!chrome.runtime?.id) {
                console.warn('Extension context invalidated, cannot get stored analysis');
                return null;
            }
            
            const key = this.getStorageKey(srcUrl);
            const result = await chrome.storage.local.get(key);
            return result[key]?.analysis || null;
        } catch (error) {
            console.error('Failed to get stored analysis:', error);
            return null;
        }
    }

    cleanupBadges() {
        const badges = document.querySelectorAll('.bot-or-not-icon');
        badges.forEach(badge => {
            const srcUrl = badge.dataset.srcUrl;
            const img = this.findImageElement(srcUrl);
            if (!img || !document.body.contains(img) || img.offsetParent === null) {
                badge.remove();
            }
        });
    }

    findImageElement(srcUrl) {
        const images = document.querySelectorAll('img');
        for (const img of images) {
            if (img.src === srcUrl || img.currentSrc === srcUrl) {
                return img;
      }
    }
    return null;
  }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Analyzer class for AI detection
class BotOrNotAnalyzer {
  constructor() {
    // Initialize components
    this.initPromise = this.init();
  }
  
  async init() {
    // Wait for dependencies to load
    if (typeof AISignatureDetector === 'undefined') {
      await this.loadScript('src/js/aiSignatureDetector.js');
    }
    if (typeof CGIDetector === 'undefined') {
      await this.loadScript('src/js/cgiDetector.js');
    }
    
    this.aiSignatureDetector = new AISignatureDetector();
    this.cgiDetector = new CGIDetector();
  }
  
  async loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async analyzeMedia(srcUrl, mediaType, element = null) {
    try {
      // Ensure analyzer is initialized
      await this.initPromise;
      
      // AI signature detection
      const signatureResult = await this.aiSignatureDetector.detectAISignatures(srcUrl);

      // Convert to expected format for backward compatibility
      const headerAnalysis = {
        signatures: signatureResult.signatures || [],
        details: signatureResult.details || [],
        fileType: signatureResult.fileType
      };

      // CGI analysis for images
      let cgiAnalysis = null;
      if (mediaType === 'image' && element?.tagName === 'IMG') {
        try {
          cgiAnalysis = await this.cgiDetector.analyzeImage(element);
        } catch (cgiError) {
          console.warn('CGI analysis failed:', cgiError.message);
        }
      }

      return this.buildAnalysisResult(headerAnalysis, cgiAnalysis, srcUrl, mediaType);

    } catch (error) {
      return this.createErrorResult(error, srcUrl);
    }
  }

    buildAnalysisResult(headerAnalysis, cgiAnalysis, srcUrl, mediaType) {
      let isAI = false;
      let confidence = 'none';
      let detectedTool = null;
      let method = 'header-parser';
      let aiScore = 0;
      const details = [...(headerAnalysis.details || [])];

      // Priority 1: Check for AI signatures in headers first
      if (headerAnalysis.signatures?.length > 0) {
        isAI = true;
        confidence = 'high';
        detectedTool = headerAnalysis.signatures[0]?.tool;
        method = 'signature-detection';
        aiScore = 95;
        details.push(`AI signatures found: ${headerAnalysis.signatures.map(s => s.signature).join(', ')}`);
      }
      // Priority 2: If no signatures found, check CGI detection
      else if (cgiAnalysis && !cgiAnalysis.corsBlocked) {
        if (cgiAnalysis.isCGI) {
          isAI = true;
          confidence = 'high';
          detectedTool = 'CGI/Digital Art';
          method = 'cgi-detection';
          aiScore = cgiAnalysis.confidence || 90;
          details.push(`CGI detected: ${cgiAnalysis.reasons.join(', ')}`);
        } else if (cgiAnalysis.isEdited) {
          isAI = true;
          confidence = 'medium';
          detectedTool = 'Photo Editing';
          method = 'editing-detection';
          aiScore = cgiAnalysis.confidence || 70;
          details.push(`Photo editing detected: ${cgiAnalysis.reasons.join(', ')}`);
        } else {
          // Organic image - but still show CGI analysis results
          confidence = 'none';
          method = 'visual-analysis';
          details.push('Visual analysis suggests organic content');
        }
      }
      // Priority 3: If CORS blocked or no analysis possible
      else {
        confidence = 'none';
        method = cgiAnalysis?.corsBlocked ? 'blocked-by-cors' : 'no-analysis';
        if (cgiAnalysis?.corsBlocked) {
          details.push('Analysis limited by cross-origin restrictions');
        }
      }

      // Always include CGI analysis results if available, even for organic images
      const enrichedCGIAnalysis = cgiAnalysis ? {
        ...cgiAnalysis,
        // Ensure metrics are always present
        metrics: {
          uniqueColors: cgiAnalysis.metrics?.uniqueColors || 0,
          gradientRatio: cgiAnalysis.metrics?.gradientRatio || 0,
          ...cgiAnalysis.metrics
        },
        // Ensure filters detected is always an array
        filtersDetected: cgiAnalysis.filtersDetected || []
      } : null;

      return {
        confidence,
        isAI,
        detectedTool,
        method,
        details,
        signatures: headerAnalysis.signatures || [],
        fileInfo: { url: srcUrl, type: mediaType },
        aiScore,
        maxScore: 100,
        cgiDetection: enrichedCGIAnalysis
      };
    }

    createErrorResult(error, srcUrl) {
  return {
        confidence: 'error',
        isAI: false,
        detectedTool: null,
        method: 'error',
        details: [`Analysis failed: ${error.message}`],
        signatures: [],
        fileInfo: { url: srcUrl },
        aiScore: 0,
        maxScore: 100,
        cgiDetection: null
      };
    }
  }


// Global API is set up in setupModalEventListeners method when modal is created

// Global error handler for extension context issues
window.addEventListener('error', (event) => {
    if (event.error?.message?.includes('Extension context invalidated')) {
        console.warn('🔄 Extension context invalidated. Please refresh the page to use the Bot or Not extension.');
        // Optionally show a user-friendly notification
        event.preventDefault();
    }
});

// Initialize extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
        try {
            new BotOrNotExtension();
        } catch (error) {
            console.error('Failed to initialize Bot or Not extension:', error);
        }
  });
} else {
    try {
        new BotOrNotExtension();
    } catch (error) {
        console.error('Failed to initialize Bot or Not extension:', error);
    }
}