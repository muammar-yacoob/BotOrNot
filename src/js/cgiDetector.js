/**
 * CGI and Photo Editing Analysis Module
 * Simple color counting CGI detection - extracts unique colors correctly
 */
class CGIDetector {
    constructor() {}

    /**
     * Simple color counting CGI detection
     * @param {HTMLImageElement} imageElement - Image element to analyze
     * @returns {Promise<Object>} CGI analysis results with uniqueColors and gradientRatio
     */
    async analyzeImage(imageElement) {
        try {
            // Check if image is cross-origin
            const isCrossOrigin = imageElement.crossOrigin === 'anonymous' || 
                                  imageElement.src.startsWith('http') && 
                                  !imageElement.src.startsWith(window.location.origin);

            if (isCrossOrigin) {
                // For cross-origin images, try to get data via background script
                return await this.analyzeCrossOriginImage(imageElement.src);
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 300;
            canvas.height = 300;

            ctx.drawImage(imageElement, 0, 0, 300, 300);
            const imageData = ctx.getImageData(0, 0, 300, 300);
            
            return this.analyzePixelPatterns(imageData);
        } catch (error) {
            // If canvas is tainted, try cross-origin analysis
            if (error.message.includes('tainted') || error.message.includes('cross-origin')) {
                return await this.analyzeCrossOriginImage(imageElement.src);
            }
            
            console.warn('CGI analysis failed:', error.message);
            return {
                uniqueColors: 0,
                gradientRatio: 0
            };
        }
    }

    /**
     * Analyze cross-origin images via background script
     */
    async analyzeCrossOriginImage(srcUrl) {
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
                            resolve(this.analyzePixelPatterns(imageData));
                        } catch (error) {
                            URL.revokeObjectURL(imageUrl);
                            resolve({ uniqueColors: 0, gradientRatio: 0 });
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(imageUrl);
                        resolve({ uniqueColors: 0, gradientRatio: 0 });
                    };
                    img.src = imageUrl;
                });
            }
        } catch (error) {
            console.warn('Cross-origin analysis failed:', error.message);
        }

        // Final fallback: try to estimate based on image dimensions and type
        return this.estimateColorCount(srcUrl);
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
                return { uniqueColors: 150, gradientRatio: 0.3 };
            }
            
            // Default estimation for unknown images
            return { uniqueColors: 250, gradientRatio: 0.5 };
        } catch (error) {
            return { uniqueColors: 250, gradientRatio: 0.5 };
        }
    }

    analyzePixelPatterns(imageData) {
        const { data: pixels } = imageData;
        const colors = new Set();
        let smoothTransitions = 0;
        let totalComparisons = 0;

        // Count unique colors with color grouping to reduce precision
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            if (a < 128) continue; // Skip transparent pixels

            // Group colors to reduce precision and focus on major color differences
            const colorKey = `${Math.floor(r/8)*8},${Math.floor(g/8)*8},${Math.floor(b/8)*8}`;
            colors.add(colorKey);
        }

        // Calculate gradient ratio by comparing neighboring pixels
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            if (a < 128) continue; // Skip transparent pixels

            // Check right neighbor
            if (i + 4 < pixels.length) {
                const nextR = pixels[i + 4];
                const nextG = pixels[i + 5];
                const nextB = pixels[i + 6];
                const diff = Math.abs(r - nextR) + Math.abs(g - nextG) + Math.abs(b - nextB);
                if (diff < 20) smoothTransitions++;
                totalComparisons++;
            }

            // Check bottom neighbor
            if (i + (300 * 4) < pixels.length) {
                const nextR = pixels[i + (300 * 4)];
                const nextG = pixels[i + (300 * 4) + 1];
                const nextB = pixels[i + (300 * 4) + 2];
                const diff = Math.abs(r - nextR) + Math.abs(g - nextG) + Math.abs(b - nextB);
                if (diff < 20) smoothTransitions++;
                totalComparisons++;
            }
        }

        const uniqueColors = colors.size;
        const gradientRatio = totalComparisons > 0 ? smoothTransitions / totalComparisons : 0;

        return {
            uniqueColors: uniqueColors,
            gradientRatio: parseFloat(gradientRatio.toFixed(2))
        };
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CGIDetector;
} else {
    window.CGIDetector = CGIDetector;
}
