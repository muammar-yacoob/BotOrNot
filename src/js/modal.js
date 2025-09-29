// Modal controller - implements forward control pattern
window.BotOrNotModal = {
  currentAnalysis: null,
  currentSrcUrl: null,
  analyzer: null,

  // Initialize the modal with analysis data
  async initialize(srcUrl, mediaType = 'image') {
    console.log('BotOrNotModal.initialize called with:', srcUrl, mediaType);
    this.currentSrcUrl = srcUrl;
    
    // Initialize analyzer if not already done
    if (!this.analyzer) {
      console.log('Creating new BotOrNotAnalyzer');
      this.analyzer = new BotOrNotAnalyzer();
    }

    try {
      // Find the image element
      console.log('Finding image element for:', srcUrl);
      const element = this.findImageElement(srcUrl);
      console.log('Image element found:', element);
      
      // Perform analysis
      console.log('Starting analysis...');
      this.currentAnalysis = await this.analyzer.analyzeMedia(srcUrl, mediaType, element);
      console.log('Analysis completed:', this.currentAnalysis);
      
      // Populate the modal
      console.log('Populating modal...');
      this.populateAll();
      console.log('Modal populated successfully');
      
      return this.currentAnalysis;
    } catch (error) {
      console.error('Modal analysis failed:', error);
      this.currentAnalysis = this.createErrorResult(error, srcUrl);
      this.populateAll();
      return this.currentAnalysis;
    }
  },

  findImageElement(srcUrl) {
    const images = document.querySelectorAll('img');
    for (const img of images) {
      if (img.src === srcUrl || img.currentSrc === srcUrl) {
        return img;
      }
    }
    return null;
  },

  populateAll() {
    console.log('populateAll called with analysis:', this.currentAnalysis);
    if (!this.currentAnalysis) {
      console.error('No analysis data to populate');
      return;
    }
    
    try {
      console.log('Populating result...');
      this.populateResult(this.currentAnalysis);
      
      console.log('Populating signatures...');
      this.populateSignatures(this.currentAnalysis.signatures);
      
      console.log('Populating summary...');
      this.populateSummary(this.currentAnalysis);
      
      console.log('Populating CGI analysis...');
      this.populateCGIAnalysis(this.currentAnalysis.cgiDetection);
      
      console.log('Populating details...');
      this.populateDetails(this.currentAnalysis.details);
      
      console.log('Populating image...');
      this.populateImage(this.currentSrcUrl);
      
      console.log('All sections populated successfully');
    } catch (error) {
      console.error('Error during populateAll:', error);
    }
  },

  populateResult(analysis) {
    // Populate main result
    document.getElementById('result-text').textContent = this.getResultText(analysis);
    document.getElementById('method-text').textContent = this.formatMethod(analysis.method);
    
    // Style result card based on confidence
    const resultCard = document.getElementById('result-card');
    if (analysis.confidence === 'error') {
      resultCard.classList.add('card-error');
    } else if (analysis.confidence === 'high') {
      resultCard.classList.add('card-success');
    } else if (analysis.confidence === 'medium') {
      resultCard.classList.add('card-warning');
    }
    
    if (analysis.detectedTool) {
      document.getElementById('tool-name').textContent = analysis.detectedTool;
      document.getElementById('tool-text').style.display = 'block';
    }
  },

  populateSignatures(signatures) {
    if (!signatures || signatures.length === 0) {
      document.getElementById('signatures-details').style.display = 'none';
      return;
    }

    document.getElementById('signature-count').textContent = signatures.length;
    const signaturesList = document.getElementById('signatures-list');
    signaturesList.innerHTML = signatures.map(sig => `
      <div class="list-item">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span class="text-primary">${sig.tool || 'Unknown Tool'}</span>
          <span class="badge badge-primary">${sig.confidence || 0}%</span>
        </div>
        <div class="text-secondary" style="font-family: monospace;">${sig.details || sig.signature || 'No details'}</div>
        <div class="text-dim">Source: ${sig.source || 'signature'}</div>
      </div>
    `).join('');
  },

  populateSummary(analysis) {
    // Populate summary metrics - ALWAYS show these
    const summaryMetrics = document.getElementById('summary-metrics');
    const metrics = [];
    
    // Always show AI score if available
    if (analysis.aiScore !== undefined) {
      const scoreColor = analysis.aiScore > 70 ? '#e74c3c' : analysis.aiScore > 45 ? '#f39c12' : '#27ae60';
      metrics.push(`
        <div class="metric">
          <span class="metric-label">AI Score:</span>
          <span class="metric-value" style="color: ${scoreColor}">${analysis.aiScore}/${analysis.maxScore || 100}</span>
        </div>
      `);
    }
    
    // Always show color count if CGI analysis was performed
    if (analysis.cgiDetection && analysis.cgiDetection.metrics) {
      const uniqueColors = analysis.cgiDetection.metrics.uniqueColors || 0;
      const gradientRatio = analysis.cgiDetection.metrics.gradientRatio || 0;
      
      metrics.push(`
        <div class="metric">
          <span class="metric-label">Colors Detected:</span>
          <span class="metric-value">${uniqueColors}</span>
        </div>
      `);
      
      if (gradientRatio > 0) {
        metrics.push(`
          <div class="metric">
            <span class="metric-label">Gradient Ratio:</span>
            <span class="metric-value">${gradientRatio}%</span>
          </div>
        `);
      }
    }
    
    // Always show image type if CGI analysis was performed
    if (analysis.cgiDetection) {
      let cgiStatus, cgiColor;
      if (analysis.cgiDetection.corsBlocked) {
        cgiStatus = 'CORS Blocked';
        cgiColor = '#f39c12';
      } else if (analysis.cgiDetection.isCGI) {
        cgiStatus = 'CGI';
        cgiColor = '#e74c3c';
      } else if (analysis.cgiDetection.isEdited) {
        cgiStatus = 'Edited';
        cgiColor = '#f39c12';
      } else {
        cgiStatus = 'Organic';
        cgiColor = '#27ae60';
      }
      
      metrics.push(`
        <div class="metric">
          <span class="metric-label">Image Type:</span>
          <span class="metric-value" style="color: ${cgiColor}">${cgiStatus}</span>
        </div>
      `);
    }
    
    // If no metrics at all, show a message
    if (metrics.length === 0) {
      metrics.push(`
        <div class="metric">
          <span class="metric-label">Analysis:</span>
          <span class="metric-value">No data available</span>
        </div>
      `);
    }
    
    summaryMetrics.innerHTML = metrics.join('');
  },

  populateCGIAnalysis(cgiDetection) {
    // Populate filters
    if (cgiDetection && cgiDetection.filtersDetected && cgiDetection.filtersDetected.length > 0) {
      const filtersList = document.getElementById('filters-list');
      filtersList.innerHTML = cgiDetection.filtersDetected.map(filter => {
        const badgeClass = filter.confidence > 70 ? 'badge-error' : filter.confidence > 50 ? 'badge-warning' : 'badge-primary';
        return `
          <div class="list-item">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="text-primary">${filter.name}</span>
              <span class="badge ${badgeClass}">${Math.round(filter.confidence)}%</span>
            </div>
            <div class="text-secondary">${filter.description}</div>
          </div>
        `;
      }).join('');
    } else {
      document.getElementById('filters-details').style.display = 'none';
    }
  },

  populateDetails(details) {
    // Populate details - always show some information
    const detailsList = document.getElementById('details-list');
    const detailsArray = [];
    
    // Add analysis details if available
    if (details && details.length > 0) {
      detailsArray.push(...details.map(detail => `<li>${detail}</li>`));
    }
    
    // Add method information
    detailsArray.push(`<li>Detection Method: ${this.currentAnalysis?.method || 'unknown'}</li>`);
    
    // Add file info
    if (this.currentAnalysis?.fileInfo) {
      detailsArray.push(`<li>File Type: ${this.currentAnalysis.fileInfo.type || 'unknown'}</li>`);
    }
    
    // Add CGI analysis details if available
    if (this.currentAnalysis?.cgiDetection) {
      if (this.currentAnalysis.cgiDetection.corsBlocked) {
        detailsArray.push('<li>CORS Policy: Analysis blocked by cross-origin restrictions</li>');
      } else {
        detailsArray.push('<li>Visual Analysis: Performed successfully</li>');
      }
    }
    
    // Always show at least basic details
    if (detailsArray.length === 0) {
      detailsArray.push('<li>Basic analysis performed</li>');
    }
    
    detailsList.innerHTML = detailsArray.join('');
  },

  populateImage(srcUrl) {
    const img = document.getElementById('analyzed-image');
    img.src = srcUrl;
  },

  toggleSection(sectionName) {
    const content = document.getElementById(`${sectionName}-content`);
    const icon = document.getElementById(`${sectionName}-icon`);

    if (!content || !icon) return;

    const isCollapsed = content.classList.contains('collapsed');

    if (isCollapsed) {
      content.classList.remove('collapsed');
      icon.textContent = '▼';
    } else {
      content.classList.add('collapsed');
      icon.textContent = '▶';
    }
  },

  async copyAndClose() {
    try {
      await window.BotOrNotContent.copyAnalysisResults(this.currentAnalysis);
      const button = document.querySelector('.copy-close-btn');
      button.textContent = 'Copied!';
      setTimeout(() => window.BotOrNotContent.closeModal(), 500);
    } catch (error) {
      console.error('Copy failed:', error);
      window.BotOrNotContent.closeModal();
    }
  },

  // Helper methods
  getResultText(analysis) {
    if (analysis.confidence === 'blocked') return '🚫 Analysis Blocked (CORS)';
    if (analysis.confidence === 'error') return '❌ Analysis Failed';
    if (analysis.isAI) return `🤖 AI Generated (${analysis.confidence} confidence)`;
    return '👨‍🎨 Likely Human Created';
  },

  getConfidenceColor(confidence) {
    const colors = {
      'high': '#e74c3c',
      'medium': '#f39c12',
      'low': '#3498db',
      'none': '#27ae60',
      'blocked': '#9b59b6',
      'error': '#95a5a6'
    };
    return colors[confidence] || '#95a5a6';
  },

  getConfidenceText(confidence) {
    if (typeof confidence === 'number') return `${confidence}%`;
    return confidence;
  },

  getScoreColor(score) {
    return score > 70 ? '#ff4757' : score > 45 ? '#ffa502' : '#27ae60';
  },

  getCgiStatusColor(cgiDetection) {
    return cgiDetection.isCGI ? '#ff4757' :
           cgiDetection.isEdited ? '#ffa502' : '#27ae60';
  },

  getFilterColor(confidence) {
    return confidence > 70 ? '#ff4757' :
           confidence > 50 ? '#ffa726' : '#4a9eff';
  },

  // New helper methods for improved modal
  formatMethod(method) {
    const methodNames = {
      'signature-detection': 'AI Signature Detection',
      'cgi-detection': 'CGI Visual Analysis',
      'editing-detection': 'Photo Editing Detection',
      'visual-analysis': 'Visual Characteristics',
      'blocked-by-cors': 'Limited by CORS',
      'header-parser': 'Header Analysis',
      'no-analysis': 'No Analysis Available',
      'error': 'Analysis Error'
    };
    return methodNames[method] || method;
  },

  getScoreBadgeType(score) {
    return score > 80 ? 'error' : score > 50 ? 'warning' : 'primary';
  },

  getConfidenceCardType(confidence) {
    const types = {
      'high': 'error',
      'medium': 'warning',
      'low': 'primary',
      'none': 'success',
      'error': 'error'
    };
    return types[confidence] || 'primary';
  },

  getFilterBadgeType(confidence) {
    return confidence > 70 ? 'error' :
           confidence > 50 ? 'warning' : 'primary';
  },

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
};

