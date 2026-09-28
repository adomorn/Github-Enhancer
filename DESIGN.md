# GitHub Enhancer design system

## Scene and direction
A developer moves between a bright office and an evening laptop session while researching code. Follow GitHub's selected color mode in-page and the OS in standalone extension pages. Preserve the existing GitHub-aligned blue identity.

## Color
Restrained: canvas white / #0d1117, secondary surface #f6f8fa / #161b22, ink #1f2328 / #e6edf3, muted #59636e / #919ba6, border #d1d9e0 / #30363d, primary blue #0969da / #4493f8. Blue identifies actions, selected state, and focus. Success green only communicates completion.

## Typography
System sans; 13px compact body, 14px input, 18px section headings, 24px workbench title. Monospace only for owner/repo identifiers and keyboard hints. No uppercase eyebrows.

## Surfaces
Popup: 400px compact workbench, five task sections: contextual tools, code basket, workspaces, writing and saved pages. In-page workbench: isolated extension-origin frame, right aligned nonmodal 400px panel, bounded to viewport, no GitHub layout shift. Command palette: accessible overlay with keyboard focus and explicit close. Settings: readable two-column desktop layout, stacked narrow screens.

## Components
Single 1px border, 8px control radius, 12px panel radius. Lists use separators, not nested cards. Icons use a consistent 16px stroke vocabulary. Labeled native inputs, buttons and selects. State feedback uses a live status region; destructive actions offer Undo.

## Interaction
Short 150ms opacity/transform transitions; reduced-motion removes transitions. Arrow keys and Enter in the palette, Escape dismisses and restores focus. Notes save explicitly to avoid pretending persistence succeeded. All empty, loading, disconnected and storage-error states explain the next action.
