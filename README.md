# Labeling Easier

Windows desktop dataset labeling tool for image and video annotation.

## What It Does

- Image and video frame annotation with bounding boxes.
- `A` / `D` keyboard navigation for previous and next image or frame.
- AI-assisted labeling through a local Python YOLO worker.
- Review workflow for AI-generated labels.
- Import, export, and conversion support for YOLO, COCO, Pascal VOC, and LabelMe style data.

## Download

End users should install the latest Windows installer from GitHub Releases.

The installer contains the packaged desktop app. Source builds, temporary artifacts, local project files, and release outputs are not stored in the git history.

## Development

Requirements:

- Windows
- Node.js 20+
- Python environment for AI labeling, configured separately through `scripts/setup-ai-env.ps1`

Install dependencies:

```powershell
npm install
```

Run the app in development:

```powershell
npm run dev
```

Build and package:

```powershell
npm run package
```

Run tests:

```powershell
npm test
```

## Repository Hygiene

The repository tracks source code, app resources, build configuration, and maintained tests. It ignores generated output such as `dist/`, `dist-electron/`, `release/`, smoke-test artifacts, logs, caches, local datasets, exported labels, and user project databases.
