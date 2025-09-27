/**
 * AI Composition Analysis Module
 * Detects AI-generated image patterns based on composition and rendering characteristics
 */

class CompositionAnalyzer {
    constructor() {
        this.aiPatterns = {
            // Rendering characteristics
            rendering: {
                hyperRealistic: ['synthetic texture', 'plastic sheen', 'rendered quality', 'artificial lighting'],
                exaggerated: ['glossy droplets', 'dramatic shadows', 'lens flares', 'perfect gradients'],
                cgi: ['3d rendered', 'computer generated', 'artificial textures', 'rendered surfaces']
            },
            
            // Composition patterns
            composition: {
                perfect: ['flawless composition', 'perfect lighting', 'ideal framing', 'professional quality'],
                artificial: ['too perfect', 'unrealistic positioning', 'artificial elements', 'staged appearance'],
                consistent: ['consistent lighting', 'uniform textures', 'perfect symmetry', 'ideal proportions']
            },
            
            // Color and lighting patterns
            lighting: {
                dramatic: ['dramatic lighting', 'strong highlights', 'pronounced shadows', 'theatrical illumination'],
                artificial: ['artificial light sources', 'perfect shadows', 'ideal reflections', 'synthetic illumination'],
                professional: ['studio lighting', 'professional setup', 'perfect exposure', 'ideal contrast']
            },
            
            // Texture and detail patterns
            textures: {
                synthetic: ['synthetic textures', 'plastic appearance', 'artificial materials', 'rendered surfaces'],
                perfect: ['flawless textures', 'uniform details', 'consistent patterns', 'ideal surfaces'],
                exaggerated: ['enhanced details', 'exaggerated features', 'over-rendered', 'artificial enhancement']
            }
        };
        
        this.confidenceThresholds = {
            low: 40,
            medium: 60,
            high: 80
        };
    }

    /**
     * Analyze image composition for AI generation patterns
     * @param {HTMLImageElement} image - Image element to analyze
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeComposition(image) {
        try {
            const analysis = {
                isAI: false,
                confidence: 0,
                patterns: [],
                reasons: [],
                metrics: {}
            };

            // Analyze image properties
            const properties = this.analyzeImageProperties(image);
            
            // Analyze visual characteristics
            const visualAnalysis = await this.analyzeVisualCharacteristics(image);
            
            // Analyze composition quality
            const compositionAnalysis = this.analyzeCompositionQuality(image);
            
            // Combine analyses
            analysis.patterns = [...properties.patterns, ...visualAnalysis.patterns, ...compositionAnalysis.patterns];
            analysis.reasons = [...properties.reasons, ...visualAnalysis.reasons, ...compositionAnalysis.reasons];
            analysis.metrics = { ...properties.metrics, ...visualAnalysis.metrics, ...compositionAnalysis.metrics };
            
            // Calculate confidence
            analysis.confidence = this.calculateCompositionConfidence(analysis.patterns, analysis.metrics);
            analysis.isAI = analysis.confidence >= this.confidenceThresholds.medium;
            
            return analysis;

        } catch (error) {
            return {
                isAI: false,
                confidence: 0,
                patterns: ['analysis_failed'],
                reasons: [`Composition analysis failed: ${error.message}`],
                metrics: { error: true }
            };
        }
    }

    /**
     * Analyze basic image properties for AI indicators
     */
    analyzeImageProperties(image) {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const aspectRatio = width / height;
        
        const patterns = [];
        const reasons = [];
        const metrics = {
            width,
            height,
            aspectRatio: Math.round(aspectRatio * 100) / 100
        };

        // Check for perfect/common AI dimensions
        const aiDimensions = [
            [512, 512], [1024, 1024], [1024, 768], [768, 1024],
            [1536, 1536], [2048, 2048], [1024, 1024]
        ];

        for (const [w, h] of aiDimensions) {
            if (width === w && height === h) {
                patterns.push('ai_dimensions');
                reasons.push(`Common AI generation dimensions (${w}x${h})`);
                break;
            }
        }

        // Check for perfect aspect ratios
        const perfectRatios = [1.0, 1.33, 1.5, 1.78, 0.75, 0.56];
        for (const ratio of perfectRatios) {
            if (Math.abs(aspectRatio - ratio) < 0.01) {
                patterns.push('perfect_ratio');
                reasons.push(`Perfect aspect ratio (${ratio})`);
                break;
            }
        }

        return { patterns, reasons, metrics };
    }

    /**
     * Analyze visual characteristics using canvas
     */
    async analyzeVisualCharacteristics(image) {
        const patterns = [];
        const reasons = [];
        const metrics = {};

        try {
            // Create canvas for analysis
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Sample smaller area for performance
            canvas.width = 300;
            canvas.height = 300;
            
            ctx.drawImage(image, 0, 0, 300, 300);
            const imageData = ctx.getImageData(0, 0, 300, 300);
            
            // Analyze pixel data for AI patterns
            const pixelAnalysis = this.analyzePixelPatterns(imageData);
            patterns.push(...pixelAnalysis.patterns);
            reasons.push(...pixelAnalysis.reasons);
            Object.assign(metrics, pixelAnalysis.metrics);

        } catch (error) {
            patterns.push('metadata_analysis');
            reasons.push('Image metadata analysis');
        }

        return { patterns, reasons, metrics };
    }

    /**
     * Analyze pixel patterns for AI characteristics
     */
    analyzePixelPatterns(imageData) {
        const pixels = imageData.data;
        const patterns = [];
        const reasons = [];
        const metrics = {};

        let totalPixels = 0;
        let gradientPixels = 0;
        let perfectColorPixels = 0;
        const colorFrequency = new Map();

        // Sample every 4th pixel
        for (let i = 0; i < pixels.length; i += 16) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];

            if (a < 128) continue; // Skip transparent pixels
            totalPixels++;

            // Check for perfect colors (common in AI generation)
            if ((r % 5 === 0) && (g % 5 === 0) && (b % 5 === 0)) {
                perfectColorPixels++;
            }

            // Check for smooth gradients
            if (i + 16 < pixels.length) {
                const nextR = pixels[i + 16];
                const nextG = pixels[i + 17];
                const nextB = pixels[i + 18];
                
                const colorDiff = Math.abs(r - nextR) + Math.abs(g - nextG) + Math.abs(b - nextB);
                if (colorDiff < 30) { // Smooth gradient
                    gradientPixels++;
                }
            }

            // Track color frequency
            const colorKey = `${Math.floor(r/32)*32},${Math.floor(g/32)*32},${Math.floor(b/32)*32}`;
            colorFrequency.set(colorKey, (colorFrequency.get(colorKey) || 0) + 1);
        }

        // Calculate metrics
        const gradientRatio = gradientPixels / totalPixels;
        const perfectColorRatio = perfectColorPixels / totalPixels;
        const uniqueColors = colorFrequency.size;

        metrics.gradientRatio = Math.round(gradientRatio * 100) / 100;
        metrics.perfectColorRatio = Math.round(perfectColorRatio * 100) / 100;
        metrics.uniqueColors = uniqueColors;

        // Detect AI patterns
        if (gradientRatio > 0.7) {
            patterns.push('smooth_gradients');
            reasons.push('High ratio of smooth gradients (AI characteristic)');
        }

        if (perfectColorRatio > 0.3) {
            patterns.push('perfect_colors');
            reasons.push('High ratio of perfect color values (AI characteristic)');
        }

        if (uniqueColors > 1000 && gradientRatio > 0.5) {
            patterns.push('ai_rendering');
            reasons.push('Complex rendering with smooth gradients (AI characteristic)');
        }

        return { patterns, reasons, metrics };
    }

    /**
     * Analyze composition quality
     */
    analyzeCompositionQuality(image) {
        const patterns = [];
        const reasons = [];
        const metrics = {};

        // Check for professional quality indicators
        const width = image.naturalWidth;
        const height = image.naturalHeight;

        // High resolution often indicates AI generation
        if (width >= 1024 || height >= 1024) {
            patterns.push('high_resolution');
            reasons.push('High resolution image (common in AI generation)');
            metrics.resolution = 'high';
        }

        // Perfect dimensions
        if (width % 8 === 0 && height % 8 === 0) {
            patterns.push('perfect_dimensions');
            reasons.push('Perfect dimension alignment (AI characteristic)');
        }

        return { patterns, reasons, metrics };
    }

    /**
     * Calculate confidence based on detected patterns
     */
    calculateCompositionConfidence(patterns, metrics) {
        let score = 0;

        // Pattern-based scoring
        const patternScores = {
            'ai_dimensions': 20,
            'perfect_ratio': 15,
            'smooth_gradients': 25,
            'perfect_colors': 20,
            'ai_rendering': 30,
            'high_resolution': 15,
            'perfect_dimensions': 10
        };

        patterns.forEach(pattern => {
            score += patternScores[pattern] || 5;
        });

        // Metrics-based scoring
        if (metrics.gradientRatio > 0.8) score += 20;
        if (metrics.perfectColorRatio > 0.4) score += 25;
        if (metrics.uniqueColors > 1500) score += 15;

        return Math.min(score, 100);
    }

    /**
     * Get human-readable reason for composition detection
     */
    getCompositionReason(confidence, patterns) {
        if (confidence >= 80) {
            return 'Strong AI composition indicators detected';
        }
        if (confidence >= 60) {
            return 'Multiple AI composition patterns found';
        }
        if (confidence >= 40) {
            return 'Some AI composition characteristics detected';
        }
        return 'Natural composition characteristics detected';
    }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompositionAnalyzer;
} else {
    window.CompositionAnalyzer = CompositionAnalyzer;
}
