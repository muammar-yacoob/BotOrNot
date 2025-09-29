/**
 * CGI and Photo Editing Analysis Module
 * Detects computer-generated images and signs of photo editing like smoothing.
 */
class CGIDetector {
    constructor() {}

    /**
     * Analyze an image for CGI and editing indicators.
     * @param {HTMLImageElement} image - The image element to analyze.
     * @returns {Promise<Object>} Analysis results.
     */
    async analyzeImage(image) {
        try {
            const metrics = await this.analyzeVisualCharacteristics(image);
            const { uniqueColors, gradientRatio, corsBlocked, fallback } = metrics;

            const analysis = {
                isCGI: false,
                isEdited: false,
                confidence: 0,
                metrics: metrics,
                reasons: [],
                filtersDetected: []
            };

            // Handle CORS-blocked images
            if (corsBlocked || fallback) {
                analysis.reasons.push('Cross-origin image analysis blocked by browser security policy');
                analysis.confidence = 0; // Can't determine confidence without pixel access
                return analysis;
            }

            if (uniqueColors < 200) {
                analysis.isCGI = true;
                analysis.confidence = 90;
                analysis.reasons.push(`Limited color palette (${uniqueColors} colors) suggests CGI.`);
            } else {
                let editingConfidence = 0;
                const filters = [];

                if (gradientRatio > 0.8) {
                    editingConfidence = 85;
                    filters.push({
                        name: 'Unnatural Smoothing',
                        confidence: editingConfidence,
                        description: 'Extreme gradient smoothness (>80%) suggests heavy photo editing or digital creation.'
                    });
                } else if (gradientRatio > 0.7) {
                    editingConfidence = 65;
                    filters.push({
                        name: 'Smoothing Gradient',
                        confidence: editingConfidence,
                        description: 'High ratio of smooth gradients (>70%) suggests photo editing or filtering.'
                    });
                }

                // Placeholder for unnatural lightning detection in future

                if (filters.length > 0) {
                    analysis.isEdited = true;
                    analysis.confidence = editingConfidence;
                    analysis.filtersDetected = filters;
                    analysis.reasons = filters.map(f => f.description);
                } else {
                    analysis.reasons.push('Image appears to be organic with no obvious editing detected.');
                }
            }

            return analysis;

        } catch (error) {
            return {
                isCGI: false,
                isEdited: false,
                confidence: 0,
                reasons: [`Analysis failed: ${error.message}`],
                metrics: { error: true },
                filtersDetected: []
            };
        }
    }

    /**
     * Analyze visual characteristics using a canvas with CORS error handling.
     * @param {HTMLImageElement} image - The image element.
     * @returns {Promise<Object>} The calculated visual metrics.
     */
    async analyzeVisualCharacteristics(image) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Sample a smaller area for performance
            canvas.width = 300;
            canvas.height = 300;

            ctx.drawImage(image, 0, 0, 300, 300);

            // Try to get image data - this will fail for cross-origin images
            let imageData;
            try {
                imageData = ctx.getImageData(0, 0, 300, 300);
                return this.analyzePixelPatterns(imageData);
            } catch (corsError) {
                // CORS error - canvas is tainted by cross-origin data
                // Return fallback analysis based on image properties
                return this.getFallbackAnalysis(image, corsError);
            }

        } catch (error) {
            console.error("Failed to analyze visual characteristics:", error);
            throw error;
        }
    }

    /**
     * Provides fallback analysis when canvas analysis fails due to CORS.
     * @param {HTMLImageElement} image - The image element.
     * @param {Error} corsError - The CORS error that occurred.
     * @returns {Object} Fallback visual metrics.
     */
    getFallbackAnalysis(image, corsError) {
        // For CORS-blocked images, we can't do pixel analysis
        // Return neutral analysis that doesn't falsely flag images
        return {
            uniqueColors: 500, // Safe default - won't trigger CGI detection
            gradientRatio: 0.5, // Neutral gradient ratio
            corsBlocked: true,
            fallback: true,
            error: corsError.message,
            analysis: 'Cross-origin image analysis blocked by CORS policy'
        };
    }

    /**
     * Analyze pixel patterns for color count and gradients.
     * @param {ImageData} imageData - The pixel data from the canvas.
     * @returns {Object} An object containing unique color count and gradient ratio.
     */
    analyzePixelPatterns(imageData) {
        const pixels = imageData.data;
        let totalPixels = 0;
        let gradientPixels = 0;
        const colorFrequency = new Map();

        // Sample pixels for performance
        for (let i = 0; i < pixels.length; i += 16) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            if (a < 128) continue; // Skip transparent pixels
            totalPixels++;

            // Check for smooth gradients by comparing with a nearby pixel
            if (i + 16 < pixels.length) {
                const nextR = pixels[i + 16];
                const nextG = pixels[i + 17];
                const nextB = pixels[i + 18];
                
                const colorDiff = Math.abs(r - nextR) + Math.abs(g - nextG) + Math.abs(b - nextB);
                if (colorDiff < 30) { // Threshold for a smooth transition
                    gradientPixels++;
                }
            }

            // Track color frequency, grouping similar colors
            const colorKey = `${Math.floor(r/32)*32},${Math.floor(g/32)*32},${Math.floor(b/32)*32}`;
            colorFrequency.set(colorKey, (colorFrequency.get(colorKey) || 0) + 1);
        }

        const gradientRatio = totalPixels > 0 ? gradientPixels / totalPixels : 0;
        const uniqueColors = colorFrequency.size;

        return {
            gradientRatio: Math.round(gradientRatio * 100),
            uniqueColors: uniqueColors
        };
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CGIDetector;
} else {
    window.CGIDetector = CGIDetector;
}
