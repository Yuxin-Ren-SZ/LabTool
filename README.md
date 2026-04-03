# LabTools

A growing collection of interactive browser-based utilities for the cell biology bench.
No installation required — open any tool directly in a browser or visit the GitHub Pages site.

## Tools

| Tool | Description |
|---|---|
| [Cell Count Calculator](tools/cell-count/) | Hemocytometer counting with Trypan Blue viability, 4 counting modes, and dual-chamber support |

## Structure

```
LabTools/
├── index.html              # Hub landing page
├── assets/css/labtools.css # Shared design system
├── tools/
│   └── cell-count/
│       ├── index.html
│       └── README.md
└── docs/
    └── counting-modes.html # Hemocytometer mode reference diagrams
```

## Deployment

Hosted on GitHub Pages from the `dev` branch. Each tool is a self-contained HTML file — no build step required.

## Design

All tools share a common design system defined in `assets/css/labtools.css` — a Notion-inspired clean aesthetic with CSS custom properties for colors, spacing, and typography. New tools should import this stylesheet and use the defined variables.
