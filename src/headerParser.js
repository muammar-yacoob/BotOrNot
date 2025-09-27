// File Header and Metadata Parser
// Reads file headers and extracts AI generation signatures from various formats

class HeaderParser {
  constructor(signatureDb) {
    this.signatureDb = signatureDb;
    this.textDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false });
    this.debugLog = false; // Disable detailed logging for production
    this.parseLog = []; // Store parsing steps for debugging
  }

  log(message, level = 'info') {
    if (this.debugLog) {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      this.parseLog.push(logEntry);
    }
  }

  // Main parsing function
  async parseFile(arrayBuffer, filename = '') {
    this.parseLog = []; // Reset log for new file
    this.log(`Starting parse of ${filename || 'unknown file'} (${arrayBuffer.byteLength} bytes)`);

    const uint8Array = new Uint8Array(arrayBuffer);
    const results = {
      fileType: null,
      signatures: [],
      confidence: 'none',
      details: [],
      rawMetadata: {},
      parseLog: this.parseLog,
      filename: filename
    };

    // Detect file type from magic bytes
    results.fileType = this.detectFileType(uint8Array);
    results.details.push(`File type: ${results.fileType}`);
    this.log(`Detected file type: ${results.fileType}`);

    // Skip filename pattern detection - too unreliable and causes false positives
    this.log(`Analyzing file: ${filename || 'unknown'} - focusing on metadata only`);

    // Parse based on file type
    switch (results.fileType) {
      case 'JPEG':
        await this.parseJPEG(uint8Array, results);
        break;
      case 'PNG':
        await this.parsePNG(uint8Array, results);
        break;
      case 'WebP':
        await this.parseWebP(uint8Array, results);
        break;
      case 'GIF':
        await this.parseGIF(uint8Array, results);
        break;
      case 'MP4':
        await this.parseMP4(uint8Array, results);
        break;
      case 'MOV':
        await this.parseMP4(uint8Array, results); // MOV uses similar structure
        break;
      case 'AVI':
        await this.parseAVI(uint8Array, results);
        break;
      case 'WebM':
        await this.parseWebM(uint8Array, results);
        break;
      case 'AVIF':
        await this.parseAVIF(uint8Array, results);
        break;
      case 'TIFF':
        await this.parseTIFF(uint8Array, results);
        break;
      default:
        await this.parseGeneric(uint8Array, results);
    }

    // Fallback: If no signatures found, do a comprehensive header scan
    if (results.signatures.length === 0) {
      this.log('No signatures found in metadata, performing comprehensive header scan');
      await this.performComprehensiveScan(uint8Array, results);
    }

    // Determine overall confidence
    results.confidence = this.calculateConfidence(results.signatures);
    this.log(`Final analysis: ${results.signatures.length} signatures, confidence: ${results.confidence}`);

    // Log all found signatures
    results.signatures.forEach((sig, i) => {
      this.log(`Signature ${i + 1}: ${sig.tool} - "${sig.signature}" (${sig.confidence}) from ${sig.source}`, 'warn');
    });

    return results;
  }

  // Detect file type from magic bytes
  detectFileType(uint8Array) {
    if (uint8Array.length < 4) return 'Unknown';

    // DEBUG: Log the first 8 bytes to see what we're actually getting
    const firstBytes = Array.from(uint8Array.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    this.log(`DEBUG: First 8 bytes: ${firstBytes}`);

    // JPEG: FF D8 FF
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF) {
      this.log('Magic bytes match JPEG format');
      return 'JPEG';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 &&
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      this.log('Magic bytes match PNG format');
      return 'PNG';
    }

    // GIF: 47 49 46 38
    if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 &&
        uint8Array[2] === 0x46 && uint8Array[3] === 0x38) {
      this.log('Magic bytes match GIF format');
      return 'GIF';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (uint8Array[0] === 0x52 && uint8Array[1] === 0x49 &&
        uint8Array[2] === 0x46 && uint8Array[3] === 0x46) {
      if (uint8Array.length >= 12 &&
          uint8Array[8] === 0x57 && uint8Array[9] === 0x45 &&
          uint8Array[10] === 0x42 && uint8Array[11] === 0x50) {
        this.log('Magic bytes match WebP format');
        return 'WebP';
      }
    }

    // AVIF: ... 66 74 79 70 61 76 69 66
    if (uint8Array.length >= 12 && uint8Array[4] === 0x66 && uint8Array[5] === 0x74 &&
        uint8Array[6] === 0x79 && uint8Array[7] === 0x70 &&
        uint8Array[8] === 0x61 && uint8Array[9] === 0x76 &&
        uint8Array[10] === 0x69 && uint8Array[11] === 0x66) {
      this.log('Magic bytes match AVIF format');
      return 'AVIF';
    }

    // TIFF: 49 49 2A 00 (little endian) or 4D 4D 00 2A (big endian)
    if ((uint8Array[0] === 0x49 && uint8Array[1] === 0x49 &&
         uint8Array[2] === 0x2A && uint8Array[3] === 0x00) ||
        (uint8Array[0] === 0x4D && uint8Array[1] === 0x4D &&
         uint8Array[2] === 0x00 && uint8Array[3] === 0x2A)) {
      this.log('Magic bytes match TIFF format');
      return 'TIFF';
    }

    // MP4: Various FTYP signatures
    if (uint8Array.length >= 8 && uint8Array[4] === 0x66 && uint8Array[5] === 0x74 &&
        uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
      this.log('Magic bytes match MP4 format');
      return 'MP4';
    }

    // WebM: EBML signature
    if (uint8Array.length >= 4 && uint8Array[0] === 0x1A && uint8Array[1] === 0x45 &&
        uint8Array[2] === 0xDF && uint8Array[3] === 0xA3) {
      this.log('Magic bytes match WebM format');
      return 'WebM';
    }

    // AVI: RIFF + AVI
    if (uint8Array.length >= 12 && uint8Array[0] === 0x52 && uint8Array[1] === 0x49 &&
        uint8Array[2] === 0x46 && uint8Array[3] === 0x46 &&
        uint8Array[8] === 0x41 && uint8Array[9] === 0x56 && uint8Array[10] === 0x49) {
      this.log('Magic bytes match AVI format');
      return 'AVI';
    }

    // MOV: Various QuickTime signatures
    if (uint8Array.length >= 8 && uint8Array[4] === 0x66 && uint8Array[5] === 0x74 &&
        uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
      // Check for MOV-specific brands
      const brand = String.fromCharCode(...uint8Array.slice(8, 12));
      if (brand.includes('qt')) {
        this.log('Magic bytes match MOV format');
        return 'MOV';
      }
    }

    this.log('No recognized magic bytes found');
    return 'Unknown';
  }

  // Parse JPEG EXIF data
  async parseJPEG(uint8Array, results) {
    this.log('Starting JPEG parsing');
    let offset = 2; // Skip initial FF D8
    let segmentCount = 0;

    while (offset < uint8Array.length - 4) {
      // Look for APP1 marker (FF E1) - can contain EXIF, XMP, or C2PA
      if (uint8Array[offset] === 0xFF && uint8Array[offset + 1] === 0xE1) {
        segmentCount++;
        const length = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        this.log(`Found APP1 segment ${segmentCount}, length: ${length}`);

        const segmentData = uint8Array.slice(offset + 4, offset + 4 + length);
        const segmentText = this.textDecoder.decode(segmentData);

        // Check segment type and parse accordingly
        if (segmentText.includes('Exif') || segmentText.includes('EXIF')) {
          this.log('Found EXIF data in APP1 segment');
          await this.parseEXIF(segmentData, results);
        } else if (segmentText.includes('http://ns.adobe.com/xap/1.0/')) {
          this.log('Found Adobe XMP data in APP1 segment');
          results.rawMetadata['JPEG_XMP'] = segmentText;
          this.checkForAISignatures(segmentText, 'JPEG XMP', results);
        } else if (this.isC2PASegment(segmentData)) {
          this.log('Found C2PA data in APP1 segment');
          await this.parseC2PA(segmentData, results, 'JPEG');
        } else {
          this.log(`Unknown APP1 segment content: ${segmentText.substring(0, 50)}...`);
          results.rawMetadata['JPEG_APP1_Unknown'] = segmentText.substring(0, 200);
          this.checkForAISignatures(segmentText, 'JPEG APP1', results);
        }

        offset += length + 2;
      }
      // Look for comment marker (FF FE)
      else if (uint8Array[offset] === 0xFF && uint8Array[offset + 1] === 0xFE) {
        const length = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        const commentData = uint8Array.slice(offset + 4, offset + 2 + length);
        const comment = this.textDecoder.decode(commentData);

        this.log(`Found JPEG comment: ${comment.substring(0, 100)}...`);
        results.rawMetadata['JPEG_Comment'] = comment;
        this.checkForAISignatures(comment, 'JPEG Comment', results);
        offset += length + 2;
      }
      // Look for other APP markers (APP0, APP2, etc.)
      else if (uint8Array[offset] === 0xFF && uint8Array[offset + 1] >= 0xE0 && uint8Array[offset + 1] <= 0xEF) {
        const appMarker = uint8Array[offset + 1];
        const length = (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
        this.log(`Found APP${appMarker - 0xE0} segment, length: ${length}`);

        const segmentData = uint8Array.slice(offset + 4, offset + 4 + length);
        const segmentText = this.textDecoder.decode(segmentData);

        results.rawMetadata[`JPEG_APP${appMarker - 0xE0}`] = segmentText.substring(0, 200);
        this.checkForAISignatures(segmentText, `JPEG APP${appMarker - 0xE0}`, results);

        offset += length + 2;
      }
      // Look for start of scan (SOS) - end of metadata
      else if (uint8Array[offset] === 0xFF && uint8Array[offset + 1] === 0xDA) {
        this.log('Reached Start of Scan (SOS) - metadata parsing complete');
        break;
      }
      else {
        offset++;
      }
    }

    this.log(`JPEG parsing complete, found ${segmentCount} metadata segments`);
  }

  // Parse EXIF metadata using binary chunk reading
  async parseEXIF(exifData, results) {
    try {
      this.log(`Parsing EXIF data (${exifData.length} bytes)`);
      
      // Store raw EXIF data for analysis
      results.rawMetadata['EXIF_Raw'] = Array.from(exifData.slice(0, 500)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      
      // Read EXIF in binary chunks to properly extract fields
      const view = new DataView(exifData.buffer, exifData.byteOffset, exifData.byteLength);
      
      // EXIF header should start with TIFF header
      if (view.getUint16(0) === 0xFFD8) {
        this.log('Found JPEG EXIF header');
        await this.parseTIFFHeader(view, results);
      } else {
        // Try to find TIFF header within the data
        for (let i = 0; i < exifData.length - 8; i++) {
          if (view.getUint32(i) === 0x4D4D002A || view.getUint32(i) === 0x49492A00) {
            this.log(`Found TIFF header at offset ${i}`);
            await this.parseTIFFHeader(new DataView(exifData.buffer, exifData.byteOffset + i, exifData.byteLength - i), results);
            break;
          }
        }
      }

      // Also do text-based search as fallback for any readable strings
      const exifText = this.textDecoder.decode(exifData);
      results.rawMetadata['EXIF_Text'] = exifText.substring(0, 500);

      // Common EXIF fields that might contain AI signatures
      const exifFields = [
        'Make', 'Model', 'Software', 'Artist', 'Copyright',
        'ImageDescription', 'UserComment', 'DateTime', 'DateTimeOriginal',
        'Creator', 'CreatorTool', 'Source', 'Title', 'Subject'
      ];

      // Search for field patterns with improved regex
      for (const field of exifFields) {
        // Look for field name followed by value
        const patterns = [
          new RegExp(`${field}[\\x00\\s]*:?[\\x00\\s]*([\\x20-\\x7E]{1,200})`, 'gi'),
          new RegExp(`${field}[\\x00\\s]*=([\\x20-\\x7E]{1,200})`, 'gi'),
          new RegExp(`"${field}"[\\x00\\s]*:[\\x00\\s]*"([^"]{1,200})"`, 'gi')
        ];

        for (const pattern of patterns) {
          const matches = exifText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const value = match.replace(new RegExp(`${field}[\\x00\\s]*:?[\\x00\\s]*=?`, 'gi'), '')
                                .replace(/[\x00\s]+/g, ' ')
                                .replace(/^["\s]+|["\s]+$/g, '')
                                .trim();
              if (value.length > 2 && value !== field) {
                results.rawMetadata[`EXIF_${field}`] = value;
                this.log(`Found EXIF ${field}: ${value}`);
                this.checkForAISignatures(value, `EXIF ${field}`, results);
              }
            });
          }
        }
      }

      // Look for AI-specific patterns in EXIF
      const aiPatterns = [
        { pattern: /nano-banana/gi, tool: 'nano-banana' },
        { pattern: /google\s*ai/gi, tool: 'nano-banana' },
        { pattern: /ideogram\s*ai/gi, tool: 'ideogram' },
        { pattern: /ideogram/gi, tool: 'ideogram' },
        { pattern: /dall[-\s]?e/gi, tool: 'dall-e' },
        { pattern: /midjourney/gi, tool: 'midjourney' },
        { pattern: /stable[-\s]?diffusion/gi, tool: 'stable-diffusion' },
        { pattern: /firefly/gi, tool: 'firefly' },
        { pattern: /leonardo/gi, tool: 'leonardo' },
        { pattern: /openai/gi, tool: 'dall-e' },
        { pattern: /adobe/gi, tool: 'firefly' },
        { pattern: /generated/gi, tool: 'generic-ai' },
        { pattern: /artificial/gi, tool: 'generic-ai' },
        { pattern: /synthetic/gi, tool: 'generic-ai' }
      ];

      for (const { pattern, tool } of aiPatterns) {
        if (pattern.test(exifText)) {
          this.log(`Found AI pattern in EXIF: ${tool}`);
          results.signatures.push({
            tool: tool,
            signature: 'EXIF metadata pattern',
            type: 'metadata',
            confidence: 'medium',
            source: 'EXIF data',
            details: `AI signature found in EXIF metadata`
          });
        }
      }

      // Store raw EXIF for debugging
      if (exifText.length > 0) {
        results.rawMetadata['EXIF_Content'] = exifText.substring(0, 1000);
      }

    } catch (error) {
      this.log(`EXIF parse error: ${error.message}`, 'error');
      results.details.push(`EXIF parse error: ${error.message}`);
    }
  }

  // Parse TIFF header and IFD entries
  async parseTIFFHeader(view, results) {
    try {
      // Check endianness
      const endian = view.getUint16(0) === 0x4949 ? 'little' : 'big';
      this.log(`TIFF endianness: ${endian}`);
      
      // Read IFD offset
      const ifdOffset = endian === 'little' ? 
        view.getUint32(4, true) : view.getUint32(4, false);
      
      this.log(`IFD offset: ${ifdOffset}`);
      
      // Read IFD entries
      await this.readIFDEntries(view, ifdOffset, endian, results);
      
    } catch (error) {
      this.log(`TIFF parsing error: ${error.message}`);
    }
  }

  // Read IFD (Image File Directory) entries
  async readIFDEntries(view, offset, endian, results) {
    try {
      const entryCount = endian === 'little' ? 
        view.getUint16(offset, true) : view.getUint16(offset, false);
      
      this.log(`Found ${entryCount} IFD entries`);
      
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = offset + 2 + (i * 12);
        await this.readIFDEntry(view, entryOffset, endian, results);
      }
      
    } catch (error) {
      this.log(`IFD reading error: ${error.message}`);
    }
  }

  // Read individual IFD entry
  async readIFDEntry(view, offset, endian, results) {
    try {
      const tag = endian === 'little' ? 
        view.getUint16(offset, true) : view.getUint16(offset, false);
      const type = endian === 'little' ? 
        view.getUint16(offset + 2, true) : view.getUint16(offset + 2, false);
      const count = endian === 'little' ? 
        view.getUint32(offset + 4, true) : view.getUint32(offset + 4, false);
      const valueOffset = endian === 'little' ? 
        view.getUint32(offset + 8, true) : view.getUint32(offset + 8, false);
      
      // Common EXIF tags that might contain AI signatures
      const exifTags = {
        0x010F: 'Make',
        0x0110: 'Model', 
        0x0131: 'Software',
        0x013B: 'Artist',
        0x8298: 'Copyright',
        0x010E: 'ImageDescription',
        0x9286: 'UserComment',
        0x0132: 'DateTime',
        0x9003: 'DateTimeOriginal',
        0x9004: 'DateTimeDigitized'
      };
      
      if (exifTags[tag]) {
        const fieldName = exifTags[tag];
        let value = '';
        
        if (type === 2 && count <= 4) { // ASCII string
          // Read string value
          const stringData = new Uint8Array(view.buffer, view.byteOffset + valueOffset, Math.min(count, 200));
          value = this.textDecoder.decode(stringData).replace(/\x00/g, '').trim();
        } else if (count <= 4) {
          // Value is stored directly in the offset field
          value = valueOffset.toString();
        }
        
        if (value && value.length > 0) {
          results.rawMetadata[`EXIF_${fieldName}`] = value;
          this.log(`Found EXIF ${fieldName}: ${value}`);
          this.checkForAISignatures(value, `EXIF ${fieldName}`, results);
        }
      }
      
    } catch (error) {
      this.log(`IFD entry reading error: ${error.message}`);
    }
  }

  // Parse PNG eXIf chunk containing raw EXIF data
  async parsePNGEXIF(exifData, results) {
    try {
      this.log(`Parsing PNG eXIf chunk data (${exifData.length} bytes)`);

      // PNG eXIf chunk contains raw EXIF data starting with TIFF header
      // Convert to text for string-based analysis
      const exifText = this.textDecoder.decode(exifData);
      results.rawMetadata['PNG_eXIf_Raw'] = exifText.substring(0, 500);

      // Look for AI signatures in the raw data (prioritized order)
      const aiSignatures = [
        // Google nano-banana signatures (highest priority)
        { pattern: /nano[-_\s]?banana[-_\s]?2025/gi, tool: 'nano-banana', confidence: 'high' },
        { pattern: /nano[-_\s]?banana/gi, tool: 'nano-banana', confidence: 'high' },
        { pattern: /google\s*ai/gi, tool: 'nano-banana', confidence: 'medium' },
        // Specific AI tools
        { pattern: /ideogram\s*ai/gi, tool: 'ideogram', confidence: 'high' },
        { pattern: /ideogram/gi, tool: 'ideogram', confidence: 'medium' },
        { pattern: /dall[-\s]?e/gi, tool: 'dall-e', confidence: 'high' },
        { pattern: /midjourney/gi, tool: 'midjourney', confidence: 'high' },
        { pattern: /stable[-\s]?diffusion/gi, tool: 'stable-diffusion', confidence: 'high' },
        { pattern: /firefly/gi, tool: 'firefly', confidence: 'high' },
        { pattern: /leonardo/gi, tool: 'leonardo', confidence: 'high' },
        { pattern: /adobe.*firefly/gi, tool: 'firefly', confidence: 'high' },
        { pattern: /generated/gi, tool: 'generic-ai', confidence: 'medium' },
        { pattern: /artificial/gi, tool: 'generic-ai', confidence: 'medium' }
      ];

      // Check for AI signatures in the eXIf data
      let foundSignature = null;
      for (const { pattern, tool, confidence } of aiSignatures) {
        if (pattern.test(exifText)) {
          this.log(`Found AI signature in PNG eXIf: ${tool}`);
          // Store the first match but continue checking for higher priority ones
          if (!foundSignature) {
            foundSignature = { tool, confidence };
          }
          // If we find nano-banana, it overrides any previous match (even ideogram)
          if (tool === 'nano-banana') {
            foundSignature = { tool, confidence };
            break; // nano-banana has highest priority
          }
        }
      }

      // Add the best signature found
      if (foundSignature) {
        results.signatures.push({
          tool: foundSignature.tool,
          signature: `PNG eXIf metadata`,
          type: 'metadata',
          confidence: foundSignature.confidence,
          source: 'PNG eXIf chunk',
          details: `AI signature "${foundSignature.tool}" found in PNG eXIf metadata`
        });
      }

      // Store raw eXIf data for debugging
      if (exifText.length > 0) {
        results.rawMetadata['PNG_eXIf_Content'] = exifText.substring(0, 1000);
      }

    } catch (error) {
      this.log(`PNG eXIf parse error: ${error.message}`, 'error');
      results.details.push(`PNG eXIf parse error: ${error.message}`);
    }
  }

  // Enhanced PNG chunks parsing with detailed logging
  async parsePNG(uint8Array, results) {
    this.log('🔍 Starting enhanced PNG parsing with comprehensive chunk analysis');

    // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      if (uint8Array[i] !== pngSignature[i]) {
        this.log(`❌ Invalid PNG signature at byte ${i}: expected 0x${pngSignature[i].toString(16)}, got 0x${uint8Array[i].toString(16)}`, 'error');
        return;
      }
    }

    let offset = 8; // Skip PNG signature
    let chunkCount = 0;

    while (offset < uint8Array.length - 12) { // Need minimum 12 bytes for complete chunk
      // Read chunk length (4 bytes, big endian)
      const length = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) |
                    (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];

      // Read chunk type (4 bytes ASCII)
      const type = String.fromCharCode(...uint8Array.slice(offset + 4, offset + 8));

      chunkCount++;
      this.log(`📦 PNG Chunk #${chunkCount}: "${type}" (${length} bytes) at offset 0x${offset.toString(16)}`);

      // Validate chunk length to prevent buffer overruns
      if (length < 0 || length > uint8Array.length - offset - 12) {
        this.log(`⚠️ Invalid chunk length ${length}, file may be corrupted. Stopping parse.`, 'error');
        break;
      }

      // Store chunk info for debugging
      results.rawMetadata[`PNG_chunk_${chunkCount}_${type}`] = `${length} bytes`;

      // Parse metadata chunks with detailed logging
      if (['tEXt', 'iTXt', 'zTXt'].includes(type)) {
        this.log(`🔍 Found text chunk "${type}" - extracting metadata...`);
        const chunkData = uint8Array.slice(offset + 8, offset + 8 + length);
        await this.parsePNGTextChunk(chunkData, type, results, chunkCount);
      } else if (type === 'eXIf') {
        // EXIF chunk in PNG - contains raw EXIF data including potential AI signatures
        this.log(`🔍 Found eXIf chunk - extracting EXIF metadata...`);
        const chunkData = uint8Array.slice(offset + 8, offset + 8 + length);
        await this.parsePNGEXIF(chunkData, results);
      } else if (type === 'c2pa') {
        // C2PA chunk in PNG
        this.log(`🔍 Found C2PA chunk - extracting metadata...`);
        const chunkData = uint8Array.slice(offset + 8, offset + 8 + length);
        await this.parseC2PA(chunkData, results, 'PNG');
      } else if (type === 'IHDR') {
        // Extract image dimensions for context
        if (length >= 8) {
          const chunkData = uint8Array.slice(offset + 8, offset + 16);
          const width = (chunkData[0] << 24) | (chunkData[1] << 16) | (chunkData[2] << 8) | chunkData[3];
          const height = (chunkData[4] << 24) | (chunkData[5] << 16) | (chunkData[6] << 8) | chunkData[7];
          const bitDepth = chunkData[8];
          const colorType = chunkData[9];
          this.log(`📐 PNG Image: ${width}x${height}px, ${bitDepth}-bit, color type ${colorType}`);
          results.rawMetadata['PNG_dimensions'] = `${width}x${height}`;
          results.rawMetadata['PNG_bit_depth'] = bitDepth;
          results.rawMetadata['PNG_color_type'] = colorType;
        }
      } else if (type === 'IEND') {
        this.log('🏁 Reached PNG end marker (IEND) - parsing complete');
        break;
      } else {
        // Log other chunk types for comprehensive debugging
        this.log(`📋 Found chunk: ${type} (${length} bytes) - skipping`);
      }

      // Calculate next chunk offset: length(4) + type(4) + data + CRC(4)
      const nextOffset = offset + 8 + length + 4;

      // Safety checks to prevent infinite loops
      if (nextOffset <= offset) {
        this.log(`⚠️ Chunk progression error: next offset ${nextOffset} <= current ${offset}`, 'error');
        break;
      }
      if (nextOffset > uint8Array.length) {
        this.log(`⚠️ Chunk extends beyond file end: ${nextOffset} > ${uint8Array.length}`, 'warn');
        break;
      }

      offset = nextOffset;

      // Prevent DoS attacks from files with excessive chunks
      if (chunkCount > 1000) {
        this.log('⚠️ Too many chunks processed (>1000), stopping to prevent DoS', 'warn');
        break;
      }
    }

    this.log(`✅ PNG parsing complete: processed ${chunkCount} chunks total`);
  }

  // Enhanced PNG text chunk parsing with proper keyword/value extraction
  async parsePNGTextChunk(chunkData, chunkType, results, chunkNumber) {
    try {
      let keyword = '';
      let text = '';

      if (chunkType === 'tEXt') {
        // Plain text chunk: keyword\0text
        const nullIndex = chunkData.indexOf(0);
        if (nullIndex !== -1) {
          keyword = this.textDecoder.decode(chunkData.slice(0, nullIndex));
          text = this.textDecoder.decode(chunkData.slice(nullIndex + 1));
        } else {
          text = this.textDecoder.decode(chunkData);
        }
        this.log(`🔖 tEXt chunk: keyword="${keyword}", text="${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

      } else if (chunkType === 'iTXt') {
        // International text chunk: keyword\0compression\0language\0translated_keyword\0text
        const parts = [];
        let start = 0;
        for (let i = 0; i < chunkData.length; i++) {
          if (chunkData[i] === 0) {
            if (start < i) {
              parts.push(this.textDecoder.decode(chunkData.slice(start, i)));
            } else {
              parts.push('');
            }
            start = i + 1;
            if (parts.length >= 4) break; // We have keyword, compression, language, translated_keyword
          }
        }
        if (start < chunkData.length) {
          parts.push(this.textDecoder.decode(chunkData.slice(start)));
        }

        keyword = parts[0] || '';
        const compression = parts[1] || '';
        const language = parts[2] || '';
        const translatedKeyword = parts[3] || '';
        text = parts[4] || '';

        this.log(`🌐 iTXt chunk: keyword="${keyword}", compression="${compression}", language="${language}", text="${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

      } else if (chunkType === 'zTXt') {
        // Compressed text chunk: keyword\0compression_method\0compressed_text
        const nullIndex = chunkData.indexOf(0);
        if (nullIndex !== -1 && nullIndex + 2 < chunkData.length) {
          keyword = this.textDecoder.decode(chunkData.slice(0, nullIndex));
          const compressionMethod = chunkData[nullIndex + 1];
          const compressedData = chunkData.slice(nullIndex + 2);

          this.log(`🗜️ zTXt chunk: keyword="${keyword}", compression_method=${compressionMethod}, compressed_size=${compressedData.length}`);

          // For now, try to decode compressed data as plain text (should implement zlib)
          try {
            text = this.textDecoder.decode(compressedData);
            this.log(`⚠️ zTXt: Attempted plain text decode (should be zlib decompressed): "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
          } catch (decodeError) {
            this.log(`❌ zTXt: Could not decode compressed data - need zlib implementation`, 'warn');
            text = `[COMPRESSED DATA - ${compressedData.length} bytes]`;
          }
        } else {
          text = this.textDecoder.decode(chunkData);
          this.log(`⚠️ zTXt: Malformed chunk, fallback decode: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        }
      }

      // Store raw metadata with keyword if available
      if (keyword) {
        results.rawMetadata[`PNG_${chunkType}_${keyword}`] = text;
        this.log(`💾 Stored metadata: PNG_${chunkType}_${keyword} = "${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"`);
      } else {
        results.rawMetadata[`PNG_${chunkType}_${chunkNumber}`] = text;
      }

      // Check for AI signatures in both keyword and text
      if (keyword.length > 0) {
        this.checkForAISignatures(keyword, `PNG ${chunkType} keyword`, results);
      }
      if (text.length > 0) {
        this.checkForAISignatures(text, `PNG ${chunkType} text`, results);

        // Look specifically for AI generation parameters
        this.analyzeAIParameters(text, chunkType, keyword, results);
      }

    } catch (error) {
      this.log(`❌ PNG ${chunkType} parse error: ${error.message}`, 'error');
      results.details.push(`PNG ${chunkType} parse error: ${error.message}`);
    }
  }

  // Analyze AI generation parameters in PNG text
  analyzeAIParameters(text, chunkType, keyword, results) {
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    // Stable Diffusion parameters
    const sdParams = ['steps:', 'sampler:', 'cfg scale:', 'seed:', 'size:', 'model hash:', 'model:', 'negative prompt:'];
    const foundSdParams = sdParams.filter(param => lowerText.includes(param));

    if (foundSdParams.length >= 2) {
      this.log(`🎨 Found Stable Diffusion parameters: ${foundSdParams.join(', ')}`);
      results.signatures.push({
        tool: 'stable-diffusion',
        signature: 'Parameter block',
        type: 'parameters',
        confidence: 'high',
        source: `PNG ${chunkType} ${keyword ? `(${keyword})` : ''}`,
        details: `Found SD parameters: ${foundSdParams.join(', ')}`
      });
    }

    // DALL-E parameters
    if (lowerText.includes('dall') || lowerKeyword.includes('dall') ||
        lowerText.includes('openai') || lowerKeyword.includes('openai')) {
      this.log(`🤖 Found DALL-E signatures`);
      results.signatures.push({
        tool: 'dall-e',
        signature: keyword || 'DALL-E metadata',
        type: 'metadata',
        confidence: 'high',
        source: `PNG ${chunkType}`,
        details: `DALL-E signature in ${keyword ? `keyword "${keyword}"` : 'text content'}`
      });
    }

    // Midjourney parameters
    if (lowerText.includes('midjourney') || lowerKeyword.includes('midjourney') ||
        lowerText.includes('--ar') || lowerText.includes('--v ') || lowerText.includes('--stylize')) {
      this.log(`🎭 Found Midjourney signatures`);
      results.signatures.push({
        tool: 'midjourney',
        signature: keyword || 'Midjourney metadata',
        type: 'metadata',
        confidence: 'high',
        source: `PNG ${chunkType}`,
        details: `Midjourney signature in ${keyword ? `keyword "${keyword}"` : 'text content'}`
      });
    }

    // Ideogram AI detection (nano-banana specific)
    if (lowerText.includes('ideogram') || lowerKeyword.includes('ideogram') ||
        lowerText.includes('ideogram ai') || lowerKeyword.includes('ideogram ai')) {
      this.log(`🎨 Found Ideogram AI signatures`);
      results.signatures.push({
        tool: 'ideogram',
        signature: keyword || 'Ideogram AI metadata',
        type: 'metadata',
        confidence: 'high',
        source: `PNG ${chunkType}`,
        details: `Ideogram AI signature in ${keyword ? `keyword "${keyword}"` : 'text content'}`
      });
    }

    // Leonardo AI detection
    if (lowerText.includes('leonardo') || lowerKeyword.includes('leonardo') ||
        lowerText.includes('leonardo ai') || lowerKeyword.includes('leonardo ai')) {
      this.log(`🎨 Found Leonardo AI signatures`);
      results.signatures.push({
        tool: 'leonardo',
        signature: keyword || 'Leonardo AI metadata',
        type: 'metadata',
        confidence: 'high',
        source: `PNG ${chunkType}`,
        details: `Leonardo AI signature in ${keyword ? `keyword "${keyword}"` : 'text content'}`
      });
    }

    // Generic AI detection
    if (lowerText.includes('generated') || lowerText.includes('artificial') ||
        lowerText.includes('synthetic') || lowerText.includes('ai created')) {
      this.log(`🤖 Found generic AI signatures`);
      results.signatures.push({
        tool: 'generic-ai',
        signature: keyword || 'AI metadata',
        type: 'metadata',
        confidence: 'medium',
        source: `PNG ${chunkType}`,
        details: `AI generation signature in ${keyword ? `keyword "${keyword}"` : 'text content'}`
      });
    }
  }

  // Parse Stable Diffusion parameters (common in PNG files)
  parseStableDiffusionParameters(text, results) {
    const sdParams = ['Steps:', 'Sampler:', 'CFG scale:', 'Seed:', 'Size:', 'Model hash:', 'Model:'];

    const foundParams = sdParams.filter(param => text.includes(param));
    if (foundParams.length >= 2) {
      results.signatures.push({
        tool: 'stable-diffusion',
        signature: 'Parameter block',
        type: 'parameters',
        confidence: 'high',
        source: 'PNG metadata',
        details: `Found SD parameters: ${foundParams.join(', ')}`
      });
    }
  }

  // Parse WebP metadata
  async parseWebP(uint8Array, results) {
    let offset = 12; // Skip RIFF header and WEBP fourcc

    while (offset < uint8Array.length - 8) {
      // Read chunk fourcc
      const fourcc = String.fromCharCode(...uint8Array.slice(offset, offset + 4));

      // Read chunk size
      const size = uint8Array[offset + 4] | (uint8Array[offset + 5] << 8) |
                  (uint8Array[offset + 6] << 16) | (uint8Array[offset + 7] << 24);

      if (fourcc === 'EXIF') {
        const exifData = uint8Array.slice(offset + 8, offset + 8 + size);
        await this.parseEXIF(exifData, results);
      } else if (fourcc === 'XMP ') {
        const xmpData = uint8Array.slice(offset + 8, offset + 8 + size);
        const xmpText = this.textDecoder.decode(xmpData);
        results.rawMetadata['XMP'] = xmpText;
        this.checkForAISignatures(xmpText, 'WebP XMP', results);
      }

      offset += 8 + size + (size % 2); // Align to even boundary
    }
  }

  // Parse GIF metadata
  async parseGIF(uint8Array, results) {
    // GIF has limited metadata capabilities
    // Check for comment extensions
    let offset = 13; // Skip header and logical screen descriptor

    while (offset < uint8Array.length - 3) {
      if (uint8Array[offset] === 0x21) { // Extension introducer
        if (uint8Array[offset + 1] === 0xFE) { // Comment extension
          offset += 2;
          let comment = '';

          // Read comment data
          while (offset < uint8Array.length && uint8Array[offset] !== 0x00) {
            const blockSize = uint8Array[offset++];
            if (blockSize === 0) break;

            const block = uint8Array.slice(offset, offset + blockSize);
            comment += this.textDecoder.decode(block);
            offset += blockSize;
          }

          if (comment.length > 0) {
            results.rawMetadata['GIF_Comment'] = comment;
            this.checkForAISignatures(comment, 'GIF Comment', results);
          }
        }
      }
      offset++;
    }
  }

  // Basic MP4 metadata parsing
  async parseMP4(uint8Array, results) {
    // MP4 has complex atom structure
    // Look for common metadata atoms
    let offset = 0;

    while (offset < uint8Array.length - 8) {
      const atomSize = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) |
                      (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];

      const atomType = String.fromCharCode(...uint8Array.slice(offset + 4, offset + 8));

      // Look for metadata atoms
      if (['udta', 'meta', '©too', '©swr'].includes(atomType)) {
        const atomData = uint8Array.slice(offset + 8, offset + atomSize);
        const text = this.textDecoder.decode(atomData);

        results.rawMetadata[`MP4_${atomType}`] = text;
        this.checkForAISignatures(text, `MP4 ${atomType}`, results);
      }

      offset += atomSize || 1; // Prevent infinite loop
    }
  }

  // Parse AVIF metadata
  async parseAVIF(uint8Array, results) {
    this.log('Starting AVIF parsing');
    // AVIF is based on ISOBMFF (ISO Base Media File Format)
    let offset = 0;

    while (offset < uint8Array.length - 8) {
      const boxSize = (uint8Array[offset] << 24) | (uint8Array[offset + 1] << 16) |
                     (uint8Array[offset + 2] << 8) | uint8Array[offset + 3];
      const boxType = String.fromCharCode(...uint8Array.slice(offset + 4, offset + 8));

      this.log(`Found AVIF box: ${boxType}, size: ${boxSize}`);

      // Look for metadata boxes
      if (['meta', 'uuid', 'udta'].includes(boxType)) {
        const boxData = uint8Array.slice(offset + 8, offset + boxSize);
        const text = this.textDecoder.decode(boxData);

        results.rawMetadata[`AVIF_${boxType}`] = text.substring(0, 500);
        this.checkForAISignatures(text, `AVIF ${boxType}`, results);
      }

      offset += boxSize || 1; // Prevent infinite loop
    }
  }

  // Parse TIFF metadata (includes EXIF)
  async parseTIFF(uint8Array, results) {
    this.log('Starting TIFF parsing');

    // TIFF header: II or MM (byte order) + magic number (42) + IFD offset
    const isLittleEndian = uint8Array[0] === 0x49 && uint8Array[1] === 0x49;
    this.log(`TIFF byte order: ${isLittleEndian ? 'little' : 'big'} endian`);

    // Get first IFD offset
    let ifdOffset;
    if (isLittleEndian) {
      ifdOffset = uint8Array[4] | (uint8Array[5] << 8) | (uint8Array[6] << 16) | (uint8Array[7] << 24);
    } else {
      ifdOffset = (uint8Array[4] << 24) | (uint8Array[5] << 16) | (uint8Array[6] << 8) | uint8Array[7];
    }

    this.log(`First IFD offset: ${ifdOffset}`);

    // Parse IFD entries
    if (ifdOffset < uint8Array.length - 2) {
      const numEntries = isLittleEndian ?
        uint8Array[ifdOffset] | (uint8Array[ifdOffset + 1] << 8) :
        (uint8Array[ifdOffset] << 8) | uint8Array[ifdOffset + 1];

      this.log(`TIFF IFD contains ${numEntries} entries`);

      // Parse each IFD entry (12 bytes each)
      for (let i = 0; i < numEntries && (ifdOffset + 2 + (i * 12) + 12) <= uint8Array.length; i++) {
        const entryOffset = ifdOffset + 2 + (i * 12);

        // Extract tag, type, count, and value/offset
        const tag = isLittleEndian ?
          uint8Array[entryOffset] | (uint8Array[entryOffset + 1] << 8) :
          (uint8Array[entryOffset] << 8) | uint8Array[entryOffset + 1];

        // Check for common tags that might contain AI metadata
        if ([270, 271, 305, 315, 33432].includes(tag)) { // ImageDescription, Make, Software, Artist, Copyright
          const tagName = {270: 'ImageDescription', 271: 'Make', 305: 'Software', 315: 'Artist', 33432: 'Copyright'}[tag];

          // For simplicity, try to extract string data (this is a basic implementation)
          const valueOffset = entryOffset + 8;
          const value = this.textDecoder.decode(uint8Array.slice(valueOffset, valueOffset + 64));
          const cleanValue = value.replace(/\0/g, '').trim();

          if (cleanValue.length > 0) {
            this.log(`Found TIFF tag ${tagName}: ${cleanValue}`);
            results.rawMetadata[`TIFF_${tagName}`] = cleanValue;
            this.checkForAISignatures(cleanValue, `TIFF ${tagName}`, results);
          }
        }
      }
    }
  }

  // Parse WebM video metadata
  async parseWebM(uint8Array, results) {
    this.log('Starting WebM parsing');
    // WebM is based on Matroska container format with EBML
    let offset = 0;

    while (offset < uint8Array.length - 8) {
      // Basic EBML element parsing
      if (offset + 20 < uint8Array.length) {
        const chunk = uint8Array.slice(offset, offset + 100);
        const text = this.textDecoder.decode(chunk);

        // Look for common video AI signatures
        this.checkForAISignatures(text, 'WebM metadata', results);
      }
      offset += 100;
    }
  }

  // Parse AVI video metadata
  async parseAVI(uint8Array, results) {
    this.log('Starting AVI parsing');
    // AVI format with RIFF chunks
    let offset = 12; // Skip RIFF header

    while (offset < uint8Array.length - 8) {
      const chunkId = String.fromCharCode(...uint8Array.slice(offset, offset + 4));
      const chunkSize = uint8Array[offset + 4] | (uint8Array[offset + 5] << 8) |
                        (uint8Array[offset + 6] << 16) | (uint8Array[offset + 7] << 24);

      this.log(`Found AVI chunk: ${chunkId}, size: ${chunkSize}`);

      if (['IDIT', 'ISFT', 'ICMT', 'IART'].includes(chunkId)) {
        const chunkData = uint8Array.slice(offset + 8, offset + 8 + chunkSize);
        const text = this.textDecoder.decode(chunkData);

        results.rawMetadata[`AVI_${chunkId}`] = text.substring(0, 200);
        this.checkForAISignatures(text, `AVI ${chunkId}`, results);
      }

      offset += 8 + chunkSize + (chunkSize % 2); // Align to even boundary
    }
  }

  // Generic text search in file header
  async parseGeneric(uint8Array, results) {
    this.log('Starting generic text search in file header');
    // Search first 4KB for text content
    const searchSize = Math.min(4096, uint8Array.length);
    const headerText = this.textDecoder.decode(uint8Array.slice(0, searchSize));

    // Look for common text patterns
    const textPatterns = headerText.match(/[a-zA-Z0-9\s\-_.:\/]{10,}/g);
    if (textPatterns) {
      this.log(`Found ${textPatterns.length} text patterns in header`);
      textPatterns.slice(0, 5).forEach((pattern, i) => {
        this.log(`Text pattern ${i + 1}: ${pattern.substring(0, 50)}...`);
      });
    }

    results.rawMetadata['HeaderText'] = headerText.substring(0, 500); // Limit size
    this.checkForAISignatures(headerText, 'File Header', results);
  }

  // Check text for AI signatures using signature database
  checkForAISignatures(text, source, results) {
    if (!text || text.length < 2) return;

    const match = this.signatureDb.containsAISignature(text);
    if (match) {
      results.signatures.push({
        tool: match.tool,
        signature: match.signature,
        type: match.type,
        confidence: match.confidence,
        source: source,
        details: `Found in ${source}: "${match.signature}"`
      });

      results.details.push(`AI signature detected in ${source}: ${match.signature}`);
    }
  }

  // Check if segment contains C2PA data
  isC2PASegment(segmentData) {
    if (segmentData.length < 4) return false;
    
    // C2PA segments typically start with "C2PA" or contain C2PA signatures
    const text = this.textDecoder.decode(segmentData.slice(0, Math.min(100, segmentData.length)));
    return text.includes('C2PA') || text.includes('c2pa') || text.includes('http://c2pa.org');
  }

  // Parse C2PA metadata
  async parseC2PA(c2paData, results, fileType) {
    try {
      this.log(`🔍 Starting C2PA parsing for ${fileType} (${c2paData.length} bytes)`);
      
      // Store raw C2PA data
      results.rawMetadata[`${fileType}_C2PA_Raw`] = `Binary data: ${c2paData.length} bytes`;
      
      // Try to extract text content from C2PA data
      const textContent = this.textDecoder.decode(c2paData);
      
      // Look for C2PA-specific patterns
      const c2paPatterns = [
        { pattern: /C2PA/i, name: 'C2PA Signature' },
        { pattern: /http:\/\/c2pa\.org/i, name: 'C2PA Schema' },
        { pattern: /"@context":\s*"http:\/\/c2pa\.org/i, name: 'C2PA Context' },
        { pattern: /"claim_generator":/i, name: 'Claim Generator' },
        { pattern: /"assertions":/i, name: 'Assertions' },
        { pattern: /"ingredient":/i, name: 'Ingredient' },
        { pattern: /"manifest":/i, name: 'Manifest' },
        { pattern: /"signature":/i, name: 'Signature' }
      ];

      let foundPatterns = [];
      c2paPatterns.forEach(({ pattern, name }) => {
        if (pattern.test(textContent)) {
          foundPatterns.push(name);
          this.log(`✅ Found C2PA pattern: ${name}`);
        }
      });

      if (foundPatterns.length > 0) {
        // Store C2PA metadata
        results.rawMetadata[`${fileType}_C2PA_Patterns`] = foundPatterns.join(', ');
        
        // Try to extract JSON-like content
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const jsonContent = jsonMatch[0];
            results.rawMetadata[`${fileType}_C2PA_JSON`] = jsonContent.substring(0, 1000);
            this.log(`📋 Extracted C2PA JSON content (${jsonContent.length} chars)`);
            
            // Look for specific C2PA fields
            this.extractC2PAFields(jsonContent, results, fileType);
          } catch (jsonError) {
            this.log(`⚠️ C2PA JSON parsing failed: ${jsonError.message}`, 'warn');
          }
        }

        // Add C2PA signature to results
        results.signatures.push({
          tool: 'c2pa',
          signature: 'C2PA Content Authenticity',
          type: 'authenticity',
          confidence: 'high',
          source: `${fileType} C2PA`,
          details: `Found C2PA metadata with patterns: ${foundPatterns.join(', ')}`
        });

        results.details.push(`C2PA Content Authenticity metadata detected in ${fileType}`);
        this.log(`🎯 C2PA analysis complete: ${foundPatterns.length} patterns found`);
      } else {
        this.log(`⚠️ C2PA segment found but no recognizable patterns detected`, 'warn');
        results.rawMetadata[`${fileType}_C2PA_Unknown`] = `Unknown C2PA format: ${c2paData.length} bytes`;
      }

    } catch (error) {
      this.log(`❌ C2PA parsing error: ${error.message}`, 'error');
      results.details.push(`C2PA parse error: ${error.message}`);
    }
  }

  // Extract specific C2PA fields from JSON content
  extractC2PAFields(jsonContent, results, fileType) {
    try {
      // Look for claim generator
      const claimGeneratorMatch = jsonContent.match(/"claim_generator":\s*"([^"]+)"/i);
      if (claimGeneratorMatch) {
        const generator = claimGeneratorMatch[1];
        results.rawMetadata[`${fileType}_C2PA_Generator`] = generator;
        this.log(`🛠️ C2PA Claim Generator: ${generator}`);
        
        // Check if it's an AI tool
        if (this.isAIGenerator(generator)) {
          results.signatures.push({
            tool: 'c2pa-ai',
            signature: generator,
            type: 'ai-tool',
            confidence: 'high',
            source: `${fileType} C2PA Claim Generator`,
            details: `AI tool detected in C2PA claim generator: ${generator}`
          });
        }
      }

      // Look for assertions
      const assertionsMatch = jsonContent.match(/"assertions":\s*\[([^\]]+)\]/i);
      if (assertionsMatch) {
        const assertions = assertionsMatch[1];
        results.rawMetadata[`${fileType}_C2PA_Assertions`] = assertions.substring(0, 500);
        this.log(`📋 C2PA Assertions found: ${assertions.length} chars`);
      }

      // Look for ingredients (source files)
      const ingredientsMatch = jsonContent.match(/"ingredients":\s*\[([^\]]+)\]/i);
      if (ingredientsMatch) {
        const ingredients = ingredientsMatch[1];
        results.rawMetadata[`${fileType}_C2PA_Ingredients`] = ingredients.substring(0, 500);
        this.log(`🔗 C2PA Ingredients found: ${ingredients.length} chars`);
      }

    } catch (error) {
      this.log(`⚠️ C2PA field extraction error: ${error.message}`, 'warn');
    }
  }

  // Check if a claim generator is an AI tool
  isAIGenerator(generator) {
    const lowerGenerator = generator.toLowerCase();
    const aiTools = [
      'dall-e', 'dalle', 'midjourney', 'stable diffusion', 'firefly', 'leonardo',
      'runway', 'imagen', 'artbreeder', 'nightcafe', 'playground', 'craiyon',
      'comfyui', 'automatic1111', 'invokeai', 'photoshop', 'adobe', 'openai',
      'anthropic', 'claude', 'chatgpt', 'gpt', 'ai', 'artificial intelligence'
    ];
    
    return aiTools.some(tool => lowerGenerator.includes(tool));
  }

  // Comprehensive scan when no metadata signatures are found
  async performComprehensiveScan(uint8Array, results) {
    this.log('Performing comprehensive file scan for AI signatures');
    
    // Scan first 64KB of file for text content
    const scanSize = Math.min(65536, uint8Array.length);
    const fileText = this.textDecoder.decode(uint8Array.slice(0, scanSize));
    
    // Store raw text for debugging
    results.rawMetadata['FileHeader_Text'] = fileText.substring(0, 1000);
    
    // AI tool signatures to look for
    const aiSignatures = [
      { pattern: /dall[-\s]?e/gi, tool: 'dall-e', confidence: 'high' },
      { pattern: /midjourney/gi, tool: 'midjourney', confidence: 'high' },
      { pattern: /stable[-\s]?diffusion/gi, tool: 'stable-diffusion', confidence: 'high' },
      { pattern: /firefly/gi, tool: 'firefly', confidence: 'high' },
      { pattern: /leonardo/gi, tool: 'leonardo', confidence: 'high' },
      { pattern: /openai/gi, tool: 'dall-e', confidence: 'medium' },
      { pattern: /adobe/gi, tool: 'firefly', confidence: 'medium' },
      { pattern: /runway/gi, tool: 'runway', confidence: 'high' },
      { pattern: /imagen/gi, tool: 'imagen', confidence: 'high' },
      { pattern: /artbreeder/gi, tool: 'artbreeder', confidence: 'high' },
      { pattern: /nightcafe/gi, tool: 'nightcafe', confidence: 'high' },
      { pattern: /playground/gi, tool: 'playground-ai', confidence: 'high' },
      { pattern: /craiyon/gi, tool: 'craiyon', confidence: 'high' },
      { pattern: /comfyui/gi, tool: 'comfyui', confidence: 'high' },
      { pattern: /automatic1111/gi, tool: 'automatic1111', confidence: 'high' },
      { pattern: /invokeai/gi, tool: 'invokeai', confidence: 'high' },
      { pattern: /generated/gi, tool: 'generic-ai', confidence: 'low' },
      { pattern: /artificial/gi, tool: 'generic-ai', confidence: 'low' },
      { pattern: /synthetic/gi, tool: 'generic-ai', confidence: 'low' },
      { pattern: /ai[-\s]?generated/gi, tool: 'generic-ai', confidence: 'medium' },
      { pattern: /computer[-\s]?generated/gi, tool: 'generic-ai', confidence: 'medium' }
    ];

    let foundSignatures = 0;
    
    for (const { pattern, tool, confidence } of aiSignatures) {
      const matches = fileText.match(pattern);
      if (matches) {
        foundSignatures++;
        this.log(`Found AI signature in file header: ${tool} (${matches.length} matches)`);
        
        results.signatures.push({
          tool: tool,
          signature: matches[0],
          type: 'file-header',
          confidence: confidence,
          source: 'File header scan',
          details: `Found "${matches[0]}" in file header (${matches.length} occurrences)`
        });
      }
    }

    // Look for parameter patterns (common in AI-generated images)
    const parameterPatterns = [
      { pattern: /steps:\s*\d+/gi, tool: 'stable-diffusion', confidence: 'high' },
      { pattern: /cfg[-\s]?scale:\s*[\d.]+/gi, tool: 'stable-diffusion', confidence: 'high' },
      { pattern: /sampler:\s*\w+/gi, tool: 'stable-diffusion', confidence: 'high' },
      { pattern: /seed:\s*\d+/gi, tool: 'stable-diffusion', confidence: 'medium' },
      { pattern: /model[-\s]?hash:\s*[\w\d]+/gi, tool: 'stable-diffusion', confidence: 'high' },
      { pattern: /--ar\s+\d+:\d+/gi, tool: 'midjourney', confidence: 'high' },
      { pattern: /--v\s+\d+/gi, tool: 'midjourney', confidence: 'high' },
      { pattern: /--stylize\s+\d+/gi, tool: 'midjourney', confidence: 'high' },
      { pattern: /--chaos\s+\d+/gi, tool: 'midjourney', confidence: 'high' },
      { pattern: /--quality\s+[\d.]/gi, tool: 'midjourney', confidence: 'high' }
    ];

    for (const { pattern, tool, confidence } of parameterPatterns) {
      const matches = fileText.match(pattern);
      if (matches) {
        foundSignatures++;
        this.log(`Found AI parameter in file header: ${tool} - ${matches[0]}`);
        
        results.signatures.push({
          tool: tool,
          signature: matches[0],
          type: 'parameters',
          confidence: confidence,
          source: 'File header scan',
          details: `Found AI parameter: ${matches[0]}`
        });
      }
    }

    if (foundSignatures > 0) {
      this.log(`Comprehensive scan found ${foundSignatures} AI signatures in file header`);
      results.details.push(`Found ${foundSignatures} AI signatures in file header scan`);
    } else {
      this.log('No AI signatures found in comprehensive file scan');
      results.details.push('No AI signatures found in file header or metadata');
    }
  }

  // Calculate overall confidence from all found signatures
  calculateConfidence(signatures) {
    if (signatures.length === 0) return 'none';

    const highConfidence = signatures.filter(s => s.confidence === 'high').length;
    const mediumConfidence = signatures.filter(s => s.confidence === 'medium').length;
    const lowConfidence = signatures.filter(s => s.confidence === 'low').length;

    if (highConfidence >= 1) return 'high';
    if (highConfidence + mediumConfidence >= 2) return 'high';
    if (mediumConfidence >= 1) return 'medium';
    if (lowConfidence >= 2) return 'medium';
    if (lowConfidence >= 1) return 'low';

    return 'none';
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.HeaderParser = HeaderParser;
} else if (typeof module !== 'undefined') {
  module.exports = HeaderParser;
}