# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bot or Not** is a Chrome Extension (Manifest V3) that detects AI-generated content in images and videos by analyzing metadata, headers, and electronic signatures. The extension provides real-time analysis through context menus and auto-scanning with visual indicators.

## Architecture

### Core Components

The extension follows a modular architecture with these key components:

- **Service Worker** (`src/js/background.js`): Handles context menus, file fetching with caching, and message routing
- **Content Script** (`src/js/content.js`): Main analyzer, DOM manipulation, modal management, and auto-scanning
- **Header Parser** (`src/js/headerParser.js`): Lightweight file header analysis and signature detection
- **CGI Detector** (`src/js/cgiDetector.js`): Color analysis and visual characteristic detection for CGI/editing detection
- **Settings Interface** (`src/js/settings.js` + `src/html/settings.html`): User preferences and configuration

### Detection System

The extension uses a multi-layered detection approach:

1. **Signature Detection**: Scans file headers and metadata for AI tool signatures using `src/signatures.json`
2. **CGI Analysis**: Analyzes color distribution and gradients to detect computer-generated imagery
3. **Metadata Analysis**: Examines EXIF data, XMP markers, and C2PA signatures
4. **URL Pattern Matching**: Identifies known AI platform hosting patterns

### File Structure

```
src/
├── config/
│   └── config.js              # Centralized configuration and feature flags
├── html/
│   ├── modal.html             # Analysis results modal template
│   └── settings.html          # Extension popup/settings
├── js/
│   ├── background.js          # Service worker with file fetching and caching
│   ├── content.js             # Main analyzer with auto-scanning and UI
│   ├── headerParser.js        # File header analysis and signature matching
│   ├── cgiDetector.js         # CGI and photo editing detection
│   └── settings.js            # Settings interface controller
├── styles/
│   ├── modal.css              # Modal styling with animations
│   └── settings.css           # Settings popup styling
└── signatures.json            # AI tool signatures database
```

## Key Development Patterns

### Analysis Pipeline

The main analysis flow follows this pattern:

1. **File Fetching**: Background script fetches media with caching via `chrome.storage.local`
2. **Header Analysis**: `HeaderParser` class analyzes file headers for signatures
3. **CGI Detection**: `CGIDetector` class analyzes visual characteristics (for images only)
4. **Result Aggregation**: `BotOrNotAnalyzer` combines all detection methods
5. **UI Display**: Results shown via modal interface with collapsible sections

### Auto-Scanning System

The extension automatically scans social media content using:

- **Image Filtering**: Excludes profile images, icons, and UI elements
- **Platform Detection**: Recognizes major social platforms (Instagram, Twitter, etc.)
- **Visual Indicators**: Adds circular progress icons showing confidence levels
- **Lazy Analysis**: Only analyzes when icons are added, not immediately

### Caching Strategy

Background script implements smart caching:

- **URL-based Keys**: Uses base64-encoded URL fragments as cache keys
- **1-hour TTL**: Cache entries expire after 1 hour
- **Size Limits**: Skips files larger than 50MB
- **Fallback Headers**: Multiple fetch strategies for CORS issues

## Testing and Debugging

Since this is a Chrome extension with no build process:

### Development Workflow

1. **Load Extension**: Use chrome://extensions/ with Developer Mode enabled
2. **Test Changes**: Reload extension after code changes
3. **Console Debugging**: Use browser DevTools for content script debugging
4. **Background Debugging**: Use extension's service worker DevTools

### Testing Strategy

- **Manual Testing**: Right-click images/videos to test analysis
- **Social Media Testing**: Visit Instagram, Twitter, etc. to test auto-scanning
- **Error Handling**: Test with various image formats and sizes
- **Performance Testing**: Monitor cache usage and memory consumption

### Common Issues

- **CORS Errors**: Some images blocked by cross-origin policies
- **Large Files**: Files >50MB are automatically skipped
- **Cache Conflicts**: Clear `chrome.storage.local` if testing cache logic
- **Platform Changes**: Social media layout changes may break selectors

## Configuration

### Feature Flags

The `src/config/config.js` file contains all configurable options:

- **Detection thresholds**: Color count limits, confidence levels
- **File size limits**: Maximum analysis size (currently 64KB headers, 50MB total)
- **UI settings**: Icon sizes, modal dimensions, animations
- **Platform detection**: URL patterns for social media sites

### Signatures Database

The `src/signatures.json` file contains AI tool signatures:

- **Case-insensitive matching**: All signatures converted to lowercase
- **Tool detection**: Maps signatures to AI tool names
- **Expandable**: Add new signatures as AI tools evolve

## Security Considerations

- **Local Processing**: All analysis happens client-side, no data sent to external servers
- **Content Security Policy**: Strict CSP prevents external script execution
- **File Size Limits**: Prevents memory exhaustion from large files
- **Permission Model**: Uses minimal required permissions (activeTab, contextMenus, storage)

## Performance Optimization

- **Lazy Loading**: Modal template and signatures loaded on-demand
- **Debounced Scanning**: Auto-scan uses 300ms debounce to prevent excessive DOM queries
- **Smart Caching**: Background caching reduces redundant network requests
- **Efficient Selectors**: Image filtering uses optimized CSS selectors
- **Memory Management**: Cache cleanup removes expired entries

This extension processes approximately 1,300 lines of JavaScript across 5 main modules, with no external dependencies and pure vanilla JavaScript implementation.

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md
