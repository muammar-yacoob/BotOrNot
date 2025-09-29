chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "botOrNot",
    title: "Bot or Not?",
    contexts: ["image", "video"],
    documentUrlPatterns: ["http://*/*", "https://*/*"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "botOrNot") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "analyzeMedia",
        srcUrl: info.srcUrl,
        mediaType: info.mediaType
      });
    } catch (error) {
      if (error.message.includes("Could not establish connection")) {
      } else {
      }
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getImageData") {
    // Enhanced caching system to avoid repeated fetches
    // Use URL-based cache key to avoid hash collisions
    const urlHash = btoa(message.url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
    const cacheKey = `media_${urlHash}`;

    // Check cache first (valid for 1 hour)
    chrome.storage.local.get([cacheKey, `${cacheKey}_timestamp`], async (result) => {
      const cachedData = result[cacheKey];
      const cachedTime = result[`${cacheKey}_timestamp`];
      const now = Date.now();

      // Use cache if less than 1 hour old and data exists
      // DISABLE CACHE temporarily to ensure fresh data for debugging
      // if (cachedData && cachedTime && (now - cachedTime < 3600000)) {
      //   sendResponse({ success: true, data: cachedData, cached: true });
      //   return;
      // }

      // Fetch fresh data
      try {
        
        // Try different fetch strategies
        let response;
        try {
          // First try with standard headers
          response = await fetch(message.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/*,video/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
        } catch (fetchError) {
          // Fallback with minimal headers
          response = await fetch(message.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');

        // Skip files larger than 50MB to avoid storage issues
        if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
          throw new Error('File too large (>50MB)');
        }

        const buffer = await response.arrayBuffer();
        const data = Array.from(new Uint8Array(buffer));

        // Cache the result
        const cacheData = {
          [cacheKey]: data,
          [`${cacheKey}_timestamp`]: now,
          [`${cacheKey}_contentType`]: contentType,
          [`${cacheKey}_url`]: message.url
        };

        chrome.storage.local.set(cacheData, () => {
          if (chrome.runtime.lastError) {
          } else {
          }
        });

        sendResponse({
          success: true,
          data: data,
          contentType: contentType,
          size: buffer.byteLength,
          cached: false
        });

      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });

    return true; // Async response
  }

  if (message.action === "clearCache") {
    // Clear old cache entries
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = [];
      const now = Date.now();

      for (const key in items) {
        if (key.startsWith('media_') && key.endsWith('_timestamp')) {
          const timestamp = items[key];
          if (now - timestamp > 3600000) { // Older than 1 hour
            const baseKey = key.replace('_timestamp', '');
            keysToRemove.push(key, baseKey, `${baseKey}_contentType`, `${baseKey}_url`);
          }
        }
      }

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          sendResponse({ success: true, cleared: keysToRemove.length / 4 });
        });
      } else {
        sendResponse({ success: true, cleared: 0 });
      }
    });

    return true;
  }
});