// Bot or Not Content Script - Clean Architecture
// Pure logic only - no hardcoded HTML, CSS, or platform-specific code

// Helper functions for modal
function getConfidenceColor(confidence) {
    const colors = {
        'high': '#e74c3c', 'medium': '#f39c12', 'low': '#3498db',
        'none': '#27ae60', 'blocked': '#9b59b6', 'error': '#95a5a6'
    };
    return colors[confidence] || '#95a5a6';
}

function getResultText(analysis) {
    if (analysis.confidence === 'blocked') return '🚫 Analysis Blocked (CORS)';
    if (analysis.confidence === 'error') return '❌ Analysis Failed';
    if (analysis.isAI) return `🤖 AI Generated (${analysis.confidence} confidence)`;
    return '👨‍🎨 Likely Human Created';
}

class BotOrNotExtension {
  constructor() {
        this.analyzer = null;
        this.config = null;
        this.init();
  }

  async init() {
        await this.loadConfig();
        this.analyzer = new BotOrNotAnalyzer();
        this.setupMessageListener();
        this.startAutoScan();
    }

    async loadConfig() {
        try {
            const response = await fetch(chrome.runtime.getURL('config.json'));
            this.config = await response.json();
        } catch (error) {
            console.warn('Config not loaded, using defaults:', error);
            this.config = {
                minImageSize: 100,
                badgeThreshold: 512,
                autoScan: true,
                showIcons: true,
                iconSize: '42px',
                debounceDelay: 300,
                enableCGIDetection: true,
                enableHeaderParsing: true
            };
        }
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
                this.showAnalysisModal(analysis, message.srcUrl);
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

    startAutoScan() {
        if (!this.config.autoScan) return;

        const scanImages = () => {
            const images = document.querySelectorAll('img');
            images.forEach(img => this.processImage(img));
        };

        // Initial scan
        scanImages();

        // Observe for new images
        const observer = new MutationObserver(() => {
            this.debounce(() => {
                scanImages();
                this.cleanupIcons();
            }, 300)();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    processImage(img) {
        if (this.shouldSkipImage(img)) return;
        if (img.dataset.botOrNotProcessed) return;

        img.dataset.botOrNotProcessed = 'true';

        if (this.config.showIcons) {
            this.addAnalysisIcon(img);
        }
    }

     shouldSkipImage(img) {
         if (!img.src) return true;

         const rect = img.getBoundingClientRect();
         // Only show badges on images >= badgeThreshold pixels
         const threshold = this.config?.badgeThreshold || 512;
         if (rect.width < threshold || rect.height < threshold) {
             return true;
         }

         // Skip if in modal
         if (img.closest('[data-bot-or-not-modal]')) return true;

         return false;
     }

     addAnalysisIcon(img) {
         const icon = document.createElement('div');
         icon.className = 'bot-or-not-icon';
         icon.dataset.srcUrl = img.src;
         icon.dataset.mediaType = 'image';
         icon.dataset.loading = 'true';

         // Add initial analyzing icon
         const iconSize = this.config?.iconSize || '42px';
         icon.innerHTML = `<img src="${chrome.runtime.getURL('assets/icons/analyzing.png')}" alt="Analyzing..." style="width: ${iconSize}; height: ${iconSize};" />`;

         // Ensure the image itself is relatively positioned for absolute icon placement
         // This is crucial for the icon to stay with the image during scroll
         const computedStyle = window.getComputedStyle(img);
         if (computedStyle.position === 'static') {
             img.style.position = 'relative';
         }
         
         // Position relative to the image's parent
         img.parentElement.appendChild(icon);

         // Start analysis
         this.analyzeAndUpdateIcon(icon, img);
     }


     async analyzeAndUpdateIcon(icon, img) {
         try {
             const analysis = await this.analyzer.analyzeMedia(img.src, 'image', img);
             this.updateIconState(icon, analysis);
             this.attachIconClickHandler(icon, analysis, img.src);
         } catch (error) {
             this.updateIconState(icon, { confidence: 'error', error: error.message });
         } finally {
             icon.dataset.loading = 'false';
         }
     }

     updateIconState(icon, analysis) {
         icon.dataset.confidence = analysis.confidence || 'none';
         icon.dataset.isAi = analysis.isAI ? 'true' : 'false';
         icon.dataset.score = analysis.aiScore || '0';

         // Update visual state via CSS classes
         icon.className = `bot-or-not-icon confidence-${analysis.confidence}`;

         // Set the appropriate icon image
         const iconPath = analysis.isAI ? 'assets/icons/bot.png' : 'assets/icons/organic.png';
         const iconSize = this.config?.iconSize || '42px';
         icon.innerHTML = `<img src="${chrome.runtime.getURL(iconPath)}" alt="${analysis.isAI ? 'AI' : 'Organic'}" style="width: ${iconSize}; height: ${iconSize};" />`;

         // Set tooltip
         icon.title = analysis.isAI ? 
             `AI Detected: ${analysis.aiScore || 0}% confidence${analysis.detectedTool ? ` (${analysis.detectedTool})` : ''}` :
             'Organic Content';
     }

    attachIconClickHandler(icon, analysis, srcUrl) {
        const clickHandler = (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showAnalysisModal(analysis, srcUrl);
        };

        icon.addEventListener('click', clickHandler);

        // Store cleanup function
        icon._clickHandler = clickHandler;
        icon._cleanup = () => {
            if (icon._updatePosition) {
                window.removeEventListener('scroll', icon._updatePosition);
                window.removeEventListener('resize', icon._updatePosition);
            }
            icon.removeEventListener('click', clickHandler);
        };
    }

    // Clean up icons that are no longer visible or valid
    cleanupIcons() {
        const icons = document.querySelectorAll('.bot-or-not-icon');
        icons.forEach(icon => {
            const srcUrl = icon.dataset.srcUrl;
            const img = this.findImageElement(srcUrl);

            // Remove icon if the source image is no longer in the DOM or not visible
            if (!img || !document.body.contains(img) || img.offsetParent === null) {
                if (icon._cleanup) {
                    icon._cleanup();
                }
                icon.remove();
            }
        });
    }

    async showAnalysisModal(analysis, srcUrl) {
        try {
            await this.loadModalTemplate();
            const modal = await this.createModal(analysis, srcUrl);
            document.body.appendChild(modal);
            this.setupModalEventListeners(modal);

            // Trigger animation after DOM insertion
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        } catch (error) {
            console.error('Failed to show modal:', error);
        }
    }

    async loadModalTemplate() {
        if (window.BotOrNotModalTemplate) return;

        try {
            const response = await fetch(chrome.runtime.getURL('src/html/modal.html'));
            window.BotOrNotModalTemplate = await response.text();

            // Also load the modal controller script if not already loaded
            if (!window.BotOrNotModal) {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('src/js/modal.js');
                document.head.appendChild(script);
                // Wait for script to load
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            throw new Error('Modal template not available');
        }
    }

    async createModal(analysis, srcUrl) {
        const modal = document.createElement('div');
        modal.dataset.botOrNotModal = 'true';
        modal.className = 'modal';

        // Load modal styling
        await this.loadModalStyles();

        // Replace placeholders in template
        let template = window.BotOrNotModalTemplate;
        
        // Basic placeholder replacements
        const confidenceColor = getConfidenceColor(analysis.confidence);
        const resultText = getResultText(analysis);
        
        template = template.replace(/\{\{resultText\}\}/g, resultText);

        // Set template content
        modal.innerHTML = template;

        // Forward control to modal - let it populate itself
        if (window.BotOrNotModal) {
            window.BotOrNotModal.populate(modal, analysis, srcUrl);
        }

        return modal;
    }

    async loadModalStyles() {
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
            }, 200); // Match CSS transition duration
        };

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Close modal on escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Store close function on modal for external access
        modal._closeModal = closeModal;

        // Make close function globally accessible for modal HTML
        window.BotOrNotContent = window.BotOrNotContent || {};
        window.BotOrNotContent.closeModal = closeModal;
        window.BotOrNotContent.copyAnalysisResults = async (analysis) => {
            const results = this.formatAnalysisForCopy(analysis);
            await navigator.clipboard.writeText(results);
        };
    }

    // Utility methods
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

    formatAnalysisForCopy(analysis) {
        const lines = [];
        lines.push('🔎 Bot or Not? Analysis Results');
        lines.push('=====================================');

        if (analysis.isAI) {
            lines.push(`🤖 AI Generated (${analysis.confidence} confidence)`);
            if (analysis.detectedTool) {
                lines.push(`🛠️ Tool: ${analysis.detectedTool}`);
            }
        } else {
            lines.push('👨‍🎨 Likely Human Created');
        }

        lines.push(`📊 AI Score: ${analysis.aiScore || 0}/${analysis.maxScore || 100}`);
        lines.push(`🔍 Method: ${analysis.method}`);

        if (analysis.signatures?.length) {
            lines.push(`\n🔍 Signatures Found (${analysis.signatures.length}):`);
            analysis.signatures.forEach(sig => {
                lines.push(`  • ${sig.tool}: ${sig.details}`);
            });
        }

        if (analysis.cgiDetection) {
            const cgi = analysis.cgiDetection;
            const status = cgi.isCGI ? 'CGI' : cgi.isEdited ? 'Edited' : 'Organic';
            lines.push(`\n🎨 Image Type: ${status}`);
            if (cgi.metrics?.uniqueColors) {
                lines.push(`🌈 Colors Detected: ${cgi.metrics.uniqueColors}`);
            }
        }

        return lines.join('\n');
    }
}

// Analyzer class for AI detection
class BotOrNotAnalyzer {
  constructor() {
    this.signatureDb = new SimpleSignatureDb();
    this.headerParser = new HeaderParser(this.signatureDb);
    this.cgiDetector = new CGIDetector();
  }

  async analyzeMedia(srcUrl, mediaType, element = null) {
    try {
      await this.signatureDb.initPromise;

            // Get file content via background script
            const fileContent = await this.fetchFileContent(srcUrl);

            // Header analysis
      const headerAnalysis = fileContent ? 
        await this.headerParser.parseFile(fileContent, srcUrl) : 
        { signatures: [], confidence: 'none', details: ['Could not fetch file content'] };

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

    async fetchFileContent(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'getImageData', url },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Fetch failed'));
                    }
                }
            );
        });
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
          // Organic image
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
        cgiDetection: cgiAnalysis
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

// Simple signature database
class SimpleSignatureDb {
    constructor() {
        this.signatures = null;
        this.initPromise = this.init();
    }

    async init() {
        if (this.signatures) return;
        try {
            const response = await fetch(chrome.runtime.getURL('src/signatures.json'));
            this.signatures = response.ok ? await response.json() : [];
        } catch (e) {
            this.signatures = [];
        }
    }

    containsAISignature(text) {
        if (!this.signatures || !text) return null;

        const lowerText = text.toLowerCase();
        for (const signature of this.signatures) {
            if (lowerText.includes(signature.toLowerCase())) {
                return {
                    tool: this.formatToolName(signature),
                    signature: signature,
                    type: 'text-signature',
                    confidence: 'high'
                };
            }
        }
        return null;
    }

    formatToolName(signature) {
        return signature.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

// Global API is set up in setupModalEventListeners method when modal is created

// Initialize extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
        new BotOrNotExtension();
  });
} else {
    new BotOrNotExtension();
}