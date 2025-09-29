// Modal controller - implements forward control pattern
window.BotOrNotModal = {
  currentAnalysis: null,
  currentSrcUrl: null,

  populate(modalElement, analysis, srcUrl) {
    this.currentAnalysis = analysis;
    this.currentSrcUrl = srcUrl;

    this.populateResult(analysis);
    this.populateSignatures(analysis.signatures);
    this.populateSummary(analysis);
    this.populateCGIAnalysis(analysis.cgiDetection);
    this.populateDetails(analysis.details);
    this.populateImage(srcUrl);
  },

  populateResult(analysis) {
    const resultMain = document.getElementById('result-main');
    const resultTool = document.getElementById('result-tool');
    const resultMethod = document.getElementById('result-method');
    const resultScore = document.getElementById('result-score');

    resultMain.textContent = this.getResultText(analysis);
    resultMain.style.color = this.getConfidenceColor(analysis.confidence);

    if (analysis.detectedTool) {
      resultTool.textContent = `🛠️ Tool: ${analysis.detectedTool}`;
      resultTool.style.display = 'block';
    }

    resultMethod.textContent = `📋 Detection Method: ${this.formatMethod(analysis.method)}`;

    if (analysis.aiScore !== undefined) {
      resultScore.innerHTML = `<span class="badge badge-${this.getScoreBadgeType(analysis.aiScore)}">${analysis.aiScore}% Confidence</span>`;
    }

    // Update main result card styling
    const mainResult = document.getElementById('main-result');
    if (mainResult) {
      mainResult.className = `result-card card card-${this.getConfidenceCardType(analysis.confidence)}`;
    }
  },

  populateSignatures(signatures) {
    const section = document.getElementById('signatures-section');
    const count = document.getElementById('signature-count');
    const list = document.getElementById('signatures-list');

    if (!signatures || signatures.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    count.textContent = signatures.length;

    list.innerHTML = signatures.map(sig => `
      <div class="signature-item">
        <div class="signature-header">
          <span class="signature-tool">${sig.tool}</span>
          <span class="confidence-badge">${this.getConfidenceText(sig.confidence)}</span>
        </div>
        <div class="signature-details">${sig.details}</div>
        <div class="signature-source">Source: ${sig.source}</div>
      </div>
    `).join('');
  },

  populateSummary(analysis) {
    const metrics = document.getElementById('summary-metrics');
    const items = [];

    if (analysis.aiScore !== undefined) {
      items.push(`
        <div class="metric-item">
          <span class="metric-label">AI Score:</span>
          <span class="metric-value" style="color: ${this.getScoreColor(analysis.aiScore)}">${analysis.aiScore}/${analysis.maxScore || 100}</span>
        </div>
      `);
    }

    if (analysis.cgiDetection?.metrics?.uniqueColors) {
      items.push(`
        <div class="metric-item">
          <span class="metric-label">Colors Detected:</span>
          <span class="metric-value">${analysis.cgiDetection.metrics.uniqueColors}</span>
        </div>
      `);
    }

    if (analysis.cgiDetection) {
      const status = analysis.cgiDetection.isCGI ? 'CGI' :
                    analysis.cgiDetection.isEdited ? 'Edited' : 'Organic';
      const color = this.getCgiStatusColor(analysis.cgiDetection);

      items.push(`
        <div class="metric-item">
          <span class="metric-label">Image Type:</span>
          <span class="metric-value" style="color: ${color}">${status}</span>
        </div>
      `);
    }

    metrics.innerHTML = items.join('');
  },

  populateCGIAnalysis(cgiDetection) {
    const section = document.getElementById('cgi-section');
    const details = document.getElementById('cgi-details');
    const filtersList = document.getElementById('filters-list');

    if (!cgiDetection) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    // Show CGI analysis details
    let cgiHTML = '<div class="metrics mb-2">';

    if (cgiDetection.corsBlocked) {
      cgiHTML += '<div class="metric"><span class="metric-label">Status:</span><span class="metric-value text-warning">CORS Blocked</span></div>';
    } else {
      if (cgiDetection.metrics?.uniqueColors !== undefined) {
        cgiHTML += `<div class="metric"><span class="metric-label">Unique Colors:</span><span class="metric-value">${cgiDetection.metrics.uniqueColors}</span></div>`;
      }
      if (cgiDetection.metrics?.gradientRatio !== undefined) {
        cgiHTML += `<div class="metric"><span class="metric-label">Gradient Ratio:</span><span class="metric-value">${cgiDetection.metrics.gradientRatio}%</span></div>`;
      }

      const statusText = cgiDetection.isCGI ? 'CGI Detected' :
                        cgiDetection.isEdited ? 'Editing Detected' : 'Organic';
      const statusColor = this.getCgiStatusColor(cgiDetection);
      cgiHTML += `<div class="metric"><span class="metric-label">Status:</span><span class="metric-value" style="color: ${statusColor}">${statusText}</span></div>`;
    }

    cgiHTML += '</div>';

    if (cgiDetection.reasons?.length > 0) {
      cgiHTML += '<div class="text-muted mb-2"><strong>Reasons:</strong></div>';
      cgiHTML += '<ul class="list text-muted">';
      cgiDetection.reasons.forEach(reason => {
        cgiHTML += `<li class="list-item">${reason}</li>`;
      });
      cgiHTML += '</ul>';
    }

    details.innerHTML = cgiHTML;

    // Show filters if detected
    if (cgiDetection.filtersDetected?.length > 0) {
      filtersList.innerHTML = cgiDetection.filtersDetected.map(filter => `
        <div class="filter-item card">
          <div class="filter-header">
            <span class="filter-name text-secondary">${filter.name}</span>
            <span class="badge badge-${this.getFilterBadgeType(filter.confidence)}">${Math.round(filter.confidence)}%</span>
          </div>
          <div class="filter-description text-muted">${filter.description}</div>
        </div>
      `).join('');
    } else {
      filtersList.innerHTML = '';
    }
  },

  populateDetails(details) {
    const list = document.getElementById('details-list');
    list.innerHTML = (details || []).map(detail => `<li>${detail}</li>`).join('');
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
  }
};