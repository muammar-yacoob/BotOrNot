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
            
            const metrics = this.analyzePixelPatterns(imageData);
            return this.classifyFromMetrics(metrics);
        } catch (error) {
            // If canvas is tainted, try cross-origin analysis
            if (error.message.includes('tainted') || error.message.includes('cross-origin')) {
                return await this.analyzeCrossOriginImage(imageElement.src);
            }
            
            console.warn('CGI analysis failed:', error.message);
            return this.classifyFromMetrics({ uniqueColors: 0, gradientRatio: 0 });
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
                            const metrics = this.analyzePixelPatterns(imageData);
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

    analyzePixelPatterns(imageData) {
        const { data: pixels, width, height } = imageData;

        // Optimized sampling: use larger steps for speed, strategic positioning
        const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 30)); // Adaptive sampling
        const colorBuckets = new Map(); // Fast color bucketing
        let smoothTransitions = 0;
        let totalComparisons = 0;
        let sampledPixels = 0;

        // Single-pass analysis: color counting + gradient analysis combined
        for (let y = 0; y < height - sampleStep; y += sampleStep) {
            for (let x = 0; x < width - sampleStep; x += sampleStep) {
                const i = (y * width + x) * 4;
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3];

                // Skip transparent/white pixels
                if (a < 125 || (r > 250 && g > 250 && b > 250)) continue;

                sampledPixels++;

                // Aggressive color quantization for speed (8 levels per channel = 512 total colors max)
                const bucketR = (r >> 5) << 5; // Divide by 32, multiply by 32
                const bucketG = (g >> 5) << 5;
                const bucketB = (b >> 5) << 5;
                const colorKey = (bucketR << 16) | (bucketG << 8) | bucketB; // Bit-packed key

                colorBuckets.set(colorKey, (colorBuckets.get(colorKey) || 0) + 1);

                // Fast gradient check (right neighbor only for speed)
                const rightX = x + sampleStep;
                if (rightX < width) {
                    const rightI = (y * width + rightX) * 4;
                    const rR = pixels[rightI];
                    const gR = pixels[rightI + 1];
                    const bR = pixels[rightI + 2];
                    const aR = pixels[rightI + 3];

                    if (aR >= 125) {
                        // Fast approximate distance (Manhattan distance is faster than Euclidean)
                        const colorDistance = Math.abs(r - rR) + Math.abs(g - gR) + Math.abs(b - bR);

                        if (colorDistance < 30) smoothTransitions++; // Adjusted for Manhattan distance
                        totalComparisons++;
                    }
                }
            }
        }

        // Extract palette efficiently (top 8 colors)
        const topColors = Array.from(colorBuckets.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([colorKey]) => [
                (colorKey >> 16) & 0xFF,  // Extract R
                (colorKey >> 8) & 0xFF,   // Extract G
                colorKey & 0xFF           // Extract B
            ]);

        // Get dominant color (most frequent)
        const dominantColorKey = colorBuckets.size > 0 ?
            Array.from(colorBuckets.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0] : 0;

        const dominantColor = [
            (dominantColorKey >> 16) & 0xFF,
            (dominantColorKey >> 8) & 0xFF,
            dominantColorKey & 0xFF
        ];

        return {
            uniqueColors: colorBuckets.size,
            gradientRatio: totalComparisons > 0 ? parseFloat((smoothTransitions / totalComparisons).toFixed(3)) : 0,
            paletteSize: topColors.length,
            palette: topColors,
            dominantColor,
            sampledPixels // For debugging
        };
    }



    classifyFromMetrics(metrics) {
        const reasons = [];
        let isCGI = false;
        let isEdited = false;

        // Adjusted thresholds for aggressive quantization (32-level quantization = max 512 colors)
        // CGI/Digital art typically uses very limited color palettes

        if (metrics.uniqueColors < 80) {
            isCGI = true;
            reasons.push('Low color count');
        }

        // Very smooth gradients indicate digital generation
        if (metrics.gradientRatio > 0.7) {
            if (isCGI) {
                reasons.push('Unrealistic smooth gradient');
            } else {
                isCGI = true;
                reasons.push('Unrealistic smooth gradient');
            }
        }

        // Combined indicators for borderline cases
        if (metrics.gradientRatio > 0.5 && metrics.uniqueColors < 120) {
            if (!isCGI) {
                isCGI = true;
                reasons.push('Combined low colors and smooth gradients');
            }
        }

        // Very limited palette indicates cartoon/animation
        if (metrics.paletteSize <= 4) {
            if (!isCGI) {
                isCGI = true;
                reasons.push('Very limited color palette');
            }
        }

        // Photo editing detection for non-CGI images
        if (!isCGI) {
            if (metrics.uniqueColors < 200 && metrics.gradientRatio > 0.3) {
                isEdited = true;
                reasons.push('Possible photo editing detected');
            }
        }

        // Fast confidence calculation
        let confidence = 0;
        if (isCGI) {
            confidence = reasons.length >= 2 ? 90 : 85;
        } else if (isEdited) {
            confidence = 70;
        }

        return {
            isCGI,
            isEdited,
            reasons,
            confidence,
            metrics: {
                uniqueColors: metrics.uniqueColors,
                gradientRatio: metrics.gradientRatio,
                paletteSize: metrics.paletteSize,
                sampledPixels: metrics.sampledPixels
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
