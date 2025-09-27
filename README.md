# Bot or Not - Chrome Extension

A Chrome extension that detects AI-generated content in images and videos by analyzing metadata, headers, and electronic signatures.

## Features

- **Context Menu Integration**: Right-click on images or videos to analyze them
- **AI Detection**: Analyzes metadata headers, EXIF data, and signatures for AI generation patterns
- **Tool Detection**: Identifies common AI tools (DALL-E, Midjourney, Stable Diffusion, etc.)
- **Confidence Scoring**: Provides high/medium/low confidence ratings
- **Clean UI**: Professional modal interface with detailed analysis results

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension is now installed and ready to use

## Usage

1. Right-click on any image or video on a webpage
2. Select "Bot or Not?" from the context menu
3. View the analysis results in the modal popup

## How It Works

The extension analyzes media content through several methods:

- **Header Analysis**: Scans file headers for AI tool signatures
- **EXIF Metadata**: Examines image metadata for generation software markers
- **URL Pattern Matching**: Checks if media is hosted on known AI platforms
- **Signature Detection**: Looks for watermarks and synthetic media markers

## Supported AI Tools

- DALL-E / OpenAI
- Midjourney
- Stable Diffusion
- Adobe Firefly
- Google Imagen
- Runway ML
- Leonardo.ai
- And more...

## Privacy

This extension processes all media analysis locally - no data is sent to external servers.

## Development

Built with:
- Chrome Extension Manifest V3
- Vanilla JavaScript
- CSS3 for styling
- No external dependencies

## Version

Current version: 1.0.0