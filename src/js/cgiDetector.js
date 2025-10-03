/**
 * CGI and Photo Editing Analysis Module
 * Simple color counting CGI detection - extracts unique colors correctly
 */
class CGIDetector {
    constructor() {}

    /**
     * Simple color counting CGI detection
     * @param {HTMLImageElement} imageElement - Image element to analyze
     * @param {Object} config - Configuration with samplingDensity and colorQuantization
     * @returns {Promise<Object>} CGI analysis results with uniqueColors and gradientRatio
     */
    async analyzeImage(imageElement, config = {}) {
        try {
            // Check if image is cross-origin
            const isCrossOrigin = imageElement.crossOrigin === 'anonymous' ||
                                  imageElement.src.startsWith('http') &&
                                  !imageElement.src.startsWith(window.location.origin);

            if (isCrossOrigin) {
                // For cross-origin images, try to get data via background script
                return await this.analyzeCrossOriginImage(imageElement.src, config);
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 300;
            canvas.height = 300;

            ctx.drawImage(imageElement, 0, 0, 300, 300);
            const imageData = ctx.getImageData(0, 0, 300, 300);

            const metrics = this.analyzePixelPatterns(imageData, config);
            return this.classifyFromMetrics(metrics);
        } catch (error) {
            // If canvas is tainted, try cross-origin analysis
            if (error.message.includes('tainted') || error.message.includes('cross-origin')) {
                return await this.analyzeCrossOriginImage(imageElement.src, config);
            }

            console.warn('CGI analysis failed:', error.message);
            return this.classifyFromMetrics({ uniqueColors: 0, gradientRatio: 0 });
        }
    }

    /**
     * Analyze cross-origin images via background script
     */
    async analyzeCrossOriginImage(srcUrl, config = {}) {
        try {
            // Try to get image data via background script
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: "getImageData",
                    url: srcUrl
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response && response.success && response.data) {
                const uint8Array = new Uint8Array(response.data);
                // Create a blob and analyze it
                const blob = new Blob([uint8Array]);
                const imageUrl = URL.createObjectURL(blob);

                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = async () => {
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = 300;
                            canvas.height = 300;

                            ctx.drawImage(img, 0, 0, 300, 300);
                            const imageData = ctx.getImageData(0, 0, 300, 300);
                            URL.revokeObjectURL(imageUrl);
                            const metrics = this.analyzePixelPatterns(imageData, config);
                            resolve(this.classifyFromMetrics(metrics));
                        } catch (error) {
                            URL.revokeObjectURL(imageUrl);
                            resolve(this.classifyFromMetrics({ uniqueColors: 0, gradientRatio: 0 }));
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(imageUrl);
                        resolve(this.classifyFromMetrics({ uniqueColors: 0, gradientRatio: 0 }));
                    };
                    img.src = imageUrl;
                });
            }
        } catch (error) {
            console.warn('Cross-origin analysis failed:', error.message);
        }

        // Final fallback: try to estimate based on image dimensions and type
        const metrics = this.estimateColorCount(srcUrl);
        return this.classifyFromMetrics(metrics);
    }

    /**
     * Simple estimation when pixel analysis fails
     */
    estimateColorCount(srcUrl) {
        // Basic estimation based on common image characteristics
        // This is a rough approximation when we can't analyze pixels
        try {
            const url = new URL(srcUrl);
            const filename = url.pathname.toLowerCase();
            
            // Common CGI indicators from filename
            if (filename.includes('render') || filename.includes('3d') || 
                filename.includes('digital') || filename.includes('artwork') ||
                filename.includes('illustration')) {
                return { uniqueColors: 150, gradientRatio: 0.7 };
            }
            
            // Default estimation for unknown images
            return { uniqueColors: 250, gradientRatio: 0.5 };
        } catch (error) {
            return { uniqueColors: 250, gradientRatio: 0.5 };
        }
    }

    analyzePixelPatterns(imageData, config = {}) {
        const { data: pixels, width, height } = imageData;

        // Use configurable sampling density (30-100, default 50)
        const samplingDensity = config.samplingDensity || 50;
        const sampleStep = Math.max(2, Math.floor(Math.min(width, height) / samplingDensity));

        // Use configurable color quantization (8-32 levels, default 16)
        const colorQuantization = config.colorQuantization || 16;
        const quantizationShift = Math.floor(8 - Math.log2(colorQuantization)); // 8→5, 16→4, 32→3

        const colorBuckets = new Map();
        let smoothTransitions = 0;
        let totalComparisons = 0;

        // Single-pass analysis: color counting + gradient analysis
        for (let y = 0; y < height - sampleStep; y += sampleStep) {
            for (let x = 0; x < width - sampleStep; x += sampleStep) {
                const i = (y * width + x) * 4;
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3];

                // Skip transparent/near-white pixels
                if (a < 125 || (r > 250 && g > 250 && b > 250)) continue;

                // Configurable quantization using bit shifting
                const colorKey = ((r >> quantizationShift) << (2 * (8 - quantizationShift))) |
                                ((g >> quantizationShift) << (8 - quantizationShift)) |
                                (b >> quantizationShift);
                colorBuckets.set(colorKey, (colorBuckets.get(colorKey) || 0) + 1);

                // Fast gradient check (right neighbor only)
                const rightX = x + sampleStep;
                if (rightX < width) {
                    const rightI = (y * width + rightX) * 4;
                    const rR = pixels[rightI];
                    const gR = pixels[rightI + 1];
                    const bR = pixels[rightI + 2];
                    const aR = pixels[rightI + 3];

                    if (aR >= 125) {
                        // Manhattan distance for speed
                        const colorDist = Math.abs(r - rR) + Math.abs(g - gR) + Math.abs(b - bR);
                        if (colorDist < 30) smoothTransitions++;
                        totalComparisons++;
                    }
                }
            }
        }

        return {
            uniqueColors: colorBuckets.size,
            gradientRatio: totalComparisons > 0 ? smoothTransitions / totalComparisons : 0
        };
    }



    classifyFromMetrics(metrics) {
        // Simplified: just return metrics without classification
        // Classification is now done in content.js for better flow control
        return {
            isCGI: false, // Deprecated, kept for compatibility
            isEdited: false, // Deprecated, kept for compatibility
            reasons: [], // Deprecated, kept for compatibility
            confidence: 0, // Deprecated, kept for compatibility
            metrics: {
                uniqueColors: metrics.uniqueColors,
                gradientRatio: metrics.gradientRatio
            },
            corsBlocked: false,
            filtersDetected: []
        };
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CGIDetector;
} else {
    window.CGIDetector = CGIDetector;
}
