class BotOrNotAnalyzer {
  constructor() {
    // Initialize unified AI detector
    this.aiDetector = new AIDetector();
  }

  async analyzeMedia(srcUrl, mediaType, element = null) {
    try {

      // Use the new unified detection system
      const analysis = await this.aiDetector.analyzeMedia(srcUrl, mediaType, element);

      // Maintain compatibility with existing interface
      const compatibleAnalysis = {
        confidence: analysis.confidence,
        isAI: analysis.isAI,
        detectedTool: analysis.detectedTool,
        method: analysis.method,
        details: analysis.details,
        signatures: analysis.signatures,
        fileInfo: analysis.fileInfo,
        // Add new unified fields
        aiScore: analysis.aiScore,
        maxScore: analysis.maxScore,
        cgiDetection: analysis.cgiAnalysis
      };


      return compatibleAnalysis;

    } catch (error) {

      // Handle CORS errors specifically
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return {
          confidence: 'blocked',
          isAI: false,
          detectedTool: null,
          method: 'blocked',
          details: [
            'Unable to analyze: CORS policy blocked access',
            'This is common with third-party hosted images',
            'Try downloading the image and analyzing locally'
          ],
          signatures: [],
          fileInfo: { url: srcUrl }
        };
      }

      return {
        confidence: 'error',
        isAI: false,
        detectedTool: null,
        method: 'error',
        details: [
          `Analysis failed: ${error.message}`,
          'Check console for detailed error information'
        ],
        signatures: [],
        fileInfo: { url: srcUrl }
      };
    }
  }

}

function debounce(func, wait) {
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


chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "analyzeMedia") {
    const analyzer = new BotOrNotAnalyzer();
    const analysis = await analyzer.analyzeMedia(message.srcUrl, message.mediaType);
    showResultModal(analysis, message.srcUrl);
  }
});

// Auto-scan for all supported social media platforms
function initAutoScan() {
  const hostname = window.location.hostname.toLowerCase();


  // Universal content scanning for all platforms
  scanSocialMediaContent();

  // Watch for new content being loaded on any platform
  const debouncedScan = debounce(scanSocialMediaContent, 300);
  const observer = new MutationObserver(() => {
    debouncedScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function analyzeAccountLevel() {
  // Skip if already analyzed
  if (document.body.dataset.accountAnalyzed) return;
  document.body.dataset.accountAnalyzed = 'true';

  // Check for AI indicators in account metadata
  const analysisResult = findAccountAIIndicators();


  if (analysisResult.totalScore > 0) {
  } else {
  }
}

function findAccountAIIndicators() {
  const indicators = [];
  let totalScore = 0;
  const maxScore = 100;


  // Check username from URL path (low confidence indicator - 15 points max)
  const pathUsername = window.location.pathname.split('/')[1];
  if (pathUsername && isAIKeywordInText(pathUsername)) {
    const score = calculateUsernameScore(pathUsername);
    totalScore += score;
    indicators.push({
      type: 'username',
      source: 'URL path',
      details: `Username contains AI-related keywords`,
      score: score,
      maxScore: 15
    });
  }

  // Check profile bio/description (medium confidence - 25 points max)
  const bioElements = document.querySelectorAll('[data-testid="bio"] span, .bio span, span[dir="auto"], [data-pagelet*="ProfileIntro"] span, [data-testid="profile_intro"] span, [aria-describedby*="profile"] span');
  let bioScore = 0;
  bioElements.forEach(bio => {
    const text = bio.textContent.trim();
    if (text && text.length > 3 && isAIKeywordInText(text)) {
      bioScore = Math.max(bioScore, calculateBioScore(text));
    }
  });
  if (bioScore > 0) {
    totalScore += bioScore;
    indicators.push({
      type: 'bio',
      source: 'Profile description',
      details: `Profile mentions AI-related content`,
      score: bioScore,
      maxScore: 25
    });
  }

  // Check post content for explicit AI hashtags (medium confidence - 30 points max)
  const hashtagScore = analyzePostHashtags();
  if (hashtagScore > 0) {
    totalScore += hashtagScore;
    indicators.push({
      type: 'hashtags',
      source: 'Post content',
      details: `Contains AI-related hashtags`,
      score: hashtagScore,
      maxScore: 30
    });
  }

  // The remaining 30 points would come from actual media analysis

  return {
    indicators,
    totalScore,
    maxScore,
    overallConfidence: calculateOverallConfidence(totalScore, maxScore)
  };
}

function calculateUsernameScore(username) {
  const lowerUsername = username.toLowerCase();
  let score = 0;

  // Explicit AI mentions
  if (lowerUsername.includes('ai') || lowerUsername.includes('artificial')) score += 8;
  if (lowerUsername.includes('bot') || lowerUsername.includes('generated')) score += 6;
  if (lowerUsername.includes('neural') || lowerUsername.includes('ml')) score += 4;

  // AI tool mentions
  if (lowerUsername.includes('dalle') || lowerUsername.includes('midjourney')) score += 10;
  if (lowerUsername.includes('stable') || lowerUsername.includes('diffusion')) score += 8;
  if (lowerUsername.includes('gpt') || lowerUsername.includes('chatgpt')) score += 6;

  return Math.min(score, 15);
}

function calculateBioScore(bioText) {
  const lowerBio = bioText.toLowerCase();
  let score = 0;

  // Direct AI declarations
  if (lowerBio.includes('ai generated') || lowerBio.includes('ai created')) score += 20;
  if (lowerBio.includes('artificial intelligence') || lowerBio.includes('machine learning')) score += 15;
  if (lowerBio.includes('ai art') || lowerBio.includes('ai artist')) score += 12;

  // Tool mentions
  if (lowerBio.includes('dalle') || lowerBio.includes('midjourney') || lowerBio.includes('stable diffusion')) score += 18;
  if (lowerBio.includes('neural') || lowerBio.includes('synthetic')) score += 10;

  // Generic AI mentions
  if (lowerBio.includes('ai') && !lowerBio.includes('hai')) score += 8; // Avoid false positives

  return Math.min(score, 25);
}

function analyzePostHashtags() {
  let score = 0;
  const aiHashtags = [];

  // Look for explicit AI hashtags
  const hashtagElements = document.querySelectorAll('a[href*="hashtag"]');
  hashtagElements.forEach(element => {
    const hashtag = element.textContent.trim().toLowerCase();
    if (hashtag.includes('aiart') || hashtag.includes('ai_art')) {
      score += 15;
      aiHashtags.push(hashtag);
    } else if (hashtag.includes('aiイラスト') || hashtag.includes('ai illustration')) {
      score += 15;
      aiHashtags.push(hashtag);
    } else if (hashtag.includes('generated') || hashtag.includes('synthetic')) {
      score += 10;
      aiHashtags.push(hashtag);
    } else if (hashtag.includes('ai') && hashtag.length > 3) {
      score += 8;
      aiHashtags.push(hashtag);
    }
  });

  if (aiHashtags.length > 0) {
  }

  return Math.min(score, 30);
}

function calculateOverallConfidence(score, maxScore) {
  const percentage = (score / maxScore) * 100;

  if (percentage >= 70) return 'high';
  if (percentage >= 40) return 'medium';
  if (percentage >= 20) return 'low';
  return 'none';
}

function isAIKeywordInText(text) {
  const lowerText = text.toLowerCase();
  const aiKeywords = [
    'ai', 'artificial intelligence', 'generated', 'bot', 'chatgpt', 'dalle', 'dall-e',
    'midjourney', 'stable diffusion', 'neural', 'machine learning', 'deepfake',
    'synthetic', 'computer generated', 'algorithm', 'aiart', 'ai art', 'ai generated',
    'artificialintelligence', 'artificialart', 'robotic', 'automated'
  ];

  return aiKeywords.some(keyword => {
    // Check for exact keyword match or keyword as part of compound words
    return lowerText.includes(keyword) ||
           lowerText.includes(keyword.replace(' ', '')) ||
           lowerText.includes(keyword.replace(' ', '_'));
  });
}


function showAccountAnalysisModal(analysisResult) {
  const percentage = Math.round((analysisResult.totalScore / analysisResult.maxScore) * 100);

  const analysis = {
    confidence: analysisResult.overallConfidence,
    isAI: analysisResult.totalScore > 0,
    detectedTool: 'account-analysis',
    method: 'pattern-based-scoring',
    details: [
      `Overall Score: ${analysisResult.totalScore}/${analysisResult.maxScore} points (${percentage}%)`,
      `Confidence Level: ${analysisResult.overallConfidence}`,
      'Note: 30 points reserved for actual media metadata analysis (not performed)',
      'Scoring based on textual patterns and explicit AI declarations only'
    ],
    signatures: analysisResult.indicators.map(indicator => ({
      tool: 'pattern-scoring',
      signature: indicator.type,
      type: indicator.type,
      confidence: `${indicator.score}/${indicator.maxScore} points`,
      source: indicator.source,
      details: indicator.details
    })),
    fileInfo: { url: window.location.href }
  };

  showResultModal(analysis, window.location.href);
}

function analyzeVideoElement(video) {
  const analysis = {
    hasAIIndicators: false,
    indicators: [],
    score: 0
  };

  // Check video attributes for AI indicators
  const checkVideoAttribute = (attr, value) => {
    if (value && typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('ai') || lowerValue.includes('generated') ||
          lowerValue.includes('synthetic') || lowerValue.includes('midjourney') ||
          lowerValue.includes('dall-e') || lowerValue.includes('stable diffusion')) {
        analysis.hasAIIndicators = true;
        analysis.score += 15;
        analysis.indicators.push({
          type: 'video-attribute',
          attribute: attr,
          value: value,
          confidence: 'medium'
        });
      }
    }
  };

  // Check various video attributes
  checkVideoAttribute('alt', video.alt);
  checkVideoAttribute('title', video.title);
  checkVideoAttribute('aria-label', video.getAttribute('aria-label'));
  checkVideoAttribute('data-description', video.getAttribute('data-description'));

  // Check surrounding text context (caption, description)
  const videoContainer = video.closest('article, div[role="presentation"], .video-container, [data-testid*="post"]');
  if (videoContainer) {
    const textElements = videoContainer.querySelectorAll('span, p, div[aria-describedby], [data-testid*="caption"]');
    textElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text && text.length > 10) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('ai generated') || lowerText.includes('created with ai') ||
            lowerText.includes('midjourney') || lowerText.includes('dall-e') ||
            lowerText.includes('stable diffusion') || lowerText.includes('#aiart')) {
          analysis.hasAIIndicators = true;
          analysis.score += 20;
          analysis.indicators.push({
            type: 'video-context',
            text: text.substring(0, 100),
            confidence: 'high'
          });
        }
      }
    });
  }

  return analysis;
}

function scanSocialMediaContent() {
  // First check for account-level AI indicators
  analyzeAccountLevel();

  // Universal video scanning for all platforms
  const videoSelectors = [
    // Instagram
    'video[src*="instagram"]', 'video[src*="cdninstagram"]',
    // Twitter/X
    'video[src*="twitter"]', 'video[src*="twimg"]', 'video[src*="x.com"]',
    // TikTok
    'video[src*="tiktok"]', 'video[src*="tiktokcdn"]', 'video[src*="byteoversea"]',
    // Facebook (enhanced selectors)
    'video[src*="facebook"]', 'video[src*="fbcdn"]', 'video[src*="fbsbx"]',
    'video[src*="xx.fbcdn"]', 'video[src*="scontent"]',
    '[data-pagelet*="FeedUnit"] video', '[role="article"] video',
    '[data-testid="post_message"] video', 'div[role="feed"] video',
    // YouTube
    'video[src*="youtube"]', 'video[src*="ytimg"]',
    // LinkedIn
    'video[src*="linkedin"]', 'video[src*="licdn"]',
    // Generic video elements
    'video[poster]', 'video[preload]'
  ];

  const videos = document.querySelectorAll(videoSelectors.join(', '));
  videos.forEach(video => {
    if (!video.dataset.botOrNotScanned && (video.src || video.poster) && !isProfileImage(video) && !isModalImage(video)) {
      video.dataset.botOrNotScanned = 'true';

      // Enhanced video analysis - check multiple sources
      const videoUrl = video.src || video.poster;
      const videoAnalysis = analyzeVideoElement(video);

      if (videoUrl || videoAnalysis.hasAIIndicators) {
        addBotIcon(video, videoUrl || 'video-metadata', 'video', videoAnalysis);
      }
    }
  });

  // Universal image scanning for all platforms
  const imageSelectors = [
    // Instagram
    'img[src*="instagram"]', 'img[src*="cdninstagram"]',
    // Twitter/X
    'img[src*="twitter"]', 'img[src*="twimg"]', 'img[src*="x.com"]',
    // TikTok
    'img[src*="tiktok"]', 'img[src*="tiktokcdn"]',
    // Facebook (enhanced selectors)
    'img[src*="facebook"]', 'img[src*="fbcdn"]', 'img[src*="fbsbx"]',
    'img[src*="xx.fbcdn"]', 'img[src*="scontent"]',
    '[data-pagelet*="FeedUnit"] img', '[role="article"] img',
    '[data-testid="post_message"] img', 'div[role="feed"] img',
    '[data-testid="photo"] img', '[data-testid="story-card-photo"] img',
    // YouTube thumbnails
    'img[src*="youtube"]', 'img[src*="ytimg"]',
    // LinkedIn
    'img[src*="linkedin"]', 'img[src*="licdn"]',
    // Discord
    'img[src*="discord"]', 'img[src*="discordapp"]',
    // Reddit
    'img[src*="reddit"]', 'img[src*="redd.it"]',
    // Generic content images (larger than 200px to avoid small UI elements)
    'img[width]:not([width="1"]):not([width="0"])',
    'img[height]:not([height="1"]):not([height="0"])',
    // Catch-all for test pages and any missed images (but will be filtered by isContentImage)
    'img'
  ];

  const images = document.querySelectorAll(imageSelectors.join(', '));

  images.forEach(img => {
    if (!img.dataset.botOrNotScanned && img.src && !isProfileImage(img) && isContentImage(img) && !isModalImage(img)) {
      img.dataset.botOrNotScanned = 'true';
      addBotIcon(img, img.src, 'image');
    } else {
    }
  });
}

function isProfileImage(element) {
  // Enhanced profile image detection for multiple platforms
  const profileIndicators = [
    // Universal profile image selectors
    'img[alt*="profile"]', 'img[alt*="Profile"]',
    'img[alt*="avatar"]', 'img[alt*="Avatar"]',
    'img[alt*="user"]', 'img[alt*="User"]',

    // Instagram
    '[data-testid*="profile"] img',

    // Twitter/X
    '[data-testid="UserAvatar"] img',
    '[data-testid="Tweet-User-Avatar"] img',

    // Facebook (enhanced profile detection)
    '[aria-label*="profile"] img',
    '[role="img"][aria-label*="profile"]',
    '[data-testid="profile_picture"] img',
    '[data-testid="user_avatar"] img',
    'a[role="link"][aria-label*="Profile"] img',
    '[data-pagelet*="ProfilePicture"] img',
    '.profilePicture img',

    // Universal selectors
    '[role="button"] img', // Profile buttons
    'a[role="link"] img', // Profile links in headers
    '.avatar img',
    '[class*="avatar"] img',
    '[class*="profile"] img',
    '[class*="user-photo"] img',
    '[class*="user-image"] img'
  ];

  // Check if element matches profile image patterns
  for (const selector of profileIndicators) {
    if (element.matches && element.matches(selector)) {
      return true;
    }
  }

  // Check if element is inside a profile container
  const profileContainers = [
    // Universal containers
    '[data-testid*="profile"]',
    '[data-testid*="avatar"]',
    '[data-testid*="user"]',
    '[class*="profile"]',
    '[class*="avatar"]',
    '[class*="user-info"]',
    '[class*="user-card"]',

    // Navigation and header areas
    'header img',
    'nav img',
    '[role="banner"] img',

    // Comment/reply author avatars
    '[class*="comment"] img',
    '[class*="reply"] img',
    '[class*="author"] img'
  ];

  for (const containerSelector of profileContainers) {
    if (element.closest && element.closest(containerSelector)) {
      return true;
    }
  }

  // Check image size - profile images are typically small and square
  const rect = element.getBoundingClientRect();
  if (rect.width <= 80 && rect.height <= 80 && Math.abs(rect.width - rect.height) <= 15) {
    return true; // Small square-ish images are likely profile pics
  }

  // Check alt text for profile indicators
  const altText = (element.alt || '').toLowerCase();
  const profileKeywords = [
    'profile', 'avatar', 'user', "'s profile picture",
    'profile photo', 'profile image', 'user avatar',
    'author', 'creator', 'account'
  ];
  if (profileKeywords.some(keyword => altText.includes(keyword))) {
    return true;
  }

  // Check src URL for profile indicators
  const srcUrl = (element.src || '').toLowerCase();
  const profileUrlPatterns = [
    'profile', 'avatar', 'user_', 'users/', 'profile_',
    'thumb_', 'small_', '_s.', '_small.'
  ];
  if (profileUrlPatterns.some(pattern => srcUrl.includes(pattern))) {
    return true;
  }

  return false;
}

function isContentImage(element) {
  // Additional check to ensure we're only analyzing content images, not UI elements
  const rect = element.getBoundingClientRect();

  // Skip very small images (likely UI elements, icons, etc.)
  if (rect.width < 100 || rect.height < 100) {
    return false;
  }

  // Skip images that are clearly UI elements
  const uiIndicators = [
    '[class*="icon"]', '[class*="logo"]', '[class*="emoji"]',
    '[class*="button"]', '[class*="badge"]', '[class*="flag"]'
  ];

  for (const selector of uiIndicators) {
    if (element.matches && element.matches(selector)) {
      return false;
    }
  }

  // Check if image is inside a content area OR if it's large enough to be content
  const contentContainers = [
    'article', 'main', '[role="main"]', '.post', '.content',
    '[data-testid*="post"]', '[data-testid*="tweet"]',
    '[class*="post"]', '[class*="content"]', '[class*="feed"]'
  ];

  const hasContentContainer = contentContainers.some(selector =>
    element.closest && element.closest(selector)
  );

  // If it's in a content container, it's definitely content
  if (hasContentContainer) {
    return true;
  }

  // If not in a content container, check if it's large enough to be content
  // Images larger than 200x200 are likely content images
  if (rect.width >= 200 && rect.height >= 200) {
    return true;
  }

  // For test pages or simple layouts, be more permissive
  // If the image has a meaningful src and isn't a profile image, analyze it
  if (element.src && element.src !== 'data:image/svg+xml' && !isProfileImage(element)) {
    return true;
  }

  return false;
}

function isModalImage(element) {
  // Check if image is inside a Bot or Not modal (prevent redundant analyze buttons)
  if (element.closest('#bot-or-not-modal') || element.closest('.bot-or-not-modal')) {
    return true;
  }

  // Check if image is inside any modal/popup/overlay
  const modalIndicators = [
    '[role="dialog"]', '[role="alertdialog"]', '.modal', '.popup', '.overlay',
    '.lightbox', '.dialog', '[aria-modal="true"]', '.bot-or-not-image-preview'
  ];

  for (const selector of modalIndicators) {
    if (element.closest && element.closest(selector)) {
      return true;
    }
  }

  return false;
}


function addBotIcon(element, srcUrl, mediaType, videoAnalysis = null) {
  // Create enhanced circular bot icon with progress ring
  const iconContainer = document.createElement('div');
  iconContainer.className = 'bot-or-not-icon';

  // Create SVG progress ring
  const svgProgress = `
    <svg class="progress-ring" width="48" height="48" viewBox="0 0 48 48">
      <circle class="progress-ring-bg" cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.2)" stroke-width="3" fill="none"/>
      <circle class="progress-ring-fill" cx="24" cy="24" r="20" stroke="url(#confidenceGradient)" stroke-width="3" fill="none"
              stroke-dasharray="125.66" stroke-dashoffset="125.66" transform="rotate(-90 24 24)"/>
      <defs>
        <linearGradient id="confidenceGradient" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ff4757"/>
          <stop offset="100%" stop-color="#ff6b7a"/>
        </linearGradient>
      </defs>
    </svg>
  `;

  // Start with simple loading state
    iconContainer.innerHTML = `
      <div class="icon-content">
        <img class="bot-icon" src="${chrome.runtime.getURL('assets/icons/bot.png')}" alt="Bot" style="width: 16px; height: 16px;">
        <span class="bot-confidence loading">...</span>
      </div>
    `;

  // Position the icon inside the image element
  element.style.position = 'relative';
  element.parentElement.appendChild(iconContainer);

  // Analyze content immediately and update icon
  analyzeAndUpdateIcon(iconContainer, element, srcUrl, mediaType, videoAnalysis);

  return iconContainer;
}

async function analyzeAndUpdateIcon(iconContainer, element, srcUrl, mediaType, videoAnalysis = null) {
  try {
    const analyzer = new BotOrNotAnalyzer();
    let analysis;

    if (mediaType === 'video' && videoAnalysis && videoAnalysis.hasAIIndicators) {
      // For videos with AI indicators in metadata, create enhanced analysis
      analysis = {
        confidence: videoAnalysis.score > 30 ? 'high' : videoAnalysis.score > 15 ? 'medium' : 'low',
        isAI: true,
        detectedTool: 'video-metadata',
        method: 'metadata-based',
        details: [
          `Video analysis score: ${videoAnalysis.score}/100`,
          `Found ${videoAnalysis.indicators.length} AI indicators in video metadata/context`
        ],
        signatures: videoAnalysis.indicators.map(ind => ({
          tool: 'video-metadata',
          signature: ind.text || ind.value || ind.attribute,
          type: ind.type,
          confidence: ind.confidence,
          details: `${ind.type}: ${ind.text || ind.value || ind.attribute}`
        })),
        fileInfo: { url: srcUrl, type: 'video' },
        aiScore: videoAnalysis.score,
        maxScore: 100
      };
    } else if (srcUrl && srcUrl !== 'video-metadata') {
      // Use unified analysis system - pass element for better analysis
      analysis = await analyzer.analyzeMedia(srcUrl, mediaType, element);

      // The unified analysis system already includes CGI detection with filter analysis
      // No need for redundant CGI detection here
    } else {
      // Fallback for videos without clear URLs
      analysis = {
        confidence: 'none',
        isAI: false,
        detectedTool: null,
        method: 'no-analysis',
        details: ['No video URL or metadata available for analysis'],
        signatures: [],
        fileInfo: { type: 'video' },
        aiScore: 0,
        maxScore: 100
      };
    }

    // Update icon based on analysis results
    updateIconDisplay(iconContainer, analysis, srcUrl);

  } catch (error) {
    // Show error state
    iconContainer.innerHTML = `
      <img class="bot-icon" src="${chrome.runtime.getURL('assets/icons/icon16.png')}" alt="Bot" style="width: 16px; height: 16px;">
      <span class="bot-confidence error">err</span>
    `;
    iconContainer.title = 'Analysis failed';
  }
}

function updateIconDisplay(iconContainer, analysis, srcUrl) {
  // Use the unified AI score if available, otherwise fall back to old method
  const isAI = analysis.isAI || analysis.signatures?.length > 0;
  let confidenceLevel = analysis.confidence || 'none';
  let confidenceScore = analysis.aiScore || 0;

  // Check for high CGI confidence (80%+) - always show badge
  const hasHighCGIConfidence = analysis.cgiDetection && analysis.cgiDetection.confidence >= 80;
  
  // Only show badge for AI-detected images or high CGI confidence
  if (!isAI && confidenceScore < 35 && !hasHighCGIConfidence) {
    iconContainer.style.display = 'none';
    return;
  }

  // Make sure badge is visible for AI content
  iconContainer.style.display = 'flex';

  const confidenceToScore = { high: 85, medium: 50, low: 25, none: 0 };

  // If no aiScore, calculate from confidence level for backwards compatibility
  if (!analysis.aiScore && isAI) {
    const hasClearTool = analysis.detectedTool && analysis.detectedTool !== 'unknown' &&
      !analysis.detectedTool.includes('CGI Detection') &&
      !analysis.detectedTool.includes('video-metadata');

    if (hasHighCGIConfidence || hasClearTool) {
      confidenceScore = 100;
      confidenceLevel = 'high';
    } else {
      confidenceScore = confidenceToScore[analysis.confidence] || 25; // Default to 25 if low
    }
  }

  // Enhanced color scheme with gradients
  const colors = {
    'high': {
      primary: '#ff4757',
      secondary: '#ff6b7a',
      text: '#ffffff',
      bg: 'rgba(255, 71, 87, 0.9)',
      gradient: 'linear-gradient(135deg, #ff4757, #ff6b7a)'
    },
    'medium': {
      primary: '#ffa502',
      secondary: '#ffb627',
      text: '#ffffff',
      bg: 'rgba(255, 165, 2, 0.9)',
      gradient: 'linear-gradient(135deg, #ffa502, #ffb627)'
    },
    'low': {
      primary: '#3742fa',
      secondary: '#4a5bff',
      text: '#ffffff',
      bg: 'rgba(55, 66, 250, 0.9)',
      gradient: 'linear-gradient(135deg, #3742fa, #4a5bff)'
    },
    'none': {
      primary: '#747d8c',
      secondary: '#9ca3af',
      text: '#ffffff',
      bg: 'rgba(116, 125, 140, 0.9)',
      gradient: 'linear-gradient(135deg, #747d8c, #9ca3af)'
    }
  };

  const color = colors[confidenceLevel];

  // Add enhanced styling with black semi-transparent background
  if (!iconContainer.style.cssText.includes('position')) {
    iconContainer.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 2px solid ${color.primary};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    `;
  }

  // Calculate progress ring offset (circumference = 2πr = 125.66)
  const circumference = 125.66;
  const progressOffset = circumference - (confidenceScore / 100) * circumference;

  // Update gradient colors for progress ring
  const progressRing = iconContainer.querySelector('.progress-ring-fill');
  const gradient = iconContainer.querySelector('#confidenceGradient');
  if (gradient) {
    gradient.innerHTML = `
      <stop offset="0%" stop-color="${color.primary}"/>
      <stop offset="100%" stop-color="${color.secondary}"/>
    `;
  }

  // Update icon content
  const iconContent = `
    <svg class="progress-ring" width="48" height="48" viewBox="0 0 48 48" style="position: absolute; top: 0; left: 0;">
      <circle class="progress-ring-bg" cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.2)" stroke-width="3" fill="none"/>
      <circle class="progress-ring-fill" cx="24" cy="24" r="20" stroke="url(#confidenceGradient)" stroke-width="3" fill="none"
              stroke-dasharray="125.66" stroke-dashoffset="${progressOffset}" transform="rotate(-90 24 24)"
              style="transition: stroke-dashoffset 0.8s ease-in-out;"/>
      <defs>
        <linearGradient id="confidenceGradient" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${color.primary}"/>
          <stop offset="100%" stop-color="${color.secondary}"/>
        </linearGradient>
      </defs>
    </svg>
    <div class="icon-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 1; position: relative; width: 100%; height: 100%;">
      <img class="bot-icon" src="${chrome.runtime.getURL('assets/icons/icon32.png')}" alt="Bot" style="width: 16px; height: 16px; margin-bottom: 1px;">
      <span class="bot-confidence" style="font-size: 10px; font-weight: 700; color: ${color.primary}; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${confidenceScore}%</span>
    </div>
  `;

  iconContainer.innerHTML = iconContent;

  // Add data attribute for 100% confidence styling
  if (confidenceScore >= 100) {
    iconContainer.setAttribute('data-confidence', '100');
    iconContainer.classList.add('confidence-100');
  } else {
    iconContainer.removeAttribute('data-confidence');
    iconContainer.classList.remove('confidence-100');
  }

  // Update tooltip
  iconContainer.title = isAI
    ? `AI Detected: ${confidenceScore}% confidence${analysis.detectedTool ? ` (${formatToolName(analysis.detectedTool)})` : ''}`
    : 'No AI signatures detected';

  // Add click handler to show modal
  iconContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showResultModal(analysis, srcUrl);
  });

  // Enhanced hover effects with scale and glow
  iconContainer.addEventListener('mouseenter', () => {
    iconContainer.style.transform = 'scale(1.1)';
    iconContainer.style.boxShadow = `0 6px 20px rgba(0, 0, 0, 0.4), 0 0 20px ${color.primary}40, 0 0 0 2px ${color.primary}30`;
    iconContainer.style.background = `linear-gradient(135deg, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.6))`;
  });

  iconContainer.addEventListener('mouseleave', () => {
    iconContainer.style.transform = 'scale(1)';
    iconContainer.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)';
    iconContainer.style.background = 'rgba(0, 0, 0, 0.7)';
  });
}

// Initialize auto-scan when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoScan);
} else {
  initAutoScan();
}

function getConfidenceColor(confidence) {
  const confidenceColors = {
    'high': '#e74c3c',
    'medium': '#f39c12',
    'low': '#3498db',
    'none': '#27ae60',
    'blocked': '#9b59b6',
    'error': '#95a5a6'
  };
  return confidenceColors[confidence] || '#95a5a6';
}

function getResultText(analysis) {
  if (analysis.confidence === 'blocked') return '🚫 Analysis Blocked (CORS)';
  if (analysis.confidence === 'error') return '❌ Analysis Failed';
  if (analysis.isAI) return `🤖 AI Generated (${analysis.confidence} confidence)`;
  return '👨‍🎨 Likely Human Created';
}

function getToolText(analysis) {
  return analysis.detectedTool && analysis.detectedTool !== 'unknown' ?
    formatToolName(analysis.detectedTool) : '';
}

function createSignaturesHtml(signatures) {
  if (!signatures || signatures.length === 0) return '';
  return `
    <div class="bot-or-not-collapsible">
      <div class="collapsible-header">
        <span>🔍 Found Signatures (${signatures.length})</span>
        <span class="collapsible-icon">${signatures.length > 1 ? '▼' : ''}</span>
      </div>
      <div class="collapsible-content ${signatures.length > 1 ? 'scrollable' : ''}">
        <div class="signatures-list">
          ${signatures.map(sig => `
            <div class="signature-item confidence-${sig.confidence}">
              <div class="sig-header">
                <span class="sig-tool">${formatToolName(sig.tool)}</span>
                <span class="sig-confidence">${sig.confidence}</span>
              </div>
              <div class="sig-details">${sig.details}</div>
              <div class="sig-source">Source: ${sig.source}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function createSummaryHtml(analysis) {
  if (!analysis.aiScore && !analysis.cgiDetection && !analysis.compositionAnalysis) return '';

  const aiScoreHtml = analysis.aiScore ? `
    <div class="summary-item">
      <span class="summary-label">AI Score:</span>
      <span class="summary-value" style="color: ${analysis.aiScore > 70 ? '#ff4757' : analysis.aiScore > 45 ? '#ffa502' : analysis.aiScore > 25 ? '#4a9eff' : '#27ae60'}">${analysis.aiScore}/${analysis.maxScore || 100}</span>
    </div>` : '';

  const cgiDetectionHtml = analysis.cgiDetection ? `
    <div class="summary-item">
      <span class="summary-label">CGI Confidence:</span>
      <span class="summary-value" style="color: ${analysis.cgiDetection.confidence > 70 ? '#ff4757' : analysis.cgiDetection.confidence > 50 ? '#ffa502' : '#4a9eff'}">${analysis.cgiDetection.confidence}%</span>
    </div>
    ${analysis.cgiDetection.metrics.uniqueColors ? `
    <div class="summary-item">
      <span class="summary-label">Colors:</span>
      <span class="summary-value">${analysis.cgiDetection.metrics.uniqueColors}</span>
    </div>` : ''}` : '';

  const compositionAnalysisHtml = analysis.compositionAnalysis ? `
    <div class="summary-item">
      <span class="summary-label">Composition:</span>
      <span class="summary-value" style="color: ${analysis.compositionAnalysis.confidence >= 80 ? '#ff4757' : analysis.compositionAnalysis.confidence >= 60 ? '#ffa502' : '#4a9eff'}">${analysis.compositionAnalysis.confidence}%</span>
    </div>` : '';

    const filtersDetectedHtml = analysis.cgiDetection && analysis.cgiDetection.metrics.filtersDetected && analysis.cgiDetection.metrics.filtersDetected.length > 0 ? `
    <div class="summary-item">
      <span class="summary-label">Filters:</span>
      <span class="summary-value" style="color: #ffa726">${analysis.cgiDetection.metrics.filtersDetected.length} detected</span>
    </div>` : '';

  return `
    <div class="bot-or-not-analysis-summary">
      <h4>📊 Analysis Summary</h4>
      <div class="summary-metrics">
        ${aiScoreHtml}
        ${cgiDetectionHtml}
        ${compositionAnalysisHtml}
        ${filtersDetectedHtml}
      </div>
    </div>`;
}

function createFiltersHtml(cgiDetection) {
  if (!cgiDetection || !cgiDetection.metrics.filtersDetected || cgiDetection.metrics.filtersDetected.length === 0) return '';
  return `
    <div class="bot-or-not-collapsible">
      <div class="collapsible-header">
        <h4>🎨 Filter Analysis</h4>
        <span class="collapsible-icon">▼</span>
      </div>
      <div class="collapsible-content default-collapsed">
        <div class="filter-analysis">
          ${cgiDetection.metrics.filtersDetected.map(filter => `
            <div class="filter-item">
              <div class="filter-header">
                <span class="filter-name">${filter.name}</span>
                <span class="filter-confidence" style="background: ${filter.confidence > 70 ? '#ff4757' : filter.confidence > 50 ? '#ffa726' : '#4a9eff'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${Math.round(filter.confidence)}%</span>
              </div>
              <div class="filter-description">${filter.description}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

function createModalHtml(analysis, srcUrl) {
  const confidenceColor = getConfidenceColor(analysis.confidence);
  const resultText = getResultText(analysis);
  const toolText = getToolText(analysis);
  const signaturesHtml = createSignaturesHtml(analysis.signatures);
  const summaryHtml = createSummaryHtml(analysis);
  const filtersHtml = createFiltersHtml(analysis.cgiDetection);

  return `
    <div class="bot-or-not-modal-content">
      <div class="bot-or-not-header">
        <h3>🔎 Bot or Not? Analysis</h3>
        <button class="bot-or-not-close">&times;</button>
      </div>
      <div class="bot-or-not-body">
        <div class="bot-or-not-result" style="border-color: ${confidenceColor}">
          <div class="result-main">${resultText}</div>
          ${toolText ? `<div class="result-tool">🛠️ ${toolText}</div>` : ''}
          <div class="result-method">Method: ${analysis.method}</div>
        </div>
        ${signaturesHtml}
        ${summaryHtml}
        ${filtersHtml}
        <div class="bot-or-not-image-preview">
          <img src="${srcUrl}" alt="Analyzed media" style="max-width: 200px; max-height: 150px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;">
        </div>
        <div class="bot-or-not-collapsible">
          <div class="collapsible-header">
            <h4>📋 Technical Details</h4>
            <span class="collapsible-icon">▶</span>
          </div>
          <div class="collapsible-content default-collapsed scrollable">
            <ul>
              ${analysis.details.map(detail => `<li>${detail}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
      <div class="bot-or-not-footer">
        <button class="bot-or-not-btn bot-or-not-close-btn">Copy & Close</button>
      </div>
    </div>
  `;
}

function showResultModal(analysis, srcUrl) {
  removeExistingModal();

  const modal = document.createElement('div');
  modal.id = 'bot-or-not-modal';
  modal.className = 'bot-or-not-modal';
  modal.innerHTML = createModalHtml(analysis, srcUrl);

  document.body.appendChild(modal);

  modal.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const icon = header.querySelector('.collapsible-icon');
      const isCollapsed = content.classList.contains('default-collapsed') || content.style.display === 'none';
      if (isCollapsed) {
        content.classList.remove('default-collapsed');
        content.style.display = 'block';
        if (icon) icon.textContent = '▼';
      } else {
        content.style.display = 'none';
        if (icon) icon.textContent = '▶';
      }
    });
  });

  // Add event listeners for buttons
  const closeButtons = modal.querySelectorAll('.bot-or-not-close, .bot-or-not-close-btn');
  closeButtons.forEach(button => {
    button.addEventListener('click', () => modal.remove());
  });

  // Handle Copy & Close button
  const copyCloseButton = modal.querySelector('.bot-or-not-close-btn');
  if (copyCloseButton) {
    copyCloseButton.addEventListener('click', (e) => {
      // Copy analysis results to clipboard
      const copyText = `Bot or Not Analysis Results:
${analysis.isAI ? '🤖 AI Generated' : '👨‍🎨 Likely Human Created'} (${analysis.confidence} confidence)
${analysis.detectedTool ? `Tool: ${analysis.detectedTool}` : ''}
Method: ${analysis.method}

${analysis.signatures && analysis.signatures.length > 0 ? 'Signatures Found:' : ''}
${analysis.signatures ? analysis.signatures.map(sig => `- ${sig.tool}: ${sig.signature}`).join('\n') : ''}

${analysis.details ? 'Details:' : ''}
${analysis.details ? analysis.details.map(detail => `- ${detail}`).join('\n') : ''}`;

      navigator.clipboard.writeText(copyText).then(() => {
        // Show brief feedback before closing
        e.target.textContent = 'Copied!';
        setTimeout(() => {
          modal.remove();
        }, 500);
      }).catch(() => {
        // If copy fails, just close
        modal.remove();
      });
    });
  }

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  setTimeout(() => modal.classList.add('show'), 10);
}

function formatToolName(tool) {
  if (!tool) return 'Unknown';

  const toolNames = {
    'dall-e': 'DALL·E',
    'chatgpt-dalle': 'ChatGPT DALL·E',
    'bing-creator': 'Bing Image Creator',
    'stable-diffusion': 'Stable Diffusion',
    'midjourney': 'Midjourney',
    'firefly': 'Adobe Firefly',
    'leonardo': 'Leonardo AI',
    'nano-banana': 'Nano Banana (Google AI)',
    'ideogram': 'Ideogram AI',
    'runway': 'RunwayML',
    'imagen': 'Google Imagen',
    'artbreeder': 'Artbreeder',
    'deepai': 'DeepAI',
    'novelai': 'NovelAI',
    'nightcafe': 'NightCafe',
    'playground-ai': 'Playground AI',
    'jasper-art': 'Jasper Art',
    'canva-ai': 'Canva AI',
    'photoshop-ai': 'Photoshop AI',
    'craiyon': 'Craiyon',
    'comfyui': 'ComfyUI',
    'automatic1111': 'AUTOMATIC1111',
    'invokeai': 'InvokeAI',
    'ai-upscaler': 'AI Upscaler',
    'generic-ai': 'AI Generated',
    'verified-ai-service': 'AI Service',
    'content-pattern': 'Content Pattern',
    'account-analysis': 'Account Analysis',
    'account-pattern': 'Account Pattern'
  };

  return toolNames[tool] || tool.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function copyAnalysisResults(encodedAnalysis, buttonElement) {
  try {
    const analysis = JSON.parse(decodeURIComponent(encodedAnalysis));
    const results = {
      isAI: analysis.isAI,
      confidence: analysis.confidence,
      tool: analysis.detectedTool,
      signatures: analysis.signatures?.length || 0,
      method: analysis.method,
      timestamp: new Date().toISOString()
    };

    navigator.clipboard.writeText(JSON.stringify(results, null, 2)).then(() => {
      // Show brief feedback
      if (buttonElement) {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        setTimeout(() => buttonElement.textContent = originalText, 1500);
      }
    }).catch(error => {
      if (buttonElement) {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copy Failed';
        setTimeout(() => buttonElement.textContent = originalText, 1500);
      }
    });
  } catch (error) {
  }
}

function removeExistingModal() {
  const existingModal = document.getElementById('bot-or-not-modal');
  if (existingModal) {
    existingModal.remove();
  }
}