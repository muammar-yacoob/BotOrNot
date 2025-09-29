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

         // Store the complete analysis object for modal use
         icon._analysisData = analysis;

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
        const clickHandler = async (e) => {
            e.stopPropagation();
            e.preventDefault();

            console.log('=== ICON CLICK HANDLER ===');
            console.log('Using stored analysis data:', icon._analysisData);

            // Use stored analysis data from icon
            const analysisData = icon._analysisData || analysis;

            try {
                await this.loadModalTemplate();
                const modal = await this.createModal(srcUrl);
                document.body.appendChild(modal);
                this.setupModalEventListeners(modal);

                // Directly populate modal data
                if (window.BotOrNotModal && analysisData) {
                    console.log('Populating modal with analysis:', analysisData);
                    window.BotOrNotModal.currentAnalysis = analysisData;
                    window.BotOrNotModal.currentSrcUrl = srcUrl;
                    window.BotOrNotModal.populateAll();
                } else {
                    console.error('Modal or analysis data not available');
                }

                // Show modal
                requestAnimationFrame(() => {
                    modal.classList.add('show');
                });
            } catch (error) {
                console.error('Failed to show modal:', error);
            }
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
            console.log('=== showAnalysisModal called ===');
            console.log('Analysis data received:', analysis);
            console.log('Source URL:', srcUrl);

            await this.loadModalTemplate();
            const modal = await this.createModal(srcUrl);
            document.body.appendChild(modal);
            this.setupModalEventListeners(modal);

            // Populate modal data directly instead of relying on modal.html script
            if (window.BotOrNotModal) {
                console.log('Setting analysis data on BotOrNotModal...');
                window.BotOrNotModal.currentAnalysis = analysis;
                window.BotOrNotModal.currentSrcUrl = srcUrl;
                console.log('Data set, calling populateAll...');
                console.log('BotOrNotModal.currentAnalysis now:', window.BotOrNotModal.currentAnalysis);
                window.BotOrNotModal.populateAll();
                console.log('populateAll completed');
            } else {
                console.error('BotOrNotModal not available!');
            }

            // Trigger animation after DOM insertion
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        } catch (error) {
            console.error('Failed to show modal:', error);
        }
    }

    async loadModalTemplate() {
        if (window.BotOrNotModalTemplate && window.BotOrNotModal) return;

        try {
            // Load modal.js first if not already loaded
            if (!window.BotOrNotModal) {
                console.log('Loading modal.js...');
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('src/js/modal.js');
                document.head.appendChild(script);
                
                // Wait for script to load
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                    setTimeout(() => reject(new Error('Modal script load timeout')), 2000);
                });
                console.log('Modal.js loaded successfully');
            }

            // Load modal template
            if (!window.BotOrNotModalTemplate) {
                console.log('Loading modal template...');
                const response = await fetch(chrome.runtime.getURL('src/html/modal.html'));
                window.BotOrNotModalTemplate = await response.text();
                console.log('Modal template loaded successfully');
            }
        } catch (error) {
            console.error('Failed to load modal resources:', error);
            throw new Error('Modal template not available: ' + error.message);
        }
    }

    async createModal(srcUrl) {
        const modal = document.createElement('div');
        modal.dataset.botOrNotModal = 'true';
        modal.dataset.srcUrl = srcUrl;
        modal.className = 'modal';

        // Load modal styling
        await this.loadModalStyles();

        // Set template content
        modal.innerHTML = window.BotOrNotModalTemplate;

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
    this.aiSignatureDetector = new AISignatureDetector();
    this.cgiDetector = new CGIDetector();
  }

  async analyzeMedia(srcUrl, mediaType, element = null) {
    try {
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

// Initialize extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
        new BotOrNotExtension();
  });
} else {
    new BotOrNotExtension();
}