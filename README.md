# Folder Structure Copier

Copy any folder's structure as a clean ASCII tree — ready to paste into AI prompts, documentation, or READMEs.

## Usage

Right-click any folder in the Explorer panel and choose **Copy Folder Structure**:

<img alt="Context menu showing Copy Folder Structure submenu" src="https://github.com/user-attachments/assets/1ac37183-eff4-4d03-ac39-7b68ef7ab89c" />


### Three copy modes

**Copy Full Structure** — the entire recursive tree, all levels deep.

```
my-project/
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   └── Modal.tsx
│   └── index.ts
├── public/
│   └── index.html
└── package.json
```

**Copy Shallow Structure** — immediate children only. Nested folders show `…` if they contain files.

```
my-project/
├── src/
│   └── …
├── public/
│   └── …
└── package.json
```

**Copy Structure (Selective Depth)** — opens a picker where you choose exactly which sub-folders to expand. Everything else stays collapsed.

<img alt="Selective depth folder picker" src="https://github.com/user-attachments/assets/7a4a3ef6-218b-4849-a43a-6d0ac140b912" />



## Settings

| Setting | Default | Description |
|---|---|---|
| `folderStructureCopier.excludePatterns` | `["node_modules", ".git", "dist", …]` | Glob patterns to exclude |
| `folderStructureCopier.includeRootFolderName` | `true` | Show the root folder name at the top |
| `folderStructureCopier.showFileIcons` | `false` | Prefix entries with 📁 / 📄 emoji |
| `folderStructureCopier.sortFoldersFirst` | `true` | List folders before files at each level |

### Customising exclude patterns

```json
"folderStructureCopier.excludePatterns": [
  "node_modules",
  ".git",
  "dist",
  "*.log",
  ".env*",
  "coverage"
]
```

## Tips

- **For AI prompts**: Use *Full Structure* for small projects; *Selective Depth* for large monorepos to keep context concise.
- **For documentation**: *Shallow Structure* gives a clean top-level overview.
- **Selective Depth**: Picking a deeply nested folder automatically includes all its parent folders so the tree stays connected.

## Issues & Feedback

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/devj-arch/folder-structure-copier/issues).
