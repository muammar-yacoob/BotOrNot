# 🤖 AI Content Detection System

A comprehensive system for reliably detecting AI-generated content through image header analysis and metadata signature detection.

## 🎯 Features

- **Comprehensive Format Support**: JPEG, PNG, WebP, GIF, TIFF, AVIF, MP4
- **Deep Header Analysis**: Parses EXIF, XMP, text chunks, and custom metadata
- **Extensive AI Signature Database**: Covers 15+ major AI tools (DALL-E, Midjourney, Stable Diffusion, etc.)
- **Advanced Logging**: Detailed console output with highlighting and visual notifications
- **Confidence Scoring**: Multi-level confidence assessment (high/medium/low)
- **Real-time Detection**: Works with both files and web content
- **Export Capabilities**: JSON and CSV export of detection history

## 📁 Files Overview

```
AI Detection System/
├── headerParser.js         # Core header parsing and decompilation
├── signatures.js          # AI signature database and pattern matching
├── aiDetectionLogger.js   # Logging, highlighting, and reporting
└── testAIDetection.js     # Test suite and examples
```

## 🚀 Quick Start

### 1. Basic Usage

```javascript
// Initialize the system
const signatureDb = new SignatureDatabase();
const headerParser = new HeaderParser(signatureDb);
const logger = new AIDetectionLogger();

// Analyze an image file
async function analyzeImage(file) {
    const arrayBuffer = await file.arrayBuffer();
    const results = await headerParser.parseFile(arrayBuffer, file.name);
    const detection = logger.logDetection(results, file.name);

    return results;
}

// Usage with file input
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const results = await analyzeImage(file);
        console.log(`Confidence: ${results.confidence}, Signatures: ${results.signatures.length}`);
    }
});
```

### 2. Web Extension Integration

```javascript
// Content script integration
function scanPageImages() {
    const images = document.querySelectorAll('img');

    images.forEach(async (img) => {
        try {
            const response = await fetch(img.src);
            const arrayBuffer = await response.arrayBuffer();
            const results = await headerParser.parseFile(arrayBuffer, img.src);

            if (results.signatures.length > 0) {
                logger.logDetection(results, img.src);
                // Visual indicator will be added automatically
            }
        } catch (error) {
            console.log('Could not analyze image:', error);
        }
    });
}

// Scan images when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanPageImages);
} else {
    scanPageImages();
}
```

### 3. Running Tests

```javascript
// Run comprehensive test suite
runAIDetectionTests().then(results => {
    console.log('Test completed:', results.stats);
});

// Test with real file
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'image/*';
fileInput.onchange = (e) => testWithRealFile(e.target.files[0]);
document.body.appendChild(fileInput);
```

## 🔍 Detection Capabilities

### Supported AI Tools

| Tool | Signature Types | Confidence Level |
|------|----------------|------------------|
| **DALL-E / DALL-E 2/3** | EXIF, XMP, Comments | High |
| **Midjourney** | Parameters, Comments, URLs | High |
| **Stable Diffusion** | Parameters, EXIF, PNG chunks | High |
| **Adobe Firefly** | EXIF, XMP, Comments | High |
| **Bing Image Creator** | EXIF, Comments | High |
| **ChatGPT DALL-E** | EXIF, Comments | Medium |
| **Leonardo AI** | Comments, Metadata | Medium |
| **RunwayML** | Video metadata, Comments | Medium |
| **NovelAI** | Comments, Parameters | Medium |
| **NightCafe** | Comments, Metadata | Medium |
| **Playground AI** | Comments, Metadata | Medium |
| **Waifu2x/AI Upscalers** | Software tags, Comments | Medium |
| **Generic AI** | Common AI terms, Patterns | Low |

### File Format Support

- **JPEG**: EXIF data, JPEG comments, Adobe XMP
- **PNG**: tEXt, iTXt, zTXt chunks (including Stable Diffusion parameters)
- **WebP**: EXIF chunks, XMP chunks
- **GIF**: Comment extensions
- **TIFF**: IFD entries, EXIF data
- **AVIF**: ISOBMFF metadata boxes
- **MP4**: Atom metadata (for AI-generated videos)

## 📊 Output Format

```javascript
{
  fileType: "PNG",
  signatures: [
    {
      tool: "stable-diffusion",
      signature: "Steps: 20, Sampler: DPM++ 2M",
      type: "parameters",
      confidence: "high",
      source: "PNG tEXt",
      details: "Found SD parameters: Steps:, Sampler:, CFG scale:"
    }
  ],
  confidence: "high",
  filename: "ai_art.png",
  rawMetadata: {
    "PNG_tEXt": "Steps: 20, Sampler: DPM++ 2M Karras, CFG scale: 7..."
  },
  parseLog: [
    "[2024-01-15T10:30:00.000Z] [INFO] Starting parse...",
    "[2024-01-15T10:30:00.001Z] [WARN] AI signature detected..."
  ]
}
```

## 🎨 Visual Indicators

The system automatically adds visual indicators to detected AI content:

- **🤖 Floating Notifications**: Appear for high-confidence detections
- **Image Badges**: "🤖 AI" overlay on detected images
- **Console Highlighting**: Color-coded confidence levels
- **Browser Tooltips**: Hover information on detected content

## 📈 Statistics and Reporting

```javascript
// Get detection statistics
const stats = logger.getStats();
console.log(`Detection rate: ${stats.detectionRate}%`);
console.log(`Top tools: ${stats.topTools.map(t => t.tool).join(', ')}`);

// Export detection history
const jsonExport = logger.exportHistory('json');
const csvExport = logger.exportHistory('csv');

// Print detailed report
logger.printDetailedReport(detectionId);
```

## 🔧 Configuration Options

```javascript
// HeaderParser configuration
const headerParser = new HeaderParser(signatureDb);
headerParser.debugLog = true;  // Enable verbose logging

// Logger configuration
const logger = new AIDetectionLogger();
logger.highlightEnabled = true;   // Show visual indicators
logger.verboseLogging = true;     // Detailed console output
```

## 🎯 Advanced Usage Examples

### 1. Batch Processing

```javascript
async function processBatch(files) {
    const results = [];

    for (const file of files) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await headerParser.parseFile(arrayBuffer, file.name);
            results.push(result);
            logger.logDetection(result, file.name);
        } catch (error) {
            console.error(`Failed to process ${file.name}:`, error);
        }
    }

    return results;
}
```

### 2. Real-time Web Monitoring

```javascript
// Monitor for new images added to page
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'IMG') {
                analyzeImage(node);
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });
```

### 3. Custom Signature Detection

```javascript
// Add custom signatures to database
signatureDb.aiSignatures['custom-tool'] = {
    metadata: ['Custom AI Tool', 'custom.ai'],
    exif: ['Software: Custom AI'],
    comment: ['custom ai generated'],
    userComment: ['Custom AI Tool']
};

// Check for specific signature
const match = signatureDb.containsAISignature(text, 'metadata');
if (match) {
    console.log(`Found ${match.tool}: ${match.signature}`);
}
```

## 🛡️ Reliability Features

### 1. Magic Bytes Validation
- Verifies actual file format vs. extension
- Detects format spoofing attempts
- Supports multiple magic byte patterns

### 2. Multiple Signature Sources
- Cross-references EXIF, XMP, comments, and filenames
- Weighted confidence scoring
- Fallback to generic text analysis

### 3. Error Handling
- Graceful degradation for corrupted files
- Detailed error logging
- Safe binary data parsing

### 4. Performance Optimization
- Efficient binary parsing
- Configurable search limits
- Memory-conscious processing

## 🔬 Technical Details

### Header Parsing Process

1. **Magic Bytes Detection**: Identify file format from binary signature
2. **Format-Specific Parsing**: Use appropriate parser for each format
3. **Metadata Extraction**: Extract all text-based metadata fields
4. **Signature Matching**: Compare against known AI signature database
5. **Confidence Calculation**: Weight multiple indicators for final score
6. **Logging & Visualization**: Record results with detailed logging

### Signature Matching Algorithm

```javascript
// Multi-level matching with confidence weighting
const confidence = calculateConfidence(signatures);

function calculateConfidence(signatures) {
    const high = signatures.filter(s => s.confidence === 'high').length;
    const medium = signatures.filter(s => s.confidence === 'medium').length;
    const low = signatures.filter(s => s.confidence === 'low').length;

    if (high >= 1) return 'high';
    if (high + medium >= 2) return 'high';
    if (medium >= 1) return 'medium';
    if (low >= 2) return 'medium';
    if (low >= 1) return 'low';

    return 'none';
}
```

## 🚨 Limitations & Considerations

1. **Metadata Dependency**: Relies on embedded metadata (can be stripped)
2. **Evolving Signatures**: New AI tools may not be immediately detected
3. **False Positives**: Generic terms might trigger false detections
4. **Performance**: Large files may take longer to process
5. **Browser Limitations**: Some advanced features require appropriate permissions

## 🛠️ Browser Extension Integration

Add these files to your Chrome extension manifest:

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "signatures.js",
      "headerParser.js",
      "aiDetectionLogger.js",
      "content.js"
    ]
  }],
  "permissions": [
    "activeTab",
    "storage"
  ]
}
```

## 📝 License

This AI detection system is designed for defensive security analysis only. Use responsibly to identify AI-generated content for transparency and authenticity verification.

---

**🎉 Ready to detect AI content with confidence!**

Run `runAIDetectionTests()` in your browser console to see the system in action.