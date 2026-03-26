import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { minimatch } from "minimatch";

interface FolderEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  children?: FolderEntry[];
}

interface SelectiveDepthItem {
  label: string;
  description?: string;
  fullPath: string;
  picked: boolean;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("folderStructureCopier");
  return {
    excludePatterns: cfg.get<string[]>("excludePatterns", []),
    includeRootFolderName: cfg.get<boolean>("includeRootFolderName", true),
    showFileIcons: cfg.get<boolean>("showFileIcons", false),
    sortFoldersFirst: cfg.get<boolean>("sortFoldersFirst", true),
  };
}

function isExcluded(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(name, pattern));
}

function readEntries(dirPath: string, excludePatterns: string[]): FolderEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(dirPath);
  } catch {
    return [];
  }

  const entries: FolderEntry[] = names
    .filter((name) => !isExcluded(name, excludePatterns))
    .map((name) => {
      const fullPath = path.join(dirPath, name);
      let isDir = false;
      try {
        isDir = fs.statSync(fullPath).isDirectory();
      } catch { /* skip unreadable */ }
      return { name, fullPath, isDirectory: isDir };
    });

  return entries;
}

function sortEntries(entries: FolderEntry[], foldersFirst: boolean): FolderEntry[] {
  if (!foldersFirst) {
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }
  const dirs = entries.filter((e) => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => !e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function buildFullTree(dirPath: string, excludePatterns: string[], sortFoldersFirst: boolean): FolderEntry[] {
  const entries = sortEntries(readEntries(dirPath, excludePatterns), sortFoldersFirst);
  return entries.map((entry) => {
    if (entry.isDirectory) {
      entry.children = buildFullTree(entry.fullPath, excludePatterns, sortFoldersFirst);
    }
    return entry;
  });
}

function buildShallowTree(dirPath: string, excludePatterns: string[], sortFoldersFirst: boolean): FolderEntry[] {
  return sortEntries(readEntries(dirPath, excludePatterns), sortFoldersFirst);
}

function buildSelectiveTree(
  dirPath: string,
  expandedSet: Set<string>,
  excludePatterns: string[],
  sortFoldersFirst: boolean
): FolderEntry[] {
  const entries = sortEntries(readEntries(dirPath, excludePatterns), sortFoldersFirst);
  return entries.map((entry) => {
    if (entry.isDirectory && expandedSet.has(entry.fullPath)) {
      entry.children = buildSelectiveTree(entry.fullPath, expandedSet, excludePatterns, sortFoldersFirst);
    }
    return entry;
  });
}

function renderTree(
  entries: FolderEntry[],
  showIcons: boolean,
  prefix = "",
  isRoot = false
): string {
  if (isRoot && entries.length === 0) {
    return "(empty folder)\n";
  }

  let output = "";

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    let label = entry.name;
    if (showIcons) {
      label = entry.isDirectory ? `📁 ${entry.name}` : `📄 ${entry.name}`;
    } else if (entry.isDirectory) {
      label = `${entry.name}/`;
    }

    output += `${prefix}${connector}${label}\n`;

    if (entry.isDirectory && entry.children !== undefined) {
      output += renderTree(entry.children, showIcons, prefix + childPrefix);
    } else if (entry.isDirectory && entry.children === undefined) {
      let hasContents = false;
      try {
        hasContents = fs.readdirSync(entry.fullPath).length > 0;
      } catch { /* ignore */ }
      if (hasContents) {
        output += `${prefix}${childPrefix}└── …\n`;
      }
    }
  });

  return output;
}

function buildOutput(rootPath: string, entries: FolderEntry[], config: ReturnType<typeof getConfig>): string {
  const rootName = path.basename(rootPath);
  let output = "";

  if (config.includeRootFolderName) {
    const rootLabel = config.showFileIcons ? `📁 ${rootName}/` : `${rootName}/`;
    output += `${rootLabel}\n`;
  }

  output += renderTree(entries, config.showFileIcons);
  return output;
}

async function pickSelectiveFolders(
  rootPath: string,
  excludePatterns: string[],
  sortFoldersFirst: boolean
): Promise<Set<string> | undefined> {
  // Collect all subdirectories (up to reasonable depth for UX)
  function collectDirs(dirPath: string, depth: number, maxDepth = 6): SelectiveDepthItem[] {
    if (depth > maxDepth) {
      return [];
    }
    const entries = readEntries(dirPath, excludePatterns);
    const dirs = sortEntries(
      entries.filter((e) => e.isDirectory),
      sortFoldersFirst
    );

    const items: SelectiveDepthItem[] = [];
    for (const dir of dirs) {
      const relative = path.relative(rootPath, dir.fullPath);
      const indent = "  ".repeat(depth - 1);
      items.push({
        label: `${indent}${depth > 1 ? "└ " : ""}${dir.name}/`,
        description: relative,
        fullPath: dir.fullPath,
        picked: false,
      });
      items.push(...collectDirs(dir.fullPath, depth + 1, maxDepth));
    }
    return items;
  }

  const allDirs = collectDirs(rootPath, 1);

  if (allDirs.length === 0) {
    vscode.window.showInformationMessage("No subfolders found to expand.");
    return undefined;
  }

  const quickPickItems: vscode.QuickPickItem[] = allDirs.map((d) => ({
    label: d.label,
    description: d.description,
    picked: d.picked,
  }));

  const selected = await vscode.window.showQuickPick(quickPickItems, {
    canPickMany: true,
    placeHolder: "Select folders to expand in the structure (others show shallow)",
    title: "Selective Folder Structure — Choose Folders to Expand",
  });

  if (!selected) {
    return undefined;
  }

  const expandedSet = new Set<string>();
  for (const item of selected) {
    const dir = allDirs.find((d) => d.description === item.description);
    if (dir) {
      expandedSet.add(dir.fullPath);
      // Also expand all parent paths so the tree is connected
      let current = path.dirname(dir.fullPath);
      while (current !== rootPath && current !== path.dirname(current)) {
        expandedSet.add(current);
        current = path.dirname(current);
      }
    }
  }

  return expandedSet;
}

async function copyFullStructure(uri: vscode.Uri) {
  const rootPath = uri.fsPath;
  const config = getConfig();

  const entries = buildFullTree(rootPath, config.excludePatterns, config.sortFoldersFirst);
  const output = buildOutput(rootPath, entries, config);

  await vscode.env.clipboard.writeText(output);

  const lineCount = output.split("\n").length - 1;
  vscode.window.showInformationMessage(
    `✅ Full structure copied! (${lineCount} lines)`
  );
}

async function copyShallowStructure(uri: vscode.Uri) {
  const rootPath = uri.fsPath;
  const config = getConfig();

  const entries = buildShallowTree(rootPath, config.excludePatterns, config.sortFoldersFirst);
  const output = buildOutput(rootPath, entries, config);

  await vscode.env.clipboard.writeText(output);

  vscode.window.showInformationMessage(
    `✅ Shallow structure copied! (${entries.length} items)`
  );
}

async function copySelectiveStructure(uri: vscode.Uri) {
  const rootPath = uri.fsPath;
  const config = getConfig();

  const expandedSet = await pickSelectiveFolders(
    rootPath,
    config.excludePatterns,
    config.sortFoldersFirst
  );

  if (!expandedSet) {
    return;
  }

  const entries = buildSelectiveTree(
    rootPath,
    expandedSet,
    config.excludePatterns,
    config.sortFoldersFirst
  );
  const output = buildOutput(rootPath, entries, config);

  await vscode.env.clipboard.writeText(output);

  const lineCount = output.split("\n").length - 1;
  vscode.window.showInformationMessage(
    `✅ Selective structure copied! (${lineCount} lines, ${expandedSet.size} folders expanded)`
  );
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "folderStructureCopier.copyFullStructure",
      (uri: vscode.Uri) => copyFullStructure(uri)
    ),
    vscode.commands.registerCommand(
      "folderStructureCopier.copyShallowStructure",
      (uri: vscode.Uri) => copyShallowStructure(uri)
    ),
    vscode.commands.registerCommand(
      "folderStructureCopier.copySelectiveStructure",
      (uri: vscode.Uri) => copySelectiveStructure(uri)
    )
  );
}

export function deactivate() {}
