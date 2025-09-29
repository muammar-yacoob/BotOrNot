// Simplified Bot or Not Content Script
// Uses headerParser with signatures.json and HTML templates

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
          tool: this.getToolFromSignature(signature),
          signature: signature,
          type: 'text-signature',
          confidence: 'high'
        };
      }
    }
    return null;
  }

  getToolFromSignature(signature) {
    // Use signature as tool name, formatted for display
    return signature.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

class BotOrNotAnalyzer {
  constructor() {
    this.signatureDb = new SimpleSignatureDb();
    this.headerParser = new HeaderParser(this.signatureDb);
    this.cgiDetector = new CGIDetector();
  }

  async analyzeMedia(srcUrl, mediaType, element = null) {
    try {
      await this.signatureDb.initPromise;

      // Fetch file content
      let fileContent = null;
      try {
        const response = await this.fetchViaBackground(srcUrl);
        fileContent = response?.content;
      } catch (fetchError) {
        // Continue without file content
      }

      // Analyze with headerParser
      const headerAnalysis = fileContent ? 
        await this.headerParser.parseFile(fileContent, srcUrl) : 
        { signatures: [], confidence: 'none', details: ['Could not fetch file content'] };

      // CGI analysis for color count
      let cgiAnalysis = null;
      if (mediaType === 'image' && element?.tagName === 'IMG') {
        try {
          cgiAnalysis = await this.cgiDetector.analyzeImage(element);
        } catch (cgiError) {
          console.error('CGI analysis failed:', cgiError);
        }
      }

      // Build analysis result
      const isAI = headerAnalysis.signatures?.length > 0;
      const detectedTool = isAI ? this.getDetectedTool(headerAnalysis.signatures) : null;

      return {
        confidence: isAI ? 'high' : 'none',
        isAI,
        detectedTool,
        method: 'header-parser',
        details: headerAnalysis.details || [],
        signatures: headerAnalysis.signatures || [],
        fileInfo: { url: srcUrl, type: mediaType },
        aiScore: isAI ? 100 : 0,
        maxScore: 100,
        cgiDetection: cgiAnalysis
      };

    } catch (error) {
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

  getDetectedTool(signatures) {
    if (!signatures?.length) return null;
    return signatures[0].tool; // Use first signature's tool name
  }

  async fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchMedia', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }
}

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Message listener
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "analyzeMedia") {
    const analyzer = new BotOrNotAnalyzer();
    
    let element = null;
    if (message.mediaType === 'image') {
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (img.src === message.srcUrl || img.currentSrc === message.srcUrl) {
          element = img;
          break;
        }
      }
    }
    
    const analysis = await analyzer.analyzeMedia(message.srcUrl, message.mediaType, element);
    showResultModal(analysis, message.srcUrl);
  }
});

// Auto-scan initialization
function initAutoScan() {
  scanSocialMediaContent();

  const debouncedScan = debounce(scanSocialMediaContent, 300);
  const observer = new MutationObserver(() => debouncedScan());
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function scanSocialMediaContent() {
  const imageSelectors = [
    'img[src*="instagram"]', 'img[src*="cdninstagram"]',
    'img[src*="twitter"]', 'img[src*="twimg"]', 'img[src*="x.com"]',
    'img[src*="tiktok"]', 'img[src*="tiktokcdn"]',
    'img[src*="facebook"]', 'img[src*="fbcdn"]', 'img[src*="fbsbx"]',
    'img[src*="youtube"]', 'img[src*="ytimg"]',
    'img[src*="linkedin"]', 'img[src*="licdn"]',
    'img[src*="discord"]', 'img[src*="discordapp"]',
    'img[src*="reddit"]', 'img[src*="redd.it"]',
    'img[width]:not([width="1"]):not([width="0"])',
    'img[height]:not([height="1"]):not([height="0"])',
    'img'
  ];

  const images = document.querySelectorAll(imageSelectors.join(', '));

  images.forEach(img => {
    if (!img.dataset.botOrNotScanned && img.src && 
        !isProfileImage(img) && isContentImage(img) && !isModalImage(img)) {
      img.dataset.botOrNotScanned = 'true';
      addBotIcon(img, img.src, 'image');
    }
  });
}

// Image filtering functions
function isProfileImage(element) {
  const profileIndicators = [
    'img[alt*="profile"]', 'img[alt*="avatar"]', 'img[alt*="user"]',
    '[data-testid*="profile"] img', '[data-testid="UserAvatar"] img',
    '[aria-label*="profile"] img', '[class*="avatar"] img',
    '[class*="profile"] img', 'header img', 'nav img'
  ];

  for (const selector of profileIndicators) {
    if (element.matches?.(selector) || element.closest?.(selector)) {
      return true;
    }
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 80 && rect.height <= 80 && Math.abs(rect.width - rect.height) <= 15) {
    return true;
  }

  const altText = (element.alt || '').toLowerCase();
  const profileKeywords = ['profile', 'avatar', 'user', 'author', 'creator'];
  if (profileKeywords.some(keyword => altText.includes(keyword))) {
    return true;
  }

  return false;
}

function isContentImage(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) return false;

  const uiIndicators = ['[class*="icon"]', '[class*="logo"]', '[class*="button"]'];
  for (const selector of uiIndicators) {
    if (element.matches?.(selector)) return false;
  }

  const contentContainers = ['article', 'main', '.post', '.content', '[class*="post"]'];
  if (contentContainers.some(selector => element.closest?.(selector))) {
    return true;
  }

  return rect.width >= 200 && rect.height >= 200;
}

function isModalImage(element) {
  return element.closest?.('#bot-or-not-modal') || 
         element.closest?.('[role="dialog"]') ||
         element.closest?.('.modal');
}

// Icon management
function addBotIcon(element, srcUrl, mediaType) {
  const iconContainer = document.createElement('div');
  iconContainer.className = 'icon';
  iconContainer.style.cssText = `
    position: absolute; top: 8px; right: 8px; width: 48px; height: 48px;
    border-radius: 50%; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
    border: 2px solid #747d8c; cursor: pointer; display: flex;
    align-items: center; justify-content: center; z-index: 1000;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

    iconContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <img src="${chrome.runtime.getURL('assets/icons/icon32.png')}" alt="Bot" style="width: 16px; height: 16px; margin-bottom: 1px;">
      <span style="font-size: 10px; font-weight: 700; color: #747d8c;">...</span>
      </div>
    `;

  element.style.position = 'relative';
  element.parentElement.appendChild(iconContainer);

  analyzeAndUpdateIcon(iconContainer, element, srcUrl, mediaType);
  return iconContainer;
}

async function analyzeAndUpdateIcon(iconContainer, element, srcUrl, mediaType) {
  try {
    const analyzer = new BotOrNotAnalyzer();
    const analysis = await analyzer.analyzeMedia(srcUrl, mediaType, element);
    updateIconDisplay(iconContainer, analysis, srcUrl);
  } catch (error) {
    iconContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <img src="${chrome.runtime.getURL('assets/icons/icon32.png')}" alt="Bot" style="width: 16px; height: 16px; margin-bottom: 1px;">
        <span style="font-size: 10px; font-weight: 700; color: #95a5a6;">err</span>
      </div>
    `;
    iconContainer.title = 'Analysis failed';
    iconContainer.style.borderColor = '#95a5a6';
    
    iconContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showResultModal({
        confidence: 'error', isAI: false, detectedTool: null, method: 'error',
        details: [`Analysis failed: ${error.message}`], signatures: [],
        fileInfo: { url: srcUrl }, aiScore: 0, maxScore: 100, cgiDetection: null
      }, srcUrl);
    });
  }
}

function updateIconDisplay(iconContainer, analysis, srcUrl) {
  const isAI = analysis.isAI || analysis.signatures?.length > 0;
  const confidenceScore = analysis.aiScore || (isAI ? 100 : 0);
  const confidenceLevel = analysis.confidence || 'none';

  const colors = {
    'high': { primary: '#ff4757', secondary: '#ff6b7a' },
    'medium': { primary: '#ffa502', secondary: '#ffb627' },
    'low': { primary: '#3742fa', secondary: '#4a5bff' },
    'organic': { primary: '#27ae60', secondary: '#2ecc71' },
    'none': { primary: '#747d8c', secondary: '#9ca3af' }
  };

  const color = colors[confidenceLevel] || colors.none;
  const useOrganicIcon = !isAI;
  const iconPath = useOrganicIcon ? 'assets/icons/organic.png' : 'assets/icons/icon32.png';
  const scoreDisplay = !useOrganicIcon ? 
    `<span style="font-size: 10px; font-weight: 700; color: ${color.primary};">${confidenceScore}%</span>` : '';

  const circumference = 125.66;
  const progressOffset = circumference - (confidenceScore / 100) * circumference;

  iconContainer.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 48 48" style="position: absolute;">
      <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.2)" stroke-width="3" fill="none"/>
      <circle cx="24" cy="24" r="20" stroke="${color.primary}" stroke-width="3" fill="none"
              stroke-dasharray="125.66" stroke-dashoffset="${progressOffset}" transform="rotate(-90 24 24)"/>
    </svg>
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1;">
      <img src="${chrome.runtime.getURL(iconPath)}" alt="${useOrganicIcon ? 'Organic' : 'AI'}" style="width: 16px; height: 16px; margin-bottom: ${useOrganicIcon ? '0' : '1'}px;">
      ${scoreDisplay}
    </div>
  `;

  iconContainer.style.borderColor = color.primary;
  iconContainer.title = isAI ? 
    `AI Detected: ${confidenceScore}% confidence${analysis.detectedTool ? ` (${analysis.detectedTool})` : ''}` :
    'Organic Content';

  iconContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showResultModal(analysis, srcUrl);
  });
}

// Modal management
function showResultModal(analysis, srcUrl) {
  removeExistingModal();

  const modal = document.createElement('div');
  modal.id = 'bot-or-not-modal';
  modal.className = 'modal';
  modal.innerHTML = createModalHtml(analysis, srcUrl);

  document.body.appendChild(modal);

  // Add event listeners
  modal.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const icon = header.querySelector('.text-muted');
      const isCollapsed = content.classList.contains('collapsed') || content.style.display === 'none';
      
      if (isCollapsed) {
        content.classList.remove('collapsed');
        content.style.display = 'block';
        if (icon) icon.textContent = '▼';
      } else {
        content.classList.add('collapsed');
        content.style.display = 'none';
        if (icon) icon.textContent = '▶';
      }
    });
  });

  modal.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => modal.remove());
  });

  const copyCloseButton = modal.querySelector('.modal-footer .btn');
  if (copyCloseButton) {
    copyCloseButton.addEventListener('click', (e) => {
      const copyText = `Bot or Not Analysis Results:
${analysis.isAI ? '🤖 AI Generated' : '👨‍🎨 Likely Human Created'} (${analysis.confidence} confidence)
${analysis.detectedTool ? `Tool: ${analysis.detectedTool}` : ''}
Method: ${analysis.method}

${analysis.signatures?.length > 0 ? 'Signatures Found:' : ''}
${analysis.signatures?.map(sig => `- ${sig.tool}: ${sig.signature}`).join('\n') || ''}

${analysis.details?.length > 0 ? 'Details:' : ''}
${analysis.details?.map(detail => `- ${detail}`).join('\n') || ''}`;

      navigator.clipboard.writeText(copyText).then(() => {
        e.target.textContent = 'Copied!';
        setTimeout(() => modal.remove(), 500);
      }).catch(() => modal.remove());
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  setTimeout(() => modal.classList.add('show'), 10);
}

// Global template cache
let modalTemplate = '';

async function loadModalTemplate() {
  if (modalTemplate) return modalTemplate;
  try {
    const response = await fetch(chrome.runtime.getURL('src/html/modal.html'));
    modalTemplate = response.ok ? await response.text() : '';
  } catch (e) {
    console.error('Failed to load modal template:', e);
    modalTemplate = '';
  }
  return modalTemplate;
}

function createModalHtml(analysis, srcUrl) {
  const confidenceColor = getConfidenceColor(analysis.confidence);
  const resultText = getResultText(analysis);
  const toolText = analysis.detectedTool || '';
  const toolDisplay = toolText ? 'block' : 'none';
  
  // Generate content for each section
  const signaturesHtml = createSignaturesContent(analysis.signatures);
  const summaryHtml = createSummaryContent(analysis);
  const filtersHtml = createFiltersContent(analysis.cgiDetection);
  const detailsList = analysis.details?.map(detail => `<li>${detail}</li>`).join('') || '';

  // Use fallback template if modal template not loaded yet
  let template = modalTemplate;
  if (!template) {
    // Fallback to inline template
    return `
    <div class="bot-or-not-modal-content">
      <div class="bot-or-not-header">
        <h3>🔎 Bot or Not? Analysis</h3>
        <button class="bot-or-not-close">&times;</button>
      </div>
      <div class="bot-or-not-body">
        <div class="bot-or-not-result" style="border-color: ${confidenceColor}">
          <div class="result-main">${resultText}</div>
            <div class="result-tool" style="display: ${toolDisplay}">🛠️ ${toolText}</div>
          <div class="result-method">Method: ${analysis.method}</div>
        </div>
          ${signaturesHtml ? `
            <div class="bot-or-not-collapsible">
              <div class="collapsible-header">
                <span>🔍 Found Signatures (${analysis.signatures?.length || 0})</span>
                <span class="collapsible-icon">${(analysis.signatures?.length || 0) > 1 ? '▼' : ''}</span>
              </div>
              <div class="collapsible-content ${(analysis.signatures?.length || 0) > 1 ? 'scrollable' : ''}">
                <div class="signatures-list">${signaturesHtml}</div>
              </div>
            </div>` : ''}
          ${summaryHtml.aiScore || summaryHtml.colorCount || summaryHtml.cgiStatus ? `
        <div class="bot-or-not-analysis-summary">
          <h4>📊 Analysis Summary</h4>
          <div class="summary-metrics">
                ${summaryHtml.aiScore}
                ${summaryHtml.colorCount}
                ${summaryHtml.cgiStatus}
            </div>
            </div>` : ''}
          ${filtersHtml ? `
        <div class="bot-or-not-collapsible">
              <div class="collapsible-header">
            <h4>🎨 Filter Analysis</h4>
            <span class="collapsible-icon">▼</span>
          </div>
          <div class="collapsible-content default-collapsed">
                <div class="filter-analysis">${filtersHtml}</div>
                  </div>
            </div>` : ''}
        <div class="bot-or-not-image-preview">
          <img src="${srcUrl}" alt="Analyzed media" style="max-width: 200px; max-height: 150px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;">
        </div>
        <div class="bot-or-not-collapsible">
            <div class="collapsible-header">
            <h4>📋 Technical Details</h4>
            <span class="collapsible-icon">▶</span>
          </div>
          <div class="collapsible-content default-collapsed scrollable">
              <ul>${detailsList}</ul>
          </div>
        </div>
      </div>
      <div class="bot-or-not-footer">
        <button class="bot-or-not-btn bot-or-not-close-btn">Copy & Close</button>
      </div>
      </div>`;
  }
  
  // Replace all placeholders
  template = template.replace(/\{\{confidenceColor\}\}/g, confidenceColor);
  template = template.replace(/\{\{resultText\}\}/g, resultText);
  template = template.replace(/\{\{toolDisplay\}\}/g, toolDisplay);
  template = template.replace(/\{\{toolText\}\}/g, toolText);
  template = template.replace(/\{\{method\}\}/g, analysis.method);
  template = template.replace(/\{\{signatureCount\}\}/g, analysis.signatures?.length || 0);
  template = template.replace(/\{\{collapsibleIcon\}\}/g, (analysis.signatures?.length || 0) > 1 ? '▼' : '');
  template = template.replace(/\{\{scrollableClass\}\}/g, (analysis.signatures?.length || 0) > 1 ? 'scrollable' : '');
  template = template.replace(/\{\{signaturesList\}\}/g, signaturesHtml);
  template = template.replace(/\{\{aiScoreHtml\}\}/g, summaryHtml.aiScore);
  template = template.replace(/\{\{colorCountHtml\}\}/g, summaryHtml.colorCount);
  template = template.replace(/\{\{cgiStatusHtml\}\}/g, summaryHtml.cgiStatus);
  template = template.replace(/\{\{filtersList\}\}/g, filtersHtml);
  template = template.replace(/\{\{srcUrl\}\}/g, srcUrl);
  template = template.replace(/\{\{detailsList\}\}/g, detailsList);

  return template;
}

function createSignaturesContent(signatures) {
  if (!signatures?.length) return '';
  return signatures.map(sig => {
    const confidenceClass = sig.confidence === 100 ? 'list-item-success' : 
                           sig.confidence >= 80 ? 'list-item' : 
                           sig.confidence >= 60 ? 'list-item-warning' : 'list-item-error';
    
    const badgeClass = sig.confidence === 100 ? 'badge-success' : 
                      sig.confidence >= 80 ? 'badge-primary' : 
                      sig.confidence >= 60 ? 'badge-warning' : 'badge-error';
    
    return `
      <div class="list-item ${confidenceClass}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="text-primary" style="font-size: 14px; font-weight: 600;">${sig.tool}</span>
          <span class="badge ${badgeClass}">${sig.confidence}%</span>
        </div>
        <div class="text-secondary" style="font-family: monospace; font-size: 12px; margin-bottom: 4px;">${sig.details}</div>
        <div class="text-dim" style="font-style: italic;">Source: ${sig.source}</div>
      </div>
    `;
  }).join('');
}

function createSummaryContent(analysis) {
  const aiScoreHtml = analysis.aiScore ? `
    <div class="metric">
      <span class="metric-label">AI Score:</span>
      <span class="metric-value" style="color: ${analysis.aiScore > 70 ? '#ff4757' : analysis.aiScore > 45 ? '#ffa502' : '#27ae60'}">${analysis.aiScore}/${analysis.maxScore || 100}</span>
    </div>` : '';

  const colorCountHtml = analysis.cgiDetection?.metrics?.uniqueColors ? `
    <div class="metric">
      <span class="metric-label">Colors Detected:</span>
      <span class="metric-value">${analysis.cgiDetection.metrics.uniqueColors}</span>
    </div>` : '';

  const cgiStatusHtml = analysis.cgiDetection ? `
    <div class="metric">
      <span class="metric-label">Image Type:</span>
      <span class="metric-value" style="color: ${analysis.cgiDetection.isCGI ? '#ff4757' : analysis.cgiDetection.isEdited ? '#ffa502' : '#27ae60'}">
        ${analysis.cgiDetection.isCGI ? 'CGI' : analysis.cgiDetection.isEdited ? 'Edited' : 'Organic'}
      </span>
    </div>` : '';

  return { aiScore: aiScoreHtml, colorCount: colorCountHtml, cgiStatus: cgiStatusHtml };
}

function createFiltersContent(cgiDetection) {
  if (!cgiDetection?.filtersDetected?.length) return '';
  return cgiDetection.filtersDetected.map(filter => {
    const badgeClass = filter.confidence > 70 ? 'badge-error' : filter.confidence > 50 ? 'badge-warning' : 'badge-primary';
    return `
      <div class="list-item">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="text-primary" style="font-size: 14px; font-weight: 600;">${filter.name}</span>
          <span class="badge ${badgeClass}">${Math.round(filter.confidence)}%</span>
        </div>
        <div class="text-secondary" style="font-size: 12px; font-style: italic;">${filter.description}</div>
      </div>
    `;
  }).join('');
}

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

function removeExistingModal() {
  const existingModal = document.querySelector('.modal');
  if (existingModal) existingModal.remove();
}

// Initialize auto-scan and load template
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadModalTemplate();
    initAutoScan();
  });
} else {
  loadModalTemplate();
  initAutoScan();
}