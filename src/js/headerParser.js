// Barebones File Header Parser
// Minimal header/text extraction and AI signature matching

class HeaderParser {
  constructor(signatureDb) {
    this.signatureDb = signatureDb;
    this.textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
  }

  // Public API: parse a file buffer and return simple results
  async parseFile(arrayBuffer, filename = '') {
    const uint8Array = new Uint8Array(arrayBuffer);

    const results = {
      fileType: this.detectFileType(uint8Array),
      signatures: [],
      confidence: 'none',
      details: [],
      rawMetadata: {},
      filename
    };

    try {
      // Read a small slice of the file for quick metadata/signature checks
      const headerSlice = uint8Array.slice(0, Math.min(65536, uint8Array.length));
      const headerText = this.safeDecode(headerSlice);

      // Store a small preview for debugging
      if (headerText) {
        results.rawMetadata.HeaderPreview = headerText.substring(0, 500);
      }

      // Run signature matching on header preview
      this.checkForAISignatures(headerText, 'File Header', results);

      // Lightweight, format-specific hints
      switch (results.fileType) {
        case 'JPEG':
          if (/exif/i.test(headerText)) results.details.push('EXIF marker present');
          if (/xmp|http:\/\/ns\.adobe\.com\/xap\/1\.0\//i.test(headerText)) results.details.push('XMP marker present');
          break;
        case 'PNG':
          if (/c2pa/i.test(headerText)) results.details.push('C2PA marker present');
          if (/eXIf/i.test(headerText)) results.details.push('PNG eXIf marker present');
          break;
        default:
          break;
      }

      // Confidence is simply presence of signatures
      results.confidence = results.signatures.length > 0 ? 'high' : 'none';
    } catch (error) {
      results.details.push(`Header parse error: ${error.message}`);
    }

    return results;
  }

  // Minimal file type detection via magic bytes
  detectFileType(uint8Array) {
    if (uint8Array.length < 4) return 'Unknown';

    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) return 'JPEG';
    if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 && uint8Array[2] === 0x4E && uint8Array[3] === 0x47) return 'PNG';
    if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x38) return 'GIF';
    if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46 && uint8Array[3] === 0x46) return 'WebP';
    if (uint8Array.length >= 8 && uint8Array[4] === 0x66 && uint8Array[5] === 0x74 && uint8Array[6] === 0x79 && uint8Array[7] === 0x70) return 'MP4';
    return 'Unknown';
  }

  // Signature matching helper
  checkForAISignatures(text, source, results) {
    if (!text || !this.signatureDb || typeof this.signatureDb.containsAISignature !== 'function') return;
    const match = this.signatureDb.containsAISignature(text);
    if (match) {
      results.signatures.push({
        tool: match.tool,
        signature: match.signature,
        type: match.type,
        confidence: match.confidence || 'high',
        source,
        details: `Found in ${source}: "${match.signature}"`
      });
      results.details.push(`AI signature detected in ${source}: ${match.signature}`);
    }
  }

  // Safe text decode to avoid throwing on binary data
  safeDecode(uint8Array) {
    try {
      return this.textDecoder.decode(uint8Array);
    } catch (e) {
      return '';
    }
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.HeaderParser = HeaderParser;
} else if (typeof module !== 'undefined') {
  module.exports = HeaderParser;
}