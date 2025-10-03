// Bot or Not Content Script
class BotOrNotExtension {
  constructor() {
        this.analyzer = null;
        this.config = {
            minImageSize: 100,
            badgeThreshold: 128,
            autoScan: true,
            showIcons: true,
            debounceDelay: 300,
            // Detection thresholds (calibrated for test.md actual measurements)
            cartoonThreshold: 330,    // Below this = Cartoon (avg CGI=274, max=323)
            cgiColorThreshold: 480,   // Below this + smooth gradient = CGI (neonStreet=471)
            cgiGradientThreshold: 38, // Above this = CGI smoothness (CGI avg=50%, organic=26%)
            filterGradientThreshold: 55, // Above this = Heavy filter
            // Performance
            samplingDensity: 50,      // Balance of speed and accuracy (~2500 pixels)
            colorQuantization: 16     // 16 levels per channel (4096 max colors)
        };
        this.analysisQueue = [];
        this.isProcessingQueue = false;
        this.init();
  }

  async init() {
        await this.loadSettings();
        this.loadIconStyles();
        this.setupComponents();
        this.setupMessageListener();
        this.startAutoScan();
    }

    async loadSettings() {
        try {
            // Load from chrome.storage.sync
            const result = await chrome.storage.sync.get([
                'autoScan', 'showOrganic', 'cartoonThreshold', 'cgiColorThreshold',
                'cgiGradientThreshold', 'filterGradientThreshold',
                'samplingDensity', 'colorQuantization'
            ]);

            if (Object.keys(result).length > 0) {
                this.config = { ...this.config, ...result };
            }
        } catch (error) {
            console.warn('Failed to load settings, using defaults:', error);
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
                    element,
                    this.config // Pass config to analyzer
                );
                await this.storeAnalysis(message.srcUrl, analysis);
                this.openModal(message.srcUrl);
            } else if (message.action === 'settingsUpdated') {
                // Reload settings when updated from settings page
                this.config = { ...this.config, ...message.settings };
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

        // Bail early if we cannot reliably determine the image origin
        if (!this.canDetermineOrigin(img.src)) return;

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

    // Determine if the image origin can be reliably resolved
    canDetermineOrigin(srcUrl) {
        try {
            const url = new URL(srcUrl, document.baseURI);
            // Disallow data/blob/about URLs entirely
            if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return false;
            // Opaque origin (e.g., cross-origin without origin) except allow file:// pages for local testing
            if (url.origin === 'null' && window.location.protocol !== 'file:') return false;
            return true;
        } catch (_) {
            return false;
        }
    }

    async analyzeAndStore(img) {
        this.analysisQueue.push(img);
        this.processAnalysisQueue();
    }

    async processAnalysisQueue() {
        if (this.isProcessingQueue || this.analysisQueue.length === 0) {
            return;
        }
        this.isProcessingQueue = true;
        const img = this.analysisQueue.shift();

        try {
            const analysis = await this.analyzer.analyzeMedia(img.src, 'image', img);
            await this.storeAnalysis(img.src, analysis);
            this.updateBadgeFromStorage(img.src);
        } catch (error) {
            const errorAnalysis = { confidence: 'error', error: error.message, isAI: false };
            await this.storeAnalysis(img.src, errorAnalysis);
            this.updateBadgeFromStorage(img.src);
        } finally {
            this.isProcessingQueue = false;
            this.processAnalysisQueue();
        }
    }

    addBadge(img, analysis) {
        const badge = document.createElement('div');
        badge.className = 'bot-or-not-icon';
        badge.dataset.srcUrl = img.src;

        // Create wrapper for image if needed (to avoid layout shifts)
        const wrapper = this.ensureImageWrapper(img);
        wrapper.appendChild(badge);

        if (analysis) {
            this.updateBadgeDisplay(badge, analysis);
        } else {
            badge.dataset.loading = 'true';
            if (chrome?.runtime?.id) {
                badge.innerHTML = `<img src="${chrome.runtime.getURL('assets/icons/analyzing.png')}" alt="Analyzing..." />`;
            } else {
                badge.textContent = '…';
                badge.title = 'Analyzing';
            }
        }

        this.attachClickHandler(badge, img.src);
    }

    ensureImageWrapper(img) {
        // If image already has a wrapper, return it
        const existingWrapper = img.parentElement;
        if (existingWrapper?.classList.contains('bot-or-not-wrapper')) {
            return existingWrapper;
        }

        // Check if parent is already positioned (can serve as wrapper)
        const parentStyle = window.getComputedStyle(existingWrapper);
        if (parentStyle.position !== 'static' && parentStyle.position !== '') {
            // Parent is already positioned, add wrapper class to track it
            existingWrapper.classList.add('bot-or-not-wrapper');
            return existingWrapper;
        }

        // Create minimal wrapper only if absolutely necessary
        const wrapper = document.createElement('span');
        wrapper.className = 'bot-or-not-wrapper';
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative';

        // Preserve image's display characteristics
        const imgStyle = window.getComputedStyle(img);
        if (imgStyle.display === 'block') {
            wrapper.style.display = 'block';
        }

        img.parentElement.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        return wrapper;
    }

    updateBadgeDisplay(badge, analysis) {
        badge.dataset.loading = 'false';
        badge.dataset.confidence = analysis.confidence || 'none';
        badge.dataset.isAi = analysis.isAI ? 'true' : 'false';
        badge.dataset.contentType = analysis.contentType || 'unknown';
        badge.className = `bot-or-not-icon confidence-${analysis.confidence}`;

        let iconPath, altText, emoji;

        if (analysis.confidence === 'error') {
            iconPath = 'assets/icons/icon32.png';
            altText = 'Error';
            emoji = '❌';
            badge.title = `Analysis Error: ${analysis.error || 'Unknown error'}`;
        } else {
            // Select icon based on content type
            switch (analysis.contentType) {
                case 'ai':
                    iconPath = 'assets/icons/bot.png';
                    altText = 'AI Generated';
                    emoji = '🤖';
                    badge.title = `AI Detected (${analysis.detectedTool || 'Unknown Tool'})`;
                    break;
                case 'cartoon':
                    iconPath = 'assets/icons/bot.png';
                    altText = 'Cartoon/Animation';
                    emoji = '🎨';
                    badge.title = `Cartoon/Animation Detected`;
                    break;
                case 'cgi':
                    iconPath = 'assets/icons/cgi.png';
                    altText = 'CGI/3D Render';
                    emoji = '✨';
                    badge.title = `CGI/3D Render Detected`;
                    break;
                case 'filtered':
                    iconPath = 'assets/icons/cgi.png';
                    altText = 'Filtered Photo';
                    emoji = '🎭';
                    badge.title = `Photo Filter Detected`;
                    break;
                case 'organic':
                    iconPath = 'assets/icons/organic.png';
                    altText = 'Organic Photo';
                    emoji = '📷';
                    badge.title = 'Organic Photo';
                    break;
                default:
                    iconPath = 'assets/icons/icon32.png';
                    altText = 'Unknown';
                    emoji = '❓';
                    badge.title = 'Analysis Incomplete';
            }
        }

        if (chrome?.runtime?.id) {
            badge.innerHTML = `<img src="${chrome.runtime.getURL(iconPath)}" alt="${altText}" />`;
        } else {
            // Fallback: use emoji
            badge.textContent = emoji;
            badge.style.fontSize = '24px';
        }
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
            
            
            this.openModal(srcUrl);
        };
        badge.addEventListener('click', clickHandler);
    }

    async openModal(srcUrl) {
        try {
            // Check if extension context is still valid
            if (!chrome.runtime?.id) {
                // Minimal inline modal fallback
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.dataset.botOrNotModal = 'true';
                modal.dataset.srcUrl = srcUrl;
                const analysis = await this.getStoredAnalysis(srcUrl);
                const title = analysis?.isAI ? 'AI Detected' : 'Organic Content';
                const tool = analysis?.detectedTool ? ` (${analysis.detectedTool})` : '';
                modal.innerHTML = `
<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;">
  <div style="background:#111;color:#eee;padding:16px 20px;border-radius:10px;min-width:280px;max-width:90vw;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong>${title}${tool}</strong>
      <button data-close style="background:#333;color:#eee;border:0;border-radius:6px;padding:4px 8px;cursor:pointer;">Close</button>
    </div>
    <div style="font-size:12px;line-height:1.4;white-space:pre-wrap;word-break:break-word;">
      ${analysis ? (analysis.details || []).join('\n') : 'No stored details found.'}
    </div>
  </div>
</div>`;
                document.body.appendChild(modal);
                this.setupModalEventListeners(modal);
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

            // Populate the modal with data
            this.populateModal(modal, srcUrl);

            // Setup event listeners
            this.setupModalEventListeners(modal);

            // Trigger animation
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        } catch (error) {
            // Modal failed to open
        }
    }

    loadIconStyles() {
        if (document.querySelector('link[data-bot-or-not-icon-styles]')) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome?.runtime?.id ? chrome.runtime.getURL('src/styles/icon.css') : 'src/styles/icon.css';
        link.dataset.botOrNotIconStyles = 'true';
        document.head.appendChild(link);
    }

    loadModalStyles() {
        if (document.querySelector('link[data-bot-or-not-modal-styles]')) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome?.runtime?.id ? chrome.runtime.getURL('src/styles/modal.css') : 'src/styles/modal.css';
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

    async populateModal(modal, srcUrl) {
        const analysis = await this.getStoredAnalysis(srcUrl);
        if (!analysis) {
            modal.querySelector('#result-text').textContent = '❌ No analysis data found';
            return;
        }

        // 1. Main Result Card
        const resultText = modal.querySelector('#result-text');
        let result, emoji, className;

        switch (analysis.contentType) {
            case 'ai':
                emoji = '🤖';
                result = `AI Generated (${analysis.detectedTool || 'Unknown Tool'})`;
                className = 'text-danger';
                break;
            case 'cartoon':
                emoji = '🎨';
                result = 'Cartoon/Animation';
                className = 'text-danger';
                break;
            case 'cgi':
                emoji = '✨';
                result = 'CGI/3D Render';
                className = 'text-danger';
                break;
            case 'filtered':
                emoji = '🎭';
                result = 'Filtered Photo';
                className = 'text-warning';
                break;
            case 'organic':
                emoji = '📷';
                result = 'Organic Photo';
                className = 'text-success';
                break;
            default:
                emoji = '❓';
                result = 'Unknown';
                className = 'text-muted';
        }

        resultText.textContent = `${emoji} ${result}`;
        resultText.className = className;
 
         // Summary Section
         const summarySection = modal.querySelector('#summary-section');
         const summaryMetrics = modal.querySelector('#summary-metrics');
         let metricsHtml = [];

         if (analysis.confidence) {
             metricsHtml.push(`<div class="metric"><span class="metric-label">Confidence:</span> <span class="metric-value">${analysis.confidence}</span></div>`);
         }
         if (analysis.method) {
             metricsHtml.push(`<div class="metric"><span class="metric-label">Detection Method:</span> <span class="metric-value">${analysis.method}</span></div>`);
         }

         // Add visual metrics if available
         if (analysis.cgiDetection?.metrics) {
             const colorCount = analysis.cgiDetection.metrics.uniqueColors;
             const gradientRatio = analysis.cgiDetection.metrics.gradientRatio;
             if (colorCount > 0) {
                 metricsHtml.push(`<div class="metric"><span class="metric-label">Color Count:</span> <span class="metric-value">${colorCount}</span></div>`);
             }
             if (gradientRatio > 0) {
                 metricsHtml.push(`<div class="metric"><span class="metric-label">Gradient Smoothness:</span> <span class="metric-value">${(gradientRatio * 100).toFixed(0)}%</span></div>`);
             }
         }

         if (summarySection) {
             if (metricsHtml.length > 0) {
                 summarySection.style.display = 'block';
                 if(summaryMetrics) summaryMetrics.innerHTML = metricsHtml.join('');
             } else {
                 summarySection.style.display = 'none';
             }
         } else if (summaryMetrics) {
             summaryMetrics.innerHTML = metricsHtml.join('');
         }
 
         // 4. Image Preview
         const analyzedImage = modal.querySelector('#analyzed-image');
        analyzedImage.src = srcUrl;
        analyzedImage.style.display = 'block';

        // 5. Technical Details
        const detailsList = modal.querySelector('#details-list');
        let detailsHtml = `<li><b>File:</b> ${srcUrl.split('/').pop()}</li>`;
        detailsHtml += `<li><b>Classification:</b> ${result}</li>`;

        if (analysis.signatures?.length > 0) {
            detailsHtml += `<li><b>AI Signatures:</b> ${analysis.signatures.map(s => s.tool).join(', ')}</li>`;
        }

        if (analysis.cgiDetection?.metrics) {
            detailsHtml += `<li><b>Visual Analysis:</b> ${analysis.cgiDetection.metrics.uniqueColors} colors, ${(analysis.cgiDetection.metrics.gradientRatio * 100).toFixed(0)}% smooth gradients</li>`;
        }

        if (analysis.details?.length > 0) {
            detailsHtml += `<li><b>Details:</b> ${analysis.details.join(' • ')}</li>`;
        }

        detailsList.innerHTML = detailsHtml;

        // 6. Setup Buttons
        const copyBtn = modal.querySelector('#copy-btn');
        copyBtn.onclick = () => {
            const summaryText = this.createSummaryTextForModal(analysis, srcUrl);
            navigator.clipboard.writeText(summaryText).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy & Close';
                    window.BotOrNotContent.closeModal();
                }, 500);
            });
        };
        modal.querySelector('#close-btn').onclick = () => window.BotOrNotContent.closeModal();
    }

    createSummaryTextForModal(analysis, srcUrl) {
        let summary = `Bot or Not Analysis\n==================\n`;
        summary += `File: ${srcUrl.split('/').pop()}\n`;

        // Content type result
        let result;
        switch (analysis.contentType) {
            case 'ai': result = `AI Generated (${analysis.detectedTool || 'Unknown Tool'})`; break;
            case 'cartoon': result = 'Cartoon/Animation'; break;
            case 'cgi': result = 'CGI/3D Render'; break;
            case 'filtered': result = 'Filtered Photo'; break;
            case 'organic': result = 'Organic Photo'; break;
            default: result = 'Unknown';
        }
        summary += `Classification: ${result}\n`;

        if (analysis.confidence) summary += `Confidence: ${analysis.confidence}\n`;
        if (analysis.method) summary += `Detection Method: ${analysis.method}\n`;

        if (analysis.signatures?.length > 0) {
            summary += `\nAI Signatures Found:\n`;
            analysis.signatures.forEach(sig => {
                summary += `- ${sig.signature} (${sig.tool})\n`;
            });
        }

        if (analysis.cgiDetection?.metrics) {
            summary += `\nVisual Analysis:\n`;
            summary += `- Color Count: ${analysis.cgiDetection.metrics.uniqueColors}\n`;
            summary += `- Gradient Smoothness: ${(analysis.cgiDetection.metrics.gradientRatio * 100).toFixed(0)}%\n`;
        }

        if (analysis.details?.length > 0) {
            summary += `\nAnalysis Details:\n`;
            analysis.details.forEach(detail => {
                summary += `- ${detail}\n`;
            });
        }

        return summary;
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
                // Fallback to localStorage
                const key = this.getStorageKey(srcUrl);
                const data = {
                    analysis,
                    timestamp: Date.now(),
                    pageUrl: window.location.href,
                    srcUrl
                };
                try {
                    localStorage.setItem(key, JSON.stringify(data));
                } catch (e) {}
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
            // Failed to store analysis
        }
    }

    async getStoredAnalysis(srcUrl) {
        try {
            // Check if extension context is valid
            if (!chrome.runtime?.id) {
                // Fallback to localStorage
                try {
                    const key = this.getStorageKey(srcUrl);
                    const raw = localStorage.getItem(key);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    return parsed?.analysis || null;
                } catch (e) {
                    return null;
                }
            }
            
            const key = this.getStorageKey(srcUrl);
            const result = await chrome.storage.local.get(key);
            return result[key]?.analysis || null;
        } catch (error) {
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

  async analyzeMedia(srcUrl, mediaType, element = null, config = {}) {
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

      // CGI analysis for images with configurable settings
      let cgiAnalysis = null;
      if (mediaType === 'image' && element?.tagName === 'IMG') {
        try {
          cgiAnalysis = await this.cgiDetector.analyzeImage(element, config);
         } catch (cgiError) {
           // CGI analysis failed
         }
      }

      return this.buildAnalysisResult(headerAnalysis, cgiAnalysis, srcUrl, mediaType, config);

    } catch (error) {
      return this.createErrorResult(error, srcUrl);
    }
  }

    buildAnalysisResult(headerAnalysis, cgiAnalysis, srcUrl, mediaType, config = {}) {
      let isAI = false; // TRUE only for signature-detected AI
      let confidence = 'none';
      let detectedTool = null;
      let method = 'header-parser';
      let contentType = 'unknown';
      const details = [...(headerAnalysis.details || [])];

      // Use configurable thresholds with fallback to defaults
      const cartoonThreshold = config.cartoonThreshold || 120;
      const cgiColorThreshold = config.cgiColorThreshold || 200;
      const cgiGradientThreshold = (config.cgiGradientThreshold || 50) / 100; // Convert % to ratio
      const filterGradientThreshold = (config.filterGradientThreshold || 65) / 100; // Convert % to ratio

      // Priority 1: Check for AI signatures in headers (ONLY TRUE AI DETECTION)
      if (headerAnalysis.signatures?.length > 0) {
        isAI = true;
        confidence = 'high';
        detectedTool = headerAnalysis.signatures[0]?.tool;
        method = 'signature-detection';
        contentType = 'ai';
        details.push(`AI tool signature found: ${headerAnalysis.signatures.map(s => s.signature).join(', ')}`);
      }
      // Priority 2: If no signatures, analyze visual characteristics
      else if (cgiAnalysis && !cgiAnalysis.corsBlocked) {
        const colorCount = cgiAnalysis.metrics?.uniqueColors || 0;
        const gradientRatio = cgiAnalysis.metrics?.gradientRatio || 0;

        // Add color analysis to details
        details.push(`Color analysis: ${colorCount} unique colors, ${(gradientRatio * 100).toFixed(0)}% smooth gradients`);

        // 2A: Very limited palette → Cartoon/Animation
        if (colorCount < cartoonThreshold) {
          confidence = 'high';
          detectedTool = 'Cartoon/Animation';
          method = 'color-palette-analysis';
          contentType = 'cartoon';
          details.push(`Limited color palette indicates cartoon/animation`);
        }
        // 2B: Low-medium colors with smooth gradients → CGI
        else if (colorCount >= cartoonThreshold && colorCount < cgiColorThreshold && gradientRatio > cgiGradientThreshold) {
          confidence = 'high';
          detectedTool = 'CGI/3D Render';
          method = 'gradient-analysis';
          contentType = 'cgi';
          details.push(`Unrealistic smooth gradients with limited colors indicates CGI`);
        }
        // 2C: Medium colors with very smooth gradients → CGI or heavy filter
        else if (colorCount >= cgiColorThreshold && gradientRatio > filterGradientThreshold) {
          confidence = 'medium';
          detectedTool = 'CGI or Heavy Filter';
          method = 'gradient-analysis';
          contentType = 'filtered';
          details.push(`Very smooth gradients suggest CGI or heavy photo filtering`);
        }
         // 2D: Check minimum color threshold for organic classification
         else if (colorCount >= 300) {
           confidence = 'low';
           detectedTool = null;
           method = 'visual-analysis';
           contentType = 'organic';
           details.push(`Natural color distribution suggests organic photo`);
         }
         // 2E: Below 300 colors cannot be organic
         else {
           confidence = 'medium';
           detectedTool = 'CGI/Digital Art';
           method = 'color-threshold-analysis';
           contentType = 'cgi';
           details.push(`Low color count (${colorCount}) indicates CGI or digital art`);
         }
      }
      // Priority 3: CORS blocked or analysis failed
      else {
        confidence = 'none';
        method = cgiAnalysis?.corsBlocked ? 'blocked-by-cors' : 'no-analysis';
        contentType = 'unknown';
        if (cgiAnalysis?.corsBlocked) {
          details.push('Analysis limited by cross-origin restrictions');
        }
      }

      // Enrich CGI analysis
      const enrichedCGIAnalysis = cgiAnalysis ? {
        ...cgiAnalysis,
        metrics: {
          uniqueColors: cgiAnalysis.metrics?.uniqueColors || 0,
          gradientRatio: cgiAnalysis.metrics?.gradientRatio || 0,
          ...cgiAnalysis.metrics
        },
        filtersDetected: cgiAnalysis.filtersDetected || []
      } : null;

      return {
        confidence,
        isAI, // Only true for signature-detected AI
        detectedTool,
        method,
        details,
        signatures: headerAnalysis.signatures || [],
        fileInfo: { url: srcUrl, type: mediaType },
        cgiDetection: enrichedCGIAnalysis,
        contentType
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
        cgiDetection: null,
        contentType: 'error'
      };
    }
  }


// Global API is set up in setupModalEventListeners method when modal is created

// Global error handler for extension context issues
window.addEventListener('error', (event) => {
    if (event.error?.message?.includes('Extension context invalidated')) {
        event.preventDefault();
    }
});

// Initialize extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
        try {
            new BotOrNotExtension();
        } catch (error) {
            // Failed to initialize extension
        }
  });
} else {
    try {
        new BotOrNotExtension();
    } catch (error) {
        // Failed to initialize extension
    }
}