// AI Signature Detection Module
// Simple module for detecting AI tool signatures in image metadata

class AISignatureDetector {
    constructor() {
        this.signatureDb = new SimpleSignatureDb();
        this.headerParser = new HeaderParser(this.signatureDb);
        this.initPromise = this.init();
    }

    async init() {
        await this.signatureDb.initPromise;
    }

    /**
     * Check if an image contains AI signatures
     * @param {string} srcUrl - URL of the image to check
     * @returns {Promise<Object>} Detection result with signatures and confidence
     */
    async detectAISignatures(srcUrl) {
        try {
            await this.initPromise;

            // Get file content via background script
            const fileContent = await this.fetchFileContent(srcUrl);

            if (!fileContent) {
                return {
                    hasAISignatures: false,
                    signatures: [],
                    confidence: 'none',
                    method: 'no-file-content',
                    details: ['Could not fetch file content for signature analysis'],
                    error: null
                };
            }

            // Parse file headers for AI signatures
            let arrayBuffer;
            if (fileContent instanceof ArrayBuffer) {
                arrayBuffer = fileContent;
            } else if (Array.isArray(fileContent)) {
                arrayBuffer = new Uint8Array(fileContent).buffer;
            } else if (fileContent && fileContent.byteLength !== undefined && fileContent.buffer) {
                arrayBuffer = fileContent.buffer;
            } else {
                // Unknown format; try to coerce
                arrayBuffer = new Uint8Array(fileContent || []).buffer;
            }

            const headerAnalysis = await this.headerParser.parseFile(arrayBuffer, srcUrl);

            return {
                hasAISignatures: headerAnalysis.signatures?.length > 0,
                signatures: headerAnalysis.signatures || [],
                confidence: headerAnalysis.signatures?.length > 0 ? 'high' : 'none',
                method: 'signature-detection',
                details: headerAnalysis.details || [],
                fileType: headerAnalysis.fileType,
                detectedTool: headerAnalysis.signatures?.[0]?.tool || null,
                error: null
            };

        } catch (error) {
            return {
                hasAISignatures: false,
                signatures: [],
                confidence: 'error',
                method: 'signature-detection',
                details: [`Signature detection failed: ${error.message}`],
                error: error.message
            };
        }
    }

    /**
     * Fetch file content via background script
     * @param {string} url - URL to fetch
     * @returns {Promise<ArrayBuffer|null>} File content or null if failed
     */
    async fetchFileContent(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'getImageData', url },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response?.error || 'Fetch failed'));
                    }
                }
            );
        });
    }
}

// Simple signature database (extracted from content.js)
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
            const lowerSig = signature.toLowerCase();

            // Skip overly short signatures that cause false positives in binary data
            if (lowerSig.length <= 2) {
                continue;
            }

            // For longer signatures, use simple includes check
            if (lowerText.includes(lowerSig)) {
                return {
                    tool: this.formatToolName(signature),
                    signature: signature,
                    type: 'text-signature',
                    confidence: 'high'
                };
            }
        }
        return null;
    }

    formatToolName(signature) {
        return signature.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

// Export for use in content script
if (typeof window !== 'undefined') {
    window.AISignatureDetector = AISignatureDetector;
    window.SimpleSignatureDb = SimpleSignatureDb;
} else if (typeof module !== 'undefined') {
    module.exports = { AISignatureDetector, SimpleSignatureDb };
}