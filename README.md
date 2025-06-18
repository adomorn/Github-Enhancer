# 🚀 GitHub Enhancer 
[![Chrome Extension CI](https://github.com/adomorn/Github-Enhancer/actions/workflows/chrome-extension-ci.yml/badge.svg)](https://github.com/adomorn/Github-Enhancer/actions/workflows/chrome-extension-ci.yml)
![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Transform your GitHub browsing experience with stunning visual enhancements, modern animations, and improved functionality! ✨

## 🎯 Features

### 🎨 **Theme Enhancements**
- **🔢 Binary Cursor Trail** - Interactive 1/0 particles that follow your cursor with random rotation
- **🌟 Enhanced Star Button Animations** - Magical glow effects with floating sparkles on hover/click
- **🌌 Dynamic Floating Orbs Background** - Smooth animated orbs and geometric particles
- **💫 Advanced 3D Hover Effects** - Glassmorphism with 3D transforms and perspective
- **⚡ Micro-Interactions** - Enhanced file tree, code highlighting, and navigation animations

### 📊 **Data Enhancements**
- **👥 Enhanced Contributor Cards** - Detailed contributor information with modern styling
- **📅 Full Date/Time Display** - Complete timestamps instead of relative time
- **📁 File Size Display** - Show file sizes in repository browsers
- **🎛️ Customizable Settings** - Fine-tune all features through popup interface

### 🔧 **Technical Features**
- **🚀 Modern Architecture** - Modular enhancer system with BaseEnhancer class
- **🎯 Performance Optimized** - Efficient DOM manipulation and event handling
- **🌙 Dark/Light Theme Support** - Automatic theme detection and adaptation
- **📱 Responsive Design** - Works seamlessly across different screen sizes

## 🛠️ Installation

### Method 1: Chrome Web Store (Coming Soon)
*Extension will be available on Chrome Web Store soon!*

### Method 2: Developer Mode
1. **Clone the repository:**
    ```bash
    git clone https://github.com/adomorn/Github-Enhancer.git
    cd Github-Enhancer
    ```

2. **Load in Chrome:**
    - Open Chrome and navigate to `chrome://extensions/`
    - Enable "Developer mode" (top right toggle)
    - Click "Load unpacked" and select the project folder

3. **Enjoy!** 🎉
    - Navigate to any GitHub page
    - Extension will automatically enhance your experience

## 🎮 Usage

### 🌟 **Star Button Magic**
- **Hover** over any star button to see magical glow effects
- **Click** to trigger explosion animations with floating sparkles
- Position stays fixed while maintaining beautiful visual feedback

### 🔢 **Binary Cursor Trail**
- Move your mouse to see subtle 1/0 particles following your cursor
- Each particle has random rotation (-45° to +45°) for dynamic feel
- Four different styles: zero (blue), one (green), matrix (green), cyber (pink)

### 🌌 **Background Animations**
- Enjoy smooth floating orbs that drift across the background
- Geometric particles (squares, triangles, diamonds) with rotation effects
- All animations are performance-optimized and accessibility-friendly

### ⚙️ **Settings Panel**
Click the extension icon to access:
- **Theme Enhancements** - Toggle modern animations and effects
- **Contributor Cards** - Customize contributor information display
- **Date/Time Format** - Choose your preferred time display format
- **File Size Display** - Show/hide file sizes in repository browsers

## 🎨 **Visual Showcase**

```
🌟 Star Button Effects:    ✨ Magical glow + floating sparkles
🔢 Cursor Trail:          1 0 1 0 (rotating binary particles)
🌌 Background:            Floating orbs + geometric shapes
💫 3D Effects:            Glassmorphism + perspective transforms
⚡ Micro-interactions:    Enhanced hover states everywhere
```

## 🔧 **Configuration Options**

| Setting | Description | Default |
|---------|-------------|---------|
| `enableThemeEnhancements` | Enable/disable all theme effects | `true` |
| `enableEnhancedContributors` | Show enhanced contributor cards | `true` |
| `enableDateTimeEnhancement` | Display full timestamps | `true` |
| `enableFileSizeDisplay` | Show file sizes | `true` |
| `contributorCardWidth` | Width of contributor cards | `300px` |
| `maxContributorCards` | Maximum cards to display | `10` |
| `locale` | Date/time formatting locale | `en-US` |

## 🏗️ **Architecture**

```
src/
├── 🎯 content/main.js          # Main content script
├── 🔧 enhancers/               # Modular enhancement system
│   ├── base-enhancer.js        # Base class for all enhancers
│   ├── theme-enhancer.js       # Visual effects and animations
│   ├── contributor-enhancer.js # Contributor card enhancements
│   ├── date-enhancer.js        # Date/time improvements
│   └── file-size-enhancer.js   # File size display
├── 🎨 styles/content.css       # Global styles
├── 🔧 utils/                   # Utility functions
├── 🎛️ popup/                   # Extension popup interface
└── 🚀 background/              # Service worker
```

## 🤝 **Contributing**

We welcome contributions! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m '✨ Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### 🐛 **Bug Reports**
Found a bug? Please open an issue with:
- Browser version and OS
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

### 💡 **Feature Requests**
Have an idea? We'd love to hear it! Open an issue with:
- Clear description of the feature
- Use case and benefits
- Any mockups or examples

## 📜 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- GitHub for providing an amazing platform to enhance
- The open-source community for inspiration and feedback
- All contributors who help make this extension better

## 📊 **Analytics**

![Alt](https://repobeats.axiom.co/api/embed/f18cf543e0af776cea448efd11e221af3490e2d4.svg "Repobeats analytics image")

---

<div align="center">

**⭐ Star this repo if you find it useful! ⭐**

Made with ❤️ for the GitHub community

</div>
